import { SVGPathData, type SVGCommand } from 'svg-pathdata'
import { isPowerOfTwo } from './dft.js'

/**
 * SVG path → 等弧长 N 点（技术文档 §2.1）。
 *
 * 无 DOM：`svg-pathdata` 只做解析与指令归一化，弧长细分与重采样全部自研。
 * 坐标系：SVG 是 y 向下，展开时一次性翻成数学坐标系（y 向上），之后不再有 y 符号问题。
 */

/** SVG `matrix(a,b,c,d,e,f)` */
export type Matrix = [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** 归一化后的几何片段：0=移动 1=直线 2=三次贝塞尔 3=闭合当前子路径 */
interface Seg {
  kind: 0 | 1 | 2 | 3
  pts: [number, number][]
}

/**
 * 指令 → 绝对坐标片段。H/V/Q/T/S/A 必须先被归一化；未归一化就抛错，
 * 因为静默画出错的形状比报错糟糕得多。
 */
function toSeg(cmd: SVGCommand, ox: number, oy: number): Seg {
  if (cmd.type === SVGPathData.CLOSE_PATH) return { kind: 3, pts: [] }
  const add = (x: number, y: number): [number, number] => (cmd.relative ? [ox + x, oy + y] : [x, y])
  switch (cmd.type) {
    case SVGPathData.MOVE_TO:
      return { kind: 0, pts: [add(cmd.x, cmd.y)] }
    case SVGPathData.LINE_TO:
      return { kind: 1, pts: [add(cmd.x, cmd.y)] }
    case SVGPathData.CURVE_TO:
      return { kind: 2, pts: [add(cmd.x1, cmd.y1), add(cmd.x2, cmd.y2), add(cmd.x, cmd.y)] }
    default:
      throw new Error(`路径指令未归一化（type=${cmd.type}），无法采样`)
  }
}

const MAX_DEPTH = 24

/**
 * 三次贝塞尔按「弦中点偏差」递归细分，返回新增段数。
 * 偏差 = (3/8)·|p1+p2−p0−p3|，正是曲线中点与弦中点的距离，即几何误差本身；
 * 曲率大处自动变密，不靠参数等距。
 */
function pushCubic(
  out: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  eps: number,
  depth: number,
): number {
  const dev = Math.hypot(x1 + x2 - x0 - x3, y1 + y2 - y0 - y3) * 0.375
  if (dev <= eps || depth >= MAX_DEPTH) {
    out.push(x3, y3)
    return 1
  }
  const m01x = (x0 + x1) / 2
  const m01y = (y0 + y1) / 2
  const m12x = (x1 + x2) / 2
  const m12y = (y1 + y2) / 2
  const m23x = (x2 + x3) / 2
  const m23y = (y2 + y3) / 2
  const m012x = (m01x + m12x) / 2
  const m012y = (m01y + m12y) / 2
  const m123x = (m12x + m23x) / 2
  const m123y = (m12y + m23y) / 2
  const midX = (m012x + m123x) / 2
  const midY = (m012y + m123y) / 2
  return (
    pushCubic(out, x0, y0, m01x, m01y, m012x, m012y, midX, midY, eps, depth + 1) +
    pushCubic(out, midX, midY, m123x, m123y, m23x, m23y, x3, y3, eps, depth + 1)
  )
}

export interface Flattened {
  /** 每个子路径一条交错点列 [x,y,x,y,...]，数学坐标系 */
  subpaths: Float64Array[]
  /** 细分出的总段数 */
  segments: number
  /** 实际使用的细分容差（用户坐标单位） */
  tolerance: number
}

export function flatten(d: string, matrix: Matrix = IDENTITY, tolerance: number = -1): Flattened {
  const path = new SVGPathData(d).toAbs().normalizeST().normalizeHVZ().qtToC().aToC()
  const [ma, mb, mc, md, me, mf] = matrix
  // 矩阵作用在 SVG 坐标上，出参直接是数学坐标——变换与 y 翻转只在这一处
  const T = (x: number, y: number): [number, number] => [ma * x + mc * y + me, -(mb * x + md * y + mf)]

  const segs: Seg[] = []
  let ox = 0
  let oy = 0
  for (const cmd of path.commands) {
    const seg = toSeg(cmd, ox, oy)
    segs.push(seg)
    const end = seg.pts[seg.pts.length - 1]
    if (end) {
      ox = end[0]
      oy = end[1]
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const seg of segs) {
    for (const [px, py] of seg.pts) {
      // 用变换后的坐标量跨度，默认容差才与实际细分空间同一尺度
      const [x, y] = T(px, py)
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const span = Math.max(maxX - minX, maxY - minY)
  const eps = tolerance > 0 ? tolerance : (span || 1) / 2048

  const subpaths: Float64Array[] = []
  let pts: number[] = []
  let startX = 0
  let startY = 0
  let cx = 0
  let cy = 0
  let segments = 0

  const seal = () => {
    if (pts.length >= 2) subpaths.push(new Float64Array(pts))
  }
  const begin = (x: number, y: number) => {
    seal()
    pts = [x, y]
    startX = x
    startY = y
    cx = x
    cy = y
  }

  for (const seg of segs) {
    if (seg.kind === 0) {
      const [x, y] = T(seg.pts[0][0], seg.pts[0][1])
      begin(x, y)
      continue
    }
    if (seg.kind === 1) {
      const [x, y] = T(seg.pts[0][0], seg.pts[0][1])
      if (x !== cx || y !== cy) segments++
      pts.push(x, y)
      cx = x
      cy = y
      continue
    }
    if (seg.kind === 2) {
      if (pts.length < 2) pts.push(cx, cy)
      const t0 = T(seg.pts[0][0], seg.pts[0][1])
      const t1 = T(seg.pts[1][0], seg.pts[1][1])
      const t2 = T(seg.pts[2][0], seg.pts[2][1])
      segments += pushCubic(pts, cx, cy, t0[0], t0[1], t1[0], t1[1], t2[0], t2[1], eps, 0)
      cx = t2[0]
      cy = t2[1]
      continue
    }
    const [x, y] = T(startX, startY)
    if (x !== cx || y !== cy) segments++
    pts.push(x, y)
    cx = x
    cy = y
  }
  seal()

  return { subpaths, segments, tolerance: eps }
}

function pathLength(pts: Float64Array): number {
  let len = 0
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  return len
}

/** 多子路径按「最近端点」串成一条连续折线：起点取最长，之后贪心贴最近的一端 */
function chain(subpaths: Float64Array[]): number[] {
  if (subpaths.length === 1) return Array.from(subpaths[0])
  const order = Array.from({ length: subpaths.length }, (_, i) => i).sort(
    (i, j) => pathLength(subpaths[j]) - pathLength(subpaths[i]),
  )
  const rest = order.map((i) => Array.from(subpaths[i]))
  const head = rest.shift()!
  for (const piece of rest) {
    const toHead = Math.hypot(
      head[head.length - 2] - piece[piece.length - 2],
      head[head.length - 1] - piece[piece.length - 1],
    )
    if (toHead < Math.hypot(head[head.length - 2] - piece[0], head[head.length - 1] - piece[1])) piece.reverse()
    head.push(...piece.slice(2))
  }
  return head
}

function dedupe(pts: number[]): number[] {
  const out: number[] = [pts[0], pts[1]]
  for (let i = 2; i < pts.length; i += 2) {
    if (pts[i] !== out[out.length - 2] || pts[i + 1] !== out[out.length - 1]) out.push(pts[i], pts[i + 1])
  }
  return out
}

/** 累计弧长 + 线性插值取点；闭合段（末点→首点）也计入弧长 */
function resample(pts: number[], N: number): Float64Array {
  const out = new Float64Array(2 * N)
  const n = pts.length / 2
  if (n < 2) {
    const x = pts[0] ?? 0
    const y = pts[1] ?? 0
    for (let k = 0; k < N; k++) {
      out[2 * k] = x
      out[2 * k + 1] = y
    }
    return out
  }

  const cum = new Float64Array(n)
  for (let k = 1; k < n; k++) {
    cum[k] = cum[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1])
  }
  // 去重后相邻点必不相同，因此总长恒为正；长度为 0 只可能来自 NaN 输入，交给上游诊断
  const total = cum[n - 1] + Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1])

  for (let k = 0; k < N; k++) {
    const target = (k / N) * total
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (cum[mid] <= target) lo = mid
      else hi = mid - 1
    }
    const next = (lo + 1) % n
    const segLen = (lo === n - 1 ? total : cum[lo + 1]) - cum[lo]
    const u = segLen > 0 ? (target - cum[lo]) / segLen : 0
    out[2 * k] = pts[2 * lo] + (pts[2 * next] - pts[2 * lo]) * u
    out[2 * k + 1] = pts[2 * lo + 1] + (pts[2 * next + 1] - pts[2 * lo + 1]) * u
  }
  return out
}

export interface SampleOptions {
  /** 采样点数，2 的幂（D-2） */
  N: number
  /** 未闭合路径的闭合方式 */
  close_mode: 'join' | 'mirror'
  /** 只取最长子路径，忽略其余 */
  longest_only?: boolean
  /** 细分容差（用户坐标单位）；缺省 坐标跨度 / 2048 */
  tolerance?: number
}

export interface SampleResult {
  /** 交错点列 [x0,y0,...]，长度 2N，数学坐标系 */
  points: Float64Array
  N: number
  /** 数学坐标系包围盒 [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number]
  segments: number
  subpaths: number
  /** 是否真的首尾相连：镜像回扫恒为 true，直线闭合取决于首尾是否重合 */
  closed: boolean
  /** 首尾距离 / 包围盒长边，诊断阈值 0.15 */
  gap: number
  tolerance: number
}

/**
 * 若干条已展开的折线 → 最终采样点列。
 * 顺序：挑子路径 → 最近端点串接 → 补闭合 → 等弧长重采样 → 包围盒。
 */
export function assemble(parts: readonly Flattened[], opts: SampleOptions): SampleResult {
  if (!isPowerOfTwo(opts.N)) throw new Error(`N 必须为 2 的幂，收到 ${opts.N}`)

  const all = parts.flatMap((p) => p.subpaths)
  const segments = parts.reduce((n, p) => n + p.segments, 0)
  const tolerance = parts[0]?.tolerance ?? 0
  const points = new Float64Array(2 * opts.N)
  if (all.length === 0) {
    return { points, N: opts.N, bbox: [0, 0, 0, 0], segments, subpaths: 0, closed: false, gap: 0, tolerance }
  }

  const picked = opts.longest_only ? [all.reduce((a, b) => (pathLength(b) > pathLength(a) ? b : a))] : all
  let pts = dedupe(chain(picked))

  const n = pts.length / 2
  const gap = n >= 2 ? Math.hypot(pts[0] - pts[2 * n - 2], pts[1] - pts[2 * n - 1]) : 0
  const endsMeet = gap < 1e-6
  if (!endsMeet && opts.close_mode === 'mirror') {
    // 笔迹「画过去再画回来」：中间点只留一次，去重后自然闭合
    pts = dedupe([...pts, ...pts.slice(0, pts.length - 2).reverse()])
  }

  const out = resample(pts, opts.N)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let k = 0; k < opts.N; k++) {
    const x = out[2 * k]
    const y = out[2 * k + 1]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const longEdge = Math.max(maxX - minX, maxY - minY)

  return {
    points: out,
    N: opts.N,
    bbox: [minX, minY, maxX, maxY],
    segments,
    subpaths: picked.length,
    closed: opts.close_mode === 'mirror' ? true : endsMeet,
    gap: longEdge > 0 ? gap / longEdge : 0,
    tolerance,
  }
}

export function sample(d: string, opts: SampleOptions, matrix: Matrix = IDENTITY): SampleResult {
  return assemble([flatten(d, matrix, opts.tolerance)], opts)
}

/** 多条 path 各自带祖先变换，合成同一个场景（多条 path 的 SVG 走这里） */
export function samplePaths(paths: readonly { d: string; matrix: Matrix | null }[], opts: SampleOptions): SampleResult {
  return assemble(
    paths.map((p) => flatten(p.d, p.matrix ?? IDENTITY, opts.tolerance)),
    opts,
  )
}
