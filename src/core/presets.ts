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
 * 音符：斜体连音符。图标由三条子路径组成——梁/符干/符头鼓包的闭合轮廓，加两枚与鼓包重叠
 * 的圆形符头。取最长子路径即得整条可见轮廓；若三条一起串接，会多出两条连接符头与梁的直线。
 * 签名：开放笔迹，首尾相隔很远；用镜像回扫（笔迹画过去再画回来），
 * 用 join 会画出一条横贯整个字形的连线。
 */
export const PATH_PRESETS: Record<
  PathPresetId,
  { d: string } & Pick<SampleOptions, 'close_mode' | 'longest_only'>
> = {
  note: {
    d: 'M951.104 49.984A93.696 93.696 0 0 0 865.088 37.12L416.256 191.616A99.968 99.968 0 0 0 352 284.928v373.12a191.232 191.232 0 1 0 64 142.016v-515.2a35.392 35.392 0 0 1 21.952-33.024l447.808-154.24a30.272 30.272 0 0 1 28.096 4.352 34.176 34.176 0 0 1 14.144 28.16v400a191.232 191.232 0 1 0 64 142.016v-542.08a98.688 98.688 0 0 0-40.896-80zM224 928a128 128 0 1 1 128-128 128.128 128.128 0 0 1-128 128zm576-128a128 128 0 1 1 128-128 128.128 128.128 0 0 1-128 128z',
    close_mode: 'join',
    longest_only: true,
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
  const { d, close_mode, longest_only } = PATH_PRESETS[id]
  const s = sample(d, { N, close_mode, longest_only })
  return {
    coeffs: dft(s.points, N),
    sample: { points: s.points, N, closed: s.closed, close_mode, subpaths: s.subpaths, subdivide_eps: s.tolerance },
  }
}
