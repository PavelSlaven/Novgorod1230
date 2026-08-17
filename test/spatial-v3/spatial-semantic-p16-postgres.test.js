import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder,
  resolveAuthoredSpatialSemanticRemainder, validateSpatialSemanticResolution } from
  '@rus/materialization/internal/lower-dvina-trace-s1';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialSemanticAuthorityRepository } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-authority-repository.js';
import { createSpatialSemanticFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys,
  spatialSemanticReservationRef, spatialSemanticTraceActionRef } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { loadSpatialSemanticCommittedState } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-readback.js';
import { validSpatialSemanticExtension } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-write-plan-validation.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../../apps/game-server/src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { createLowerDvinaTraceS1ProductionResolverFactory,
  projectLowerDvinaTraceS1Capability } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js';

const docker = (args) => spawnSync('docker', args,
  { encoding: 'utf8', timeout: 60_000 });
const container = `spatial-semantic-${process.pid}`;
const hex = 'd'.repeat(64);

test('S1 authority and resolution use one replay-safe combined P16 transaction',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    let pool;
    t.after(async () => {
      if (pool) await pool.end();
      docker(['rm', '-f', container]);
    });
    const started = docker(['run', '-d', '--name', container,
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=s1',
      '-e', 'POSTGRES_USER=s1', '-e', 'POSTGRES_DB=s1',
      'postgres:16-alpine']);
    assert.equal(started.status, 0, started.stderr);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      await new Promise((done) => setTimeout(done, 250));
      if (docker(['exec', container, 'pg_isready', '-U', 's1', '-d', 's1'])
        .status === 0) break;
      if (attempt === 49) assert.fail('PostgreSQL not ready');
    }
    await new Promise((done) => setTimeout(done, 750));
    const port = Number(docker(['port', container, '5432/tcp']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool = new Pool({ host: '127.0.0.1', port, user: 's1', password: 's1',
      database: 's1', max: 4 });
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
    await pool.query(SPATIAL_V3_TARGET_MIGRATIONS.at(-1));
    await provisionSpatialScope(pool);

    const loadedProfile = await loadLowerDvinaTraceSpatialSemanticProfile();
    const provisioner = createSpatialSemanticFirstEntryProvisioner({ loadedProfile });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await provisioner.provision({ transaction: client,
        partyId: 'party-s1', firstEntryBinding: {
          g6_instance_id: 'g6-s1', position_id: 'position-s1' },
        changeSetId: 'fixture-s1' });
      assert.equal(result.provisioned, true);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    assert.deepEqual((await pool.query(`SELECT DISTINCT created_change_set_id
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id='party-s1'`)).rows,
    [{ created_change_set_id: 'fixture-s1' }]);
    const baselineBefore = (await pool.query(`SELECT to_jsonb(b) AS row
      FROM party_runtime.party_scene_baselines b
      WHERE party_id='party-s1' AND id='baseline-s1'`)).rows[0].row;
    const authority = createSpatialSemanticAuthorityRepository({ pool });
    const capacityBeforeProposal = (await pool.query(`SELECT capacity
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id='party-s1' AND envelope_ref=$1`,
    [loadedProfile.profile.envelopes[0].envelope_ref])).rows[0].capacity;
    const proposed = await authority.acquireOrReuseReservation({
      party_id: 'party-s1',
      envelope_ref: loadedProfile.profile.envelopes[0].envelope_ref,
      reservation_ref: 'reservation:proposal-retry', change_set_id: null });
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.party_spatial_semantic_reservations
      WHERE party_id='party-s1' AND reservation_ref='reservation:proposal-retry'`))
      .rows[0].count, 1);
    assert.notDeepEqual((await pool.query(`SELECT capacity
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id='party-s1' AND envelope_ref=$1`,
    [loadedProfile.profile.envelopes[0].envelope_ref])).rows[0].capacity,
    capacityBeforeProposal);
    assert.deepEqual(await authority.acquireOrReuseReservation({
      party_id: 'party-s1',
      envelope_ref: loadedProfile.profile.envelopes[0].envelope_ref,
      reservation_ref: 'reservation:proposal-retry', change_set_id: null }), proposed);
    assert.deepEqual(await authority.releaseReservation({ party_id: 'party-s1',
      reservation_ref: 'reservation:proposal-retry' }), { released: true });
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.party_spatial_semantic_reservations
      WHERE party_id='party-s1' AND reservation_ref='reservation:proposal-retry'`))
      .rows[0].count, 0);
    assert.deepEqual((await pool.query(`SELECT capacity
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id='party-s1' AND envelope_ref=$1`,
    [loadedProfile.profile.envelopes[0].envelope_ref])).rows[0].capacity,
    capacityBeforeProposal);
    const authoredEntry = loadedProfile.profile.envelopes[0];
    const crashReservationRef = spatialSemanticReservationRef({
      partyId: 'party-s1', rootTurnId: 'turn:request:one', stepIndex: 1,
      envelopeRef: authoredEntry.envelope_ref });
    await authority.acquireOrReuseReservation({ party_id: 'party-s1',
      envelope_ref: authoredEntry.envelope_ref,
      reservation_ref: crashReservationRef, change_set_id: null });
    let modelCalls = 0;
    const createResolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool, loadedProfile, spatialSemanticModel: async () => {
        modelCalls += 1;
        throw new Error('authored S1 must not call the model');
      } });
    const firstState = { position: { position_id: 'position-s1' },
      spatial_semantic: await loadSpatialSemanticCommittedState(pool, 'party-s1') };
    const firstPlayerSafe = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [] }, committedState: firstState,
      loadedProfile, resolverAvailable: true });
    assert.equal(firstPlayerSafe.spatial_semantic.envelope_ref,
      authoredEntry.envelope_ref);
    assert.equal(firstPlayerSafe.spatial_semantic.pending_reservation_ref,
      undefined);
    const firstOperation = { op: 'request_discovery', actor_ref: 'actor:s1',
      discovery_kind: 'look', target_refs: ['position-s1'],
      query: 'осмотреть место' };
    const firstApprovedPlan = { schema: 'turn_step_plan_v1',
      request_id: 'request:one',
      operations: [structuredClone(firstOperation)] };
    const foreignOperation = { ...firstOperation, query: 'чужой retry' };
    await assert.rejects(createResolver({ partyId: 'party-s1' })({
      operation: foreignOperation,
      plan: { schema: 'turn_step_plan_v1',
        operations: [structuredClone(foreignOperation)] },
      request: { request_id: 'request:foreign', root_turn_id: 'turn:foreign',
        step_index: 1, committed_state_version: '0',
        player_safe_state: firstPlayerSafe }, actor: { actor_id: 'actor:s1' },
      working_projection: {}, committed_state: { party_state: {
      turn_number: 0 } } }), { code: 'S1_SPATIAL_CAPACITY_EXHAUSTED' });
    assert.equal(modelCalls, 0);
    const applied = await createResolver({ partyId: 'party-s1' })({
      operation: firstOperation, plan: firstApprovedPlan,
      request: { request_id: 'request:one', root_turn_id: 'turn:request:one',
        step_index: 1, committed_state_version: '0',
        player_safe_state: firstPlayerSafe },
      actor: { actor_id: 'actor:s1' }, working_projection: {},
      committed_state: { party_state: { turn_number: 0 } } });
    assert.equal(modelCalls, 0);
    const firstPlan = { atomic: applied.spatial_semantic_atomic_write_plan,
      approvedPlan: firstApprovedPlan, operation: firstOperation };
    const firstReservationRef = firstPlan.atomic.reservation_pin.row.reservation_ref;
    assert.equal((await pool.query(`SELECT reserved_at_change_set_id
      FROM party_runtime.party_spatial_semantic_reservations
      WHERE party_id='party-s1' AND reservation_ref=$1`,
    [firstReservationRef])).rows[0].reserved_at_change_set_id, null);
    await assert.rejects(authority.acquireOrReuseReservation({
      party_id: 'party-s1', envelope_ref: authoredEntry.envelope_ref,
      reservation_ref: 'reservation:capacity-race', change_set_id: null }),
    { code: 'S1_SPATIAL_CAPACITY_EXHAUSTED' });

    const firstCombined = await combinedPlan(firstPlan);
    const committer = combinedCommitter(pool);
    const firstCommit = await committer.commit({ plan: firstCombined });
    assert.equal(firstCommit.ok, true, JSON.stringify(firstCommit));
    assert.deepEqual(await committer.commit({ plan: firstCombined }), {
      ok: true, replay: true, change_set_id: firstPlan.atomic.change_set_id });
    let rows = (await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-s1') AS party_version,
      (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
       WHERE party_id='party-s1') AS resolutions,
      (SELECT status FROM party_runtime.party_spatial_semantic_reservations
       WHERE party_id='party-s1' AND reservation_ref=$1) AS status`,
    [firstReservationRef])).rows[0];
    assert.deepEqual(rows, { party_version: 1, resolutions: 1,
      status: 'committed_consumed' });
    const reloaded = await loadSpatialSemanticCommittedState(pool, 'party-s1');
    assert.deepEqual(reloaded.find(({ resolution }) => resolution != null)
      .resolution.semantics.description, authoredEntry.allowed_descriptors[0].description);
    assert.deepEqual((await pool.query(`SELECT to_jsonb(b) AS row
      FROM party_runtime.party_scene_baselines b
      WHERE party_id='party-s1' AND id='baseline-s1'`)).rows[0].row,
    baselineBefore);

    const naturalEntry = loadedProfile.profile.envelopes[1];
    const naturalState = { position: { position_id: 'position-s1' },
      spatial_semantic: await loadSpatialSemanticCommittedState(pool, 'party-s1') };
    const naturalPlayerSafe = projectLowerDvinaTraceS1Capability({
      playerSafeState: {}, committedState: naturalState, loadedProfile,
      resolverAvailable: true });
    assert.equal(naturalPlayerSafe.spatial_semantic.envelope_ref,
      naturalEntry.envelope_ref);
    const modelMarker = structuredClone(naturalPlayerSafe);
    delete modelMarker.spatial_semantic.authored_descriptor_ref;
    const naturalCapacityBefore = (await pool.query(`SELECT capacity
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id='party-s1' AND envelope_ref=$1`,
    [naturalEntry.envelope_ref])).rows[0].capacity;
    let failedModelCalls = 0;
    for (const [requestId, model] of [
      ['request:model-throws', async () => { failedModelCalls += 1;
        throw new Error('synthetic model failure'); }],
      ['request:model-invalid', async () => { failedModelCalls += 1; return {}; }]
    ]) {
      const failingResolver = createLowerDvinaTraceS1ProductionResolverFactory({
        pool, loadedProfile, spatialSemanticModel: model })({ partyId: 'party-s1' });
      const operation = { ...firstOperation, query: requestId };
      await assert.rejects(failingResolver({ operation,
        plan: { schema: 'turn_step_plan_v1',
          operations: [structuredClone(operation)] },
        request: { request_id: requestId, root_turn_id: `turn:${requestId}`,
          step_index: 1, committed_state_version: '1',
          player_safe_state: modelMarker }, actor: { actor_id: 'actor:s1' },
        working_projection: {}, committed_state: { party_state: {
          turn_number: 1 } } }));
      const reservationRef = spatialSemanticReservationRef({
        partyId: 'party-s1', rootTurnId: `turn:${requestId}`, stepIndex: 1,
        envelopeRef: naturalEntry.envelope_ref });
      assert.equal((await pool.query(`SELECT count(*)::int AS count
        FROM party_runtime.party_spatial_semantic_reservations
        WHERE party_id='party-s1' AND reservation_ref=$1`,
      [reservationRef])).rows[0].count, 0);
      assert.deepEqual((await pool.query(`SELECT capacity
        FROM party_runtime.party_spatial_semantic_envelopes
        WHERE party_id='party-s1' AND envelope_ref=$1`,
      [naturalEntry.envelope_ref])).rows[0].capacity, naturalCapacityBefore);
    }
    assert.equal(failedModelCalls, 2);
    let unblockModel; let signalModel;
    const modelEntered = new Promise((resolve) => { signalModel = resolve; });
    const modelGate = new Promise((resolve) => { unblockModel = resolve; });
    let concurrentModelCalls = 0;
    const concurrentResolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool, loadedProfile, spatialSemanticModel: async (request) => {
        concurrentModelCalls += 1; signalModel(); await modelGate;
        return { schema: 'rus.s1_spatial_semantic_proposal.v1',
          request_id: request.request_id, kind: request.allowed_kind,
          descriptor_ref: request.allowed_descriptors[0].descriptor_ref,
          movement_effect: 'none', hazard_effect: 'none' };
      } })({ partyId: 'party-s1' });
    const concurrentCall = (requestId) => {
      const operation = { ...firstOperation, query: requestId };
      return concurrentResolver({ operation,
        plan: { schema: 'turn_step_plan_v1',
          operations: [structuredClone(operation)] },
        request: { request_id: requestId, root_turn_id: `turn:${requestId}`,
          step_index: 1, committed_state_version: '1',
          player_safe_state: modelMarker }, actor: { actor_id: 'actor:s1' },
        working_projection: {}, committed_state: { party_state: {
          turn_number: 1 } } });
    };
    const firstConcurrent = concurrentCall('request:concurrent-one');
    await modelEntered;
    await assert.rejects(concurrentCall('request:concurrent-two'),
      { code: 'S1_SPATIAL_CAPACITY_EXHAUSTED' });
    unblockModel();
    const concurrentResult = await firstConcurrent;
    assert.equal(concurrentModelCalls, 1);
    assert.deepEqual(await authority.releaseReservation({ party_id: 'party-s1',
      reservation_ref: concurrentResult.spatial_semantic_atomic_write_plan
        .reservation_pin.row.reservation_ref }), { released: true });
    await pool.query(`UPDATE party_runtime.party_g6_instances
      SET source_scene_template_ref=$1::jsonb
      WHERE party_id='party-s1' AND id='g6-s1'`, [JSON.stringify({
      entity_ref: { entity_kind: 'scene_template', entity_id: 'drifted-template' },
      authoring_version: '1' })]);
    let driftModelCalls = 0;
    const driftResolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool, loadedProfile, spatialSemanticModel: async () => {
        driftModelCalls += 1;
        return {};
      } })({ partyId: 'party-s1' });
    const driftOperation = { ...firstOperation, query: 'оглядеться ещё раз' };
    await assert.rejects(driftResolver({ operation: driftOperation,
      plan: { schema: 'turn_step_plan_v1',
        operations: [structuredClone(driftOperation)] },
      request: { request_id: 'request:drift', root_turn_id: 'turn:drift',
        step_index: 1, committed_state_version: '1',
        player_safe_state: naturalPlayerSafe }, actor: { actor_id: 'actor:s1' },
      working_projection: {}, committed_state: { party_state: {
        turn_number: 1 } } }), { code: 'S1_SPATIAL_SCOPE_STALE' });
    assert.equal(driftModelCalls,0);
    await pool.query(`UPDATE party_runtime.party_g6_instances
      SET source_scene_template_ref=$1::jsonb
      WHERE party_id='party-s1' AND id='g6-s1'`, [JSON.stringify({
      entity_ref: { entity_kind: 'scene_template',
        entity_id: 'trace_ld_v1_tpl_wreck_shore' }, authoring_version: '1' })]);
    let naturalModelCalls = 0;
    const naturalResolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool, loadedProfile, spatialSemanticModel: async () => {
        naturalModelCalls += 1;
        throw new Error('singleton S1 descriptor must not call the model');
      } })({ partyId: 'party-s1' });
    const naturalOperation = { ...firstOperation, query: 'осмотреть тростник' };
    const naturalApprovedPlan = { schema: 'turn_step_plan_v1',
      request_id: 'request:two',
      operations: [structuredClone(naturalOperation)] };
    const naturalResolverInput = () => ({ operation: structuredClone(naturalOperation),
      plan: naturalApprovedPlan,
      request: { request_id: 'request:two', root_turn_id: 'turn:request:two',
        step_index: 1, committed_state_version: '1',
        player_safe_state: naturalPlayerSafe }, actor: { actor_id: 'actor:s1' },
      working_projection: {}, committed_state: { party_state: {
        turn_number: 1 } } });
    const naturalApplied = await naturalResolver(naturalResolverInput());
    assert.equal(naturalModelCalls, 0);
    let secondPlan = { atomic: naturalApplied.spatial_semantic_atomic_write_plan,
      approvedPlan: naturalApprovedPlan, operation: naturalOperation };
    const secondReservationRef = secondPlan.atomic.reservation_pin.row.reservation_ref;
    let secondCombined = await combinedPlan(secondPlan);
    await pool.query(`UPDATE party_runtime.scene_position_nodes
      SET state_version=state_version+1
      WHERE party_id='party-s1' AND id='position-s1'`);
    const stale = await committer.commit({ plan: secondCombined });
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'state_version_conflict');
    await pool.query(`UPDATE party_runtime.scene_position_nodes SET state_version=0
      WHERE party_id='party-s1' AND id='position-s1'`);

    const afterStale = await naturalResolver(naturalResolverInput());
    secondPlan = { atomic: afterStale.spatial_semantic_atomic_write_plan,
      approvedPlan: naturalApprovedPlan, operation: naturalOperation };
    secondCombined = await combinedPlan(secondPlan);

    const lateCombined = await combinedPlan(secondPlan, { missingClock: true });
    const late = await committer.commit({ plan: lateCombined });
    assert.equal(late.ok, false);
    rows = (await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-s1') AS party_version,
      (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
       WHERE party_id='party-s1') AS resolutions,
      (SELECT status FROM party_runtime.party_spatial_semantic_reservations
       WHERE party_id='party-s1' AND reservation_ref=$1) AS status`,
    [secondReservationRef])).rows[0];
    assert.deepEqual(rows, { party_version: 1, resolutions: 1,
      status: null });

    const afterLate = await naturalResolver(naturalResolverInput());
    secondPlan = { atomic: afterLate.spatial_semantic_atomic_write_plan,
      approvedPlan: naturalApprovedPlan, operation: naturalOperation };
    secondCombined = await combinedPlan(secondPlan);
    assert.equal((await committer.commit({ plan: secondCombined })).ok, true);
    const collision = structuredClone(secondCombined);
    collision.visible_package_envelope.visible_payload.perceived_scene = 'Подмена.';
    collision.visible_package_envelope.package_digest = digest(
      collision.visible_package_envelope.visible_payload);
    collision.write_plan_digest = digest({ collision: true });
    const collided = await committer.commit({ plan: collision });
    assert.equal(collided.ok, false);
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM
      party_runtime.party_spatial_semantic_resolutions
      WHERE party_id='party-s1'`)).rows[0].count, 2);
  });

function semanticPlan(acquired, { requestId, changeSetId, partyVersion,
  descriptorRef, authored = false }) {
  const operation = { op: 'request_discovery', actor_ref: 'actor:s1',
    discovery_kind: 'look', target_refs: ['position-s1'], query: 'осмотреть место' };
  const approvedPlan = { schema: 'turn_step_plan_v1', request_id: requestId,
    operations: [operation] };
  const rootTurnId = `turn:${requestId}`;
  const actionRef = spatialSemanticTraceActionRef({ rootTurnId, stepIndex: 1,
    approvedPlan });
  const prepared = prepareSpatialSemanticRemainder({
    schema: 'rus.s1_spatial_semantic_request.v1', request_id: requestId,
    causal_request_ref: actionRef, party_id: 'party-s1', need: 'perception',
    reservation: acquired.reservation });
  const resolution = authored
    ? resolveAuthoredSpatialSemanticRemainder({ prepared,
      authored_semantics: { kind: acquired.reservation.envelope.kind,
        descriptor_ref: descriptorRef } })
    : admitSpatialSemanticRemainder({ prepared, proposal: {
      schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: requestId,
      kind: acquired.reservation.envelope.kind, descriptor_ref: descriptorRef,
      movement_effect: 'none', hazard_effect: 'none' } });
  validateSpatialSemanticResolution(resolution);
  return { atomic: createSpatialSemanticAtomicWritePlan({
    schema: 'spatial_semantic_atomic_write_request_v1', party_id: 'party-s1',
    base_party_state_version: partyVersion, change_set_id: changeSetId,
    causal_identity: { request_id: requestId, root_turn_id: rootTurnId,
      action_ref: actionRef, step_index: 1, actor_ref: 'actor:s1',
      operation_digest: digest(operation) },
    envelope_pin: acquired.envelope_pin, reservation_pin: acquired.reservation_pin,
    resolution }), approvedPlan, operation };
}

async function combinedPlan(input, { missingClock = false } = {}) {
  const { atomic, approvedPlan } = input;
  const requestId = atomic.causal_identity.request_id;
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: 'Замечена местная деталь.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: 's1-test' }, version_pin: {
    pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const updates = [{ target_table: 'parties', id: 'party-s1', record: {
    party_id: 'party-s1', profile_bundle_digest: 'profiles' } },
  ...(missingClock ? [{ target_table: 'party_clocks', id: 'party-s1', record: {
    party_id: 'party-s1', whole_minutes: 1, subminute_numerator: 0,
    subminute_denominator: 1, clock_owner_kind: 'party', clock_owner_id: null,
    updated_change_set_id: atomic.change_set_id } }] : [])];
  const expected = [{ target_table: 'parties', id: 'party-s1',
    state_version: atomic.base_party_state_version },
  ...(missingClock ? [{ target_table: 'party_clocks', id: 'party-s1',
    state_version: 1 }] : [])];
  const built = await buildCombinedWritePlan({ plan_id: `plan:${requestId}`,
    party_id: 'party-s1', write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_turn_step', canonical_input_digest: digest({ requestId }),
    expected_state_versions: expected, validation_report: { status: 'pass',
      digest: `sha256:${hex}` }, idempotency: { id: `idem:${requestId}`,
      key: requestId, request_id: requestId,
      semantic_command_snapshot: { schema:
        'rus.lower_dvina_trace_turn_step_command_snapshot.v1', semantic_trace: {
        step_traces: [{ step_index: 1, approved_plan: approvedPlan }] } },
      semantic_command_digest: digest({ approvedPlan }),
      semantic_dependency_pins: { pins: [] } },
    change_set: { id: atomic.change_set_id }, visible_package_envelope: {
      package_id: `visible:${requestId}`, party_id: 'party-s1',
      turn_id: atomic.causal_identity.root_turn_id,
      committed_state_version: String(atomic.base_party_state_version + 1),
      change_set_id: atomic.change_set_id, package_digest: digest(payload),
      visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'projection-v1' }, authoring_version: '1' },
      dependency_pins: { pins,
        canonical_digest: digest(pins).replace('sha256:', '') },
      idempotency_record_id: `idem:${requestId}` },
    approved_write_sets: [{ inserts: [], updates,
      appends: [{ target_table: 'party_v3_change_sets', id: atomic.change_set_id,
        record: { id: atomic.change_set_id, party_id: 'party-s1',
          operation_kind: 'trace_turn_step',
          idempotency_record_id: `idem:${requestId}` } }] }],
    lock_context: { owner_keys: ['actor:actor:s1'], execution_keys: [], g4_keys: [],
      physical_keys: [`party_runtime.party_v3_change_sets:${atomic.change_set_id}`,
        'party_runtime.parties:party-s1',
        ...(missingClock ? ['party_runtime.party_clocks:party-s1'] : []),
        ...spatialSemanticPhysicalKeys(atomic)] },
    spatial_semantic_atomic_write_plan: atomic,
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity',
      'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${hex}` }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  assert.equal(validSpatialSemanticExtension(built.plan), true,
    JSON.stringify({ owner_keys: built.plan.owner_keys,
      physical_keys: built.plan.physical_keys,
      semantic_command_snapshot: built.plan.semantic_command_snapshot,
      spatial: built.plan.spatial_semantic_atomic_write_plan }));
  return built.plan;
}

function combinedCommitter(pool) {
  return createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    now: () => new Date('2030-01-01T00:00:00Z'),
    recheck: async () => ({ ok: true })
  });
}

async function provisionSpatialScope(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest,state_version)
    VALUES ('party-s1',2,'world','catalog','materializer','rng','commands',
      'profiles',0)`);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('fixture-s1','party-s1','fixture',$1,'[]'::jsonb,$1,$1,0,0)`,
  ['f'.repeat(64)]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('g5-s1','party-s1','canonical','g4',$1::jsonb,'active',0,
      'fixture-s1','fixture-s1')`, [JSON.stringify({ entity_id: 'g5-s1' })]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline-s1','party-s1','g5_site','g5-s1','canonical_template',
      $1::jsonb,'trace','m','c','active',0,'fixture-s1','fixture-s1')`,
  [JSON.stringify({ entity_ref: { entity_kind: 'scene_template',
    entity_id: 'trace_ld_v1_tpl_wreck_shore' }, authoring_version: '1' })]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('g6-s1','party-s1','baseline-s1',$1::jsonb,'main','g5_site',
      'g5-s1','exterior','shore','ground','open','default_clear','near',
      'uniform','active',0,'fixture-s1','fixture-s1')`,
  [JSON.stringify({ entity_ref: { entity_kind: 'scene_template',
    entity_id: 'trace_ld_v1_tpl_wreck_shore' }, authoring_version: '1' })]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('position-s1','party-s1','g6-s1','scene_position','shore',0,8,
      'public','active',0,'fixture-s1','fixture-s1')`);
}
