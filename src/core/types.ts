/**
 * 全产品的数据契约。core/ 只依赖这个文件，不允许出现任何浏览器 API。
 * 详见《傅里叶画板_技术栈与开发文档_v2.md》§3。
 */

/** 一个傅里叶系数：n 是频率（负数 = 反向旋转），re/im 是复数 c_n 的实部与虚部 */
export interface Coefficient {
  n: number
  re: number
  im: number
}

/** 复数（渲染与数学计算共用） */
export interface Four {
  re: number
  im: number
}

/** 展示与渲染用的系数视图：极坐标 + 贡献度 */
export interface Term {
  n: number
  radius: number
  phase: number
  /** 贡献度 = 本项半径 / 参与项半径总和；band/off 过滤掉的项不计入，被 K 截断的项仍计入分母 */
  weight: number
}

/** 单项系数的局部编辑参数（L2 系数级数值输入） */
export interface PerNParam {
  /** 幅度倍率 */
  s?: number
  /** 相位偏移（弧度） */
  dphi?: number
  /** 隐藏该项 */
  off?: boolean
}

/** C2 的参数向量 θ：与资产解耦，所有数值编辑都在这里表达 */
export interface Theta {
  /** 参与项数，上限为可用项数 */
  K: number
  /** 播放速度倍率 0.1–4 */
  speed: number
  /** 一个周期的秒数 */
  T: number
  /** 笔尖轨迹保留的周期比例 0–1 */
  trail: number
  /** 等权化时所有项的统一半径；其余模式只作用于 c_0 原点（形状尺度由 viewScale 归一，全局倍率无视觉效果） */
  scale: number
  /** 全体相位偏移（弧度） */
  phaseShift: number
  /** 线性相位斜坡：Δφ_n = slope · n，数学上等价于时间平移 slope/2π */
  slope: number
  /** 按 n 索引的局部编辑，key 为 String(n) */
  perN: Record<string, PerNParam>
  /** 频段过滤，作用在 |n| 上 */
  band: { lo: number; hi: number } | null
  /** 等权化：所有项幅度归一到 1，只保留相位 */
  equalize: boolean
}

export const defaultTheta: Theta = {
  K: 64,
  speed: 1,
  T: 4,
  trail: 0.35,
  scale: 1,
  phaseShift: 0,
  slope: 0,
  perN: {},
  band: null,
  equalize: false,
}

/**
 * 笔尖活动半径预算：viewScale = VIEW_BUDGET / Σ|c_n|，保证合成笔尖不出单位圆。
 * buildScene 用它算当前场景的缩放，冻结资产用它记原始缩放——两处必须同一个数。
 */
export const VIEW_BUDGET = 0.8

/** buildScene 的产物：n=0 项作为原点，其余按 |c_n| 降序取前 K 项 */
export interface Scene {
  center: Four
  terms: Term[]
  /** VIEW_BUDGET / Σ|c_n'|，保证笔尖始终落在单位半径内 */
  viewScale: number
  /** 实际参与渲染的项数（已按 K 截断） */
  K: number
  /** 输入系数总数，来自 dft() 时为 2M−1（M 为 Nyquist 上限，见技术文档 §2.2） */
  M: number
}

/** 冻结后的傅里叶公式资产：不可变、可复现、可传播 */
export interface FourierAsset {
  schema: 'fourierboard/asset@1.0'
  id: string
  name: string
  created_at: string
  /** preset 存预置 id（六个示例），其余三种是用户自己给的形状 */
  source: {
    type: 'svg' | 'draw' | 'formula' | 'preset'
    preset?: string
    file_name?: string
    bytes?: number
    subpaths?: number
  }
  sampling: { N: number; closed: boolean; close_mode: 'join' | 'mirror'; subdivide_eps: number }
  domain: { n_min: number; n_max: number }
  bounds: {
    center: [number, number]
    radius: number
    view_scale: number
    orig_bbox: [number, number, number, number]
  }
  coeffs: Coefficient[]
  meta: { engine: string; dft_ms: number; checksum: string }
}
