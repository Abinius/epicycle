import { describe, expect, it } from 'vitest'
import { defaultTheta, type Coefficient, type Theta } from '../types.js'
import { buildScene, penAt } from '../epicycle.js'
import { renderFrame, renderOptions, type RenderOptions } from '../renderer.js'
import { makeTarget, type Op } from './recordingTarget.js'

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

  it('每帧先清屏一次：目标被复用时前一帧不留残影（透明导出的前提）', () => {
    for (const background of [null, '#FBFAF7'] as Array<string | null>) {
      const { target, ops } = makeTarget()
      renderFrame(target, SCENE, 0.1, { ...renderOptions(640, 480, 0), background })
      expect(ops[0], `background=${background}`).toEqual(['clearRect', 0, 0, 640, 480])
      expect(COUNT(ops, 'clearRect')).toBe(1)
    }
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

  it('笔尖位置来自 penAt，并经过 px/py 映射（以质心为中心）', () => {
    const o = renderOptions(400, 300, 0)
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.37, o)
    const arcs = ops.filter((op) => op[0] === 'arc') as [string, number, number, number, number, number][]
    const [, x, y, r] = arcs[arcs.length - 1]
    const p = penAt(SCENE, 0.37)
    const R = Math.min(o.width, o.height) * 0.5 * SCENE.viewScale
    expect(x).toBe(o.width / 2 + (p.re - SCENE.center.re) * R)
    expect(y).toBe(o.height / 2 - (p.im - SCENE.center.im) * R)
    expect(r).toBe(o.penRadius)
  })

  it('质心偏得再远，图形也落在画布内', () => {
    // c_0 是形状自己的位置（上传的 SVG 几乎都不在原点）。以原点为中心时，
    // viewScale 的「笔尖不出单位半径」保证会失效，图形被推出画布。
    const off: Coefficient[] = [
      { n: 0, re: 30, im: -20 },
      { n: 1, re: 1, im: 0 },
      { n: -1, re: 1, im: 0 },
    ]
    const o = renderOptions(400, 300, 0.5)
    const { target, ops } = makeTarget()
    renderFrame(target, buildScene(off, theta({ K: 4 })), 0.13, o)
    // 一根柱都不该画到「质心为中心、0.8 单位半径」之外
    const limit = Math.min(o.width, o.height) * 0.5 * 0.8 + 1e-9
    const drawn = ops.filter((op) => op[0] === 'moveTo' || op[0] === 'lineTo' || op[0] === 'arc')
    expect(drawn.length).toBeGreaterThan(0)
    for (const op of drawn) {
      expect(Math.abs((op[1] as number) - o.width / 2), `${op[0]} x`).toBeLessThanOrEqual(limit)
      expect(Math.abs((op[2] as number) - o.height / 2), `${op[0]} y`).toBeLessThanOrEqual(limit)
    }
  })
})

describe('项检查（highlight）', () => {
  const option = (highlight: number | null) => ({ ...renderOptions(640, 480, 0), highlight })

  it('highlight=1：只走前 2 项的圆链与矢量，并把这一项的圆描一遍', () => {
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.1, option(1))
    expect(COUNT(ops, 'arc')).toBe(2 + 1 + 1) // 2 个圆 + 高亮圆 + 笔尖
    expect(COUNT(ops, 'moveTo')).toBe(2)
    expect(COUNT(ops, 'lineTo')).toBe(2)
    expect(COUNT(ops, 'stroke')).toBe(3) // 圆、矢量、高亮
    expect(COUNT(ops, 'fill')).toBe(1)

    const widths = ops.filter((op) => op[0] === 'set' && op[1] === 'lineWidth').map((op) => op[2])
    expect(widths).toEqual([1, 1, 2])
    const styles = ops.filter((op) => op[0] === 'set' && op[1] === 'strokeStyle').map((op) => op[2])
    expect(styles).toEqual(['rgba(63,107,79,0.22)', 'rgba(63,107,79,0.55)', '#C2694F'])
  })

  it('highlight=0：只剩第一个圆', () => {
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.1, option(0))
    expect(COUNT(ops, 'arc')).toBe(1 + 1 + 1)
    expect(COUNT(ops, 'moveTo')).toBe(1)
    expect(COUNT(ops, 'lineTo')).toBe(1)
  })

  it('越界的下标收敛到边界：过大的走满，负数收敛到第 0 项', () => {
    const big = makeTarget()
    renderFrame(big.target, SCENE, 0.1, { ...renderOptions(640, 480, 0), highlight: 99 })
    const baseline = makeTarget()
    renderFrame(baseline.target, SCENE, 0.1, renderOptions(640, 480, 0))
    // 圆链与矢量与未检查时一致，只多描了一次高亮圆
    expect(COUNT(big.ops, 'arc')).toBe(COUNT(baseline.ops, 'arc') + 1)
    expect(COUNT(big.ops, 'moveTo')).toBe(COUNT(baseline.ops, 'moveTo'))

    const negative = makeTarget()
    renderFrame(negative.target, SCENE, 0.1, { ...renderOptions(640, 480, 0), highlight: -3 })
    const first = makeTarget()
    renderFrame(first.target, SCENE, 0.1, { ...renderOptions(640, 480, 0), highlight: 0 })
    sameFrame(negative.ops, first.ops, '负下标')
  })

  it('笔尖与轨迹同样只走到被点选的项', () => {
    const o: RenderOptions = { ...renderOptions(300, 300, 0.5), circles: 'none', highlight: 1, trailSamples: 40 }
    const { target, ops } = makeTarget()
    renderFrame(target, SCENE, 0.2, o)

    const R = Math.min(o.width, o.height) * 0.5 * SCENE.viewScale
    const segs = ops.filter((op) => op[0] === 'moveTo' || op[0] === 'lineTo') as [string, number, number][]
    expect(segs.length).toBe(41)
    for (let j = 0; j <= 40; j++) {
      const p = penAt(SCENE, 0.2 - 0.5 * (1 - j / 40), 2)
      expect(segs[j][1], `轨迹点 ${j} x`).toBeCloseTo(o.width / 2 + (p.re - SCENE.center.re) * R, 10)
      expect(segs[j][2], `轨迹点 ${j} y`).toBeCloseTo(o.height / 2 - (p.im - SCENE.center.im) * R, 10)
    }

    // 截断确实改变了笔尖：全链条的位置不同
    expect(penAt(SCENE, 0.2, 2)).not.toEqual(penAt(SCENE, 0.2))
  })

  it('空场景加 highlight 不崩溃，只剩笔尖', () => {
    const empty = buildScene([{ n: 0, re: 0.1, im: 0 }], theta())
    expect(empty.terms).toEqual([])
    const { target, ops } = makeTarget()
    renderFrame(target, empty, 0.1, option(0))
    expect(COUNT(ops, 'arc')).toBe(1) // 只有笔尖，没有圆链也没有高亮圆
    expect(COUNT(ops, 'moveTo')).toBe(0)
    expect(COUNT(ops, 'lineTo')).toBe(0)
    expect(JSON.stringify(ops)).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('检查模式仍是纯函数且周期严格为 1', () => {
    const o = option(1)
    const a = makeTarget()
    renderFrame(a.target, SCENE, 0.31, o)
    expect(JSON.stringify(a.ops)).not.toMatch(/NaN|Infinity|undefined/)
    for (const t of [0.31, 1.31, -0.69]) {
      const b = makeTarget()
      renderFrame(b.target, SCENE, t, o)
      sameFrame(a.ops, b.ops, `t=${t}`)
    }
  })
})

describe('renderOptions', () => {
  it('给出可预期的默认值', () => {
    const o = renderOptions(100, 100)
    expect(o.width).toBe(100)
    expect(o.height).toBe(100)
    expect(o.trail).toBe(0)
    expect(o.circles).toBe('all')
    expect(o.highlight).toBe(null)
    expect(o.background).toBe('#FBFAF7')
    expect(o.trailSamples).toBeGreaterThan(0)
    expect(o.penRadius).toBeGreaterThan(0)
  })
})
