import { deriveCoeffs } from '../core/derive.js'
import { prepareSvg } from '../core/source.js'
import type { WorkerReq, WorkerRes } from './protocol.js'

/**
 * 采样与模式 Y 派生共用一个消息循环，按 kind 分发。core/ 全是纯函数，Worker 直接 import。
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
  const req = e.data
  if (req.kind === 'prepare') {
    try {
      // 时钟从这一层注入：core 保持无时钟，资产里的 dft_ms 仍然是真测出来的
      const result = prepareSvg(req.text, req.opts, () => performance.now())
      // 采样点 Float64Array 零拷贝移交主线程；coeffs 是普通对象数组，只能结构化克隆
      const transfer = result.sample ? [result.sample.points.buffer] : []
      ctx.postMessage({ id: req.id, kind: 'prepare', failed: false, result }, transfer)
    } catch {
      // 路径数据非法（d 被截断、含非法指令）会抛到这里：回一个 failed，
      // 让主线程清掉上一份素材的结果——不回消息就等于把旧系数配到新的文件名上
      ctx.postMessage({ id: req.id, kind: 'prepare', failed: true }, [])
    }
    return
  }

  // 模式 Y：重建 → 形状域变换 → 重 DFT。N 最大 4096，重建是 O(N²)，必须留在这边
  const t0 = performance.now()
  const { coeffs, points } = deriveCoeffs(req.coeffs, req.N, req.transform)
  ctx.postMessage(
    { id: req.id, kind: 'derive', coeffs, points, dft_ms: performance.now() - t0 },
    [points.buffer],
  )
}
