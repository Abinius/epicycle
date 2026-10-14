import type { Coefficient, FourierAsset } from './types.js'
import { sortByAbs } from './dft.js'

export const SCHEMA = 'fourierboard/asset@1.0' as const
export const ENGINE = 'fb@0.1.0'

/** 短码的量化范围与步长：Int16 覆盖 [-8, 8]，步长 ≈ 4.9e-5（亚像素级） */
export const Q_RANGE = 8
export const Q_STEP = (2 * Q_RANGE) / 32767

function clampInt16(v: number): number {
  return Math.max(-32767, Math.min(32767, Math.trunc(v)))
}

function setInt16(bytes: Uint8Array, off: number, v: number): void {
  const x = clampInt16(v) >>> 0
  bytes[off] = x & 0xff
  bytes[off + 1] = (x >> 8) & 0xff
}

function getInt16(bytes: Uint8Array, off: number): number {
  let x = bytes[off] | (bytes[off + 1] << 8)
  if (x & 0x8000) x -= 0x10000
  return x
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const TABLE: number[] = (() => {
  const t = new Array<number>(128).fill(-1)
  for (let i = 0; i < 64; i++) t[ALPHABET.charCodeAt(i)] = i
  return t
})()

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += ALPHABET[(b0 >> 2) & 63]
    out += ALPHABET[((b0 & 3) << 4 | (b1 >> 4)) & 63]
    if (i + 1 < bytes.length) out += ALPHABET[((b1 & 15) << 2 | (b2 >> 6)) & 63]
    if (i + 2 < bytes.length) out += ALPHABET[b2 & 63]
  }
  return out
}

export function base64UrlDecode(code: string): Uint8Array {
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < code.length; i++) {
    const v = TABLE[code.charCodeAt(i) & 127]
    if (v < 0) continue // 容忍换行等杂字符
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** 32 位 FNV-1a：只用于资产指纹与短 id，不是安全哈希 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 资产指纹：系数序列的规范化字符串 → FNV-1a。同一系数必得同一指纹 */
export function checksum(coeffs: readonly Coefficient[]): string {
  return fnv1a(coeffs.map((c) => `${c.n}:${c.re.toPrecision(17)}|${c.im.toPrecision(17)}`).join(','))
}

/**
 * 冻结：把一组系数固化为不可变资产。
 * createdAt 由调用方注入（core/ 不许读时钟），系数按模降序存储并附指纹。
 */
export function createAsset(input: {
  name: string
  createdAt: string
  source: FourierAsset['source']
  sampling: FourierAsset['sampling']
  bounds: FourierAsset['bounds']
  coeffs: readonly Coefficient[]
  dftMs: number
}): FourierAsset {
  const coeffs = sortByAbs(input.coeffs)
  const sum = checksum(coeffs)
  const nMax = Math.floor(coeffs.length / 2)
  return {
    schema: SCHEMA,
    id: `fa_${sum.slice(0, 6)}`,
    name: input.name,
    created_at: input.createdAt,
    source: input.source,
    sampling: input.sampling,
    domain: { n_min: -nMax, n_max: nMax },
    bounds: input.bounds,
    coeffs,
    meta: { engine: ENGINE, dft_ms: input.dftMs, checksum: sum },
  }
}

/** 每个系数 6 字节：int16 n + int16 量化 re + int16 量化 im */
export function toShortCode(coeffs: readonly Coefficient[]): string {
  const bytes = new Uint8Array(coeffs.length * 6)
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i]
    const o = i * 6
    setInt16(bytes, o, c.n)
    setInt16(bytes, o + 2, (c.re / Q_RANGE) * 32767)
    setInt16(bytes, o + 4, (c.im / Q_RANGE) * 32767)
  }
  return base64UrlEncode(bytes)
}

export function fromShortCode(code: string): Coefficient[] {
  const bytes = base64UrlDecode(code)
  const n = Math.floor(bytes.length / 6)
  const out: Coefficient[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 6
    out[i] = { n: getInt16(bytes, o), re: (getInt16(bytes, o + 2) / 32767) * Q_RANGE, im: (getInt16(bytes, o + 4) / 32767) * Q_RANGE }
  }
  return out
}
