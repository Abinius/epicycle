import { describe, expect, it } from 'vitest'
import { formulaNames, formulas, heart, square, star } from '../formulas.js'

function closeBbox(actual: readonly number[], expected: readonly number[]) {
  expect(actual.length).toBe(4)
  actual.forEach((v, i) => expect(v, `bbox[${i}]`).toBeCloseTo(expected[i], 10))
}

describe('生成器接口', () => {
  it('三个生成器：id 对应、点数为 2N、bbox 有序、中文名与注册表一致', () => {
    expect(Object.keys(formulas)).toEqual(['square', 'heart', 'star'])
    for (const [id, fn] of Object.entries(formulas)) {
      expect(formulaNames[id as keyof typeof formulaNames], id).toBeTruthy()
      for (const N of [16, 512]) {
        const s = fn(N)
        expect(s.id, `${id} N=${N}`).toBe(id)
        expect(s.name, id).toBe(formulaNames[id as keyof typeof formulaNames])
        expect(s.points.length, `${id} N=${N}`).toBe(2 * N)
        expect(s.bbox[0]).toBeLessThanOrEqual(s.bbox[2])
        expect(s.bbox[1]).toBeLessThanOrEqual(s.bbox[3])
      }
    }
  })
})

describe('square', () => {
  it('所有采样点落在边上：max(|x|, |y|) = half', () => {
    for (const half of [1, 2.5]) {
      const s = square(400, half)
      closeBbox(s.bbox, [-half, -half, half, half])
      for (let i = 0; i < s.points.length; i += 2) {
        expect(Math.max(Math.abs(s.points[i]), Math.abs(s.points[i + 1])), `k=${i / 2}`).toBeCloseTo(half, 10)
      }
    }
  })
})

describe('heart', () => {
  it('x 范围 ±16a，最低点 −17a（t=π 处，N=1024 可精确采样）', () => {
    for (const [a, x, y] of [
      [1, 16, 17],
      [2, 32, 34],
    ] as const) {
      const s = heart(1024, a)
      expect(s.bbox[0], `a=${a}`).toBeCloseTo(-x, 10)
      expect(s.bbox[2], `a=${a}`).toBeCloseTo(x, 10)
      expect(s.bbox[1], `a=${a}`).toBeCloseTo(-y, 10)
    }
  })
})

describe('star', () => {
  it('半径恒在 [1 − depth, 1]', () => {
    for (const [spikes, depth] of [
      [5, 0.35],
      [7, 0.8],
    ] as const) {
      const s = star(2000, spikes, depth)
      for (let i = 0; i < s.points.length; i += 2) {
        const r = Math.hypot(s.points[i], s.points[i + 1])
        expect(r, `spikes=${spikes} k=${i / 2}`).toBeGreaterThanOrEqual(1 - depth - 1e-12)
        expect(r).toBeLessThanOrEqual(1 + 1e-12)
      }
    }
  })
})
