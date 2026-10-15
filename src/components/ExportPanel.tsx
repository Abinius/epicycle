import { useEffect, useMemo, useState } from 'react'
import {
  autoBitrate,
  estimateBytes,
  formatBytes,
  frameCount,
  frameSize,
  gifOptions,
  pickPlan,
  type Caps,
  type ExportFormat,
  type ExportOptions,
  type Tier,
} from '../core/export.js'
import type { Scene } from '../core/types.js'
import { detectCaps } from '../engine/export/detect.js'
import { exportAnimation } from '../engine/export/index.js'
import { Range } from './Range.js'

const SELECT = 'border border-hairline bg-ink2 px-2 py-1 text-xs'

type AspectId = '16:9' | '1:1' | '4:3' | '9:16'

const ASPECTS: Record<AspectId, number> = { '16:9': 16 / 9, '1:1': 1, '4:3': 4 / 3, '9:16': 9 / 16 }

const FORMATS: Array<{ id: ExportFormat; label: string }> = [
  { id: 'mp4', label: 'MP4（H.264）' },
  { id: 'webm', label: 'WebM' },
  { id: 'gif', label: 'GIF' },
  { id: 'png', label: 'PNG 序列（ZIP）' },
]

/** 文件名模板（PRD §5.3）。真正落盘的名字在导出那一刻才定，因为里面带日期 */
const NAME_HINT = 'fourierboard_<形状>_<W>x<H>_<fps>_<编码>_<日期>.<扩展名>'

interface Settings {
  format: ExportFormat
  tier: Tier
  aspect: AspectId
  fps: number
  loops: number
  padSeconds: number
  transparent: boolean
  circles: 'all' | 'none'
  manualBitrate: boolean
  bitrateMbps: number
}

const DEFAULTS: Settings = {
  format: 'mp4',
  tier: 1080,
  aspect: '16:9',
  fps: 30,
  loops: 2,
  padSeconds: 0.5,
  transparent: false,
  circles: 'all',
  manualBitrate: false,
  bitrateMbps: 5,
}

/**
 * C3 导出面板（PRD §5.3）。导出的不是「录屏」，而是当前这份场景快照——
 * 与预览共用同一个 `renderFrame`，所以导出帧与预览帧在命令层面逐条相同。
 *
 * 能力探测要拿**目标分辨率**去问 H.264，所以换画幅就重探一次；探测结果配上
 * `pickPlan` 就能在点导出**之前**把降级说明与体积预估摆出来——这就是 PRD §5.2 要的
 * 「导出前生成体积预估并二次确认」，也避免了「等了 90 秒才发现太大」。
 */
export function ExportPanel({
  scene,
  periodSeconds,
  trail,
  highlight,
  name,
}: {
  scene: Scene
  /** 一个周期的秒数，就是 θ 的 T */
  periodSeconds: number
  trail: number
  highlight: number | null
  /** 文件名主干用的形状名 */
  name: string
}) {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [caps, setCaps] = useState<Caps | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { width, height } = frameSize(s.tier, ASPECTS[s.aspect])

  useEffect(() => {
    let alive = true
    void detectCaps(width, height).then((c) => {
      if (alive) setCaps(c)
    })
    return () => {
      alive = false
    }
  }, [width, height])

  const opt = useMemo<ExportOptions>(
    () => ({
      format: s.format,
      width,
      height,
      fps: s.fps,
      loops: s.loops,
      padSeconds: s.padSeconds,
      periodSeconds,
      trail,
      highlight,
      background: s.transparent ? null : '#FBFAF7',
      circles: s.circles,
      bitrate: s.manualBitrate ? Math.round(s.bitrateMbps * 1e6) : autoBitrate(width, height, s.fps),
      name,
    }),
    [s, width, height, periodSeconds, trail, highlight, name],
  )

  const plan = useMemo(
    () => (caps ? pickPlan(opt.format, caps, { transparent: opt.background === null, width, height }) : null),
    [caps, opt, width, height],
  )

  // GIF 固定降采：预估与实际渲染都得用降采后的参数
  const eff = plan?.path === 'gif' ? gifOptions(opt) : opt
  const total = frameCount(eff)
  const estimate = plan ? estimateBytes(eff, plan) : 0

  const patch = (p: Partial<Settings>) => setS((cur) => ({ ...cur, ...p }))

  const onExport = async () => {
    setMessage(null)
    setProgress({ done: 0, total })
    try {
      const r = await exportAnimation(scene, opt, {
        // 逐帧 setState 会把导出拖慢，按 8 帧节流一次即可
        onProgress: (done, t) => {
          if (done === t || done % 8 === 0) setProgress({ done, total: t })
        },
      })
      const url = URL.createObjectURL(r.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.fileName
      a.click()
      // 立刻撤销会让 Firefox 拿不到内容，等一拍再放
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(
        `已导出 ${r.fileName}（${formatBytes(r.blob.size)}，${r.frames} 帧）${r.plan.note ? ` · ${r.plan.note}` : ''}`,
      )
    } catch (e) {
      setMessage(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setProgress(null)
    }
  }

  return (
    <section aria-label="导出" className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-mist/70">导出</h2>
        <button type="button" onClick={() => setS(DEFAULTS)} className="text-xs text-mist/40 hover:text-mist">
          复位
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-mist/70">格式</span>
        <select aria-label="导出格式" className={SELECT} value={s.format} onChange={(e) => patch({ format: e.target.value as ExportFormat })}>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">分辨率</span>
          <select aria-label="分辨率" className={SELECT} value={s.tier} onChange={(e) => patch({ tier: Number(e.target.value) as Tier })}>
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
            <option value={2160}>4K</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">比例</span>
          <select aria-label="比例" className={SELECT} value={s.aspect} onChange={(e) => patch({ aspect: e.target.value as AspectId })}>
            {(Object.keys(ASPECTS) as AspectId[]).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">帧率</span>
          <select aria-label="帧率" className={SELECT} value={s.fps} onChange={(e) => patch({ fps: Number(e.target.value) })}>
            {[24, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">循环数</span>
          <select aria-label="循环数" className={SELECT} value={s.loops} onChange={(e) => patch({ loops: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Range
        label="首尾留白 (秒)"
        value={s.padSeconds}
        min={0}
        max={2}
        step={0.25}
        onChange={(v) => patch({ padSeconds: v })}
        hint="留白是静止帧，不进入时间循环——视频首尾同帧，回看时无缝。"
      />

      <div className="flex gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">背景</span>
          <select
            aria-label="背景"
            className={SELECT}
            value={s.transparent ? 'clear' : 'paper'}
            onChange={(e) => patch({ transparent: e.target.value === 'clear' })}
          >
            <option value="paper">纸白</option>
            <option value="clear">透明</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-mist/70">画笔</span>
          <select
            aria-label="画笔"
            className={SELECT}
            value={s.circles}
            onChange={(e) => patch({ circles: e.target.value as Settings['circles'] })}
          >
            <option value="all">圆链全显</option>
            <option value="none">无圆链</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={s.manualBitrate}
          onChange={(e) => patch({ manualBitrate: e.target.checked })}
          className="accent-sage"
        />
        <span className="text-mist/70">手动码率</span>
      </label>
      {s.manualBitrate && (
        <Range
          label="码率 (Mbps)"
          value={s.bitrateMbps}
          min={1}
          max={20}
          step={0.5}
          onChange={(v) => patch({ bitrateMbps: v })}
        />
      )}

      <dl data-testid="export-estimate" className="flex flex-col gap-0.5 text-xs text-mist/50">
        <div className="flex justify-between">
          <dt>画幅</dt>
          <dd className="font-mono tabular-nums">
            {eff.width} × {eff.height}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>帧数 / 时长</dt>
          <dd className="font-mono tabular-nums">
            {total} 帧 · {(total / eff.fps).toFixed(1)} 秒
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>预估体积</dt>
          <dd data-testid="export-bytes" className="font-mono tabular-nums">
            {plan ? `约 ${formatBytes(estimate)}` : '探测中…'}
          </dd>
        </div>
      </dl>

      {plan?.note && (
        <p data-testid="export-note" className="text-xs leading-relaxed text-clay">
          {plan.note}
        </p>
      )}

      <p className="text-xs leading-relaxed text-mist/35">文件名：{NAME_HINT}</p>

      <button
        type="button"
        data-testid="export-btn"
        disabled={progress !== null || !plan}
        onClick={() => {
          void onExport()
        }}
        className="rounded-md border border-hairline bg-ink2 px-3 py-1.5 text-sm hover:border-sage/60 disabled:opacity-40"
      >
        {progress ? `导出中 ${progress.done}/${progress.total}` : '导出'}
      </button>

      {message && (
        <p data-testid="export-message" className="text-xs leading-relaxed text-mist/60">
          {message}
        </p>
      )}
    </section>
  )
}
