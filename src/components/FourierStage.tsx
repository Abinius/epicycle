import { useEffect, useRef } from 'react'
import { dft } from '../core/dft.js'
import { buildScene } from '../core/epicycle.js'
import { formulas, type FormulaId } from '../core/formulas.js'
import { renderFrame, renderOptions, type DrawTarget } from '../core/renderer.js'
import { defaultTheta, type Scene } from '../core/types.js'

const SAMPLES = 1024

/** 内置公式 → 可动画场景（M1 起换成采样器 / 资产库，接口不变） */
export function buildDemoScene(id: FormulaId, k: number): Scene {
  return buildScene(dft(formulas[id](SAMPLES).points, SAMPLES), { ...defaultTheta, K: k })
}

/**
 * 画布即渲染目标：按设备像素出图（renderFrame 的坐标契约就是设备像素），不做 scale。
 * rAF 时钟只存在于这一层，renderFrame 本身保持纯函数——这是导出与预览一致的前提。
 */
export function FourierStage({ scene, trail, playing }: { scene: Scene; trail: number; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const live = useRef({ scene, trail, playing })
  live.current = { scene, trail, playing }
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
        if (live.current.playing) clock.current = (clock.current + dt) % 1
      }
      last = now
      renderFrame(target, live.current.scene, clock.current, renderOptions(canvas.width, canvas.height, live.current.trail))
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
