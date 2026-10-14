import type { PreparedSvg, PrepareOptions } from '../core/source.js'

/** 主线程 → Worker：跑一次采样 + DFT */
export interface WorkerReq {
  /** 轮次：主线程用它丢弃过期回包（旧上传的慢回包不该覆盖新状态） */
  id: number
  text: string
  opts: PrepareOptions
}

/** Worker → 主线程：采样 + DFT 的纯结果 */
export interface WorkerRes {
  id: number
  result: PreparedSvg
}
