import { expect, test } from '@playwright/test'

/** 汉字区间。界面按 id 映射的那几处（诊断、预置名、变换标签）也走同一条判定 */
const CJK = /[一-龥]/

test('中英双语：切到英文后界面不再残留汉字，切回来还原', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('shape-name')).toContainText('当前：')

  await page.getByTestId('lang-toggle').click()
  await expect(page.getByTestId('shape-name')).toContainText('Current:')

  // 整页扫一遍（header / 主面板 / footer 都在 body 里）。
  // 这一条是「英文模式下界面不该再出现汉字」那道的实际执行者：漏掉哪个串都会红。
  const body = await page.locator('body').innerText()
  expect(body.match(CJK)?.[0] ?? '', '界面里残留了汉字').toBe('')

  // 帮助对话框默认是关的（display:none 不进 innerText），单独打开再扫一次
  await page.getByTestId('help-open').click()
  await expect(page.locator('dialog')).toBeVisible()
  const help = await page.locator('dialog').innerText()
  expect(help.match(CJK)?.[0] ?? '', '帮助对话框里残留了汉字').toBe('')
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog')).toBeHidden()

  // 切回中文
  await page.getByTestId('lang-toggle').click()
  await expect(page.getByTestId('shape-name')).toContainText('当前：')
})

test('语言偏好记在本地，刷新后还是上次选的那门', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('lang-toggle').click()
  await expect(page.getByTestId('shape-name')).toContainText('Current:')

  await page.reload()
  await expect(page.getByTestId('shape-name')).toContainText('Current:')

  // 收拾干净，别影响别的用例（同一个浏览器上下文里语言是共享的）
  await page.getByTestId('lang-toggle').click()
  await expect(page.getByTestId('shape-name')).toContainText('当前：')
})
