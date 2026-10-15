import { h264Codec, type Caps } from '../../core/export.js'

/** WebCodecs 认不认这个配置。`isConfigSupported` 在早期实现里可能缺席，缺席就当不支持 */
async function canEncode(codec: string, width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  if (typeof VideoEncoder.isConfigSupported !== 'function') return false
  try {
    const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 2_000_000, framerate: 30 })
    return r.supported === true
  } catch {
    return false
  }
}

/**
 * 能力探测（技术文档 §5.2）。H.264 那一项必须拿**目标分辨率对应**的 codec 串去问，
 * 否则会出现「探测通过、configure 抛错」这种最难受的失败。
 */
export async function detectCaps(width: number, height: number): Promise<Caps> {
  const hasRecorder = typeof MediaRecorder !== 'undefined'
  const supports = (mime: string): boolean => {
    if (!hasRecorder) return false
    try {
      return MediaRecorder.isTypeSupported(mime)
    } catch {
      return false
    }
  }
  return {
    webcodecs: typeof VideoEncoder !== 'undefined',
    h264: await canEncode(h264Codec(width, height), width, height),
    recorder: hasRecorder && 'captureStream' in HTMLCanvasElement.prototype,
    recorderVp9: supports('video/webm;codecs=vp9'),
    recorderVp8: supports('video/webm;codecs=vp8'),
  }
}
