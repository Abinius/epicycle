import { useEffect, useRef } from 'react'
import { shouldAppend, type Stroke } from '../core/strokes.js'

/**
 * 手绘输入（PRD A2）：指针事件一套代码同时管鼠标、触屏与触控笔。
 *
 * 这个组件只负责「看见并记下笔画」——采样与傅里叶由上层按上传同一条管线处理，
 * 坐标就是 CSS 像素（与画布同尺度），y 向下与 SVG 一致，采样器会翻成数学坐标。
 */
export function DrawCanvas({
  strokes,
  onChange,
}: {
  strokes: readonly Stroke[]
  onChange: (next: Stroke[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  /** 正在画的那一笔；抬手才并入 strokes */
  const pending = useRef<number[] | null>(null)
  // 挂载时装的 ResizeObserver 要能读到最新笔迹，故经 ref 透传
  const latest = useRef(strokes)
  latest.current = strokes

  const paint = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // 之后一律用 CSS 像素坐标
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    ctx.strokeStyle = '#0E1513'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const all: readonly Stroke[] = pending.current ? [...latest.current, pending.current] : latest.current
    for (const stroke of all) {
      if (stroke.length < 4) continue
      ctx.beginPath()
      ctx.moveTo(stroke[0], stroke[1])
      for (let i = 2; i < stroke.length; i += 2) ctx.lineTo(stroke[i], stroke[i + 1])
      ctx.stroke()
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      paint()
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(canvas)
    return () => resize.disconnect()
  }, [])

  // 笔画增删（撤销 / 清空 / 抬手）后整幅重画，不必给每种操作各写一条重绘路径
  useEffect(() => {
    paint()
  }, [strokes])

  const local = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        aria-label="手绘区"
        className="block h-44 w-full cursor-crosshair touch-none rounded border border-hairline bg-paper"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return // 鼠标只认左键
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          pending.current = local(e)
          paint()
        }}
        onPointerMove={(e) => {
          const cur = pending.current
          if (!cur) return
          const [x, y] = local(e)
          if (!shouldAppend(cur, x, y)) return
          cur.push(x, y)
          paint()
        }}
        onPointerUp={() => {
          const cur = pending.current
          pending.current = null
          // 只有一个点的「笔画」是误触，不是线，丢掉
          if (cur && cur.length >= 4) onChange([...strokes, cur])
          else paint()
        }}
        onPointerCancel={() => {
          pending.current = null
          paint()
        }}
      />

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={strokes.length === 0}
          onClick={() => onChange(strokes.slice(0, -1))}
          className="rounded border border-hairline bg-ink2 px-2 py-1 hover:border-sage/60 disabled:opacity-40"
        >
          撤销上一笔
        </button>
        <button
          type="button"
          disabled={strokes.length === 0}
          onClick={() => onChange([])}
          className="rounded border border-hairline bg-ink2 px-2 py-1 hover:border-sage/60 disabled:opacity-40"
        >
          清空
        </button>
        <span data-testid="stroke-count" className="ml-auto text-mist/40">
          {strokes.length} 笔
        </span>
      </div>
    </div>
  )
}
