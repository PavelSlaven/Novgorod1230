import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';

// People of a canonical place on first arrival (D49) against the real m2c NPC datasets, without a database.
const fixture = await targetCanonicalStartFixture();
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const path = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
const manifest = await json(path);
const load = (table) => json(resolve(dirname(path), manifest.datasets.find((row) => row.table === table).file));
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
const servantGroup = { group_id: 'pf_outbuildings.household_servant', min_count: 1, max_count: 1, count_weights: [1],
  weighted_subjects: [{ subject_kind: 'occupation', subject_ref: 'nov_occ_household_servant',
    profile_ref: 'm2c_npc_household_servant_v1', weight: 1 }] };
/** The regional contexts of the imported data, plus (when asked) the G4-wide applicability the people data will add. */
const regionalFor = (g4Wide) => regionalProfiles.map((row) => ({ ...row, payload: { ...row.payload,
  applicability: g4Wide ? [...row.payload.applicability, { g4_ref: { id: g4.id, version: g4.version, world_revision_id: g4.world_revision_id } }]
    : row.payload.applicability } }));

const fisherRule = { rule_id: 'pr_fisher', rule_version: 1, status: 'approved', scope_kind: 'place_family', scope_ref: 'pf_riverbank',
  region_id: null, subject_kind: 'occupation', subject_ref: 'nov_occ_fisher', presence_probability_ppm: 1_000_000, count_limit: 1,
  allowed_seasons: ['all'], refresh_class: 'none', entry_exposed_weight: 1, search_concealed_weight: 0 };

function setup({ ordinal = 0, g4Wide = true, groups = [servantGroup], rules = [], physicalClass = null, readCandidates = null,
  readClosure = null } = {}) {
  const partyId = `canonical-people-${ordinal}`;
  const prepared = materializeSpatialV3GeneratedScene({ party_id: partyId, site_id: 'site', baseline_id: 'base',
    change_set_id: 'change', materializer_version: 'm2c', materialization_trace_id: 'trace:change',
    canonical_g5: { ...canonical.canonical_g5_ref, world_revision_id: fixture.world_revision_id },
    scene_closure: fixture.world_base_reference_snapshot.scene_template_closures[0], acoustic_rows: fixture.canonical_acoustic_rows });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
  const rows = prepared.proposal.rows.map((row) => (physicalClass && row.target_table === 'party_g6_instances'
    ? { ...row, record: { ...row.record, physical_class_id: physicalClass } } : row));
  const calls = [];
  const context = { transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: partyId, g4 }, change_set_id: 'change',
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: g4.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(g4.version) } }],
    canonical_digest: canonicalDigest('fixture-pins') },
    proposal: { target_site_id: 'site', inserts: [
      { target_table: 'party_g5_sites', id: 'site', record: { id: 'site', party_id: partyId, origin: 'canonical',
        parent_g4_id: g4.id, canonical_g5_ref: { entity_id: canonical.canonical_g5_ref.id,
          authoring_version: String(canonical.canonical_g5_ref.version) } } }, ...rows] } };
  const presence = { partyId, scopeInstanceRef: 'g5:site', rules, parentById: new Map(), periodNumber: 4920,
    requestIdentityPrefix: 'presence-first-arrival:site',
    people: { compositions: groups.length ? [{ composition_ref: { id: 'pf_outbuildings', version: 1, world_revision_id: g4.world_revision_id },
      population_groups: groups }] : [] } };
  const asked = [];
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin, runtime_profile: actorProfile },
    approvedActorTemporalBundle: fixture.approved_actor_temporal_bundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async () => { throw new Error('canonical people use the place-people reader'); },
      readPlacePeopleCandidates: readCandidates ?? (async (input) => {
        assert.deepEqual(input.g4, g4);
        asked.push(input.subjects.map((subject) => subject.subject_ref));
        return { ok: true, candidates, placement_policy: placementPolicy };
      }),
      readPlacePeopleClosure: readClosure ?? (async (input) => {
        asked.push(input.profile_refs.map((ref) => ref.id));
        return { ok: true, closure: { schema: 'rus.place_people_binding_bundle.v1', world_revision_id: fixture.world_revision_id,
          g4_ref: g4, canonical_g5_ref: { id: canonical.canonical_g5_ref.id, version: canonical.canonical_g5_ref.version },
          placement_policy: placementPolicy, runtime_profiles: runtimeProfiles, regional_context_profiles: regionalFor(g4Wide) } };
      }) },
    resolvePresenceRulesFirstArrival: async (input) => { calls.push(['resolver', input.withPlacePeople]); return presence; },
    finiteFirstEntryProfile: { technical_limits: { max_resolution_records: 8 } },
    prepareNaturalFirstEntry: async () => { throw new Error('canonical path only'); },
    readFactualContext: async () => ({ ok: true, party_id: partyId, world_revision_id: fixture.world_revision_id, environment,
      calendar_profile: fixture.calendar_profile, started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      recheck: async () => { calls.push('factual-recheck'); return { ok: true }; } }) };
  return { options, context, calls, asked };
}
const npcRows = (result) => result.approved_write_sets.flatMap((set) => set.inserts).filter((row) => row.target_table === 'party_npcs');

test('a canonical place with an approved composition group gets its people at focus/departure, deterministically', async () => {
  const { options, context, calls, asked } = setup();
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const [servant] = npcRows(result);
  assert.equal(npcRows(result).length, 1);
  assert.equal(servant.record.profile_set_id, 'm2c_npc_household_servant_v1');
  const source = servant.record.semantic_state.source_binding;
  assert.deepEqual(source.place_population_composition_ref, { id: 'pf_outbuildings', version: 1, world_revision_id: g4.world_revision_id });
  assert.equal(source.group_id, 'pf_outbuildings.household_servant');
  assert.equal(source.npc_composition_ref, undefined, 'no invented G4 composition ref');
  assert.equal(source.npc_binding_ref.version >= 1, true, 'the exact profile version is stored');
  const placement = result.approved_write_sets.flatMap((set) => set.inserts)
    .find((row) => row.target_table === 'entity_placements' && row.record.entity_kind === 'npc');
  assert.ok(['focus', 'departure'].includes(context.proposal.inserts.find((row) => row.id === placement.record.position_node_id)
    .record.template_slot_key), 'never the reserved arrival position');
  assert.equal(result.materialization_trace.validation_report.created_count, 1);
  assert.equal(result.materialization_trace.people.gaps.length, 0);
  assert.deepEqual(asked, [['nov_occ_household_servant'], ['m2c_npc_household_servant_v1']], 'the closure is read for the chosen profile only');
  assert.deepEqual(calls[0], ['resolver', true], 'the canonical branch asks the resolver for people');
  assert.deepEqual(await result.recheck({ transaction: context.transaction }), { ok: true });
  const again = await createTargetGeneratedFirstEntry(setup().options)(setup().context);
  assert.equal(canonicalDigest(again.materialization_trace), canonicalDigest(result.materialization_trace));
});

test('an occupation rule outcome is stored in the presence aggregate and read back as a person; the people never roll it', async () => {
  const { options, context } = setup({ groups: [], rules: [fisherRule] });
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const aggregate = result.approved_write_sets[0].inserts[0].record.aggregate_payload;
  assert.deepEqual(aggregate.presence_resolutions.map((record) => [record.subject_kind, record.subject_ref, record.count, record.rule_ref]),
    [['occupation', 'nov_occ_fisher', 1, 'pr_fisher@1']]);
  const [fisher] = npcRows(result);
  assert.equal(fisher.record.semantic_state.source_binding.presence_rule_ref.rule_id, 'pr_fisher');
  assert.equal(fisher.record.semantic_state.source_binding.place_population_composition_ref, undefined);
  assert.deepEqual(result.materialization_trace.people.rules, [{ rule_ref: 'pr_fisher@1', count: 1 }]);
  const absent = setup({ groups: [], rules: [{ ...fisherRule, presence_probability_ppm: 0 }] });
  const none = await createTargetGeneratedFirstEntry(absent.options)(absent.context);
  assert.equal(npcRows(none).length, 0);
  assert.equal(none.approved_write_sets[0].inserts[0].record.aggregate_payload.presence_resolutions[0].count, 0,
    'an absent outcome is stored too, so the period is not rolled again');
  assert.deepEqual(absent.asked, [], 'nobody wanted: no data is read');
});

test('plain data gaps create nobody, are recorded and still let the player arrive', async () => {
  const noRegional = setup({ g4Wide: false });
  const noRegionalResult = await createTargetGeneratedFirstEntry(noRegional.options)(noRegional.context);
  assert.equal(noRegionalResult.ok, true);
  assert.equal(npcRows(noRegionalResult).length, 0);
  assert.deepEqual(noRegionalResult.materialization_trace.people.gaps.map((gap) => [gap.code, gap.reason]),
    [['people_compile_failed', 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP']]);
  const ferry = setup({ groups: [{ ...servantGroup, group_id: 'pf_ferry_landing.ferryman', weighted_subjects: [
    { subject_kind: 'occupation', subject_ref: 'nov_occ_ferryman', profile_ref: null, weight: 1 }] }] });
  const ferryResult = await createTargetGeneratedFirstEntry(ferry.options)(ferry.context);
  assert.equal(npcRows(ferryResult).length, 0);
  assert.deepEqual(ferryResult.materialization_trace.people.gaps.map((gap) => gap.code), ['people_profile_missing']);
  const water = setup({ physicalClass: 'spatial.g6.water' });
  const waterResult = await createTargetGeneratedFirstEntry(water.options)(water.context);
  assert.equal(npcRows(waterResult).length, 0);
  assert.deepEqual(waterResult.materialization_trace.people.gaps.map((gap) => gap.code), ['people_position_capacity']);
  const noPolicy = setup({ readCandidates: async () => ({ ok: false, soft: true, reason: 'g4_placement_policy_missing' }) });
  const noPolicyResult = await createTargetGeneratedFirstEntry(noPolicy.options)(noPolicy.context);
  assert.deepEqual(noPolicyResult.materialization_trace.people.gaps,
    [{ code: 'people_data_unavailable', reason: 'g4_placement_policy_missing' }]);
});

test('anything that is not a plain data gap fails the arrival: ambiguous policy, broken closure, wiring errors', async () => {
  const ambiguous = setup({ readCandidates: async () => ({ ok: false, soft: false, reason: 'g4_placement_policy_ambiguous' }) });
  await assert.rejects(() => createTargetGeneratedFirstEntry(ambiguous.options)(ambiguous.context),
    (error) => error.code === 'PLACE_PEOPLE_READ_INVALID' && error.details.reason === 'g4_placement_policy_ambiguous');
  const broken = setup({ readClosure: async () => ({ ok: false, soft: false, reason: 'approved_npc_runtime_profile_closure_invalid' }) });
  await assert.rejects(() => createTargetGeneratedFirstEntry(broken.options)(broken.context),
    (error) => error.code === 'PLACE_PEOPLE_READ_INVALID');
  // a closure that lacks a row the chosen profile references is an invariant failure, not a gap
  const missingRow = setup({ readClosure: async () => ({ ok: true, closure: { schema: 'rus.place_people_binding_bundle.v1',
    world_revision_id: fixture.world_revision_id, g4_ref: g4, canonical_g5_ref: { id: canonical.canonical_g5_ref.id,
      version: canonical.canonical_g5_ref.version }, placement_policy: placementPolicy,
    runtime_profiles: runtimeProfiles.filter((row) => row.profile_kind === 'npc_binding'),
    regional_context_profiles: regionalFor(true) } }) });
  await assert.rejects(() => createTargetGeneratedFirstEntry(missingRow.options)(missingRow.context),
    (error) => error.code === 'NPC_COMPOSITION_EXACT_REF_GAP');
});

test('without people information in the resolver context the canonical arrival is unchanged', async () => {
  const { options, context } = setup();
  options.resolvePresenceRulesFirstArrival = async () => ({ partyId: 'p', scopeInstanceRef: 'g5:site', rules: [] });
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.deepEqual(result.approved_write_sets, []);
  assert.equal(result.materialization_trace.people, undefined);
});
