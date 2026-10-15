/**
 * 模式 Y（形状域）派生：coeffs → 重建 → 形状域变换 → 重 DFT（技术文档 §2.4）。
 *
 * 与模式 X 的分界就在这里：模式 X 在系数域上做乘系数与加相位（永不触发 DFT），
 * 这里改的是 z_k 本身，所以任何非解析操作——剪切、任意形变——都会真的改变频谱结构，
 * 而不是只在 c_n 上做个乘法。原资产不可变：派生出来的是一份全新系数、全新指纹。
 */
import { boundsOf, createAsset } from './asset.js'
import { dft, reconstructPoints } from './dft.js'
import type { Coefficient, FourierAsset } from './types.js'

/**
 * 形状域变换参数。作用顺序（与仿射矩阵一致）：缩放 → 剪切 → 旋转 → 镜像。
 * scaleX/Y 作用在形状自身坐标系上（旋转之前），镜像作用在最终形状上。
 */
export interface ShapeTransform {
  /** 绕原点旋转（弧度） */
  rotate?: number
  /** x 方向缩放 */
  scaleX?: number
  /** y 方向缩放 */
  scaleY?: number
  /** 镜像 x */
  mirrorX?: boolean
  /** 镜像 y */
  mirrorY?: boolean
  /** 剪切：y' = y + shear · x。非解析，必须重 DFT */
  shear?: number
}

/** 变换是否等于恒等（全默认）。恒等变换派生不出新资产，见 deriveAsset 的说明。 */
export function isIdentityTransform(t: ShapeTransform): boolean {
  return (
    (t.rotate === undefined || t.rotate === 0) &&
    (t.scaleX === undefined || t.scaleX === 1) &&
    (t.scaleY === undefined || t.scaleY === 1) &&
    (t.shear === undefined || t.shear === 0) &&
    !t.mirrorX &&
    !t.mirrorY
  )
}

/** 逐点应用变换。入参不改，返回新数组（交错布局 [x0,y0,...]，与 dft 输入一致）。 */
export function applyShapeTransform(points: Float64Array, t: ShapeTransform): Float64Array {
  const rotate = t.rotate ?? 0
  const scaleX = t.scaleX ?? 1
  const scaleY = t.scaleY ?? 1
  const shear = t.shear ?? 0
  const mx = t.mirrorX ? -1 : 1
  const my = t.mirrorY ? -1 : 1
  const cos = Math.cos(rotate)
  const sin = Math.sin(rotate)
  const out = new Float64Array(points.length)
  for (let i = 0; i + 1 < points.length; i += 2) {
    // 缩放 → 剪切 → 旋转 → 镜像，逐段显式：剪切看到的 x 是缩放后的
    const sx = points[i] * scaleX
    const sy = points[i + 1] * scaleY
    const hx = sx
    const hy = sy + shear * sx
    out[i] = (hx * cos - hy * sin) * mx
    out[i + 1] = (hx * sin + hy * cos) * my
  }
  return out
}

/**
 * 模式 Y 主通路。N 必须不小于 `gridFor(coeffs)`（这组系数所属的频率网格）：
 * 在 N′ 点重建再 DFT 回来得到的是 `C_m = Σ_j c_{m+jN′}`，N′ 偏小会把 n 与 n∓N′ 折叠到一起；
 * N′ 偏大则精确（升采样）。父资产自己的 `sampling.N` 必然满足，填更大的 N 也正确，只是系数表变长。
 *
 * 恒等变换时逐位回到原系数（round-trip 恒等），所以任何偏差都能归因到变换本身，
 * 而不是这条通路的舍入。返回变换后的采样点，冻结派生资产要拿它算包围盒。
 */
export function deriveCoeffs(
  coeffs: readonly Coefficient[],
  N: number,
  t: ShapeTransform = {},
): { coeffs: Coefficient[]; points: Float64Array } {
  const points = reconstructPoints(coeffs, N)
  return { coeffs: dft(applyShapeTransform(points, t), N), points }
}

/** 派生标签：写进资产名，便于在库里认出这是哪一次变换 */
export function transformLabel(t: ShapeTransform): string {
  const parts: string[] = []
  if (t.scaleX !== undefined && t.scaleX !== 1) parts.push(`x${num(t.scaleX)}`)
  if (t.scaleY !== undefined && t.scaleY !== 1) parts.push(`y${num(t.scaleY)}`)
  if (t.shear !== undefined && t.shear !== 0) parts.push(`剪${num(t.shear)}`)
  if (t.rotate !== undefined && t.rotate !== 0) parts.push(`${num((t.rotate * 180) / Math.PI)}°`)
  if (t.mirrorX) parts.push('镜像x')
  if (t.mirrorY) parts.push('镜像y')
  return parts.join('·')
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)))
}

/**
 * 把变换结果冻结成派生资产。原资产一字不改；新资产的 source.derived_from 指向父资产 id。
 *
 * 恒等变换会抛错：它派生出的系数与父资产逐位相同 → 同一指纹 → 同一 id，而资产库按 id 存，
 * put 会直接覆盖父资产（换名字、改来源，内容还是老的）。宁可报错也不让这次调用静默丢一份资产。
 *
 * sampling 不沿用父资产：reconstruct + dft 这条路的采样点是相位等距的，不是弧长重采样，
 * 也没有细分，所以 subdivide_eps 记 0。DFT 天生把序列当环形，故 close_mode 是 'join'、closed 为真。
 */
export function deriveAsset(
  parent: FourierAsset,
  t: ShapeTransform,
  createdAt: string,
  dftMs: number,
): FourierAsset {
  return deriveAssetFrom(parent, t, deriveCoeffs(parent.coeffs, parent.sampling.N, t), createdAt, dftMs)
}

/** 同 deriveAsset，但接收 Worker 已经算好的结果——主线程只负责补 createdAt，不重算 */
export function deriveAssetFrom(
  parent: FourierAsset,
  t: ShapeTransform,
  result: { coeffs: Coefficient[]; points: Float64Array },
  createdAt: string,
  dftMs: number,
): FourierAsset {
  if (isIdentityTransform(t)) throw new Error('恒等变换不改变形状，没有可派生的新资产')
  return createAsset({
    name: `${parent.name} · ${transformLabel(t)}`,
    createdAt,
    source: { ...parent.source, derived_from: parent.id },
    sampling: { N: parent.sampling.N, closed: true, close_mode: 'join', subdivide_eps: 0 },
    bounds: boundsOf(result.coeffs, result.points),
    coeffs: result.coeffs,
    dftMs,
  })
}
