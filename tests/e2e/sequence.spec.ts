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

const series = (n: number, mul: number, mod: number) =>
  Array.from({ length: n }, (_, i) => (i * mul) % mod).join(',')

test('数值序列注入：粘贴 200 个数得到确定动画，同一序列两次完全一致（R-5）', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const formula = () => page.getByTestId('formula').innerText()

  await page.getByTestId('seq-input').fill(series(200, 37, 101))
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('已注入 200 个数')
  const first = await formula()

  // 同一序列再注入一次：公式必须逐字相同（映射里没有随机源）
  await page.getByTestId('seq-apply').click()
  expect(await formula()).toBe(first)

  // 换一段序列 → 公式跟着变
  await page.getByTestId('seq-input').fill(series(200, 11, 97))
  await page.getByTestId('seq-apply').click()
  await expect.poll(formula).not.toBe(first)

  // 清除注入：回到注入前的项数与周期
  await page.getByRole('button', { name: '清除注入' }).click()
  await expect(page.getByTestId('seq-note')).toHaveCount(0)
  expect(await formula()).not.toBe(first)

  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
  expect(errors).toEqual([])
})

test('数值序列：空输入与全 0 都不崩，全 0 也不会塌成一个圆', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // 空输入：给提示，不改任何东西
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('没解析出数字')

  // 全 0：§2.6 的常量兜底会让它仍有起伏，而不是塌成一个点
  await page.getByTestId('seq-input').fill('0, 0, 0, 0, 0, 0, 0, 0')
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('已注入')
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  expect(errors).toEqual([])
})

test('数值序列：种子模式同种子同动画，换种子换结果', async ({ page }) => {
  await page.goto('/')
  const formula = () => page.getByTestId('formula').innerText()

  await page.getByTestId('seq-mode-seed').click()
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('已注入 32 个数')
  const a = await formula()

  // 同种子再注入 → 一模一样
  await page.getByTestId('seq-apply').click()
  expect(await formula()).toBe(a)

  // 换种子 → 换动画
  await page.getByTestId('seq-seed').fill('8')
  await page.getByTestId('seq-apply').click()
  await expect.poll(formula).not.toBe(a)
})

test('数值序列：文本模式按 UTF-16 取码，同一段文本结果一致', async ({ page }) => {
  await page.goto('/')
  const formula = () => page.getByTestId('formula').innerText()

  await page.getByTestId('seq-mode-text').click()
  await page.getByTestId('seq-input').fill('Abin')
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('已注入 4 个数')
  const a = await formula()

  await page.getByTestId('seq-apply').click()
  expect(await formula()).toBe(a)
})

test('清除注入还原 L2 手改，而不是清空 perN；按钮在未注入时禁用（bug 5 回归）', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  const formula = () => page.getByTestId('formula').innerText()
  const clearBtn = page.getByRole('button', { name: '清除注入' })
  const rows = page.getByTestId('coeff-row')
  await expect(rows.first()).toBeVisible()

  // 未注入时清除按钮禁用——没有东西可清除，不能让一次误点抹掉手改
  await expect(clearBtn).toBeDisabled()

  // L2 手改：点第二项，把幅度倍率 γ 拉到 0.5（step 0.05 允许），公式立刻变
  const initial = await formula()
  await rows.nth(1).click()
  const gamma = page.getByRole('slider', { name: '幅度倍率 γ' })
  await gamma.fill('0.5')
  await expect.poll(() => formula()).not.toBe(initial)
  const l2 = await formula()

  // 注入一段序列：公式换成注入结果，清除按钮亮起
  await page.getByTestId('seq-input').fill(series(64, 37, 101))
  await page.getByTestId('seq-apply').click()
  await expect(page.getByTestId('seq-note')).toContainText('已注入')
  await expect(clearBtn).toBeEnabled()
  expect(await formula()).not.toBe(l2)

  // 清除注入：还原到注入前那份（含 L2 手改的 perN），而不是清空成预置
  await clearBtn.click()
  await expect(page.getByTestId('seq-note')).toHaveCount(0)
  await expect(clearBtn).toBeDisabled()
  await expect.poll(() => formula()).toBe(l2)
  // 也不是没手改过的预置初始态——证明 perN 真被还原，不是被清空
  expect(await formula()).not.toBe(initial)

  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)
  expect(errors).toEqual([])
})
