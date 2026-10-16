import { describe, expect, it } from 'vitest'
import { createAsset } from '../asset.js'
import { TWO_PI } from '../complex.js'
import { dft } from '../dft.js'
import {
  applyShapeTransform,
  deriveAsset,
  deriveCoeffs,
  isIdentityTransform,
  transformLabel,
} from '../derive.js'
import type { Coefficient, FourierAsset } from '../types.js'

const N = 256
const A = { re: 1, im: 0.5 }
const B = { re: 0.3, im: -0.2 }

/**
 * c_1 = A、c_{-1} = B，且 A、B 故意不构成共轭对：
 * 各向异性缩放与剪切的 conj(c_{-n}) 项因此非零，那两条支路才真被断言到。
 * （若取实信号，conj(c_{-n}) = c_n，剪切退化成一次均匀缩放，测不出剪切本身。）
 */
function makeCoeffs(): Coefficient[] {
  const pts = new Float64Array(2 * N)
  for (let k = 0; k < N; k++) {
    const th = (TWO_PI * k) / N
    pts[2 * k] = A.re * Math.cos(th) - A.im * Math.sin(th) + B.re * Math.cos(th) + B.im * Math.sin(th)
    pts[2 * k + 1] = A.re * Math.sin(th) + A.im * Math.cos(th) - B.re * Math.sin(th) + B.im * Math.cos(th)
  }
  return dft(pts, N)
}

function at(coeffs: readonly Coefficient[], n: number): Coefficient {
  return coeffs.find((c) => c.n === n)!
}

type Complex = { re: number; im: number }

function expectCoeff(c: Coefficient, want: Complex, label: string): void {
  expect(c.re, `${label} re`).toBeCloseTo(want.re, 11)
  expect(c.im, `${label} im`).toBeCloseTo(want.im, 11)
}

function conj(f: Complex): Complex {
  return { re: f.re, im: -f.im }
}

function cmul(p: Complex, q: Complex): Complex {
  return { re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re }
}

/** z′ = u·z + v·conj(z) 在频域上的样子：C′_m = u·C_m + v·conj(C_{-m}) */
function affine(u: Complex, v: Complex) {
  return (c: Coefficient, cc: Coefficient): Complex => {
    const a = cmul(u, c)
    const b = cmul(v, conj(cc))
    return { re: a.re + b.re, im: a.im + b.im }
  }
}

/**
 * 缩放 (a, b) 接剪切 s 的频域系数。顺序固定为 缩放 → 剪切（剪切看到缩放后的 x）：
 * z′ = ((a+b)/2 + i·a·s/2)·z + ((a−b)/2 + i·a·s/2)·conj(z)。
 * s=0 退化成各向异性缩放，a=b 再退化成均匀缩放，a=b=1 是纯剪切——三者的解析断言同源。
 */
function affineUV(a: number, b: number, s: number): [Complex, Complex] {
  return [
    { re: (a + b) / 2, im: (a * s) / 2 },
    { re: (a - b) / 2, im: (a * s) / 2 },
  ]
}

describe('isIdentityTransform', () => {
  it('缺省与 0/1 都算恒等', () => {
    for (const t of [{}, { rotate: 0, scaleX: 1, scaleY: 1, shear: 0 }]) {
      expect(isIdentityTransform(t)).toBe(true)
    }
  })

  it('任一非默认都不是恒等', () => {
    for (const t of [{ rotate: 0.1 }, { scaleX: 2 }, { scaleY: 0.5 }, { shear: 0.3 }, { mirrorX: true }, { mirrorY: true }]) {
      expect(isIdentityTransform(t), JSON.stringify(t)).toBe(false)
    }
  })
})

describe('applyShapeTransform', () => {
  const P = Float64Array.from([3, 4, -2, 1])

  it('恒等不改值、不改动入参，返回新数组', () => {
    const out = applyShapeTransform(P, {})
    expect(Array.from(out)).toEqual([3, 4, -2, 1])
    expect(Array.from(P)).toEqual([3, 4, -2, 1])
    expect(out).not.toBe(P)
  })

  it('缩放按 x/y 分别作用', () => {
    expect(Array.from(applyShapeTransform(P, { scaleX: 2, scaleY: -1 }))).toEqual([6, -4, -4, -1])
  })

  it('剪切作用在已缩放的 x 上：y′ = (y + shear·x)·scaleY', () => {
    expect(Array.from(applyShapeTransform(P, { shear: 2 }))).toEqual([3, 10, -2, -3])
    expect(Array.from(applyShapeTransform(P, { shear: 2, scaleX: 10 }))).toEqual([30, 64, -20, -39])
  })

  it('镜像作用在最终形状上', () => {
    expect(Array.from(applyShapeTransform(P, { mirrorX: true }))).toEqual([-3, 4, 2, 1])
    expect(Array.from(applyShapeTransform(P, { mirrorX: true, mirrorY: true }))).toEqual([-3, -4, 2, -1])
  })

  it('旋转 90° 把 (x,y) 送到 (-y,x)', () => {
    const out = applyShapeTransform(P, { rotate: Math.PI / 2 })
    expect(out[0]).toBeCloseTo(-4, 12)
    expect(out[1]).toBeCloseTo(3, 12)
    expect(out[2]).toBeCloseTo(-1, 12)
    expect(out[3]).toBeCloseTo(-2, 12)
  })

  it('先缩后旋：(3,4) 缩成 (6,4) 再旋 90° 得 (-4,6)', () => {
    const out = applyShapeTransform(P, { scaleX: 2, rotate: Math.PI / 2 })
    expect(out[0]).toBeCloseTo(-4, 12)
    expect(out[1]).toBeCloseTo(6, 12)
  })
})

describe('transformLabel', () => {
  it('恒等为空串', () => {
    expect(transformLabel({ scaleX: 1, rotate: 0, shear: 0 })).toBe('')
  })

  it('按 缩放·剪切·旋转·镜像 的顺序拼', () => {
    expect(
      transformLabel({ scaleX: 2, scaleY: 0.5, shear: 1.5, rotate: Math.PI / 2, mirrorX: true, mirrorY: true }),
    ).toBe('x2·y0.5·剪1.5·90°·镜像x·镜像y')
  })

  it('空标签当且仅当恒等：非恒等变换必有非空标签（资产名靠它区分）', () => {
    expect(isIdentityTransform({})).toBe(true)
    expect(transformLabel({ scaleX: 1, rotate: 0, shear: 0 })).toBe('')
    for (const t of [{ scaleX: 2 }, { scaleY: 0.5 }, { shear: 0.3 }, { rotate: 0.1 }, { mirrorX: true }, { mirrorY: true }]) {
      expect(isIdentityTransform(t), JSON.stringify(t)).toBe(false)
      expect(transformLabel(t), JSON.stringify(t)).not.toBe('')
    }
  })
})

describe('deriveCoeffs 的解析断言', () => {
  const coeffs = makeCoeffs()
  const both = [1, -1] as const

  it('重建出的系数就是 c_1 = A、c_{-1} = B，其余近零', () => {
    expectCoeff(at(coeffs, 1), A, 'c_1')
    expectCoeff(at(coeffs, -1), B, 'c_{-1}')
    for (const n of [0, 2, -2, 7]) {
      expect(Math.hypot(at(coeffs, n).re, at(coeffs, n).im), `n=${n}`).toBeLessThan(1e-12)
    }
  })

  it('恒等变换 round-trip：逐位回到原系数（偏差只可能来自变换本身）', () => {
    const back = deriveCoeffs(coeffs, N, {}).coeffs
    for (let i = 0; i < coeffs.length; i++) {
      expect(back[i].n, `i=${i}`).toBe(coeffs[i].n)
      expect(back[i].re, `i=${i} re`).toBeCloseTo(coeffs[i].re, 11)
      expect(back[i].im, `i=${i} im`).toBeCloseTo(coeffs[i].im, 11)
    }
  })

  it('均匀缩放：所有 c_n 乘同一个 k', () => {
    const back = deriveCoeffs(coeffs, N, { scaleX: 2, scaleY: 2 }).coeffs
    const f = affine(...affineUV(2, 2, 0))
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('空间旋转：c_n → e^{iα}·c_n，所有 n 同一个因子（与 n 无关，别和相位斜坡搞混）', () => {
    const alpha = 1.3
    const back = deriveCoeffs(coeffs, N, { rotate: alpha }).coeffs
    const f = affine({ re: Math.cos(alpha), im: Math.sin(alpha) }, { re: 0, im: 0 })
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('镜像 y：z → conj(z)，c_n → conj(c_{-n})', () => {
    const back = deriveCoeffs(coeffs, N, { mirrorY: true }).coeffs
    const f = affine({ re: 0, im: 0 }, { re: 1, im: 0 })
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('镜像 x：z → -conj(z)，c_n → -conj(c_{-n})', () => {
    const back = deriveCoeffs(coeffs, N, { mirrorX: true }).coeffs
    const f = affine({ re: 0, im: 0 }, { re: -1, im: 0 })
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('各向异性缩放：c_n → ((a+b)/2)·c_n + ((a−b)/2)·conj(c_{-n})', () => {
    const back = deriveCoeffs(coeffs, N, { scaleX: 2, scaleY: 1.5 }).coeffs
    const f = affine(...affineUV(2, 1.5, 0))
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('剪切：c_n → (1 + is/2)·c_n + (is/2)·conj(c_{-n})', () => {
    const back = deriveCoeffs(coeffs, N, { shear: 0.6 }).coeffs
    const f = affine(...affineUV(1, 1, 0.6))
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('缩放 → 剪切 → 旋转 逐段作用（组合）', () => {
    const [u, v] = affineUV(2, 1.4, 0.6)
    const back = deriveCoeffs(coeffs, N, { scaleX: 2, scaleY: 1.4, shear: 0.6, rotate: 0.7 }).coeffs
    const rot: Complex = { re: Math.cos(0.7), im: Math.sin(0.7) }
    const f = affine(cmul(rot, u), cmul(rot, v))
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })

  it('镜像作用在最终形状上：剪切 → 旋转 → 镜像 x（z 槽与 conj 槽对调并整体取负）', () => {
    const [u, v] = affineUV(1, 1, 0.4)
    const rot: Complex = { re: Math.cos(0.5), im: Math.sin(0.5) }
    const p = cmul(rot, u)
    const q = cmul(rot, v)
    const f = affine({ re: -q.re, im: q.im }, { re: -p.re, im: p.im })
    const back = deriveCoeffs(coeffs, N, { shear: 0.4, rotate: 0.5, mirrorX: true }).coeffs
    for (const n of both) expectCoeff(at(back, n), f(at(coeffs, n), at(coeffs, -n)), `c_${n}`)
  })
})

function makeParent(): FourierAsset {
  return createAsset({
    name: '心形',
    createdAt: '2026-10-15T00:00:00.000Z',
    source: { type: 'preset', preset: 'heart', subpaths: 1 },
    sampling: { N, closed: true, close_mode: 'join', subdivide_eps: 0 },
    bounds: { center: [0, 0], radius: 1, view_scale: 0.8, orig_bbox: [-1, -1, 1, 1] },
    coeffs: makeCoeffs(),
    dftMs: 4.2,
  })
}

describe('deriveAsset', () => {
  it('派生出新资产：新 id 与新指纹，derived_from 指向父资产，父资产一字不改', () => {
    const parent = makeParent()
    const before = JSON.stringify(parent)
    const child = deriveAsset(parent, { scaleX: 2 }, '2026-10-15T00:01:00.000Z', 5.1)

    expect(child.name).toBe('心形 · x2')
    expect(child.source.derived_from).toBe(parent.id)
    expect(child.id).not.toBe(parent.id)
    expect(child.meta.checksum).not.toBe(parent.meta.checksum)
    expect(child.sampling).toEqual({ N, closed: true, close_mode: 'join', subdivide_eps: 0 })
    expect(child.meta.dft_ms).toBe(5.1)
    expect(JSON.stringify(parent)).toBe(before)
  })

  it('派生资产的指纹就是它自己那组系数（不是父资产的）', () => {
    const child = deriveAsset(makeParent(), { mirrorY: true }, '2026-10-15T00:01:00.000Z', 1)
    expect(child.meta.checksum).toBe(child.id.slice(3))
  })

  it('恒等变换抛错：否则同指纹 → 同 id → 资产库 put 会覆盖父资产', () => {
    const parent = makeParent()
    expect(() => deriveAsset(parent, {}, '2026-10-15T00:01:00.000Z', 0)).toThrow(/恒等/)
    expect(() => deriveAsset(parent, { scaleX: 1, rotate: 0 }, '2026-10-15T00:01:00.000Z', 0)).toThrow(/恒等/)
  })

  it('不同变换派生出不同的资产', () => {
    const parent = makeParent()
    const a = deriveAsset(parent, { scaleX: 2 }, '2026-10-15T00:01:00.000Z', 1)
    const b = deriveAsset(parent, { scaleX: 3 }, '2026-10-15T00:01:00.000Z', 1)
    expect(a.id).not.toBe(b.id)
    expect(a.name).toBe('心形 · x2')
    expect(b.name).toBe('心形 · x3')
  })
})
