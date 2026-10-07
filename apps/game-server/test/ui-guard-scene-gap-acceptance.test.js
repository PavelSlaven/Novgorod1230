import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createHttpHandler } from '../src/http/handler.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { projectVisibleContextForPlayerPackage } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { fixture, loadScenarioBundle, SCENE_PRESENTATION } from
  './lower-dvina-trace-phase-2-fixture.js';
import LIVE_WORLD_TURN_PROFILE from
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };

const gapCode = 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP';
const gapReason = 'player_safe_visible_scene_required';
const routeId = 'exit:scene-gap-woods';
const connectionId = 'connection:scene-gap-courtyard';

// Only SQL transport is replaced. P16 owns BEGIN/ROLLBACK and derives its
// not_started proof; the test never manufactures that proof for real rollback.
function expansionPool({ rollbackFails = false } = {}) {
  const statements = [];
  let released = 0;
  return { statements, released: () => released, async connect() {
    return { async query(input) {
      const sql = typeof input === 'string' ? input : input.text;
      statements.push(sql);
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('offline rollback failed');
      if (['BEGIN', 'ROLLBACK'].includes(sql)
        || sql.includes('WITH ordered_locks AS MATERIALIZED')
        || sql.includes('SELECT canonical_input_digest,status,result_change_set_id')) {
        return { rows: [], rowCount: 0 };
      }
      assert.fail(`unexpected expansion SQL: ${sql}`);
    }, release() { released += 1; } };
  } };
}

async function send(handler, body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { method: 'POST',
    url: '/api/v1/parties/party%3Atrace-phase-2/turns',
    headers: { host: 'localhost', 'x-request-id': body.request_id } });
  const response = { writeHead(status) { this.status = status; },
    end(value) { this.body = JSON.parse(value); } };
  await handler(request, response);
  return response;
}

async function crossing({ kind = 'exit', rejectedScene = undefined,
  rollbackFails = false, preparedError = null, committed = false } = {}) {
  const bundle = await loadScenarioBundle(13);
  const current = structuredClone(fixture({ scenarioBundle: bundle,
    materializationBundle: bundle }).state);
  current.scenario_id = 'authored:unseen-scene-gap';
  current.current_spatial_context = {
    visible_scene: SCENE_PRESENTATION.locations.find(({ location_ref }) =>
      location_ref === 'trace_ld_v1_loc_wreck_shore').display_name,
    sensory_details: [], visible_objects: [], known_context: []
  };
  current.current_spatial_context_is_fresh = true;
  current.current_spatial_context_filters_entities = false;
  const pool = expansionPool({ rollbackFails });
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool });
  let preparationCalls = 0, traversalCalls = 0, projected = false, outcome;
  const prepare = async ({ partyId, actorId, requestId }) => {
    preparationCalls += 1;
    if (committed) return { ok: true, replay: true, change_set_id: 'already-committed' };
    if (preparedError) return { ok: false, error: structuredClone(preparedError) };
    outcome = await committer.prepareExpansion({ party_id: partyId,
      g4_id: 'g4:scene-gap', idempotency_key: requestId,
      canonical_input_digest: computeSpatialV3CanonicalDigest({ partyId, actorId, requestId }),
      prepare: async () => {
        projected = true;
        projectVisibleContextForPlayerPackage({ version: 1,
          schema: 'visible_context_package', visible_scene: rejectedScene,
          visible_changes: [], sensory_details: [], visible_npc: [],
          visible_objects: [], known_context: [], uncertainties: [] },
        { requireScene: true });
        assert.fail('rejected scene reached topology preparation');
      } });
    return outcome;
  };
  const traverse = async () => {
    traversalCalls += 1;
    // A typed scene failure AFTER topology commit must retain the existing
    // topology_committed movement-denied envelope rather than "not saved".
    projectVisibleContextForPlayerPackage({ version: 1,
      schema: 'visible_context_package', visible_scene: '',
      visible_changes: [], sensory_details: [], visible_npc: [],
      visible_objects: [], known_context: [], uncertainties: [] },
    { requireScene: true });
    assert.fail('unexpected traversal');
  };
  const selectedId = kind === 'exit' ? routeId : connectionId;
  const f = fixture({ committedState: current,
    authoredTurnProfile: { profile: LIVE_WORLD_TURN_PROFILE, pin: {
      artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
      revision: LIVE_WORLD_TURN_PROFILE.revision,
      digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE) } },
    spatialExpansionRuntime: {
      listApproachOptions: async () => [],
      listExpansionOptions: async () => kind === 'exit'
        ? [{ directional_exit_id: routeId, display_label: 'Пройти по лесной тропе.' }] : [],
      listConnectionOptions: async () => kind === 'connection'
        ? [{ connection_binding_id: connectionId, display_label: 'Пройти в соседний двор.' }] : [],
      listConnectionApproachOptions: async () => [],
      prepareExpansion: prepare, prepareConnection: prepare,
      prepareTraversal: traverse, prepareConnectionTraversal: traverse
    },
    turnStepModel(request) {
      const selected = request.available_domain_operations.find(({ route_ref }) =>
        route_ref === selectedId);
      assert.ok(selected, 'real expansion command must be available to the workflow');
      return { schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: 'пройти дальше', grounded_attempt: 'пройти по видимому пути',
          adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [selected], check: null, continuation: null,
        clarification: null, direct_result_kind: null,
        reason_code: 'approved_exit', reason: 'Follow the supplied visible passage.' };
    }
  });
  const baseline = structuredClone(f.state);
  let failure;
  const handler = createHttpHandler({ root: { async submitTurn(partyId, input) {
    try { return await f.runtime.submitTurn({ partyId, input }); }
    catch (error) { failure = error; throw error; }
  } } });
  const response = await send(handler, { raw_text: 'Иду дальше.',
    request_id: 'scene-gap-crossing', idempotency_key: 'scene-gap-crossing' });
  assert.equal(preparationCalls, 1, 'failure must come from the crossing preparation');
  assert.equal(f.turnStepCount(), 1, 'production semantic workflow must run');
  assert.equal(f.commitCount(), 0);
  assert.deepEqual(f.state, baseline, 'position, clock, turn number and all state remain unchanged');
  assert.equal(f.narratorInput(), null);
  assert.equal(traversalCalls, committed ? 1 : 0);
  assert.equal(response.status, 409);
  assert.equal(response.body.ok, false);
  assert.doesNotMatch(JSON.stringify(response.body),
    /SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP|player_safe_visible_scene_required|INFERENCE:|stack|offline rollback/u);
  if (!preparedError && !committed) {
    assert.equal(projected, true);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.code, gapCode);
    assert.equal(outcome.error.diagnostics.reason, gapReason);
    assert.equal(outcome.error.diagnostics.turn_commit_status, rollbackFails ? undefined : 'not_started');
    assert.deepEqual(pool.statements.filter((sql) => /^(BEGIN|ROLLBACK|COMMIT)$/u.test(sql)),
      ['BEGIN', 'ROLLBACK']);
    assert.equal(pool.released(), 1);
  }
  return { failure, response };
}

for (const kind of ['exit', 'connection']) {
  for (const rejectedScene of [undefined, 'INFERENCE: private scene draft']) {
    test(`#530: ${kind}, ${rejectedScene === undefined ? 'missing' : 'unsafe'} scene, confirmed rollback preserves the public world-data refusal`, async () => {
      const { failure, response } = await crossing({ kind, rejectedScene });
      assert.equal(failure.code, gapCode, 'crossingCommand must preserve the typed scene gap');
      assert.equal(failure.details?.reason ?? failure.details?.diagnostics?.reason, gapReason);
      assert.equal(failure.turn_commit_status, 'not_started');
      assert.deepEqual(response.body.error, { code: 'WORLD_ACTION_UNAVAILABLE',
        message: 'Ход не сохранён. Для этого действия не хватает данных мира.',
        turn_commit_status: 'not_started' });
    });
  }
}

test('#530: failed real ROLLBACK keeps the generic expansion refusal', async () => {
  const { failure, response } = await crossing({ rollbackFails: true });
  assert.equal(failure.code, 'LIVE_WORLD_EXPANSION_PREPARATION_FAILED');
  assert.equal(failure.details.diagnostics.turn_commit_status, undefined);
  assert.equal(response.body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
});

for (const preparedError of [
  { code: gapCode, diagnostics: { reason: gapReason } },
  { code: gapCode, diagnostics: { reason: 'another_scene_gap', turn_commit_status: 'not_started' } },
  { code: 'spatial_candidate_gap', diagnostics: { reason: gapReason, turn_commit_status: 'not_started' } }
]) test(`#530: generic wrapper retains ${preparedError.code}/${preparedError.diagnostics.reason}/${preparedError.diagnostics.turn_commit_status ?? 'unconfirmed'}`, async () => {
  const { failure, response } = await crossing({ preparedError });
  assert.equal(failure.code, 'LIVE_WORLD_EXPANSION_PREPARATION_FAILED');
  assert.deepEqual(failure.details, preparedError);
  assert.equal(response.body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
});

test('#530: scene failure after committed topology retains topology_committed movement denial', async () => {
  const { failure, response } = await crossing({ committed: true });
  assert.equal(failure.code, 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED');
  assert.equal(failure.cause.code, gapCode);
  assert.equal(failure.turn_commit_status, 'topology_committed');
  assert.deepEqual(response.body.error, {
    code: 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED',
    message: 'Подготовка пути сохранена. Переход не состоялся: персонаж остался на месте, время не изменилось.',
    turn_commit_status: 'topology_committed', topology_status: 'topology_committed',
    movement_status: 'movement_denied', actor_moved: false, time_advanced: false
  });
});
