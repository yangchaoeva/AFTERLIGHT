import { chromium } from '@playwright/test';
import fs from 'node:fs';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 });
  await page.locator('#open-leaderboard').click();
  await page.waitForFunction(() => document.getElementById('leaderboard-screen')?.hidden === false);
  await page.locator('#lb-track').selectOption('coast');
  await page.locator('[data-lb-region="CN"]').click();
  if (!(await page.locator('#lb-board-title').textContent()).includes('CHINA')) throw new Error('地区榜切换未更新标题');
  await page.locator('#lb-mode').selectOption('race');
  if (await page.locator('#lb-difficulty-wrap').isHidden()) throw new Error('竞速榜没有显示难度筛选');
  await page.locator('#lb-mode').selectOption('time');
  if (!(await page.locator('#lb-difficulty-wrap').isHidden())) throw new Error('计时榜仍显示无关 AI 难度');
  const playerId = await page.locator('#lb-player-id').textContent();
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) throw new Error('匿名玩家 ID 未生成');
  await page.locator('#lb-nickname').fill('AFTERLIGHT QA');
  await page.locator('#lb-profile-region').selectOption('NA');
  await page.locator('#lb-save-profile').click();
  if ((await page.locator('#lb-nickname').inputValue()) !== 'AFTERLIGHT QA') throw new Error('匿名资料未保存');
  await fs.promises.mkdir('artifacts/leaderboard', { recursive: true });
  await page.screenshot({ path: 'artifacts/leaderboard/v01-desktop.png', fullPage: true });
  await page.locator('#leaderboard-back').click();
  if (!(await page.locator('#menu').isVisible())) throw new Error('返回首页失败');
  if (errors.length) throw new Error(`浏览器错误：${errors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, playerId, screenshot: 'artifacts/leaderboard/v01-desktop.png', api: 'not configured; offline message expected' }, null, 2));
} finally {
  await browser.close();
}
