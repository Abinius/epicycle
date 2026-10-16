import { IDENTITY, type Matrix } from './sampler.js'

/**
 * SVG 文本 → path 列表（技术文档 §2.1 的第 1 步）。
 *
 * 纯文本扫描，不用 DOMParser：core/ 不碰浏览器 API，且用户也可能直接粘贴一段
 * path 数据（PRD 的帮助文档教的正是"导出单一路径 SVG"）。扫描器尊重属性引号，
 * 因此属性值里出现 `>` 不会被截断。
 */

export interface ExtractedPath {
  d: string
  /** path 及其祖先累加的变换；没有变换时为 null */
  matrix: Matrix | null
}

interface Tag {
  name: string
  closing: boolean
  selfClosing: boolean
  attrs: Map<string, string>
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

function parseAttrs(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of text.matchAll(ATTR_RE)) out.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
  return out
}

function* scanTags(svg: string): Generator<Tag> {
  let i = 0
  while (i < svg.length) {
    const lt = svg.indexOf('<', i)
    if (lt < 0) return
    if (svg.startsWith('<!--', lt)) {
      const end = svg.indexOf('-->', lt)
      i = end < 0 ? svg.length : end + 3
      continue
    }
    if (svg.startsWith('<!', lt) || svg.startsWith('<?', lt)) {
      const end = svg.indexOf('>', lt)
      i = end < 0 ? svg.length : end + 1
      continue
    }
    let j = lt + 1
    let quote = ''
    while (j < svg.length) {
      const ch = svg[j]
      if (quote) {
        if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        break
      }
      j++
    }
    const raw = svg.slice(lt + 1, j)
    const closing = raw.startsWith('/')
    const body = closing ? raw.slice(1) : raw
    const nameEnd = body.search(/[\s/]/)
    const name = (nameEnd < 0 ? body : body.slice(0, nameEnd)).toLowerCase()
    yield {
      name,
      closing,
      selfClosing: !closing && body.trimEnd().endsWith('/'),
      attrs: parseAttrs(nameEnd < 0 ? '' : body.slice(nameEnd)),
    }
    i = j + 1
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, ref: string) => {
    if (ref.startsWith('#')) {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : all
    }
    return ENTITIES[ref.toLowerCase()] ?? all
  })
}

export function multiply(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ]
}

const NUM_RE = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g

function stepOf(name: string, v: number[]): Matrix | null {
  const rad = (deg: number) => (deg * Math.PI) / 180
  switch (name) {
    case 'matrix':
      return v.length >= 6 ? [v[0], v[1], v[2], v[3], v[4], v[5]] : null
    case 'translate':
      return [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]
    case 'scale':
      return [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]
    case 'rotate': {
      const cos = Math.cos(rad(v[0] ?? 0))
      const sin = Math.sin(rad(v[0] ?? 0))
      const rot: Matrix = [cos, sin, -sin, cos, 0, 0]
      // rotate(a cx cy) = translate(cx,cy) · rotate(a) · translate(−cx,−cy)
      return v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], rot), [1, 0, 0, 1, -v[1], -v[2]]) : rot
    }
    case 'skewx':
      return [1, 0, Math.tan(rad(v[0] ?? 0)), 1, 0, 0]
    case 'skewy':
      return [1, Math.tan(rad(v[0] ?? 0)), 0, 1, 0, 0]
    default:
      return null
  }
}

/** `translate(10) scale(2)` → 4×…… 合成矩阵；认不出的函数忽略，没有一项生效时返回 null */
export function matrixFromTransform(text: string): Matrix | null {
  let m: Matrix = IDENTITY
  let found = false
  for (const call of text.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const step = stepOf(call[1].toLowerCase(), (call[2].match(NUM_RE) ?? []).map(Number))
    if (!step) continue
    m = multiply(m, step)
    found = true
  }
  return found ? m : null
}

/**
 * 只供引用的容器：内容不直接画在画面上（要靠 use / clip-path / mask 引用），一律不进形状。
 * 这里不解析这些引用，收进来只会得到位置错误的几何。
 */
const REFERENCED = new Set(['defs', 'symbol', 'marker', 'clippath', 'mask'])

/**
 * 抽出所有 path 的 d 与它所在祖先链上的累加变换。
 *
 * 只收「会画出来」的 path：引用容器里的、display:none 的、opacity:0 的、visibility:hidden 的
 * 都跳过——把隐藏几何算进形状会让上传的图形凭空多出几笔。stroke/fill 归 CSS 继承管，
 * 这里不做绘制判定（判错会丢掉真正可见的几何，比多收一笔更糟）。
 */
export function extractPaths(svg: string): ExtractedPath[] {
  const out: ExtractedPath[] = []
  /** 每个未闭合元素压一帧，闭合时精确还原——否则非容器的闭合标签会把祖先的变换提前弹掉 */
  const stack: Array<{ m: Matrix; hidden: boolean; visHidden: boolean }> = []
  let current: Matrix = IDENTITY
  /** display:none / 引用容器 / opacity:0：整棵子树都不画，后代无法撤销 */
  let hidden = false
  /** visibility:hidden：可被后代的 visibility:visible 撤销 */
  let visHidden = false

  for (const tag of scanTags(svg)) {
    if (tag.closing) {
      const prev = stack.pop()
      if (prev) {
        current = prev.m
        hidden = prev.hidden
        visHidden = prev.visHidden
      }
      continue
    }
    const text = tag.attrs.get('transform')
    const step = text ? matrixFromTransform(text) : null
    const next = step ? multiply(current, step) : current

    const vis = tag.attrs.get('visibility')
    const hereHidden =
      hidden ||
      REFERENCED.has(tag.name) ||
      tag.attrs.get('display') === 'none' ||
      parseFloat(tag.attrs.get('opacity') ?? '1') === 0
    const hereVisHidden = vis === 'visible' ? false : visHidden || vis === 'hidden'

    if (tag.name === 'path' && !hereHidden && !hereVisHidden) {
      const d = decodeEntities(tag.attrs.get('d') ?? '')
      if (d.trim()) out.push({ d, matrix: next === IDENTITY ? null : next })
    }
    if (!tag.selfClosing) {
      stack.push({ m: current, hidden, visHidden })
      current = next
      hidden = hereHidden
      visHidden = hereVisHidden
    }
  }
  // 直接粘贴一段 path 数据（PRD 帮助文档教的用法）也能用
  if (out.length === 0 && !svg.includes('<')) {
    const d = svg.trim()
    if (/^[MmZz]/.test(d)) out.push({ d, matrix: null })
  }
  return out
}

const FORBIDDEN_TAGS = ['image', 'foreignobject', 'script', 'iframe', 'embed', 'object']

/** 诊断 #1：含无法参与傅里叶变换的元素或外链。返回命中的元素名（去重保序） */
export function findForbidden(svg: string): string[] {
  const hits: string[] = []
  for (const tag of scanTags(svg)) {
    if (tag.closing) continue
    let hit: string | null = null
    if (FORBIDDEN_TAGS.includes(tag.name)) hit = tag.name
    const href = tag.attrs.get('href') ?? tag.attrs.get('xlink:href')
    if (href && /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('data:')) hit = `${tag.name} 外链`
    if (hit && !hits.includes(hit)) hits.push(hit)
  }
  return hits
}

/** 诊断 #2：元素（非闭合标签）计数 */
export function countTags(svg: string): number {
  let n = 0
  for (const tag of scanTags(svg)) {
    if (!tag.closing) n++
  }
  return n
}
