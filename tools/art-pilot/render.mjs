import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { renderWarrior, renderItemCard } from './warrior.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const CLOSE = '195 28 210 280';
const faces = [
  { helmet: 'sphero_conical', hairColor: 'grey', face: {} },
  { helmet: 'none', hairColor: 'blond', face: { age: 'young', skin: 'fair', shape: 'narrow', beard: 'none', moustache: 'none', brows: 'calm', eyes: 'blue' } },
  { helmet: 'tall_conical', hairColor: 'black', face: { age: 'mature', skin: 'tanned', shape: 'broad', beard: 'short', nose: 'broad', scar: 'cheek' } },
  { helmet: 'none', hairColor: 'grey', face: { age: 'old', skin: 'fair', shape: 'narrow', beard: 'forked', moustache: 'drooping', nose: 'hooked', brows: 'calm', eyes: 'grey', hair: 'bald' } },
  { helmet: 'sphero_conical', hairColor: 'red', face: { age: 'young', beard: 'short', brows: 'calm', eyes: 'blue' } },
  { helmet: 'none', hairColor: 'brown', face: { age: 'mature', shape: 'broad', moustache: 'drooping', nose: 'hooked', scar: 'brow' } },
  { helmet: 'sphero_conical', hairColor: 'black', face: { age: 'mature', skin: 'tanned', beard: 'forked', nose: 'broad', eyes: 'grey', scar: 'cheek' } },
  { helmet: 'tall_conical', hairColor: 'grey', face: { shape: 'broad', beard: 'short', nose: 'broad', brows: 'calm', eyes: 'grey' } }
];

const jobs = {
  'warrior-1': () => renderWarrior({}),
  'warrior-2': () => renderWarrior({ helmet: 'tall_conical', armor: 'chainmail', shield: 'round', cloak: '#3f5b3b', tunic: '#7a2a24', shieldColor: '#8c2a1e', hairColor: 'brown', seed: 11, face: { age: 'mature', shape: 'broad', moustache: 'drooping', nose: 'hooked' } }),
  'warrior-3': () => renderWarrior({ helmet: 'none', armor: 'scale', shield: 'almond', cloak: '#5b4630', tunic: '#2f5a5a', shieldColor: '#2d4f86', hairColor: 'black', seed: 21, face: { age: 'mature', skin: 'tanned', beard: 'forked', nose: 'broad', scar: 'cheek' } }),
  'warrior-4': () => renderWarrior({ helmet: 'sphero_conical', armor: 'chainmail', shield: 'none', cloak: '#2d3f6b', tunic: '#8a6a2a', hairColor: 'blond', seed: 5, face: { age: 'young', skin: 'fair', shape: 'narrow', beard: 'short', brows: 'calm', eyes: 'blue' } }),
  'item-helmet': () => renderItemCard({ item: 'helmet', title: 'Шлем сфероконический', lines: ['с кольчужной бармицей', 'железо'] }),
  'item-axe': () => renderItemCard({ item: 'axe', title: 'Боевой топор', lines: ['железо, дерево'], seed: 8 }),
  ...Object.fromEntries(faces.map((p, i) => [`face-${i + 1}`, () => renderWarrior({ ...p, seed: 30 + i, view: CLOSE })]))
};
const sheets = {
  'sheet-warriors': { names: ['warrior-1', 'warrior-2', 'warrior-3', 'warrior-4', 'item-helmet', 'item-axe'], cols: 3, w: 400 },
  'sheet-faces': { names: faces.map((_, i) => `face-${i + 1}`), cols: 4, w: 300 }
};

const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 });
for (const [name, make] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  const svg = make();
  writeFileSync(join(outDir, `${name}.svg`), svg);
  await page.setContent(`<html><body style="margin:0;background:#000">${svg}</body></html>`);
  await page.screenshot({ path: join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: 600, height: 800 } });
  console.log(name);
}
if (!only.length) {
  for (const [name, { names, cols, w }] of Object.entries(sheets)) {
    const h = Math.round((w * 4) / 3);
    const imgs = names.map((n) => `<img style="width:${w}px;height:${h}px;display:block" src="data:image/png;base64,${readFileSync(join(outDir, `${n}.png`)).toString('base64')}">`).join('');
    const sheet = await browser.newPage({ viewport: { width: cols * w, height: Math.ceil(names.length / cols) * h }, deviceScaleFactor: 1 });
    await sheet.setContent(`<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px)">${imgs}</body></html>`);
    await sheet.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(name);
  }
}
await browser.close();
