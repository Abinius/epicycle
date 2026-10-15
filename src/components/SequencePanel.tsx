import { useRef, useState } from 'react'
import { sequencePerN, sequenceSlots, toValues, type SequenceSource } from '../core/sequence.js'
import type { Coefficient, Theta } from '../core/types.js'
import { useT } from '../i18n/context.js'

const SELECT = 'border border-hairline bg-ink2 px-2 py-1 text-xs'

const MODES: Array<{ id: SequenceSource; label: string }> = [
  { id: 'manual', label: '数字' },
  { id: 'text', label: '文本' },
  { id: 'seed', label: '随机种子' },
]

export interface SequencePatch {
  perN: Theta['perN']
  K: number
  T: number
}

/**
 * L3 数值序列注入（PRD §4.2）。把一串数字铺到系数上：幅度槽与相位槽各自线性映射，
 * 于是「输入相近 → 动画相近」，同一个种子 / 同一段文本永远给同一段动画。
 *
 * 注入的落点是 L2 的 perN（幅度倍率与相位偏移），走的是模式 X——改的全是系数上的乘法
 * 与加法，一帧 DFT 都不触发。
 */
export function SequencePanel({
  coeffs,
  K,
  T,
  onApply,
}: {
  coeffs: readonly Coefficient[]
  /** 当前项数与周期：注入会改它们，清除时要还回去 */
  K: number
  T: number
  onApply: (patch: SequencePatch) => void
}) {
  const t = useT()
  const [mode, setMode] = useState<SequenceSource>('manual')
  const [raw, setRaw] = useState('')
  const [seed, setSeed] = useState(7)
  const [note, setNote] = useState<string | null>(null)
  /** 注入前的 K / T：清除时还回去，不然用户原来的设置就被序列悄悄改掉了 */
  const before = useRef<{ K: number; T: number } | null>(null)

  const M = Math.max(1, coeffs.length - 1)

  const input = mode === 'seed' ? { source: 'seed' as const, seed, count: 32 } : { source: mode, raw }

  const apply = () => {
    const values = toValues(input)
    if (values.length === 0) {
      setNote(t('没解析出数字。数字用逗号或空格分隔；文本模式则逐字取码。'))
      return
    }
    // 只在第一次注入时记住原值；连续注入多次，清除还是要回到最开始那份
    if (before.current === null) before.current = { K, T }
    const slots = sequenceSlots(values, M)
    onApply({ perN: sequencePerN(coeffs, slots), K: slots.K, T: Number(slots.T.toFixed(2)) })
    setNote(
      t('已注入 {n} 个数：{k} 项，周期 {T} 秒', {
        n: values.length,
        k: slots.K,
        T: slots.T.toFixed(2),
      }),
    )
  }

  const clear = () => {
    const b = before.current
    onApply({ perN: {}, K: b?.K ?? K, T: b?.T ?? T })
    before.current = null
    setNote(null)
  }

  const loadFile = async (f: File) => {
    const text = await f.text()
    // 能解析成数字就当数字序列，否则当文本（逐字取码）——不让用户为后缀名操心
    const numeric = toValues({ source: 'manual', raw: text }).length > 0
    setMode(numeric ? 'manual' : 'text')
    setRaw(text)
    setNote(t('已读入 {name}，点「注入」生效。', { name: f.name }))
  }

  return (
    <section aria-label={t('数值序列')} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-mist/70">{t('数值序列')}</h2>
        <button type="button" onClick={clear} className="text-xs text-mist/40 hover:text-mist">
          {t('清除注入')}
        </button>
      </div>

      <div className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={mode === m.id}
            data-testid={`seq-mode-${m.id}`}
            onClick={() => setMode(m.id)}
            className={`rounded border px-2 py-1 text-xs ${
              mode === m.id ? 'border-sage bg-ink2 text-mist' : 'border-hairline text-mist/50 hover:border-sage/60'
            }`}
          >
            {t(m.label)}
          </button>
        ))}
      </div>

      {mode === 'seed' ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-mist/70">{t('种子')}</span>
          <input
            type="number"
            aria-label={t('种子')}
            data-testid="seq-seed"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            className={`${SELECT} w-24`}
          />
          <span className="text-xs text-mist/40">{t('同种子必得同动画')}</span>
        </label>
      ) : (
        <textarea
          aria-label={t('序列输入')}
          data-testid="seq-input"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder={mode === 'text' ? 'Abin' : '12, 340, 8, 77'}
          className="w-full resize-y border border-hairline bg-ink2 px-2 py-1 font-mono text-xs"
        />
      )}

      <label className="cursor-pointer rounded border border-hairline px-3 py-1 text-center text-xs hover:border-sage/60">
        <input
          type="file"
          accept=".csv,.txt,text/plain,text/csv"
          aria-label={t('读入序列文件')}
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) void loadFile(picked)
            e.target.value = ''
          }}
        />
        {t('读入文件（.csv / .txt）')}
      </label>

      <button
        type="button"
        data-testid="seq-apply"
        onClick={apply}
        className="rounded-md border border-hairline bg-ink2 px-3 py-1.5 text-sm hover:border-sage/60"
      >
        {t('注入')}
      </button>

      {note && (
        <p data-testid="seq-note" className="text-xs leading-relaxed text-mist/50">
          {note}
        </p>
      )}
      <p className="text-xs leading-relaxed text-mist/35">
        {t('幅度与相位都按线性映射铺开，不做取模或哈希——所以输入相近，动画就相近。')}
      </p>
    </section>
  )
}
