import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 生产环境的安全响应头定义在 `vercel.json` 里（上线就靠那一份）。
 * 这里把同一份 CSP 挂到 `vite preview` 上——E2E 跑的就是 preview，
 * 于是每条用例里的「无 console error」断言顺带把 CSP 违规也验了。
 * 一处定义、两处生效，改了不会漏。
 */
function cspFromVercel(): string | undefined {
  try {
    const cfg = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
      headers?: Array<{ headers?: Array<{ key: string; value: string }> }>
    }
    for (const group of cfg.headers ?? []) {
      for (const h of group.headers ?? []) {
        if (h.key.toLowerCase() === 'content-security-policy') return h.value
      }
    }
  } catch {
    // 读不到就当没有：preview 少个响应头不该让开发起不来
  }
  return undefined
}

const csp = cspFromVercel()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: csp ? { 'Content-Security-Policy': csp } : {},
  },
})
