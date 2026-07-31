import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveInventoryProfile } from '@rus/items-property';
import { loadCommonCatalogLookupRecords } from '@rus/runtime-catalog/common-lookups';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const PATHS = Object.freeze({
  manifest: `${ROOT}/phase-6-content/manifest.json`,
  definition: `${ROOT}/phase-6-content/definition.json`,
  activity: `${ROOT}/phase-6-content/activity-check-consequence-profiles.json`,
  body: `${ROOT}/phase-6-content/body-environment-profiles.json`,
  movement: `${ROOT}/phase-6-content/movement-bindings.json`,
  items: `${ROOT}/phase-6-content/item-container-set-overlay.json`,
  previousItems: `${ROOT}/phase-5-content/item-container-set.json`,
  previousDefinition: `${ROOT}/phase-5-content/definition.json`,
  phase1a: `${ROOT}/phase-1a-v8/manifest.json`,
  phase1aBindings: `${ROOT}/phase-1a-v8/materialization-bindings.json`,
  phase1b: `${ROOT}/phase-1b-v7/manifest.json`,
  publication: `${ROOT}/phase-1b-v7/publication-binding.json`
});

export async function loadLowerDvinaTracePhase6Content({ rootDir = process.cwd() } = {}) {
  const [entries, lookupRecords] = await Promise.all([
    Promise.all(Object.entries(PATHS).map(async ([key, path]) => {
    const raw = await readFile(resolve(rootDir, path));
    return [key, JSON.parse(raw), sha256(raw)];
    })),
    loadCommonCatalogLookupRecords({ rootDir })
  ]);
  return Object.fromEntries(entries.map(([key, value, digest]) => [key, value]).concat([
    ['paths', structuredClone(PATHS)],
    ['raw_digests', Object.fromEntries(entries.map(([key, , digest]) => [key, digest]))],
    ['inventoryArchetypes', lookupRecords.inventory_archetypes]
  ]));
}

export function validateLowerDvinaTracePhase6Content(b) {
  lineage(b); exactInventory(b); exactActivity(b); exactBody(b); exactCarry(b); scope(b);
  return Object.freeze({ pass: true, scenario_definition_revision: 12, phase_1a_revision: 8, phase_1b_revision: 7 });
}

function lineage(b) {
  const m = b.manifest;
  const files = {
    'activity-check-consequence-profiles.json': b.raw_digests.activity,
    'body-environment-profiles.json': b.raw_digests.body,
    'definition.json': b.raw_digests.definition,
    'item-container-set-overlay.json': b.raw_digests.items,
    'movement-bindings.json': b.raw_digests.movement
  };
  if (m?.schema !== 'rus.lower_dvina_trace_phase_6_content_manifest.v1'
    || m.package_id !== 'lower_dvina_trace_phase_6_content_v1' || m.revision !== 1
    || m.scenario_definition_revision !== 12 || m.status !== 'approved'
    || ['fallback_policy', 'normalization_policy', 'alias_policy'].some((key) => m[key] !== 'forbidden')
    || !ref(m.superseded_definition_ref, PATHS.previousDefinition, 'lower_dvina_trace_v1', 11, 'rus.trace_scenario_definition.v1', b.raw_digests.previousDefinition)
    || !ref(b.definition?.supersedes_definition_ref, PATHS.previousDefinition, 'lower_dvina_trace_v1', 11, undefined, b.raw_digests.previousDefinition)
    || b.definition?.revision !== 12 || b.definition?.required_unresolved_refs?.length !== 0
    || b.definition?.immutable_content_refs?.item_container_set?.revision !== 4
    || b.definition.immutable_content_refs.item_container_set.digest
      !== b.raw_digests.items
    || b.definition?.resolved_policy_refs?.body_environment_profiles?.revision !== 6
    || b.definition.resolved_policy_refs.body_environment_profiles.digest !== b.raw_digests.body
    || b.definition?.resolved_policy_refs?.movement_bindings?.revision !== 2
    || b.definition.resolved_policy_refs.movement_bindings.digest !== b.raw_digests.movement
    || b.definition?.resolved_policy_refs
      ?.activity_check_consequence_profiles?.revision !== 4
    || b.definition.resolved_policy_refs.activity_check_consequence_profiles
      .digest !== b.raw_digests.activity
    || !refsMatch(m.files, files) || m.content_digest !== digestFiles(files)
    || !ref(m.content_refs?.definition, 'definition.json', 'lower_dvina_trace_v1', 12, 'rus.trace_scenario_definition.v1', b.raw_digests.definition)
    || !ref(m.content_refs?.activity_check_consequence_profiles,
      'activity-check-consequence-profiles.json',
      'trace_ld_v1_activity_check_consequence_profiles', 4,
      'rus.trace_activity_check_consequence_profiles.v1',
      b.raw_digests.activity)
    || !ref(m.content_refs?.body_environment_profiles, 'body-environment-profiles.json', 'trace_ld_v1_body_environment_profiles', 6, 'rus.trace_body_environment_profiles.v2', b.raw_digests.body)
    || !ref(m.content_refs?.movement_bindings, 'movement-bindings.json', 'trace_ld_v1_movement_bindings', 2, 'rus.trace_movement_bindings.v1', b.raw_digests.movement)
    || !ref(m.content_refs?.item_container_set_overlay,
      'item-container-set-overlay.json', 'trace_ld_v1_item_container_set', 4,
      'rus.trace_item_container_set_overlay.v1', b.raw_digests.items)
    || b.phase1a?.revision !== 8 || b.phase1a.scenario_definition_revision !== 12
    || !packageRef(b.phase1a.base_definition_ref, PATHS.manifest, m.package_id, 1, m.schema, b.raw_digests.manifest)
    || !ref(b.phase1a.content_refs?.materialization_bindings, PATHS.phase1aBindings, 'lower_dvina_trace_phase_1a_materialization_bindings_v8', 8, 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', b.raw_digests.phase1aBindings)
    || b.phase1aBindings?.scenario_definition_revision !== 12 || b.phase1aBindings.binding_resolution_policy !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || b.phase1aBindings.reused_immutable_binding_ref?.digest !== b.phase1aBindings.superseded_binding_ref?.digest
    || b.phase1b?.revision !== 7 || !ref(b.phase1b.content_refs?.publication_binding, PATHS.publication, 'lower_dvina_trace_phase_1b_publication_v7', 7, 'rus.lower_dvina_trace_publication_binding.v1', b.raw_digests.publication)
    || !ref(b.publication?.phase_1a_manifest_ref, PATHS.phase1a, 'lower_dvina_trace_phase_1a_v8', 8, 'rus.lower_dvina_trace_phase_1a_manifest.v1', b.raw_digests.phase1a)
    || !ref(b.publication?.scenario_definition_ref, PATHS.definition, 'lower_dvina_trace_v1', 12, 'rus.trace_scenario_definition.v1', b.raw_digests.definition)
    || b.publication?.materializer_binding_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v8') fail('TRACE_PHASE_6_LINEAGE_INVALID');
}

function exactInventory(b) {
  const overlay = b.items;
  const water = one(overlay?.item_inventory_profiles, 'inventory_profile_id',
    'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel');
  const rope = one(overlay?.item_inventory_profiles, 'inventory_profile_id',
    'trace_ld_v1_inventory_profile_ratsha_binding_rope');
  const waterTemplate = one(overlay?.item_template_overrides,
    'item_template_id', 'trace_ld_v1_item_eremey_drinking_water_vessel');
  const ropeTemplate = one(overlay?.item_template_overrides,
    'item_template_id', 'trace_ld_v1_item_ratsha_binding_rope');
  let resolvedWater;
  try {
    resolvedWater = resolveInventoryProfile({
      profile: water,
      archetypes: b.inventoryArchetypes
    });
  } catch {
    fail('TRACE_PHASE_6_INVENTORY_INVALID');
  }
  const bindingOverrides = b.phase1aBindings?.binding_overrides;
  if (overlay?.schema !== 'rus.trace_item_container_set_overlay.v1'
    || overlay.revision !== 4
    || overlay.supersedes_ref?.digest !== b.raw_digests.previousItems
    || overlay.item_template_overrides?.length !== 2
    || overlay.item_inventory_profiles?.length !== 2
    || waterTemplate?.inventory_profile_ref !== water?.inventory_profile_id
    || ropeTemplate?.base_catalog_ref?.inventory_profile_id
      !== rope?.inventory_profile_id
    || resolvedWater?.mass_grams !== 100
    || resolvedWater.carry_form !== 'compact'
    || resolvedWater.external_hand_cost !== 0
    || resolvedWater.status !== 'approved'
    || rope?.item_template_ref !== 'trace_ld_v1_item_ratsha_binding_rope'
    || rope.mass_grams !== 1200 || rope.carry_form !== 'long'
    || rope.external_hand_cost !== 1 || rope.status !== 'approved'
    || bindingOverrides?.phase_4_initial_state_binding
      ?.onisim_injury_rope_binding?.inventory_profile_ref
      !== rope.inventory_profile_id
    || bindingOverrides?.phase_5_initial_state_binding
      ?.phase_5_resource_arrival_binding?.eremey_water_vessel_initial_binding
      ?.persistence_profile_ref !== water.inventory_profile_id) {
    fail('TRACE_PHASE_6_INVENTORY_INVALID');
  }
}

function exactActivity(b) {
  const profile = one(b.activity?.activity_profiles, 'profile_id',
    'trace_ld_v1_activity_make_stretcher_and_carry');
  const slots = profile?.participant_slots;
  if (b.activity?.revision !== 4
    || b.activity.supersedes_ref?.digest
      !== '9125cb1cee920c9ec8a5c92cad9a2ee5c0e874a867388c2fc4411aaebf8ca434'
    || b.activity.activity_profiles.length !== 1
    || profile.version !== 2
    || profile.duration_minutes !== 20
    || profile.required_free_external_hands !== 1
    || profile.no_check_required !== true
    || slots?.carried_actor !== 'onisim_boatman'
    || !same(slots.initial_carriers,
      ['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper'])
    || slots.replacement !== 'resolved_participating_fisher'
    || slots.replacement_source_slot
      !== 'trace_ld_v1_audience_slot_participating_fisher'
    || slots.minimum_bound_carriers !== 3
    || slots.new_selection_or_rng !== 'forbidden') {
    fail('TRACE_PHASE_6_ACTIVITY_INVALID');
  }
}

function exactBody(b) {
  const effects = b.body?.effect_profiles;
  const expected = [
    ['trace_ld_v1_body_open_route_8m', 8, 'player_clerk', { health: -1, satiety: -1, energy: -1 }],
    ['trace_ld_v1_body_open_route_12m', 12, 'player_clerk', { health: 0, satiety: -1, energy: -1 }],
    ['trace_ld_v1_body_carry_carrier_20m', 20, 'carrier', { health: 0, satiety: -1, energy: -4 }],
    ['trace_ld_v1_body_carry_carrier_10m', 10, 'carrier', { health: 0, satiety: -1, energy: -2 }],
    ['trace_ld_v1_body_carry_carried_actor_stabilized_20m', 20, 'carried_actor', { health: 0, satiety: 0, energy: 0 }],
    ['trace_ld_v1_body_carry_carried_actor_unstabilized_20m', 20, 'carried_actor', { health: 0, satiety: 0, energy: 0 }]
  ];
  if (b.body?.revision !== 6 || effects?.length !== expected.length || expected.some(([id, minutes, role, deltas]) => {
    const effect = one(effects, 'effect_profile_id', id);
    return !effect || effect.elapsed_minutes !== minutes || effect.subject_role !== role
      || JSON.stringify(effect.exact_deltas) !== JSON.stringify(deltas)
      || effect.selection_policy !== (role === 'carried_actor' ? 'fixed_by_exact_committed_branch' : 'fixed_approved_effect')
      || effect.rng_consumption !== 'forbidden' || Object.hasOwn(effect, 'delta_bounds');
  }) || !outcome(b, 'trace_ld_v1_body_open_route_8m', 'wet', 'wet', 'persists')
    || !outcome(b, 'trace_ld_v1_body_open_route_8m', 'mild_shivering', 'strong_shivering', 'worsens')
    || !outcome(b, 'trace_ld_v1_body_open_route_12m', 'wet', 'wet', 'persists')
    || !outcome(b, 'trace_ld_v1_body_open_route_12m', 'strong_shivering', 'strong_shivering', 'persists')
    || one(effects, 'effect_profile_id', 'trace_ld_v1_body_carry_carried_actor_stabilized_20m')?.precondition_committed_fact !== 'onisim_stabilized_unable_to_walk'
    || one(effects, 'effect_profile_id', 'trace_ld_v1_body_carry_carried_actor_unstabilized_20m')?.precondition_committed_fact !== 'onisim_first_aid_completed_without_stabilization') fail('TRACE_PHASE_6_BODY_INVALID');
}

function exactCarry(b) {
  const route = one(b.movement?.route_bindings, 'route_id', 'trace_ld_v1_route_shed_to_camp_carry_onisim');
  const rules = route?.carried_actor_rules;
  const rebind = rules?.carrier_rebinding;
  const snapshot = route?.assembly_snapshot_policy;
  const effects = route?.body_effect_bindings;
  const terminal = route?.terminal_placement_contract;
  if (b.movement?.revision !== 2 || route?.version !== 2 || route.duration_minutes !== 20
    || route.required_free_external_hands !== 1
    || !same(rules?.initial_carrier_binding, ['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper'])
    || rules.minimum_carrier_count !== 3 || rules.independent_movement !== 'forbidden'
    || !same(route.body_load_factors, ['carrier_load', 'onisim_injured'])
    || !same(rules.carrier_candidate_slots,
      ['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper',
        'resolved_participating_fisher'])
    || rebind?.decision_boundary?.boundary_id
      !== 'trace_ld_v1_boundary_mikula_carry_load_limit_10m'
    || rebind.decision_boundary.elapsed_minutes !== 10
    || rebind.decision_boundary.route_progress_ppm !== 500000
    || rebind.decision_boundary.kind
      !== 'committed_synchronized_route_boundary'
    || rebind.decision_boundary.reason_code
      !== 'shoulder_load_limit_reached'
    || rebind.decision_boundary.outgoing !== 'player_clerk'
    || rebind.decision_boundary.incoming !== 'resolved_participating_fisher'
    || rebind.decision_boundary.shoulder?.condition_profile_ref
      !== 'trace_ld_v1_condition_shoulder_bruise'
    || rebind.decision_boundary.shoulder.from !== 'shoulder_bruise'
    || rebind.decision_boundary.shoulder.to !== 'shoulder_bruise'
    || rebind.decision_boundary.shoulder.outcome !== 'load_penalty'
    || rebind.decision_boundary.rng_consumption !== 'forbidden'
    || rebind.replacement_slot !== 'trace_ld_v1_audience_slot_participating_fisher'
    || rebind.replacement_selection_policy !== 'use_exact_committed_participating_fisher_or_fail_closed'
    || !rebind.preserve_committed_elapsed || !rebind.preserve_committed_route_progress || rebind.rewind_or_reroll !== 'forbidden'
    || rebind.load_recalculation
      !== 'recalculate_outgoing_incoming_and_remaining_carrier_load_from_committed_boundary_state'
    || rebind.no_valid_replacement_failure !== 'typed_carry_rebinding_unavailable'
    || snapshot?.source !== 'phase_5_terminal_resource_snapshot'
    || !same(snapshot.required_item_template_refs, ['trace_ld_v1_item_fishing_net', 'trace_ld_v1_item_carry_poles'])
    || !same(snapshot.required_preserved_item_ids, ['trace_ld_v1_item_fishing_net', 'trace_ld_v1_item_carry_poles'])
    || !same(snapshot.property_transition_refs, []) || snapshot.new_item_or_property_change !== 'forbidden'
    || !same(route.body_effect_profile_refs, ['trace_ld_v1_body_carry_carrier_20m', 'trace_ld_v1_body_carry_carrier_10m', 'trace_ld_v1_body_carry_carried_actor_stabilized_20m', 'trace_ld_v1_body_carry_carried_actor_unstabilized_20m'])) fail('TRACE_PHASE_6_CARRY_INVALID');
  if (effects?.eremey_fisher !== 'trace_ld_v1_body_carry_carrier_20m'
    || effects.ratsha_storehouse_helper
      !== 'trace_ld_v1_body_carry_carrier_20m'
    || effects.player_clerk !== 'trace_ld_v1_body_carry_carrier_10m'
    || effects.resolved_participating_fisher
      !== 'trace_ld_v1_body_carry_carrier_10m'
    || effects.onisim_boatman?.onisim_stabilized_unable_to_walk
      !== 'trace_ld_v1_body_carry_carried_actor_stabilized_20m'
    || effects.onisim_boatman
      ?.onisim_first_aid_completed_without_stabilization
      !== 'trace_ld_v1_body_carry_carried_actor_unstabilized_20m'
    || terminal?.group?.anchor_template_ref
      !== 'trace_ld_v1_g5_anchor_fishing_camp_working_camp_v1'
    || terminal.group.zone_ref !== 'working_camp'
    || terminal.carried_actor?.participant_slot_ref !== 'onisim_boatman'
    || terminal.carried_actor.zone_ref !== 'fire_rest_area'
    || terminal.carried_actor.independent_movement_history !== 'forbidden'
    || terminal.ratsha_observation?.state
      !== 'surrendered_under_group_observation'
    || terminal.ratsha_observation.committed_fact_output
      !== 'ratsha_under_group_observation_committed') {
    fail('TRACE_PHASE_6_CARRY_INVALID');
  }
}

function scope(b) { if (!same(b.manifest?.scope, ['phase_6_exact_route_and_carry_content']) || !same(b.manifest?.excludes, ['runtime_handlers', 'persistence', 'ddl', 'api', 'ui'])) fail('TRACE_PHASE_6_SCOPE_INVALID'); }
function outcome(b, id, from, to, result) { return one(b.body?.effect_profiles, 'effect_profile_id', id)?.condition_outcomes?.some((x) => x.from === from && x.to === to && x.outcome === result); }
function one(values, key, expected) { const found = values?.filter((value) => value?.[key] === expected) ?? []; return found.length === 1 ? found[0] : null; }
function same(actual, expected) { return Array.isArray(actual) && actual.length === expected.length && actual.every((x) => expected.includes(x)) && new Set(actual).size === actual.length; }
function ref(actual, path, id, revision, schema, digest) { return actual?.path === path && actual.id === id && actual.revision === revision && (schema === undefined || actual.schema === schema) && actual.digest === digest; }
function packageRef(actual, path, id, revision, schema, digest) { return actual?.path === path && actual.package_id === id && actual.revision === revision && actual.schema === schema && actual.digest === digest; }
function refsMatch(actual, expected) { return JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify(Object.keys(expected).sort()) && Object.entries(expected).every(([key, value]) => actual[key] === value); }
function digestFiles(files) { return sha256(Buffer.from(`${Object.keys(files).sort().map((key) => `${key}:${files[key]}`).join('\n')}\n`, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function fail(code) { const error = new Error(`lower-dvina trace phase 6 [${code}]`); error.code = code; throw error; }
