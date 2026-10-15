import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { translate, type Lang } from './dict.js'

const KEY = 'fourierboard.lang'

interface LangCtxValue {
  lang: Lang
  setLang: (next: Lang) => void
  /** 把中文原文换成当前语言；查不到就原样返回 */
  t: (source: string, params?: Record<string, string | number>) => string
}

const LangCtx = createContext<LangCtxValue | null>(null)

/** 用户选过就用他选的；没选过按浏览器语言猜（产品中文优先，非中文一律英文） */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // 隐私模式下读不到，按浏览器语言猜即可
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // 存不下只影响「下次打开时的默认值」，本次照常切换
    }
  }, [])

  const t = useCallback<LangCtxValue['t']>((source, params) => translate(lang, source, params), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>
}

export function useLang(): LangCtxValue {
  const ctx = useContext(LangCtx)
  if (!ctx) throw new Error('useLang 必须在 LangProvider 内使用')
  return ctx
}

/** 只要翻译函数时用它，省得每个组件都解构一遍 */
export function useT(): LangCtxValue['t'] {
  return useLang().t
}
