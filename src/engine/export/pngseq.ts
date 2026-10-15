import { exportRenderOptions, frameCount, frameState } from '../../core/export.js'
import { renderFrame } from '../../core/renderer.js'
import { createSurface, tick } from './surface.js'
import { aborted, rethrow, type Runner } from './types.js'

/**
 * E5：PNG 序列，ZIP 打包（技术文档 §5.4）。保留 alpha，供剪映 / AE 二次使用。
 *
 * 用 fflate 的**流式** Zip 而不是 `zipSync`：270 帧 1080p 的字节量在几百 MB 量级，
 * 攒齐了再压很容易直接崩。每帧编完立刻推给 zip 并释放，峰值内存只跟压缩输出走。
 *
 * 用 store（不压缩）加文件：PNG 本身已经压过，再压一遍几乎不省体积，只白烧 CPU。
 */
export const runPngSeq: Runner = async (scene, opt, _plan, hooks) => {
  const { Zip, ZipPassThrough } = await import('fflate')
  const surface = createSurface(opt.width, opt.height)
  const parts: Uint8Array[] = []
  let failure: Error | null = null
  let done = false
  const zip = new Zip((err, dat, final) => {
    if (err) {
      failure = err
      return
    }
    parts.push(dat)
    if (final) done = true
  })

  const total = frameCount(opt)
  const o = exportRenderOptions(opt)
  for (let i = 0; i < total; i++) {
    aborted(hooks.signal)
    renderFrame(surface.ctx, scene, frameState(i, opt).t, o)
    const file = new ZipPassThrough(`frame_${String(i + 1).padStart(5, '0')}.png`)
    zip.add(file)
    file.push(await surface.png(), true)
    hooks.onProgress?.(i + 1, total)
    if (i % 4 === 0) await tick()
  }
  zip.end()
  while (!done && !failure) await tick()
  rethrow(failure)
  // TS 5.9 起 ArrayBufferView 收窄为「ArrayBuffer 背衬」，而 fflate 的块是
  // Uint8Array<ArrayBufferLike>；运行时不存在 SharedArrayBuffer，纯粹是类型层面的摩擦
  return new Blob(parts as unknown as BlobPart[], { type: 'application/zip' })
}
