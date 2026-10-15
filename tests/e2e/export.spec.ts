import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** 把导出压到最小：周期 0.5 秒 + 720p + 24fps + 单圈 + 不留白 = 12 帧 */
async function tinyExport(page: Page) {
  await page.getByRole('slider', { name: '周期 T (秒)' }).fill('0.5')
  await page.getByLabel('分辨率').selectOption('720')
  await page.getByLabel('帧率').selectOption('24')
  await page.getByLabel('循环数').selectOption('1')
  await page.getByRole('slider', { name: '首尾留白 (秒)' }).fill('0')
}

test('导出：能力探测 → 落盘一个可下载的成品，文件名按模板（R-7）', async ({ page }) => {
  // 降级链可能一路走到 PNG 序列（96 帧要逐帧编码），给足时间
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await tinyExport(page)

  // 导出前必须先给出体积预估——这就是 PRD §5.2 的「二次确认」
  await expect(page.getByTestId('export-bytes')).toContainText('约', { timeout: 20_000 })

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 150_000 }),
    page.getByTestId('export-btn').click(),
  ])

  // 文件名模板：fourierboard_<名>_<W>x<H>_<fps>_<codec>_<yyyymmdd>.<ext>
  // GIF 会被固定降采成 12 fps，所以帧率那段不做死值断言
  expect(download.suggestedFilename()).toMatch(
    /^fourierboard_.*_\d+x\d+_\d+_(h264|vp9|vp8|gif|png)_\d{8}\.(mp4|webm|gif|zip)$/,
  )

  const path = test.info().outputPath('export-out')
  await download.saveAs(path)
  expect(readFileSync(path).length, '导出的文件不该是空的').toBeGreaterThan(1000)

  // 落盘后给出成品信息（含降级说明，如果有）
  await expect(page.getByTestId('export-message')).toContainText('已导出')
  // 不把「走了哪条降级档」写成硬断言（那取决于浏览器能力），但要看得见
  const summary = await page.getByTestId('export-message').innerText()
  console.log('[导出通路]', summary)
  test.info().annotations.push({ type: '导出通路', description: summary })
  expect(errors).toEqual([])
})

test('导出面板：换画幅按短边换算，宽高恒为偶数（H.264 不接受奇数边长）', async ({ page }) => {
  await page.goto('/')
  const size = page.getByTestId('export-estimate')
  // 精确匹配：「轨迹比例」里也含「比例」两个字
  const aspect = page.getByLabel('比例', { exact: true })

  await expect(size).toContainText('1920 × 1080')
  await page.getByLabel('分辨率').selectOption('720')
  await expect(size).toContainText('1280 × 720')
  // 比例换成竖版：短边（宽）保持 720，高按比例撑出去
  await aspect.selectOption('9:16')
  await expect(size).toContainText('720 × 1280')
  await aspect.selectOption('1:1')
  await expect(size).toContainText('720 × 720')
  // 4K + 16:9
  await aspect.selectOption('16:9')
  await page.getByLabel('分辨率').selectOption('2160')
  await expect(size).toContainText('3840 × 2160')
})

test('透明背景：MP4 拿不到 alpha，面板在点导出之前就把降级说明摆出来', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('背景').selectOption('clear')
  // 要么降到 WebM（带说明），要么降到 PNG 序列（带说明）——总之不能是无声无息
  await expect(page.getByTestId('export-note')).toContainText('透明', { timeout: 20_000 })
})
