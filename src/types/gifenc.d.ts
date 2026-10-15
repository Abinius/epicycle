/**
 * gifenc 不自带类型声明（package.json 里没有 types 字段）。
 * 这里只声明本项目真正用到的那几个入口，不假装覆盖它的全部 API——
 * 哪天用到了没声明的入口，TS 会报错，这正是我们要的提醒。
 */
declare module 'gifenc' {
  export interface WriteFrameOptions {
    /** 调色板，元素为 [r, g, b] */
    palette?: number[][]
    /** 帧间隔，毫秒 */
    delay?: number
    /** 0 = 无限循环 */
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    first?: boolean
  }

  export interface GifEncoder {
    writeFrame(index: Uint8Array | number[], width: number, height: number, opts?: WriteFrameOptions): void
    finish(): void
    /**
     * 全片字节。gifenc 内部是 `contents.slice(0, cursor)`，即新建的 ArrayBuffer 背衬数组，
     * 所以这里如实写成 `Uint8Array<ArrayBuffer>`——它能直接进 `BlobPart`，不用在调用处强转。
     */
    bytes(): Uint8Array<ArrayBuffer>
    reset(): void
  }

  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoder
  /** RGBA → 最多 maxColors 色的调色板 */
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][]
  /** RGBA + 调色板 → 每像素一个索引 */
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array
}
