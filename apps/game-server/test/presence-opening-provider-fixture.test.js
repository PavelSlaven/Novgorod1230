import assert from 'node:assert/strict';
import test from 'node:test';
import { installPresenceProductionE2eFetch } from
  '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

test('presence provider fixture recognizes Russian opening payload shapes', async () => {
  const restoreFetch = installPresenceProductionE2eFetch();
  const request = (input, system = 'Русская инструкция роли вступления.') => ({
    messages: [{ role: 'system', content: system },
      { role: 'user', content: JSON.stringify(input) }],
  });
  const output = async (input, system) => {
    const response = await globalThis.fetch(
      'https://target-acceptance.invalid/chat/completions', {
        method: 'POST', body: JSON.stringify(request(input, system)) });
    return (await response.json()).choices[0].message.content;
  };
  try {
    assert.deepEqual(JSON.parse(await output({ сцена: {
      факты: ['Утро.'], персонажи: [{ имя: 'Любава', факты: ['Она у берега.'] }],
      граница: 'Каждое утверждение должно иметь опору в фактах.',
    } })), { prose: 'Утро. Любава\n\nОна у берега.' });
    assert.deepEqual(JSON.parse(await output({ сцена: {
      персонажи: [{ имя: 'Любава', факты: ['Она у берега.'] }],
      граница: 'Каждое утверждение должно иметь опору в фактах.',
    } })), { prose: 'Любава\n\nОна у берега.' });
    assert.deepEqual(JSON.parse(await output({ сцена: {
      факты: [{ ключ: 'f1', текст: 'Утро.' }], персонажи: [],
      обязательные_ключи: ['f1'],
      граница: 'Каждое утверждение должно иметь опору в фактах.',
    }, проверяемая_проза: 'Утро.' })), {
      pass: true, failed_checks: [], concerns: [],
      evidence: ['Проверено по переданным фактам вступления.'],
    });
    assert.deepEqual(JSON.parse(await output({ сцена: {
      факты: [{ ключ: 'f1', текст: 'Утро.' }], персонажи: [],
      обязательные_ключи: ['f1'],
      граница: 'Каждое утверждение должно иметь опору в фактах.',
    }, проверяемая_проза: 'Неверно.', отклонённая_проза: 'Неверно.', замечания_проверки: [
      { причина: 'Исправьте по фактам.' }],
    })), { prose: 'Утро.' });
    await assert.rejects(output({}, 'Незнакомая роль.'),
      /role=unknown schema=<absent> system=Незнакомая роль\./u);
  } finally {
    restoreFetch();
  }
});
