import type { RenderOptions } from './renderer.js'
import { renderOptions } from './renderer.js'

/**
 * C3 导出引擎的纯规划层（技术文档 §5.1 / §5.2）。
 *
 * 这一层不碰任何浏览器 API：能力探测的结果由调用方以 `Caps` 传进来。于是整条降级链
 * 可以在 Node 里被穷举测试——§5.2 明说降级链在真实用户里大概率会被走到，
 * **不能只测 happy path**。编码器怎么用、帧怎么送，都在 engine/ 那一层。
 */

export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png'

/** 能力探测结果。没实现的路（如 E3 的 WebCodecs+VP9）不放标志位，免得留下永远为真的判断 */
export interface Caps {
  webcodecs: boolean
  /** canEncodeVideo 认可当前分辨率对应的 H.264 串 */
  h264: boolean
  recorder: boolean
  recorderVp9: boolean
  recorderVp8: boolean
}

/** 实际走得通的那一档 */
export type ExportPath = 'webcodecs' | 'recorder' | 'gif' | 'png'

export interface Plan {
  path: ExportPath
  /** 落盘扩展名 */
  ext: string
  /** 文件名里那一段编码标识：h264 / vp9 / vp8 / gif / png */
  tag: string
  /** VideoEncoder.configure 的 codec 串 */
  codec?: string
  /** MediaRecorder 的 mimeType */
  mimeType?: string
  /** 与请求的格式不一致时的说明。降级链每一步都要有文案，不许静默失败（PRD §5.1） */
  note?: string
}

/**
 * H.264 的 codec 串按分辨率定档：Baseline 3.1 / Main 4.0 / Main 5.2。
 * 探测与配置必须用同一个串，否则 canEncodeVideo 通过而 configure 抛错。
 */
export function h264Codec(width: number, height: number): string {
  const px = width * height
  if (px <= 1280 * 720) return 'avc1.42001f'
  if (px <= 1920 * 1080) return 'avc1.4d0028'
  return 'avc1.4d0034'
}

const pngPlan = (note?: string): Plan => ({ path: 'png', ext: 'zip', tag: 'png', ...(note ? { note } : {}) })

/**
 * 能力探测 → 降级链（PRD §5.1）：
 *
 *   MP4  ：E2(H.264) → E1(VP9/WebM) → E1(VP8/WebM) → E5(PNG 序列)
 *   WebM ：E1(VP9) → E1(VP8) → E5(PNG 序列)
 *   GIF / PNG：纯 JS 与 Canvas，永远可用；GIF 没有 alpha 通道，透明时降到 PNG 序列
 *
 * 每降一级都带 note。透明背景单独一条：H.264 没有 alpha 通道，要么换容器、要么换 PNG 序列，
 * **绝不静默丢掉透明**（PRD §5.3）。
 */
export function pickPlan(
  format: ExportFormat,
  caps: Caps,
  opt: { transparent: boolean; width: number; height: number },
): Plan {
  if (format === 'png') return pngPlan()
  // GIF 没有 alpha 通道：透明一勾就降到 PNG 序列，绝不交出一份黑底的 GIF
  if (format === 'gif') {
    return opt.transparent ? pngPlan('GIF 没有透明通道，已改用 PNG 序列（保留 alpha）。') : { path: 'gif', ext: 'gif', tag: 'gif' }
  }

  const webm: Plan | null = !caps.recorder
    ? null
    : caps.recorderVp9
      ? { path: 'recorder', ext: 'webm', tag: 'vp9', mimeType: 'video/webm;codecs=vp9' }
      : caps.recorderVp8
        ? { path: 'recorder', ext: 'webm', tag: 'vp8', mimeType: 'video/webm;codecs=vp8' }
        : null

  if (format === 'mp4') {
    if (!opt.transparent && caps.webcodecs && caps.h264) {
      return { path: 'webcodecs', ext: 'mp4', tag: 'h264', codec: h264Codec(opt.width, opt.height) }
    }
    if (webm) {
      return {
        ...webm,
        note: opt.transparent
          ? 'MP4（H.264）没有透明通道，已改用 WebM；各浏览器对 WebM 透明的支持也不一致，要确定带透明请用 PNG 序列。'
          : '本浏览器不能编码 H.264，已改用 WebM。',
      }
    }
    return pngPlan(
      opt.transparent ? '本浏览器不能导出带透明的视频，已改用 PNG 序列（保留 alpha）。' : '本浏览器不支持视频导出，已改用 PNG 序列。',
    )
  }

  if (webm) return webm
  return pngPlan('本浏览器不支持 WebM 录制，已改用 PNG 序列。')
}

// ---------------------------------------------------------------- 时间轴

export interface FrameState {
  /** 归一化时间 t ∈ [0,1) */
  t: number
  /** 这一帧是不是首尾留白里的静止帧 */
  pad: boolean
}

export function padFrames(opt: ExportOptions): number {
  return Math.round(opt.padSeconds * opt.fps)
}

/** 一个周期占多少帧 */
export function periodFrames(opt: ExportOptions): number {
  return Math.round(opt.periodSeconds * opt.fps)
}

export function loopFrames(opt: ExportOptions): number {
  return periodFrames(opt) * opt.loops
}

/** 总帧数 = 头留白 + 循环 + 尾留白 */
export function frameCount(opt: ExportOptions): number {
  return 2 * padFrames(opt) + loopFrames(opt)
}

/**
 * 第 i 帧的时间。留白帧**不进入 `% 1` 的循环**（坑 #6）——它们固定渲染 t=0，
 * 也就是周期首尾那一帧，于是视频首尾同帧、循环回看时无缝。
 */
export function frameState(i: number, opt: ExportOptions): FrameState {
  const pad = padFrames(opt)
  if (i < pad || i >= pad + loopFrames(opt)) return { t: 0, pad: true }
  const per = periodFrames(opt)
  return { t: ((i - pad) % per) / per, pad: false }
}

/** 这一帧是不是关键帧。每 2 秒一个，够播放器拖动定位 */
export function isKeyFrame(i: number, opt: ExportOptions): boolean {
  return i % Math.max(1, Math.round(opt.fps * 2)) === 0
}

// ---------------------------------------------------------------- 参数

export interface ExportOptions {
  format: ExportFormat
  width: number
  height: number
  fps: number
  /** 循环圈数 */
  loops: number
  /** 首尾各留白多少秒 */
  padSeconds: number
  /** 一个周期的秒数（就是 θ 的 T） */
  periodSeconds: number
  /** 笔尖轨迹保留比例 */
  trail: number
  /** 项检查：只画到第几项；null = 全部 */
  highlight: number | null
  /** 背景色；null 表示透明 */
  background: string | null
  circles: 'all' | 'none'
  /** 比特每秒 */
  bitrate: number
  /** 文件名主干用的形状名 */
  name: string
}

/**
 * PRD §5.3 的自动码率（720p30≈2.5M / 1080p30≈5M / 1080p60≈8M）。
 * 用一个常数拟合：0.09 bits/像素/帧恰好对上 720p30 的 2.5M，1080p30 得 5.6M、
 * 1080p60 得 11.2M——比 PRD 的经验值高，因为 PRD 那三个数对帧率是次线性的。
 * 宁可给高一点：这几个数只是默认值，用户随时可覆盖。
 */
export const BITS_PER_PIXEL_FRAME = 0.09

export function autoBitrate(width: number, height: number, fps: number): number {
  return Math.round(width * height * fps * BITS_PER_PIXEL_FRAME)
}

/** 导出的渲染参数：复用预览那一份，只覆盖背景与圆链两项 */
export function exportRenderOptions(opt: ExportOptions): RenderOptions {
  return {
    ...renderOptions(opt.width, opt.height, opt.trail, opt.highlight),
    background: opt.background,
    circles: opt.circles,
  }
}

/** 分辨率档说的是**短边**像素数，横竖版都按它算 */
export type Tier = 720 | 1080 | 2160

/**
 * 分辨率档 + 比例 → 像素尺寸。宽高一律取偶数——H.264 编码器不接受奇数边长，
 * 这里不取整的话会在 configure 那一步才炸。
 */
export function frameSize(tier: Tier, aspect: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return aspect >= 1
    ? { width: even(tier * aspect), height: even(tier) }
    : { width: even(tier), height: even(tier / aspect) }
}

/** 人读的体积。1024 进制，十位以下保留一位小数 */
export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

/**
 * GIF 体积失控是必然的（坑 #5），固定降采到 12 fps + 最宽 480，不给用户改。
 * 宽高取偶数，编码器友好。
 */
export const GIF_FPS = 12
export const GIF_MAX_WIDTH = 480

export function gifOptions(opt: ExportOptions): ExportOptions {
  const scale = Math.min(1, GIF_MAX_WIDTH / opt.width)
  return {
    ...opt,
    width: Math.max(2, Math.round((opt.width * scale) / 2) * 2),
    height: Math.max(2, Math.round((opt.height * scale) / 2) * 2),
    fps: GIF_FPS,
  }
}

// ---------------------------------------------------------------- 体积与文件名

/** 体积预估。视频按码率算；GIF 与 PNG 序列按「像素 × 帧 × 压缩后每像素字节数」估个量级 */
export function estimateBytes(opt: ExportOptions, plan: Plan): number {
  const n = frameCount(opt)
  if (plan.path === 'png') return Math.round(opt.width * opt.height * n * 0.45)
  if (plan.path === 'gif') return Math.round(opt.width * opt.height * n * 0.35)
  return Math.round((opt.bitrate * n) / opt.fps / 8)
}

const two = (n: number) => String(n).padStart(2, '0')

/** 日期取 UTC：core 不读时钟、也不该依赖机器时区，同一个 Date 必须给出同一个文件名 */
function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}`
}

/** 形状名里可能带空格与路径字符，统一换成下划线 */
function slug(s: string): string {
  return s.trim().replace(/[\s/\\:*?"<>|]+/g, '_').replace(/^_+|_+$/g, '') || 'shape'
}

/** PRD §5.3 的文件名模板：epicycle_<名>_<W>x<H>_<fps>_<codec>_<yyyymmdd>.<ext> */
export function fileName(opt: ExportOptions, plan: Plan, date: Date): string {
  return `epicycle_${slug(opt.name)}_${opt.width}x${opt.height}_${opt.fps}_${plan.tag}_${stamp(date)}.${plan.ext}`
}
