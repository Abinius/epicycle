import { describe, expect, it } from 'vitest'
import {
  Q_RANGE,
  Q_STEP,
  SCHEMA,
  base64UrlDecode,
  base64UrlEncode,
  checksum,
  createAsset,
  fnv1a,
  fromShortCode,
  toShortCode,
} from '../asset.js'
import type { Coefficient } from '../types.js'

const COEFFS: Coefficient[] = [
  { n: 0, re: 0.1, im: -0.05 },
  { n: 3, re: 2, im: 0 },
  { n: -3, re: 0, im: 2 },
  { n: 11, re: 0.5, im: 0 },
]

describe('fnv1a', () => {
  it('空串为 FNV 偏移基准，输出 8 位十六进制', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('fourierboard')).toMatch(/^[0-9a-f]{8}$/)
    expect(fnv1a('abc')).not.toBe(fnv1a('abcd'))
  })
})

describe('checksum', () => {
  it('同系数同指纹，且依赖系数顺序', () => {
    expect(checksum(COEFFS)).toBe(checksum(COEFFS))
    expect(checksum(COEFFS)).not.toBe(checksum([...COEFFS].reverse()))
    expect(checksum([{ n: 1, re: 1, im: 0 }])).not.toBe(checksum([{ n: 1, re: 1.0000001, im: 0 }]))
  })
})

describe('createAsset', () => {
  function freeze() {
    return createAsset({
      name: '心形',
      createdAt: '2026-10-14T00:00:00.000Z',
      source: { type: 'formula' },
      sampling: { N: 1024, closed: true, close_mode: 'join', subdivide_eps: 0.001 },
      bounds: { center: [0, 0], radius: 1, view_scale: 0.8, orig_bbox: [-1, -1, 1, 1] },
      coeffs: COEFFS,
      dftMs: 12.5,
    })
  }

  it('按模降序存储，并派生 id / domain / 指纹', () => {
    const a = freeze()
    expect(a.schema).toBe(SCHEMA)
    expect(a.coeffs.map((c) => c.n)).toEqual([3, -3, 11, 0])
    expect(a.domain).toEqual({ n_min: -2, n_max: 2 })
    expect(a.id).toBe(`fa_${a.meta.checksum.slice(0, 6)}`)
    expect(a.meta.checksum).toBe(checksum(a.coeffs))
    expect(a.meta.dft_ms).toBe(12.5)
    expect(a.source).toEqual({ type: 'formula' })
    expect(a.bounds.center).toEqual([0, 0])
  })

  it('同输入得同 id；不改动传入的系数数组', () => {
    expect(freeze().id).toBe(freeze().id)
    expect(COEFFS.map((c) => c.n)).toEqual([0, 3, -3, 11])
  })
})

describe('短码（Int16 量化 + base64url）', () => {
  it('往返：n 精确，re/im 误差不超过一个量化步长', () => {
    const coeffs: Coefficient[] = [
      { n: -100, re: 7.9, im: -8 },
      { n: 3, re: 0.123456, im: -0.0001 },
      { n: 0, re: 0, im: 0 },
    ]
    const back = fromShortCode(toShortCode(coeffs))
    expect(back.map((c) => c.n)).toEqual([-100, 3, 0])
    back.forEach((b, i) => {
      expect(Math.abs(b.re - coeffs[i].re)).toBeLessThanOrEqual(Q_STEP + 1e-12)
      expect(Math.abs(b.im - coeffs[i].im)).toBeLessThanOrEqual(Q_STEP + 1e-12)
    })
  })

  it('超出量化范围时钳到 ±Q_RANGE，n 钳到 Int16 边界', () => {
    const back = fromShortCode(toShortCode([{ n: 32767, re: 100, im: -100 }, { n: -32768, re: 8, im: -8 }]))
    expect(back[0].n).toBe(32767)
    expect(Math.abs(back[0].re - Q_RANGE)).toBeLessThanOrEqual(Q_STEP)
    expect(Math.abs(back[0].im + Q_RANGE)).toBeLessThanOrEqual(Q_STEP)
    expect(back[1].n).toBe(-32767)
  })

  it('截断的短码丢弃尾部不完整记录', () => {
    const code = toShortCode([{ n: 1, re: 0.5, im: 0 }, { n: 2, re: 0, im: 1 }])
    expect(fromShortCode(code.slice(0, 4)).length).toBe(0)
    expect(fromShortCode(code.slice(0, 12)).length).toBe(1)
    expect(fromShortCode(code).length).toBe(2)
  })
})

describe('base64url', () => {
  it('已知向量（含 − 与 _ 两个 url-safe 字符）', () => {
    expect(base64UrlEncode(new Uint8Array([0x48, 0x69]))).toBe('SGk')
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xff]))).toBe('-___')
  })

  it('任意长度往返无损，且不出现标准 base64 的 + / = ', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 7, 100]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff)
      expect(Array.from(base64UrlDecode(base64UrlEncode(bytes))), `len=${len}`).toEqual(Array.from(bytes))
      expect(base64UrlEncode(bytes), `len=${len}`).not.toMatch(/[+/=]/)
    }
  })

  it('解码时忽略非字母表字符', () => {
    expect(Array.from(base64UrlDecode('SG k!'))).toEqual([0x48, 0x69])
  })
})
