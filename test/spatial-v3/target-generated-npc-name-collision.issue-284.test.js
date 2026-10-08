import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';

// Expected behavior for issue #284; current LW-108 explicitly permits the collision.
// Reuses existing v17 source fixtures; their activation pins are isolated test authority.
const fixture = await targetCanonicalStartFixture();
const catalog = await approvedNpcIdentityCatalog();
fixture.approved_actor_temporal_bundle = { ...fixture.approved_actor_temporal_bundle, npc_identity: catalog };
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const path = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
const manifest = await json(path);
const load = (table) => json(resolve(dirname(path), manifest.datasets.find((row) => row.table === table).file));
const compositions = await load('spatial_v3_g4_npc_composition_bindings');
const canonical = fixture.canonical_npc_closure;
const composition = compositions.find((row) => row.g4_id === canonical.g4_ref.id && row.generation_template_id);
const template = (await load('spatial_v3_g5_generation_templates')).find((row) => row.id === composition.generation_template_id);
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

function setup(ordinal = 743) {
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
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin, runtime_profile: actorProfile },
    approvedActorTemporalBundle: fixture.approved_actor_temporal_bundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async (request) => {
      assert.deepEqual(request, { g4, generation_template: { ...closure.generation_template_ref,
        world_revision_id: fixture.world_revision_id, canonical_digest: template.canonical_digest } });
      return { ok: true, value: closure };
    } },
    prepareNaturalFirstEntry: async (value) => {
      assert.equal(value.transaction, context.transaction);
      calls.push('natural');
      return { ok: true, approved_write_sets: [naturalSet], recheck: async () => { calls.push('natural-recheck'); return { ok: true }; } };
    },
    readFactualContext: async (value) => {
      assert.equal(value.transaction, context.transaction);
      return { ok: true, party_id: partyId, world_revision_id: fixture.world_revision_id,
        environment, calendar_profile: fixture.calendar_profile,
        started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
        recheck: async () => { calls.push('factual-recheck'); return { ok: true }; } };
    } };
  return { options, context, calls, naturalSet };
}


const npcRows = (result) => result.approved_write_sets.flatMap((set) => set.inserts)
  .filter((row) => row.target_table === 'party_npcs').map((row) => row.record);

async function collisionScene() {
  const { options, context } = setup();
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const npcs = npcRows(result);
  assert.equal(npcs.length, 2, 'the unchanged imported composition creates two NPCs');
  assert.notEqual(npcs[0].npc_id, npcs[1].npc_id, 'distinct NPC identities');
  const placements = result.approved_write_sets.flatMap((set) => set.inserts)
    .filter((row) => row.target_table === 'entity_placements' && row.record.entity_kind === 'npc');
  assert.equal(placements.length, 2);
  const positionIds = new Set(context.proposal.inserts.filter((row) => row.target_table === 'scene_position_nodes')
    .map((row) => row.id));
  assert.equal(new Set(placements.map((row) => row.record.position_node_id)).size, 2);
  for (const npc of npcs) {
    assert.equal(npc.party_id, context.request.party_id);
    assert.equal(npc.identity_state.sex_category, 'female');
    const placement = placements.find((row) => row.record.entity_id === npc.npc_id);
    assert.ok(positionIds.has(placement.record.position_node_id), 'NPC is placed in the generated scene');
    const binding = catalog.name_bindings.find((row) => row.regional_context_id
      === npc.semantic_state.source_binding.regional_context_ref.id);
    assert.ok(binding, 'approved regional name binding');
    const identity = npc.identity_state;
    assert.equal(typeof identity.canonical_name, 'string');
    assert.ok(identity.canonical_name.length > 0);
    const entry = catalog.name_entries.find((row) => row.id === identity.name_provenance.entry_id);
    assert.ok(entry, 'selected entry belongs to the confirmed ordinary pool');
    assert.equal(entry.name_form, identity.canonical_name);
    assert.equal(entry.sex_category, identity.sex_category);
    assert.equal(entry.name_pool_id, binding.name_pool_id);
    assert.equal(entry.people_ref, binding.people_ref);
  }
  assert.equal(npcs[0].semantic_state.source_binding.regional_context_ref.id,
    npcs[1].semantic_state.source_binding.regional_context_ref.id);
  return { options, context, result, npcs };
}

test('issue #284 control: confirmed pool, two scene identities and deterministic repeated entry', async () => {
  const { options, context, result, npcs } = await collisionScene();
  const repeated = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(repeated.ok, true, JSON.stringify(repeated.error));
  assert.deepEqual(npcRows(repeated), npcs);
  assert.deepEqual(repeated.materialization_trace, result.materialization_trace);
  const rows = result.approved_write_sets.flatMap((set) => set.inserts);
  for (const npc of npcs) {
    const snapshot = rows.find((row) => row.target_table === 'party_actor_profile_bindings'
      && row.record.actor_id === npc.npc_id).record.name_profile_snapshot;
    assert.equal(snapshot.canonical_name, npc.identity_state.canonical_name);
    assert.deepEqual(snapshot.name_provenance, npc.identity_state.name_provenance);
  }
});

test('ожидаемо красный, issue #284: two newly materialized NPCs in one scene receive distinct pool names', async (t) => {
  const { context, npcs } = await collisionScene();
  t.diagnostic(JSON.stringify({ party_id: context.request.party_id,
    npcs: npcs.map((npc) => ({ id: npc.npc_id, name: npc.identity_state.canonical_name,
      provenance: npc.identity_state.name_provenance })) }));
  // The task's acceptance target: prevent a collision during scene population, never use names as IDs.
  assert.notEqual(npcs[0].identity_state.canonical_name, npcs[1].identity_state.canonical_name,
    'issue #284: two distinct same-scene NPCs must not draw the same canonical_name');
});
