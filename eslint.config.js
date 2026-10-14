// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * 架构约束焊在 lint 上，防止退化：
 * core/ 是全产品的数学内核，不碰任何浏览器 API —— 因此可 100% 单测、
 * 可原样移植到服务端做批量导出（v2.x）。src/engine/ 里的 animator / exporter
 * 会用到 rAF 与 OffscreenCanvas，所以必须留在 core/ 之外，不要合并。
 */
export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // eslint 一律经 `npm run lint` 从仓库根目录跑，projectService 的 cwd 即 tsconfig 根
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/**/*'],
    rules: {
      'no-restricted-globals': [
        'error',
        'document',
        'window',
        'location',
        'navigator',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'fetch',
        'WebSocket',
        { name: 'alert', message: 'core/ 不允许弹框，提示走 UI 层' },
        { name: 'setTimeout', message: 'core/ 不允许计时器，异步由上层编排' },
        { name: 'setInterval', message: 'core/ 不允许计时器，异步由上层编排' },
      ],
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'react', message: 'core/ 不允许依赖 UI 框架' }] },
      ],
    },
  },
)
