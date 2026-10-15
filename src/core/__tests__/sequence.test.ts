import { describe, expect, it } from 'vitest'
import {
  mulberry32,
  normalize,
  phaseSeries,
  sequencePerN,
  sequenceSlots,
  textToValues,
  toValues,
} from '../sequence.js'
import type { Coefficient } from '../types.js'

describe('mulberry32', () => {
  it('同种子必得同一串数，不同种子不同', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const c = mulberry32(43)
    for (let i = 0; i < 20; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      if (i === 0) expect(x).not.toBe(c())
    }
  })
})

describe('toValues', () => {
  it('文本按 UTF-16 code 逐个取数（PRD 的例子：Abin → 65, 98, 105, 110）', () => {
    expect(textToValues('Abin')).toEqual([65, 98, 105, 110])
    expect(toValues({ source: 'text', raw: 'Abin' })).toEqual([65, 98, 105, 110])
  })

  it('数字串按逗号 / 空格 / 换行 / 全角标点切，非数字直接丢掉', () => {
    expect(toValues({ source: 'manual', raw: '12, 340 8\n77' })).toEqual([12, 340, 8, 77])
    expect(toValues({ source: 'manual', raw: '1，2、3；4' })).toEqual([1, 2, 3, 4])
    expect(toValues({ source: 'manual', raw: '1, abc, 2' })).toEqual([1, 2])
  })

  it('空输入得到空数组，不抛错', () => {
    expect(toValues({ source: 'manual', raw: '' })).toEqual([])
    expect(toValues({ source: 'text', raw: '' })).toEqual([])
  })

  it('种子模式产出确定且长度可控的一串数', () => {
    const a = toValues({ source: 'seed', seed: 7, count: 8 })
    const b = toValues({ source: 'seed', seed: 7, count: 8 })
    expect(a).toHaveLength(8)
    expect(a).toEqual(b)
  })
})

describe('normalize', () => {
  it('线性映射到 [0,1]，最小是 0、最大是 1', () => {
    // 分母含规定里的 ε = 1e-12，末位偏差 ~1e-14，按容差比
    const u = normalize([10, 20, 30])
    expect(u[0]).toBeCloseTo(0, 11)
    expect(u[1]).toBeCloseTo(0.5, 11)
    expect(u[2]).toBeCloseTo(1, 11)
    const v = normalize([-5, 5])
    expect(v[0]).toBeCloseTo(0, 11)
    expect(v[1]).toBeCloseTo(1, 11)
  })

  it('常量序列全为 0（兜底交给 sequenceSlots）', () => {
    expect(normalize([3, 3, 3])).toEqual([0, 0, 0])
    expect(normalize([])).toEqual([])
  })
})

describe('phaseSeries', () => {
  it('取相邻差并首尾相接，再归一化到 [0,1]', () => {
    // u = [0, 0.5, 1] → 差 [0.5, 0.5, 1]（最后一个是 |u0 − u2|）→ 归一化 [0, 0, 1]
    // 归一化分母带规定里的 ε，所以末位会有 ~1e-12 的偏差，按容差比
    const v = phaseSeries([0, 0.5, 1])
    expect(v).toHaveLength(3)
    expect(v[0]).toBeCloseTo(0, 11)
    expect(v[1]).toBeCloseTo(0, 11)
    expect(v[2]).toBeCloseTo(1, 11)
    expect(phaseSeries([])).toEqual([])
    expect(phaseSeries([0.5])).toEqual([0])
  })

  it('上升序列与下降序列给出相同的相位（只看变化量，不看方向）', () => {
    expect(phaseSeries([0, 0.5, 1])).toEqual(phaseSeries([1, 0.5, 0]))
  })
})

describe('sequenceSlots', () => {
  const M = 100

  it('幅度落在 [0.2, 1.8]，永远不为 0（§2.6 的固定增益）', () => {
    const { amp } = sequenceSlots([1, 2, 3, 4, 5], M)
    expect(amp.length).toBeGreaterThan(0)
    for (const s of amp) {
      expect(s).toBeGreaterThanOrEqual(0.2)
      expect(s).toBeLessThanOrEqual(1.8)
    }
  })

  it('相位落在 [0, 2π)', () => {
    const { phase } = sequenceSlots([1, 2, 3, 4, 5], M)
    for (const p of phase) expect(p).toBeGreaterThanOrEqual(0)
    for (const p of phase) expect(p).toBeLessThan(2 * Math.PI)
  })

  it('K 夹在 [8, M] 内，T 落在 [0.5, 4.5]', () => {
    for (const values of [[1, 2, 3], [0, 0, 1], [5, 5, 5], Array.from({ length: 200 }, (_, i) => i)]) {
      const slots = sequenceSlots(values, M)
      expect(slots.K, JSON.stringify(values.slice(0, 4))).toBeGreaterThanOrEqual(8)
      expect(slots.K).toBeLessThanOrEqual(M)
      expect(slots.T).toBeGreaterThanOrEqual(0.5)
      expect(slots.T).toBeLessThanOrEqual(4.5)
    }
  })

  it('全 0 / 常量输入不塌成一个圆：幅度槽不是清一色的下限', () => {
    for (const values of [[0, 0, 0, 0], [7, 7, 7, 7]]) {
      const { amp } = sequenceSlots(values, M)
      expect(new Set(amp.map((x) => x.toFixed(6))).size, JSON.stringify(values)).toBeGreaterThan(1)
    }
  })

  it('确定性：同一串数两次给出完全相同的结果（R-5）', () => {
    const values = Array.from({ length: 200 }, (_, i) => (i * 37) % 101)
    expect(sequenceSlots(values, M)).toEqual(sequenceSlots(values, M))
  })

  it('输入相近 → 动画相近：改一个数，所有槽只动一点点（无取模 / 无哈希）', () => {
    const a = sequenceSlots([1, 2, 3, 4, 5, 6, 7, 8], M)
    const b = sequenceSlots([1, 2, 3, 4, 5, 6, 7, 8.001], M)
    expect(b.K).toBe(a.K)
    expect(b.amp.length).toBe(a.amp.length)
    for (let j = 0; j < a.amp.length; j++) {
      expect(Math.abs(a.amp[j] - b.amp[j]), `槽 ${j}`).toBeLessThan(0.01)
    }
  })

  it('循环填满：序列比 K 短时循环取用，不比 K 长时也不会多给', () => {
    const short = sequenceSlots([0, 1], M)
    expect(short.amp.length).toBe(short.K)
    const long = sequenceSlots(Array.from({ length: 200 }, (_, i) => i), M)
    expect(long.amp.length).toBe(long.K)
  })

  it('空输入与 M=0 都不崩', () => {
    expect(sequenceSlots([], M)).toEqual({ amp: [], phase: [], K: 0, T: 1 })
    expect(sequenceSlots([1, 2, 3], 0)).toEqual({ amp: [], phase: [], K: 0, T: 1 })
  })
})

describe('sequencePerN', () => {
  const coeffs: Coefficient[] = [
    { n: 0, re: 5, im: 0 }, // 直流项不参与（名次里跳过）
    { n: 3, re: 3, im: 0 }, // |c| = 3 → 第 0 名
    { n: -1, re: 2, im: 0 }, // |c| = 2 → 第 1 名
    { n: 7, re: 1, im: 0 }, // |c| = 1 → 第 2 名
  ]

  it('按 |c| 降序定名次，n=0 不占名额', () => {
    const slots = { amp: [1.5, 0.5, 1.2], phase: [0, 1, 2], K: 3, T: 1 }
    const perN = sequencePerN(coeffs, slots)
    expect(Object.keys(perN).sort()).toEqual(['-1', '3', '7'])
    expect(perN['3']).toEqual({ s: 1.5, dphi: 0 })
    expect(perN['-1']).toEqual({ s: 0.5, dphi: 1 })
    expect(perN['7']).toEqual({ s: 1.2, dphi: 2 })
  })

  it('槽比可用项多时按实际项数截断', () => {
    const slots = { amp: [1, 1, 1, 1, 1, 1, 1, 1], phase: [0, 0, 0, 0, 0, 0, 0, 0], K: 8, T: 1 }
    expect(Object.keys(sequencePerN(coeffs, slots))).toHaveLength(3)
  })
})
