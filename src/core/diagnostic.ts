import type { Coefficient } from './types.js'
import type { SampleResult } from './sampler.js'
import { countTags, findForbidden } from './svgtext.js'

/**
 * 预检与诊断（技术文档 §10 的 1–9 条）。
 * 10–12 条属于导出编码与 IndexedDB 空间，不在采样链路上，等 M5 再接。
 * 所有文案从这里出，UI 只负责渲染——错误不许散落在代码各处。
 */

export type Severity = 'error' | 'warn' | 'info'

export interface Diagnostic {
  /** 技术文档 §10 的编号，便于回查 */
  id: number
  severity: Severity
  message: string
  hint: string
}

export interface DiagnoseInput {
  /** 原始文本；直接粘贴路径数据时为空串 */
  svg: string
  /** 文件字节数 */
  bytes: number
  /** 抽出的 path 条数 */
  paths: number
  /** 采样结果；没走到采样就没有 */
  sample: SampleResult | null
  /** DFT 结果 */
  coeffs: readonly Coefficient[] | null
  /** 当前参与项数 */
  K: number
}

const MAX_BYTES = 2 * 1024 * 1024
const MAX_NODES = 5000
const MAX_SUBPATHS = 200
const GAP_LIMIT = 0.15

export function diagnose(input: DiagnoseInput): Diagnostic[] {
  const out: Diagnostic[] = []

  const forbidden = findForbidden(input.svg)
  if (forbidden.length > 0) {
    out.push({
      id: 1,
      severity: 'warn',
      message: `文件包含无法参与傅里叶变换的元素：${forbidden.join('、')}`,
      hint: '转为纯路径后重新导出',
    })
  }

  const nodes = countTags(input.svg)
  if (input.bytes > MAX_BYTES || nodes > MAX_NODES) {
    out.push({ id: 2, severity: 'warn', message: '文件过大，解析可能超时', hint: '先用 svgo 压缩' })
  }

  if (input.paths === 0) {
    out.push({
      id: 3,
      severity: 'error',
      message: '未找到路径数据，请确认是矢量文件',
      hint: '换成 PNG 无效，需要含 <path> 的 SVG',
    })
    return out
  }

  const s = input.sample
  if (!s) return out

  if (s.subpaths > MAX_SUBPATHS) {
    out.push({
      id: 4,
      severity: 'warn',
      message: `子路径过多（${s.subpaths} 条），串接会产生大量连接段`,
      hint: '改用「只取最长子路径」，或先在编辑器里合并路径',
    })
  }

  if (!s.closed && s.gap > GAP_LIMIT) {
    out.push({
      id: 5,
      severity: 'warn',
      message: `线条没有首尾相连（缺口约 ${Math.round(s.gap * 100)} % 长边）`,
      hint: '改选「镜像回扫」，或手工把路径闭合',
    })
  }

  const [minX, minY, maxX, maxY] = s.bbox
  if (s.segments > 0 && (maxX - minX < 1e-9 || maxY - minY < 1e-9)) {
    out.push({
      id: 6,
      severity: 'error',
      message: '这条线是水平的（或垂直的）直线，无法构成闭合形状',
      hint: '换一条有面积的路径',
    })
  }

  if (s.segments === 0) {
    out.push({ id: 7, severity: 'error', message: '线条过短，采样不到有效长度', hint: '换一条更长的路径' })
  }

  if (input.coeffs) {
    const peak = input.coeffs.reduce((m, c) => (c.n === 0 ? m : Math.max(m, Math.hypot(c.re, c.im))), 0)
    if (peak < 1e-9) {
      out.push({
        id: 8,
        severity: 'error',
        message: '路径可能是单一像素点，频谱里没有任何能量',
        hint: '换一条更丰富的线',
      })
    }

    const limit = (input.coeffs.length - 1) / 2
    if (input.K >= limit) {
      out.push({
        id: 9,
        severity: 'info',
        message: `K 已达可用项数上限（${limit}）`,
        hint: '提高采样点数 N 才能有更多项',
      })
    }
  }

  return out
}
