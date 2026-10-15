import { exportRenderOptions, frameCount, frameState } from '../../core/export.js'
import { renderFrame } from '../../core/renderer.js'
import { createSurface, tick } from './surface.js'
import { aborted, type Runner } from './types.js'

const MAX_COLORS = 256

/**
 * E4：GIF（技术文档 §5.4）。逐帧 `quantize` + `applyPalette`，延迟 1000/fps，循环无限。
 *
 * 体积靠 `gifOptions` 的固定降采压住（12 fps、最宽 480）——那条规则在 core 里，
 * 用户改不了，因为 GIF 体积失控是必然的（§5.3 坑 #5）。
 */
export const runGif: Runner = async (scene, opt, _plan, hooks) => {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  const surface = createSurface(opt.width, opt.height)
  const gif = GIFEncoder()
  const total = frameCount(opt)
  const o = exportRenderOptions(opt)
  const delay = Math.round(1000 / opt.fps)

  for (let i = 0; i < total; i++) {
    aborted(hooks.signal)
    renderFrame(surface.ctx, scene, frameState(i, opt).t, o)
    const { data } = surface.pixels()
    const palette = quantize(data, MAX_COLORS)
    gif.writeFrame(applyPalette(data, palette), opt.width, opt.height, { palette, delay })
    hooks.onProgress?.(i + 1, total)
    if (i % 4 === 0) await tick()
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}
