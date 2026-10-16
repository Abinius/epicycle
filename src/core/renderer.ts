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
  clearRect(x: number, y: number, w: number, h: number): void
}

/** 坐标与样式全部显式传入：渲染器不读全局主题、不读时钟、不读随机数 */
export interface RenderOptions {
  width: number
  height: number
  /** 笔尖轨迹保留的周期比例 0–1，0 表示不画轨迹 */
  trail: number
  background: string | null
  circles: 'all' | 'none'
  /** 项检查：只走前 highlight+1 项的圆链与笔尖，并用 highlightColor 描这一项的圆；null = 全部项 */
  highlight: number | null
  circleColor: string
  vectorColor: string
  highlightColor: string
  trailColor: string
  penColor: string
  lineWidth: number
  penRadius: number
  trailSamples: number
}

export function renderOptions(width: number, height: number, trail = 0, highlight: number | null = null): RenderOptions {
  return {
    width,
    height,
    trail,
    background: '#FBFAF7',
    circles: 'all',
    highlight,
    circleColor: 'rgba(63,107,79,0.22)',
    vectorColor: 'rgba(63,107,79,0.55)',
    highlightColor: '#C2694F',
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
  // 以形状质心 c_0（常数项）为画布中心：viewScale = 0.8/Σ|c_n| 的「笔尖不出单位半径」
  // 保证只在以质心为中心时成立——以原点为中心时，笔尖最远可达 |c_0| + Σ|c_n|，
  // 任何不在原点附近的形状（上传的 SVG、自带坐标框的预置）都会被推出画布。
  const px = (f: Four) => cx + (f.re - scene.center.re) * R
  const py = (f: Four) => cy - (f.im - scene.center.im) * R // 数学 y 向上，画布 y 向下

  // 先清屏再画：目标可能被复用（导出逐帧共用一个 surface），背景为 null 时前一帧不能残留
  target.clearRect(0, 0, o.width, o.height)

  target.save()

  if (o.background) {
    target.fillStyle = o.background
    target.globalAlpha = 1
    target.fillRect(0, 0, o.width, o.height)
  }

  // 项检查：只走到被点选的那一项，后续项既不画圆也不进笔尖位置
  const upto =
    o.highlight === null
      ? scene.terms.length
      : Math.min(Math.max(0, o.highlight) + 1, scene.terms.length)

  // 轨迹从 (t − trail) 解析采样到 t：不累积历史状态，否则纯度无从保证
  if (o.trail > 0) {
    const n = Math.max(2, Math.floor(o.trailSamples))
    target.beginPath()
    for (let j = 0; j <= n; j++) {
      const p = penAt(scene, t - o.trail * (1 - j / n), upto)
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
    // 先走一遍链条得到每个圆心，再分别批处理「圆」与「矢量」两条路径，各 stroke 一次
    const chain: { at: Four; radius: number }[] = [{ at: scene.center, radius: 0 }]
    let pos: Four = scene.center
    for (let i = 0; i < upto; i++) {
      const term = scene.terms[i]
      const ang = TWO_PI * term.n * t + term.phase
      pos = { re: pos.re + term.radius * Math.cos(ang), im: pos.im + term.radius * Math.sin(ang) }
      chain.push({ at: pos, radius: term.radius })
    }

    if (o.circleColor) {
      target.beginPath()
      for (let i = 1; i < chain.length; i++) {
        const link = chain[i]
        target.arc(px(link.at), py(link.at), link.radius * R, 0, TWO_PI)
      }
      target.strokeStyle = o.circleColor
      target.lineWidth = o.lineWidth
      target.stroke()
    }

    if (o.vectorColor) {
      target.beginPath()
      for (let i = 0; i < chain.length - 1; i++) {
        target.moveTo(px(chain[i].at), py(chain[i].at))
        target.lineTo(px(chain[i + 1].at), py(chain[i + 1].at))
      }
      target.strokeStyle = o.vectorColor
      target.lineWidth = o.lineWidth
      target.lineCap = 'round'
      target.stroke()
    }

    if (o.highlight !== null && o.highlightColor && chain.length > 1) {
      const tip = chain[chain.length - 1]
      target.beginPath()
      target.arc(px(tip.at), py(tip.at), tip.radius * R, 0, TWO_PI)
      target.strokeStyle = o.highlightColor
      target.lineWidth = o.lineWidth * 2
      target.stroke()
    }
  }

  const pen = penAt(scene, t, upto)
  target.beginPath()
  target.arc(px(pen), py(pen), o.penRadius, 0, TWO_PI)
  target.fillStyle = o.penColor
  target.fill()

  target.restore()
}
