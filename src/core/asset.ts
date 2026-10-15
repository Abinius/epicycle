import type { Coefficient, FourierAsset } from './types.js'
import { VIEW_BUDGET } from './types.js'
import { sortByAbs } from './dft.js'
import { ASSET_DIAGNOSTICS, type Diagnostic } from './diagnostic.js'

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

/**
 * 资产指纹：系数序列的规范化字符串 → FNV-1a。同一系数必得同一指纹。
 *
 * `+ 0` 是把 −0 归一成 0：JSON 没有负零（`JSON.stringify(-0)` 是 `"0"`），
 * 于是导出再导入会把 −0 读成 +0，指纹跟着变、资产被自己的校验拒收。
 */
export function checksum(coeffs: readonly Coefficient[]): string {
  return fnv1a(coeffs.map((c) => `${c.n}:${(c.re + 0).toPrecision(17)}|${(c.im + 0).toPrecision(17)}`).join(','))
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
  const out: Coefficient[] = []
  for (let i = 0; i < n; i++) {
    const o = i * 6
    out.push({
      n: getInt16(bytes, o),
      re: (getInt16(bytes, o + 2) / 32767) * Q_RANGE,
      im: (getInt16(bytes, o + 4) / 32767) * Q_RANGE,
    })
  }
  return out
}

/**
 * 冻结时的几何量。center 取 c₀（DFT 的直流项就是路径质心），radius 取采样点到质心的
 * 最远距离，view_scale 与 buildScene 用同一个预算常量——导出/渲染还原原始尺度靠它。
 */
export function boundsOf(coeffs: readonly Coefficient[], points: Float64Array): FourierAsset['bounds'] {
  let cx = 0
  let cy = 0
  let sum = 0
  for (const c of coeffs) {
    if (c.n === 0) {
      cx = c.re
      cy = c.im
    } else {
      sum += Math.hypot(c.re, c.im)
    }
  }

  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  let radius = 0
  if (points.length >= 2) {
    minX = Infinity
    minY = Infinity
    maxX = -Infinity
    maxY = -Infinity
    for (let i = 0; i + 1 < points.length; i += 2) {
      const x = points[i]
      const y = points[i + 1]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      const d = Math.hypot(x - cx, y - cy)
      if (d > radius) radius = d
    }
  }
  return {
    center: [cx, cy],
    radius,
    view_scale: VIEW_BUDGET / Math.max(sum, 1e-9),
    orig_bbox: [minX, minY, maxX, maxY],
  }
}

/** 全精度 JSON：人可读、可 diff，也是「导出 → 重新导入 → 逐帧一致」的载体 */
export function exportJson(asset: FourierAsset): string {
  return JSON.stringify(asset, null, 2)
}

/** 支持的 schema 主版本。读到更高的主版本明确报错，不猜着降级（技术文档 §3.4） */
export const SCHEMA_MAJOR = 1

const SCHEMA_RE = /^fourierboard\/asset@(\d+)\.(\d+)$/
const SOURCE_TYPES = ['svg', 'draw', 'formula', 'preset', 'shared', 'morph']
const CLOSE_MODES = ['join', 'mirror']

export type AssetRead = { ok: true; asset: FourierAsset } | { ok: false; diagnostic: Diagnostic }

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNumTuple = (v: unknown, len: number): v is number[] =>
  Array.isArray(v) && v.length === len && v.every(isNum)

/**
 * 结构校验：通过就返回字段齐全的资产，否则给出诊断。
 * 只认「我们写出来的完整形状」——缺字段说明来源可疑，不靠默认值猜（技术文档 §3.4）。
 * 指纹不符同样拒收：资产的全部价值就是「这组系数没被动过」。
 */
export function validateAsset(v: unknown): AssetRead {
  const bad = (diagnostic: Diagnostic): AssetRead => ({ ok: false, diagnostic })
  if (!isObj(v)) return bad(ASSET_DIAGNOSTICS.importUnreadable)

  const schema = SCHEMA_RE.exec(isStr(v.schema) ? v.schema : '')
  if (!schema) return bad(ASSET_DIAGNOSTICS.importUnreadable)
  if (Number(schema[1]) > SCHEMA_MAJOR) return bad(ASSET_DIAGNOSTICS.importMismatch)

  const source = v.source
  const sampling = v.sampling
  const domain = v.domain
  const bounds = v.bounds
  const meta = v.meta
  const coeffs = v.coeffs
  if (
    !isObj(meta) ||
    !isObj(source) ||
    !isObj(sampling) ||
    !isObj(domain) ||
    !isObj(bounds) ||
    !Array.isArray(coeffs) ||
    !SOURCE_TYPES.includes(source.type as string) ||
    !(source.preset === undefined || isStr(source.preset)) ||
    !(source.file_name === undefined || isStr(source.file_name)) ||
    !(source.bytes === undefined || isNum(source.bytes)) ||
    !(source.subpaths === undefined || isNum(source.subpaths)) ||
    !(source.derived_from === undefined || isStr(source.derived_from)) ||
    !isNum(sampling.N) ||
    typeof sampling.closed !== 'boolean' ||
    !CLOSE_MODES.includes(sampling.close_mode as string) ||
    !isNum(sampling.subdivide_eps) ||
    !isNum(domain.n_min) ||
    !isNum(domain.n_max) ||
    !isNumTuple(bounds.center, 2) ||
    !isNum(bounds.radius) ||
    !isNum(bounds.view_scale) ||
    !isNumTuple(bounds.orig_bbox, 4) ||
    !isStr(v.id) ||
    !isStr(v.name) ||
    !isStr(v.created_at) ||
    !isStr(meta.engine) ||
    !isNum(meta.dft_ms) ||
    !isStr(meta.checksum) ||
    coeffs.length === 0 ||
    !coeffs.every((c: unknown) => isObj(c) && isNum(c.n) && isNum(c.re) && isNum(c.im))
  ) {
    return bad(ASSET_DIAGNOSTICS.importUnreadable)
  }

  const list = coeffs as Coefficient[]
  if (checksum(list) !== meta.checksum) return bad(ASSET_DIAGNOSTICS.importMismatch)

  // 逐字段重建而不是断言：编译器替我们保证没有漏字段。
  // schema 归一到本版本的常量字符串（类型上是字面量）：次要版本只允许「可选且带默认值」
  // 的新字段，读回来能用的部分就是本版本的形状，读不懂的多余字段就此丢弃。
  return {
    ok: true,
    asset: {
      schema: SCHEMA,
      id: v.id,
      name: v.name,
      created_at: v.created_at,
      source: {
        type: source.type as FourierAsset['source']['type'],
        ...(isStr(source.preset) ? { preset: source.preset } : {}),
        ...(isStr(source.file_name) ? { file_name: source.file_name } : {}),
        ...(isNum(source.bytes) ? { bytes: source.bytes } : {}),
        ...(isNum(source.subpaths) ? { subpaths: source.subpaths } : {}),
        ...(isStr(source.derived_from) ? { derived_from: source.derived_from } : {}),
      },
      sampling: {
        N: sampling.N,
        closed: sampling.closed,
        close_mode: sampling.close_mode as FourierAsset['sampling']['close_mode'],
        subdivide_eps: sampling.subdivide_eps,
      },
      domain: { n_min: domain.n_min, n_max: domain.n_max },
      bounds: {
        center: [bounds.center[0], bounds.center[1]],
        radius: bounds.radius,
        view_scale: bounds.view_scale,
        orig_bbox: [bounds.orig_bbox[0], bounds.orig_bbox[1], bounds.orig_bbox[2], bounds.orig_bbox[3]],
      },
      coeffs: list,
      meta: { engine: meta.engine, dft_ms: meta.dft_ms, checksum: meta.checksum },
    },
  }
}

/** 导入入口：文本 → 资产。JSON 都读不出来就当「不是资产文件」 */
export function parseAsset(text: string): AssetRead {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, diagnostic: ASSET_DIAGNOSTICS.importUnreadable }
  }
  return validateAsset(raw)
}

