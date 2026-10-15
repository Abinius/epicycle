import { fileName, frameCount, gifOptions, pickPlan, type ExportOptions, type Plan } from '../../core/export.js'
import type { Scene } from '../../core/types.js'
import { detectCaps } from './detect.js'
import { runGif } from './gif.js'
import { runPngSeq } from './pngseq.js'
import { runRecorder } from './recorder.js'
import { runWebCodecs } from './webcodecs.js'
import type { ExportHooks, Runner } from './types.js'

export type { ExportHooks } from './types.js'

const RUNNERS: Record<Plan['path'], Runner> = {
  webcodecs: runWebCodecs,
  recorder: runRecorder,
  gif: runGif,
  png: runPngSeq,
}

export interface ExportResult {
  blob: Blob
  /** 实际走到的那一档，含降级说明 */
  plan: Plan
  fileName: string
  /** 实际渲染的帧数 */
  frames: number
}

/**
 * 导出一次（PRD C3）：先探测能力、再选路、再交给对应通路。
 *
 * GIF 是固定降采的，所以渲染与文件名都用降采后的参数——文件名里的 W×H 必须是
 * 真正导出的那个尺寸，不能写着 1920×1080 却给一个 480×270 的文件。
 */
export async function exportAnimation(
  scene: Scene,
  opt: ExportOptions,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  const caps = await detectCaps(opt.width, opt.height)
  const plan = pickPlan(opt.format, caps, {
    transparent: opt.background === null,
    width: opt.width,
    height: opt.height,
  })
  const eff = plan.path === 'gif' ? gifOptions(opt) : opt
  const blob = await RUNNERS[plan.path](scene, eff, plan, hooks)
  return { blob, plan, fileName: fileName(eff, plan, new Date()), frames: frameCount(eff) }
}
