// Read the same public panels a human player can open. Developer diagnostics
// and provider settings are deliberately outside the PLAYER's observation.
const PANELS = ['character', 'inventory', 'people', 'route', 'map', 'journal'];

export async function observePlayerPanels(page) {
  const observations = [];
  for (const name of PANELS) {
    const button = page.locator(`[data-overlay-open="${name}"]:not([disabled])`);
    if (await button.count() === 0) continue;
    await button.click();
    try {
      observations.push(await page.locator('[data-overlay-panel]').innerText());
    } finally {
      await page.locator('[data-overlay-close]').click();
    }
  }
  return observations;
}
