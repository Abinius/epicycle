/**
 * 手绘笔迹 → SVG path 数据。
 *
 * core 不碰画布：笔画由 UI 层采集成点列后交到这里，产出的 path 数据与上传的 SVG
 * 走同一条采样管线——多笔就是多条子路径，由采样器按「最近端点」串接，没有第二条代码路径。
 */

/** 一笔 = 交错的扁平坐标 `[x0,y0,x1,y1,...]`，SVG 坐标系（y 向下） */
export type Stroke = readonly number[]

/** 采集时的最小点距（CSS 像素）：比这更近的点只是手抖，采样器还得为它多跑一轮 */
export const MIN_POINT_STEP = 1

/** 新点是否值得收进当前笔画。非有限值（设备给的脏坐标）一律拒收 */
export function shouldAppend(stroke: Stroke, x: number, y: number, minStep = MIN_POINT_STEP): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (stroke.length < 2) return true
  return Math.hypot(x - stroke[stroke.length - 2], y - stroke[stroke.length - 1]) >= minStep
}

/** 保留两位小数：远低于像素精度，却让 path 文本小一个量级，且同样输入必得同样文本 */
const round2 = (v: number): number => Math.round(v * 100) / 100

/**
 * 若干笔 → 一条 path 数据，每笔一条子路径。
 * 只有一个点的笔画被丢掉——采样器要的是线，不是一个点。
 */
export function strokesToPath(strokes: readonly Stroke[]): string {
  const parts: string[] = []
  for (const stroke of strokes) {
    if (stroke.length < 4) continue
    const pts: string[] = []
    for (let i = 0; i < stroke.length; i += 2) pts.push(`${round2(stroke[i])} ${round2(stroke[i + 1])}`)
    parts.push(`M ${pts[0]} L ${pts.slice(1).join(' ')}`)
  }
  return parts.join(' ')
}
