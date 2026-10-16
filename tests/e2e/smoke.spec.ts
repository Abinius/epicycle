import { expect, test, type Page } from '@playwright/test'

/** 统计画布上与默认背景 #FBFAF7 不同的像素数 */
function paintedPixels(page: Page) {
  return page.locator('[data-testid="stage"]').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let diff = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 251) + Math.abs(data[i + 1] - 250) + Math.abs(data[i + 2] - 247) > 24) diff++
    }
    return diff
  })
}

/** 画出像素的重心，按画布尺寸归一（0.5 即正中）。图形跑出画布时重心会明显偏移 */
function paintedCenter(page: Page) {
  return page.locator('[data-testid="stage"]').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const { width, height } = canvas
    const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
    let n = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 251) + Math.abs(data[i + 1] - 250) + Math.abs(data[i + 2] - 247) <= 24) continue
      const p = i / 4
      sx += p % width
      sy += Math.floor(p / width)
      n++
    }
    return n === 0 ? null : { x: sx / n / width, y: sy / n / height }
  })
}

/** 暂停并拉满轨迹：图形完整可见，便于量重心 */
async function freeze(page: Page) {
  await page.getByRole('button', { name: '暂停' }).click()
  await page.getByRole('slider', { name: '轨迹比例' }).fill('1')
  await page.waitForTimeout(150)
}

test('首页渲染品牌与画布，且动画正在绘制', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '傅里叶画板' })).toBeVisible()
  await expect(page.getByTestId('stage')).toBeVisible()
  await expect(page.getByText('不上传、不收集、无需账号')).toBeVisible()

  // 画布必须有真正画上去的像素，而不是空背景
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
})

test('公式与系数表随形状和 K 同步，点项只画到该项', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // KaTeX 真的排上了，不是懒加载的占位块
  const formula = page.getByTestId('formula')
  const panel = page.getByLabel('傅里叶公式')
  await expect(panel).toBeVisible()
  await expect(formula.locator('.katex')).not.toHaveCount(0)

  const rows = page.getByTestId('coeff-row')
  await expect(rows.first()).toBeVisible()
  // 代入式固定展开到 8 项：常数项 + 8 项，共 9 个可点片段
  await expect(formula.locator('button')).toHaveCount(9)

  // 点一项：圆链截到该项，画布仍在绘制；再点一次恢复
  await rows.nth(1).click()
  await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(30)
  await rows.nth(1).click()
  await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'false')

  // 心形带限于 |n| ≤ 4，只有 8 项；正方形宽带，同样的 K 下项数立刻不同
  const heartRows = await rows.count()
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(rows).not.toHaveCount(heartRows)
  // 代入式固定截断在 9 个可点片段（常数项 + 8 项），不随项数膨胀
  await expect(formula.locator('button')).toHaveCount(9)

  // 改 K：系数表与公式数值同步变化
  const panelAt64 = await panel.innerText()
  const rowsAt64 = await rows.count()
  const slider = page.getByRole('slider', { name: '项数 K' })
  await slider.fill('128')
  await expect(rows).not.toHaveCount(rowsAt64)
  await expect.poll(() => panel.innerText()).not.toBe(panelAt64)

  expect(errors).toEqual([])
})

test('上传 SVG：出动画、公式同步换源，坏文件给出诊断', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const input = page.getByLabel('上传 SVG 文件')

  // 一条未闭合的手写签名：采样后应当出动画，并提示首尾没连上
  await input.setInputFiles('tests/e2e/fixtures/signature.svg')
  await expect(page.getByTestId('shape-name')).toContainText('signature.svg')
  await expect(page.getByLabel('预检诊断')).toContainText('没有首尾相连')
  await expect(page.getByTestId('formula').locator('.katex')).not.toHaveCount(0)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  // 系数表按上传的频谱排，和预置形状不是一回事
  const rows = page.getByTestId('coeff-row')
  await expect(rows.first()).toBeVisible()
  const uploaded = await page.getByTestId('formula').innerText()

  // 换成镜像回扫：闭合诊断消失（没有任何诊断时列表整个不渲染）
  await page.getByLabel('闭合方式').selectOption('mirror')
  await expect(page.getByLabel('预检诊断')).toHaveCount(0)

  // 上传的 SVG 自带坐标框（不在原点），渲染必须按质心居中，否则会被推出画布
  await freeze(page)
  const center = await paintedCenter(page)
  expect(center, '上传的图形没有画出像素').not.toBeNull()
  expect(center!.x, '上传图形重心 x').toBeGreaterThan(0.3)
  expect(center!.x, '上传图形重心 x').toBeLessThan(0.7)
  expect(center!.y, '上传图形重心 y').toBeGreaterThan(0.3)
  expect(center!.y, '上传图形重心 y').toBeLessThan(0.7)

  // 只有 rect 的文件：报「未找到路径数据」，画面回到预置形状
  await input.setInputFiles('tests/e2e/fixtures/nopath.svg')
  await expect(page.getByLabel('预检诊断')).toContainText('未找到路径数据')
  await expect(page.getByText('预检未通过')).toBeVisible()
  expect(await page.getByTestId('formula').innerText()).not.toBe(uploaded)
  const presetFormula = await page.getByTestId('formula').innerText()

  // path 被截断：采样在 Worker 里抛错。必须报出诊断，且画面回到预置形状——
  // 绝不能把上一份素材的系数挂在新的文件名下（冻结一下就是一份张冠李戴的资产）
  await input.setInputFiles({
    name: 'broken.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10"/></svg>'),
  })
  await expect(page.getByLabel('预检诊断')).toContainText('路径数据无法解析', { timeout: 15_000 })
  await expect(page.getByText('预检未通过')).toBeVisible()
  expect(await page.getByTestId('formula').innerText(), '坏 SVG 不能沿用上一份素材的系数').toBe(presetFormula)

  // 换回预置形状：上传状态被清掉
  await page.getByRole('combobox', { name: '形状' }).selectOption('heart')
  await expect(page.getByTestId('shape-name')).toContainText('心形')
  await expect(page.getByText('预检未通过')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('改项数、换形状、暂停播放：画布继续绘制且无报错', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  const slider = page.getByRole('slider', { name: '项数 K' })

  // 心形解析上带限于 |n| ≤ 4：K 从 64 拉到 256，实际参与项一个不多
  const heartTerms = await page.getByTestId('terms').innerText()
  await slider.fill('256')
  await expect(slider).toHaveValue('256')
  await expect(page.getByTestId('terms')).toHaveText(heartTerms)

  // 正方形频谱宽带，同样的 K 立刻改变实际参与项
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(page.getByTestId('shape-name')).toContainText('正方形')
  await expect(page.getByTestId('terms')).toHaveText('256 / 1023')
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible()

  expect(errors).toEqual([])
})

test('L1/L2 算子实时改写公式与系数表，重置可还原', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const panel = page.getByLabel('傅里叶公式')
  const rows = page.getByTestId('coeff-row')
  await expect(rows.first()).toBeVisible()
  // 心形解析上带限于 |n| ≤ 4：恰好 8 项全参与，无 K 截断补位，L2 进出看得清
  const rowsBefore = await rows.count()
  const formulaBefore = await panel.innerText()

  // L1：等权化 —— 所有半径归一，公式立刻变
  await page.getByRole('checkbox', { name: /等权化/ }).check()
  await expect.poll(() => panel.innerText()).not.toBe(formulaBefore)
  await page.getByRole('checkbox', { name: /等权化/ }).uncheck()

  // L1：全局相位 —— 连续滑块也实时反映
  const phase = page.getByRole('slider', { name: '全局相位 (弧度)' })
  await phase.fill('1.5')
  await expect(phase).toHaveValue('1.5')

  // L2：点选一行 → 出编辑器；γ 归零把该项挤出系数表（以 n 为锚，编辑器不消失）
  await rows.nth(1).click()
  const editor = page.getByTestId('term-editor')
  await expect(editor).toBeVisible()
  const gamma = page.getByRole('slider', { name: '幅度倍率 γ' })
  await gamma.fill('0')
  await expect.poll(() => rows.count()).toBe(rowsBefore - 1)
  // 项被挤出也不丢锚点：编辑器仍在，可调回
  await expect(editor).toBeVisible()
  await gamma.fill('1')
  await expect.poll(() => rows.count()).toBe(rowsBefore)

  // 重置：清掉全部编辑（相位/等权/perN），回到默认
  await page.getByRole('button', { name: '重置' }).click()
  await expect.poll(() => panel.innerText()).toBe(formulaBefore)
  // 编辑器随 pickedN 清空而消失
  await expect(editor).toHaveCount(0)

  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
  expect(errors).toEqual([])
})

test('频谱柱标注参与项并与系数表联动，六个预置都落在画面内', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const chart = page.getByLabel('振幅频谱')
  const bars = chart.getByTestId('spectrum-bar')
  const rows = page.getByTestId('coeff-row')
  const slider = page.getByRole('slider', { name: '项数 K' })

  // 心形带限于 |n| ≤ 4：左右各 4 根柱；幅度最大的 |c_{-1}| 就是系数表第 1 行
  await expect(chart).toBeVisible()
  await expect(bars).toHaveCount(8)
  const negOne = chart.getByRole('button', { name: /频率 n=-1，/ })
  await negOne.click()
  await expect(negOne).toHaveAttribute('aria-pressed', 'true')
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'true')
  await negOne.click()
  await expect(rows.first()).toHaveAttribute('aria-pressed', 'false')

  // K=1 时只剩一个频率参与，被截断的频率退成不可点的暗柱
  await slider.fill('1')
  await expect(bars).toHaveCount(1)
  await slider.fill('64')
  await expect(bars).toHaveCount(8)

  // 六个预置：都出动画、都换掉公式，且图形重心落在画面中部
  // （渲染以质心为中心，重心跑到边上就说明形状被推出了画布）
  for (const [id, name] of [
    ['circle', '圆'],
    ['square', '正方形'],
    ['heart', '心形'],
    ['star', '星形'],
    ['note', '音符'],
    ['signature', '签名'],
  ] as const) {
    await page.getByRole('combobox', { name: '形状' }).selectOption(id)
    await expect(page.getByTestId('shape-name')).toContainText(name)
    await expect(page.getByTestId('formula').locator('.katex')).not.toHaveCount(0)
    await freeze(page)
    await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
    const center = await paintedCenter(page)
    expect(center, `${id} 没有画出像素`).not.toBeNull()
    expect(center!.x, `${id} 重心 x`).toBeGreaterThan(0.3)
    expect(center!.x, `${id} 重心 x`).toBeLessThan(0.7)
    expect(center!.y, `${id} 重心 y`).toBeGreaterThan(0.3)
    expect(center!.y, `${id} 重心 y`).toBeLessThan(0.7)
    await page.getByRole('button', { name: '播放' }).click()
  }

  expect(errors).toEqual([])
})
