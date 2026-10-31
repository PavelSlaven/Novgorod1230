import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { renderLandscape, LANDSCAPE_TIMES, LANDSCAPE_WEATHER } from './landscape.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', 'land');
mkdirSync(outDir, { recursive: true });

const all = LANDSCAPE_TIMES.flatMap((t) => LANDSCAPE_WEATHER.map((w) => `${t}-${w}`));
const only = process.argv.slice(2);
const names = only.length ? only : all;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
const started = Date.now();
for (const name of names) {
  const [time, weather] = name.split('-');
  const svg = renderLandscape({ time, weather });
  writeFileSync(join(outDir, `${name}.svg`), svg);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: 1200, height: 675 } });
}
console.log(`${names.length} images, ${((Date.now() - started) / names.length).toFixed(0)} ms each`);
if (!only.length) {
  const w = 320;
  const h = 180;
  const imgs = all.map((n) => `<img style="width:${w}px;height:${h}px;display:block" src="data:image/png;base64,${readFileSync(join(outDir, `${n}.png`)).toString('base64')}">`).join('');
  const cols = LANDSCAPE_WEATHER.length;
  const head = LANDSCAPE_WEATHER.map((x) => `<div style="color:#ddd;font:14px Georgia;text-align:center;padding:4px">${x}</div>`).join('');
  const sheet = await browser.newPage({ viewport: { width: cols * w + 90, height: LANDSCAPE_TIMES.length * h + 26 }, deviceScaleFactor: 1 });
  const rows = LANDSCAPE_TIMES.map((t, i) => `<div style="color:#ddd;font:14px Georgia;display:flex;align-items:center;padding-left:8px">${t}</div>${imgs.split('<img').slice(1 + i * cols, 1 + (i + 1) * cols).map((x) => `<img${x}`).join('')}`).join('');
  await sheet.setContent(`<html><body style="margin:0;background:#111;display:grid;grid-template-columns:90px repeat(${cols},${w}px)"><div></div>${head}${rows}</body></html>`);
  await sheet.screenshot({ path: join(outDir, 'sheet-land.png') });
  console.log('sheet-land');
}
await browser.close();
