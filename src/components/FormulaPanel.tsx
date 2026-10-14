import 'katex/dist/katex.min.css'
import katex from 'katex'
import { useMemo } from 'react'
import {
  FORMULA_MASTER,
  FORMULA_MAX_TERMS,
  FORMULA_TAIL,
  centerLatex,
  fmt,
  fmtDeg,
  seriesOf,
  termLatex,
  type SeriesRow,
} from '../core/series.js'
import type { Scene } from '../core/types.js'

/**
 * 公式面板（PRD A7 系数表 + A8 KaTeX 代入式）。
 * 本模块被 App 用 React.lazy 载入，KaTeX 的 JS 与 CSS 一起落在异步 chunk 里，不进首屏。
 * 公式片段按字符串缓存：反复点选高亮时不会重复排版。
 */
const cache = new Map<string, string>()

function latexToHtml(latex: string): string {
  const hit = cache.get(latex)
  if (hit !== undefined) return hit
  const html = katex.renderToString(latex, { strict: 'ignore', throwOnError: false })
  cache.set(latex, html)
  return html
}

function MathSpan({ latex, className }: { latex: string; className?: string }) {
  const html = useMemo(() => latexToHtml(latex), [latex])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

const GRID = 'grid grid-cols-[28px_46px_46px_minmax(0,1fr)_50px] gap-1'

function rowLabel(row: SeriesRow): string {
  return `系数 n=${row.n}，半径 ${fmt(row.radius)}，相位 ${fmtDeg(row.phaseDeg)} 度，贡献度 ${fmt(row.weight * 100)}%`
}

export default function FormulaPanel({
  scene,
  highlight,
  onSelect,
}: {
  scene: Scene
  highlight: number | null
  onSelect: (index: number | null) => void
}) {
  const series = useMemo(() => seriesOf(scene), [scene])
  const shown = series.rows.slice(0, FORMULA_MAX_TERMS)
  const omitted = series.rows.length - shown.length

  return (
    <section aria-label="傅里叶公式" className="border-t border-hairline pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-mist/70">公式</h2>
        <span className="font-mono text-xs tabular-nums text-mist/40">
          {scene.K} 项 · 共 {scene.M} 个系数
        </span>
      </div>

      <p className="mb-2 overflow-x-auto whitespace-nowrap text-xs text-mist/40">
        <MathSpan latex={FORMULA_MASTER} />
      </p>

      <p className="overflow-x-auto whitespace-nowrap text-sm" data-testid="formula">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label="常数项 c_0：路径质心，不旋转"
          title="常数项 c_0：路径质心，不旋转"
          className="rounded px-0.5 hover:bg-mist/5"
        >
          <MathSpan latex={centerLatex(series.center)} />
        </button>
        {shown.map((row, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={highlight === i}
            aria-label={rowLabel(row)}
            title={`第 ${i + 1} 大项：半径 ${fmt(row.radius)}，相位 ${fmtDeg(row.phaseDeg)}°`}
            className={highlight === i ? 'rounded bg-clay/20 px-0.5 text-clay' : 'rounded px-0.5 hover:bg-mist/5'}
          >
            <MathSpan latex={termLatex(row)} />
          </button>
        ))}
        {omitted > 0 ? (
          <span className="rounded px-0.5 text-mist/40" title={`另有 ${omitted} 项未展开`}>
            <MathSpan latex={FORMULA_TAIL} />
          </span>
        ) : null}
      </p>

      {series.rows.length === 0 ? (
        <p className="mt-3 text-xs text-mist/40">这个形状没有可参与的项。</p>
      ) : (
        <div aria-label="系数表" className="mt-3">
          <div className={`${GRID} border-b border-hairline px-1 pb-1 text-[10px] uppercase tracking-wide text-mist/35`}>
            <span>n</span>
            <span>|c|</span>
            <span>φ°</span>
            <span>c=a+bi</span>
            <span className="text-right">贡献</span>
          </div>
          {series.rows.map((row, i) => (
            <button
              key={i}
              type="button"
              data-testid="coeff-row"
              onClick={() => onSelect(i)}
              aria-pressed={highlight === i}
              aria-label={rowLabel(row)}
              className={`${GRID} w-full items-baseline rounded px-1 py-1 text-left font-mono text-[11px] tabular-nums ${
                highlight === i ? 'bg-clay/20 text-clay' : 'hover:bg-mist/5'
              }`}
            >
              <span>{row.n}</span>
              <span>{fmt(row.radius)}</span>
              <span>{fmtDeg(row.phaseDeg)}</span>
              <span className="truncate">{row.complex}</span>
              <span className="text-right">{fmt(row.weight * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-mist/40">
        点公式或表格里的一项，画面只显示它之前的圆链，再点一次恢复。n 为负是反向旋转。
      </p>
    </section>
  )
}
