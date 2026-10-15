/**
 * 本地性能留档（技术文档 §11）：只在用户自己的浏览器里留一小段匿名性能数字，
 * **不上报、不发任何请求**。默认开着（页面明示），可随时关掉或清空。
 *
 * 用 localStorage 而不是 IndexedDB：就是几十个数字，配不上事务那一套。
 * 所有读写都包了 try/catch——隐私模式下 localStorage 会直接抛。
 */

const KEY = 'fourierboard.metrics'
const ENABLED_KEY = 'fourierboard.metrics.on'
/** 环形缓冲上限：留最近这些条，够看出量级就够了 */
const MAX = 50

export interface Metric {
  /** 指标名：dft / sample / export */
  name: string
  ms: number
  /** 记录时刻，ISO8601 */
  at: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 写不进去就算了：留档失败不该影响任何正事
  }
}

export function metricsEnabled(): boolean {
  return read<boolean>(ENABLED_KEY, true)
}

export function setMetricsEnabled(on: boolean): void {
  write(ENABLED_KEY, on)
  if (!on) clearMetrics()
}

export function readMetrics(): Metric[] {
  return read<Metric[]>(KEY, [])
}

export function clearMetrics(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 同上
  }
}

/** 记一条。关掉之后一律不写——关就是关，不留暗门 */
export function recordMetric(name: string, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0 || !metricsEnabled()) return
  const next = [...readMetrics(), { name, ms, at: new Date().toISOString() }]
  write(KEY, next.slice(-MAX))
}

/** 按指标名取最近 n 条的中位数——比平均值抗离群点（一次卡顿不该代表常态） */
export function medianMs(metrics: readonly Metric[], name: string): number | null {
  const xs = metrics
    .filter((m) => m.name === name)
    .map((m) => m.ms)
    .sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = xs.length >> 1
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}
