import type { Diagnostic } from '../core/diagnostic.js'
import type { Stroke } from '../core/strokes.js'
import { useT } from '../i18n/context.js'
import { DiagnosticList } from './DiagnosticList.js'
import { DrawCanvas } from './DrawCanvas.js'

export interface SourceOptions {
  N: number
  close_mode: 'join' | 'mirror'
  longest_only: boolean
}

/** 素材页签：上传文件，还是手绘 */
export type SourceTab = 'svg' | 'draw'

const N_CHOICES = [512, 1024, 2048, 4096]

const SELECT = 'border border-hairline bg-ink2 px-2 py-1 text-xs'

const TAB = 'rounded border px-2 py-1 text-xs'

export function SourcePanel({
  tab,
  onTab,
  file,
  paths,
  strokes,
  onStrokes,
  subpaths,
  blocked,
  options,
  diagnostics,
  onPick,
  onClear,
  onChange,
}: {
  tab: SourceTab
  onTab: (tab: SourceTab) => void
  /** 已载入的上传文件 */
  file: { name: string } | null
  /** 抽到的 path 条数 */
  paths: number
  strokes: readonly Stroke[]
  onStrokes: (next: Stroke[]) => void
  subpaths: number | null
  /** 预检有 error：画面没有切到这次素材 */
  blocked: boolean
  options: SourceOptions
  diagnostics: readonly Diagnostic[]
  onPick: (file: File) => void
  onClear: () => void
  onChange: (patch: Partial<SourceOptions>) => void
}) {
  const t = useT()
  const hasSource = tab === 'svg' ? file !== null : strokes.length > 0

  return (
    <section aria-label={t('素材来源')} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-mist/70">{t('素材')}</h2>
        {tab === 'svg' && file ? (
          <button type="button" onClick={onClear} className="text-xs text-mist/40 hover:text-mist">
            {t('清除上传')}
          </button>
        ) : null}
      </div>

      <div className="flex gap-1">
        {(['svg', 'draw'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => onTab(id)}
            className={`${TAB} ${tab === id ? 'border-sage bg-ink2 text-mist' : 'border-hairline text-mist/50 hover:border-sage/60'}`}
          >
            {t(id === 'svg' ? '上传 SVG' : '手绘')}
          </button>
        ))}
      </div>

      {tab === 'svg' ? (
        <>
          <label className="cursor-pointer rounded-md border border-hairline bg-ink2 px-3 py-2 text-center text-sm hover:border-sage/60">
            <input
              type="file"
              accept=".svg,image/svg+xml,text/plain"
              aria-label={t('上传 SVG 文件')}
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0]
                if (picked) onPick(picked)
                e.target.value = '' // 同一个文件再选一次也要触发
              }}
            />
            {t(file ? '换一个 SVG' : '上传 SVG')}
          </label>

          {file ? (
            <p className="truncate text-xs text-mist/50" title={file.name}>
              {t('{name} · {n} 条 path', { name: file.name, n: paths })}
              {subpaths === null ? '' : t(' · {n} 段折线', { n: subpaths })}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-mist/40">
              {t('上传含 <path> 的 SVG；直接把路径数据（以 M 开头）存成 .svg 或 .txt 也能用。')}
            </p>
          )}
        </>
      ) : (
        <DrawCanvas strokes={strokes} onChange={onStrokes} />
      )}

      {blocked ? <p className="text-xs text-clay">{t('预检未通过，画面仍是当前预置形状。')}</p> : null}

      {hasSource ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-mist/50">{t('采样点数 N')}</span>
              <select
                aria-label={t('采样点数 N')}
                value={options.N}
                onChange={(e) => onChange({ N: Number(e.target.value) })}
                className={SELECT}
              >
                {N_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-mist/50">{t('闭合方式')}</span>
              <select
                aria-label={t('闭合方式')}
                value={options.close_mode}
                onChange={(e) => onChange({ close_mode: e.target.value as SourceOptions['close_mode'] })}
                className={SELECT}
              >
                <option value="join">{t('直线闭合')}</option>
                <option value="mirror">{t('镜像回扫')}</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-mist/60">
            <input
              type="checkbox"
              checked={options.longest_only}
              onChange={(e) => onChange({ longest_only: e.target.checked })}
              className="accent-sage"
            />
            {t('只取最长子路径')}
          </label>
        </>
      ) : null}

      <DiagnosticList items={diagnostics} />
    </section>
  )
}
