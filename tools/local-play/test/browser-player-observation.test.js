import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { before, after } from 'node:test';
import { chromium } from 'playwright-core';
import { observePlayerPanels } from '../browser-player-observation.mjs';

const executable = [process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].find(path => path && existsSync(path));

let browser, page;
before(async () => {
  if (!executable) return;
  browser = await chromium.launch({ executablePath: executable, headless: true,
    timeout: 45_000, args: ['--no-sandbox', '--no-proxy-server'] });
  page = await browser.newPage();
  page.setDefaultTimeout(5_000);
  await page.setContent(`<main>
    <button data-overlay-open="inventory">Ноша</button>
    <button data-overlay-open="journal">Летопись</button>
    <button data-overlay-open="map" disabled>Карта</button>
    <button data-overlay-open="diagnostic">Диагностика</button>
    <button data-llm-settings-open>Настройки</button>
    <div id="overlay"></div></main>
    <script>
      window.opened = [];
      document.addEventListener('click', event => {
        const key = event.target.dataset.overlayOpen;
        if (key) {
          window.opened.push(key);
          const text = { inventory: 'Медная игла', journal: 'Обещал вернуть сеть.',
            diagnostic: 'HIDDEN_OWNER_STATE', map: 'DISABLED_MAP' }[key];
          document.getElementById('overlay').innerHTML =
            '<section data-overlay-panel>' + text + '<button data-overlay-close>Закрыть</button></section>';
        }
        if (event.target.hasAttribute('data-overlay-close'))
          document.getElementById('overlay').replaceChildren();
      });
    </script>`);
}, { timeout: 60_000 });
after(async () => { await browser?.close(); }, { timeout: 10_000 });

test('PLAYER opens public panels through Chromium and never sees diagnostic data', {
  skip: !executable, timeout: 30_000
}, async () => {
  const panels = await observePlayerPanels(page);
  assert.equal(panels.length, 2);
  assert.match(panels[0], /Медная игла/u);
  assert.match(panels[1], /Обещал вернуть сеть/u);
  assert.doesNotMatch(panels.join('\n'), /HIDDEN_OWNER_STATE|DISABLED_MAP/u);
  assert.deepEqual(await page.evaluate(() => window.opened), ['inventory', 'journal']);
  assert.equal(await page.locator('[data-overlay-panel]').count(), 0);
});
