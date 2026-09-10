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


test('opening and turn identify the controlled character without opening a panel', () => {
  for (const schema of ['first_game_screen', 'lower_dvina_trace_turn_screen']) {
    const screen = { version: 1, schema, screen_status: 'ready', party_id: 'party',
      main_prose: 'Берег.', panels: { character: { visible: true,
        data: { name: 'Ульяна', role: 'ткачиха' } }, people: { visible: true,
        data: { visible_npcs: [{ display_label: 'Данила' }] } } } };
    const before = structuredClone(screen);
    const html = renderScreen(screen);
    assert.match(html, /<dt>Вы<\/dt><dd>Ульяна, ткачиха<\/dd>/u);
    assert.doesNotMatch(html, /<dt>Вы<\/dt><dd>Данила/u);
    assert.deepEqual(screen, before);
    screen.panels.character.visible = false;
    assert.doesNotMatch(renderScreen(screen), /<dt>Вы<\/dt>/u);
  }
});
