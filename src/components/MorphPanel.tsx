import type { FourierAsset } from '../core/types.js'
import { useT } from '../i18n/context.js'
import { Range } from './Range.js'

/** 过渡状态：两端各指一份库里的资产，w ∈ [0,1] */
export interface MorphState {
  a: string
  b: string
  w: number
}

const SELECT = 'border border-hairline bg-ink2 px-2 py-1 text-xs'

/**
 * PRD §4.3 的双资产过渡：两端各取一份冻结资产，w 一滑，形状就在两者之间连续变形。
 *
 * 「零额外数学成本」的由来：任意复数序列都是某条闭合曲线的傅里叶系数（§2.4），
 * 凸组合仍是复数序列，所以每个中间态天生是闭合曲线——不插值曲线、不重采样形状，
 * 只把两边的 cₙ 按同一个 w 掺在一起。
 */
export function MorphPanel({
  assets,
  morph,
  onMorph,
}: {
  assets: readonly FourierAsset[]
  morph: MorphState | null
  onMorph: (next: MorphState | null) => void
}) {
  const t = useT()
  const enough = assets.length >= 2

  // 两端不能重合：a===b 时 blend === a，再冻结会拿 a 的 id 静默覆盖原资产（名字/来源被改写）
  const pickOther = (taken: string) => assets.find((x) => x.id !== taken)?.id ?? taken

  return (
    <section aria-label={t('形状过渡')} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-mist/70">{t('过渡')}</h2>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            aria-label={t('启用过渡')}
            data-testid="morph-toggle"
            disabled={!enough}
            checked={morph !== null}
            onChange={(e) =>
              onMorph(e.target.checked ? { a: assets[0].id, b: assets[1].id, w: 0.5 } : null)
            }
            className="accent-sage disabled:opacity-40"
          />
          <span className="text-mist/60">{t('启用')}</span>
        </label>
      </div>

      {morph === null ? (
        <p className="text-xs leading-relaxed text-mist/35">
          {enough
            ? t('在库里的两份资产之间做连续形变，两端与各自原图逐位相同。')
            : t('库里至少要有两份资产才能做过渡——先冻结两个形状。')}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mist/70">{t('起点')}</span>
            <select
              aria-label={t('过渡起点')}
              className={SELECT}
              value={morph.a}
              onChange={(e) => {
                const a = e.target.value
                const b = a === morph.b ? pickOther(a) : morph.b
                onMorph({ ...morph, a, b })
              }}
            >
              {assets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mist/70">{t('终点')}</span>
            <select
              aria-label={t('过渡终点')}
              className={SELECT}
              value={morph.b}
              onChange={(e) => {
                const b = e.target.value
                const a = b === morph.a ? pickOther(b) : morph.a
                onMorph({ ...morph, a, b })
              }}
            >
              {assets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>

          <Range
            label={t('过渡 w')}
            value={morph.w}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMorph({ ...morph, w: Number(v.toFixed(2)) })}
            hint={t('0 与 1 处逐位等于两端原图；中间态永远是闭合曲线。')}
          />
        </>
      )}
    </section>
  )
}
