import { describe, expect, it } from 'vitest'
import {
  PATH_PRESETS,
  PRESET_IDS,
  PRESET_N,
  PRESET_NAMES,
  presetOf,
  type PresetId,
} from '../presets.js'
import { sample } from '../sampler.js'

describe('预置清单', () => {
  it('六个预置：顺序即选择器顺序，中文名不重不漏', () => {
    expect(PRESET_IDS).toEqual(['badge', 'square', 'heart', 'star', 'note', 'signature'])
    expect(new Set(PRESET_IDS).size).toBe(PRESET_IDS.length)
    expect(Object.keys(PRESET_NAMES)).toEqual([...PRESET_IDS])
    for (const id of PRESET_IDS) expect(PRESET_NAMES[id], id).not.toHaveLength(0)
  })

  it('每个预置都能出系数：n 不重、全有限、可复现', () => {
    for (const id of PRESET_IDS) {
      const coeffs = presetOf(id).coeffs
      // dft 的契约是 2M−1 项，M = N/2，即 N−1 项
      expect(coeffs.length, id).toBe(PRESET_N - 1)
      expect(new Set(coeffs.map((c) => c.n)).size, id).toBe(coeffs.length)
      for (const c of coeffs) {
        expect(Number.isFinite(c.re), id).toBe(true)
        expect(Number.isFinite(c.im), id).toBe(true)
      }
      expect(presetOf(id).coeffs, id).toEqual(coeffs)
    }
  })

  it('采样摘要与系数同源：点数、子路径、闭合都对得上', () => {
    for (const id of PRESET_IDS) {
      const { coeffs, sample: s } = presetOf(id)
      expect(s.N, id).toBe(PRESET_N)
      expect(s.points.length, id).toBe(2 * PRESET_N)
      expect(s.subpaths, id).toBeGreaterThan(0)
      expect(s.closed, id).toBe(true)
      expect(coeffs, id).toHaveLength(PRESET_N - 1)
    }
    // 解析生成器没有细分这一步；内建路径有
    expect(presetOf('heart').sample.subdivide_eps).toBe(0)
    expect(presetOf('signature').sample.subdivide_eps).toBeGreaterThan(0)
    expect(presetOf('signature').sample.close_mode).toBe('mirror')
  })

  it('六个预置的系数各不相同', () => {
    const fingerprint = (id: PresetId) => presetOf(id).coeffs.map((c) => `${c.n}:${c.re.toFixed(9)}`).join(',')
    const all = PRESET_IDS.map(fingerprint)
    expect(new Set(all).size).toBe(PRESET_IDS.length)
  })

  it('N 不是 2 的幂就抛错', () => {
    expect(() => presetOf('badge', 10)).toThrow(/2 的幂/)
    expect(() => presetOf('note', 10)).toThrow(/2 的幂/)
  })
})

describe('内建路径预置', () => {
  it('徽标是单条闭合轮廓：没有子路径要串接，首尾自然重合', () => {
    const preset = PATH_PRESETS.badge
    const r = sample(preset.d, { N: PRESET_N, close_mode: preset.close_mode })
    expect(r.subpaths).toBe(1)
    expect(r.closed).toBe(true)
    expect(r.gap).toBeLessThan(1e-6)
  })

  it('音符：图标是三子路径（梁/符干/符头鼓包轮廓 + 两枚圆形符头），只取最长的那条轮廓', () => {
    const preset = PATH_PRESETS.note
    // 三条一起串接：笔会在符头与梁之间多画两条连接线，且首尾相距近 0.8 长边——不是闭合轮廓
    const all = sample(preset.d, { N: PRESET_N, close_mode: preset.close_mode })
    expect(all.subpaths).toBe(3)
    expect(all.closed).toBe(false)
    expect(all.gap).toBeGreaterThan(0.5)

    // 最长子路径就是整条可见轮廓：天然闭合、首尾重合，包围盒占满 1024 见方的 viewBox
    const longest = sample(preset.d, { N: PRESET_N, close_mode: preset.close_mode, longest_only: true })
    expect(longest.subpaths).toBe(1)
    expect(longest.closed).toBe(true)
    expect(longest.gap).toBeLessThan(1e-6)
    const [minX, minY, maxX, maxY] = longest.bbox
    expect(maxX - minX).toBeGreaterThan(800)
    expect(maxY - minY).toBeGreaterThan(800)
    // 预置走的正是这条：presetOf 把 longest_only 传下去了
    expect(presetOf('note').sample.subpaths).toBe(1)
  })

  it('签名是开放笔迹：直线闭合会连出一条横线，所以必须镜像回扫', () => {
    const { d } = PATH_PRESETS.signature
    expect(d.endsWith('Z')).toBe(false)
    const join = sample(d, { N: PRESET_N, close_mode: 'join' })
    expect(join.closed).toBe(false)
    expect(join.gap).toBeGreaterThan(0.15)
    expect(sample(d, { N: PRESET_N, close_mode: 'mirror' }).closed).toBe(true)
  })
})
