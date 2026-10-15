import { exportRenderOptions, frameCount, frameState, isKeyFrame } from '../../core/export.js'
import { renderFrame } from '../../core/renderer.js'
import { createSurface, tick } from './surface.js'
import { aborted, rethrow, type Runner } from './types.js'

/**
 * E2：WebCodecs + mp4-muxer 的离帧导出（技术文档 §5.1）。
 *
 * 「离帧」是这条通路的全部意义：帧由循环计数推进，不受 rAF 抖动影响，
 * 所以同一份场景两次导出的**帧内容**完全一致（§5.3 坑 #7）。
 *
 * 与 §4.4 的偏差：没有搬进 Worker。VideoEncoder 本身就在别的线程，主线程只负责
 * 逐帧 renderFrame 与移交 VideoFrame，靠每帧让出一次保持界面可用。搬 Worker 需要
 * OffscreenCanvas + transferControlToOffscreen，留作性能优化项。
 */
export const runWebCodecs: Runner = async (scene, opt, plan, hooks) => {
  if (!plan.codec) throw new Error('WebCodecs 通路缺 codec 串')
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
  const surface = createSurface(opt.width, opt.height)
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: opt.width, height: opt.height, frameRate: opt.fps },
    fastStart: 'in-memory',
  })

  let failure: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e instanceof Error ? e : new Error(String(e))
    },
  })
  encoder.configure({
    codec: plan.codec,
    width: opt.width,
    height: opt.height,
    bitrate: opt.bitrate,
    framerate: opt.fps,
    latencyMode: 'quality',
  })

  const total = frameCount(opt)
  const o = exportRenderOptions(opt)
  try {
    for (let i = 0; i < total; i++) {
      aborted(hooks.signal)
      rethrow(failure)
      renderFrame(surface.ctx, scene, frameState(i, opt).t, o)

      // 时间戳单位是微秒；duration 固定，不跳帧——否则部分播放器会卡死（坑 #1、#2）
      const frame = new VideoFrame(surface.canvas, {
        timestamp: Math.round((i * 1e6) / opt.fps),
        duration: Math.round(1e6 / opt.fps),
      })
      try {
        // 背压：队列压过 4 帧就等一等，否则内存会一路涨上去（坑 #3）
        while (encoder.encodeQueueSize > 4) await tick()
        encoder.encode(frame, { keyFrame: isKeyFrame(i, opt) })
      } finally {
        frame.close() // 忘了 close 就是解码器泄漏（坑 #4）
      }
      hooks.onProgress?.(i + 1, total)
      if (i % 8 === 0) await tick()
    }
    await encoder.flush()
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
  rethrow(failure)
  muxer.finalize()
  return new Blob([target.buffer], { type: 'video/mp4' })
}
