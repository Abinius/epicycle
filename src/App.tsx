import { useMemo, useState } from 'react'
import { FourierStage, buildDemoScene } from './components/FourierStage.js'
import { formulaNames, formulas, type FormulaId } from './core/formulas.js'

const IDS = Object.keys(formulas) as FormulaId[]

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-mist/70">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-sage"
      />
      {hint ? <p className="text-xs leading-relaxed text-mist/35">{hint}</p> : null}
    </div>
  )
}

export default function App() {
  const [id, setId] = useState<FormulaId>('heart')
  const [k, setK] = useState(64)
  const [trail, setTrail] = useState(0.35)
  const [playing, setPlaying] = useState(true)

  const scene = useMemo(() => buildDemoScene(id, k), [id, k])

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-5 py-3">
        <h1 className="font-serif text-xl tracking-wide">傅里叶画板</h1>
        <span className="text-[11px] uppercase tracking-[0.2em] text-mist/40">FourierBoard</span>
        <span className="ml-auto hidden text-xs text-mist/40 sm:block">任何闭合曲线，都是一串同步旋转的圆</span>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_272px]">
        <section aria-label="渲染画布" className="relative min-h-0 overflow-hidden rounded-lg border border-hairline bg-paper">
          <FourierStage scene={scene} trail={trail} playing={playing} />
        </section>

        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto rounded-lg border border-hairline p-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-mist/70">形状</span>
            <select
              aria-label="形状"
              value={id}
              onChange={(e) => setId(e.target.value as FormulaId)}
              className="border border-hairline bg-ink2 px-2 py-1.5 text-sm"
            >
              {IDS.map((x) => (
                <option key={x} value={x}>
                  {formulaNames[x]}
                </option>
              ))}
            </select>
          </label>

          <Range
            label="项数 K"
            value={k}
            min={1}
            max={256}
            step={1}
            onChange={setK}
            hint="参与合成的圆个数，按振幅从大到小取。形状自带频谱时，K 再大也不会长出新的圆。"
          />

          <Range label="轨迹比例" value={trail} min={0} max={1} step={0.05} onChange={(v) => setTrail(Number(v.toFixed(2)))} />

          <div className="flex items-center gap-3 border-t border-hairline pt-4 text-sm">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-pressed={playing}
              className="rounded-md border border-hairline bg-ink2 px-4 py-2 hover:border-sage/60"
            >
              {playing ? '暂停' : '播放'}
            </button>
            <dl className="ml-auto text-xs text-mist/50">
              <dt>实际参与项</dt>
              <dd data-testid="terms" className="font-mono tabular-nums text-mist">
                {scene.terms.length} / {scene.M}
              </dd>
            </dl>
          </div>

          <p data-testid="shape-name" className="border-t border-hairline pt-4 text-xs leading-relaxed text-mist/45">
            当前：{formulaNames[id]}
          </p>
        </aside>
      </main>

      <footer className="border-t border-hairline px-5 py-2 text-xs text-mist/40">
        全部在浏览器本地计算，不上传、不收集、无需账号
      </footer>
    </div>
  )
}
