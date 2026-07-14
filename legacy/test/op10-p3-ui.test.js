import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explainActionHintsValidation,
  validateActionHintsResponse
} from '../src/world/json-contracts.js';
import { buildActionHintsInput, resolveActionHints } from '../src/ui/action-hints.js';
import { generateActionHints } from '../src/ui/action-hints-agent.js';

test('action hints contract accepts envelope and caps items', () => {
  const payload = validateActionHintsResponse({
    version: 1,
    schema: 'action_hints',
    hints: [
      { text: 'Осмотреть ворота', tone: 'осторожно', risk_hint: 'люди рядом' },
      { text: 'Спросить дорогу', tone: null, risk_hint: null }
    ]
  });
  assert.ok(payload);
  assert.equal(payload.hints.length, 2);

  const tooMany = validateActionHintsResponse({
    version: 1,
    schema: 'action_hints',
    hints: Array.from({ length: 6 }, (_, index) => ({ text: `действие ${index + 1}` }))
  });
  assert.equal(tooMany, null);
  assert.match(
    explainActionHintsValidation({
      version: 1,
      schema: 'action_hints',
      hints: Array.from({ length: 6 }, (_, index) => ({ text: `действие ${index + 1}` }))
    }).errors.join('; '),
    /1\.\.5/
  );
});

test('generateActionHints uses mock fetch and returns validated hints', async () => {
  const input = buildActionHintsInput({
    visibleScene: { prose: 'У ворот стоят люди.', markup: { highlights: [] } },
    player: { status: 'путник', states: { health: 80, satiety: 55, vigor: 40 } }
  });

  const fetchImpl = async () => ({
    ok: true,
    async text() { return ''; },
    async json() {
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              version: 1,
              schema: 'action_hints',
              hints: [
                { text: 'Тихо спросить, кто стоит у ворот', tone: 'осторожно', risk_hint: 'внимание стражи' },
                { text: 'Осмотреть следы у калитки', tone: 'скрытно', risk_hint: null }
              ]
            })
          }
        }]
      };
    }
  });

  const hints = await generateActionHints(input, {
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: 'https://example.test',
    DEEPSEEK_MODEL: 'deepseek-chat'
  }, { fetchImpl });

  assert.equal(hints.length, 2);
  assert.match(hints[0].text, /ворот/);
});

test('resolveActionHints falls back when agent throws', async () => {
  const input = buildActionHintsInput({
    visibleScene: {
      prose: 'Двор.',
      markup: { highlights: [{ label: 'колодец', action: 'inspect' }] }
    },
    player: { status: 'путник' }
  });

  const resolved = await resolveActionHints(input, {
    generate: async () => {
      throw new Error('api down');
    }
  });

  assert.equal(resolved.source, 'fallback');
  assert.ok(resolved.hints.length > 0);
});

test('resolveActionHints prefers agent hints when generate succeeds', async () => {
  const input = buildActionHintsInput({
    visibleScene: { prose: 'Тропа у реки.', markup: {} },
    player: { status: 'путник' }
  });

  const resolved = await resolveActionHints(input, {
    generate: async () => ([
      { text: 'Прислушаться к берегу', tone: 'осторожно', risk_hint: 'скользко' }
    ])
  });

  assert.equal(resolved.source, 'agent');
  assert.equal(resolved.hints[0].text, 'Прислушаться к берегу');
});
