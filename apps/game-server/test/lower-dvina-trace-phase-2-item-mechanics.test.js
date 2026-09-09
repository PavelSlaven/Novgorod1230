import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePhase2Items } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit-items.js';
import { loadLowerDvinaTracePhase2Bundle } from
  '../src/internal/lower-dvina-trace-phase-2-bundle.js';
import { resolveTracePhase2Contracts } from
  '../src/runtime/lower-dvina-trace-phase-2-contracts.js';
import { materializeBlueWoolPickup } from
  '../src/runtime/lower-dvina-trace-phase-2-pickup.js';
import { bundle9, fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('revision 32 pickup persists completed authored item mechanics', async () => {
  const revision32 = structuredClone(bundle9);
  revision32.definition_revision = 32;
  revision32.a1_authored_item_mechanics_profile = { profiles: [{
    profile_ref: 'trace_ld_v1_inventory_profile_blue_wool_fragment',
    packing_slot_cost: 1, quantity: null, container: null
  }] };
  const f = fixture({ scenarioBundle: revision32,
    materializationBundle: bundle9 });
  const contracts = resolveTracePhase2Contracts({ state: f.state,
    bundle: revision32, phase2Bundle: await loadLowerDvinaTracePhase2Bundle({
      scenarioDefinitionRevision: 9
    }) });
  const clue = materializeBlueWoolPickup({ retrievedState: f.state, contracts,
    consequenceRef: contracts.check.outcome_refs.success });
  const profile = mergePhase2Items(f.state.items, clue).find((item) =>
    item.template_id === clue.template_id
  ).state.inventory_profile_snapshot;
  assert.equal(profile.packing_slot_cost, 1);
  assert.equal(profile.packing_bundle_size, 1);
  assert.equal(profile.quantity, null);
  assert.equal(profile.container, null);
});
