import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTracePhase6Content, validateLowerDvinaTracePhase6Content } from '../../tools/world-catalog-workflow/src/lower-dvina-trace-phase-6-check.mjs';

const bundle = await loadLowerDvinaTracePhase6Content();
test('Phase 6 exact-supersedes revision 11 with replay-safe historical pins', () => {
  assert.deepEqual(validateLowerDvinaTracePhase6Content(bundle), { pass: true, scenario_definition_revision: 12, phase_1a_revision: 8, phase_1b_revision: 7 });
  assert.equal(bundle.definition.supersedes_definition_ref.revision, 11);
  assert.equal(bundle.publication.scenario_definition_ref.revision, 12);
});
function mutation(label, mutate, code) { test(`Phase 6 rejects ${label}`, () => { const changed = structuredClone(bundle); mutate(changed); assert.throws(() => validateLowerDvinaTracePhase6Content(changed), { code }); }); }
mutation('a ranged body carry effect', (b) => { b.body.effect_profiles.find((x) => x.effect_profile_id === 'trace_ld_v1_body_carry_carrier_20m').delta_bounds = { health: [0, 0] }; }, 'TRACE_PHASE_6_BODY_INVALID');
mutation('a non-exact 8m shivering transition', (b) => { b.body.effect_profiles.find((x) => x.effect_profile_id === 'trace_ld_v1_body_open_route_8m').condition_outcomes[1].to = 'mild_shivering'; }, 'TRACE_PHASE_6_BODY_INVALID');
mutation('a replacement before the committed half-route boundary', (b) => { b.movement.route_bindings[0].carried_actor_rules.carrier_rebinding.decision_boundary.elapsed_minutes = 9; }, 'TRACE_PHASE_6_CARRY_INVALID');
mutation('a replacement that is not the committed participating fisher', (b) => { b.movement.route_bindings[0].carried_actor_rules.carrier_rebinding.replacement_selection_policy = 'choose_any_fisher'; }, 'TRACE_PHASE_6_CARRY_INVALID');
mutation('an assembly that creates a property transition', (b) => { b.movement.route_bindings[0].assembly_snapshot_policy.property_transition_refs = ['invented']; }, 'TRACE_PHASE_6_CARRY_INVALID');
mutation('a carrier activity without one free external hand', (b) => { b.activity.activity_profiles[0].required_free_external_hands = 0; }, 'TRACE_PHASE_6_ACTIVITY_INVALID');
mutation('a carry binding without one free external hand', (b) => { b.movement.route_bindings[0].required_free_external_hands = 0; }, 'TRACE_PHASE_6_CARRY_INVALID');
mutation('a water vessel outside compact_zero_hand', (b) => { b.items.item_inventory_profiles[0].inventory_archetype_ref = 'long_bundle'; }, 'TRACE_PHASE_6_INVENTORY_INVALID');
mutation('a non-exact Ratsha rope profile', (b) => { b.items.item_inventory_profiles[1].mass_grams = 1201; }, 'TRACE_PHASE_6_INVENTORY_INVALID');
mutation('a stale rope materialization profile ref', (b) => { b.phase1aBindings.binding_overrides.phase_4_initial_state_binding.onisim_injury_rope_binding.inventory_profile_ref = 'stale'; }, 'TRACE_PHASE_6_INVENTORY_INVALID');
mutation('a stale Phase 1A definition pin', (b) => { b.phase1a.base_definition_ref.digest = '0'.repeat(64); }, 'TRACE_PHASE_6_LINEAGE_INVALID');
