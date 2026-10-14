import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { buildScene } from '../epicycle.js'
import { dft } from '../dft.js'
import { formulas, type FormulaId } from '../formulas.js'
import {
  FORMULA_MASTER,
  FORMULA_TAIL,
  centerLatex,
  complexText,
  fmt,
  fmtDeg,
  seriesOf,
  termLatex,
} from '../series.js'
import { defaultTheta, type Coefficient, type Theta } from '../types.js'

const COEFFS: Coefficient[] = [
  { n: 0, re: 0.2, im: -0.1 },
  { n: 5, re: 1, im: 0 },
  { n: -3, re: 0, im: 0.5 },
  { n: 11, re: 0.25, im: 0 },
]
const theta = (o: Partial<Theta> = {}): Theta => ({ ...defaultTheta, ...o })
const SCENE = buildScene(COEFFS, theta({ K: 8 }))
const SERIES = seriesOf(SCENE)

/** KaTeX 以 throwOnError 排版：任何一条产出的 LaTeX 语法不合法都会在这里失败 */
function assertValid(latex: string): void {
  expect(katex.renderToString(latex, { throwOnError: true }).length).toBeGreaterThan(0)
}

describe('seriesOf：公式与系数表的唯一数据源', () => {
  it('c_0 单列为常数项，不参与项', () => {
    expect(SERIES.center).toEqual({ re: 0.2, im: -0.1 })
    expect(SERIES.rows.map((r) => r.n)).not.toContain(0)
  })

  it('行序与 Scene.terms 对齐（下标可直接反查渲染高亮），按 |c| 降序', () => {
    expect(SERIES.rows.map((r) => r.n)).toEqual(SCENE.terms.map((t) => t.n))
    expect(SERIES.rows.map((r) => r.n)).toEqual([5, -3, 11])
  })

  it('黄金样张：半径、相位、直角坐标、贡献度、复数文本', () => {
    expect(SERIES.rows[0]).toEqual({
      n: 5,
      radius: 1,
      phase: 0,
      phaseDeg: 0,
      re: 1,
      im: 0,
      complex: '1',
      weight: 1 / 1.75,
    })
    expect(SERIES.rows[1]).toEqual({
      n: -3,
      radius: 0.5,
      phase: Math.PI / 2,
      phaseDeg: Math.PI / 2 * (180 / Math.PI),
      re: 3.061616997868383e-17,
      im: 0.5,
      complex: '0.5i',
      weight: 0.5 / 1.75,
    })
    expect(SERIES.rows[2]).toEqual({
      n: 11,
      radius: 0.25,
      phase: 0,
      phaseDeg: 0,
      re: 0.25,
      im: 0,
      complex: '0.25',
      weight: 0.25 / 1.75,
    })
  })

  it('贡献度以参与项半径和为分母，合计为 1', () => {
    expect(SERIES.rows.reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(1, 12)
  })

  it('相位折到 [0, 2π)：负相位显示为对应的正角度', () => {
    const s = seriesOf(buildScene([{ n: 0, re: 0, im: 0 }, { n: 2, re: 0, im: -0.5 }], theta()))
    const row = s.rows[0]
    expect(row.phaseDeg).toBeCloseTo(270, 10)
    expect(row.im).toBeCloseTo(-0.5, 12)
    expect(row.complex).toBe('-0.5i')
  })

  it('相位偏移后的折角与直角坐标一致', () => {
    const s = seriesOf(buildScene([{ n: 0, re: 0, im: 0 }, { n: 3, re: 1, im: 0 }], theta({ phaseShift: -1 })))
    const row = s.rows[0]
    expect(row.phase).toBeCloseTo(Math.PI * 2 - 1, 12)
    expect(row.phaseDeg).toBeCloseTo(302.7042204869177, 12)
    expect(row.re).toBeCloseTo(Math.cos(-1), 12)
    expect(row.im).toBeCloseTo(Math.sin(-1), 12)
  })

  it('频段过滤掉的项不进公式也不占贡献度', () => {
    const s = seriesOf(buildScene(COEFFS, theta({ K: 8, band: { lo: 5, hi: 10 } })))
    expect(s.rows.map((r) => r.n)).toEqual([5])
    expect(s.rows[0].weight).toBe(1)
  })

  it('等权化：所有项半径取统一值，贡献度均分', () => {
    const s = seriesOf(buildScene(COEFFS, theta({ K: 8, equalize: true, scale: 2 })))
    expect(s.rows.every((r) => r.radius === 2)).toBe(true)
    expect(s.rows.every((r) => r.weight === 1 / 3)).toBe(true)
  })

  it('没有可参与的项时返回空表', () => {
    const s = seriesOf(buildScene([{ n: 0, re: 0.5, im: 0 }], theta()))
    expect(s.rows).toEqual([])
    expect(centerLatex(s.center)).toBe('z(t)=0.5')
  })

  it('与 DFT 闭环：每行的半径与相位能还原原始系数', () => {
    const coeffs = dft(formulas.square(512).points, 512)
    const scene = buildScene(coeffs, theta({ K: 256 }))
    for (const row of seriesOf(scene).rows) {
      const src = coeffs.find((c) => c.n === row.n)
      expect(src, `缺少原始系数 n=${row.n}`).toBeDefined()
      expect(Math.abs(row.radius * Math.cos(row.phase) - src!.re)).toBeLessThan(Math.max(1e-12, Math.abs(src!.re) * 1e-9))
      expect(Math.abs(row.radius * Math.sin(row.phase) - src!.im)).toBeLessThan(Math.max(1e-12, Math.abs(src!.im) * 1e-9))
    }
  })
})

describe('数字格式化', () => {
  it('3 位有效数字，去尾零，超量级走科学计数法', () => {
    const golden: [number, string][] = [
      [1, '1'],
      [0.5, '0.5'],
      [0.403, '0.403'],
      [-0.403, '-0.403'],
      [100, '100'],
      [123, '123'],
      [99.96, '100'],
      [0.00123, '0.00123'],
      [0.0004, '4e-4'],
      [0.0000123, '1.23e-5'],
      [1234567, '1.23e+6'],
      [1000000, '1e+6'],
      [0, '0'],
      [Number.NaN, '0'],
      [Number.POSITIVE_INFINITY, '0'],
    ]
    for (const [input, want] of golden) expect(fmt(input), String(input)).toBe(want)
  })

  it('角度固定 1 位小数', () => {
    expect(fmtDeg(90)).toBe('90.0')
    expect(fmtDeg(302.7042204869177)).toBe('302.7')
    expect(fmtDeg(0)).toBe('0.0')
    expect(fmtDeg(Number.NaN)).toBe('0.0')
  })

  it('复数文本：分量为 0 时省略，避免出现 +0i', () => {
    expect(complexText(0.312, 0.258)).toBe('0.312+0.258i')
    expect(complexText(0.312, -0.258)).toBe('0.312-0.258i')
    expect(complexText(1, 0)).toBe('1')
    expect(complexText(0, 0.5)).toBe('0.5i')
    expect(complexText(0, -0.5)).toBe('-0.5i')
    expect(complexText(0, 0)).toBe('0')
  })
})

describe('LaTeX 代入式', () => {
  it('主公式、常数项、单项的排版源码固定', () => {
    expect(FORMULA_MASTER).toBe('z(t)=c_{0}+\\sum_{k=1}^{K}|c_{n_k}|\\,e^{i(2\\pi n_k t+\\varphi_k)}')
    expect(FORMULA_TAIL).toBe('+\\cdots')
    expect(centerLatex(SERIES.center)).toBe('z(t)=0.2-0.1i')
    expect(termLatex(SERIES.rows[0])).toBe('+1\\,e^{i(2\\pi\\cdot 5\\,t+0.0^{\\circ})}')
    expect(termLatex(SERIES.rows[1])).toBe('+0.5\\,e^{i(2\\pi\\cdot -3\\,t+90.0^{\\circ})}')
    expect(termLatex(SERIES.rows[2])).toBe('+0.25\\,e^{i(2\\pi\\cdot 11\\,t+0.0^{\\circ})}')
  })

  it('整条代入式：常数项 + 全部项，无分隔空格', () => {
    const full = [centerLatex(SERIES.center), ...SERIES.rows.map(termLatex)].join('')
    expect(full).toBe(
      'z(t)=0.2-0.1i+1\\,e^{i(2\\pi\\cdot 5\\,t+0.0^{\\circ})}+0.5\\,e^{i(2\\pi\\cdot -3\\,t+90.0^{\\circ})}+0.25\\,e^{i(2\\pi\\cdot 11\\,t+0.0^{\\circ})}',
    )
  })

  it('全部生成器的产物 KaTeX 都能排版（语法门禁）', () => {
    assertValid(FORMULA_MASTER)
    assertValid(FORMULA_TAIL)
    for (const id of Object.keys(formulas) as FormulaId[]) {
      const scene = buildScene(dft(formulas[id](256).points, 256), theta({ K: 32 }))
      const s = seriesOf(scene)
      assertValid(centerLatex(s.center))
      for (const row of s.rows) assertValid(termLatex(row))
    }
  })
})
