import type { Diagnostic, Severity } from '../core/diagnostic.js'
import { useLang } from '../i18n/context.js'
import { diagnosticText } from '../i18n/dict.js'

/** 技术文档 §10 要求所有文案走同一个组件，不让错误散落在各处 */
const TONE: Record<Severity, string> = {
  error: 'border-clay text-clay',
  warn: 'border-clay/40 text-mist/80',
  info: 'border-hairline text-mist/60',
}

const GLYPH: Record<Severity, string> = { error: '✕', warn: '!', info: 'i' }

/** 屏幕阅读器用的严重度前缀；中文用全角冒号，英文用半角 */
const TITLE: Record<Severity, string> = { error: '错误', warn: '注意', info: '提示' }

export function DiagnosticList({ items }: { items: readonly Diagnostic[] }) {
  const { lang, t } = useLang()
  if (items.length === 0) return null
  return (
    <ul aria-label={t('预检诊断')} className="flex flex-col gap-2">
      {items.map((d) => {
        // core 只出中文；英文按诊断编号映射（编号是 §10 的契约，比按原文匹配稳）
        const text = diagnosticText(lang, d)
        return (
          <li key={d.id} className={`flex gap-2 border-l-2 pl-2 ${TONE[d.severity]}`}>
            <span aria-hidden className="font-mono text-xs leading-5">
              {GLYPH[d.severity]}
            </span>
            <span className="text-xs leading-relaxed">
              <span className="sr-only">
                {t(TITLE[d.severity])}
                {lang === 'zh' ? '：' : ': '}
              </span>
              {text.message}
              <span className="mt-0.5 block text-mist/40">{text.hint}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
