import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { createOrdinaryAggregate } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PartyRepository } from '../../packages/party-store/src/spatial-v3-repository.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const ref = (entity_id) => ({ entity_id, authoring_version: '1' });
const write = (target_table, id, record) => ({ target_table, id, record: { party_id: 'p', ...record } });
const key = (row) => `party_runtime.${row.target_table}:${row.id}`;
const sceneRows = (site, change) => [
  write('party_scene_baselines', `base:${site}`, { id: `base:${site}`, host_kind: 'g5_site',
    host_id: site, source_kind: site === 'source' ? 'canonical_template' : 'generated_template',
    scene_template_ref: ref('scene'), materialization_trace_id: `trace:${site}`,
    materializer_version: '1', catalog_digest: digest('catalog'), status: 'active', state_version: 1,
    created_change_set_id: change, updated_change_set_id: change }),
  write('party_g6_instances', `g6:${site}`, { id: `g6:${site}`, scene_baseline_id: `base:${site}`,
    source_scene_template_ref: ref('scene'), scene_slot_key: 'main', host_kind: 'g5_site', host_id: site,
    physical_class_id: 'open', primary_scene_role_id: 'outside', vertical_context_id: 'ground',
    overhead_cover_id: 'sky', intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near',
    acoustic_uniformity: 'uniform', status: 'active', state_version: 1,
    created_change_set_id: change, updated_change_set_id: change }),
  write('scene_position_nodes', `pos:${site}`, { id: `pos:${site}`, g6_instance_id: `g6:${site}`,
    position_type_id: 'ground', template_slot_key: 'entry', template_instance_ordinal: 0,
    capacity: 8, access_class_id: 'open', status: 'active', state_version: 1,
    created_change_set_id: change, updated_change_set_id: change }),
  write('g6_acoustic_profiles', `g6:${site}`, { g6_instance_id: `g6:${site}`, ambient_noise: 0,
    acoustic_uniformity: 'uniform', state_version: 1, updated_change_set_id: change })
];
const frontierBinding = (frontier, site, change) => write('scene_frontier_bindings', `binding:${frontier}`, {
  id: `binding:${frontier}`, position_id: `pos:${site}`, frontier_id: frontier,
  scene_baseline_id: `base:${site}`, status: 'active', state_version: 1, activated_change_set_id: change });

function ordinaryRows(site, change) {
  const scope_ref = { entity_kind: 'g6', entity_id: `g6:${site}` };
  const scoped = { scope_kind: scope_ref.entity_kind, scope_id: scope_ref.entity_id };
  const id = `p:g6:${scope_ref.entity_id}`;
  const basis_ref = `resource:${site}`;
  const basis = { basis_ref, state: 'committed', scope_ref, basis_kind: 'finite_source',
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['common_mundane'], permission_refs: [] };
  return [
    write('party_ordinary_materialization_enablements', id, { ...scoped,
      objective_snapshot: { scope_ref }, objective_digest: digest(scope_ref), enabled: true }),
    write('party_ordinary_materialization_basis_catalog', `${id}:${basis_ref}`, {
      ...scoped, basis_ref, origin_request_identity: null, basis_snapshot: basis }),
    write('party_ordinary_materialization_contexts', id, { ...scoped,
      catalog_version: 1, property_version: 1, placement_version: 1,
      supporting_basis_catalog_version: 1, supporting_basis_catalog_digest: digest([basis]),
      property_placement_context_digest: digest(scope_ref), property_placement_base_snapshot: { scope_ref } }),
    write('party_ordinary_materialization_aggregates', id, { ...scoped, state_version: 0,
      aggregate_payload: createOrdinaryAggregate({ scope_ref, resolution_record_cap: 8 }) }),
    write('party_resource_nodes', basis_ref, { resource_node_id: basis_ref,
      source_resource_ref: ref('natural-source'), position_node_id: `pos:${site}`,
      quantity_numerator: 4, quantity_denominator: 1,
      quantity_unit_ref: { kind: 'unit', id: 'item' }, quality_ref: ref('ordinary'),
      access_policy_ref: ref('natural-access'), state_version: 1,
      created_change_set_id: change, updated_change_set_id: change,
      lifecycle_state: 'active', property_basis_ref: 'source-property' })
  ];
}

async function plan(id, { inserts = [], updates = [], appends = [], versions = [] } = {}) {
  const operation = 'resolve_frontier';
  const changes = write('party_v3_change_sets', id, {
    id, operation_kind: operation, idempotency_record_id: `idem:${id}`
  });
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Местность.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'world' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({
    plan_id: `plan:${id}`, party_id: 'p', write_plan_kind: 'semantic_commit',
    operation_kind: operation, canonical_input_digest: digest(id),
    expected_state_versions: versions,
    validation_report: { status: 'pass', digest: digest(id) },
    idempotency: { id: `idem:${id}`, key: id }, change_set: { id },
    visible_package_envelope: { package_id: `visible:${id}`, party_id: 'p', turn_id: id,
      committed_state_version: '1', change_set_id: id, package_digest: digest(payload),
      visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: `idem:${id}` },
    approved_write_sets: [{ inserts, updates, appends: [changes, ...appends] }],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: ['p:g4'],
      physical_keys: [...inserts, ...updates, changes, ...appends].map(key) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}

test('expansion P16 preserves normalized state, replay, concurrent CAS and rollback in PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-expansion-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=p16', '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16',
    'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'p16']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p16', password: 'p16', database: 'p16' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('p',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('source','p','canonical','g4','{"entity_id":"canonical"}','active',0,'seed','seed');`);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });
  const ledger = (change) => write('party_g4_expansion_ledgers', 'p:g4:profile', {
    g4_id: 'g4', profile_ref: ref('profile'), state_version: 1, updated_change_set_id: change });
  const frontier = (id, source, ordinal, change) => write('expansion_frontiers', id, {
    id, g4_id: 'g4', source_g5_site_id: source, slot_ref: ref('slot'),
    direction_context_id: 'outward', continuation_chain_id: 'chain',
    continuation_ordinal: ordinal, status: 'open', state_version: 1, created_change_set_id: change });
  const initial = await plan('initial', { inserts: [...sceneRows('source', 'initial'),
    frontierBinding('f0', 'source', 'initial'), frontier('f0', 'source', 0, 'initial'),
    ledger('initial'), write('party_continuation_chains', 'chain', {
      id: 'chain', g4_id: 'g4', slot_ref: ref('slot'), initial_frontier_id: 'f0',
      terminal_ordinal: 1, length_rule_ref: ref('length'), candidate_digest: digest('candidates'),
      choice_trace_id: 'choice', status: 'active', state_version: 1,
      created_change_set_id: 'initial', updated_change_set_id: 'initial' })] });
  assert.equal((await committer.commit({ plan: initial })).ok, true);
  assert.equal((await committer.commit({ plan: initial })).replay, true);
  const repository = createSpatialV3PartyRepository({ transaction: pool });
  const snapshot = await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' });
  assert.equal(snapshot.snapshot.frontiers.length, 1);
  assert.equal(snapshot.snapshot.ledgers[0].profile_ref_id, 'profile');
  assert.equal(Object.isFrozen(snapshot.snapshot.frontiers[0]), true);
  assert.deepEqual((await repository.loadExpansionState({ party_id: 'other', g4_id: 'g4' })).snapshot.sites, []);

  const materializationTrace = (change, badChoice) => [
    write('party_materialization_runs', `trace:${change}`, {
      run_id: `trace:${change}`, g4_id: 'g4', run_kind: 'expansion', occurrence: 0,
      seed_digest: digest('seed'), input_digest: digest(change), catalog_digest: digest('catalog'),
      materializer_version: '1', rng_version: 'mulberry32_v1', result_digest: digest('proposal'),
      idempotency_key: change, status: 'committed', validation_report: { status: 'pass' },
      trace: { trigger: 'frontier_resolution', created_change_set_id: change },
      created_refs: [{ entity_kind: 'g5_site', entity_id: `generated:${change}` }] }),
    ...[0, 1].map((choice_ordinal) => write('party_materialization_choices', `trace:${change}:${choice_ordinal}`, {
      run_id: `trace:${change}`, choice_ordinal, slot_key: choice_ordinal === 0 ? 'slot:terminal_length' : 'slot',
      candidate_set_digest: digest(['a', 'b']), candidate_ids: ['a', 'b'], selected_id: 'b',
      rng_draw: badChoice && choice_ordinal === 1 ? null : 4294967295 - choice_ordinal }))
  ];
  const generate = async (change, badChoice = false) => plan(change, {
    appends: materializationTrace(change, badChoice),
    inserts: [write('party_g5_sites', `generated:${change}`, {
      id: `generated:${change}`, origin: 'generated', parent_g4_id: 'g4',
      canonical_g5_ref: null, generated_template_ref: ref('template'), expansion_slot_ref: ref('slot'),
      source_frontier_id: 'f0', generation_ordinal: 0, direction_context_id: 'outward',
      continuation_chain_id: 'chain', continuation_ordinal: 0, status: 'active', state_version: 1,
      created_change_set_id: change, updated_change_set_id: change }),
    ...sceneRows(`generated:${change}`, change).map((row) => row.target_table === 'party_scene_baselines'
      ? { ...row, record: { ...row.record, materialization_trace_id: `trace:${change}` } } : row),
    ...ordinaryRows(`generated:${change}`, change),
    write('party_npcs', `npc:${change}`, { npc_id: `npc:${change}`,
      run_id: `trace:${change}`, profile_set_id: 'approved-profile', profile_level: 'scene',
      identity_state: { name: 'Местный житель' }, machine_state: {}, semantic_state: {} }),
    write('party_npc_spatial_schedules', `schedule:${change}`, { id: `schedule:${change}`,
      npc_id: `npc:${change}`, current_position_node_id: `pos:generated:${change}`,
      schedule_profile_ref: ref('approved-schedule'), dependency_pins: { pins: [] },
      causal_state_ref: ref('initial-presence'), status: 'active', state_version: 1,
      next_transition_at_whole_minutes: 60, next_transition_at_subminute_numerator: 0,
      next_transition_at_subminute_denominator: 1, updated_change_set_id: change }),
    frontierBinding(`f1:${change}`, `generated:${change}`, change),
    frontier(`f1:${change}`, `generated:${change}`, 1, change),
    write('g5_site_connections', `connection:${change}`, { id: `connection:${change}`,
      from_site_id: 'source', to_site_id: `generated:${change}`, passage_type_id: 'path',
      transition_environment_profile_ref: ref('environment'), movement_orientation_profile_ref: ref('orientation'),
      cost_kind: 'action', action_units: 1, status: 'active', state_version: 1,
      created_change_set_id: change, updated_change_set_id: change }),
    ...['from', 'to'].map((role) => {
      const site = role === 'from' ? 'source' : `generated:${change}`;
      return write('party_site_connection_endpoint_bindings', `endpoint:${role}:${change}`, {
        id: `endpoint:${role}:${change}`, site_connection_id: `connection:${change}`, endpoint_role: role,
        g5_site_id: site, position_id: `pos:${site}`, source_slot_key: 'entry', status: 'active',
        state_version: 1, activated_change_set_id: change });
    }),
    write('expansion_capacity_reservations', `reservation:${change}`, {
      id: `reservation:${change}`, g4_id: 'g4', profile_ref: ref('profile'), slot_ref: ref('slot'),
      selected_template_ref: ref('template'), frontier_id: 'f0', idempotency_record_id: `idem:${change}`,
      status: 'consumed', expires_at: '2030-01-01T00:00:00.000Z', state_version: 1,
      terminal_change_set_id: change })],
    updates: [ledger(change), write('scene_frontier_bindings', 'binding:f0', {
      id: 'binding:f0', status: 'inactive', deactivated_change_set_id: change
    }), write('expansion_frontiers', 'f0', {
      id: 'f0', status: 'consumed', resolution_kind: 'generated_site',
      resolved_site_connection_id: `connection:${change}`, resolved_boundary_entity_id: null,
      resolved_change_set_id: change })],
    versions: [{ target_table: 'party_g4_expansion_ledgers', id: 'p:g4:profile', state_version: 1 },
      { target_table: 'expansion_frontiers', id: 'f0', state_version: 1 },
      { target_table: 'scene_frontier_bindings', id: 'binding:f0', state_version: 1 }]
  });
  const failedGeneration = await committer.commit({ plan: await generate('rollback-generation', true) });
  assert.equal(failedGeneration.ok, false);
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_materialization_runs')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_materialization_choices')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_npc_spatial_schedules')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_npcs')).rows[0].count, '0');
  for (const table of ['party_ordinary_materialization_aggregates', 'party_ordinary_materialization_contexts',
    'party_ordinary_materialization_basis_catalog', 'party_ordinary_materialization_enablements', 'party_resource_nodes']) {
    assert.equal((await pool.query(`SELECT count(*) FROM party_runtime.${table}`)).rows[0].count, '0', table);
  }
  assert.equal((await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' })).snapshot.sites.length, 1);
  assert.equal((await pool.query("SELECT count(*) FROM party_runtime.party_command_idempotency WHERE id='idem:rollback-generation'")).rows[0].count, '0');
  const candidates = await Promise.all(['generation-a', 'generation-b'].map((change) => generate(change)));
  const outcomes = await Promise.all(candidates.map((value) => committer.commit({ plan: value })));
  assert.equal(outcomes.filter((value) => value.ok).length, 1, JSON.stringify(outcomes));
  assert.equal(outcomes.find((value) => !value.ok).error.code, 'state_version_conflict');
  const reloaded = await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' });
  assert.equal(reloaded.snapshot.sites.filter((row) => row.origin === 'generated').length, 1);
  assert.equal(reloaded.snapshot.reservations.length, 1);
  assert.equal(reloaded.snapshot.frontiers.filter((row) => row.status === 'open').length, 1);
  assert.equal(reloaded.snapshot.ledgers[0].state_version, 2);
  assert.equal(reloaded.snapshot.bindings.filter((row) => row.status === 'active').length, 1);
  assert.equal(reloaded.snapshot.site_connections.length, 1);
  assert.equal(reloaded.snapshot.endpoint_bindings.length, 2);
  assert.equal(reloaded.snapshot.scene_baselines.length, 2);
  assert.equal(reloaded.snapshot.g6_instances.length, 2);
  assert.equal(reloaded.snapshot.scene_positions.length, 2);
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_site_connection_endpoint_bindings')).rows[0].count, '2');
  const winner = candidates[outcomes.findIndex((value) => value.ok)];
  assert.equal((await committer.commit({ plan: winner })).replay, true);
  const schedules = (await pool.query(`SELECT s.npc_id,s.current_position_node_id,s.state_version,
    s.status,s.next_transition_at_whole_minutes FROM party_runtime.party_npc_spatial_schedules s
    JOIN party_runtime.party_npcs n ON n.party_id=s.party_id AND n.npc_id=s.npc_id
    JOIN party_runtime.scene_position_nodes p ON p.party_id=s.party_id AND p.id=s.current_position_node_id`)).rows;
  assert.deepEqual(schedules, [{ npc_id: `npc:${winner.change_set_id}`,
    current_position_node_id: `pos:generated:${winner.change_set_id}`, state_version: '1',
    status: 'active', next_transition_at_whole_minutes: '60' }]);
  for (const table of ['party_ordinary_materialization_aggregates', 'party_ordinary_materialization_contexts',
    'party_ordinary_materialization_basis_catalog', 'party_ordinary_materialization_enablements', 'party_resource_nodes']) {
    assert.equal((await pool.query(`SELECT count(*) FROM party_runtime.${table} WHERE party_id='p'`)).rows[0].count, '1', table);
  }
  assert.deepEqual((await pool.query(`SELECT quantity_numerator,quantity_denominator,state_version,lifecycle_state
    FROM party_runtime.party_resource_nodes WHERE party_id='p'`)).rows,
  [{ quantity_numerator: '4', quantity_denominator: '1', state_version: '1', lifecycle_state: 'active' }]);
  const persistedRuns = (await pool.query('SELECT run_id,status,trace FROM party_runtime.party_materialization_runs')).rows;
  assert.equal(persistedRuns.length, 1);
  assert.equal(persistedRuns[0].status, 'committed');
  assert.equal(persistedRuns[0].trace.created_change_set_id, winner.change_set_id);
  const persistedChoices = (await pool.query('SELECT choice_ordinal,candidate_ids,selected_id,rng_draw FROM party_runtime.party_materialization_choices ORDER BY choice_ordinal')).rows;
  assert.deepEqual(persistedChoices, [
    { choice_ordinal: 0, candidate_ids: ['a', 'b'], selected_id: 'b', rng_draw: '4294967295' },
    { choice_ordinal: 1, candidate_ids: ['a', 'b'], selected_id: 'b', rng_draw: '4294967294' }
  ]);
  assert.equal((await committer.prepareExpansion({ party_id: 'p', g4_id: 'g4',
    idempotency_key: winner.idempotency_key, canonical_input_digest: winner.canonical_input_digest,
    prepare: () => assert.fail('committed expansion must replay before preparing again') })).replay, true);
  assert.equal((await committer.prepareExpansion({ party_id: 'p', g4_id: 'g4',
    idempotency_key: winner.idempotency_key, canonical_input_digest: digest('different-input'),
    prepare: () => assert.fail('changed replay input must be rejected') })).error.code, 'idempotency_conflict');
  await pool.query(`INSERT INTO party_runtime.party_command_idempotency
    (id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,
     status,terminal_failure_code,terminal_failure_digest,created_at_turn,finalized_at_turn)
    VALUES ('failed-expansion','p','resolve_frontier','failed-expansion',$1,$1,
      'failed_terminal','terminal_target_gap','failure',0,1)`, [digest('failed-expansion').replace('sha256:', '')]);
  const failedReplay = await committer.prepareExpansion({ party_id: 'p', g4_id: 'g4',
    idempotency_key: 'failed-expansion', canonical_input_digest: digest('failed-expansion'),
    prepare: () => assert.fail('terminal failure must replay before any preparation or CAS') });
  assert.equal(failedReplay.terminal, true);
  assert.equal(failedReplay.error.code, 'terminal_target_gap');
  await pool.query(`INSERT INTO party_runtime.party_command_idempotency
    (id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,
     status,lease_token,lease_expires_at,created_at_turn)
    VALUES ('leased-expansion','p','resolve_frontier','leased-expansion',$1,$1,
      'leased','other-owner',NOW() + INTERVAL '1 hour',0)`, [digest('leased-expansion').replace('sha256:', '')]);
  const leasedReplay = await committer.prepareExpansion({ party_id: 'p', g4_id: 'g4',
    idempotency_key: 'leased-expansion', canonical_input_digest: digest('leased-expansion'),
    prepare: () => assert.fail('unexpired lease must reject before any preparation or CAS') });
  assert.equal(leasedReplay.in_progress, true);
  assert.equal(leasedReplay.error.code, 'idempotency_conflict');
  const loser = candidates[outcomes.findIndex((value) => !value.ok)];
  assert.equal((await pool.query('SELECT count(*) FROM party_runtime.party_command_idempotency WHERE id=$1',
    [loser.idempotency_record_id])).rows[0].count, '0');
  const locked = await Promise.all(['locked-a', 'locked-b'].map((id) => committer.prepareExpansion({
    party_id: 'p', g4_id: 'g4', idempotency_key: id, canonical_input_digest: digest(id),
    prepare: async ({ transaction }) => {
      const current = await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' }, { transaction });
      return { ok: true, plan: await plan(id, { updates: [ledger(id)], versions: [
        { target_table: 'party_g4_expansion_ledgers', id: 'p:g4:profile',
          state_version: current.snapshot.ledgers[0].state_version }] }) };
    }
  })));
  assert.equal(locked.every((result) => result.ok), true, JSON.stringify(locked));
  assert.equal((await repository.loadExpansionState({ party_id: 'p', g4_id: 'g4' })).snapshot.ledgers[0].state_version, 4);
});
