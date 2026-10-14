import { prepareSvg } from '../core/source.js'
import type { WorkerReq, WorkerRes } from './protocol.js'

/**
 * 采样 Worker：把 extractPaths → samplePaths → dft 这条重计算挪出主线程，
 * 主线程只跑 diagnose（便宜、依赖 K）。core/ 全是纯函数，Worker 直接 import。
 *
 * `self` 在 lib.dom 里被认作 Window，它的 onmessage / postMessage 签名是给窗口
 * 间通信用的（postMessage 要 targetOrigin）。这里收窄成一个最小局部接口，
 * 避免引入会与 DOM 冲突的 webworker lib。
 */
interface WorkerScope {
  onmessage: ((e: MessageEvent<WorkerReq>) => void) | null
  postMessage(message: WorkerRes, transfer: Transferable[]): void
}

const ctx = self as unknown as WorkerScope

ctx.onmessage = (e: MessageEvent<WorkerReq>): void => {
  const { id, text, opts } = e.data
  // 时钟从这一层注入：core 保持无时钟，资产里的 dft_ms 仍然是真测出来的
  const result = prepareSvg(text, opts, () => performance.now())
  // 采样点 Float64Array 零拷贝移交主线程；coeffs 是普通对象数组，只能结构化克隆
  const transfer = result.sample ? [result.sample.points.buffer] : []
  ctx.postMessage({ id, result }, transfer)
}
