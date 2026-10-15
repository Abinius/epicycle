import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  togglePlay: () => void
  /** 调项数 K；正负号即方向，绝对值是步长 */
  nudgeK: (delta: number) => void
  /** 调播放速度，同上 */
  nudgeSpeed: (delta: number) => void
  freeze: () => void
  openExport: () => void
}

/** 焦点在文本输入 / 下拉里时不抢键——用户在打字或在选值，快捷键应当让路 */
function isTyping(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return el instanceof HTMLElement && el.isContentEditable
}

/** 快捷键一览。与下面的实现同源，改键位时不会漏改说明 */
export const SHORTCUT_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['空格', '播放 / 暂停'],
  ['↑ ↓', '项数 K（按住 Shift 一次 10 个）'],
  ['← →', '播放速度'],
  ['F', '冻结为资产'],
  ['E', '跳到导出'],
]

/**
 * 全键盘操作（PRD §6 交互规则 3）。
 *
 * 两条让路规则，不然快捷键会跟浏览器打架：
 * 1. 焦点在输入框 / 下拉里时一律不接管；
 * 2. 空格在按钮上等于「激活」，那是浏览器该干的事，不抢。
 */
export function useShortcuts(h: ShortcutHandlers): void {
  // handlers 每次渲染都是新对象，直接进依赖会让监听器反复装卸；用 ref 取最新那份
  const live = useRef(h)
  live.current = h

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = document.activeElement
      if (isTyping(target)) return
      const cur = live.current
      const big = e.shiftKey ? 10 : 1
      switch (e.key) {
        case ' ':
          if (target instanceof HTMLButtonElement) return
          e.preventDefault()
          cur.togglePlay()
          return
        case 'ArrowUp':
          e.preventDefault()
          cur.nudgeK(big)
          return
        case 'ArrowDown':
          e.preventDefault()
          cur.nudgeK(-big)
          return
        case 'ArrowRight':
          e.preventDefault()
          cur.nudgeSpeed(big / 10)
          return
        case 'ArrowLeft':
          e.preventDefault()
          cur.nudgeSpeed(-big / 10)
          return
        case 'f':
        case 'F':
          cur.freeze()
          return
        case 'e':
        case 'E':
          cur.openExport()
          return
        default:
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
