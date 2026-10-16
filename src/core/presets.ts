import { dft } from './dft.js'
import { formulas, formulaNames, type FormulaId } from './formulas.js'
import { sample, type SampleOptions } from './sampler.js'
import type { Coefficient } from './types.js'

/**
 * 预置示例（PRD A10）。六个预置共用同一条「采样 → DFT」管线：
 * 正方形 / 心形 / 星形走解析生成器（频率带限，适合教学），
 * 徽标 / 音符 / 签名是内建 SVG 路径，与上传文件走同一个采样器，没有第二条代码路径。
 */

export type PathPresetId = 'badge' | 'note' | 'signature'

export type PresetId = FormulaId | PathPresetId

export const PRESET_NAMES: Record<PresetId, string> = {
  badge: '徽标',
  ...formulaNames,
  note: '音符',
  signature: '签名',
}

/** 选择器的展示顺序 */
export const PRESET_IDS: readonly PresetId[] = ['badge', 'square', 'heart', 'star', 'note', 'signature']

/** 预置的采样点数：与上传默认一致，2 的幂（决策 D-2） */
export const PRESET_N = 1024

/**
 * 内建路径预置。d 是 SVG path 数据（y 向下，采样器负责翻成数学坐标）。
 *
 * 徽标：单条闭合轮廓，直接用直线闭合。
 * 音符：斜体连音符。图标由三条子路径组成——梁/符干/符头鼓包的闭合轮廓，加两枚与鼓包重叠
 * 的圆形符头。取最长子路径即得整条可见轮廓；若三条一起串接，会多出两条连接符头与梁的直线。
 * 签名：开放笔迹，首尾相隔很远；用镜像回扫（笔迹画过去再画回来），
 * 用 join 会画出一条横贯整个字形的连线。
 */
export const PATH_PRESETS: Record<
  PathPresetId,
  { d: string } & Pick<SampleOptions, 'close_mode' | 'longest_only'>
> = {
  badge: {
    d: 'M555.323077 0c206.848 22.094769 346.427077 118.587077 418.816 289.516308 72.388923 170.929231 59.273846 340.519385-39.384615 508.809846L1024 905.058462 905.531077 1024l-96.295385-97.201231c-120.910769 82.589538-259.347692 107.795692-415.271384 75.657846-77.666462-16.029538-143.241846-43.165538-196.726154-81.447384l-7.089231 5.828923-2.323692-2.520616c0.827077 4.647385 1.299692 9.452308 1.299692 14.336 0 42.771692-33.516308 77.469538-74.870154 77.469539S39.384615 981.464615 39.384615 938.653538c0-42.771692 33.516308-77.430154 74.83077-77.430153 6.734769 0 13.233231 0.905846 19.416615 2.599384a392.152615 392.152615 0 0 1-61.243077-92.553846l75.933539-80.226461c83.534769 78.296615 171.992615 126.779077 265.373538 145.447384 93.380923 18.707692 183.532308 5.986462 270.454154-38.203077l-320.590769-335.399384-97.319385 94.995692-134.183385-156.199385 245.484308-243.948307 0.472615 0.354461-1.102769-1.378461c22.685538 9.255385 43.480615 14.454154 62.345846 15.596307l4.096-0.787692 7.010462-1.851077c25.993846-7.955692 53.681231-22.173538 83.219692-42.653538l-2.835692 1.929846 2.087385-2.914462 76.091076 77.272616-0.157538 0.078769 0.945231 0.984615-100.785231 110.946462 300.307692 361.038769c68.844308-71.443692 80.187077-182.705231 33.988923-333.745231C797.026462 191.606154 701.046154 77.390769 555.323077 0z',
    close_mode: 'join',
  },
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
