import { dft } from './dft.js'
import { formulas, formulaNames, type FormulaId } from './formulas.js'
import { sample, type SampleOptions } from './sampler.js'
import type { Coefficient } from './types.js'

/**
 * 预置示例（PRD A10）。六个预置共用同一条「采样 → DFT」管线：
 * 圆 / 正方形 / 心形 / 星形走解析生成器（频率带限，适合教学），
 * 音符 / 签名是内建 SVG 路径，与上传文件走同一个采样器，没有第二条代码路径。
 */

export type PathPresetId = 'note' | 'signature'

export type PresetId = FormulaId | PathPresetId

export const PRESET_NAMES: Record<PresetId, string> = {
  ...formulaNames,
  note: '音符',
  signature: '签名',
}

/** 选择器的展示顺序 */
export const PRESET_IDS: readonly PresetId[] = ['circle', 'square', 'heart', 'star', 'note', 'signature']

/** 预置的采样点数：与上传默认一致，2 的幂（决策 D-2） */
export const PRESET_N = 1024

/**
 * 内建路径预置。d 是 SVG path 数据（y 向下，采样器负责翻成数学坐标）。
 *
 * 音符：符干左缘与符头椭圆在 x=46 处相切，整条轮廓天然闭合，用直线闭合即可。
 * 签名：开放笔迹，首尾相隔很远；用镜像回扫（笔迹画过去再画回来），
 * 用 join 会画出一条横贯整个字形的连线。
 */
export const PATH_PRESETS: Record<PathPresetId, { d: string; close_mode: SampleOptions['close_mode'] }> = {
  note: {
    d: 'M 46 26 L 49.6 26 L 49.6 106 L 46 106 A 16 11 0 0 1 14 106 A 16 11 0 0 1 46 106 Z',
    close_mode: 'join',
  },
  signature: {
    d: 'M 24 78 C 28 46 44 30 52 46 C 58 60 46 70 40 62 C 34 54 48 42 62 46 C 74 50 76 64 88 66 C 100 68 102 50 112 46 C 124 42 132 54 128 62 C 122 70 110 66 116 56 C 122 46 138 42 150 48 C 164 54 168 66 180 66 C 194 66 198 48 212 44 C 228 40 234 52 228 60 C 220 68 236 70 250 64 C 268 56 284 50 296 40 C 302 34 306 30 308 26',
    close_mode: 'mirror',
  },
}

function isFormulaId(id: PresetId): id is FormulaId {
  return id in formulas
}

/** 采样摘要：冻结资产要的字段（点数、闭合、容差、子路径数），与上传同一套语义 */
interface PresetSample {
  points: Float64Array
  N: number
  closed: boolean
  close_mode: SampleOptions['close_mode']
  subpaths: number
  /** 细分容差；解析生成器直接给点、没有细分，为 0 */
  subdivide_eps: number
}

export interface Preset {
  coeffs: Coefficient[]
  sample: PresetSample
}

/** 预置形状 → 系数，一次给全：渲染要系数，冻结资产要采样参数 */
export function presetOf(id: PresetId, N: number = PRESET_N): Preset {
  if (isFormulaId(id)) {
    const points = formulas[id](N).points
    return {
      coeffs: dft(points, N),
      sample: { points, N, closed: true, close_mode: 'join', subpaths: 1, subdivide_eps: 0 },
    }
  }
  const { d, close_mode } = PATH_PRESETS[id]
  const s = sample(d, { N, close_mode })
  return {
    coeffs: dft(s.points, N),
    sample: { points: s.points, N, closed: s.closed, close_mode, subpaths: s.subpaths, subdivide_eps: s.tolerance },
  }
}
