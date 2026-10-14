import { fmt } from '../core/series.js'
import { type Spectrum, type SpectrumBin } from '../core/spectrum.js'

/**
 * 振幅频谱（PRD A9）：自绘柱状图，横轴是有符号频率 n，柱高是 |c_n|。
 * 左半轴 −n 反向旋转，右半轴 +n 正向旋转；亮色是当前参与项，暗色被项数 K 截断。
 * 点一根柱走与系数表同一次联动。
 */

/** 最小柱高（百分比）：再小的柱在 64px 的图里看不见，先顶到看得见的下限 */
const MIN_BAR_HEIGHT = 3

/** 单槽宽度上限：带限形状只有几根柱，不封顶会变成大色块 */
const SLOT_MAX_WIDTH = 'max-w-5'

function Bar({
  bin,
  peak,
  selected,
  onSelect,
}: {
  bin: SpectrumBin
  peak: number
  selected: boolean
  onSelect: (index: number | null) => void
}) {
  if (bin.magnitude <= 0) return <span aria-hidden className={`min-w-0 flex-1 ${SLOT_MAX_WIDTH}`} />

  const label = `频率 n=${bin.n}，振幅 ${fmt(bin.magnitude)}，${bin.row === null ? '被项数截断' : `参与（系数表第 ${bin.row + 1} 项）`}`
  const height = Math.max(MIN_BAR_HEIGHT, (bin.magnitude / peak) * 100)
  const color = selected ? 'bg-clay' : bin.row === null ? 'bg-mist/20' : 'bg-sage'
  const bar = <span className={`block w-[calc(100%-1px)] ${color}`} style={{ height: `${height}%` }} />

  if (bin.row === null) {
    // 未参与项没有可点选的行，只留 tooltip 说明它的振幅
    return (
      <span aria-hidden className={`flex min-w-0 flex-1 items-end ${SLOT_MAX_WIDTH}`} title={label}>
        {bar}
      </span>
    )
  }

  return (
    <button
      type="button"
      data-testid="spectrum-bar"
      onClick={() => onSelect(bin.row)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`flex min-w-0 flex-1 items-end outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-clay ${SLOT_MAX_WIDTH}`}
    >
      {bar}
    </button>
  )
}

export function SpectrumPanel({
  spectrum,
  highlight,
  onSelect,
}: {
  spectrum: Spectrum
  highlight: number | null
  onSelect: (index: number | null) => void
}) {
  const { negative, positive, top, maxAn, frequencies, peak } = spectrum
  const empty = top <= 0

  return (
    <section aria-label="振幅频谱" className="border-t border-hairline pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-mist/70">频谱</h2>
        <span className="font-mono text-xs tabular-nums text-mist/40">峰值 {fmt(peak)}</span>
      </div>

      {empty ? (
        <p className="text-xs leading-relaxed text-mist/40">这个形状没有可参与的频率。</p>
      ) : (
        <>
          <div className="flex h-16 justify-center border-b border-hairline">
            {negative.map((bin) => (
              <Bar key={bin.n} bin={bin} peak={peak} selected={highlight === bin.row} onSelect={onSelect} />
            ))}
            <span aria-hidden className="w-px flex-none self-stretch bg-hairline" />
            {positive.map((bin) => (
              <Bar key={bin.n} bin={bin} peak={peak} selected={highlight === bin.row} onSelect={onSelect} />
            ))}
          </div>

          <div className="mt-1 flex justify-between font-mono text-[10px] text-mist/35">
            <span>n=-{top}</span>
            <span>0</span>
            <span>n={top}</span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-mist/40">
            左半轴 −n 反向旋转，右半轴 +n 正向旋转，柱高是 |c_n|。亮色是当前参与的项，暗色被项数 K 截断；
            点一根柱，画面只画到它为止。
          </p>
          {maxAn > top ? (
            <p className="mt-1 text-xs text-mist/35">
              共 {frequencies} 个非零系数，这里显示 |n| ≤ {top} 的部分。
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
