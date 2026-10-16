import { describe, expect, it } from 'vitest'
import { dft } from '../dft.js'
import { decodeShare, decodeTheta, encodeShare, encodeTheta } from '../share.js'
import { Q_REL } from '../asset.js'
import { defaultTheta, type Coefficient, type Theta } from '../types.js'

const COEFFS: Coefficient[] = [
  { n: 0, re: 0.1, im: -0.05 },
  { n: 1, re: 2, im: 0 },
  { n: -1, re: 0, im: 1.5 },
  { n: 7, re: 0.3, im: -0.4 },
]

describe('encodeTheta / decodeTheta', () => {
  it('默认 theta 往返逐字段一致', () => {
    const back = decodeTheta(encodeTheta(defaultTheta))
    expect(back).toEqual(defaultTheta)
  })

  it('含 perN / band / equalize 的复杂 theta 往返一致', () => {
    const t: Theta = {
      ...defaultTheta,
      K: 200,
      speed: 2.5,
      T: 3,
      trail: 0.8,
      scale: 1.5,
      phaseShift: 1.2,
      slope: -0.7,
      equalize: true,
      band: { lo: 2, hi: Infinity },
      perN: {
        '3': { s: 1.5, dphi: 0.4, off: false },
        '-1': { s: 0, off: true },
        '7': { dphi: -1 },
      },
    }
    const back = decodeTheta(encodeTheta(t))
    expect(back).toEqual(t)
  })

  it('高通频段 hi=Infinity 在 JSON 里成 null，解码还原回 Infinity', () => {
    const t: Theta = { ...defaultTheta, band: { lo: 4, hi: Infinity } }
    expect(decodeTheta(encodeTheta(t)).band).toEqual({ lo: 4, hi: Infinity })
  })

  it('低通频段 hi 为有限值也正确往返', () => {
    const t: Theta = { ...defaultTheta, band: { lo: 0, hi: 16 } }
    expect(decodeTheta(encodeTheta(t)).band).toEqual({ lo: 0, hi: 16 })
  })

  it('坏输入不抛错，回退到默认 theta', () => {
    expect(decodeTheta('!!!not-base64!!!')).toEqual(defaultTheta)
    expect(decodeTheta('')).toEqual(defaultTheta)
  })

  it('部分字段缺省时按默认补齐（前向兼容）', () => {
    // 手造一个只含 K 和 equalize 的 theta 短码
    const partial = encodeTheta({ ...defaultTheta, K: 50, equalize: true })
    const back = decodeTheta(partial)
    expect(back.K).toBe(50)
    expect(back.equalize).toBe(true)
    expect(back.speed).toBe(defaultTheta.speed)
    expect(back.perN).toEqual({})
  })

  it('非法字段类型被静默丢弃，不污染 theta', () => {
    const raw = { ...defaultTheta, K: 'big', speed: false, perN: { x: 3 } }
    // @ts-expect-error 故意喂坏类型
    const back = decodeTheta(encodeTheta(raw))
    expect(back.K).toBe(defaultTheta.K)
    expect(back.speed).toBe(defaultTheta.speed)
    expect(back.perN).toEqual({})
  })
})

describe('encodeShare / decodeShare', () => {
  it('往返：coeffs（量化精度内）+ theta 逐字段还原', () => {
    const theta: Theta = { ...defaultTheta, K: 100, phaseShift: 0.7, equalize: true }
    const back = decodeShare(encodeShare(COEFFS, theta))!
    expect(back).not.toBeNull()
    expect(back.theta).toEqual(theta)
    // 短码是 Int16 量化：n 精确，re/im 在按最大模算的相对误差上界内
    const limit = Q_REL * COEFFS.reduce((m, c) => Math.max(m, Math.abs(c.re), Math.abs(c.im)), 0) + 1e-9
    expect(back.coeffs.map((c) => c.n)).toEqual(COEFFS.map((c) => c.n))
    back.coeffs.forEach((c, i) => {
      expect(Math.abs(c.re - COEFFS[i].re)).toBeLessThanOrEqual(limit)
      expect(Math.abs(c.im - COEFFS[i].im)).toBeLessThanOrEqual(limit)
    })
  })

  it('缺 t 时 theta 回默认', () => {
    const back = decodeShare(encodeShare(COEFFS, defaultTheta).split('&t=')[0])!
    expect(back.theta).toEqual(defaultTheta)
  })

  it('缺 a 返回 null（无分享载荷）', () => {
    expect(decodeShare('t=abc')).toBeNull()
    expect(decodeShare('')).toBeNull()
  })

  it('a 是坏短码（解出零系数）返回 null', () => {
    expect(decodeShare('a=!!!')).toBeNull()
  })

  it('真实 DFT 系数（N=256）往返不丢项', () => {
    const N = 256
    const z = new Float64Array(2 * N)
    for (let k = 0; k < N; k++) {
      const t = (2 * Math.PI * k) / N
      z[2 * k] = Math.cos(t) + 0.3 * Math.cos(7 * t)
      z[2 * k + 1] = Math.sin(3 * t)
    }
    const coeffs = dft(z, N)
    const back = decodeShare(encodeShare(coeffs, defaultTheta))!
    expect(back.coeffs.length).toBe(coeffs.length)
    expect(back.coeffs.map((c) => c.n)).toEqual(coeffs.map((c) => c.n))
  })
})
