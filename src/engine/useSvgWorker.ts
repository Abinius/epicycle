import { useEffect, useRef, useState } from 'react'
import type { PreparedSvg, PrepareOptions } from '../core/source.js'
import type { WorkerRes } from './protocol.js'

/**
 * 采样 Worker 的 React 绑定。text 为空（用预置形状或已冻结的资产）时不发消息、结果清空。
 *
 * 传文本而不是传对象：对象的引用每渲染一次都是新的，会被 effect 当成「输入变了」
 * 而反复投递。文本按值比较，天然稳定。
 *
 * 轮次（epoch）丢包：每次输入变化都先 ++epoch 再 post，回包 id 对不上当前轮次
 * 就直接扔掉——拖动 K 不触发 Worker（diagnose 在主线程），但切形状/改 N/改闭合方式
 * 会连续发，旧回包不该覆盖新状态。
 *
 * 失败也不留旧货：采样中断（路径数据非法）或 Worker 抛错时，结果一并清空。
 * 否则上一份素材的系数会一直挂在屏幕下，配着这次的新文件名——冻结一下就是一份
 * 张冠李戴的资产落进本地库。
 */
export interface SvgWorkerState {
  /** 最近一次成功采样；采样在飞或失败时是 null */
  prepared: PreparedSvg | null
  /** 最近一次采样失败 */
  failed: boolean
}

export function useSvgWorker(text: string | null, opts: PrepareOptions): SvgWorkerState {
  const [state, setState] = useState<SvgWorkerState>({ prepared: null, failed: false })
  const workerRef = useRef<Worker | null>(null)
  const epoch = useRef(0)
  /** 上一次投递过的文本：只有素材真的换了才清旧结果（改 N / 闭合方式只是重采样） */
  const lastText = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerRes>) => {
      const d = e.data
      if (d.kind !== 'prepare' || d.id !== epoch.current) return
      setState(d.failed ? { prepared: null, failed: true } : { prepared: d.result ?? null, failed: false })
    }
    worker.onerror = () => setState({ prepared: null, failed: true })
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
    const changed = lastText.current !== text
    lastText.current = text
    if (!text || !worker) {
      setState({ prepared: null, failed: false })
      return
    }
    if (changed) setState({ prepared: null, failed: false })
    worker.postMessage({ id, kind: 'prepare', text, opts: { N, close_mode, longest_only, tolerance } })
  }, [text, N, close_mode, longest_only, tolerance])

  return state
}
