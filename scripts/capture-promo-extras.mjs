import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/promo/screenshots');
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'],
});
try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  await page.goto('http://127.0.0.1:5173/?qa');
  await page.waitForFunction(() => window.__afterlight?.state === 'menu', null, {timeout: 90000});
  for (const [circuit, theme, t, name] of [
    ['coast', 'day', .82, '06-coast-drive'],
    ['harbor', 'night', .40, '10-harbor-night'],
  ]) {
    await page.locator('#play').click();
    await page.locator('#circuit').selectOption(circuit);
    await page.locator('#theme').selectOption(theme);
    await page.locator('#start-race').click();
    await page.waitForFunction(() => window.__afterlight?.state === 'intro', null, {timeout: 90000});
    await page.locator('#intro-skip').click();
    await page.waitForFunction(() => window.__afterlight?.state === 'racing', null, {timeout: 60000});
    await page.evaluate(v => window.__afterlight.qaLocate(v), t);
    if (theme === 'night') await page.keyboard.press('KeyL');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(180);
    await page.screenshot({path: path.join(output, `${name}.png`)});
    await page.screenshot({path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 88});
    console.log(name, await page.evaluate(() => window.__afterlight.telemetry.stats.top));
    await page.keyboard.press('Escape');
    await page.locator('#quit').click();
  }
} finally {
  await browser.close();
}
