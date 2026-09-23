import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';

const fixture = await targetCanonicalStartFixture();
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

function setup(ordinal = 0) {
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

test('target first entry combines existing NPC owners and natural proposal with exact pins and all selection traces', async () => {
  const counts = new Set();
  for (let ordinal = 0; ordinal < 30 && counts.size < 2; ordinal += 1) {
    const { options, context, calls, naturalSet } = setup(ordinal);
    const result = await createTargetGeneratedFirstEntry(options)(context);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    const trace = result.materialization_trace;
    counts.add(trace.selection.count === 0 ? 'empty' : 'populated');
    assert.equal(result.approved_write_sets[0], naturalSet);
    assert.equal(trace.selection.equipment_catalog_digest, itemPin.catalog_digest);
    assert.equal(trace.selection.choices[0].choice_key, 'npc_count');
    assert.equal(trace.selection.choices[0].selected_id, String(trace.selection.count));
    assert.equal(trace.validation_report.created_count, trace.selection.count);
    const npcs = result.approved_write_sets.flatMap((set) => set.inserts).filter((row) => row.target_table === 'party_npcs');
    assert.equal(npcs.length, trace.selection.count);
    if (npcs.length) { assert.ok(trace.choices.length > 0); assert.equal(trace.attribute_traces.length, npcs.length); }
    else { assert.deepEqual(trace.choices, []); assert.equal(result.approved_write_sets.length, 1); }
    assert.deepEqual(await result.recheck({ transaction: context.transaction }), { ok: true });
    assert.deepEqual(calls, ['natural', 'factual-recheck', 'natural-recheck']);
    assert.equal(canonicalDigest(trace), canonicalDigest((await createTargetGeneratedFirstEntry(options)(context)).materialization_trace));
  }
  assert.deepEqual(counts, new Set(['empty', 'populated']));
});

test('missing current facts or exact party catalog pins fail before proposing natural rows', async () => {
  for (const mutate of [
    ({ options }) => { delete options.readFactualContext; },
    ({ options }) => { options.readFactualContext = async () => ({ ok: true }); },
    ({ context }) => { context.transaction.query = async () => ({ rows: [] }); },
    ({ context }) => { delete context.selection.selected_template.template_digest; },
    ({ options }) => { options.verifiedItemCatalog = { ...options.verifiedItemCatalog, verified: false }; },
    ({ options }) => { options.actorBaseAttributesBinding = { ...options.actorBaseAttributesBinding,
      pin: { ...actorPin, activation_event_id: 'foreign' } }; }
  ]) {
    const value = setup(); mutate(value);
    const result = await createTargetGeneratedFirstEntry(value.options)(value.context);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'authoring_dependency_pin_missing');
    assert.deepEqual(value.calls, []);
  }
});
