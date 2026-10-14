import { dft } from './dft.js'
import { diagnose, type Diagnostic } from './diagnostic.js'
import { samplePaths, type SampleResult } from './sampler.js'
import { extractPaths } from './svgtext.js'
import type { Coefficient } from './types.js'

/**
 * 上传通路：SVG 文本 → 系数（+ 诊断）。
 *
 * 上传与手绘共用这一条路（手绘的笔迹在 UI 层转成 path 数据就与文件没有区别）。
 * 重计算那半段是 `prepareSvg`，跑在 Worker 里；`diagnose` 便宜且依赖 K，留在主线程。
 * `readSvg` 把两段串起来，给不做 Worker 的调用方与测试用。
 */

export interface SvgReadOptions {
  /** 采样点数，2 的幂 */
  N: number
  close_mode: 'join' | 'mirror'
  longest_only?: boolean
  /** 当前参与项数，供诊断 #9 使用 */
  K: number
  /** 文件字节数，供诊断 #2 使用；缺省按文本长度估 */
  bytes?: number
  tolerance?: number
}

/** prepareSvg 的输入：只含采样相关字段，不含 K / bytes（那两个只喂给 diagnose） */
export type PrepareOptions = Pick<SvgReadOptions, 'N' | 'close_mode' | 'longest_only' | 'tolerance'>

/** 采样 + DFT 的纯结果，不含诊断——这是搬进 Worker 的那部分 */
export interface PreparedSvg {
  /** 抽到的 path 条数 */
  paths: number
  sample: SampleResult | null
  coeffs: Coefficient[] | null
  /** DFT 耗时（毫秒）。时钟由调用方注入——core 不读时钟，纯测试里恒为 0 */
  dft_ms: number
}

export interface SvgSource extends PreparedSvg {
  diagnostics: Diagnostic[]
  /** 没有 error 级诊断才能拿去出动画 */
  ok: boolean
}

/**
 * 抽路径 → 采样 → DFT（不含诊断）。这是采样链路上唯一的重计算，搬进了 Worker；
 * diagnose（含 K）在主线程跑，K 滑块拖动时不再触发 DFT。
 */
export function prepareSvg(
  text: string,
  opts: PrepareOptions,
  now: () => number = noClock,
): PreparedSvg {
  const paths = extractPaths(text)
  const sample = paths.length > 0 ? samplePaths(paths, opts) : null
  const t0 = now()
  const coeffs = sample ? dft(sample.points, opts.N) : null
  return { paths: paths.length, sample, coeffs, dft_ms: sample ? now() - t0 : 0 }
}

/** core 不持有时钟：没人注入就记 0，而不是偷偷 import performance */
function noClock(): number {
  return 0
}

export function readSvg(text: string, opts: SvgReadOptions, now: () => number = noClock): SvgSource {
  const { paths, sample, coeffs, dft_ms } = prepareSvg(text, opts, now)
  const diagnostics = diagnose({
    svg: text,
    bytes: opts.bytes ?? text.length,
    paths,
    sample,
    coeffs,
    K: opts.K,
  })
  return {
    paths,
    sample,
    coeffs,
    dft_ms,
    diagnostics,
    ok: sample !== null && coeffs !== null && !diagnostics.some((d) => d.severity === 'error'),
  }
}
