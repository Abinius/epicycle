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
  await slider.evaluate((el) => {
    const input = el as HTMLInputElement
    input.value = '256'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(slider).toHaveValue('256')
  await expect(page.getByTestId('terms')).toHaveText(heartTerms)

  // 正方形频谱宽带，同样的 K 立刻改变实际参与项
  await page.getByRole('combobox', { name: '形状' }).selectOption('square')
  await expect(page.getByTestId('shape-name')).toContainText('正方形')
  await expect(page.getByTestId('terms')).not.toHaveText(heartTerms)
  await expect.poll(() => paintedPixels(page), { timeout: 8000 }).toBeGreaterThan(200)

  await page.getByRole('button', { name: '暂停' }).click()
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible()

  expect(errors).toEqual([])
})
