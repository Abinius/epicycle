import { describe, expect, it } from 'vitest'
import { prepareSvg, readSvg } from '../source.js'

const N = 256
const CIRCLE = '<svg viewBox="0 0 16 16"><path d="M 8 1 A 7 7 0 1 1 7.99 1 Z"/></svg>'

describe('prepareSvg', () => {
  it('抽路径 → 采样 → DFT，但不做诊断', () => {
    const prep = prepareSvg(CIRCLE, { N, close_mode: 'join' })
    expect(prep.paths).toBe(1)
    expect(prep.sample).not.toBeNull()
    expect(prep.sample!.N).toBe(N)
    expect(prep.coeffs).toHaveLength(N - 1)
  })

  it('readSvg = prepareSvg + diagnose：同一输入的采样与系数逐字一致', () => {
    const opts = { N, close_mode: 'join' as const }
    const prep = prepareSvg(CIRCLE, opts)
    const full = readSvg(CIRCLE, { ...opts, K: 16 })
    expect(full.paths).toBe(prep.paths)
    expect(full.coeffs).toEqual(prep.coeffs)
    expect(full.sample?.subpaths).toBe(prep.sample?.subpaths)
    expect(full.sample?.N).toBe(prep.sample?.N)
    expect(full.diagnostics).toBeDefined()
  })

  it('无 path 时 sample 与 coeffs 都为 null', () => {
    const prep = prepareSvg('<svg><rect width="1" height="1"/></svg>', { N, close_mode: 'join' })
    expect(prep.paths).toBe(0)
    expect(prep.sample).toBeNull()
    expect(prep.coeffs).toBeNull()
  })

  it('dft_ms 默认记 0（core 不读时钟），注入时钟才真计时', () => {
    expect(prepareSvg(CIRCLE, { N, close_mode: 'join' }).dft_ms).toBe(0)

    let t = 0
    const clock = () => (t += 5)
    expect(prepareSvg(CIRCLE, { N, close_mode: 'join' }, clock).dft_ms).toBe(5)
    // 没采到样就没有 DFT，不计时
    expect(prepareSvg('<svg><rect/></svg>', { N, close_mode: 'join' }, clock).dft_ms).toBe(0)
  })
})
