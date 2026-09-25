import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { compileGeneratedNpcBindings, createRandomSource } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { binding, bundle, environment } from '../../packages/materialization/test/fixtures/approved-procedural-npc.js';
import { prepareGeneratedNpcFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/generated-npc-first-entry.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const ref = (entity_id) => ({ entity_id, authoring_version: '1' });
const row = (target_table, id, record) => ({ target_table, id, record: { party_id: 'p', ...record } });
const version = { state_version: 1, created_change_set_id: 'entry', updated_change_set_id: 'entry' };
const scene = { party_id: 'p', site_id: 'generated', rows: [
  row('party_scene_baselines', 'base', { id: 'base', host_kind: 'g5_site', host_id: 'generated',
    source_kind: 'generated_template', scene_template_ref: ref('scene'), materialization_trace_id: 'run',
    materializer_version: '1', catalog_digest: digest('catalog'), status: 'active', ...version }),
  row('party_g6_instances', 'g6', { id: 'g6', scene_baseline_id: 'base', source_scene_template_ref: ref('scene'),
    scene_slot_key: 'main', host_kind: 'g5_site', host_id: 'generated', physical_class_id: 'open',
    primary_scene_role_id: 'outside', vertical_context_id: 'ground', overhead_cover_id: 'sky',
    intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near',
    acoustic_uniformity: 'uniform', status: 'active', ...version }),
  row('scene_position_nodes', 'pos', { id: 'pos', g6_instance_id: 'g6', position_type_id: 'ground',
    template_slot_key: 'focus', template_instance_ordinal: 0, capacity: 8,
    access_class_id: 'open', status: 'active', ...version })
] };
const equipmentCandidate = { equipment_candidate_id: 'tool:worker', status: 'approved',
  target_actor_slot_ref: binding.actor_slot_ref, item_template_ref: 'net', inventory_profile_ref: 'net:inventory',
  owner_ref: binding.actor_slot_ref, holder_ref: binding.actor_slot_ref, controller_ref: binding.actor_slot_ref,
  physical_position: 'hands', condition_state: 'serviceable', legal_status: 'owned', claim_state: 'established' };
const shirt = { ...equipmentCandidate, equipment_candidate_id: 'shirt:worker', item_template_ref: 'shirt',
  inventory_profile_ref: 'shirt:inventory', visual_profile_ref: 'shirt:visual', physical_position: 'equipped',
  equipment_slot_category_id: 'base_garment' };
const equipment = { activation: { status: 'active' }, catalog_digest: 'c'.repeat(64),
  item_templates: ['net', 'shirt'].map((id) => ({ item_template_id: id, display_name: id,
    semantic_category: id, status: 'approved' })),
  item_inventory_profiles: ['net', 'shirt'].map((id) => ({ inventory_profile_id: `${id}:inventory`, item_template_ref: id,
    mass_grams: 500, external_hand_cost: id === 'net' ? 1 : 0, status: 'approved' })),
  item_visual_profiles: [{ visual_profile_id: 'shirt:visual', item_template_ref: 'shirt', status: 'approved',
    visual_profile_snapshot: { schema: 'item_visual_profile_snapshot_v1', version: 1,
      garment_kind: 'shirt', equipment_slot: 'base_garment', neckline: 'round', sleeve_form: 'long',
      outer_form: 'straight', visible_fabric: 'linen', trim: 'none', main_visible_color: 'undyed',
      secondary_visible_color: 'none', headwear_kind: 'none' } }] };
const routine = { schema: 'npc_routine_profile_v1', profile_id: 'routine', revision: 1, status: 'approved',
  phases: [{ state_id: 'work', duration_minutes: 30, activity_ref: 'work', runtime_status: 'available',
    activity_status: 'active', summary: 'Работает.', can_continue_automatically: true, decision_required: false },
  { state_id: 'rest', duration_minutes: 10, activity_ref: 'rest', runtime_status: 'available',
    activity_status: 'paused', summary: 'Отдыхает.', can_continue_automatically: true, decision_required: false }] };

function input() {
  const g4 = { id: 'g4', version: 1, world_revision_id: 'world' };
  const template = { id: 'template', version: 1 };
  const regional = { schema: 'rus.npc_regional_context_profile.v1', id: 'regional', version: 1,
    status: 'approved', world_revision_id: 'world', allowed_role_refs: [binding.role_ref],
    allowed_occupation_refs: [binding.occupation_ref], applicability: [{ g4_ref: g4, generation_template_ref: template }],
    origin: { label: 'Novgorod land', directness: 'analogical', confidence: 'low', source_refs: ['source'] },
    language_status: 'unknown', language_repertoire: null, gameplay_weight: 1 };
  const clothing = { id: 'clothing', version: 1, status: 'approved', world_revision_id: 'world',
    allowed_role_refs: [binding.role_ref], allowed_occupation_refs: [binding.occupation_ref],
    property_binding: { owner: 'actor', holder: 'actor', controller: 'actor', source_ref: 'personal-property' },
    variants: [{ id: 'adult', sex_categories: ['male', 'female'], age_categories: ['adult'],
      seasons: ['summer'], required_clothing_slot_refs: ['base_garment'], equipment_templates: [shirt] }] };
  const result = { party_id: 'p', run_id: 'run', change_set_id: 'entry', world_revision_id: 'world',
    g4_ref: g4, generation_template_ref: template, scene: structuredClone(scene), equipment_catalog: equipment,
    started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    npc_inputs: [{ position_id: 'pos', binding: { ...binding, anchor_id: 'pos', g5_node_id: 'generated',
      g4_ref: g4, generation_template_ref: template, initial_equipment_candidates: [equipmentCandidate],
      regional_context_ref: { id: 'regional', version: 1 }, clothing_profile_ref: { id: 'clothing', version: 1 },
      equipment_required: true, equipment_activation: { status: 'active' },
      activity_equipment_candidate_refs: ['tool:worker'] },
    approved_bundle: { ...bundle, regional_context_profiles: [regional], clothing_profiles: [clothing] }, environment,
    random: createRandomSource({ seed: 42 }), routine_profile: routine }] };
  const dataRow = (id, profile_kind, payload) => ({ id, version: 1, world_revision_id: 'world',
    status: 'approved', canonical_digest: digest(payload), profile_kind, payload });
  const profileRef = (id) => ({ id, version: 1 });
  const runtime = [dataRow('body', 'body', binding.body_profile),
    dataRow('activity', 'activity', bundle.temporal_records[0]), dataRow('routine', 'routine', routine),
    dataRow('clothing', 'clothing', clothing),
    ...equipment.item_templates.map((row) => dataRow(row.item_template_id, 'item_template', row)),
    ...equipment.item_inventory_profiles.map((row) => dataRow(row.inventory_profile_id, 'item_inventory', row)),
    ...equipment.item_visual_profiles.map((row) => dataRow(row.visual_profile_id, 'item_visual', row))];
  runtime.push({ ...dataRow('profile', 'npc_binding', {
    profile_level: binding.profile_level, actor_profile_rule_ref: binding.actor_profile_rule_ref,
    demographic_profile_ref: binding.demographic_profile_ref, appearance_profile_ref: binding.appearance_profile_ref,
    body_profile_ref: profileRef('body'), activity_profile_ref: profileRef('activity'),
    routine_profile_ref: profileRef('routine'), clothing_profile_ref: profileRef('clothing'),
    runtime_profile_refs: runtime.map((row) => profileRef(row.id)), regional_context_refs: [profileRef('regional')],
    initial_equipment_templates: [equipmentCandidate], observable_activity: binding.observable_activity }),
  role_ref: binding.role_ref, occupation_ref: binding.occupation_ref });
  const composition = { ...dataRow('composition', null, { count_weights: [1],
    weighted_profile_refs: [{ profile_ref: profileRef('profile'), weight: 1 }],
    placement_policy: { status: 'approved', position_slot_order: ['focus'],
      reserved_position_slots: ['arrival'], allowed_physical_class_ids: ['open'], empty_context_rules: [] } }),
  min_count: 1, max_count: 1, g4_id: 'g4', g4_version: 1, generation_template_id: 'template', generation_template_version: 1 };
  const compiled = compileGeneratedNpcBindings({ party_id: 'p', run_id: 'run', scene: result.scene,
    approved_bundle: bundle, environment, equipment_activation: equipment.activation,
    actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    world_catalog_digest: 'c'.repeat(64), equipment_catalog_digest: equipment.catalog_digest,
    closure: { schema: 'rus.m2c_npc_binding_bundle.v1',
      world_revision_id: 'world', g4_ref: g4, generation_template_ref: template,
      composition, runtime_profiles: runtime, regional_context_profiles: [dataRow('regional', null, regional)] } });
  return { ...result, ...compiled };
}

test('generated NPC first entry binds full actor, body, routine and tools before P16', () => {
  const proposal = prepareGeneratedNpcFirstEntry(input());
  assert.deepEqual(proposal, prepareGeneratedNpcFirstEntry(input()));
  assert.equal(proposal.validation_report.created_count, 1);
  const rows = proposal.write_set.inserts;
  assert.equal(rows.find((value) => value.target_table === 'party_actor_body_states').record.health, 100);
  const schedule = rows.find((value) => value.target_table === 'party_npc_spatial_schedules').record;
  assert.equal(schedule.current_position_node_id, 'pos');
  assert.equal(schedule.next_transition_at_whole_minutes, 30);
  assert.equal(schedule.causal_state_ref.deferred_placement, undefined);
  for (const mutate of [
    (value) => { value.npc_inputs[0].binding.g4_ref = { id: 'wrong', version: 1 }; },
    (value) => { value.npc_inputs[0].position_id = 'wrong'; },
    (value) => { delete value.npc_inputs[0].binding.regional_context_ref; },
    (value) => { delete value.npc_inputs[0].binding.clothing_profile_ref; },
    (value) => { value.scene.rows.find((row) => row.target_table === 'scene_position_nodes').record.capacity = 0; },
    (value) => { value.equipment_catalog = { ...equipment, activation: { status: 'draft' } }; }
  ]) {
    const value = input(); mutate(value);
    assert.throws(() => prepareGeneratedNpcFirstEntry(value), /NPC_FIRST_ENTRY_/);
  }
  const multiple = input();
  multiple.npc_inputs.push({ ...multiple.npc_inputs[0], binding: { ...multiple.npc_inputs[0].binding,
    actor_slot_ref: 'worker:unclothed', clothing_profile_ref: null, initial_equipment_candidates: [] } });
  assert.throws(() => prepareGeneratedNpcFirstEntry(multiple), { code: 'NPC_FIRST_ENTRY_CLOTHING_GAP' });
});

test('canonical initial scene uses explicit canonical regional applicability in the same NPC owner', () => {
  const data = input();
  data.canonical_g5_ref = { id: 'canonical-approach', version: 1 };
  delete data.generation_template_ref;
  const npcInput = data.npc_inputs[0];
  npcInput.binding.canonical_g5_ref = data.canonical_g5_ref;
  delete npcInput.binding.generation_template_ref;
  npcInput.binding.source_binding.canonical_g5_ref = data.canonical_g5_ref;
  delete npcInput.binding.source_binding.generation_template_ref;
  assert.throws(() => prepareGeneratedNpcFirstEntry(data), (error) => error.code === 'PROCEDURAL_NPC_REGIONAL_CONTEXT_DATA_GAP');
  const applicability = npcInput.approved_bundle.regional_context_profiles[0].applicability[0];
  applicability.canonical_g5_ref = data.canonical_g5_ref;
  delete applicability.generation_template_ref;
  assert.equal(prepareGeneratedNpcFirstEntry(data).validation_report.created_count, 1);
});

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
test('generated NPC rows commit atomically and reload without reroll in PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-npc-entry-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=npc', '-e', 'POSTGRES_USER=npc', '-e', 'POSTGRES_DB=npc',
    'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'npc']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'npc', password: 'npc', database: 'npc' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('p',3,'world','catalog','materializer','rng','commands','profiles')`);
  const proposed = prepareGeneratedNpcFirstEntry(input());
  const inserts = [row('party_g5_sites', 'generated', { id: 'generated', origin: 'generated',
    parent_g4_id: 'g4', generated_template_ref: ref('template'), expansion_slot_ref: ref('slot'),
    source_frontier_id: 'frontier', generation_ordinal: 0, status: 'active', ...version }),
  ...scene.rows, ...proposed.write_set.inserts];
  const appends = [row('party_materialization_runs', 'run', { run_id: 'run', g4_id: 'g4',
    run_kind: 'expansion', occurrence: 0, seed_digest: digest('seed'),
    input_digest: digest('input'), catalog_digest: digest('catalog'), materializer_version: '1', rng_version: 'mulberry32_v1',
    result_digest: digest(proposed), idempotency_key: 'entry', status: 'committed',
    validation_report: proposed.validation_report, trace: { created_change_set_id: 'entry' }, created_refs: [] }),
  row('party_v3_change_sets', 'entry', { id: 'entry', operation_kind: 'resolve_frontier', idempotency_record_id: 'idem:entry' })];
  const plan = await buildPlan(inserts, appends);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: async () => ({ ok: true }) });
  const outcome = await committer.commit({ plan });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.equal((await committer.commit({ plan })).replay, true);
  const saved = await pool.query(`SELECT n.identity_state,n.machine_state,n.semantic_state,n.profile_set_id,b.health,b.energy,b.satiety,
    p.attribute_profile_snapshot,s.current_position_node_id,s.next_transition_at_whole_minutes,
    s.causal_state_ref FROM party_runtime.party_npcs n
    JOIN party_runtime.party_actor_body_states b ON b.party_id=n.party_id AND b.actor_id=n.npc_id
    JOIN party_runtime.party_actor_profile_bindings p ON p.party_id=n.party_id AND p.actor_id=n.npc_id
    JOIN party_runtime.party_npc_spatial_schedules s ON s.party_id=n.party_id AND s.npc_id=n.npc_id`);
  assert.equal(saved.rows.length, 1);
  const expected = proposed.write_set.inserts.find((row) => row.target_table === 'party_npcs').record;
  assert.deepEqual(saved.rows[0].identity_state, expected.identity_state);
  assert.deepEqual(saved.rows[0].machine_state, expected.machine_state);
  assert.deepEqual(saved.rows[0].semantic_state.source_binding, input().npc_inputs[0].binding.source_binding);
  assert.equal(saved.rows[0].profile_set_id, saved.rows[0].semantic_state.source_binding.npc_binding_ref.id);
  assert.equal(saved.rows[0].semantic_state.profile_revision, saved.rows[0].semantic_state.source_binding.npc_binding_ref.version);
  assert.deepEqual([saved.rows[0].health, saved.rows[0].energy, saved.rows[0].satiety], ['100', '80', '70']);
  assert.equal(saved.rows[0].current_position_node_id, 'pos');
  assert.equal(saved.rows[0].next_transition_at_whole_minutes, '30');
  assert.equal(saved.rows[0].attribute_profile_snapshot.values.strength, 13);
  const items = await pool.query(`SELECT i.quantity,p.physical_position,p.holder_npc_id,
    o.owner_npc_id,o.controller_npc_id FROM party_runtime.party_items i
    JOIN party_runtime.party_item_placements p USING(party_id,item_id)
    JOIN party_runtime.party_ownership o USING(party_id,item_id)`);
  assert.equal(items.rows.length, 2);
  assert.equal(items.rows.some((item) => item.physical_position === 'hands'), true);
  assert.equal(items.rows.some((item) => item.physical_position === 'equipped'), true);
  for (const item of items.rows) {
    assert.equal(item.owner_npc_id, expected.npc_id);
    assert.equal(item.holder_npc_id, expected.npc_id);
    assert.equal(item.controller_npc_id, expected.npc_id);
  }
});

async function buildPlan(inserts, appends) {
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Местность.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'world' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({ plan_id: 'plan:entry', party_id: 'p',
    write_plan_kind: 'semantic_commit', operation_kind: 'resolve_frontier', canonical_input_digest: digest('entry'),
    expected_state_versions: [], validation_report: { status: 'pass', digest: digest('validation') },
    idempotency: { id: 'idem:entry', key: 'entry' }, change_set: { id: 'entry' },
    visible_package_envelope: { package_id: 'visible:entry', party_id: 'p', turn_id: 'entry', committed_state_version: '1',
      change_set_id: 'entry', package_digest: digest(payload), visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).slice(7) }, idempotency_record_id: 'idem:entry' },
    approved_write_sets: [{ inserts, updates: [], appends }], lock_context: { owner_keys: [], execution_keys: [],
      g4_keys: ['p:g4'], physical_keys: [...inserts, ...appends].map((row) => `party_runtime.${row.target_table}:${row.id}`) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) })) }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}
