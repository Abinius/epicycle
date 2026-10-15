import type { Diagnostic } from '../core/diagnostic.js'
import type { FourierAsset } from '../core/types.js'
import { useT } from '../i18n/context.js'
import { DiagnosticList } from './DiagnosticList.js'

/** 当前画面已被冻结成的资产（只记身份，系数仍以上面那份为准） */
export interface Frozen {
  id: string
  name: string
}

const ACTION = 'rounded border border-hairline bg-ink2 px-2 py-0.5 hover:border-sage/60'

/**
 * 资产库（PRD A12）：冻结 / 打开 / 导出 / 删除 / 导入。
 * 冻结保存的是动画的数学定义（系数 + 取样参数 + 来源），不是画面本身。
 */
export function AssetPanel({
  frozen,
  assets,
  diagnostics,
  busy,
  onFreeze,
  onOpen,
  onExport,
  onDelete,
  onImport,
}: {
  frozen: Frozen | null
  assets: readonly FourierAsset[]
  diagnostics: readonly Diagnostic[]
  busy: boolean
  onFreeze: () => void
  onOpen: (asset: FourierAsset) => void
  onExport: (asset: FourierAsset) => void
  onDelete: (asset: FourierAsset) => void
  onImport: (file: File) => void
}) {
  const t = useT()
  return (
    <section aria-label={t('资产库')} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-mist/70">{t('资产库')}</h2>
        <button
          type="button"
          onClick={onFreeze}
          disabled={busy}
          className="rounded-md border border-hairline bg-ink2 px-3 py-1.5 text-sm hover:border-sage/60 disabled:opacity-40"
        >
          {t('冻结为资产')}
        </button>
      </div>

      <p data-testid="freeze-state" className="text-xs leading-relaxed text-mist/45">
        {frozen
          ? t('已冻结：{name} · {id}', { name: frozen.name, id: frozen.id })
          : t('试算中——冻结后系数不再变，可以用任意数值反复演绎')}
      </p>

      {assets.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {assets.map((a) => (
            <li
              key={a.id}
              data-testid="asset-row"
              className="flex items-center gap-2 border border-hairline px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate" title={`${a.name} · ${a.id}`}>
                {a.name}
                <span className="ml-1.5 font-mono text-mist/35">{a.id}</span>
              </span>
              <button type="button" className={ACTION} onClick={() => onOpen(a)}>
                {t('打开')}
              </button>
              <button type="button" className={ACTION} onClick={() => onExport(a)}>
                {t('导出')}
              </button>
              <button type="button" className={ACTION} onClick={() => onDelete(a)}>
                {t('删除')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-mist/35">{t('还没有资产。冻结一个形状就会出现在这里。')}</p>
      )}

      <label className="cursor-pointer rounded border border-hairline px-3 py-1.5 text-center text-xs hover:border-sage/60">
        <input
          type="file"
          accept=".json,application/json"
          aria-label={t('导入资产 JSON')}
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (picked) onImport(picked)
            e.target.value = ''
          }}
        />
        {t('导入 JSON')}
      </label>

      <DiagnosticList items={diagnostics} />
    </section>
  )
}
