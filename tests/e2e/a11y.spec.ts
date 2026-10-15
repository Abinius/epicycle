import { expect, test } from '@playwright/test'

test('键盘快捷键：空格 / 方向键 / F / E 都能操作', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  // 初始焦点在 body，空格切换播放
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible()

  // ↑↓ 调 K，按住 Shift 一次 10 个
  const k = page.getByRole('slider', { name: '项数 K' })
  const k0 = Number(await k.inputValue())
  await page.keyboard.press('ArrowUp')
  await expect(k).toHaveValue(String(k0 + 1))
  await page.keyboard.press('ArrowDown')
  await expect(k).toHaveValue(String(k0))
  await page.keyboard.press('Shift+ArrowUp')
  await expect(k).toHaveValue(String(k0 + 10))

  // ←→ 调播放速度
  const speed = page.getByRole('slider', { name: '播放速度' })
  const s0 = Number(await speed.inputValue())
  await page.keyboard.press('ArrowRight')
  await expect(speed).toHaveValue(String(Number((s0 + 0.1).toFixed(2))))

  // F 冻结成资产
  await expect(page.getByTestId('asset-row')).toHaveCount(0)
  await page.keyboard.press('f')
  await expect(page.getByTestId('asset-row')).toHaveCount(1)

  // E 跳到导出面板并聚焦它
  await page.keyboard.press('e')
  await expect(page.getByTestId('export-panel')).toBeFocused()

  expect(errors).toEqual([])
})

test('快捷键给浏览器让路：焦点在输入 / 下拉里时一律不接管', async ({ page }) => {
  await page.goto('/')

  // 选中滑块时按空格：滑块不该把自己的值改掉，快捷键也不该把播放切掉
  const k = page.getByRole('slider', { name: '项数 K' })
  await k.focus()
  const k0 = await k.inputValue()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: '暂停' })).toBeVisible()
  await expect(k).toHaveValue(k0)

  // 下拉里按 f：不该冻结出资产（f 在下拉上有原生行为，交给浏览器）
  await page.getByRole('combobox', { name: '形状' }).focus()
  await page.keyboard.press('f')
  await expect(page.getByTestId('asset-row')).toHaveCount(0)

  // 焦点回到非交互区域，快捷键立刻恢复
  await page.getByTestId('stage').click()
  await page.keyboard.press('f')
  await expect(page.getByTestId('asset-row')).toHaveCount(1)
})

test('降低运动量：跟随系统偏好，也能手动改', async ({ page }) => {
  // 系统说「减少动态效果」→ 开关应当默认打开
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const toggle = page.getByTestId('reduced-motion')
  await expect(toggle).toBeChecked()

  // 手动关掉：用户说了算
  await toggle.uncheck()
  await expect(toggle).not.toBeChecked()
})

test('无障碍：面板都有区域名，滑块都有标签', async ({ page }) => {
  await page.goto('/')
  // exact 是必须的：getByLabel 默认按子串匹配，「导出」会同时命中 aria-label="导出格式" 的下拉
  for (const name of ['渲染画布', '素材来源', '参数面板', '振幅频谱', '形状过渡', '导出', '资产库']) {
    await expect(page.getByLabel(name, { exact: true }), name).toBeVisible()
  }
  // 每个 range 都能被无障碍树报出名字（拿不到名字的滑块等于键盘用户用不了）
  const sliders = page.getByRole('slider')
  const n = await sliders.count()
  expect(n).toBeGreaterThan(5)
  for (let i = 0; i < n; i++) {
    expect(await sliders.nth(i).getAttribute('aria-label'), `滑块 #${i}`).toBeTruthy()
  }
})
