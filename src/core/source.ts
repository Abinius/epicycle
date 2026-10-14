import { dft } from './dft.js'
import { diagnose, type Diagnostic } from './diagnostic.js'
import { samplePaths, type SampleResult } from './sampler.js'
import { extractPaths } from './svgtext.js'
import type { Coefficient } from './types.js'

/**
 * 上传通路：SVG 文本 → 系数（+ 诊断）。整条链路一次跑完，UI 只调这一个入口。
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

export interface SvgSource {
  /** 抽到的 path 条数 */
  paths: number
  sample: SampleResult | null
  coeffs: Coefficient[] | null
  diagnostics: Diagnostic[]
  /** 没有 error 级诊断才能拿去出动画 */
  ok: boolean
}

export function readSvg(text: string, opts: SvgReadOptions): SvgSource {
  const paths = extractPaths(text)
  const sample = paths.length > 0 ? samplePaths(paths, opts) : null
  const coeffs = sample ? dft(sample.points, opts.N) : null
  const diagnostics = diagnose({
    svg: text,
    bytes: opts.bytes ?? text.length,
    paths: paths.length,
    sample,
    coeffs,
    K: opts.K,
  })
  return {
    paths: paths.length,
    sample,
    coeffs,
    diagnostics,
    ok: sample !== null && coeffs !== null && !diagnostics.some((d) => d.severity === 'error'),
  }
}
