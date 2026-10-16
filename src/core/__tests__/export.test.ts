import { describe, expect, it } from 'vitest'
import { defaultTheta, type Coefficient } from '../types.js'
import { buildScene } from '../epicycle.js'
import { renderFrame, renderOptions } from '../renderer.js'
import {
  autoBitrate,
  estimateBytes,
  exportRenderOptions,
  fileName,
  formatBytes,
  frameCount,
  frameSize,
  frameState,
  gifOptions,
  h264Codec,
  isKeyFrame,
  padFrames,
  periodFrames,
  pickPlan,
  type Caps,
  type ExportFormat,
  type ExportOptions,
  type Plan,
} from '../export.js'
import { makeTarget } from './recordingTarget.js'

const base = (o: Partial<ExportOptions> = {}): ExportOptions => ({
  format: 'mp4',
  width: 1280,
  height: 720,
  fps: 30,
  loops: 2,
  padSeconds: 0.5,
  periodSeconds: 4,
  trail: 0.35,
  highlight: null,
  background: '#FBFAF7',
  circles: 'all',
  bitrate: 2_500_000,
  name: '心形',
  ...o,
})

const FULL: Caps = { webcodecs: true, h264: true, recorder: true, recorderVp9: true, recorderVp8: true }
const NONE: Caps = { webcodecs: false, h264: false, recorder: false, recorderVp9: false, recorderVp8: false }
const at = (transparent: boolean, width = 1280, height = 720) => ({ transparent, width, height })

describe('h264Codec', () => {
  it('按分辨率定档：Baseline 3.1 / Main 4.0 / Main 5.2', () => {
    expect(h264Codec(1280, 720)).toBe('avc1.42001f')
    expect(h264Codec(854, 480)).toBe('avc1.42001f')
    expect(h264Codec(1920, 1080)).toBe('avc1.4d0028')
    expect(h264Codec(3840, 2160)).toBe('avc1.4d0034')
  })
})

describe('pickPlan 降级链（PRD §5.1）', () => {
  it('MP4 + 全能力 + 不透明 → WebCodecs / H.264，无降级说明', () => {
    const p = pickPlan('mp4', FULL, at(false))
    expect(p).toEqual({ path: 'webcodecs', ext: 'mp4', tag: 'h264', codec: 'avc1.42001f' })
  })

  it('MP4 + 透明 → 绝不走 H.264（它没有 alpha 通道），降级到 WebM 并给出说明', () => {
    const p = pickPlan('mp4', FULL, at(true))
    expect(p.path).toBe('recorder')
    expect(p.ext).toBe('webm')
    expect(p.note).toMatch(/透明/)
  })

  it('MP4 + 透明 + 连录制都没有 → PNG 序列，说明里点出保留 alpha', () => {
    const p = pickPlan('mp4', { ...NONE, webcodecs: true, h264: true }, at(true))
    expect(p).toMatchObject({ path: 'png', ext: 'zip', tag: 'png' })
    expect(p.note).toMatch(/alpha|透明/)
  })

  it('MP4 + 无 WebCodecs → WebM', () => {
    const p = pickPlan('mp4', { ...FULL, webcodecs: false }, at(false))
    expect(p).toMatchObject({ path: 'recorder', ext: 'webm', tag: 'vp9' })
    expect(p.note).toMatch(/H\.264/)
  })

  it('MP4 + 有 WebCodecs 但编不了 H.264 → WebM', () => {
    const p = pickPlan('mp4', { ...FULL, h264: false }, at(false))
    expect(p).toMatchObject({ path: 'recorder', ext: 'webm' })
  })

  it('WebM 优先 VP9，其次 VP8', () => {
    expect(pickPlan('webm', FULL, at(false))).toEqual({
      path: 'recorder',
      ext: 'webm',
      tag: 'vp9',
      mimeType: 'video/webm;codecs=vp9',
    })
    expect(pickPlan('webm', { ...FULL, recorderVp9: false }, at(false))).toEqual({
      path: 'recorder',
      ext: 'webm',
      tag: 'vp8',
      mimeType: 'video/webm;codecs=vp8',
    })
  })

  it('WebM 也录不了 → PNG 序列 + 说明', () => {
    const p = pickPlan('webm', NONE, at(false))
    expect(p.path).toBe('png')
    expect(p.note).toBeTruthy()
  })

  it('GIF 与 PNG 不依赖任何能力，永远可用', () => {
    expect(pickPlan('gif', NONE, at(false))).toEqual({ path: 'gif', ext: 'gif', tag: 'gif' })
    expect(pickPlan('png', NONE, at(true))).toEqual({ path: 'png', ext: 'zip', tag: 'png' })
  })

  it('GIF + 透明 → PNG 序列并给出说明（GIF 没有 alpha 通道，交黑底 GIF 比不导出更糟）', () => {
    const p = pickPlan('gif', FULL, at(true))
    expect(p).toMatchObject({ path: 'png', ext: 'zip', tag: 'png' })
    expect(p.note).toMatch(/透明|alpha/)
  })
})

describe('pickedPlan 的穷举性质', () => {
  const EXPECT_EXT: Record<ExportFormat, string> = { mp4: 'mp4', webm: 'webm', gif: 'gif', png: 'zip' }

  /** 2^5 种能力组合 × 4 种请求格式 × 透明与否 */
  function combinations(): Array<{ caps: Caps; format: ExportFormat; transparent: boolean }> {
    const out: Array<{ caps: Caps; format: ExportFormat; transparent: boolean }> = []
    for (let m = 0; m < 32; m++) {
      const caps: Caps = {
        webcodecs: !!(m & 1),
        h264: !!(m & 2),
        recorder: !!(m & 4),
        recorderVp9: !!(m & 8),
        recorderVp8: !!(m & 16),
      }
      for (const format of ['mp4', 'webm', 'gif', 'png'] as const) {
        for (const transparent of [false, true]) out.push({ caps, format, transparent })
      }
    }
    return out
  }

  it('凡产出格式与请求不一致，必有说明文案；一致则不该有无谓的说明', () => {
    for (const { caps, format, transparent } of combinations()) {
      const p = pickPlan(format, caps, at(transparent))
      const label = `${format} transparent=${transparent} caps=${JSON.stringify(caps)}`
      if (p.ext !== EXPECT_EXT[format]) {
        // 降级链每一步都要有明确文案，不能静默失败
        expect(p.note, `${label} 降级却没文案`).toBeTruthy()
      } else {
        expect(p.note, `${label} 没降级却带了文案`).toBeUndefined()
      }
    }
  })

  it('透明背景下绝不返回 H.264（那条路一定丢 alpha）', () => {
    for (const { caps, format } of combinations()) {
      const p = pickPlan(format, caps, at(true))
      expect(p.codec, `${format} ${JSON.stringify(caps)}`).not.toBe('avc1.42001f')
      expect(p.tag).not.toBe('h264')
    }
  })

  it('结果永远是可执行的一档，不会返回空路径', () => {
    for (const { caps, format, transparent } of combinations()) {
      const p: Plan = pickPlan(format, caps, at(transparent))
      expect(['webcodecs', 'recorder', 'gif', 'png']).toContain(p.path)
      expect(p.ext.length).toBeGreaterThan(0)
      expect(p.tag.length).toBeGreaterThan(0)
    }
  })
})

describe('时间轴', () => {
  it('总帧数 = 头留白 + 循环 + 尾留白', () => {
    const opt = base({ fps: 10, periodSeconds: 2, loops: 3, padSeconds: 0.5 })
    expect(padFrames(opt)).toBe(5)
    expect(periodFrames(opt)).toBe(20)
    expect(frameCount(opt)).toBe(5 + 60 + 5)
  })

  it('留白帧不进入 % 1：首尾留白都固定渲染 t=0，并标成 pad', () => {
    const opt = base({ fps: 10, periodSeconds: 2, loops: 1, padSeconds: 0.5 })
    for (const i of [0, 1, 4]) expect(frameState(i, opt), `i=${i}`).toEqual({ t: 0, pad: true })
    for (const i of [25, 26, 29]) expect(frameState(i, opt), `i=${i}`).toEqual({ t: 0, pad: true })
    // 循环段的首帧 t=0、末帧 t=(per−1)/per，永远取不到 1——取到 1 就等于下一圈的首帧
    expect(frameState(5, opt)).toEqual({ t: 0, pad: false })
    expect(frameState(24, opt).pad).toBe(false)
    expect(frameState(24, opt).t).toBeCloseTo(19 / 20, 12)
  })

  it('多圈逐帧同相：第二、三圈与第一圈时间完全一致', () => {
    const opt = base({ fps: 10, periodSeconds: 2, loops: 3, padSeconds: 0 })
    for (let k = 0; k < 20; k++) {
      expect(frameState(k, opt).t, `k=${k}`).toBeCloseTo(frameState(k + 20, opt).t, 12)
      expect(frameState(k, opt).t, `k=${k}`).toBeCloseTo(frameState(k + 40, opt).t, 12)
    }
  })

  it('t 恒落在 [0,1)，不留 1 这种会在周期边界上重复的点', () => {
    const opt = base({ fps: 24, periodSeconds: 3, loops: 2, padSeconds: 0.25 })
    for (let i = 0; i < frameCount(opt); i++) {
      const { t } = frameState(i, opt)
      expect(t, `i=${i}`).toBeGreaterThanOrEqual(0)
      expect(t, `i=${i}`).toBeLessThan(1)
    }
  })

  it('关键帧每 2 秒一个，且第 0 帧必是关键帧', () => {
    const opt = base({ fps: 30 })
    expect(isKeyFrame(0, opt)).toBe(true)
    expect(isKeyFrame(59, opt)).toBe(false)
    expect(isKeyFrame(60, opt)).toBe(true)
    expect(isKeyFrame(120, opt)).toBe(true)
  })
})

describe('码率与体积', () => {
  it('自动码率随像素数与帧率线性增长，720p30 落在 PRD 的 2.5M 档', () => {
    expect(autoBitrate(1280, 720, 30)).toBe(2_488_320)
    expect(autoBitrate(1920, 1080, 30)).toBeGreaterThan(autoBitrate(1280, 720, 30))
    expect(autoBitrate(1280, 720, 60)).toBe(2 * autoBitrate(1280, 720, 30))
  })

  it('视频体积 ≈ 码率 × 时长', () => {
    const opt = base({ fps: 30, periodSeconds: 4, loops: 2, padSeconds: 0.5, bitrate: 2_500_000 })
    const plan = pickPlan('mp4', FULL, at(false))
    // 270 帧 / 30 fps = 9 秒
    expect(estimateBytes(opt, plan)).toBe(Math.round((2_500_000 * 9) / 8))
  })

  it('PNG 序列与 GIF 按像素×帧估量级，都不为零', () => {
    const opt = base()
    expect(estimateBytes(opt, pickPlan('png', NONE, at(false)))).toBeGreaterThan(0)
    expect(estimateBytes(opt, pickPlan('gif', NONE, at(false)))).toBeGreaterThan(0)
  })
})

describe('frameSize', () => {
  it('档位说的是短边：横版按高、竖版按宽', () => {
    expect(frameSize(1080, 16 / 9)).toEqual({ width: 1920, height: 1080 })
    expect(frameSize(1080, 1)).toEqual({ width: 1080, height: 1080 })
    expect(frameSize(1080, 4 / 3)).toEqual({ width: 1440, height: 1080 })
    expect(frameSize(1080, 9 / 16)).toEqual({ width: 1080, height: 1920 })
    expect(frameSize(720, 16 / 9)).toEqual({ width: 1280, height: 720 })
    expect(frameSize(2160, 16 / 9)).toEqual({ width: 3840, height: 2160 })
  })

  it('宽高恒为偶数——H.264 不接受奇数边长', () => {
    for (const tier of [720, 1080, 2160] as const) {
      for (const aspect of [16 / 9, 1, 4 / 3, 9 / 16, 2.35]) {
        const { width, height } = frameSize(tier, aspect)
        expect(width % 2, `${tier} ${aspect} 宽`).toBe(0)
        expect(height % 2, `${tier} ${aspect} 高`).toBe(0)
      }
    }
  })
})

describe('formatBytes', () => {
  it('按 1024 进，十位以下带一位小数', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(280 * 1024 * 1024)).toBe('280 MB')
    expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
  })
})

describe('gifOptions', () => {
  it('固定降采到 12 fps 与最宽 480，宽高取偶数', () => {
    const g = gifOptions(base({ width: 1280, height: 720 }))
    expect(g.fps).toBe(12)
    expect(g.width).toBe(480)
    expect(g.height).toBe(270)
    expect(g.width % 2).toBe(0)
    expect(g.height % 2).toBe(0)
  })

  it('本来就比 480 窄的不放大', () => {
    const g = gifOptions(base({ width: 320, height: 200 }))
    expect(g.width).toBe(320)
    expect(g.height).toBe(200)
    expect(g.fps).toBe(12)
  })
})

describe('fileName', () => {
  const plan = pickPlan('mp4', FULL, at(false, 1920, 1080))

  it('按模板拼：fourierboard_<名>_<W>x<H>_<fps>_<codec>_<yyyymmdd>.<ext>', () => {
    const opt = base({ width: 1920, height: 1080, name: '心 形' })
    expect(fileName(opt, plan, new Date(Date.UTC(2026, 9, 15)))).toBe(
      'fourierboard_心_形_1920x1080_30_h264_20261015.mp4',
    )
  })

  it('名字里的空白与路径字符换成下划线，空名兜底成 shape', () => {
    const opt = base({ name: 'a/b:c*?"<>|' })
    expect(fileName(opt, plan, new Date(Date.UTC(2026, 0, 2)))).toContain('fourierboard_a_b_c_')
    expect(fileName(base({ name: '   ' }), plan, new Date(Date.UTC(2026, 0, 2)))).toContain('_shape_')
  })

  it('日期取 UTC：同一个 Date 在任何时区给出同一个名字', () => {
    const opt = base()
    const late = new Date('2026-10-15T23:30:00Z')
    const early = new Date('2026-10-15T00:30:00Z')
    expect(fileName(opt, plan, late)).toBe(fileName(opt, plan, early))
    expect(fileName(opt, plan, late)).toContain('20261015')
  })
})

// ---------------------------------------------------------------- 导出一致性（§9 / R-7）

const COEFFS: Coefficient[] = [
  { n: 0, re: 0.2, im: -0.1 },
  { n: 5, re: 1, im: 0 },
  { n: -3, re: 0, im: 0.5 },
  { n: 11, re: 0.25, im: 0 },
]
const SCENE = buildScene(COEFFS, { ...defaultTheta, K: 8 })

describe('导出一致性（R-7）', () => {
  const opt = base({ width: 640, height: 480, fps: 12, periodSeconds: 2, loops: 1, padSeconds: 0.25 })

  it('默认背景与圆链下，导出参数与预览参数逐字段相同——导出没有第二条渲染路径', () => {
    expect(exportRenderOptions(opt)).toEqual(renderOptions(640, 480, opt.trail, opt.highlight))
  })

  it('同一 (场景, t_i, 参数) 的导出帧与预览帧绘制序列逐条相同', () => {
    const exp = exportRenderOptions(opt)
    const prv = renderOptions(640, 480, opt.trail, opt.highlight)
    for (const i of [0, 3, 17, 29]) {
      const t = frameState(i, opt).t
      const a = makeTarget()
      const b = makeTarget()
      renderFrame(a.target, SCENE, t, exp)
      renderFrame(b.target, SCENE, t, prv)
      expect(a.ops, `i=${i}`).toEqual(b.ops)
    }
  })

  it('这条比对不是空转：换一个 t 立刻画出不同的帧', () => {
    const o = exportRenderOptions(opt)
    const a = makeTarget()
    const b = makeTarget()
    renderFrame(a.target, SCENE, frameState(3, opt).t, o)
    renderFrame(b.target, SCENE, frameState(17, opt).t, o)
    expect(a.ops).not.toEqual(b.ops)
  })

  it('透明导出不铺底色：没有 fillRect，其它绘制照旧', () => {
    const clear = makeTarget()
    const filled = makeTarget()
    renderFrame(clear.target, SCENE, 0.3, exportRenderOptions(base({ width: 640, height: 480, background: null })))
    renderFrame(filled.target, SCENE, 0.3, exportRenderOptions(base({ width: 640, height: 480 })))
    expect(clear.ops.some((op) => op[0] === 'fillRect')).toBe(false)
    expect(filled.ops.some((op) => op[0] === 'fillRect')).toBe(true)
    // 底色只影响那一笔，矢量与笔尖的绘制一条不少
    expect(filled.ops.length - clear.ops.length).toBe(3) // set fillStyle + set globalAlpha + fillRect
  })

  it('无圆链导出只去掉圆与矢量两组 stroke，笔尖与轨迹仍在', () => {
    const withCircles = makeTarget()
    const without = makeTarget()
    renderFrame(withCircles.target, SCENE, 0.3, exportRenderOptions(base({ width: 640, height: 480 })))
    renderFrame(
      without.target,
      SCENE,
      0.3,
      exportRenderOptions(base({ width: 640, height: 480, circles: 'none' })),
    )
    expect(without.ops.filter((op) => op[0] === 'arc').length).toBeLessThan(
      withCircles.ops.filter((op) => op[0] === 'arc').length,
    )
    // 笔尖那一下 fill 还在
    expect(without.ops.some((op) => op[0] === 'fill')).toBe(true)
  })
})
