import { exportRenderOptions, frameCount, frameState } from '../../core/export.js'
import { renderFrame, type DrawTarget } from '../../core/renderer.js'
import { sleep } from './surface.js'
import { aborted, type Runner } from './types.js'

/**
 * E1：captureStream + MediaRecorder 兜底（技术文档 §5.1）。
 *
 * 这条路的固有代价是**只能实时**：MediaRecorder 按墙上时钟给帧打时间戳，想快也快不了，
 * 9 秒的片子就得录 9 秒。再加上码率控制不如 E2，所以它是降级档而不是主力。
 *
 * 只能建 `HTMLCanvasElement`：`captureStream` 不在 `OffscreenCanvas` 上。
 */
export const runRecorder: Runner = async (scene, opt, plan, hooks) => {
  const canvas = document.createElement('canvas')
  canvas.width = opt.width
  canvas.height = opt.height
  const raw = canvas.getContext('2d')
  if (!raw) throw new Error('拿不到 2D 上下文，无法录制')
  const ctx = raw as unknown as DrawTarget

  // captureStream(0)：不自动采帧，靠 requestFrame 手动推，帧率才由我们说了算
  const stream = canvas.captureStream(0)
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    ...(plan.mimeType ? { mimeType: plan.mimeType } : {}),
    videoBitsPerSecond: opt.bitrate,
  })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((res) => {
    recorder.onstop = () => res()
  })

  const total = frameCount(opt)
  const o = exportRenderOptions(opt)
  const dt = 1000 / opt.fps
  recorder.start()
  try {
    for (let i = 0; i < total; i++) {
      aborted(hooks.signal)
      const t0 = performance.now()
      renderFrame(ctx, scene, frameState(i, opt).t, o)
      videoTrack.requestFrame()
      hooks.onProgress?.(i + 1, total)
      // 补足到 1/fps：录制按真实时间走，画得比帧率快就得等
      const wait = dt - (performance.now() - t0)
      if (wait > 0) await sleep(wait)
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop()
  }
  await stopped
  for (const track of stream.getTracks()) track.stop()
  return new Blob(chunks, { type: plan.mimeType ?? 'video/webm' })
}
