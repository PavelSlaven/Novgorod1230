import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase6Contracts } from
  '../src/runtime/lower-dvina-trace-phase-6-contracts.js';
import {
  fixture,
  loadScenarioBundle
} from './lower-dvina-trace-phase-2-fixture.js';

test('revision 15 preserves the complete Phase 6 profile chain', async () => {
  const bundle = await loadScenarioBundle(15);
  const state = fixture({ scenarioBundle: bundle }).state;
  const contracts = resolveTracePhase6Contracts({ bundle });

  assert.equal(bundle.activity_check_consequence_profiles.revision, 4);
  assert.equal(bundle.body_environment_profiles.revision, 6);
  assert.equal(contracts.route.route_id,
    'trace_ld_v1_route_shed_to_camp_carry_onisim');
  assert.equal(state.items.some(({ template_id: id }) =>
    id === 'trace_ld_v1_item_bandage_cloth'), true);
  const onisim = state.npcs.find(({ participant_slot_ref: ref }) =>
    ref === 'onisim_boatman');
  assert.equal(onisim.machine_state.binding_item.profile_id,
    'trace_ld_v1_inventory_profile_ratsha_binding_rope');
});
