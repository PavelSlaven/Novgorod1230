import test from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from '../src/index.js';


test('turn header renders committed presentation context without requiring visible-package fields', () => {
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen', screen_status: 'ready', party_id: 'party', main_prose: 'Берег.', panels: {} };
  screen.visible_context = { visible_scene: 'Новая сцена' };
  screen.presentation_context = { location_label: 'Причал', date_label: '5.8.1230', time_label: '13:45' };
  const html = renderScreen(screen);
  assert.match(html, /Причал/);
  assert.match(html, /5\.8\.1230/);
  assert.match(html, /13:45/);
  assert.deepEqual(screen.visible_context, { visible_scene: 'Новая сцена' });
});


test('inventory renders the domain serviceable condition and equipped zones as player language', () => {
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen', screen_status: 'ready', party_id: 'party', main_prose: 'Берег.',
    panels: { inventory: { visible: true, data: { zones: {
      worn_quick: [{ label: 'Нож', condition: 'serviceable' }], equipped: [{ label: 'Рубаха', condition: 'serviceable' }]
    } } } } };
  const html = renderScreen(screen, { activeOverlay: 'inventory' });
  assert.match(html, /Состояние: исправно/);
  assert.match(html, /На теле/);
  assert.match(html, /Снаряжение/);
  assert.doesNotMatch(html, /serviceable/);
});
