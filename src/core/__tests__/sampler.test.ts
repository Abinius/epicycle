import { describe, expect, it } from 'vitest'
import { dft } from '../dft.js'
import { buildScene, penAt } from '../epicycle.js'
import { formulas } from '../formulas.js'
import { IDENTITY, flatten, sample } from '../sampler.js'
import { defaultTheta } from '../types.js'

/** 圆：两条 180° 圆弧拼一圈，半径 3，圆心原点 */
const CIRCLE = 'M 3 0 A 3 3 0 1 1 -3 0 A 3 3 0 1 1 3 0'
/** 正方形：半边长 1，SVG 坐标 */
const SQUARE = 'M 1 1 L -1 1 L -1 -1 L 1 -1 Z'
const N = 512
const OPTS = { N, close_mode: 'join' as const, tolerance: 1e-4 }

/** 坐标是浮点，y 翻转会把 0 变成 -0；数值上无差别，只是 `toEqual` 会区分 */
const coords = (a: Float64Array): number[] => Array.from(a).map((v) => v + 0)

describe('flatten：指令归一化与坐标约定', () => {
  it('输出数学坐标系：SVG 的 y 向下被翻转', () => {
    const { subpaths } = flatten('M 0 0 L 0 4')
    expect(subpaths).toHaveLength(1)
    expect(coords(subpaths[0])).toEqual([0, 0, 0, -4])
  })

  it('相对指令按当前点累计', () => {
    const { subpaths } = flatten('m 10 20 l 10 0 l 0 -5')
    expect(coords(subpaths[0])).toEqual([10, -20, 20, -20, 20, -15])
  })

  it('H/V/Q/T/S/A 全部归一化成 M/L/C，不抛错', () => {
    const { subpaths } = flatten('M 0 0 H 10 V 10 Q 20 20 30 10 T 50 0 S 60 -10 70 -20 Z')
    expect(subpaths).toHaveLength(1)
    const pts = subpaths[0]
    expect(pts.length).toBeGreaterThan(4)
    expect(Number.isFinite(pts[0])).toBe(true)
    expect(Number.isFinite(pts[pts.length - 1])).toBe(true)
  })

  it('Z 把首点补回末点，与手写闭合点得到同一条折线', () => {
    const expected = [0, 0, 4, 0, 4, -4, 0, 0]
    const z = flatten('M 0 0 L 4 0 L 4 4 Z')
    expect(coords(z.subpaths[0])).toEqual(expected)
    expect(z.segments).toBe(3) // 两条边 + 闭合段
    expect(coords(flatten('M 0 0 L 4 0 L 4 4 L 0 0').subpaths[0])).toEqual(expected)
  })

  it('末点已经在起点上时，Z 不会多出零长度段', () => {
    expect(flatten('M 4 4 L 0 0 L 4 4 Z').segments).toBe(2)
  })

  it('移动指令切分子路径', () => {
    const { subpaths } = flatten('M 0 0 L 2 0 M 6 0 L 8 0')
    expect(subpaths).toHaveLength(2)
  })

  it('矩阵变换：缩放与平移都作用在用户坐标上', () => {
    const scaled = flatten('M 0 0 L 10 0', [2, 0, 0, 2, 0, 0])
    expect(coords(scaled.subpaths[0])).toEqual([0, 0, 20, 0])
    const moved = flatten('M 0 0 L 10 0', [1, 0, 0, 1, 5, -3])
    expect(coords(moved.subpaths[0])).toEqual([5, 3, 15, 3])
  })

  it('恒等矩阵下跨度越大，默认容差越大', () => {
    const small = flatten('M 0 0 L 1 0', IDENTITY)
    const big = flatten('M 0 0 L 1000 0', IDENTITY)
    expect(big.tolerance).toBeCloseTo(1000 / 2048, 10)
    expect(small.tolerance).toBeCloseTo(1 / 2048, 10)
  })

  it('默认容差按变换后的跨度算，缩放不会被当成更细的曲线', () => {
    expect(flatten('M 0 0 L 1 0', [100, 0, 0, 100, 0, 0]).tolerance).toBeCloseTo(100 / 2048, 10)
  })
})

describe('sample：等弧长重采样', () => {
  it('点数恒为 N，且落在给定范围内', () => {
    const r = sample(CIRCLE, OPTS)
    expect(r.N).toBe(N)
    expect(r.points).toHaveLength(2 * N)
    expect(r.bbox).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)])
  })

  it('黄金样张：圆路径的 DFT 只有 |n| = 1 一项，模等于半径', () => {
    const coeffs = dft(sample(CIRCLE, OPTS).points, N)
    const mags = new Map(coeffs.map((c) => [Math.abs(c.n), Math.hypot(c.re, c.im)]))
    expect(mags.get(1)).toBeCloseTo(3, 3)
    expect(mags.get(2)!).toBeLessThan(5e-3)
    expect(mags.get(10)!).toBeLessThan(5e-3)
    expect(mags.get(255)!).toBeLessThan(5e-3)
  })

  it('黄金样张：方形路径的振幅谱与解析生成器一致（y 翻转只把 n 换成 -n，模不变）', () => {
    const spec = (coeffs: { n: number; re: number; im: number }[]) =>
      coeffs
        .filter((c) => c.n !== 0)
        .map((c) => Math.hypot(c.re, c.im))
        .sort((x, y) => y - x)
    const fromPath = spec(dft(sample(SQUARE, OPTS).points, N))
    const analytic = spec(dft(formulas.square(N).points, N))
    expect(fromPath.length).toBe(analytic.length)
    let maxDiff = 0
    for (let i = 0; i < analytic.length; i++) maxDiff = Math.max(maxDiff, Math.abs(fromPath[i] - analytic[i]))
    expect(maxDiff).toBeLessThan(1e-6)

    // 质心相同（遍历方向相反不影响质心）
    const p0 = dft(sample(SQUARE, OPTS).points, N).find((c) => c.n === 0)!
    const a0 = dft(formulas.square(N).points, N).find((c) => c.n === 0)!
    expect(Math.abs(p0.re - a0.re)).toBeLessThan(1e-9)
    expect(Math.abs(p0.im - a0.im)).toBeLessThan(1e-9)
  })

  it('采样点沿弧长等距：相邻间距与均值的偏差不超过 1 %', () => {
    const r = sample(CIRCLE, OPTS)
    const ds: number[] = []
    for (let k = 0; k < N; k++) {
      const a = k
      const b = (k + 1) % N
      ds.push(Math.hypot(r.points[2 * b] - r.points[2 * a], r.points[2 * b + 1] - r.points[2 * a + 1]))
    }
    const avg = ds.reduce((s, v) => s + v, 0) / N
    let worst = 0
    for (const d of ds) worst = Math.max(worst, Math.abs(d - avg) / avg)
    expect(worst).toBeLessThan(0.01)
  })

  it('直线闭合：末点直连首点参与弧长，间距按整圈均分', () => {
    const r = sample('M 0 0 L 4 0', { N: 8, close_mode: 'join' })
    const xs = Array.from({ length: 8 }, (_, k) => r.points[2 * k])
    expect(xs).toEqual([0, 1, 2, 3, 4, 3, 2, 1])
    expect(r.closed).toBe(false)
  })

  it('镜像回扫：画过去再画回来，点列对称且必然闭合', () => {
    const r = sample('M 0 0 L 4 0', { N: 8, close_mode: 'mirror' })
    const xs = Array.from({ length: 8 }, (_, k) => r.points[2 * k])
    expect(xs).toEqual([0, 1, 2, 3, 4, 3, 2, 1])
    expect(r.closed).toBe(true)
  })

  it('镜像回扫按点倒序：翻转的是点对，不是整个交错数组', () => {
    // 两点折线是这条路径的盲区——只有一段时把整条数组 reverse 也不会出错，
    // 所以要拿三点以上的折线来钉：多点时 x/y 会被整段互换
    const r = sample('M 0 0 L 2 0 L 2 2', { N: 8, close_mode: 'mirror' })
    // y 翻转会把 0 变成 -0，而 toEqual 区分两者，先归一
    const at = (k: number) => [r.points[2 * k] + 0, r.points[2 * k + 1] + 0]
    expect(Array.from({ length: 8 }, (_, k) => at(k))).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, -1],
      [2, -2],
      [2, -1],
      [2, 0],
      [1, 0],
    ])
    // 去路与回路逐点重合（末点转回起点，闭合段长度为 0）
    for (let k = 0; k < 8; k++) expect(at((8 - k) % 8)).toEqual(at(k))
    expect(r.closed).toBe(true)
  })

  it('gap 是首尾距离相对包围盒长边的比值', () => {
    expect(sample('M 0 0 L 4 0', { N: 16, close_mode: 'join' }).gap).toBeCloseTo(1, 12)
    expect(sample(CIRCLE, OPTS).gap).toBeLessThan(1e-6)
  })

  it('多子路径：默认串接，longest_only 只留最长的一条', () => {
    const multi = 'M 0 0 L 2 0 M 6 0 L 8 0'
    expect(sample(multi, OPTS).subpaths).toBe(2)
    const longest = sample(multi, { ...OPTS, longest_only: true })
    expect(longest.subpaths).toBe(1)
    expect(longest.bbox).toEqual([0, 0, 2, 0])
  })

  it('退化输入：空路径与单点都不崩溃', () => {
    const empty = sample('', OPTS)
    expect(empty.subpaths).toBe(0)
    expect(Array.from(empty.points).every((v) => v === 0)).toBe(true)

    const dot = sample('M 5 5', { N: 16, close_mode: 'join' })
    expect(dot.points).toHaveLength(32)
    expect(Array.from(dot.points).every((v) => (v === 5 || v === -5))).toBe(true)
  })

  it('N 不是 2 的幂直接报错', () => {
    expect(() => sample(CIRCLE, { N: 500, close_mode: 'join' })).toThrow(/2 的幂/)
  })

  it('闭环重建：采样 → DFT → 前 K 项重演的 RMS 误差小于峰值的 1 %（M2 出口标准）', () => {
    const SIGNATURE =
      'M 20 80 C 40 20 60 20 80 60 C 100 100 120 100 140 60 C 160 20 180 30 200 70 C 215 100 230 90 240 60'
    const r = sample(SIGNATURE, { N: 512, close_mode: 'join' })
    const scene = buildScene(dft(r.points, 512), { ...defaultTheta, K: 120 })

    let sum = 0
    let peak = 0
    for (let k = 0; k < r.N; k++) {
      const x = r.points[2 * k]
      const y = r.points[2 * k + 1]
      const p = penAt(scene, k / r.N)
      sum += (p.re - x) ** 2 + (p.im - y) ** 2
      peak = Math.max(peak, Math.hypot(x, y))
    }
    const rms = Math.sqrt(sum / r.N)
    expect(rms / peak).toBeLessThan(0.01)
  })
})
