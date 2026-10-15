import { describe, expect, it } from 'vitest'
import {
  Q_RANGE,
  Q_STEP,
  SCHEMA,
  SCHEMA_MAJOR,
  base64UrlDecode,
  base64UrlEncode,
  boundsOf,
  checksum,
  createAsset,
  exportJson,
  fnv1a,
  fromShortCode,
  parseAsset,
  toShortCode,
  validateAsset,
} from '../asset.js'
import { ASSET_DIAGNOSTICS } from '../diagnostic.js'
import { VIEW_BUDGET, type Coefficient, type FourierAsset } from '../types.js'

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

describe('boundsOf', () => {
  const SPECTRUM: Coefficient[] = [
    { n: 0, re: 2, im: -1 },
    { n: 1, re: 3, im: 4 }, // |c| = 5
    { n: -1, re: 0, im: 1 }, // |c| = 1
  ]

  it('质心取 c₀，radius 取最远采样点，view_scale 与渲染共用一个预算常量', () => {
    const b = boundsOf(SPECTRUM, Float64Array.from([2, -1, 6, -1, 2, 3]))
    expect(b.center).toEqual([2, -1])
    expect(b.radius).toBe(4)
    expect(b.orig_bbox).toEqual([2, -1, 6, 3])
    expect(b.view_scale).toBeCloseTo(VIEW_BUDGET / 6, 12)
  })

  it('没有采样点时给零，不产出 Infinity（JSON 会把它写成 null）', () => {
    const b = boundsOf(SPECTRUM, new Float64Array(0))
    expect(b.orig_bbox).toEqual([0, 0, 0, 0])
    expect(b.radius).toBe(0)
    expect(b.center).toEqual([2, -1])
  })

  it('没有 n=0 项时质心落在原点', () => {
    const b = boundsOf([{ n: 2, re: 1, im: 0 }], Float64Array.from([1, 1]))
    expect(b.center).toEqual([0, 0])
    expect(b.radius).toBeCloseTo(Math.SQRT2, 12)
    expect(b.view_scale).toBeCloseTo(VIEW_BUDGET, 12)
  })
})

function makeAsset(): FourierAsset {
  return createAsset({
    name: '心形',
    createdAt: '2026-10-15T00:00:00.000Z',
    source: { type: 'preset', preset: 'heart', subpaths: 1 },
    sampling: { N: 1024, closed: true, close_mode: 'join', subdivide_eps: 0 },
    bounds: boundsOf(COEFFS, Float64Array.from([1, 0, 0, 1, -1, 0])),
    coeffs: COEFFS,
    dftMs: 3.5,
  })
}

describe('导出与导入', () => {
  it('JSON 往返后逐字段一致，再导出逐字节相同', () => {
    const a = makeAsset()
    const parsed = parseAsset(exportJson(a))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.asset).toEqual(a)
    // M2 出口标准「冻结 → 清空 → 重新导入 → 逐帧一致」全靠这一条：文本一模一样，
    // 系数就一模一样，纯函数渲染出的每一帧自然也一模一样
    expect(exportJson(parsed.asset)).toBe(exportJson(a))
  })

  it('读不成 JSON、或 JSON 里不是对象，都按「不是资产文件」挡下', () => {
    for (const text of ['', 'not json', '[]', 'null', '42', '"x"']) {
      const r = parseAsset(text)
      expect(r.ok, text).toBe(false)
      if (!r.ok) expect(r.diagnostic.id).toBe(ASSET_DIAGNOSTICS.importUnreadable.id)
    }
  })

  it('主版本更高的资产明确拒绝，不猜着降级', () => {
    const r = validateAsset({ ...makeAsset(), schema: `fourierboard/asset@${SCHEMA_MAJOR + 1}.0` })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnostic.id).toBe(ASSET_DIAGNOSTICS.importMismatch.id)
  })

  it('次要版本更高的按本版本读入，并归一到本版本的 schema', () => {
    const r = validateAsset({ ...makeAsset(), schema: 'fourierboard/asset@1.7' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.schema).toBe(SCHEMA)
  })

  it('指纹不符即拒收：内容被动过就不再是同一份资产', () => {
    const a = makeAsset()
    const tampered = { ...a, coeffs: a.coeffs.map((c, i) => (i === 0 ? { ...c, re: c.re + 1 } : c)) }
    const r = validateAsset(tampered)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnostic.id).toBe(ASSET_DIAGNOSTICS.importMismatch.id)
  })

  it('缺字段、类型不对、枚举越界的一律挡下', () => {
    const a = makeAsset()
    const broken: unknown[] = [
      { ...a, id: 42 },
      { ...a, name: undefined },
      { ...a, coeffs: [] },
      { ...a, coeffs: [{ n: 0, re: 1, im: 'x' }] },
      { ...a, coeffs: [{ n: 0, re: 1 }] },
      { ...a, coeffs: [{ n: 0, re: Number.NaN, im: 0 }] },
      { ...a, sampling: { ...a.sampling, close_mode: 'zip' } },
      { ...a, sampling: { ...a.sampling, closed: 'yes' } },
      { ...a, bounds: { ...a.bounds, center: [1] } },
      { ...a, bounds: { ...a.bounds, orig_bbox: [1, 2, 3, Infinity] } },
      { ...a, source: { type: 'png' } },
      { ...a, source: { type: 'svg', bytes: 'x' } },
      { ...a, meta: { ...a.meta, dft_ms: 'fast' } },
      { ...a, schema: 'fourierboard/shape@1.0' },
    ]
    for (const v of broken) expect(validateAsset(v).ok, JSON.stringify(v).slice(0, 60)).toBe(false)
  })

  it('负零不破坏往返：JSON 没有 −0，指纹必须认得出还是同一组系数', () => {
    expect(checksum([{ n: 1, re: -0, im: 0 }])).toBe(checksum([{ n: 1, re: 0, im: 0 }]))
    const withNegZero: Coefficient[] = [{ n: 1, re: -0, im: 0 }, { n: -1, re: 0, im: -0 }]
    expect(checksum(JSON.parse(JSON.stringify(withNegZero)) as Coefficient[])).toBe(checksum(withNegZero))
  })

  it('可选的来源字段缺省时不会凭空补出', () => {
    const r = validateAsset({ ...makeAsset(), source: { type: 'formula' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.source).toEqual({ type: 'formula' })
  })

  it('shared 源类型（分享链接冻结而来）同样往返', () => {
    const r = validateAsset({ ...makeAsset(), source: { type: 'shared' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.source).toEqual({ type: 'shared' })
  })

  it('morph 源类型（过渡中间态冻结而来）同样往返', () => {
    const r = validateAsset({ ...makeAsset(), source: { type: 'morph' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.source).toEqual({ type: 'morph' })
  })

  it('derived_from（模式 Y 派生来源）往返保留', () => {
    const r = validateAsset({
      ...makeAsset(),
      source: { type: 'preset', preset: 'heart', derived_from: 'fa_abc123' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.asset.source).toEqual({ type: 'preset', preset: 'heart', derived_from: 'fa_abc123' })
  })

  it('derived_from 类型不对即挡下', () => {
    expect(validateAsset({ ...makeAsset(), source: { type: 'preset', derived_from: 42 } }).ok).toBe(false)
  })
})
