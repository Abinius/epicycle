import type { Diagnostic, Severity } from '../core/diagnostic.js'

/** 技术文档 §10 要求所有文案走同一个组件，不让错误散落在各处 */
const TONE: Record<Severity, string> = {
  error: 'border-clay text-clay',
  warn: 'border-clay/40 text-mist/80',
  info: 'border-hairline text-mist/60',
}

const GLYPH: Record<Severity, string> = { error: '✕', warn: '!', info: 'i' }

const TITLE: Record<Severity, string> = { error: '错误', warn: '注意', info: '提示' }

export function DiagnosticList({ items }: { items: readonly Diagnostic[] }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="预检诊断" className="flex flex-col gap-2">
      {items.map((d) => (
        <li key={d.id} className={`flex gap-2 border-l-2 pl-2 ${TONE[d.severity]}`}>
          <span aria-hidden className="font-mono text-xs leading-5">
            {GLYPH[d.severity]}
          </span>
          <span className="text-xs leading-relaxed">
            <span className="sr-only">{TITLE[d.severity]}：</span>
            {d.message}
            <span className="mt-0.5 block text-mist/40">{d.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
