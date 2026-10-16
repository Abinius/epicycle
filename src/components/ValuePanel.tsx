import type { Theta } from '../core/types.js'
import { useT } from '../i18n/context.js'
import { Range } from './Range.js'

const TAU = Math.PI * 2

type BandMode = 'all' | 'low' | 'high'

function bandMode(b: Theta['band']): BandMode {
  if (!b) return 'all'
  return b.lo <= 0 ? 'low' : 'high'
}

function bandCutoff(b: Theta['band']): number {
  if (!b) return 16
  return b.lo <= 0 ? b.hi : b.lo
}

/**
 * L1 全局参数 + 全局 L2 算子（PRD C2）。
 * 所有控件都直写 Theta 的对应字段，buildScene 在主线程重算（模式 X，不触发 DFT）。
 */
export function ValuePanel({
  theta,
  onPatch,
  onReset,
}: {
  theta: Theta
  onPatch: (p: Partial<Theta>) => void
  onReset: () => void
}) {
  const t = useT()
  const mode = bandMode(theta.band)
  const cutoff = Math.min(bandCutoff(theta.band), 128)

  return (
    <section aria-label={t('参数面板')} className="flex flex-col gap-4 border-t border-hairline pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-mist/70">{t('参数')}</h2>
        <button type="button" onClick={onReset} className="text-xs text-mist/50 hover:text-clay">
          {t('重置')}
        </button>
      </div>

      <Range
        label={t('项数 K')}
        value={theta.K}
        min={1}
        max={256}
        step={1}
        onChange={(v) => onPatch({ K: v })}
        hint={t('参与合成的圆个数，按振幅从大到小取。形状自带频谱时，K 再大也不会长出新的圆。')}
      />
      <Range
        label={t('轨迹比例')}
        value={theta.trail}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => onPatch({ trail: Number(v.toFixed(2)) })}
      />
      <Range
        label={t('整体缩放')}
        value={theta.scale}
        min={0.1}
        max={5}
        step={0.1}
        onChange={(v) => onPatch({ scale: Number(v.toFixed(2)) })}
        hint={t('关于质心整体放大或缩小整条曲线与圆链。')}
      />
      <Range
        label={t('全局相位 (弧度)')}
        value={theta.phaseShift}
        min={0}
        max={TAU}
        step={0.01}
        onChange={(v) => onPatch({ phaseShift: Number(v.toFixed(2)) })}
      />
      <Range
        label={t('周期 T (秒)')}
        value={theta.T}
        min={0.5}
        max={10}
        step={0.1}
        onChange={(v) => onPatch({ T: Number(v.toFixed(1)) })}
      />
      <Range
        label={t('播放速度')}
        value={theta.speed}
        min={0.1}
        max={4}
        step={0.1}
        onChange={(v) => onPatch({ speed: Number(v.toFixed(2)) })}
      />
      <Range
        label={t('相位斜坡 β')}
        value={theta.slope}
        min={-TAU}
        max={TAU}
        step={0.01}
        onChange={(v) => onPatch({ slope: Number(v.toFixed(2)) })}
        hint={t('Δφ_n = β·n，等价于时间平移 β/2π。')}
      />

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-mist/70">{t('频段过滤')}</span>
          <select
            aria-label={t('频段模式')}
            value={mode}
            onChange={(e) => {
              const m = e.target.value as BandMode
              if (m === 'all') onPatch({ band: null })
              else if (m === 'low') onPatch({ band: { lo: 0, hi: cutoff } })
              else onPatch({ band: { lo: cutoff, hi: Infinity } })
            }}
            className="border border-hairline bg-ink2 px-1.5 py-1 text-xs"
          >
            <option value="all">{t('全频')}</option>
            <option value="low">{t('低通')}</option>
            <option value="high">{t('高通')}</option>
          </select>
        </div>
        {mode !== 'all' && (
          <input
            type="range"
            aria-label={t('截止频率')}
            min={1}
            max={128}
            step={1}
            value={cutoff}
            onChange={(e) => {
              const c = Number(e.target.value)
              if (mode === 'low') onPatch({ band: { lo: 0, hi: c } })
              else onPatch({ band: { lo: c, hi: Infinity } })
            }}
            className="accent-sage"
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={theta.equalize}
          onChange={(e) => onPatch({ equalize: e.target.checked })}
          className="accent-sage"
        />
        <span className="text-mist/70">{t('等权化（所有圆同半径）')}</span>
      </label>
    </section>
  )
}
