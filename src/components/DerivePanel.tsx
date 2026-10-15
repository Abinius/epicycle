import { useState } from 'react'
import { isIdentityTransform, transformLabel, type ShapeTransform } from '../core/derive.js'
import { Range } from './Range.js'

const PI = Math.PI

/** 面板自己的状态：旋转存角度，交给引擎时换算成弧度 */
interface DeriveState {
  deg: number
  scaleX: number
  scaleY: number
  shear: number
  mirrorX: boolean
  mirrorY: boolean
}

const DEFAULTS: DeriveState = { deg: 0, scaleX: 1, scaleY: 1, shear: 0, mirrorX: false, mirrorY: false }

function toTransform(s: DeriveState): ShapeTransform {
  return {
    rotate: (s.deg * PI) / 180,
    scaleX: s.scaleX,
    scaleY: s.scaleY,
    shear: s.shear,
    mirrorX: s.mirrorX,
    mirrorY: s.mirrorY,
  }
}

/**
 * 模式 Y（形状域）派生。与上面的参数面板（模式 X，系数域）不同，这里改的是 z_k 本身，
 * 会真的改变频谱结构——剪切这类非解析操作没法在系数上做乘法表达，必须重跑 DFT。
 * 结果是一份全新的派生资产，原来的形状一字不改。
 */
export function DerivePanel({
  from,
  busy,
  onDerive,
}: {
  /** 派生所基于的当前形状名 */
  from: string
  busy: boolean
  onDerive: (t: ShapeTransform) => void
}) {
  const [s, setS] = useState<DeriveState>(DEFAULTS)
  const t = toTransform(s)
  const identity = isIdentityTransform(t)

  return (
    <section aria-label="形状变形" className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-mist/70">变形</h2>
        <button type="button" onClick={() => setS(DEFAULTS)} className="text-xs text-mist/40 hover:text-mist">
          复位
        </button>
      </div>

      <Range label="旋转 (°)" value={s.deg} min={-180} max={180} step={1} onChange={(v) => setS((c) => ({ ...c, deg: v }))} />
      <Range
        label="宽度"
        value={s.scaleX}
        min={0.2}
        max={3}
        step={0.05}
        onChange={(v) => setS((c) => ({ ...c, scaleX: Number(v.toFixed(2)) }))}
      />
      <Range
        label="高度"
        value={s.scaleY}
        min={0.2}
        max={3}
        step={0.05}
        onChange={(v) => setS((c) => ({ ...c, scaleY: Number(v.toFixed(2)) }))}
      />
      <Range
        label="剪切"
        value={s.shear}
        min={-1}
        max={1}
        step={0.05}
        onChange={(v) => setS((c) => ({ ...c, shear: Number(v.toFixed(2)) }))}
        hint="非解析变换：真的改变频谱结构，不是在系数上做乘法。"
      />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.mirrorX}
            onChange={(e) => setS((c) => ({ ...c, mirrorX: e.target.checked }))}
            className="accent-sage"
          />
          <span className="text-mist/70">镜像 x</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.mirrorY}
            onChange={(e) => setS((c) => ({ ...c, mirrorY: e.target.checked }))}
            className="accent-sage"
          />
          <span className="text-mist/70">镜像 y</span>
        </label>
      </div>

      <button
        type="button"
        data-testid="derive-btn"
        disabled={busy || identity}
        onClick={() => onDerive(t)}
        className="rounded-md border border-hairline bg-ink2 px-3 py-1.5 text-sm hover:border-sage/60 disabled:opacity-40"
      >
        {busy ? '计算中…' : identity ? '调一个参数再派生' : `派生为「${transformLabel(t)}」`}
      </button>
      <p className="text-xs leading-relaxed text-mist/35">
        从「{from}」出发，算完存成一份新资产；原来的形状一字不改。
      </p>
    </section>
  )
}
