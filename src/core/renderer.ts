import type { Four, Scene } from './types.js'
import { TWO_PI } from './complex.js'
import { penAt } from './epicycle.js'

/**
 * 渲染只依赖这个窄接口，不用 Canvas 类型 —— 这样在 Node 里能用一个录制桩做
 * 纯度测试（V-6）。注意 CanvasRenderingContext2D 的 fillStyle/strokeStyle 是
 * `string | CanvasGradient | CanvasPattern`，与这里的 string 不完全同构，
 * 边界处收窄一次即可（本渲染器只写纯色字符串）。
 */
export interface DrawTarget {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  globalAlpha: number
  save(): void
  restore(): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  stroke(): void
  fill(): void
  fillRect(x: number, y: number, w: number, h: number): void
}

/** 坐标与样式全部显式传入：渲染器不读全局主题、不读时钟、不读随机数 */
export interface RenderOptions {
  width: number
  height: number
  /** 笔尖轨迹保留的周期比例 0–1，0 表示不画轨迹 */
  trail: number
  background: string | null
  circles: 'all' | 'none'
  circleColor: string
  vectorColor: string
  trailColor: string
  penColor: string
  lineWidth: number
  penRadius: number
  trailSamples: number
}

export function renderOptions(width: number, height: number, trail = 0): RenderOptions {
  return {
    width,
    height,
    trail,
    background: '#FBFAF7',
    circles: 'all',
    circleColor: 'rgba(63,107,79,0.22)',
    vectorColor: 'rgba(63,107,79,0.55)',
    trailColor: '#B5463C',
    penColor: '#243128',
    lineWidth: 1,
    penRadius: 4,
    trailSamples: 240,
  }
}

/**
 * 一帧的全部绘制。纯函数：同一 (scene, t, options) 必得同一帧。
 * 这是 C3「预览与导出逐帧一致」的唯一保障，禁止在这里引入时间源或随机源。
 * 坐标以设备像素为单位，调用方负责按目标分辨率传入。
 */
export function renderFrame(target: DrawTarget, scene: Scene, t: number, o: RenderOptions): void {
  const cx = o.width / 2
  const cy = o.height / 2
  const R = Math.min(o.width, o.height) * 0.5 * scene.viewScale
  const px = (f: Four) => cx + f.re * R
  const py = (f: Four) => cy - f.im * R // 数学 y 向上，画布 y 向下

  target.save()

  if (o.background) {
    target.fillStyle = o.background
    target.globalAlpha = 1
    target.fillRect(0, 0, o.width, o.height)
  }

  // 轨迹从 (t − trail) 解析采样到 t：不累积历史状态，否则纯度无从保证
  if (o.trail > 0) {
    const n = Math.max(2, Math.floor(o.trailSamples))
    target.beginPath()
    for (let j = 0; j <= n; j++) {
      const p = penAt(scene, t - o.trail * (1 - j / n))
      if (j === 0) target.moveTo(px(p), py(p))
      else target.lineTo(px(p), py(p))
    }
    target.strokeStyle = o.trailColor
    target.lineWidth = o.lineWidth
    target.lineCap = 'round'
    target.lineJoin = 'round'
    target.stroke()
  }

  if (o.circles === 'all') {
    const walk = (visit: (from: Four, to: Four, radius: number) => void) => {
      let pos: Four = scene.center
      for (const term of scene.terms) {
        const ang = TWO_PI * term.n * t + term.phase
        const to: Four = { re: pos.re + term.radius * Math.cos(ang), im: pos.im + term.radius * Math.sin(ang) }
        visit(pos, to, term.radius)
        pos = to
      }
    }

    if (o.circleColor) {
      target.beginPath()
      walk((from, _to, radius) => target.arc(px(from), py(from), radius * R, 0, TWO_PI))
      target.strokeStyle = o.circleColor
      target.lineWidth = o.lineWidth
      target.stroke()
    }

    if (o.vectorColor) {
      target.beginPath()
      walk((from, to) => {
        target.moveTo(px(from), py(from))
        target.lineTo(px(to), py(to))
      })
      target.strokeStyle = o.vectorColor
      target.lineWidth = o.lineWidth
      target.lineCap = 'round'
      target.stroke()
    }
  }

  const pen = penAt(scene, t)
  target.beginPath()
  target.arc(px(pen), py(pen), o.penRadius, 0, TWO_PI)
  target.fillStyle = o.penColor
  target.fill()

  target.restore()
}
