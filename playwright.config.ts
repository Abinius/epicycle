import { defineConfig } from '@playwright/test'

// 本机没有 playwright 的浏览器下载通道时，可改用系统 Edge：
//   PLAYWRIGHT_CHANNEL=msedge npx playwright test
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    // Windows 上必须显式带 .cmd 扩展名（Playwright 不经 shell 起子进程）；
    // 经 npx 调用本地二进制，比 `npm run preview` 少一层嵌套进程
    command: process.platform === 'win32' ? 'npx.cmd vite preview --host 127.0.0.1 --port 4173' : 'npx vite preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
