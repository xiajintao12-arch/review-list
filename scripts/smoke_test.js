const path = 'C:/Users/Mr.xia/.workbuddy/binaries/node/versions/22.22.2-3/node_modules/@playwright/cli/node_modules/playwright-core'
const { chromium } = require(path)

const URL = process.argv[2] || 'https://review-list.app.workbuddy.host/'

;(async () => {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY
  const browser = await chromium.launch({ channel: 'msedge', proxy: proxy ? { server: proxy } : undefined })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 160)))

  await page.goto(URL, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(7000)
  console.log('view-list class:', await page.getAttribute('#view-list', 'class'))
  console.log('today title:', await page.textContent('#today-title'))

  // 1) 添加复习任务
  await page.fill('#task-input', '测试任务：FSRS 算法第1课')
  await page.click('#btn-add')
  await page.waitForTimeout(1800)
  let items = await page.$$eval('#today-list .task-item', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))
  console.log('添加后列表:', JSON.stringify(items))

  // 2) 添加 DDL 任务
  await page.check('#ddl-toggle')
  await page.fill('#ddl-date', new Date().toISOString().slice(0, 10))
  await page.fill('#task-input', '测试：交实验报告')
  await page.click('#btn-add')
  await page.waitForTimeout(1800)
  items = await page.$$eval('#today-list .task-item', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))
  console.log('加DDL后列表:', JSON.stringify(items))

  // 3) 完成第一个（复习）
  const checks = await page.$$('#today-list .task-item .check')
  if (checks.length) await checks[0].click()
  await page.waitForTimeout(2000)
  console.log('完成后剩余:', await page.$$eval('#today-list .task-item', (e) => e.length))
  console.log('toast:', (await page.textContent('#toast')) || '-')

  // 4) 更多功能：图表 / 计划 / 任务管理
  await page.click('#btn-more')
  await page.waitForTimeout(2500)
  console.log('图表 svg 数量:', await page.$$eval('#chart-count svg, #chart-percent svg', (e) => e.length))
  console.log('未来计划天数:', await page.$$eval('#upcoming .up-day', (e) => e.length))
  console.log('任务管理条数:', await page.$$eval('#manage-list .manage-item', (e) => e.length))
  const slider = await page.$('[data-ret-slider]')
  if (slider) {
    await slider.fill('0.95')
    await page.dispatchEvent('[data-ret-slider]', 'change')
    await page.waitForTimeout(1500)
    console.log('调整记住率后 toast:', (await page.textContent('#toast')) || '-')
  }
  console.log('控制台错误:', errors.length ? errors : '无')
  await browser.close()
})().catch((e) => { console.error('FAILED', e.message); process.exit(1) })
