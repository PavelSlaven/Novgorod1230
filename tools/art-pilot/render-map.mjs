import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { renderMap } from './map.mjs';
import { sampleOvermap, sampleVisibility } from './map-sample.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out', 'map');
mkdirSync(outDir, { recursive: true });

const map = sampleOvermap(1230);
const hero = map.villages[0];
const npcs = [[hero[0] + 2, hero[1] - 1], [hero[0] - 1, hero[1] + 2], [map.town[0], map.town[1] + 1]];
const jobs = {
  'map-summer': () => renderMap({ map }),
  'map-summer-fog': () => renderMap({ map, visibility: sampleVisibility(map, hero), hero, npcs }),
  'map-winter': () => renderMap({ map, season: 'winter' }),
  'map-other-region': () => renderMap({ map: sampleOvermap(77) })
};
const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 2 });
for (const [name, make] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now();
  const svg = make();
  writeFileSync(join(outDir, `${name}.svg`), svg);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: 1200, height: 750 } });
  console.log(name, `${Date.now() - t0} ms`, `${(svg.length / 1024).toFixed(0)} KB`);
}
await browser.close();
