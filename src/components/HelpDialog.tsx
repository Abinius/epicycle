import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  clearMetrics,
  medianMs,
  metricsEnabled,
  readMetrics,
  setMetricsEnabled,
  type Metric,
} from '../engine/metrics.js'
import { useLang } from '../i18n/context.js'
import { SHORTCUT_HINTS } from '../engine/useShortcuts.js'

/**
 * 关于与帮助（开发计划 M6 文档项）。用原生 `<dialog>` + `showModal()`：
 * 焦点陷阱、Escape 关闭、背景 inert 都是浏览器给的，自己搭容易漏掉某一条。
 */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useLang()
  const ref = useRef<HTMLDialogElement | null>(null)
  const [tracking, setTracking] = useState(metricsEnabled)
  const [rows, setRows] = useState<Metric[]>(readMetrics)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      // 每次打开都重读：留档可能在别处被清过
      setRows(readMetrics())
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  const names = [...new Set(rows.map((r) => r.name))]

  return (
    <dialog
      ref={ref}
      aria-labelledby="help-title"
      onClose={onClose}
      className="m-auto max-h-[85dvh] w-[min(92vw,42rem)] overflow-y-auto rounded-lg border border-hairline bg-ink2 p-5 text-sm text-mist backdrop:bg-ink/80"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="help-title" className="font-serif text-lg tracking-wide">
          {t('关于与帮助')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-hairline bg-ink px-2 py-1 text-xs hover:border-sage/60"
        >
          {t('关闭')}
        </button>
      </div>

      <Section title={t('快捷键')}>
        <dl className="flex flex-col gap-1">
          {SHORTCUT_HINTS.map(([key, what]) => (
            <div key={key} className="flex items-baseline gap-3">
              <dt className="w-16 shrink-0">
                <kbd className="rounded border border-hairline bg-ink px-1 py-0.5 font-mono text-xs">{t(key)}</kbd>
              </dt>
              <dd className="text-mist/70">{t(what)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-mist/45">
          {t('焦点在输入框或下拉里时快捷键会让路，不会跟打字打架。')}
        </p>
      </Section>

      <Section title={t('怎么导出一条单路径 SVG')}>
        <p className="leading-relaxed text-mist/70">
          {t('本工具只读 <path> 的 d 属性——不解析 <rect> / <circle> / <polygon>，也不读 <image>。所以先把它变成一条路径：')}
        </p>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 leading-relaxed text-mist/70">
          {(lang === 'zh' ? SVG_HELP_ZH : SVG_HELP_EN).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title={t('隐私')}>
        <p className="leading-relaxed text-mist/70">
          {t('全部在浏览器本地计算：不上传、不收集、不需要账号。没有后端，也没有第三方统计脚本，页面不会向外发任何请求。')}
        </p>
        <p className="mt-2 leading-relaxed text-mist/70">
          {t('你冻结的资产存在浏览器自己的 IndexedDB 里，清掉站点数据就没了——要长期留存请用「导出 JSON」。')}
        </p>
      </Section>

      <Section title={t('素材与版权')}>
        <p className="leading-relaxed text-mist/70">
          {t('你上传的素材、生成的公式与导出的文件都归你，本工具不主张任何权利、也不会把它们传到任何地方。请自行确认上传的素材你有权使用。')}
        </p>
      </Section>

      <Section title={t('本地性能留档')}>
        <p className="leading-relaxed text-mist/70">
          {t('为了知道自己慢在哪，本工具会在你自己的浏览器里留最近 50 条匿名耗时（DFT、导出等）。它不会离开这台设备，关掉或清空后立即生效。')}
        </p>
        <label className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="metrics-toggle"
            checked={tracking}
            onChange={(e) => {
              setTracking(e.target.checked)
              setMetricsEnabled(e.target.checked)
              setRows(readMetrics())
            }}
            className="accent-sage"
          />
          <span className="text-mist/70">{t('记录本地性能数字')}</span>
        </label>

        {tracking && (
          <div className="mt-3 flex flex-col gap-2">
            {names.length === 0 ? (
              <p className="text-xs text-mist/45">{t('还没有记录。')}</p>
            ) : (
              <dl data-testid="metrics-table" className="flex flex-col gap-1 text-xs">
                {names.map((n) => (
                  <div key={n} className="flex justify-between gap-4">
                    <dt className="font-mono text-mist/60">{n}</dt>
                    <dd className="font-mono tabular-nums text-mist/80">
                      {t('中位 {v} ms · {n} 条', { v: medianMs(rows, n)?.toFixed(1) ?? '—', n: rows.filter((r) => r.name === n).length })}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <button
              type="button"
              data-testid="metrics-clear"
              disabled={rows.length === 0}
              onClick={() => {
                clearMetrics()
                setRows([])
              }}
              className="self-start rounded border border-hairline bg-ink px-2 py-1 text-xs hover:border-clay/60 disabled:opacity-40"
            >
              {t('清空记录')}
            </button>
          </div>
        )}
      </Section>
    </dialog>
  )
}

const SVG_HELP_ZH = [
  'Figma：选中图形 → 右键「Outline stroke」（描边转轮廓）→ 导出 SVG，勾掉「Include id」。',
  'Illustrator：「对象 → 路径 → 轮廓化描边」，再「对象 → 路径 → 简化」，另存为 SVG。',
  'Inkscape：「路径 → 描边转路径」，再「路径 → 简化」，另存为普通 SVG。',
  '如果原图有多条路径，先「对象 → 路径 → 合并」，或上传后在「只取最长子路径」里只留一条。',
]

const SVG_HELP_EN = [
  'Figma: select the shape → right-click “Outline stroke” → export as SVG, with “Include id” unchecked.',
  'Illustrator: Object → Path → Outline Stroke, then Object → Path → Simplify, and save as SVG.',
  'Inkscape: Path → Stroke to Path, then Path → Simplify, and save as a plain SVG.',
  'If the artwork has several paths, merge them first (Object → Path → Unite), or upload and keep just one with “Longest subpath only”.',
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-hairline pt-4">
      <h3 className="mb-2 text-xs uppercase tracking-[0.15em] text-mist/45">{title}</h3>
      {children}
    </section>
  )
}
