import { expect, test } from '@playwright/test'

test.describe('窄屏 320px', () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test('不横向溢出，画布优先且吃满宽度，面板都能滚到', async ({ page }) => {
    await page.goto('/')

    // 移动端最容易出的问题就是横向溢出（某个 select / 长文案把页面撑宽）
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth, '页面不该横向溢出').toBeLessThanOrEqual(320)

    const stage = page.getByTestId('stage')
    await expect(stage).toBeVisible()
    const box = (await stage.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(320)
    expect(box.width, '320px 宽下画布应接近吃满').toBeGreaterThan(280)

    // 面板排在画布下方，滚得到（底部数值抽屉）
    await page.getByTestId('export-panel').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('export-panel')).toBeVisible()
    await expect(page.getByTestId('asset-row')).toHaveCount(0) // 资产库也在
    await expect(page.getByLabel('资产库', { exact: true })).toBeVisible()

    // 手绘区在窄屏下仍然可用（触控手绘那一条）
    await page.getByRole('button', { name: '手绘' }).click()
    await expect(page.getByLabel('手绘区')).toBeVisible()
  })

  test('导出分辨率默认降到 720p', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('分辨率').scrollIntoViewIfNeeded()
    await expect(page.getByLabel('分辨率')).toHaveValue('720')
  })

  test('画布吸顶：向下滚时预览不离开视野', async ({ page }) => {
    await page.goto('/')
    const stage = page.getByTestId('stage')
    const before = (await stage.boundingBox())!
    await page.getByTestId('export-panel').scrollIntoViewIfNeeded()

    // 页面确实滚动了（否则这条断言是空转的）
    const scrolled = await page.evaluate(() => document.querySelector('main')!.scrollTop)
    expect(scrolled).toBeGreaterThan(200)

    // 画布没有跟着滚走：不吸顶的话它会被滚出可视区（y 变成负数）
    const after = (await stage.boundingBox())!
    expect(after.y, '画布被滚出视野了').toBeGreaterThan(0)
    expect(after.y, '画布不再贴住顶部').toBeLessThan(100)
    // 只挪动了「内边距那一点点」，不是挪动了滚动距离
    expect(Math.abs(after.y - before.y)).toBeLessThan(20)
  })
})

test('桌面：两栏布局，导出默认 1080p', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  await expect(page.getByLabel('分辨率')).toHaveValue('1080')

  // 画布与参数面板并排：参数面板整体落在画布右侧
  const stage = (await page.getByTestId('stage').boundingBox())!
  const value = (await page.getByLabel('参数面板', { exact: true }).boundingBox())!
  expect(value.x).toBeGreaterThan(stage.x + stage.width - 1)
})
