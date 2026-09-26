import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/promo/screenshots');
await fs.mkdir(output, {recursive: true});
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--no-sandbox'],
});
const entries = [];
const errors = [];

async function shot(page, name, title, context) {
  await page.waitForTimeout(650);
  const png = `${name}.png`;
  const jpg = `${name}.jpg`;
  await page.screenshot({path: path.join(output, png), animations: 'disabled'});
  await page.screenshot({path: path.join(output, jpg), type: 'jpeg', quality: 88, animations: 'disabled'});
  const telemetry = await page.evaluate(() => window.__afterlight.telemetry);
  entries.push({name, title, context, png, jpg, circuit: telemetry.circuit,
    theme: telemetry.theme, cameraMode: telemetry.cameraMode,
    resolution: '1600 × 900'});
  console.log(`${name}: ${title}`);
}

async function begin(page, circuit, theme) {
  await page.locator('#play').click();
  await page.locator('#circuit').selectOption(circuit);
  await page.locator('#theme').selectOption(theme);
  await page.locator('#start-race').click();
  await page.waitForFunction(() => window.__afterlight?.state === 'intro', null, {timeout: 90000});
}

async function drive(page, at) {
  await page.locator('#intro-skip').click();
  await page.waitForFunction(() => window.__afterlight?.state === 'racing', null, {timeout: 60000});
  await page.evaluate(t => window.__afterlight.qaLocate(t), at);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1150);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(350);
}

async function quit(page) {
  await page.keyboard.press('Escape');
  await page.locator('#quit').click();
  await page.waitForFunction(() => window.__afterlight?.state === 'menu');
}

try {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
  page.setDefaultTimeout(90000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/?qa', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__afterlight?.state === 'menu', null, {timeout: 90000});
  await page.locator('#loading').waitFor({state: 'hidden'});
  await shot(page, '01-home', 'AFTERLIGHT 主页面', '铬湾港城、原创跑车与开始竞速入口');

  await page.locator('#open-garage').click();
  await page.locator('[data-garage-model="nightslash"]').click();
  await page.waitForTimeout(900);
  await shot(page, '02-garage', '独立 3D 车库', '五款原创车辆与 NIGHTSLASH 预览');
  await page.locator('#garage-back').click();

  await begin(page, 'harbor', 'day');
  await page.waitForTimeout(1050);
  await shot(page, '03-harbor-aerial', '铬湾港城 · 航拍', '赛前俯瞰港口、城区与环线');
  await drive(page, .28);
  await shot(page, '04-harbor-bridge', '铬湾港城 · 高架公路', '桥梁与港口景观，第三人称驾驶');
  await quit(page);

  await begin(page, 'coast', 'day');
  await page.waitForTimeout(1050);
  await shot(page, '05-coast-aerial', '金潮海岸 · 航拍', '海岸公路全景');
  await drive(page, .26);
  await shot(page, '06-coast-drive', '金潮海岸 · 驾驶', '海边弯道，第三人称驾驶');
  await page.keyboard.press('KeyC');
  await shot(page, '07-coast-cockpit', '金潮海岸 · 驾驶席', '车内第一人称视角');
  await quit(page);

  await begin(page, 'mountain', 'day');
  await page.waitForTimeout(1050);
  await shot(page, '08-mountain-aerial', '岚脊天路 · 航拍', '高低落差与蜿蜒山路');
  await drive(page, .64);
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC');
  await shot(page, '09-mountain-drive', '岚脊天路 · 山道', '远景追尾镜头与山间桥梁');
  await quit(page);

  await begin(page, 'harbor', 'night');
  await drive(page, .40);
  await page.keyboard.press('KeyL');
  await shot(page, '10-harbor-night', '铬湾港城 · 暗夜', '远光灯照亮夜间港城赛道');
  await quit(page);

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({entries, errors}, null, 2));
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(`Captured ${entries.length} actual game screenshots.`);
} finally {
  await browser.close();
}
