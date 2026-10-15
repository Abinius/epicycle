import { useEffect, useRef, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * 「降低运动量」。初始值跟随系统的 `prefers-reduced-motion`，之后用户手动拨过就以用户的为准——
 * 开关一旦被用户动过，系统偏好再变也不覆盖它（否则用户刚关掉，切个窗口回来又被打开）。
 *
 * 返回的 setter 会记下「用户动过」这件事，所以 UI 直接把它接到 checkbox 的 onChange 上即可。
 */
export function useReducedMotion(): [boolean, (next: boolean) => void] {
  // 手动覆盖标记用 ref：它只影响监听器的行为，不该触发重渲染
  const touched = useRef(false)
  const [reduced, setReduced] = useState(() => matches())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      if (!touched.current) setReduced(e.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return [
    reduced,
    (next: boolean) => {
      touched.current = true
      setReduced(next)
    },
  ]
}

function matches(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches
}
