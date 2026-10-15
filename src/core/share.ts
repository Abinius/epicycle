/**
 * 分享链接编解码（技术文档 §3.3）：`a=<系数短码>&t=<theta 短码>`。
 * 纯 core，不用 TextEncoder / URLSearchParams（那是浏览器 API）；theta 的 JSON
 * 字段名与数值全是 ASCII，逐字节编解码即可。base64url 复用 asset.ts 的实现。
 */
import { base64UrlDecode, base64UrlEncode, fromShortCode, toShortCode } from './asset.js'
import { defaultTheta, type Coefficient, type PerNParam, type Theta } from './types.js'

/** ASCII 字符串 → 字节。theta 的 JSON 不含非 ASCII，故直接取 charCodeAt。 */
function asciiBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** 字节 → ASCII 字符串（base64url 解码后）。 */
function asciiString(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

/**
 * Theta → base64url(JSON)。band.hi===Infinity 在 JSON.stringify 里会变成 null，
 * 编码侧显式落成 null，解码侧再还原成 Infinity，避免高通频段在分享链路上丢上限。
 */
export function encodeTheta(theta: Theta): string {
  const raw = {
    ...theta,
    band: theta.band ? { lo: theta.band.lo, hi: theta.band.hi === Infinity ? null : theta.band.hi } : null,
  }
  return base64UrlEncode(asciiBytes(JSON.stringify(raw)))
}

/** base64url(JSON) → Theta。缺字段按 defaultTheta 兜底；非法字段静默丢弃，不抛错。 */
export function decodeTheta(code: string): Theta {
  let raw: unknown
  try {
    raw = JSON.parse(asciiString(base64UrlDecode(code)))
  } catch {
    return { ...defaultTheta }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...defaultTheta }
  const r = raw as Record<string, unknown>
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const t: Theta = { ...defaultTheta }
  for (const key of ['K', 'speed', 'T', 'trail', 'scale', 'phaseShift', 'slope'] as const) {
    const v = num(r[key])
    if (v !== undefined) t[key] = v
  }
  if (typeof r.equalize === 'boolean') t.equalize = r.equalize
  if (typeof r.band === 'object' && r.band !== null && !Array.isArray(r.band)) {
    const b = r.band as Record<string, unknown>
    const lo = num(b.lo)
    const hi = b.hi === null ? Infinity : num(b.hi)
    if (lo !== undefined && hi !== undefined) t.band = { lo, hi }
  }
  if (typeof r.perN === 'object' && r.perN !== null && !Array.isArray(r.perN)) {
    const perN: Theta['perN'] = {}
    for (const [k, v] of Object.entries(r.perN as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null || Array.isArray(v)) continue
      const o = v as Record<string, unknown>
      const p: Partial<PerNParam> = {}
      const s = num(o.s)
      const dphi = num(o.dphi)
      if (s !== undefined) p.s = s
      if (dphi !== undefined) p.dphi = dphi
      if (typeof o.off === 'boolean') p.off = o.off
      if (Object.keys(p).length > 0) perN[k] = p
    }
    t.perN = perN
  }
  return t
}

/** (coeffs, theta) → 查询串 `a=...&t=...`（不含前导 `?`）。base64url 字母表 URL 安全，无需转义。 */
export function encodeShare(coeffs: readonly Coefficient[], theta: Theta): string {
  return `a=${toShortCode(coeffs)}&t=${encodeTheta(theta)}`
}

/**
 * 查询串 → { coeffs, theta }。缺 a 返回 null（无分享载荷）；缺 t 用默认 θ。
 * 值不做 URL 解码：base64url 字母表无保留字。
 */
export function decodeShare(query: string): { coeffs: Coefficient[]; theta: Theta } | null {
  let a: string | null = null
  let t: string | null = null
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq)
    const val = part.slice(eq + 1)
    if (key === 'a') a = val
    else if (key === 't') t = val
  }
  if (a === null) return null
  const coeffs = fromShortCode(a)
  if (coeffs.length === 0) return null
  return { coeffs, theta: t !== null ? decodeTheta(t) : { ...defaultTheta } }
}
