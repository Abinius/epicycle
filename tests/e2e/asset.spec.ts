import { readFileSync } from 'node:fs'
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

/**
 * 手绘一条开放弧线。走真实指针事件（Playwright 的 mouse 会派发 pointer 事件），
 * 端点离得远，所以「首尾没连上」的诊断应当出现。
 */
async function drawArc(page: Page) {
  const box = (await page.getByLabel('手绘区').boundingBox())!
  const at = (u: number, v: number): [number, number] => [box.x + box.width * u, box.y + box.height * v]
  const path: [number, number][] = [
    [0.12, 0.75],
    [0.2, 0.5],
    [0.32, 0.3],
    [0.5, 0.22],
    [0.68, 0.3],
    [0.8, 0.5],
    [0.85, 0.72],
  ]
  await page.mouse.move(...at(...path[0]))
  await page.mouse.down()
  for (const p of path.slice(1)) await page.mouse.move(...at(...p))
  await page.mouse.up()
}

/** 当前画布对应的傅里叶公式文本——系数一致则逐字一致，也就等于逐帧一致 */
async function formulaText(page: Page) {
  const formula = page.getByTestId('formula')
  await expect(formula.locator('.katex')).not.toHaveCount(0)
  return formula.innerText()
}

/** 导出第一行资产，返回落盘路径 */
async function exportFirst(page: Page, name: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('asset-row').first().getByRole('button', { name: '导出' }).click(),
  ])
  const path = test.info().outputPath(name)
  await download.saveAs(path)
  return path
}

test('手绘：笔画串成一条路径，出动画并报未闭合，两种闭合方式都可用', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.getByRole('button', { name: '手绘' }).click()
  await expect(page.getByTestId('stroke-count')).toHaveText('0 笔')

  await drawArc(page)
  await expect(page.getByTestId('stroke-count')).toHaveText('1 笔')
  await expect(page.getByTestId('shape-name')).toContainText('手绘')
  // 手绘默认镜像回扫：开放笔迹回扫闭合，没有缺口
  await expect(page.getByLabel('预检诊断')).toHaveCount(0)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  // 换成直线闭合：开放笔迹留一道缺口，诊断按 §10 #5 报出来
  await page.getByLabel('闭合方式').selectOption('join')
  await expect(page.getByLabel('预检诊断')).toContainText('没有首尾相连')

  // 再画一笔：两笔各是一条子路径，画面照旧
  await drawArc(page)
  await expect(page.getByTestId('stroke-count')).toHaveText('2 笔')

  // 撤销上一笔、清空：都回到「没有手绘」的状态
  await page.getByRole('button', { name: '撤销上一笔' }).click()
  await expect(page.getByTestId('stroke-count')).toHaveText('1 笔')
  await page.getByRole('button', { name: '清空' }).click()
  await expect(page.getByTestId('stroke-count')).toHaveText('0 笔')
  // 手绘清空后画面回到预置形状，而不是留在残影上
  await expect(page.getByTestId('shape-name')).toContainText('心形')

  expect(errors).toEqual([])
})

test('冻结 → 刷新页面 → 打开：资产留在本地，公式逐字一致', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.getByLabel('上传 SVG 文件').setInputFiles('tests/e2e/fixtures/signature.svg')
  await expect(page.getByLabel('预检诊断')).toContainText('没有首尾相连')
  const atFreeze = await formulaText(page)

  // 冻结前是「试算中」，冻结后显示资产名与校验短码
  await expect(page.getByTestId('freeze-state')).toContainText('试算中')
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('freeze-state')).toContainText('已冻结')

  const rows = page.getByTestId('asset-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('signature.svg')
  const shortCode = ((await rows.first().innerText()).match(/fa_[0-9a-f]{8}/) ?? [''])[0]
  expect(shortCode, '资产行里应当有 fa_ 短码').not.toBe('')

  // 刷新：内存全丢，只剩 IndexedDB。资产还在，说明真写进去了
  await page.reload()
  await expect(page.getByTestId('freeze-state')).toContainText('试算中')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(shortCode)

  // 打开它：系数回到工作台，公式与冻结时逐字一致
  await rows.first().getByRole('button', { name: '打开' }).click()
  await expect(page.getByTestId('freeze-state')).toContainText('已冻结')
  await expect(page.getByTestId('shape-name')).toContainText(shortCode)
  expect(await formulaText(page)).toBe(atFreeze)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  expect(errors).toEqual([])
})

test('冻结 → 导出 JSON → 干净的无痕上下文导入 → 再导出逐字节相同（M2 出口标准）', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await page.getByLabel('上传 SVG 文件').setInputFiles('tests/e2e/fixtures/signature.svg')
  await expect(page.getByLabel('预检诊断')).toContainText('没有首尾相连')
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(1)

  const first = await exportFirst(page, 'frozen.json')
  const before = readFileSync(first, 'utf8')
  expect(before).toContain('fourierboard/asset@1.0')

  // 全新的上下文：IndexedDB 是空的，唯一的输入就是那个文件
  const clean = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    const fresh = await clean.newPage()
    await fresh.goto('/')
    await expect(fresh.getByTestId('asset-row')).toHaveCount(0)

    await fresh.getByLabel('导入资产 JSON').setInputFiles(first)
    // 导入即打开：画面直接换成这份资产
    await expect(fresh.getByTestId('asset-row')).toHaveCount(1)
    await expect(fresh.getByTestId('freeze-state')).toContainText('已冻结')

    const second = await exportFirst(fresh, 'reimported.json')
    const after = readFileSync(second, 'utf8')
    // 文本一模一样 → 系数一模一样 → renderFrame 是纯函数 → 每一帧都一模一样
    expect(after).toBe(before)
  } finally {
    await clean.close()
  }
})

test('分享链接：生成 → 干净上下文打开 → 形状与参数复现（M4 出口标准）', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  // 心形 + 等权化：让 theta 复现可被观测（不勾的话默认 theta 看不出区别）
  await page.getByRole('checkbox', { name: /等权化/ }).check()
  const termsOnSource = await page.getByTestId('terms').innerText()

  await page.getByRole('button', { name: '生成并复制' }).click()
  await expect.poll(() => page.getByTestId('share-url').inputValue(), { timeout: 5000 }).toMatch(
    /\?a=.+&t=/,
  )
  const url = await page.getByTestId('share-url').inputValue()
  expect(url).toContain('&t=')

  // 全新上下文：IndexedDB 是空的，唯一输入是这条链接
  const clean = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    const fresh = await clean.newPage()
    const freshErrors: string[] = []
    fresh.on('console', (m) => {
      if (m.type() === 'error') freshErrors.push(m.text())
    })
    fresh.on('pageerror', (err) => freshErrors.push(err.message))

    await fresh.goto(url)
    await expect(fresh.getByTestId('shape-name')).toContainText('分享链接')
    // theta 复现：等权化被带过来
    await expect(fresh.getByRole('checkbox', { name: /等权化/ })).toBeChecked()
    // 系数复现：同一组频率，参与项数一致
    await expect(fresh.getByTestId('terms')).toHaveText(termsOnSource)
    // 形状画出
    await expect.poll(() => paintedPixels(fresh), { timeout: 8000 }).toBeGreaterThan(200)
    expect(freshErrors).toEqual([])
  } finally {
    await clean.close()
  }

  expect(errors).toEqual([])
})

test('变形（模式 Y）：派生出一份新资产，公式随之改变，原形状留在库里', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.getByTestId('formula').locator('.katex')).not.toHaveCount(0)
  const before = await formulaText(page)
  const beforeRows = await page.getByTestId('asset-row').count()

  // 非均匀缩放：宽度拉 2 倍、高度压一半。
  // 均匀缩放会被 viewScale = 0.8/Σ|c_n| 归一掉、视觉不变，测不出真变形
  await page.getByRole('slider', { name: '宽度' }).fill('2')
  await page.getByRole('slider', { name: '高度' }).fill('0.5')

  await page.getByRole('button', { name: /派生为/ }).click()

  // 父 + 子都进了库；派生那份带变换标签
  await expect(page.getByTestId('asset-row')).toHaveCount(beforeRows + 2)
  const names = await page.getByTestId('asset-row').allInnerTexts()
  expect(names.some((n) => n.includes('x2·y0.5'))).toBe(true)

  // 工作台换成派生出的形状，公式与派生前不同
  await expect(page.getByTestId('shape-name')).toContainText('x2·y0.5')
  expect(await formulaText(page)).not.toBe(before)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  expect(errors).toEqual([])
})

test('过渡（Morph）：两端与各自原图逐字一致，中间态是第三种形状（R-6）', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // 先冻结心形，记下它的公式
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(1)
  const heart = await formulaText(page)

  // 换正方形，再冻结一份
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(page.getByTestId('shape-name')).toContainText('正方形')
  const square = await formulaText(page)
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(2)

  // 启用过渡，两端分别指向两份资产
  await page.getByTestId('morph-toggle').check()
  await page.getByLabel('过渡起点').selectOption({ label: '心形' })
  await page.getByLabel('过渡终点').selectOption({ label: '正方形' })
  await expect(page.getByTestId('shape-name')).toContainText('过渡')

  const w = page.getByRole('slider', { name: '过渡 w' })
  const formulaNow = () => page.getByTestId('formula').innerText()

  // w=0 逐字等于心形的公式、w=1 逐字等于正方形：这就是 R-6 的「两端与各自原图一致」
  await w.fill('0')
  await expect.poll(formulaNow).toBe(heart)
  await w.fill('1')
  await expect.poll(formulaNow).toBe(square)

  // 中间态既不是心形也不是正方形，画面照常绘制
  await w.fill('0.5')
  await expect.poll(formulaNow).not.toBe(heart)
  expect(await formulaNow()).not.toBe(square)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  // 关掉过渡：工作台回到普通来源
  await page.getByTestId('morph-toggle').uncheck()
  await expect(page.getByTestId('shape-name')).not.toContainText('过渡')

  expect(errors).toEqual([])
})

test('过渡态派生：以过渡混合形状为父，而不是过渡前打开的那份（bug 4 回归）', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // 冻结心形与正方形两份资产
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(page.getByTestId('shape-name')).toContainText('正方形')
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(2)

  // 打开心形——此时 opened=心形，画面是心形
  await page.getByTestId('asset-row').filter({ hasText: '心形' }).getByRole('button', { name: '打开' }).click()
  await expect(page.getByTestId('shape-name')).toContainText('心形')

  // 启用过渡：画面换成混合形状，但 opened 仍是心形——这正是 bug 4 的触发条件
  await page.getByTestId('morph-toggle').check()
  await page.getByLabel('过渡起点').selectOption({ label: '心形' })
  await page.getByLabel('过渡终点').selectOption({ label: '正方形' })
  await page.getByRole('slider', { name: '过渡 w' }).fill('0.5')
  await expect(page.getByTestId('shape-name')).toContainText('过渡')

  // 非均匀缩放派生（均匀缩放会被 viewScale 归一掉、测不出真变形）
  await page.getByRole('slider', { name: '宽度' }).fill('2')
  await page.getByRole('slider', { name: '高度' }).fill('0.5')
  await page.getByRole('button', { name: /派生为/ }).click()

  // 修复后父资产是过渡混合形状（要先冻结成新资产）+ 子（派生结果）：+2 = 4 行。
  // 修复前拿 opened（心形）当父，父已在库里，只 +1 = 3 行——这正是 bug。
  await expect(page.getByTestId('asset-row')).toHaveCount(4)
  const names = await page.getByTestId('asset-row').allInnerTexts()
  expect(names.some((n) => n.includes('x2·y0.5')), '派生子带变换标签').toBe(true)

  expect(errors).toEqual([])
})

test('过渡两端不可重合：选成同一份时另一端自动换开，不留给混合态撞父资产 id（bug 6 回归）', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(page.getByTestId('shape-name')).toContainText('正方形')
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(2)

  await page.getByTestId('morph-toggle').check()
  const aSel = page.getByLabel('过渡起点')
  const bSel = page.getByLabel('过渡终点')
  await expect(page.getByTestId('shape-name')).toContainText('过渡')

  // 把起点选成与终点相同：另一端必须自动换开，a!==b
  const bVal = await bSel.inputValue()
  await aSel.selectOption(bVal)
  expect(await aSel.inputValue()).not.toBe(await bSel.inputValue())

  // 反方向：把终点选成与当前起点相同，起点自动换开
  const aVal = await aSel.inputValue()
  await bSel.selectOption(aVal)
  expect(await aSel.inputValue()).not.toBe(await bSel.inputValue())

  // 仍是有效过渡，画面照常绘制
  await expect(page.getByTestId('shape-name')).toContainText('过渡')
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
  expect(errors).toEqual([])
})

test('导入坏文件给出诊断，删除把资产真的从本地库里去掉', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await page.getByLabel('上传 SVG 文件').setInputFiles('tests/e2e/fixtures/nopath.svg')
  // 预检有 error 时画面留在预置形状，冻结的也就是这个预置
  await page.getByRole('button', { name: '冻结为资产' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(1)

  // 不是资产文件：明确报出来，且不动资产库
  await page.getByLabel('导入资产 JSON').setInputFiles({
    name: 'not-an-asset.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"whatever"}'),
  })
  await expect(page.getByLabel('资产库').getByLabel('预检诊断')).toContainText('不是有效的资产文件')
  await expect(page.getByTestId('asset-row')).toHaveCount(1)

  // 打开它：工作台换成这份资产，冻结态挂上它的短码
  await page.getByTestId('asset-row').first().getByRole('button', { name: '打开' }).click()
  await expect(page.getByTestId('freeze-state')).toContainText('已冻结')
  await expect(page.getByTestId('shape-name')).toContainText('fa_')

  // 删除：列表空掉，工作台也把这份资产撤走——不留一个已经不存在的资产名
  await page.getByTestId('asset-row').first().getByRole('button', { name: '删除' }).click()
  await expect(page.getByTestId('asset-row')).toHaveCount(0)
  await expect(page.getByTestId('freeze-state')).toContainText('试算中')
  await expect(page.getByTestId('shape-name')).toContainText('心形')
  await page.reload()
  await expect(page.getByTestId('asset-row')).toHaveCount(0)

  expect(errors).toEqual([])
})
