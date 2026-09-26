import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const folder = path.resolve('artifacts/promo/coast-scout');
await fs.mkdir(folder, {recursive: true});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'],
});
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  await page.goto('http://127.0.0.1:5173/?qa');
  await page.waitForFunction(() => window.__afterlight?.state === 'menu', null, {timeout: 90000});
  await page.locator('#play').click();
  await page.locator('#circuit').selectOption('coast');
  await page.locator('#start-race').click();
  await page.waitForFunction(() => window.__afterlight?.state === 'intro', null, {timeout: 90000});
  await page.locator('#intro-skip').click();
  await page.waitForFunction(() => window.__afterlight?.state === 'racing', null, {timeout: 60000});
  for (const t of [.06, .14, .38, .48, .58, .7, .82, .92]) {
    await page.evaluate(v => window.__afterlight.qaLocate(v), t);
    await page.waitForTimeout(350);
    await page.screenshot({path: path.join(folder, `${t}.jpg`), type: 'jpeg', quality: 82});
    console.log(t);
  }
} finally {
  await browser.close();
}
