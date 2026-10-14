import { describe, expect, it } from 'vitest'
import { MIN_POINT_STEP, shouldAppend, strokesToPath } from '../strokes.js'
import { sample } from '../sampler.js'

describe('shouldAppend', () => {
  it('空笔画第一个点一律收下', () => {
    expect(shouldAppend([], 10, 20)).toBe(true)
    expect(shouldAppend([], NaN, 20)).toBe(false) // 免检的只是点距，不是有限性
  })

  it('比最小点距更近的点丢掉，够远的收下', () => {
    const stroke = [0, 0]
    expect(shouldAppend(stroke, MIN_POINT_STEP / 2, 0)).toBe(false)
    expect(shouldAppend(stroke, MIN_POINT_STEP, 0)).toBe(true)
    expect(shouldAppend(stroke, -MIN_POINT_STEP, 0)).toBe(true)
    expect(shouldAppend([0, 0, 3, 4], 3, 4.4)).toBe(false) // 距上一个点 0.4
    expect(shouldAppend([0, 0, 3, 4], 3, 5)).toBe(true)
  })

  it('非有限值一律拒收：脏坐标不该混进 path', () => {
    expect(shouldAppend([], NaN, 0)).toBe(false)
    expect(shouldAppend([], 0, Infinity)).toBe(false)
    expect(shouldAppend([0, 0], 1, NaN)).toBe(false)
  })
})

describe('strokesToPath', () => {
  it('每笔一条子路径，坐标保留两位小数', () => {
    expect(strokesToPath([[0, 0, 10.126, 4.444]])).toBe('M 0 0 L 10.13 4.44')
    expect(strokesToPath([[0, 0, 1, 1], [2, 2, 3, 3]])).toBe('M 0 0 L 1 1 M 2 2 L 3 3')
  })

  it('只有一个点的笔画丢掉；全丢掉就是空串', () => {
    expect(strokesToPath([[5, 5]])).toBe('')
    expect(strokesToPath([[5, 5], [0, 0, 1, 1]])).toBe('M 0 0 L 1 1')
    expect(strokesToPath([])).toBe('')
  })

  it('同样输入必得同样文本（资产指纹依赖这一步可复现）', () => {
    const strokes = [[0, 0, 3.3333, 4.4444], [9.999, 1]]
    expect(strokesToPath(strokes)).toBe(strokesToPath(strokes))
  })

  it('产出的 path 数据能被采样器直接接住——与上传走同一条路', () => {
    const box = strokesToPath([[0, 0, 10, 0, 10, 10, 0, 10, 0, 0]])
    const result = sample(box, { N: 64, close_mode: 'join' })
    expect(result.closed).toBe(true)
    expect(result.subpaths).toBe(1)
    expect(result.segments).toBe(4)
    // y 在采样时翻成数学坐标，(0,0)-(10,10) 的框就成了 y∈[-10,0]
    const [minX, minY, maxX, maxY] = result.bbox
    expect(minX).toBeCloseTo(0, 9)
    expect(minY).toBeCloseTo(-10, 9)
    expect(maxX).toBeCloseTo(10, 9)
    expect(maxY).toBeCloseTo(0, 9)
  })

  it('多笔各自是一条子路径，采样器按最近端点串接', () => {
    const result = sample(strokesToPath([[0, 0, 10, 0], [10, 0.1, 10, 10]]), { N: 64, close_mode: 'join' })
    expect(result.subpaths).toBe(2)
  })
})
