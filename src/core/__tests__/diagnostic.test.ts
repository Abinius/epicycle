import { describe, expect, it } from 'vitest'
import { ASSET_DIAGNOSTICS, diagnose, storedCorrupt, type Diagnostic } from '../diagnostic.js'
import { samplePaths } from '../sampler.js'
import { readSvg, type SvgReadOptions } from '../source.js'
import { extractPaths } from '../svgtext.js'

const N = 256
const CIRCLE = '<svg viewBox="0 0 16 16"><path d="M 8 1 A 7 7 0 1 1 7.99 1 Z"/></svg>'

/** 走真实链路：抽路径 → 采样 → DFT → 诊断 */
function check(svg: string, over: Partial<SvgReadOptions> = {}): Diagnostic[] {
  return readSvg(svg, { N, close_mode: 'join', K: 16, ...over }).diagnostics
}

const ids = (list: Diagnostic[]) => list.map((d) => d.id)

/** diagnose 可能产出的编号（技术文档 §10 的 1–9 条）；10–11 属导出编码，等 M5 */
const SAMPLING_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

describe('diagnose：预检与诊断（技术文档 §10 的 1–9 条）', () => {
  it('干净的单路径 SVG 没有任何诊断', () => {
    expect(check(CIRCLE)).toEqual([])
  })

  it('#3 没有 path 元素：报错并短路，不再看后面的检查', () => {
    const found = check('<svg><rect width="1" height="1"/></svg>')
    expect(ids(found)).toEqual([3])
    expect(found[0].severity).toBe('error')
    expect(found[0].message).toContain('未找到路径数据')
  })

  it('#1 含无法参与变换的元素或外链', () => {
    const found = check(`<svg><image href="a.png"/>${CIRCLE.slice(5)}`)
    expect(ids(found)).toEqual([1])
    expect(found[0].severity).toBe('warn')
    expect(found[0].message).toContain('image')
  })

  it('#2 文件过大：字节数与节点数任一超限都命中', () => {
    expect(ids(check(CIRCLE, { bytes: 3 * 1024 * 1024 }))).toEqual([2])
    const many = `${'<g>'.repeat(5001)}${CIRCLE.slice(5)}`
    expect(ids(check(many))).toEqual([2])
  })

  it('#4 子路径过多', () => {
    const subpaths = Array.from({ length: 201 }, (_, i) => `M ${i} 0 L ${i} 1`).join(' ')
    const found = check(`<path d="${subpaths}"/>`)
    expect(ids(found)).toContain(4)
    expect(found.find((d) => d.id === 4)!.message).toContain('201')
  })

  it('#5 首尾没连上：镜面回扫时不报警', () => {
    const open = '<path d="M 0 0 L 4 0 L 4 4 L 1 0"/>'
    expect(ids(check(open))).toContain(5)
    expect(ids(check(open, { close_mode: 'mirror' }))).not.toContain(5)
  })

  it('#6 退化成直线：没有面积', () => {
    const found = check('<path d="M 0 0 L 4 0"/>', { close_mode: 'mirror' })
    expect(ids(found)).toEqual([6])
    expect(found[0].severity).toBe('error')
  })

  it('#7 与 #8 单点路径：既没有长度也没有频谱能量', () => {
    const found = check('<path d="M 5 5"/>')
    expect(ids(found)).toEqual([7, 8])
    expect(found.every((d) => d.severity === 'error')).toBe(true)
  })

  it('#9 K 达到可用项数上限，只是提示不算错误', () => {
    const found = check(CIRCLE, { K: N })
    const nine = found.find((d) => d.id === 9)
    expect(nine?.severity).toBe('info')
    expect(nine?.message).toContain(String(N - 2))
  })

  it('还没采样、或只有采样没有系数时，不产出对应的诊断', () => {
    const base = { svg: CIRCLE, bytes: 99, paths: 1, K: 16 }
    expect(diagnose({ ...base, sample: null, coeffs: null })).toEqual([])
    const sample = samplePaths(extractPaths(CIRCLE), { N, close_mode: 'join' })
    expect(diagnose({ ...base, sample, coeffs: null })).toEqual([])
  })
})

describe('readSvg：上传通路的唯一入口', () => {
  it('干净输入给出系数、采样信息与 ok', () => {
    const r = readSvg(CIRCLE, { N, close_mode: 'join', K: 16 })
    expect(r.paths).toBe(1)
    expect(r.ok).toBe(true)
    expect(r.coeffs).toHaveLength(N - 1)
    expect(r.sample!.N).toBe(N)
    expect(r.sample!.subpaths).toBe(1)
  })

  it('有 error 级诊断时 ok 为 false，且不给系数', () => {
    const bad = readSvg('<svg><rect/></svg>', { N, close_mode: 'join', K: 16 })
    expect(bad.ok).toBe(false)
    expect(bad.coeffs).toBe(null)
    expect(bad.diagnostics[0].severity).toBe('error')

    const warn = readSvg(`<svg><image href="a.png"/>${CIRCLE.slice(5)}`, { N, close_mode: 'join', K: 16 })
    expect(warn.ok).toBe(true) // 只有 warn，仍可出动画
  })

  it('多条 path 各自带变换，合成同一个场景', () => {
    const svg = '<g transform="translate(100 0)"><path d="M 0 0 L 4 0 L 4 4 Z"/></g><path d="M 0 0 L 2 0"/>'
    const r = readSvg(svg, { N, close_mode: 'join', K: 16 })
    expect(r.paths).toBe(2)
    expect(r.sample!.subpaths).toBe(2)
    // 变换后第一个子路径被平移到 x ∈ [4,100]
    expect(r.sample!.bbox[2]).toBeGreaterThan(90)
  })
})

describe('资产库诊断（技术文档 §10 表 12 条起）', () => {
  it('编号在全局唯一：DiagnosticList 用 id 当 key，撞号会吞掉一条', () => {
    const assetIds = [...Object.values(ASSET_DIAGNOSTICS).map((d) => d.id), storedCorrupt(3).id]
    const all = [...SAMPLING_IDS, ...assetIds]
    expect(new Set(all).size).toBe(all.length)
  })

  it('每条都有文案与建议动作，编号与文档对齐', () => {
    const all = [...Object.values(ASSET_DIAGNOSTICS), storedCorrupt(2)]
    // 排序后比：只钉编号集合（缺号、重号都会红），不耦合 record 的声明顺序
    expect(all.map((d) => d.id).sort((a, b) => a - b)).toEqual([12, 13, 14, 15, 16, 17])
    for (const d of all) {
      expect(d.message.length, `#${d.id}`).toBeGreaterThan(0)
      expect(d.hint.length, `#${d.id}`).toBeGreaterThan(0)
    }
  })

  it('读不出来的条数写进文案里', () => {
    expect(storedCorrupt(5).message).toContain('5')
    expect(storedCorrupt(5).severity).toBe('warn')
  })
})
