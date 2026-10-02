import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { projectCalendar, resolveGameTimestampFromCalendarDate } from '@rus/time-events-history/calendar';
import { targetCanonicalStartFixture } from '../../../test/spatial-v3/target-canonical-start-fixture.js';
import { createTargetGeneratedFirstEntry } from '../src/infrastructure/postgres/target-generated-first-entry.js';
import { loadTracePhase2TemporalSourceProof } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { npcRoutineCandidate, npcRoutineTemporalRegistration } from '../src/runtime/npc-routine-temporal.js';

const fixture = await targetCanonicalStartFixture();
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifestPath = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
const manifest = await json(manifestPath);
const load = (table) => json(resolve(dirname(manifestPath), manifest.datasets.find((row) => row.table === table).file));
const canonical = fixture.canonical_npc_closure;
const g4 = { ...canonical.g4_ref, world_revision_id: fixture.world_revision_id };
const compositions = await load('spatial_v3_g4_npc_composition_bindings');
const placementPolicy = compositions.find((row) => row.g4_id === g4.id).payload.placement_policy;
const runtimeProfiles = await load('spatial_v3_npc_runtime_profiles');
const regionalProfiles = await load('spatial_v3_npc_regional_context_profiles');
const itemPin = fixture.domain_catalog_pin;
const actorProfile = fixture.actor_base_attributes_runtime_profile;
const actorPin = { ...itemPin, ...Object.fromEntries(['catalog_scope', 'catalog_revision_id', 'catalog_digest',
  'activation_event_id', 'import_id', 'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest']
  .map((key) => [key, actorProfile[key]])) };
const start = fixture.scenario_bundle.canonical_start.start.initial_environment_inputs;
const temporal = fixture.approved_actor_temporal_bundle.temporal_records;
const environment = deriveApprovedInitialEnvironment({
  calendar_record: temporal.find((row) => row.record_id === start.calendar_record_ref.id),
  weather_record: temporal.find((row) => row.record_id === start.weather_record_ref.id),
  calendar_date: start.calendar_date, local_minute_of_day: start.local_minute_of_day,
  random: createRandomSource({ seed: 31 }) });
const candidates = runtimeProfiles.filter((row) => row.profile_kind === 'npc_binding')
  .map(({ id, version, role_ref, occupation_ref }) => ({ id, version, role_ref, occupation_ref }));
const group = { group_id: 'pf_outbuildings.household_servant', min_count: 1, max_count: 1, count_weights: [1],
  weighted_subjects: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_household_servant',
    profile_ref: 'm2c_npc_household_servant_v1', weight: 1 }] };

function seasonalRoutine(locationRef) {
  return { schema: 'npc_routine_profile_v1', profile_id: `parity-${locationRef}`, revision: 1,
    status: 'approved', phases: ['day', 'night'].map((state_id) => ({ state_id, duration_minutes: 720,
      activity_ref: state_id, summary: 'Работает.', activity_status: 'active', runtime_status: 'available',
      can_continue_automatically: true, decision_required: false, presence_state: 'on_site',
      location_ref: locationRef })) };
}

function setup({ ordinal, season, routineLocation }) {
  const partyId = `npc-routine-adapter-parity-${ordinal}`;
  const g4Ref = g4;
  const canonicalG5 = { ...canonical.canonical_g5_ref, world_revision_id: fixture.world_revision_id };
  const prepared = materializeSpatialV3GeneratedScene({ party_id: partyId, site_id: 'site', baseline_id: 'base',
    change_set_id: `change-${ordinal}`, materializer_version: 'm2c', materialization_trace_id: `trace:${ordinal}`,
    canonical_g5: { ...canonical.canonical_g5_ref, world_revision_id: fixture.world_revision_id },
    scene_closure: fixture.world_base_reference_snapshot.scene_template_closures[0],
    acoustic_rows: fixture.canonical_acoustic_rows });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
  const sceneRows = prepared.proposal.rows;
  const siteRow = { target_table: 'party_g5_sites', id: 'site', record: { id: 'site', party_id: partyId,
    origin: 'canonical', parent_g4_id: g4Ref.id, canonical_g5_ref: { entity_id: canonicalG5.id,
      authoring_version: String(canonicalG5.version) }, status: 'active' } };
  const scheduleRules = ['spring', 'summer', 'autumn', 'winter'].map((ruleSeason) => ({
    schedule_id: `servant-${ruleSeason}`, schedule_version: 1, world_revision_id: fixture.world_revision_id,
    scope_kind: 'place_family', scope_ref: 'pf_outbuildings', subject_kind: 'occupation',
    subject_ref: 'nov_occ_household_servant', season: ruleSeason, months: null, day_type: 'normal', status: 'approved',
    routine_profile: seasonalRoutine(ruleSeason === season ? routineLocation : 'pf_outbuildings') }));
  const startTimestamp = (() => {
    for (let month = 1; month <= 12; month += 1) {
      const timestamp = resolveGameTimestampFromCalendarDate({ calendar_system: fixture.calendar_profile.calendar_system,
        year: '1230', month: String(month), day: '15', local_minute_of_day: '500',
        subminute_numerator: '0', subminute_denominator: '1' }, fixture.calendar_profile);
      if (projectCalendar(timestamp, fixture.calendar_profile).season_id === season) return timestamp;
    }
    throw new Error(`test calendar does not cover ${season}`);
  })();
  const context = { transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: partyId, g4: g4Ref }, change_set_id: `change-${ordinal}`,
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: g4Ref.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(g4Ref.version) } }],
    canonical_digest: canonicalDigest('parity-fixture-pins') },
    proposal: { target_site_id: 'site', inserts: [siteRow, ...sceneRows] } };
  const regionalFor = regionalProfiles.map((row) => ({ ...row, payload: { ...row.payload,
    applicability: [...row.payload.applicability, { g4_ref: { id: g4.id, version: g4.version,
      world_revision_id: g4.world_revision_id } }] } }));
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin,
      runtime_profile: actorProfile }, approvedActorTemporalBundle: fixture.approved_actor_temporal_bundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async () => { throw new Error('canonical first-entry only'); },
      readPlacePeopleCandidates: async () => ({ ok: true, candidates, placement_policy: placementPolicy }),
      readPlacePeopleClosure: async ({ canonical_g5 }) => ({ ok: true, closure: {
        schema: 'rus.place_people_binding_bundle.v1', world_revision_id: fixture.world_revision_id,
        g4_ref: g4, canonical_g5_ref: canonical_g5, placement_policy: placementPolicy,
        runtime_profiles: runtimeProfiles, regional_context_profiles: regionalFor } }) },
    resolvePresenceRulesFirstArrival: async () => ({
      partyId, scopeInstanceRef: 'g6:scene', rules: [], parentById: new Map(), periodNumber: 4920,
      people: { compositions: [{ place_family_id: 'pf_outbuildings', composition_ref: {
        id: 'pf_outbuildings', version: 1, world_revision_id: g4.world_revision_id }, population_groups: [group],
        scheduled_absences: [] }], schedule_routine_rules_by_place_family: [{ place_family_id: 'pf_outbuildings',
        rules: scheduleRules }] } }),
    finiteFirstEntryProfile: { technical_limits: { max_resolution_records: 8 } },
    prepareNaturalFirstEntry: async () => ({ ok: true, approved_write_sets: [], recheck: async () => ({ ok: true }) }),
    readFactualContext: async () => ({ ok: true, party_id: partyId, world_revision_id: fixture.world_revision_id,
      environment, calendar_profile: fixture.calendar_profile, started_at: startTimestamp,
      recheck: async () => ({ ok: true }) }) };
  return { options, context, partyId };
}

function writes(result) { return result.approved_write_sets.flatMap((set) => set.inserts); }
function placementSnapshot(value) {
  return value == null ? null : {
    entity_kind: value.entity_kind,
    entity_id: value.entity_id,
    position_node_id: value.position_node_id,
    state_version: Number(value.state_version),
    updated_change_set_id: value.updated_change_set_id
  };
}
function temporalPool({ schedule, npc, placement, initialLocationProof }) {
  return { async query(sql) {
    if (sql.includes('party_temporal_events e')) return { rows: [] };
    if (sql.includes('party_npc_spatial_schedules s')) return { rows: [{ ...schedule,
      npc_snapshot: { instance_id: npc.npc_id, anchor_id: npc.anchor_id, machine_state: npc.machine_state },
      npc_semantic_state: npc.semantic_state,
      npc_placement: placement,
      initial_location_proof: initialLocationProof }] };
    if (sql.includes('party_local_world_processes p')) return { rows: [] };
    if (sql.includes('party_world_route_endpoint_position_bindings b')) return { rows: [] };
    if (sql.includes('DISTINCT ON (tr.npc_id)')) return { rows: [] };
    throw new Error('unexpected temporal query');
  } };
}

async function runPair({ ordinal, season, routineLocation }) {
  const input = setup({ ordinal, season, routineLocation });
  const first = await createTargetGeneratedFirstEntry(input.options)(input.context);
  assert.equal(first.ok, true, JSON.stringify(first.error));
  const rows = writes(first);
  const npcRow = rows.find((row) => row.target_table === 'party_npcs');
  const schedule = rows.find((row) => row.target_table === 'party_npc_spatial_schedules').record;
  const placement = rows.find((row) => row.target_table === 'entity_placements'
    && row.record.entity_kind === 'npc')?.record ?? null;
  const positionId = schedule.current_position_node_id;
  assert.equal(Boolean(placement), positionId != null, JSON.stringify({ positionId, placement }));
  const site = input.context.proposal.inserts.find((row) => row.target_table === 'party_g5_sites').record;
  const actorProfileBinding = rows.find((row) => row.target_table === 'party_actor_profile_bindings').record;
  const sceneRows = input.context.proposal.inserts;
  const positionRecord = sceneRows.find((row) => row.target_table === 'scene_position_nodes'
    && row.id === positionId)?.record ?? null;
  const g6 = sceneRows.find((row) => row.target_table === 'party_g6_instances'
    && row.id === positionRecord?.g6_instance_id)?.record ?? null;
  const baseline = sceneRows.find((row) => row.target_table === 'party_scene_baselines'
    && row.id === g6?.scene_baseline_id)?.record ?? null;
  const initialLocationProof = {
    party_world_revision_id: fixture.world_revision_id,
    schedule_position_node_id: positionId,
    position_node_id: positionRecord ? positionId : null,
    position_template_slot_key: positionRecord?.template_slot_key ?? null,
    position_template_instance_ordinal: positionRecord?.template_instance_ordinal ?? null,
    position_status: positionRecord?.status ?? null,
    g6_id: g6?.id ?? null, g6_status: g6?.status ?? null,
    g6_host_kind: g6?.host_kind ?? null, g6_host_id: g6?.host_id ?? null,
    g6_scene_baseline_id: g6?.scene_baseline_id ?? null,
    g6_source_scene_template_ref: g6?.source_scene_template_ref ?? null,
    scene_baseline_id: baseline?.id ?? null, scene_baseline_status: baseline?.status ?? null,
    scene_baseline_source_kind: baseline?.source_kind ?? null,
    scene_baseline_scene_template_ref: baseline?.scene_template_ref ?? null,
    site_id: site.id, site_status: site.status ?? 'active', site_origin: site.origin,
    site_canonical_g5_ref: site.canonical_g5_ref, site_parent_g4_id: site.parent_g4_id,
    site_generated_template_ref: site.generated_template_ref ?? null,
    placement_position_node_id: placement?.position_node_id ?? null,
    placement_state_version: placement?.state_version ?? null,
    placement_updated_change_set_id: placement?.updated_change_set_id ?? null,
    actor_profile_state_version: actorProfileBinding.state_version,
    actor_profile_created_change_set_id: actorProfileBinding.created_change_set_id,
    actor_profile_updated_change_set_id: actorProfileBinding.updated_change_set_id
  };
  const pool = temporalPool({ schedule, npc: npcRow.record, placement, initialLocationProof });
  const proof = await loadTracePhase2TemporalSourceProof(pool, input.partyId);
  const row = proof.npc_schedule_runtime[0];
  const candidate = npcRoutineCandidate(row);
  const result = npcRoutineTemporalRegistration().resolve(candidate, {
    projection: { npcs: [{ instance_id: npcRow.record.npc_id, machine_state: npcRow.record.machine_state }],
      npc_schedule_runtime: [row] }, request: { idempotency_context: { change_set_id: `temporal-${ordinal}` } } });
  const transition = result.proposals[0].npc_routine_transition;
  const location = result.proposals[0].write_set.appends[0].record.trace.location;
  const placementWrites = result.proposals[0].write_set;
  const physicalPlacementWrites = {
    updates: placementWrites.updates.filter((write) => write.target_table === 'entity_placements'),
    deletes: placementWrites.deletes.filter((write) => write.target_table === 'entity_placements')
  };
  const firstPresence = schedule.causal_state_ref.routine_state;
  const firstGap = first.materialization_trace.people.gaps.find((gap) =>
    gap.subject_ref === 'nov_occ_household_servant');
  return {
    first: { presence: firstPresence.presence_state,
      location: firstPresence.presence_state === 'on_site' ? npcRow.record.semantic_state.location_profile_ref
        : firstGap?.location_ref ?? null,
      reason: firstPresence.schedule_gap_reason ?? firstGap?.code ?? null,
      position: schedule.current_position_node_id ?? null,
      placement: placementSnapshot(placement) },
    temporal: { presence: location.presence_state, location: location.location_ref,
      reason: location.gap_reason ?? null, position: transition.after.current_position_node_id ?? null,
      placement: placementSnapshot(transition.after.npc_placement) },
    readbackPlacement: placementSnapshot(row.npc_placement),
    physicalPlacementWrites,
    proof
  };
}

test('first-entry and temporal adapters preserve same initial binding and same typed location gap through readback', async () => {
  const valid = await runPair({ ordinal: 81, season: 'summer', routineLocation: 'pf_outbuildings' });
  assert.equal(valid.first.presence, 'on_site');
  assert.equal(valid.first.location, 'pf_outbuildings');
  assert.equal(valid.first.reason, null);
  assert.ok(valid.first.position);
  assert.ok(valid.proof.npc_schedule_runtime[0].approved_location_bindings.length > 0,
    'readback derives proof from raw persisted source, scene, placement, and actor binding rows');
  assert.deepEqual(valid.readbackPlacement, valid.first.placement);
  assert.deepEqual(valid.temporal, valid.first);
  assert.deepEqual(valid.physicalPlacementWrites, { updates: [], deletes: [] },
    'unchanged placement has no temporal update or delete');

  const gap = await runPair({ ordinal: 82, season: 'winter', routineLocation: 'pf_winter_ice_crossing' });
  assert.equal(gap.first.presence, 'location_gap');
  assert.equal(gap.first.location, null);
  assert.equal(gap.first.reason, 'npc_location_gap');
  assert.equal(gap.first.position, null);
  assert.equal(gap.first.placement, null);
  assert.equal(gap.temporal.presence, 'location_gap');
  assert.equal(gap.readbackPlacement, null);
  assert.deepEqual(gap.temporal, gap.first);
  assert.deepEqual(gap.physicalPlacementWrites, { updates: [], deletes: [] });
});
