/** 通用滑块：标签 + 当前值 + range 输入，可带一行说明 */
export function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-mist/70">{label}</span>
        <span className="font-mono text-xs tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-sage"
      />
      {hint ? <p className="text-xs leading-relaxed text-mist/35">{hint}</p> : null}
    </div>
  )
}
