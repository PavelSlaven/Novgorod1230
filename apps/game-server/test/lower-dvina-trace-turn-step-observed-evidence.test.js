import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from
  './lower-dvina-trace-turn-step-llm-test-helpers.js';

function plannerPromptMappings(prompt) {
  return Object.fromEntries([...prompt.matchAll(/^Сопоставление: ([^\n]+)\n([^\n]+)/gmu)]
    .map(([, name, json]) => [name, JSON.parse(json)]));
}

test('turn step planner routes observed-evidence comparison before ordinary discovery',
  async () => {
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) { prompt = call.messages[0].content;
        return { output: output() }; }
    } });
    await model(request({ player_safe_state: {
      ordinary_resolution: { discovery_available: true },
      observed_evidence_inspection: { semantic_grounding_available: true,
        candidates: [
          { fact_ref: 'fact:boot-track', text: 'В песке виден след сапога.' },
          { fact_ref: 'fact:wool', text: 'На ветке висит клочок шерсти.' }
        ] }
    } }));
    const mappings = plannerPromptMappings(prompt);
    assert.deepEqual(mappings.observed_evidence_inspection.operations[0], {
      op: 'request_discovery',
      actor_ref: '<скопируй ref текущего актора из request>',
      discovery_kind: 'inspect',
      target_refs: ['<скопируй точно каждую подходящую ссылку fact_ref из request>'],
      query: '<полный вопрос об осмотре свидетельств из request>'
    });
    assert.match(prompt,
      /observed_evidence_inspection\.semantic_grounding_available[\s\S]*раньше focused_ordinary_discovery[\s\S]*никогда не указывай текущую локацию или обычную область[\s\S]*не устанавливают идентичность/u);
    assert.match(prompt,
      /каждый физический факт или объект для осмотра либо сравнения представлен текстом кандидата[\s\S]*Если какая-либо сторона сравнения или запрошенная подробность не передана[\s\S]*query, называющим только недостающий объект[\s\S]*сохрани полное сравнение в continuation/u);
  });
