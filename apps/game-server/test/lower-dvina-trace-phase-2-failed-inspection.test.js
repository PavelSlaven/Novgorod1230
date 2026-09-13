import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('failed inspection commits cost but no discovery and remains retryable', async () => {
  const f = fixture({ rollValue: 0 });
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-failure',
      idempotency_key: 'phase2-failure',
      raw_text: 'Осмотреть место крушения подробно.'
    }
  });
  assert.equal(result.check.outcome.success, false);
  assert.equal(result.clue, null);
  assert.deepEqual(result.time_update.exact_elapsed.exact_minutes, {
    numerator: '15', denominator: '1'
  });
  assert.equal(result.body_update.proposal.exact_deltas.energy, -1);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(f.state.knowledge, []);
  const factual = f.lastWritePlan().write_targets.find(
    ({ target }) => target === 'party_state'
  ).value;
  assert.deepEqual(factual.consequence.visible_seed.observation_refs, []);
  assert.deepEqual(factual.consequence.visible_seed.evidence_refs, []);
  assert.deepEqual(factual.consequence.hidden_update, {
    approved_fact_ids: [], approved_evidence_ids: []
  });
  const narration = f.narratorInput().visible_context.visible_changes.join(' ');
  assert.equal(/обломки|босые следы|след сапога/u.test(narration), false);
  assert.equal(f.state.items.some((item) =>
    item.template_id === 'trace_ld_v1_item_blue_wool_fragment'), false);
  await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-failure-retry',
      idempotency_key: 'phase2-failure-retry',
      raw_text: 'Осмотреть место крушения подробно.'
    }
  });
  assert.equal(f.rollCount(), 2);
  assert.equal(f.commitCount(), 2);
});
