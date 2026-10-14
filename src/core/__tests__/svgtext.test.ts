import { describe, expect, it } from 'vitest'
import { flatten } from '../sampler.js'
import { countTags, extractPaths, findForbidden, matrixFromTransform, multiply } from '../svgtext.js'

/** 用采样器验证变换的实际效果：返回展开后的点列（数学坐标系，四舍五入到 1e-9 以避开三角函数的末位噪声） */
function applied(d: string, transform: string): number[] {
  const m = matrixFromTransform(transform)
  expect(m, transform).not.toBeNull()
  return Array.from(flatten(d, m!).subpaths[0]).map((v) => Number((v + 0).toFixed(9)))
}

describe('matrixFromTransform', () => {
  it('translate / scale / matrix 直接对应 SVG 语义', () => {
    expect(applied('M 0 0', 'translate(3 4)')).toEqual([3, -4])
    expect(applied('M 1 0', 'scale(2)')).toEqual([2, 0])
    expect(applied('M 0 0', 'matrix(1 0 0 1 3 4)')).toEqual([3, -4])
  })

  it('列表按左到右相乘，即右侧先作用在点上', () => {
    // 先 scale 到 2，再 translate 10
    expect(applied('M 1 0', 'translate(10 0) scale(2)')).toEqual([12, 0])
  })

  it('rotate 支持绕原点与绕指定点', () => {
    expect(applied('M 1 0', 'rotate(90)')).toEqual([0, -1])
    expect(applied('M 1 0', 'rotate(90 1 0)')).toEqual([1, 0])
  })

  it('skewX/skewY 用正切', () => {
    expect(applied('M 0 1', 'skewX(45)')).toEqual([1, -1])
    expect(applied('M 1 0', 'skewY(45)')).toEqual([1, -1])
  })

  it('认不出的函数忽略；一个都没生效返回 null', () => {
    expect(matrixFromTransform('foo(1)')).toBe(null)
    expect(matrixFromTransform('translate(5) bar(1,2)')).toEqual([1, 0, 0, 1, 5, 0])
    expect(matrixFromTransform('')).toBe(null)
  })

  it('multiply 与恒等元一致', () => {
    const id = [1, 0, 0, 1, 0, 0] as const
    expect(multiply([...id], [2, 0, 0, 3, 1, 1])).toEqual([2, 0, 0, 3, 1, 1])
    expect(multiply([2, 0, 0, 3, 1, 1], [...id])).toEqual([2, 0, 0, 3, 1, 1])
  })
})

describe('extractPaths', () => {
  it('抽出 path 的 d，无变换时 matrix 为 null', () => {
    expect(extractPaths('<svg><path d="M0 0 L1 1"/></svg>')).toEqual([{ d: 'M0 0 L1 1', matrix: null }])
  })

  it('单引号属性与属性值里的 > 都不影响解析', () => {
    expect(extractPaths("<path d='M0 0 L1 1' data-note='a > b'/>")[0].d).toBe('M0 0 L1 1')
    expect(extractPaths('<path data-note="a > b" d="M2 2"/>')[0].d).toBe('M2 2')
  })

  it('跳过注释、声明与 DOCTYPE', () => {
    const svg = '<?xml version="1.0"?><!-- <path d="M9 9"/> --><!DOCTYPE svg><path d="M0 0"/>'
    expect(extractPaths(svg).map((p) => p.d)).toEqual(['M0 0'])
  })

  it('祖先分组的变换逐层累加，闭合后还原', () => {
    const svg = '<g transform="translate(10 0)"><g transform="scale(2)"><path d="M1 0"/></g></g>'
    const [p] = extractPaths(svg)
    expect(p.matrix).toEqual([2, 0, 0, 2, 10, 0])
    expect(Array.from(flatten(p.d, p.matrix!).subpaths[0]).map((v) => v + 0)).toEqual([12, 0])
  })

  it('分组外的 path 不受分组变换影响', () => {
    const svg = '<g transform="scale(2)"><path d="M1 0"/></g><path d="M1 0"/>'
    const paths = extractPaths(svg)
    expect(paths).toHaveLength(2)
    expect(paths[0].matrix).toEqual([2, 0, 0, 2, 0, 0])
    expect(paths[1].matrix).toBe(null)
  })

  it('解码 XML 实体', () => {
    expect(extractPaths('<path d="M 0 0&#10;L 1 1"/>')[0].d).toBe('M 0 0\nL 1 1')
    expect(extractPaths('<path d="M 0 0 &amp; L 1 1"/>')[0].d).toBe('M 0 0 & L 1 1')
  })

  it('认不出的实体原样保留', () => {
    expect(extractPaths('<path d="M 0 0 &copy; L 1 1"/>')[0].d).toBe('M 0 0 &copy; L 1 1')
  })

  it('没有标签时把整段文本当作 path 数据', () => {
    expect(extractPaths('  M 0 0 L 1 1  ')).toEqual([{ d: 'M 0 0 L 1 1', matrix: null }])
    expect(extractPaths('这是一段说明文字')).toEqual([])
  })

  it('没有 path 元素时返回空数组', () => {
    expect(extractPaths('<svg><rect width="1" height="1"/></svg>')).toEqual([])
  })
})

describe('findForbidden / countTags', () => {
  it('命中无法参与变换的元素与外链', () => {
    expect(findForbidden('<svg><image href="a.png"/></svg>')).toEqual(['image'])
    expect(findForbidden('<svg><script>x</script></svg>')).toEqual(['script'])
    expect(findForbidden('<svg><use href="http://a/b.svg#x"/></svg>')).toEqual(['use 外链'])
    expect(findForbidden('<svg><use href="#local"/></svg>')).toEqual([])
    expect(findForbidden('<svg><path d="M0 0"/></svg>')).toEqual([])
  })

  it('data URI 不算外链', () => {
    expect(findForbidden('<image href="data:image/png;base64,AAA"/>')).toEqual(['image'])
  })

  it('统计元素个数，不算闭合标签', () => {
    expect(countTags('<svg><g><path d="M0 0"/><path d="M1 1"/></g></svg>')).toBe(4)
  })
})
