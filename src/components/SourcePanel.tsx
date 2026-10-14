import type { Diagnostic } from '../core/diagnostic.js'
import { DiagnosticList } from './DiagnosticList.js'

export interface SourceOptions {
  N: number
  close_mode: 'join' | 'mirror'
  longest_only: boolean
}

const N_CHOICES = [512, 1024, 2048, 4096]

const SELECT = 'border border-hairline bg-ink2 px-2 py-1 text-xs'

export function SourcePanel({
  file,
  paths,
  subpaths,
  blocked,
  options,
  diagnostics,
  onPick,
  onClear,
  onChange,
}: {
  file: { name: string } | null
  paths: number
  subpaths: number | null
  /** 预检有 error：画面没有切到这次上传 */
  blocked: boolean
  options: SourceOptions
  diagnostics: readonly Diagnostic[]
  onPick: (file: File) => void
  onClear: () => void
  onChange: (patch: Partial<SourceOptions>) => void
}) {
  return (
    <section aria-label="素材来源" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm text-mist/70">素材</h2>
        {file ? (
          <button type="button" onClick={onClear} className="text-xs text-mist/40 hover:text-mist">
            清除上传
          </button>
        ) : null}
      </div>

      <label className="cursor-pointer rounded-md border border-hairline bg-ink2 px-3 py-2 text-center text-sm hover:border-sage/60">
        <input
          type="file"
          accept=".svg,image/svg+xml,text/plain"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) onPick(picked)
            e.target.value = '' // 同一个文件再选一次也要触发
          }}
        />
        {file ? '换一个 SVG' : '上传 SVG'}
      </label>

      {file ? (
        <>
          <p className="truncate text-xs text-mist/50" title={file.name}>
            {file.name} · {paths} 条 path
            {subpaths === null ? '' : ` · ${subpaths} 段折线`}
          </p>
          {blocked ? <p className="text-xs text-clay">预检未通过，画面仍是当前预置形状。</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-mist/50">采样点数 N</span>
              <select
                aria-label="采样点数 N"
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
              <span className="text-mist/50">闭合方式</span>
              <select
                aria-label="闭合方式"
                value={options.close_mode}
                onChange={(e) => onChange({ close_mode: e.target.value as SourceOptions['close_mode'] })}
                className={SELECT}
              >
                <option value="join">直线闭合</option>
                <option value="mirror">镜像回扫</option>
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
            只取最长子路径
          </label>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-mist/40">
          上传含 &lt;path&gt; 的 SVG；直接把路径数据（以 M 开头）存成 .svg 或 .txt 也能用。
        </p>
      )}

      <DiagnosticList items={diagnostics} />
    </section>
  )
}
