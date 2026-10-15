import type { DrawTarget } from '../renderer.js'

/** 一次绘制调用或样式赋值，记成一条数据 */
export type Op = [string, ...unknown[]]

const STYLE_KEYS = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'] as const

/**
 * 录制式 DrawTarget：把每次绘制调用与样式赋值都记成一条数据。
 *
 * `renderFrame` 只依赖窄接口 `DrawTarget`，所以纯度与「导出帧 = 预览帧」这类断言
 * 在 Node 里就能验，不需要真 canvas。V-6（渲染纯度）与导出一致性测试共用这一份。
 */
export function makeTarget() {
  const ops: Op[] = []
  const style: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
  }
  const rec = (name: string, ...rest: unknown[]) => ops.push([name, ...rest])
  const target = {
    save: () => rec('save'),
    restore: () => rec('restore'),
    beginPath: () => rec('beginPath'),
    stroke: () => rec('stroke'),
    fill: () => rec('fill'),
    moveTo: (x: number, y: number) => rec('moveTo', x, y),
    lineTo: (x: number, y: number) => rec('lineTo', x, y),
    arc: (x: number, y: number, r: number, a0: number, a1: number) => rec('arc', x, y, r, a0, a1),
    fillRect: (x: number, y: number, w: number, h: number) => rec('fillRect', x, y, w, h),
  } as unknown as DrawTarget
  for (const key of STYLE_KEYS) {
    Object.defineProperty(target, key, {
      get: () => style[key],
      set: (v: unknown) => {
        style[key] = v
        rec('set', key, v)
      },
    })
  }
  return { target, ops }
}
