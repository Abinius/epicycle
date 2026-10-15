import type { Coefficient } from './types.js'
import { TWO_PI } from './complex.js'

/** D-2 的结论：N 恒为 2 的幂，radix-2 FFT 直接可用，不需要补零或 Bluestein */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
}

/**
 * 计算复数序列 z[0..N-1] 的 DFT，返回 2M-1 个系数，n ∈ [-(N/2-1), N/2-1]。
 *
 * z 是交错数组 [x0, y0, x1, y1, ...]（数学坐标系，y 向上）。
 * 负频率不重复计算：c_{-n} = X_{N-n} / N，所以整个 DFT 只跑一遍 FFT。
 * 精度：双精度，N=2048 时的舍入误差量级 ~1e-13，不需要 Kahan 求和。
 */
export function dft(z: Float64Array, N: number): Coefficient[] {
  if (!isPowerOfTwo(N)) throw new Error(`N 必须为 2 的幂，收到 ${N}`)
  if (z.length !== 2 * N) throw new Error(`采样点数不匹配：需要 ${2 * N} 个数，收到 ${z.length}`)

  const re = new Float64Array(N)
  const im = new Float64Array(N)
  for (let k = 0; k < N; k++) {
    re[k] = z[2 * k]
    im[k] = z[2 * k + 1]
  }

  // bit-reversal 置换
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]
      re[i] = re[j]
      re[j] = t
      t = im[i]
      im[i] = im[j]
      im[j] = t
    }
  }

  // radix-2 蝶形（蝶内乘子复用累加，不额外分配）
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1
    const ang = -TWO_PI / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < N; i += len) {
      let cRe = 1
      let cIm = 0
      for (let j = 0; j < half; j++) {
        const a = i + j
        const b = a + half
        const tRe = cRe * re[b] - cIm * im[b]
        const tIm = cRe * im[b] + cIm * re[b]
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const nextRe = cRe * wRe - cIm * wIm
        cIm = cRe * wIm + cIm * wRe
        cRe = nextRe
      }
    }
  }

  const M = N >> 1
  const out: Coefficient[] = [{ n: 0, re: re[0] / N, im: im[0] / N }]
  // 注意：输入 z 是交错数组（z[2k]），但 FFT 就地写回的是 re[k]/im[k]，输出索引不乘 2
  for (let n = 1; n < M; n++) {
    out.push({ n, re: re[n] / N, im: im[n] / N })
    out.push({ n: -n, re: re[N - n] / N, im: im[N - n] / N })
  }
  return out
}

/**
 * 逆 DFT：从系数重建 N 个采样点（交错数组 [x0,y0,...]，与 dft() 输入同布局）。
 * z_k = Σ_n c_n · e^{i·2π·n·k/N}。N 须为 2 的幂，使重建结果可直接喂回 dft() 做模式 Y 的重算。
 * 分享链接估包围盒、模式 Y「coeffs → 重建 → 变换 → 重采样 → 重 DFT」共用这一人口。
 */
export function reconstructPoints(coeffs: readonly Coefficient[], N: number): Float64Array {
  if (!isPowerOfTwo(N)) throw new Error(`N 必须为 2 的幂，收到 ${N}`)
  const out = new Float64Array(2 * N)
  for (let k = 0; k < N; k++) {
    const ph = (TWO_PI * k) / N
    let x = 0
    let y = 0
    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i]
      const ang = c.n * ph
      x += c.re * Math.cos(ang) - c.im * Math.sin(ang)
      y += c.re * Math.sin(ang) + c.im * Math.cos(ang)
    }
    out[2 * k] = x
    out[2 * k + 1] = y
  }
  return out
}

/** 按模降序、模相等时 |n| 小者优先。资产按这个顺序存储，避免每次 buildScene 重排 */
export function sortByAbs(coeffs: readonly Coefficient[]): Coefficient[] {
  return coeffs.slice().sort((a, b) => {
    const d = Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im)
    return d !== 0 ? d : Math.abs(a.n) - Math.abs(b.n)
  })
}
