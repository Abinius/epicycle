import { useEffect, useRef, useState } from 'react'
import type { PreparedSvg, PrepareOptions } from '../core/source.js'
import type { WorkerReq, WorkerRes } from './protocol.js'

/**
 * 采样 Worker 的 React 绑定。text 为空（用预置形状或已冻结的资产）时不发消息、结果清空。
 *
 * 传文本而不是传对象：对象的引用每渲染一次都是新的，会被 effect 当成「输入变了」
 * 而反复投递。文本按值比较，天然稳定。
 *
 * 轮次（epoch）丢包：每次输入变化都先 ++epoch 再 post，回包 id 对不上当前轮次
 * 就直接扔掉——拖动 K 不触发 Worker（diagnose 在主线程），但切形状/改 N/改闭合方式
 * 会连续发，旧回包不该覆盖新状态。
 */
export function useSvgWorker(text: string | null, opts: PrepareOptions): PreparedSvg | null {
  const [result, setResult] = useState<PreparedSvg | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const epoch = useRef(0)

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerRes>) => {
      if (e.data.id === epoch.current) setResult(e.data.result)
    }
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const { N, close_mode, longest_only, tolerance } = opts
  useEffect(() => {
    const worker = workerRef.current
    const id = ++epoch.current
    if (!text || !worker) {
      setResult(null)
      return
    }
    const req: WorkerReq = { id, text, opts: { N, close_mode, longest_only, tolerance } }
    worker.postMessage(req)
  }, [text, N, close_mode, longest_only, tolerance])

  return result
}
