import { describe, expect, it } from 'vitest'
import { defaultTheta, type Coefficient, type Theta } from '../types.js'
import { buildScene, penAt } from '../epicycle.js'
import { renderFrame, renderOptions, type DrawTarget } from '../renderer.js'

type Op = [string, ...unknown[]]

const STYLE_KEYS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'] as const

/** 录制式 DrawTarget：把每次绘制调用与样式赋值都记成一条数据，供纯度比对 */
function makeTarget() {
  const ops: Op[] = []
  const style: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
  }
  const rec = (name: string, ...rest: unknown[]) => ops.push([name, ...rest])
  const target = {
    save: () => rec('save'),
    restore: () => rec('restore'),
    beginPath: () => rec('beginPath'),
    stroke: () => rec('stroke'),
    fill: () => rec('fill'),
    moveTo: (x: number, y: number) => rec('moveTo', x, y),
    lineTo: (x: number, y: number) => rec('lineTo', x, y),
    arc: (x: number, y: number, r: number, a0: number, a1: number) => rec('arc', x, y, r, a0, a1),
    fillRect: (x: number, y: number, w: number, h: number) => rec('fillRect', x, y, w, h),
  } as unknown as DrawTarget
  for (const key of STYLE_KEYS) {
    Object.defineProperty(target, key, {
      get: () => style[key],
      set: (v: unknown) => {
        style[key] = v
        rec('set', key, v)
      },
    })
  }
  return { target, ops }
}

const COEFFS: Coefficient[] = [
  { n: 0, re: 0.2, im: -0.1 },
  { n: 5, re: 1, im: 0 },
  { n: -3, re: 0, im: 0.5 },
  { n: 11, re: 0.25, im: 0 },
]
const theta = (o: Partial<Theta> = {}): Theta => ({ ...defaultTheta, ...o })
const SCENE = buildScene(COEFFS, theta({ K: 8 }))
const COUNT = (ops: Op[], name: string) => ops.filter((op) => op[0] === name).length

/** 浮点容差比对：同一数学结果走 t 与 t+1 两条求值路径时，末位舍入可差到 1e-13 量级 */
function sameFrame(a: Op[], b: Op[], label = '') {
  expect(b.length, label).toBe(a.length)
  a.forEach((op, i) => {
    const other = b[i]
    expect(other.length, `${label} op[${i}] 长度`).toBe(op.length)
    expect(other[0], `${label} op[${i}] 名称`).toBe(op[0])
    op.slice(1).forEach((v, j) => {
      const w = other[j + 1]
      if (typeof v === 'number' && typeof w === 'number') {
        expect(
          Math.abs(v - w) / Math.max(1, Math.abs(v)),
          `${label} op[${i}][${j + 1}]`,
        ).toBeLessThan(1e-11)
      } else {
        expect(w, `${label} op[${i}][${j + 1}]`).toBe(v)
      }
    })
  })
}

describe('V-6 渲染纯度', () => {
  it('同一 (场景, t, 选项) 两次调用产生完全相同的绘制序列', () => {
    const o = renderOptions(640, 480, 0.3)
    const a = makeTarget()
    const b = makeTarget()
    renderFrame(a.target, SCENE, 0.37, o)
    renderFrame(b.target, SCENE, 0.37, o)
    expect(a.ops).toEqual(b.ops)
    expect(JSON.stringify(a.ops)).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('周期严格为 1：t 与 t+1、t−1、t+2 的帧在浮点容差内逐条一致', () => {
    const o = renderOptions(300, 300, 0.4)
    const base = makeTarget()
    renderFrame(base.target, SCENE, 0.123, o)
    for (const t of [1.123, -0.877, 3.123]) {
      const other = makeTarget()
      renderFrame(other.target, SCENE, t, o)
      sameFrame(base.ops, other.ops, `t=${t}`)
    }
  })

  it('save/restore 严格成对，各一次；轨迹为 0 时 3 个 beginPath，有轨迹时 4 个', () => {
    const plain = makeTarget()
    renderFrame(plain.target, SCENE, 0.1, renderOptions(640, 480, 0))
    expect(COUNT(plain.ops, 'save')).toBe(1)
    expect(COUNT(plain.ops, 'restore')).toBe(1)
    expect(COUNT(plain.ops, 'beginPath')).toBe(3)

    const trailed = makeTarget()
    renderFrame(trailed.target, SCENE, 0.1, renderOptions(640, 480, 0.2))
    expect(COUNT(trailed.ops, 'beginPath')).toBe(4)
  })

  it('circles=all：K 个圆链 + 笔尖，K 条矢量，2 次 stroke', () => {
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.1, renderOptions(640, 480, 0))
    expect(COUNT(ops, 'arc')).toBe(SCENE.terms.length + 1)
    expect(COUNT(ops, 'moveTo')).toBe(SCENE.terms.length)
    expect(COUNT(ops, 'lineTo')).toBe(SCENE.terms.length)
    expect(COUNT(ops, 'stroke')).toBe(2)
    expect(COUNT(ops, 'fill')).toBe(1)
  })

  it('circles=none：只剩笔尖一个圆，无矢量', () => {
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.1, { ...renderOptions(640, 480, 0), circles: 'none' })
    expect(COUNT(ops, 'arc')).toBe(1)
    expect(COUNT(ops, 'moveTo')).toBe(0)
    expect(COUNT(ops, 'lineTo')).toBe(0)
  })

  it('圆链与矢量可分别关闭', () => {
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.1, { ...renderOptions(640, 480, 0), circleColor: '', vectorColor: '' })
    expect(COUNT(ops, 'arc')).toBe(1)
    expect(COUNT(ops, 'stroke')).toBe(0)
  })

  it('背景为 null 时不铺底，否则铺满画幅', () => {
    const none = makeTarget()
    renderFrame(none.target, SCENE, 0.1, { ...renderOptions(640, 480, 0), background: null })
    expect(COUNT(none.ops, 'fillRect')).toBe(0)

    const filled = makeTarget()
    renderFrame(filled.target, SCENE, 0.1, renderOptions(640, 480, 0))
    expect(filled.ops.filter((op) => op[0] === 'fillRect')).toEqual([['fillRect', 0, 0, 640, 480]])
  })

  it('trail 决定轨迹采样点数，0 表示不画轨迹', () => {
    const trail = makeTarget()
    renderFrame(trail.target, SCENE, 0.2, {
      ...renderOptions(640, 480, 0.5),
      circles: 'none',
      trailSamples: 240,
    })
    const segs = trail.ops.filter((op) => op[0] === 'moveTo' || op[0] === 'lineTo')
    expect(segs.length).toBe(241)
    expect(segs[0][0]).toBe('moveTo')

    const zero = makeTarget()
    renderFrame(zero.target, SCENE, 0.2, { ...renderOptions(640, 480, 0), circles: 'none' })
    expect(zero.ops.filter((op: Op) => op[0] === 'moveTo' || op[0] === 'lineTo').length).toBe(0)

    const tiny = makeTarget()
    renderFrame(tiny.target, SCENE, 0.2, { ...renderOptions(640, 480, 0.5), circles: 'none', trailSamples: 0 })
    // 采样数下限为 2，含端点共 3 个点
    expect(tiny.ops.filter((op: Op) => op[0] === 'moveTo' || op[0] === 'lineTo').length).toBe(3)
  })

  it('笔尖位置来自 penAt，并经过 px/py 映射', () => {
    const o = renderOptions(400, 300, 0)
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.37, o)
    const arcs = ops.filter((op) => op[0] === 'arc') as [string, number, number, number, number, number][]
    const [, x, y, r] = arcs[arcs.length - 1]
    const p = penAt(SCENE, 0.37)
    const R = Math.min(o.width, o.height) * 0.5 * SCENE.viewScale
    expect(x).toBe(o.width / 2 + p.re * R)
    expect(y).toBe(o.height / 2 - p.im * R)
    expect(r).toBe(o.penRadius)
  })
})

describe('renderOptions', () => {
  it('给出可预期的默认值', () => {
    const o = renderOptions(100, 100)
    expect(o.width).toBe(100)
    expect(o.height).toBe(100)
    expect(o.trail).toBe(0)
    expect(o.circles).toBe('all')
    expect(o.background).toBe('#FBFAF7')
    expect(o.trailSamples).toBeGreaterThan(0)
    expect(o.penRadius).toBeGreaterThan(0)
  })
})
