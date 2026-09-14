import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';
import { currentWorldBaseReferenceSnapshot } from
  './lower-dvina-trace-phase-2-fixture-support.js';

test('revision 35 new-party pickup holds blue wool in one hand', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 35
  });
  const f = fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    worldBaseReferenceSnapshot: currentWorldBaseReferenceSnapshot(), rollValue: 0.99 });
  const input = { request_id: 'phase2-revision35-pickup',
    idempotency_key: 'phase2-revision35-pickup',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.' };
  const result = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.deepEqual(result.clue.inventory_effect, {
    mass_delta_grams: 10, hands_used_delta: 1
  });
  assert.deepEqual(result.clue.pickup_transition.inventory_after, {
    total_mass_grams: 2060, hands_used: 1, hands_free: 1,
    load_category: 'light'
  });
  const replay = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.deepEqual(replay.clue.pickup_transition.inventory_after,
    result.clue.pickup_transition.inventory_after);
});
