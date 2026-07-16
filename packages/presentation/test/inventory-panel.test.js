import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryPanelContract } from '../src/index.js';

test('inventory panel v1 groups only visible carried facts without recalculating gameplay', () => {
  const panel = createInventoryPanelContract({
    summary: { total_mass_grams: 1200, load_category: 'light', at_limit: false, hands_used: 1, hands_total: 2, hands_free: 1, primary_container_id: 'internal-only' },
    zones: {
      hands: [{ label: 'Нож', condition: 'sound', access: 'immediate', known_to_viewer: true }],
      worn_quick: [], equipped: [], quick_containers: [], primary_container: { label: 'Мешок', known_to_viewer: true }, external_load: [],
      not_carried: [{ label: 'Лодка', known_to_viewer: true }]
    },
    warnings: [{ code: 'INVENTORY_LOAD_EXCEEDED', player_message: 'Груз слишком тяжёл.' }]
  });
  assert.equal(panel.schema, 'inventory_panel');
  assert.equal(panel.zones.hands[0].label, 'Нож');
  assert.equal(panel.zones.not_carried, undefined);
  assert.equal(JSON.stringify(panel).includes('internal-only'), false);
  assert.equal(JSON.stringify(panel).includes('INVENTORY_LOAD_EXCEEDED'), false);
});

test('inventory panel v1 suppresses hidden and closed unknown contents', () => {
  const panel = createInventoryPanelContract({
    summary: { total_mass_grams: 0, load_category: 'light', at_limit: false, hands_used: 0, hands_total: 2, hands_free: 2, primary_container_id: null },
    zones: { hands: [], worn_quick: [], equipped: [], quick_containers: [{ label: 'Кошель', known_to_viewer: true, contents: [{ label: 'Серебро', known_to_viewer: false }] }], primary_container: null, external_load: [] },
    warnings: []
  });
  assert.equal(JSON.stringify(panel).includes('Серебро'), false);
});

test('inventory panel v1 rejects an incomplete derived summary instead of inventing visible defaults', () => {
  assert.throws(() => createInventoryPanelContract({ summary: { load_category: 'light' }, zones: {} }), { code: 'PRESENTATION_INVENTORY_INVALID' });
});
