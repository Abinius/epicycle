import { useEffect, useRef } from 'react'
import { renderFrame, renderOptions, type DrawTarget } from '../core/renderer.js'
import type { Scene } from '../core/types.js'

/**
 * 画布即渲染目标：按设备像素出图（renderFrame 的坐标契约就是设备像素），不做 scale。
 * rAF 时钟只存在于这一层，renderFrame 本身保持纯函数——这是导出与预览一致的前提。
 */
export function FourierStage({
  scene,
  trail,
  playing,
  highlight = null,
  rate = 0.25,
}: {
  scene: Scene
  trail: number
  playing: boolean
  /** 项检查：只画前 highlight+1 项的圆链 */
  highlight?: number | null
  /** 每秒推进的周期数 = speed/T；1 表示一秒一圈 */
  rate?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const live = useRef({ scene, trail, playing, highlight, rate })
  live.current = { scene, trail, playing, highlight, rate }
  const clock = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // CanvasRenderingContext2D 的 fillStyle/strokeStyle 是 string 与渐变的联合类型，
    // 与 DrawTarget 的 string 不完全同构；渲染器只写纯色字符串，故收窄一次
    const target = ctx as unknown as DrawTarget

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
    }

    let last = 0
    let raf = 0
    const loop = (now: number) => {
      if (last) {
        const dt = (now - last) / 1000
        if (live.current.playing) clock.current = (clock.current + live.current.rate * dt) % 1
      }
      last = now
      renderFrame(
        target,
        live.current.scene,
        clock.current,
        renderOptions(canvas.width, canvas.height, live.current.trail, live.current.highlight),
      )
      raf = requestAnimationFrame(loop)
    }

    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(canvas)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} data-testid="stage" className="block h-full w-full" />
}
