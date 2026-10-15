import type { ExportOptions, Plan } from '../../core/export.js'
import type { Scene } from '../../core/types.js'

export interface ExportHooks {
  /** 已完成的帧数 / 总帧数 */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** 一条导出通路：拿到场景与参数，吐一个成品 Blob */
export type Runner = (scene: Scene, opt: ExportOptions, plan: Plan, hooks: ExportHooks) => Promise<Blob>

/** 每帧开头调一次，让长导出能被打断 */
export function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('导出已取消', 'AbortError')
}

/**
 * 把回调里攒下的错误在回调外重抛。
 *
 * 单独一个函数不是为了好看：`let failure: Error | null` 在回调里被赋值，
 * 类型流分析看不见那次赋值，于是后面的 `if (failure) throw failure` 会被判成
 * 「抛出的不是 Error」。收成一个参数后收窄就成立，也顺带让 ESLint 满意。
 */
export function rethrow(err: Error | null): void {
  if (err) throw err
}
