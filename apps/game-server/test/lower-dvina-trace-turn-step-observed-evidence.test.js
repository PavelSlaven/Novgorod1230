import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from
  './lower-dvina-trace-turn-step-llm-test-helpers.js';

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
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.deepEqual(mappings.observed_evidence_inspection.operations[0], {
      op: 'request_discovery',
      actor_ref: '<copy current actor ref from request>',
      discovery_kind: 'inspect',
      target_refs: ['<copy every relevant candidate fact_ref exactly>'],
      query: '<copy the current evidence-inspection question>'
    });
    assert.match(prompt,
      /observed_evidence_inspection\.semantic_grounding_available[\s\S]*before focused_ordinary_discovery[\s\S]*never target the current location[\s\S]*no new hidden conclusion/u);
  });
