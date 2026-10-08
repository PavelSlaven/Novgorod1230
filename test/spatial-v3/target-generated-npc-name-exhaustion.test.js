import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment,
  materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';

const fixture = await targetCanonicalStartFixture();
const approvedCatalog = await approvedNpcIdentityCatalog();
const femaleName = approvedCatalog.name_entries.find((row) => row.sex_category === 'female');
const oneNameCatalog = { ...approvedCatalog, name_entries: [femaleName] };
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifestPath = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
const manifest = await json(manifestPath);
const load = (table) => json(resolve(dirname(manifestPath), manifest.datasets.find((row) => row.table === table).file));
const compositions = await load('spatial_v3_g4_npc_composition_bindings');
const canonical = fixture.canonical_npc_closure;
const composition = compositions.find((row) => row.g4_id === canonical.g4_ref.id && row.generation_template_id);
const template = (await load('spatial_v3_g5_generation_templates'))
  .find((row) => row.id === composition.generation_template_id);
const closure = { ...canonical, canonical_g5_ref: undefined, composition,
  generation_template_ref: { id: composition.generation_template_id, version: composition.generation_template_version },
  runtime_profiles: await load('spatial_v3_npc_runtime_profiles'),
  regional_context_profiles: await load('spatial_v3_npc_regional_context_profiles') };
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

function generatedSetup(ordinal = 743) {
  const partyId = `target-generated-${ordinal}`;
  const g4 = { ...closure.g4_ref, world_revision_id: fixture.world_revision_id };
  const prepared = materializeSpatialV3GeneratedScene({ party_id: partyId, site_id: 'generated',
    baseline_id: 'base', change_set_id: 'change', materializer_version: 'm2c', materialization_trace_id: 'trace:change',
    canonical_g5: { ...canonical.canonical_g5_ref, world_revision_id: fixture.world_revision_id },
    scene_closure: fixture.world_base_reference_snapshot.scene_template_closures[0],
    acoustic_rows: fixture.canonical_acoustic_rows });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
  const naturalSet = { inserts: [], updates: [], appends: [] };
  const calls = [];
  const context = { transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: partyId, g4 }, change_set_id: 'change',
    selection: { selected_template: { template_id: template.id, template_version: template.version,
      template_digest: template.canonical_digest } },
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: g4.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(g4.version) } }],
    canonical_digest: canonicalDigest('fixture-pins') },
    proposal: { target_site_id: 'generated', inserts: [
      { target_table: 'party_g5_sites', id: 'generated', record: { id: 'generated', party_id: partyId,
        parent_g4_id: g4.id, generated_template_ref: { entity_id: closure.generation_template_ref.id,
          authoring_version: String(closure.generation_template_ref.version) } } }, ...prepared.proposal.rows] } };
  const actorBundle = structuredClone(fixture.approved_actor_temporal_bundle);
  actorBundle.npc_identity = oneNameCatalog;
  actorBundle.actor_profiles.universal_categories.find((row) => row.facet === 'sex_category').stable_code = 'female';
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin,
      runtime_profile: actorProfile }, approvedActorTemporalBundle: actorBundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async (request) => {
      assert.deepEqual(request, { g4, generation_template: { ...closure.generation_template_ref,
        world_revision_id: fixture.world_revision_id, canonical_digest: template.canonical_digest } });
      return { ok: true, value: closure };
    } },
    prepareNaturalFirstEntry: async (value) => {
      assert.equal(value.transaction, context.transaction);
      calls.push('natural');
      return { ok: true, approved_write_sets: [naturalSet],
        recheck: async () => { calls.push('natural-recheck'); return { ok: true }; } };
    },
    readFactualContext: async (value) => {
      assert.equal(value.transaction, context.transaction);
      return { ok: true, party_id: partyId, world_revision_id: fixture.world_revision_id,
        environment, calendar_profile: fixture.calendar_profile,
        started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
        recheck: async () => { calls.push('factual-recheck'); return { ok: true }; } };
    } };
  return { options, context };
}

const npcRows = (result) => result.approved_write_sets.flatMap((set) => set.inserts)
  .filter((row) => row.target_table === 'party_npcs').map((row) => row.record);
async function runGenerated(ordinal = 743) {
  const { options, context } = generatedSetup(ordinal);
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  return { result, npcs: npcRows(result) };
}

test('generated first entry keeps named NPCs after pool exhaustion and records the second pick', async () => {
  const first = await runGenerated(743);
  const repeated = await runGenerated(743);
  assert.equal(first.npcs.length, 2, 'the fixed imported composition creates two NPCs');
  assert.equal(femaleName.sex_category, 'female');
  assert.deepEqual(first.npcs.map((npc) => npc.identity_state.canonical_name), [femaleName.name_form, femaleName.name_form]);
  assert.equal(first.npcs[0].identity_state.name_provenance.reason, undefined);
  assert.equal(first.npcs[1].identity_state.name_provenance.reason, 'scene_pool_exhausted');
  assert.deepEqual(first.npcs, repeated.npcs, 'same scene inputs keep the same names and provenance');
  assert.deepEqual(first.result.materialization_trace, repeated.result.materialization_trace);
});

test('separate generated scenes may reuse the same sole pool name', async () => {
  const left = await runGenerated(743);
  const right = await runGenerated(744);
  assert.equal(left.npcs[0].identity_state.canonical_name, femaleName.name_form);
  assert.equal(right.npcs[0].identity_state.canonical_name, femaleName.name_form);
  assert.notEqual(left.npcs[0].npc_id, right.npcs[0].npc_id);
});

test('canonical start also carries occupied names through its existing first-materialization path', async () => {
  const input = await targetCanonicalStartFixture();
  const maleName = approvedCatalog.name_entries.find((row) => row.sex_category === 'male');
  const femaleName = approvedCatalog.name_entries.find((row) => row.sex_category === 'female');
  input.approved_actor_temporal_bundle = { ...input.approved_actor_temporal_bundle,
    npc_identity: { ...approvedCatalog, name_entries: [maleName, femaleName] } };
  input.idempotency_key = 'army-284-canonical-7';
  const first = materializeAuthoredStartPartyInstance(input).immediate.npcs;
  assert.equal(first.length, 2, 'fixed canonical-start seed creates two NPCs');
  assert.deepEqual(first.map((npc) => npc.identity_state.sex_category), ['female', 'female']);
  assert.deepEqual(first.map((npc) => npc.identity_state.canonical_name),
    [femaleName.name_form, femaleName.name_form]);
  assert.equal(first[0].identity_state.name_provenance.reason, undefined);
  assert.equal(first[1].identity_state.name_provenance.reason, 'scene_pool_exhausted');
  assert.deepEqual(materializeAuthoredStartPartyInstance(input).immediate.npcs, first);
});
