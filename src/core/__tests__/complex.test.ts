import { describe, expect, it } from 'vitest'
import { TWO_PI, abs, arg, polar, scale, wrap01 } from '../complex.js'

describe('wrap01', () => {
  it('把任意实数折到 [0,1)', () => {
    expect(wrap01(0)).toBe(0)
    expect(wrap01(0.5)).toBe(0.5)
    expect(wrap01(1)).toBe(0)
    expect(wrap01(2.25)).toBe(0.25)
    expect(wrap01(-0.25)).toBe(0.75)
    expect(wrap01(-2)).toBe(0)
  })
})

describe('polar / abs / arg', () => {
  it('极坐标 ↔ 直角坐标一致', () => {
    expect(TWO_PI).toBeCloseTo(2 * Math.PI)
    const p = polar(2, Math.PI / 3)
    expect(abs(p)).toBeCloseTo(2)
    expect(arg(p)).toBeCloseTo(Math.PI / 3)
  })

  it('半径为 0 时相位无意义，结果为原点', () => {
    expect(polar(0, 1.2)).toEqual({ re: 0, im: 0 })
  })
})

describe('scale', () => {
  it('等比缩放，负倍率取反', () => {
    expect(scale({ re: 1.5, im: -0.25 }, 3)).toEqual({ re: 4.5, im: -0.75 })
    expect(scale({ re: 1.5, im: -0.25 }, -1)).toEqual({ re: -1.5, im: 0.25 })
    expect(scale({ re: 0, im: 0 }, 1e30)).toEqual({ re: 0, im: 0 })
  })
})
