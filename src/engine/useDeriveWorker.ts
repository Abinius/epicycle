import { useCallback, useEffect, useRef } from 'react'
import type { ShapeTransform } from '../core/derive.js'
import type { Coefficient } from '../core/types.js'
import type { DeriveRes, WorkerRes } from './protocol.js'

export interface DeriveResult {
  coeffs: Coefficient[]
  points: Float64Array
  /** 重算 DFT 的耗时（毫秒），记进派生资产的 meta */
  dft_ms: number
}

export type DeriveFn = (coeffs: Coefficient[], N: number, transform: ShapeTransform) => Promise<DeriveResult>

/**
 * 模式 Y 派生的 Worker 绑定。派生是按钮触发的一次性动作，不是连续拖动，
 * 所以除了轮次判据之外不需要任何调度：算完就回。
 *
 * 单独起一个 Worker 而不是复用采样那个：两边各有各的轮次语义，混在一个消息循环里
 * 互相过滤反而绕。两个实例共享同一个 worker chunk，浏览器缓存命中，不重复下载。
 */
export function useDeriveWorker(): DeriveFn {
  const ref = useRef<DeriveFn | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    let id = 0
    let onRes: ((d: DeriveRes) => void) | null = null
    worker.onmessage = (e: MessageEvent<WorkerRes>) => {
      const d = e.data
      if (d.kind === 'derive' && d.id === id) {
        onRes?.(d)
        onRes = null
      }
    }
    ref.current = (coeffs, N, transform) =>
      new Promise<DeriveResult>((resolve, reject) => {
        onRes = (r) => resolve({ coeffs: r.coeffs, points: r.points, dft_ms: r.dft_ms })
        worker.onerror = () => {
          onRes = null
          reject(new Error('派生计算出错'))
        }
        worker.postMessage({ id: ++id, kind: 'derive', coeffs, N, transform })
      })
    return () => {
      worker.terminate()
      ref.current = null
    }
  }, [])

  return useCallback<DeriveFn>((c, n, t) => ref.current?.(c, n, t) ?? Promise.reject(new Error('派生未就绪')), [])
}
