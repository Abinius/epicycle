import type { ShapeTransform } from '../core/derive.js'
import type { PreparedSvg, PrepareOptions } from '../core/source.js'
import type { Coefficient } from '../core/types.js'

/**
 * 主线程 ↔ Worker 的契约。一个 Worker 实例按 `kind` 分发两种活儿：
 * 跑一次采样 + DFT（素材变了），或跑一次模式 Y 派生（形状域变换后重算 DFT）。
 */

export interface PrepareReq {
  id: number
  kind: 'prepare'
  text: string
  opts: PrepareOptions
}

export interface DeriveReq {
  id: number
  kind: 'derive'
  coeffs: Coefficient[]
  N: number
  transform: ShapeTransform
}

export type WorkerReq = PrepareReq | DeriveReq

export interface PrepareRes {
  id: number
  kind: 'prepare'
  result: PreparedSvg
}

/** 派生结果：新系数 + 变换后的采样点（冻结派生资产要后者算包围盒） */
export interface DeriveRes {
  id: number
  kind: 'derive'
  coeffs: Coefficient[]
  points: Float64Array
  dft_ms: number
}

export type WorkerRes = PrepareRes | DeriveRes
