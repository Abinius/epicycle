import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 兜底错误页。渲染期抛异常不该只留一块白屏——白屏上用户什么也做不了，
 * 这里至少给一条能读的错误、一个重载按钮，并说清本地资产不会丢。
 *
 * 刻意**不发任何请求**：隐私是这个产品的卖点，报错也不该往外发。
 * 留档走的是本地 localStorage（见 engine/metrics.ts），控制台里能看到完整堆栈。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[FourierBoard] 渲染出错', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-serif text-xl tracking-wide">出了点问题</h1>
        <p className="max-w-md text-sm leading-relaxed text-mist/60">
          页面渲染时抛了异常。你冻结的资产存在这台设备的浏览器里，重新加载不会丢。
        </p>
        <pre
          data-testid="error-detail"
          className="max-h-40 w-full max-w-lg overflow-auto rounded border border-hairline bg-ink2 p-3 text-left text-xs leading-relaxed text-clay"
        >
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-hairline bg-ink2 px-4 py-2 text-sm hover:border-sage/60"
        >
          重新加载
        </button>
      </div>
    )
  }
}
