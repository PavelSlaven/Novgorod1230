import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3Repository } from '@rus/party-store/spatial-v3';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { createSpatialV3GeneratedExpansionAdapter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-generated-expansion-adapter.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { readSpatialV3ExpansionContext } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-expansion-context.js';
import { createSpatialV3ExpansionRuntime } from '../../apps/game-server/src/runtime/spatial-v3-expansion-runtime.js';
import { SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF } from '../../apps/game-server/src/runtime/spatial-v3-current-visible-context.js';
import { projectSpatialV3ProposedVisiblePackage } from '../../apps/game-server/src/runtime/spatial-v3-proposed-visible-context.js';
import { approvedNaturalPerceptionFixture } from '../../apps/game-server/test/g4-natural-perception-fixture.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const hash = 'a'.repeat(64);
const profile = { id: 'profile', version: 1, world_revision_id: 'world', status: 'approved', canonical_digest: hash };
const rules = [['adjacency_rule_set', 'adjacency', 'through_same_exit'],
  ['connectivity_rule_set', 'connectivity', 'existing_exit_reachable'], ['seed_policy', 'seed', 'mulberry32_v1']]
  .map(([role, rule_kind, strategy]) => {
    profile[`${role}_id`] = role; profile[`${role}_version`] = 1;
    return { id: role, version: 1, dependency_role: role, rule_kind, strategy, status: 'approved',
      world_revision_id: 'world', canonical_digest: hash, authoring_digest: hash, canonical_ordinal: 0 };
  });
const slot = { id: 'slot', version: 1, profile_id: 'profile', profile_version: 1, world_revision_id: 'world',
  g4_id: 'g4', g4_version: 1, status: 'approved', continuation_role: 'through', direction_context_id: 'outward',
  directional_exit_id: 'exit', directional_exit_version: 1, max_instances: 2,
  terminal_policy_id: 'terminal', terminal_policy_version: 1,
  continuation_length_rule_id: 'length', continuation_length_rule_version: 1 };
const closure = { profile, slots: [slot], expansion_rule_sets: rules,
  directional_exits: [{ id: 'exit', version: 1, g4_id: 'g4', g4_version: 1, status: 'approved',
    exit_canonical_g5_id: 'canonical-terminal', exit_canonical_g5_version: 1 }],
  terminal_policies: [{ id: 'terminal', version: 1, status: 'approved', policy_kind: 'world_route_exit',
    target_directional_exit_id: 'exit', target_directional_exit_version: 1 }],
  continuation_length_rules: [{ id: 'length', version: 1, status: 'approved', selection_kind: 'fixed' }],
  continuation_length_candidates: [{ rule_id: 'length', rule_version: 1, terminal_ordinal: 1, weight: 1 }],
  entry_slot_rules: [{ entry_binding_id: 'entry', entry_binding_version: 1, slot_id: 'slot', slot_version: 1 }],
  entry_endpoint_bindings: [{ id: 'entry', version: 1, canonical_g5_id: 'canonical-source', canonical_g5_version: 1,
    departure_scene_endpoint_slot_key: 'departure' }],
  slot_templates: [{ slot_id: 'slot', slot_version: 1, template_id: 'generation', template_version: 1,
    scene_materialization_profile_id: 'scene-profile', scene_materialization_profile_version: 1, selection_weight: 1 }],
  template_limits: [{ template_id: 'generation', template_version: 1, max_count: 2 }],
  successor_frontier_rules: [{ g5_template_id: 'generation', g5_template_version: 1,
    source_expansion_slot_id: 'slot', source_expansion_slot_version: 1, successor_kind: 'through_successor',
    target_expansion_slot_id: 'slot', target_expansion_slot_version: 1, terminal_policy_id: 'terminal',
    terminal_policy_version: 1, scene_endpoint_slot_key: 'departure' }],
  scene_materialization_candidates: [{ profile_id: 'scene-profile', profile_version: 1,
    scene_template_id: 'scene', scene_template_version: 1, weight: 1 }],
  connection_profiles: [{ id: 'connection-profile', version: 1, status: 'approved',
    passage_type_id: 'path', transition_environment_profile_id: 'environment', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'orientation', movement_orientation_profile_version: 1,
    cost_kind: 'action', action_units: 1, availability_condition_set_ref: 'nonportal-condition@1' }] };
const scene = { header: { id: 'scene', version: 1, world_revision_id: 'world', status: 'approved', canonical_digest: hash },
  g6_slots: [{ scene_slot_key: 'main', physical_class_id: 'open', primary_scene_role_id: 'outside',
    vertical_context_id: 'ground', overhead_cover_id: 'sky', intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform' }],
  position_slots: ['arrival', 'departure'].map((position_slot_key) => ({ position_slot_key,
    g6_scene_slot_key: 'main', instance_count: 1, position_type_id: 'ground', capacity: 3, access_class_id: 'open' })),
  endpoint_slots: ['arrival', 'departure'].map((slot_key) => ({ slot_key, endpoint_role: slot_key,
    required_position_slot_key: slot_key, required_position_instance_ordinal: 0 })),
  movement_edges: [{ edge_slot_key: 'out', from_position_slot_key: 'arrival', to_position_slot_key: 'departure',
    passage_type_id: 'path', transition_environment_profile_id: 'environment', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'orientation', movement_orientation_profile_version: 1, cost_kind: 'action', action_units: 1 }] };
const acoustic = { id: 'ambient', version: 1, world_revision_id: 'world',
  g5_template_id: 'generation', g5_template_version: 1, scene_template_id: 'scene', scene_template_version: 1,
  g6_scene_slot_key: 'main', ambient_noise: 1, status: 'approved', canonical_digest: hash, authoring_digest: hash };
const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'world' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '1' } }];
const dependency_pins = { pins, canonical_digest: digest(pins).slice(7) };
const sceneInput = { party_id: 'p', site_id: 'site', baseline_id: 'baseline', change_set_id: 'change',
  materializer_version: 'm2c', materialization_trace_id: 'trace', generation_template: { id: 'generation', version: 1 },
  scene_closure: scene, acoustic_rows: [acoustic], dependency_pins };

test('generated scene requires exact approved ambient and preserves template topology', () => {
  const result = materializeSpatialV3GeneratedScene(sceneInput);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.proposal.rows.filter((row) => row.target_table === 'party_g6_instances')
    .map((row) => row.record.scene_slot_key), scene.g6_slots.map((row) => row.scene_slot_key));
  assert.equal(result.proposal.rows.find((row) => row.target_table === 'g6_acoustic_profiles').record.ambient_noise, 1);
  assert.equal(result.proposal.rows.filter((row) => row.target_table === 'scene_position_nodes').length, 2);
  assert.equal(result.proposal.endpoints[0].position_id, 'baseline:position:arrival:0');
  assert.equal(Object.isFrozen(result.proposal.rows), true);
  for (const rows of [[], [{ ...acoustic, status: 'draft' }], [{ ...acoustic, g5_template_id: 'other' }],
    [{ ...acoustic, authoring_digest: 'mismatch' }]]) {
    assert.equal(materializeSpatialV3GeneratedScene({ ...sceneInput, acoustic_rows: rows }).ok, false);
  }
});

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
for (const terminalOrdinal of [1, 0]) test(`generated adapter terminal=${terminalOrdinal} creates an unvisited canonical exit atomically`, async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-generated-adapter-${process.pid}-${terminalOrdinal}`;
  const currentClosure = structuredClone(closure);
  currentClosure.continuation_length_candidates[0].terminal_ordinal = terminalOrdinal;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p', '127.0.0.1::5432', '--name', name, '-e', 'POSTGRES_PASSWORD=test',
    '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_DB=test', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'test']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  pool = new pg.Pool({ host: '127.0.0.1', port: Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]),
    user: 'test', password: 'test', database: 'test' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('p',3,'world','catalog','materializer','rng','commands','profiles')`);
  await pool.query(`UPDATE party_runtime.parties SET state_version=1 WHERE party_id='p'`);
  await pool.query(`INSERT INTO party_runtime.party_state_snapshots
    (party_id,state_version,state_payload,state_digest) VALUES ('p',1,'{}','seed')`);
  for (const site of ['source']) {
    await pool.query(`INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,'p','canonical','g4',$2,'active',1,'seed','seed')`, [site, { entity_id: `canonical-${site}`, authoring_version: '1' }]);
    const prepared = materializeSpatialV3GeneratedScene({ ...sceneInput, site_id: site, baseline_id: `base:${site}` });
    for (const row of prepared.proposal.rows) {
      const record = { ...row.record, ...(row.target_table === 'party_scene_baselines' ? { source_kind: 'canonical_template' } : {}) };
      const fields = Object.keys(record);
      await pool.query(`INSERT INTO party_runtime.${row.target_table} (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})`,
        fields.map((key) => record[key]));
    }
  }
  let missingAmbient = true;
  let failCommit = false;
  let admissionCount = 0;
  let missingTerminalScene = false;
  let ambiguousTerminalScene = false;
  const { perception } = await approvedNaturalPerceptionFixture();
  const readSources = async ({ overlay }) => ({ naturalInput: { ...perception,
    observer: { ...perception.observer, party_id: 'p', actor_id: 'test-actor', position_id: overlay.position.id },
    scene: { ...perception.scene, party_id: 'p', site_id: overlay.site.id,
      baseline_id: overlay.baseline.id, positions: overlay.scene_positions.filter((row) =>
        row.g6_instance_id === overlay.g6.id), g6: [overlay.g6],
      acoustic_profiles: overlay.acoustic_profiles.filter((row) => row.g6_instance_id === overlay.g6.id) },
    observations: perception.observations.map((row) => ({ ...row,
      source_position_id: overlay.position.id })),
    source_bindings: overlay.endpoint_bindings.filter((row) => row.g5_site_id === overlay.site.id
      && row.position_id === overlay.position.id) },
  partyId: 'p', actorId: 'test-actor', positionId: overlay.position.id,
  entityObservations: [], localEdges: [], directionalExits: [] });
  const adapter = createSpatialV3GeneratedExpansionAdapter({
    worldBaseReader: { readPinnedG4ExpansionClosure: async () => ({ ok: true, value: currentClosure }),
      readPinnedSceneTemplateClosure: async ({ id }) => id === 'terminal-scene' && missingTerminalScene
        ? { ok: false, error: { code: 'scene_missing' } }
        : { ok: true, value: id === 'terminal-scene' ? { ...scene, header: { ...scene.header, id },
          endpoint_slots: ambiguousTerminalScene ? [...scene.endpoint_slots, { ...scene.endpoint_slots[0], slot_key: 'second-arrival' }] : scene.endpoint_slots } : scene },
      readPinnedCanonicalG5SceneBinding: async () => ({ ok: true, value: {
        id: 'canonical-terminal', version: 1, world_revision_id: 'world', canonical_digest: hash,
        materialization_profile_id: 'terminal-profile', materialization_profile_version: 1,
        parent_id: 'g4', parent_version: 1, scene_template_id: 'terminal-scene', scene_template_version: 1 } }),
      readPinnedCanonicalG5AcousticClosure: async () => ({ ok: true, value: { rows: [
        { ...acoustic, g5_template_id: null, g5_template_version: null, canonical_g5_id: 'canonical-terminal',
          canonical_g5_version: 1, scene_template_id: 'terminal-scene' }] } }),
      readPinnedG5AcousticClosure: async () => ({ ok: true, value: { rows: missingAmbient ? [] : [acoustic] } }) },
    committer: createSpatialV3PostgresCombinedAtomicCommitter({ pool }),
    prepareFirstEntry: async () => ({ ok: true, approved_write_sets: [],
      materialization_trace: { selection: { count: 0, choices: [{ choice_key: 'npc_count',
        rng_draw: 1, selected_id: '0', candidate_set_digest: hash }] }, choices: [], attribute_traces: [] } }),
    now: () => Date.parse('2026-01-01T00:00:00Z'),
    admitGeneration: async () => { admissionCount += 1; return { ok: true,
      scene_template_ref: { id: 'scene', version: 1 }, validation_report: { status: 'pass', digest: digest('test-admission') },
      commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: digest(kind) })),
      recheck: async () => ({ ok: !failCommit }) }; },
    projectVisible: ({ transaction, snapshot, proposal, firstEntry, envelopeInput }) =>
      projectSpatialV3ProposedVisiblePackage({ transaction, snapshot, proposal, firstEntry,
        readSources, envelopeInput })
  });
  const request = { party_id: 'p', g4: { id: 'g4', version: 1, world_revision_id: 'world', canonical_digest: hash },
    profile: { id: 'profile', version: 1, canonical_digest: hash }, slot_ref: { id: 'slot', version: 1 },
    directional_exit: { id: 'exit', version: 1 }, entry_binding: { id: 'entry', version: 1 },
    candidate_ordinal: 0, source_site_id: 'source', source_position_id: 'base:source:position:departure:0', materializer_version: 'm2c' };
  const repository = createSpatialV3Repository({ transaction: pool });
  const state = async () => (await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' })).snapshot;
  const assertCommittedVisibleDigest = async (result) => {
    const committed = await state();
    const connection = committed.site_connections.find((row) => row.id === result.connection_id);
    const binding = committed.endpoint_bindings.find((row) => row.site_connection_id === connection.id
      && row.endpoint_role === 'to');
    const persisted = (await pool.query(`SELECT package_id,party_id,turn_id,committed_state_version,
      change_set_id,package_digest,projection_policy_ref,dependency_pins,idempotency_record_id
      FROM party_runtime.party_visible_packages WHERE change_set_id=$1`, [result.change_set_id])).rows[0];
    assert.ok(persisted);
    assert.deepEqual(persisted.projection_policy_ref, SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF);
    assert.equal(persisted.dependency_pins.canonical_digest,
      digest(persisted.dependency_pins.pins).slice(7));
    const versions = (await pool.query(`SELECT expected_state_version_set
      FROM party_runtime.party_v3_change_sets WHERE id=$1`, [result.change_set_id])).rows[0]
      .expected_state_version_set;
    const byTable = { party_g4_expansion_ledgers: committed.ledgers,
      party_continuation_chains: committed.chains, expansion_frontiers: committed.frontiers,
      expansion_capacity_reservations: committed.reservations,
      scene_frontier_bindings: committed.bindings };
    assert.equal(new Set(versions.map(({ target_table, id }) => `${target_table}:${id}`)).size,
      versions.length);
    for (const { target_table, id, state_version } of versions) {
      const row = target_table === 'party_g4_expansion_ledgers'
        ? committed.ledgers.find((row) => id === `p:${row.g4_id}:${row.profile_ref_id}`)
        : byTable[target_table]?.find((item) => item.id === id);
      assert.equal(row?.state_version,
        state_version + 1);
    }
    const { package_digest, ...envelopeInput } = persisted;
    const projected = await projectSpatialV3ProposedVisiblePackage({ transaction: pool,
      snapshot: committed, proposal: { target_site_id: connection.to_site_id,
        target_position_id: binding.position_id, inserts: [], updates: [] },
      firstEntry: { approved_write_sets: [] }, readSources, envelopeInput });
    assert.equal(package_digest, projected.envelope.package_digest);
  };
  if (terminalOrdinal === 0) {
    for (const gap of ['missing', 'ambiguous', 'commit']) {
      missingTerminalScene = gap === 'missing'; ambiguousTerminalScene = gap === 'ambiguous'; failCommit = gap === 'commit';
      assert.equal((await adapter.prepareExpansion(request)).ok, false, gap);
      assert.equal((await state()).sites.length, 1, gap);
      assert.equal((await state()).frontiers.length, 0, gap);
      assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_command_idempotency')).rows[0].count, '0');
    }
    missingTerminalScene = false; ambiguousTerminalScene = false; failCommit = false;
    const result = await adapter.prepareExpansion(request);
    assert.equal(result.ok, true, JSON.stringify(result));
    await assertCommittedVisibleDigest(result);
    const target = (await state()).sites.find((row) => row.canonical_g5_ref?.entity_id === 'canonical-terminal');
    assert.ok(target);
    assert.equal((await state()).sites.filter((row) => row.origin === 'generated').length, 0);
    assert.equal((await state()).chains[0].status, 'terminal_resolved');
    assert.equal((await state()).site_connections.length, 1);
    assert.equal((await adapter.prepareExpansion(request)).replay, true);
    assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_journey_locations')).rows[0].count, '0');
    await assertPublicExpansionReload(pool, request, currentClosure);
    return;
  }
  const missing = await adapter.prepareExpansion(request);
  assert.equal(missing.ok, false);
  assert.equal(missing.error.diagnostics.reason, 'approved_exact_g6_ambient_baseline_required');
  assert.equal((await state()).frontiers.length, 0);
  missingAmbient = false; failCommit = true;
  assert.equal((await adapter.prepareExpansion(request)).ok, false);
  assert.equal((await state()).frontiers.length, 0);
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_command_idempotency')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_materialization_runs')).rows[0].count, '0');
  failCommit = false;
  const concurrent = await Promise.all([adapter.prepareExpansion(request), adapter.prepareExpansion(request)]);
  assert.equal(concurrent.every((result) => result.ok), true, JSON.stringify(concurrent));
  assert.equal(concurrent.filter((result) => result.replay).length, 1);
  await assertCommittedVisibleDigest(concurrent[0]);
  const generated = await state();
  assert.equal(generated.sites.filter((row) => row.origin === 'generated').length, 1);
  assert.equal(generated.frontiers.length, 2);
  assert.equal(generated.bindings.filter((row) => row.status === 'active').length, 1);
  assert.equal(concurrent[0].connection_id, generated.site_connections[0].id);
  assert.equal(concurrent[1].connection_id, concurrent[0].connection_id);
  assert.deepEqual(generated.site_connections[0].availability_condition_set_ref,
    { entity_id: 'nonportal-condition', authoring_version: '1' });
  const beforeReplay = admissionCount;
  assert.equal((await adapter.prepareExpansion(request)).replay, true);
  assert.equal(admissionCount, beforeReplay);
  const open = generated.frontiers.find((row) => row.status === 'open');
  const bound = generated.bindings.find((row) => row.frontier_id === open.id);
  const terminal = await adapter.prepareExpansion({ ...request, candidate_ordinal: 1,
    source_site_id: open.source_g5_site_id, source_position_id: bound.position_id });
  assert.equal(terminal.ok, true, JSON.stringify(terminal));
  await assertCommittedVisibleDigest(terminal);
  assert.equal((await state()).frontiers.filter((row) => row.status === 'open').length, 0);
  assert.equal((await state()).chains[0].status, 'terminal_resolved');
  assert.equal((await state()).site_connections.length, 2);
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_journey_locations')).rows[0].count, '0');
  const traces = (await pool.query('SELECT run_id,trace FROM party_runtime.party_materialization_runs ORDER BY occurrence')).rows;
  assert.equal(traces.length, 2);
  assert.equal(traces[0].trace.trigger, 'frontier_resolution');
  assert.equal(traces[0].trace.choice_ids.length, 2);
  assert.equal(traces[0].trace.first_entry.selection.count, 0);
  assert.equal(traces[0].trace.first_entry.selection.choices[0].selected_id, '0');
  assert.deepEqual(traces[0].trace.first_entry.attribute_traces, []);
  assert.equal(traces[1].trace.first_entry, undefined);
  assert.equal(traces[1].trace.choice_ids.length, 0);
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_materialization_choices')).rows[0].count, '2');
  assert.equal(generated.scene_baselines.find((row) => row.source_kind === 'generated_template').materialization_trace_id, traces[0].run_id);
  await assertPublicExpansionReload(pool, request, currentClosure);
});

async function assertPublicExpansionReload(pool, request, currentClosure) {
  const transaction = await pool.connect();
  try {
    await transaction.query('BEGIN');
    await transaction.query(`INSERT INTO party_runtime.party_journey_locations
      (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
      VALUES ('test-location','p','actor','test-actor','scene',$1,1,'test')`, [request.source_position_id]);
    const worldBaseReader = { readG4ExpansionBinding: async () => ({ ok: true, value: { g4: request.g4, profile: request.profile } }),
      readPinnedG4ExpansionClosure: async () => ({ ok: true, value: currentClosure }),
      readPinnedSceneTemplateClosure: async () => ({ ok: true, value: scene }) };
    const release = { world_revision_id: 'world', world_catalog_digest: 'catalog' };
    const readContext = (input) => readSpatialV3ExpansionContext({ ...input, transaction, worldBaseReader, release });
    const runtime = createSpatialV3ExpansionRuntime({ readContext,
      readExitDisclosure: async () => [{ directional_exit_id: 'exit', directional_exit_version: 1,
        direction_context_id: currentClosure.directional_exits[0].direction_context_id,
        knowledge_state: 'known', display_label: 'Продолжить путь' }],
      generatedExpansionAdapter: { prepareExpansion: async () => assert.fail('reload must reuse committed connection') } });
    const selected = { partyId: 'p', actorId: 'test-actor', directionalExitId: 'exit' };
    const before = await transaction.query('SELECT count(*) FROM party_runtime.party_materialization_runs');
    assert.equal((await runtime.listExpansionOptions(selected)).length, 1);
    const replay = await runtime.prepareExpansion(selected);
    assert.equal(replay.replay, true); assert.equal(replay.topology_status, 'committed');
    assert.equal(replay.moves_traveller, false);
    assert.deepEqual((await transaction.query('SELECT count(*) FROM party_runtime.party_materialization_runs')).rows, before.rows);
    await assert.rejects(readSpatialV3ExpansionContext({ ...selected, transaction, worldBaseReader,
      release: { ...release, world_catalog_digest: 'stale' } }),
    (error) => error.details.reason === 'active_release_pin_mismatch');
    await transaction.query('ROLLBACK');
  } finally { transaction.release(); }
  assert.equal((await pool.query("SELECT count(*) FROM party_runtime.party_journey_locations WHERE id='test-location'")).rows[0].count, '0');
}
