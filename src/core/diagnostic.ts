import type { Coefficient } from './types.js'
import type { SampleResult } from './sampler.js'
import { countTags, findForbidden } from './svgtext.js'

/**
 * 预检与诊断文案的唯一出处：技术文档 §10 的 1–9 条（采样链路，见 diagnose）与
 * 12 条起（资产库与导入，见 ASSET_DIAGNOSTICS）。10–11 条属导出编码，等 M5 再接。
 * UI 只负责渲染——错误不许散落在代码各处。
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

    // 可用项上限 = 非零有符号系数的总数 = coeffs.length-1（coeffs 含一个 n=0 项，
    // 故 N 点 DFT 出 2M-1=N-1 个系数，去 n=0 即 N-2=2(M-1)）。K 数的是有符号项，
    // 所以上限就是非零系数总数，不是正频率个数 M-1——后者只有真值的一半。
    const limit = input.coeffs.length - 1
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

/**
 * 18：路径数据非法，采样在 Worker 里抛错中断（d 被截断、含非法指令）。
 * 采样链路第 10 条，编号避开留给导出的 10–11。
 */
export const SAMPLE_FAILED: Diagnostic = {
  id: 18,
  severity: 'error',
  message: '路径数据无法解析，采样中断了',
  hint: '路径 d 可能被截断或含非法指令，用编辑器或 svgo 校验后重试',
}

/**
 * 资产库与导入的诊断（技术文档 §10 表的 12 条起）。与采样链路分开成组，
 * 但共用 Diagnostic 类型与 DiagnosticList 组件——用户可见的文案仍然只有一个出处。
 */
export const ASSET_DIAGNOSTICS = {
  /** 12：写入被配额挡下 */
  storageFull: {
    id: 12,
    severity: 'error',
    message: '本地存储空间不足，没存下这个资产',
    hint: '删掉几个旧资产后重试',
  },
  /** 13：浏览器根本不让写（隐私模式 / 被策略禁用） */
  storageUnavailable: {
    id: 13,
    severity: 'error',
    message: '本浏览器不允许写入本地存储，资产存不下来',
    hint: '改用「导出 JSON」保存，之后用「导入 JSON」恢复',
  },
  /** 14：文件读不出资产的样子 */
  importUnreadable: {
    id: 14,
    severity: 'error',
    message: '这个文件不是有效的资产文件',
    hint: '只有「导出 JSON」产生的 .json 能导入',
  },
  /** 15：结构看着像资产，但版本或指纹对不上 */
  importMismatch: {
    id: 15,
    severity: 'error',
    message: '资产版本不受支持，或内容与指纹不符',
    hint: '用原来的浏览器重新导出一份',
  },
  /** 17：模式 Y 派生没算完，资产没生成 */
  deriveFailed: {
    id: 17,
    severity: 'error',
    message: '变形没算完，派生资产没生成',
    hint: '再试一次；如果反复失败，先用「冻结为资产」保存当前形状',
  },
} satisfies Record<string, Diagnostic>

/** 16：库里有资产读不出来。只跳过、不删除——先让用户自己决定 */
export function storedCorrupt(count: number): Diagnostic {
  return {
    id: 16,
    severity: 'warn',
    message: `本地有 ${count} 个资产读不出来，已跳过`,
    hint: '重新冻结一次，或删掉它们',
  }
}
