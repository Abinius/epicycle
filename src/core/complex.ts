import type { Four } from './types.js'

export const TWO_PI = Math.PI * 2

/** 折到 [0, 1)。渲染与求值都从这里走，避免各处理不同 */
export function wrap01(t: number): number {
  return t - Math.floor(t)
}

export function polar(r: number, theta: number): Four {
  return { re: r * Math.cos(theta), im: r * Math.sin(theta) }
}

export function abs(f: Four): number {
  return Math.hypot(f.re, f.im)
}

export function arg(f: Four): number {
  return Math.atan2(f.im, f.re)
}

export function scale(f: Four, k: number): Four {
  return { re: f.re * k, im: f.im * k }
}
