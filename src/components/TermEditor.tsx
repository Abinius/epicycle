import type { PerNParam, Scene, Theta } from '../core/types.js'
import { fmt } from '../core/series.js'
import { Range } from './Range.js'

const PI = Math.PI

/**
 * L2 系数级编辑（PRD C2）：对被点选的频率 n 施加幅度倍率 γₙ、相位偏移 Δφₙ、隐藏。
 * 以频率 n（而非行下标）为锚：即便编辑把该项挤出 scene.terms，面板仍挂着原 n，
 * 调高 γₙ 即可恢复——不会因"行消失"而无法挽回。
 */
export function TermEditor({
  n,
  scene,
  perN,
  onPerN,
}: {
  n: number
  scene: Scene
  perN: Theta['perN']
  onPerN: (n: number, patch: Partial<PerNParam>) => void
}) {
  const term = scene.terms.find((t) => t.n === n) ?? null
  const p = perN[String(n)] ?? {}
  const s = p.s ?? 1
  const dphi = p.dphi ?? 0
  const off = p.off ?? false

  return (
    <section aria-label={`编辑频率 n=${n}`} className="border-t border-clay/30 pt-4" data-testid="term-editor">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm text-clay">编辑 n={n}</h2>
        <button
          type="button"
          onClick={() => onPerN(n, { s: undefined, dphi: undefined, off: undefined })}
          className="text-xs text-mist/50 hover:text-clay"
        >
          清除
        </button>
      </div>
      {term ? (
        <p className="mb-2 text-xs text-mist/45">
          半径 {fmt(term.radius)}，相位 {(term.phase * 180 / PI).toFixed(1)}°
        </p>
      ) : (
        <p className="mb-2 text-xs text-mist/45">该频率已被隐藏或过滤，调高倍率可恢复。</p>
      )}
      <div className="flex flex-col gap-3">
        <Range
          label="幅度倍率 γ"
          value={s}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => onPerN(n, { s: Number(v.toFixed(2)) })}
        />
        <Range
          label="相位偏移 Δφ (弧度)"
          value={dphi}
          min={-PI}
          max={PI}
          step={0.01}
          onChange={(v) => onPerN(n, { dphi: Number(v.toFixed(2)) })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => onPerN(n, { off: e.target.checked || undefined })}
            className="accent-sage"
          />
          <span className="text-mist/70">隐藏此项</span>
        </label>
      </div>
    </section>
  )
}
