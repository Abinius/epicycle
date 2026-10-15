import type { DrawTarget } from '../../core/renderer.js'

/**
 * 导出用的离屏画布。固定 dpr = 1：导出画布的像素就是输出像素，不跟设备像素比走（§4.3）。
 * OffscreenCanvas 优先（§4.4），没有就退回一个脱离文档的 `<canvas>`。
 *
 * 注意 `captureStream` 只有 `HTMLCanvasElement` 有——录制那条路自己建 canvas，不走这里。
 */
export interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: DrawTarget
  /** 当前帧的 RGBA 像素（GIF 的调色板量化要用） */
  pixels(): ImageData
  /** 当前帧编码成 PNG 字节，保留 alpha（PNG 序列要用） */
  png(): Promise<Uint8Array>
}

export function createSurface(width: number, height: number): Surface {
  let canvas: HTMLCanvasElement | OffscreenCanvas
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height)
  } else {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    canvas = c
  }

  const raw = canvas.getContext('2d')
  if (!raw) throw new Error('拿不到 2D 上下文，无法离屏渲染')
  // CanvasRenderingContext2D 的 fillStyle/strokeStyle 是 string 与渐变的联合类型，与 DrawTarget
  // 不同构；渲染器只写纯色字符串，故在此收窄一次（与 FourierStage 的处理一致）
  const ctx = raw as unknown as DrawTarget

  return {
    canvas,
    ctx,
    pixels: () => raw.getImageData(0, 0, width, height),
    png: async () => {
      if (canvas instanceof OffscreenCanvas) {
        const blob = await canvas.convertToBlob({ type: 'image/png' })
        return new Uint8Array(await blob.arrayBuffer())
      }
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      if (!blob) throw new Error('PNG 编码失败')
      return new Uint8Array(await blob.arrayBuffer())
    },
  }
}

/** 让出一帧给 UI。导出循环里每帧都调一次，否则整段导出会把界面冻住 */
export function tick(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}
