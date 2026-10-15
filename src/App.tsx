import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { AssetPanel, type Frozen } from './components/AssetPanel.js'
import { DerivePanel } from './components/DerivePanel.js'
import { ExportPanel } from './components/ExportPanel.js'
import { FourierStage } from './components/FourierStage.js'
import { HelpDialog } from './components/HelpDialog.js'
import { MorphPanel, type MorphState } from './components/MorphPanel.js'
import { SourcePanel, type SourceOptions, type SourceTab } from './components/SourcePanel.js'
import { SequencePanel } from './components/SequencePanel.js'
import { SpectrumPanel } from './components/SpectrumPanel.js'
import { TermEditor } from './components/TermEditor.js'
import { ValuePanel } from './components/ValuePanel.js'
import { boundsOf, createAsset, exportJson, parseAsset } from './core/asset.js'
import { ASSET_DIAGNOSTICS, diagnose, storedCorrupt, type Diagnostic } from './core/diagnostic.js'
import { deriveAssetFrom, type ShapeTransform } from './core/derive.js'
import { buildScene } from './core/epicycle.js'
import { gridFor, reconstructPoints } from './core/dft.js'
import { morphBounds, morphCoeffs, planMorph } from './core/morph.js'
import { PRESET_IDS, PRESET_NAMES, presetOf, type PresetId } from './core/presets.js'
import { spectrumOf } from './core/spectrum.js'
import { decodeShare, encodeShare } from './core/share.js'
import { strokesToPath, type Stroke } from './core/strokes.js'
import { defaultTheta, type Coefficient, type FourierAsset, type PerNParam, type Theta } from './core/types.js'
import { useDeriveWorker } from './engine/useDeriveWorker.js'
import { recordMetric } from './engine/metrics.js'
import { useReducedMotion } from './engine/useReducedMotion.js'
import { SHORTCUT_HINTS, useShortcuts } from './engine/useShortcuts.js'
import { useSvgWorker } from './engine/useSvgWorker.js'
import { useLang } from './i18n/context.js'
import { deleteAsset, listAssets, saveAsset, storageDiagnostic } from './storage/assets.js'

// KaTeX 随本 chunk 一起加载，不进首屏；懒加载期间显示占位块
const FormulaPanel = lazy(() => import('./components/FormulaPanel.js'))

interface LoadedFile {
  name: string
  text: string
  bytes: number
}

/** 工作台上的形状：系数 + 冻结一份资产所需的全部旁证 */
interface Origin {
  name: string
  coeffs: Coefficient[]
  bounds: FourierAsset['bounds']
  dft_ms: number
  sampling: FourierAsset['sampling']
  source: FourierAsset['source']
}

function PanelSkeleton() {
  return (
    <div aria-hidden className="border-t border-hairline pt-4">
      <div className="h-3 w-16 rounded bg-mist/10" />
      <div className="mt-3 h-5 w-full rounded bg-mist/10" />
      <div className="mt-2 h-7 w-full rounded bg-mist/10" />
      <div className="mt-3 h-28 w-full rounded bg-mist/10" />
    </div>
  )
}

/** 首次进入时从 URL 读分享载荷（技术文档 §3.3：?a=<短码>&t=<theta 短码>） */
function readShared(): { coeffs: Coefficient[]; theta: Theta } | null {
  return window.location.search ? decodeShare(window.location.search.slice(1)) : null
}

export default function App() {
  const { lang, setLang, t } = useLang()
  const [preset, setPreset] = useState<PresetId>('heart')
  const initialShared = readShared()
  const [shared, setShared] = useState<{ coeffs: Coefficient[]; theta: Theta } | null>(initialShared)
  const [morph, setMorph] = useState<MorphState | null>(null)
  const [theta, setTheta] = useState<Theta>(initialShared?.theta ?? defaultTheta)
  const [playing, setPlaying] = useState(true)
  // 以频率 n（而非行下标）为锚：编辑把项挤出 terms 后面板仍挂原 n，调高即可恢复
  const [pickedN, setPickedN] = useState<number | null>(null)
  const [tab, setTab] = useState<SourceTab>('svg')
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [opened, setOpened] = useState<FourierAsset | null>(null)
  const [opts, setOpts] = useState<SourceOptions>({ N: 1024, close_mode: 'join', longest_only: false })

  const [assets, setAssets] = useState<FourierAsset[]>([])
  const [assetDiag, setAssetDiag] = useState<Diagnostic[]>([])
  // origin 一起存进冻结态：换素材后 origin 是新的对象，引用一比就知道这个冻结态失效了
  const [frozen, setFrozen] = useState<(Frozen & { origin: Origin }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [deriving, setDeriving] = useState(false)
  const derive = useDeriveWorker()
  const [reduced, setReduced] = useReducedMotion()
  const [help, setHelp] = useState(false)

  const patch = (p: Partial<Theta>) => setTheta((t) => ({ ...t, ...p }))
  const reset = () => {
    setTheta(defaultTheta)
    setPickedN(null)
  }
  const onPerN = (n: number, p: Partial<PerNParam>) =>
    setTheta((t) => {
      const key = String(n)
      const cur = t.perN[key] ?? {}
      const next = { ...cur, ...p }
      for (const k of Object.keys(next)) if (next[k as keyof PerNParam] === undefined) delete next[k as keyof PerNParam]
      const perN = { ...t.perN }
      if (Object.keys(next).length === 0) delete perN[key]
      else perN[key] = next
      return { ...t, perN }
    })

  // ---- 素材 → 系数：上传与手绘共用一条管线，都跑在 Worker 里 ----
  const activeFile = tab === 'svg' ? file : null
  const drawPath = useMemo(() => strokesToPath(strokes), [strokes])
  const shapeText = opened ? null : (activeFile?.text ?? (tab === 'draw' ? drawPath || null : null))
  const prepared = useSvgWorker(shapeText, opts)

  // 每次 Worker 交回新的采样结果就留一条 DFT 耗时（§11 的本地性能留档，不出这台机器）
  useEffect(() => {
    if (prepared && prepared.dft_ms > 0) recordMetric('dft', prepared.dft_ms)
  }, [prepared])

  // diagnose 便宜且依赖 K，留在主线程：拖 K 不再触发采样与 DFT
  const read = useMemo(() => {
    if (!prepared || shapeText === null) return null
    const diagnostics = diagnose({
      svg: shapeText,
      bytes: activeFile?.bytes ?? shapeText.length,
      paths: prepared.paths,
      sample: prepared.sample,
      coeffs: prepared.coeffs,
      K: theta.K,
    })
    return {
      ...prepared,
      diagnostics,
      ok: prepared.sample !== null && prepared.coeffs !== null && !diagnostics.some((d) => d.severity === 'error'),
    }
  }, [prepared, shapeText, activeFile, theta.K])

  const presetData = useMemo(() => {
    const t0 = performance.now()
    const data = presetOf(preset)
    // 预置没有 Worker，「预置 → 系数」整段都算在这里（解析生成器的耗时几乎全在 DFT）
    return { ...data, dft_ms: performance.now() - t0 }
  }, [preset])

  const readOk = read?.ok ?? false
  // 过渡两端：按 id 从库里现查，资产被删掉时自然失效（origin 会退回普通来源）
  const morphEnds = useMemo(() => {
    if (!morph) return null
    const A = assets.find((x) => x.id === morph.a)
    const B = assets.find((x) => x.id === morph.b)
    return A && B ? { A, B } : null
  }, [morph, assets])
  // 把两端搬到公共网格：O(N·M)，只随「换了两端」重算，不随 w 重算
  const morphPlan = useMemo(
    () => (morphEnds ? planMorph(morphEnds.A.coeffs, morphEnds.B.coeffs) : null),
    [morphEnds],
  )

  const origin = useMemo<Origin>(() => {
    if (morph && morphEnds && morphPlan) {
      return {
        name: t('过渡 {a} → {b}', { a: morphEnds.A.name, b: morphEnds.B.name }),
        coeffs: morphCoeffs(morphPlan, morph.w),
        bounds: morphBounds(morphPlan, morph.w),
        dft_ms: 0,
        sampling: { N: morphPlan.N, closed: true, close_mode: 'join', subdivide_eps: 0 },
        source: { type: 'morph' },
      }
    }
    if (shared) {
      // 重建点数取这组系数所属的网格：填小了会把 n 与 n∓N 折叠到一起
      const N = gridFor(shared.coeffs)
      return {
        name: t('分享链接'),
        coeffs: shared.coeffs,
        bounds: boundsOf(shared.coeffs, reconstructPoints(shared.coeffs, N)),
        dft_ms: 0,
        sampling: { N, closed: true, close_mode: 'join', subdivide_eps: 0 },
        source: { type: 'shared' },
      }
    }
    if (opened) {
      return {
        name: opened.name,
        coeffs: opened.coeffs,
        bounds: opened.bounds,
        dft_ms: opened.meta.dft_ms,
        sampling: opened.sampling,
        source: opened.source,
      }
    }
    const sample = prepared?.sample
    if (readOk && sample && prepared?.coeffs) {
      return {
        name: activeFile?.name ?? t('手绘'),
        coeffs: prepared.coeffs,
        bounds: boundsOf(prepared.coeffs, sample.points),
        dft_ms: prepared.dft_ms,
        sampling: { N: sample.N, closed: sample.closed, close_mode: opts.close_mode, subdivide_eps: sample.tolerance },
        source: activeFile
          ? { type: 'svg', file_name: activeFile.name, bytes: activeFile.bytes, subpaths: sample.subpaths }
          : { type: 'draw', subpaths: sample.subpaths },
      }
    }
    return {
      name: PRESET_NAMES[preset],
      coeffs: presetData.coeffs,
      bounds: boundsOf(presetData.coeffs, presetData.sample.points),
      dft_ms: presetData.dft_ms,
      sampling: {
        N: presetData.sample.N,
        closed: presetData.sample.closed,
        close_mode: presetData.sample.close_mode,
        subdivide_eps: presetData.sample.subdivide_eps,
      },
      source: { type: 'preset', preset, subpaths: presetData.sample.subpaths },
    }
  }, [t, morph, morphEnds, morphPlan, shared, opened, readOk, prepared, activeFile, opts.close_mode, preset, presetData])

  const scene = useMemo(() => buildScene(origin.coeffs, theta), [origin, theta])
  const spectrum = useMemo(() => spectrumOf(origin.coeffs, scene), [origin, scene])
  // 换形状或参数后旧下标会失配；按 n 反查行号，找不到就不画
  const highlight =
    pickedN !== null ? (() => {
      const i = scene.terms.findIndex((t) => t.n === pickedN)
      return i === -1 ? null : i
    })() : null
  const pick = (index: number | null) => {
    if (index === null) {
      setPickedN(null)
      return
    }
    const n = scene.terms[index]?.n
    if (n === undefined) return
    setPickedN((cur) => (cur === n ? null : n))
  }

  const usePreset = (next: PresetId) => {
    setPreset(next)
    setFile(null)
    setStrokes([])
    setOpened(null)
    setShared(null)
    setMorph(null)
    setPickedN(null)
  }
  const onTab = (next: SourceTab) => {
    setTab(next)
    setOpened(null)
    setShared(null)
    setMorph(null)
    setPickedN(null)
  }
  const onStrokes = (next: Stroke[]) => {
    setStrokes(next)
    setOpened(null)
    setShared(null)
    setMorph(null)
    setPickedN(null)
  }
  const loadFile = async (f: File) => {
    const text = await f.text()
    setFile({ name: f.name, text, bytes: f.size })
    setTab('svg')
    setOpened(null)
    setShared(null)
    setMorph(null)
    setPickedN(null)
  }

  // ---- 资产库 ----
  const refresh = useCallback(async () => {
    try {
      const { assets: list, corrupt } = await listAssets()
      setAssets(list)
      setAssetDiag(corrupt > 0 ? [storedCorrupt(corrupt)] : [])
    } catch (err) {
      setAssetDiag([storageDiagnostic(err)])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const freeze = async () => {
    const asset = createAsset({
      name: origin.name,
      createdAt: new Date().toISOString(),
      source: origin.source,
      sampling: origin.sampling,
      bounds: origin.bounds,
      coeffs: origin.coeffs,
      dftMs: origin.dft_ms,
    })
    setBusy(true)
    try {
      await saveAsset(asset)
      await refresh()
      setFrozen({ id: asset.id, name: asset.name, origin })
    } catch (err) {
      setAssetDiag([storageDiagnostic(err)])
    } finally {
      setBusy(false)
    }
  }

  const openAsset = (a: FourierAsset) => {
    setOpened(a)
    setShared(null)
    setMorph(null)
    setPickedN(null)
  }

  const downloadAsset = (a: FourierAsset) => {
    const url = URL.createObjectURL(new Blob([exportJson(a)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${a.id}.json`
    link.click()
    // 立刻撤销会让 Firefox 拿不到内容，等一拍再放
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importAsset = async (f: File) => {
    const parsed = parseAsset(await f.text())
    if (!parsed.ok) {
      setAssetDiag([parsed.diagnostic])
      return
    }
    setBusy(true)
    try {
      await saveAsset(parsed.asset)
      await refresh()
      openAsset(parsed.asset)
    } catch (err) {
      setAssetDiag([storageDiagnostic(err)])
    } finally {
      setBusy(false)
    }
  }

  const removeAsset = async (a: FourierAsset) => {
    setBusy(true)
    try {
      await deleteAsset(a.id)
      // 删掉的正是工作台上这份：连它一起撤走，免得画面还挂着一个已经不存在的资产名
      if (opened?.id === a.id) setOpened(null)
      await refresh()
    } catch (err) {
      setAssetDiag([storageDiagnostic(err)])
    } finally {
      setBusy(false)
    }
  }

  const onShare = () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeShare(origin.coeffs, theta)}`
    setShareUrl(url)
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {},
    )
  }

  const onDerive = async (t: ShapeTransform) => {
    setDeriving(true)
    try {
      // 父资产：打开着的就用它；否则先把当前形状冻结成父资产——派生得有一份来源可溯，
      // 不能存一个指向不存在资产的 derived_from
      let parent = opened
      if (!parent) {
        parent = createAsset({
          name: origin.name,
          createdAt: new Date().toISOString(),
          source: origin.source,
          sampling: origin.sampling,
          bounds: origin.bounds,
          coeffs: origin.coeffs,
          dftMs: origin.dft_ms,
        })
        await saveAsset(parent)
      }
      const result = await derive(parent.coeffs, parent.sampling.N, t)
      const child = deriveAssetFrom(parent, t, result, new Date().toISOString(), result.dft_ms)
      await saveAsset(child)
      await refresh()
      setOpened(child)
    } catch (err) {
      setAssetDiag([err instanceof DOMException ? storageDiagnostic(err) : ASSET_DIAGNOSTICS.deriveFailed])
    } finally {
      setDeriving(false)
    }
  }

  // 打开着的资产本身就是冻结态；否则只有「这份形状正是被冻结的那份」才算
  const frozenView: Frozen | null = opened
    ? { id: opened.id, name: opened.name }
    : frozen && frozen.origin === origin
      ? { id: frozen.id, name: frozen.name }
      : null

  const sourceName =
    morph && morphEnds
      ? t('过渡 {a} → {b}', { a: morphEnds.A.name, b: morphEnds.B.name })
      : shared
        ? t('分享链接')
        : opened
          ? `${opened.name} · ${opened.id}`
          : readOk
            ? (activeFile?.name ?? t('手绘'))
            : t(PRESET_NAMES[preset])
  // 「降低运动量」把动画速度减半——不是停掉：停掉就看不出这是在画什么了（PRD §8 无障碍）
  const rate = (theta.speed / theta.T) * (reduced ? 0.5 : 1)

  // ---- 全键盘操作（PRD §6 交互规则 3）----
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  useShortcuts({
    togglePlay: () => setPlaying((v) => !v),
    nudgeK: (d) => patch({ K: clamp(Math.round(theta.K + d), 1, 256) }),
    nudgeSpeed: (d) => patch({ speed: Number(clamp(theta.speed + d, 0.1, 4).toFixed(2)) }),
    freeze: () => {
      void freeze()
    },
    openExport: () => {
      const el = document.getElementById('panel-export')
      el?.scrollIntoView({ block: 'start' })
      el?.focus()
    },
  })

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline px-3 py-3 md:px-5">
        <h1 className="font-serif text-xl tracking-wide">{t('傅里叶画板')}</h1>
        {/* 中文模式才需要另挂一个拉丁文品牌名；英文模式下它就是标题本身 */}
        {lang === 'zh' && <span className="text-[11px] uppercase tracking-[0.2em] text-mist/40">FourierBoard</span>}
        <span className="ml-auto hidden text-xs text-mist/40 sm:block">
          {t('任何闭合曲线，都是一串同步旋转的圆')}
        </span>
        <button
          type="button"
          data-testid="lang-toggle"
          aria-label={lang === 'zh' ? 'Switch to English' : '切换到中文'}
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          className="rounded border border-hairline px-2 py-0.5 text-xs text-mist/50 hover:border-sage/60 hover:text-mist"
        >
          {lang === 'zh' ? 'EN' : 'ZH'}
        </button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2 md:grid md:grid-cols-[minmax(0,1fr)_344px] md:gap-4 md:overflow-hidden md:p-4">
        <section
          aria-label={t('渲染画布')}
          className="sticky top-0 z-10 h-[42dvh] min-h-52 min-w-0 shrink-0 overflow-hidden rounded-lg border border-hairline bg-paper md:static md:h-auto md:min-h-72"
        >
          <FourierStage scene={scene} trail={theta.trail} playing={playing} highlight={highlight} rate={rate} />
        </section>

        <aside className="flex min-h-0 flex-col gap-5 rounded-lg border border-hairline p-3 md:shrink md:overflow-y-auto md:p-4">
          <SourcePanel
            tab={tab}
            onTab={onTab}
            file={activeFile}
            paths={read?.paths ?? 0}
            strokes={strokes}
            onStrokes={onStrokes}
            subpaths={read?.sample?.subpaths ?? null}
            blocked={read !== null && !read.ok}
            options={opts}
            diagnostics={read?.diagnostics ?? []}
            onPick={(f) => {
              void loadFile(f)
            }}
            onClear={() => {
              setFile(null)
              setPickedN(null)
            }}
            onChange={(p) => {
              setOpts((o) => ({ ...o, ...p }))
              setPickedN(null)
            }}
          />

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-mist/70">{t('预置形状')}</span>
            <select
              aria-label={t('形状')}
              value={preset}
              onChange={(e) => usePreset(e.target.value as PresetId)}
              className="border border-hairline bg-ink2 px-2 py-1.5 text-sm"
            >
              {PRESET_IDS.map((x) => (
                <option key={x} value={x}>
                  {t(PRESET_NAMES[x])}
                </option>
              ))}
            </select>
          </label>

          <ValuePanel theta={theta} onPatch={patch} onReset={reset} />

          <SequencePanel
            coeffs={origin.coeffs}
            K={theta.K}
            T={theta.T}
            onApply={(p) => patch(p)}
          />

          <SpectrumPanel spectrum={spectrum} highlight={highlight} onSelect={pick} />

          <Suspense fallback={<PanelSkeleton />}>
            <FormulaPanel scene={scene} highlight={highlight} onSelect={pick} />
          </Suspense>

          {pickedN !== null && <TermEditor n={pickedN} scene={scene} perN={theta.perN} onPerN={onPerN} />}

          <DerivePanel
            from={sourceName}
            busy={deriving}
            onDerive={(t) => {
              void onDerive(t)
            }}
          />

          <AssetPanel
            frozen={frozenView}
            assets={assets}
            diagnostics={assetDiag}
            busy={busy}
            onFreeze={() => {
              void freeze()
            }}
            onOpen={openAsset}
            onExport={downloadAsset}
            onDelete={(a) => {
              void removeAsset(a)
            }}
            onImport={(f) => {
              void importAsset(f)
            }}
          />

          <MorphPanel assets={assets} morph={morph} onMorph={setMorph} />

          <ExportPanel
            scene={scene}
            periodSeconds={theta.T}
            trail={theta.trail}
            highlight={highlight}
            name={sourceName}
          />

          <div className="flex flex-col gap-3 border-t border-hairline pt-4 text-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((v) => !v)}
                aria-pressed={playing}
                className="rounded-md border border-hairline bg-ink2 px-4 py-2 hover:border-sage/60"
              >
                {t(playing ? '暂停' : '播放')}
              </button>
              <dl className="ml-auto text-xs text-mist/50">
                <dt>{t('实际参与项')}</dt>
                <dd data-testid="terms" className="font-mono tabular-nums text-mist">
                  {scene.terms.length} / {scene.M}
                </dd>
              </dl>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                data-testid="reduced-motion"
                checked={reduced}
                onChange={(e) => setReduced(e.target.checked)}
                className="accent-sage"
              />
              <span className="text-mist/60">{t('降低运动量（动画减半，默认跟随系统偏好）')}</span>
            </label>

            <details className="text-xs text-mist/45">
              <summary className="cursor-pointer hover:text-mist">{t('键盘快捷键')}</summary>
              <dl className="mt-2 flex flex-col gap-1">
                {SHORTCUT_HINTS.map(([key, what]) => (
                  <div key={key} className="flex items-baseline gap-2">
                    <dt className="w-14 shrink-0">
                      <kbd className="rounded border border-hairline bg-ink2 px-1 py-0.5 font-mono">{t(key)}</kbd>
                    </dt>
                    <dd>{t(what)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-hairline pt-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-mist/70">{t('分享链接')}</span>
              <button
                type="button"
                onClick={onShare}
                className="rounded-md border border-hairline bg-ink2 px-3 py-1 text-xs hover:border-sage/60"
              >
                {t(copied ? '已复制！' : '生成并复制')}
              </button>
            </div>
            {shareUrl && (
              <input
                data-testid="share-url"
                readOnly
                value={shareUrl}
                aria-label={t('分享链接')}
                onFocus={(e) => e.currentTarget.select()}
                className="border border-hairline bg-ink2 px-2 py-1 text-xs text-mist/60"
              />
            )}
          </div>

          <p data-testid="shape-name" className="truncate border-t border-hairline pt-4 text-xs leading-relaxed text-mist/45">
            {t('当前：{name}', { name: sourceName })}
          </p>
        </aside>
      </main>

      <footer className="flex items-center gap-3 border-t border-hairline px-3 py-2 text-xs text-mist/40 md:px-5">
        <span>{t('全部在浏览器本地计算，不上传、不收集、无需账号')}</span>
        <button
          type="button"
          data-testid="help-open"
          onClick={() => setHelp(true)}
          className="ml-auto shrink-0 rounded border border-hairline px-2 py-0.5 hover:border-sage/60 hover:text-mist"
        >
          {t('关于与帮助')}
        </button>
      </footer>

      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  )
}
