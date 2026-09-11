import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from '../src/turn-step-loop.js';
import { basePlan, input, ports, result } from './turn-step-loop-fixture.js';

const cases = [
  ['speech/acoustic', { channel: 'acoustic', emission_strength: 4 }],
  ['noisy item manipulation', { channel: 'acoustic', emission_strength: 3 }],
  ['arrival/presence', { channel: 'visual', emission_strength: 2 }],
  ['wait/schedule', { channel: 'visual', emission_strength: 1 }]
];

for (const [label, perceptible_signal] of cases) {
  test(`${label} crosses the same post-applied factual seam`, async () => {
    const seen = [];
    const factual = {
      version: 1,
      schema: 'turn_step_factual_event_v1',
      event_ref: { entity_kind: 'action_event', entity_id: `event:${label}` },
      occurred_at: { whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1' },
      source_ref: { entity_kind: 'player_character', entity_id: 'actor-1' },
      source_scope_ref: { entity_kind: 'canonical_spatial_node',
        entity_id: 'shore' },
      perceptible_signal
    };
    const executionRegistry = createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => result(
        working_projection, label, { factual_events: [factual] })
    });
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry,
      postAppliedActorStep: async (request) => {
        seen.push(request);
        return { working_projection: request.working_projection,
          write_fragments: [], consequence_fragment: null };
      }
    }));

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].factual_events, [factual]);
    assert.equal('plan' in seen[0], false);
    assert.equal('raw_text' in seen[0], false);
    assert.equal(outcome.stop_reason, 'terminal');
  });
}

test('no materialized perception candidates does not synthesize a decision',
  async () => {
    let decisionCalls = 0;
    const outcome = await runTurnStepLoop(input(), ports({
      postAppliedActorStep: async ({ working_projection, factual_events }) => {
        assert.deepEqual(factual_events, []);
        return { working_projection, write_fragments: [],
          consequence_fragment: null };
      },
      resolveNpcDecision: async () => { decisionCalls += 1; }
    }));
    assert.equal(outcome.stop_reason, 'terminal');
    assert.equal(decisionCalls, 0);
  });

test('nonempty factual events fail when the common world owner is absent',
  async () => {
    const executionRegistry = createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => result(
        working_projection, 'sound', { factual_events: [{
          version: 1, schema: 'turn_step_factual_event_v1',
          event_ref: { entity_kind: 'sound_event', entity_id: 'sound:1' },
          occurred_at: { whole_minutes: '10', subminute_numerator: '0',
            subminute_denominator: '1' },
          source_ref: { entity_kind: 'player_character', entity_id: 'actor-1' },
          source_scope_ref: { entity_kind: 'canonical_spatial_node',
            entity_id: 'shore' },
          perceptible_signal: { channel: 'acoustic', emission_strength: 4,
            duration_class: 'instant' }
        }] })
    });
    await assert.rejects(() => runTurnStepLoop(input(), ports({
      executionRegistry
    })), ({ code }) => code === 'TURN_STEP_POST_APPLIED_OWNER_MISSING');
  });
