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
  const input = page.locator('input[type=file]')

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

  // 只有 rect 的文件：报「未找到路径数据」，画面回到预置形状
  await input.setInputFiles('tests/e2e/fixtures/nopath.svg')
  await expect(page.getByLabel('预检诊断')).toContainText('未找到路径数据')
  await expect(page.getByText('预检未通过')).toBeVisible()
  expect(await page.getByTestId('formula').innerText()).not.toBe(uploaded)

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
