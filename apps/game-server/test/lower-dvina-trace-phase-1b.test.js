import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFirstPlayablePublicRuntime
} from '../src/runtime/first-playable-public-runtime.js';
import {
  loadLowerDvinaTracePhase1BPublication,
  TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION,
  TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID,
  TRACE_PHASE_1B_SESSION_IDENTITIES
} from '../src/internal/lower-dvina-trace-phase-1b-publication.js';
import {
  buildLowerDvinaTraceOpeningScreen
} from '../src/runtime/lower-dvina-trace-opening.js';
import { hash } from '../src/runtime/first-playable/shared.js';
import {
  canonicalDigest,
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';

const release = Object.freeze({
  release_id: 'phase-1b-test-release',
  world_revision_id: 'novgorod_spatial_v3_production_v3_candidate_001',
  world_catalog_digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
});
const runtimeCatalogPin = Object.freeze({
  catalog_revision_id: 'phase-1b-test-catalog'
});

test('Phase 1B publishes trace beside unchanged boatman metadata', async () => {
  const runtime = createRuntime(fixture());
  const catalog = await runtime.listScenarios();
  assert.deepEqual(catalog.scenarios, [
    {
      scenario_id: 'lower_dvina_late_summer_open_water_v1',
      title: 'Нижняя Двина: позднее лето',
      description:
        'Лодочник на защищённой высокой площадке у открытой воды.',
      available: true
    },
    {
      scenario_id: 'lower_dvina_trace_v1',
      title: 'След на Нижней Двине',
      description:
        'Младший приказчик приходит в себя после крушения на Нижней Двине.',
      available: true
    }
  ]);
});

test('trace dispatch commits before its safe screen', async () => {
  const f = fixture();
  const runtime = createRuntime(f);
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-1b-public-start'
  });
  assert.equal(f.materializeCalls.length, 1);
  assert.equal(f.repository.createInitialCalls, 0);
  assert.equal(f.events.join('>'),
    'loadSession>loadInternal>materialize>loadInternal>loadVisible>project>attach>loadSession');
  assert.equal(started.screen.schema, 'first_game_screen');
  assert.equal(started.screen.screen_status, 'ready');
  assert.equal(started.screen.panels.character.data.name, 'Микула');
  assert.deepEqual(started.screen.action_panel.suggested_actions, []);
  assert.equal(started.party_id, f.materializeCalls[0].party_id);
  assert.equal(
    f.materializeCalls[0].world_revision_id,
    release.world_revision_id
  );
  assert.equal(
    f.materializeCalls[0].materializer_version,
    TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION
  );
  assert.equal(f.materializeCalls[0].scenario_definition_revision, 16);
  assert.equal(
    f.materializeCalls[0].rng_algorithm_id,
    TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID
  );
  const session = f.repository.sessions.get(started.party_id);
  assert.equal(session.stage26_result.publication_binding_id,
    'lower_dvina_trace_phase_1b_publication_v11');
  assert.equal(session.stage26_result.publication_binding_revision, 11);
  assert.equal(session.stage26_result.scenario_definition_revision, 16);
  assert.equal(session.stage26_result.materializer_binding_id,
    'lower_dvina_trace_phase_1a_materialization_bindings_v12');
  const serialized = JSON.stringify(started);
  for (const forbidden of [
    'hidden_truth',
    'culprit',
    'motive',
    'hidden_sequence',
    'sealed_selections',
    'clue_placements',
    'lies_and_statements',
    'materialization_trace'
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, 'u'));
});

test('boatman and baseline dispatch preserve the existing creator', async () => {
  const f = fixture();
  const runtime = createRuntime(f);
  const boatman = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'boatman-unchanged'
  });
  const baseline = await runtime.startNewGame({
    start_text: 'Начать путь',
    request_id: 'baseline-unchanged'
  });
  assert.equal(f.repository.createInitialCalls, 2);
  assert.equal(f.materializeCalls.length, 0);
  assert.equal(boatman.screen.schema, 'first_game_screen');
  assert.equal(baseline.screen.schema, 'first_game_screen');
  await assert.rejects(
    () => runtime.startNewGame({
      scenario_id: 'unknown_scenario',
      request_id: 'unknown'
    }),
    { code: 'SCENARIO_NOT_SUPPORTED' }
  );
  assert.equal(f.repository.createInitialCalls, 2);
  assert.equal(f.materializeCalls.length, 0);
});

test('new-game identity rejects trace and boatman reuse in both orders', async () => {
  for (const [label, firstInput, secondInput] of [
    [
      'trace-to-boatman',
      { scenario_id: 'lower_dvina_trace_v1' },
      { scenario_id: 'lower_dvina_late_summer_open_water_v1' }
    ],
    [
      'boatman-to-trace',
      { scenario_id: 'lower_dvina_late_summer_open_water_v1' },
      { scenario_id: 'lower_dvina_trace_v1' }
    ],
    [
      'baseline-to-boatman',
      { start_text: 'Начать путь' },
      { scenario_id: 'lower_dvina_late_summer_open_water_v1' }
    ],
    [
      'boatman-to-baseline',
      { scenario_id: 'lower_dvina_late_summer_open_water_v1' },
      { start_text: 'Начать путь' }
    ]
  ]) {
    const f = fixture();
    const runtime = createRuntime(f);
    await runtime.startNewGame({
      ...firstInput,
      request_id: `creation-identity-${label}`
    });
    await assert.rejects(
      () => runtime.startNewGame({
        ...secondInput,
        request_id: `creation-identity-${label}`
      }),
      { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
    );
    assert.equal(f.repository.sessions.size, 1);
  }
});

test('non-trace party sharing the materializer version bypasses trace validation', async () => {
  const f = fixture();
  const partyId = 'party:other-materialized-scenario';
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: partyId
  };
  f.repository.sessions.set(partyId, {
    request_id: 'other-materialized-scenario',
    stage26_result: null,
    delivery_attempt: { status: 'sent' },
    delivery_ack_result: null,
    screen,
    turn_number: 0,
    last_turn_id: null,
    state_version: 1,
    party_materializer_version: MATERIALIZER_VERSION,
    party_scenario_manifest_digest: 'f'.repeat(64),
    party_snapshot_schema: 'rus.other_scenario_snapshot.v1'
  });
  assert.deepEqual(
    await createRuntime(f).getPartyScreen(partyId),
    { party_id: partyId, turn_number: 0, screen }
  );
});

test('new-game identity rejects changed normalized start input', async () => {
  const f = fixture();
  const runtime = createRuntime(f);
  await runtime.startNewGame({
    start_text: 'Начать путь',
    player_name: 'Путник',
    request_id: 'changed-start-input'
  });
  await assert.rejects(
    () => runtime.startNewGame({
      start_text: 'Начать другой путь',
      player_name: 'Путник',
      request_id: 'changed-start-input'
    }),
    { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
  );
  await assert.rejects(
    () => runtime.startNewGame({
      start_text: 'Начать путь',
      player_name: 'Другой путник',
      request_id: 'changed-start-input'
    }),
    { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
  );
});

test('trace recovery rehydrates Phase 1A and attaches one stable session', async () => {
  const f = fixture({ failFirstAttach: true });
  const runtime = createRuntime(f);
  const request = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'session-recovery'
  };
  await assert.rejects(
    () => runtime.startNewGame(request),
    { code: 'SIMULATED_SESSION_FAILURE' }
  );
  assert.equal(f.repository.sessions.size, 0);
  const replayed = await runtime.startNewGame(request);
  assert.equal(f.materializeCalls.length, 1);
  assert.equal(f.materializeStatuses.join(','), 'committed');
  assert.equal(f.repository.sessions.size, 1);
  assert.equal(replayed.screen.panels.character.data.name, 'Микула');
});

test('historical Phase 1A commits recover through their pinned publications', async (t) => {
  for (const [revision, historical] of TRACE_PHASE_1B_SESSION_IDENTITIES
    .slice(0, -1).entries()) {
    await t.test(`v${revision + 1}`, async () => {
      const requestId = `historical-phase-1a-v${revision + 1}-orphan`;
      const partyId = `party:${hash(requestId).slice(0, 24)}`;
      const historicalPublication = await loadLowerDvinaTracePhase1BPublication({
        phase1AManifestDigest: historical.phase_1a_manifest_digest
      });
      const f = fixture({
        committedRequest: {
          party_id: partyId,
          scenario_id: 'lower_dvina_trace_v1',
          scenario_definition_revision: historical.scenario_definition_revision,
          scenario_manifest_digest: historical.phase_1a_manifest_digest,
          world_revision_id: release.world_revision_id,
          world_catalog_digest: release.world_catalog_digest,
          world_compatibility: structuredClone(
            historicalPublication.binding.world_compatibility
          ),
          materializer_version: TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION,
          rng_algorithm_id: TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID,
          seed_context: historicalPublication.binding.execution_identity.seed_context,
          idempotency_key: `new-game:lower_dvina_trace_v1:${hash(requestId)}`,
          trigger: 'new_game',
          occurrence: 0,
          existing_party_state: { baseline_exists: false }
        }
      });
      const started = await createRuntime(f).startNewGame({
        scenario_id: 'lower_dvina_trace_v1',
        request_id: requestId
      });
      const session = f.repository.sessions.get(partyId);
      assert.equal(f.materializeCalls.length, 0);
      assert.equal(
        session.stage26_result.publication_binding_id,
        historical.publication_binding_id
      );
      assert.equal(
        session.stage26_result.scenario_definition_revision,
        historical.scenario_definition_revision
      );
      assert.equal(started.screen.panels.character.data.name, 'Микула');
    });
  }
});

test('trace replay bypasses publication', async () => {
  const f = fixture();
  const first = createRuntime(f);
  const request = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'historical-session-replay'
  };
  const started = await first.startNewGame(request);
  const historical = TRACE_PHASE_1B_SESSION_IDENTITIES.find(
    (identity) => identity.publication_binding_revision === 8);
  assert.equal(historical.publication_binding_revision, 8);
  assert.equal(historical.scenario_definition_revision, 13);
  const historicalSession = f.repository.sessions.get(started.party_id);
  Object.assign(historicalSession.stage26_result, historical);
  historicalSession.party_scenario_manifest_digest =
    historical.phase_1a_manifest_digest;
  const materializeCalls = f.materializeCalls.length;
  f.publicationLoader = async () => {
    throw error('CURRENT_PUBLICATION_REVISION_CHANGED');
  };
  f.adapter.materialize = async () => {
    throw error('HISTORICAL_PARTY_MUST_NOT_REMATERIALIZE');
  };
  const replayed = await createRuntime(f).startNewGame(request);
  assert.deepEqual(replayed, started);
  assert.equal(f.materializeCalls.length, materializeCalls);
  assert.equal(f.repository.sessions.size, 1);
});

test('restart reads persisted trace screen and requires the Phase 2 dependency', async () => {
  const f = fixture();
  const first = createRuntime(f);
  const started = await first.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'restart-safe'
  });
  await first.acknowledgeOpening(started.party_id, {
    client_ack_id: 'ack-restart'
  });
  const callsBeforeRestart = f.materializeCalls.length;
  const restarted = createRuntime(f);
  const restored = await restarted.getPartyScreen(started.party_id);
  assert.deepEqual(restored.screen, started.screen);
  assert.equal(f.materializeCalls.length, callsBeforeRestart);
  await assert.rejects(
    () => restarted.submitTurn(started.party_id, {
      raw_text: 'Осматриваюсь'
    }),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  const session = f.repository.sessions.get(started.party_id);
  assert.equal(session.turn_number, 0);
  assert.equal(session.delivery_ack_result.client_ack_id, 'ack-restart');
});

test('restart rejects tampered trace screen and session identity', async () => {
  for (const [label, mutate] of [
    [
      'screen',
      (session) => {
        session.screen.main_prose = 'Подменённый экран';
      }
    ],
    [
      'identity',
      (session) => {
        session.stage26_result.publication_binding_digest =
          '0'.repeat(64);
      }
    ],
    [
      'mixed historical publication revision',
      (session) => {
        session.stage26_result.publication_binding_revision = 7;
      }
    ],
    [
      'mixed historical definition revision',
      (session) => {
        session.stage26_result.scenario_definition_revision = 12;
      }
    ],
    [
      'scenario marker',
      (session) => {
        session.stage26_result.scenario_id =
          'lower_dvina_late_summer_open_water_v1';
      }
    ],
    [
      'resealed public prose',
      (session) => {
        session.screen.main_prose = 'Иная безопасная проза';
        session.delivery_attempt.screen_digest =
          canonicalDigest(session.screen);
      }
    ],
    [
      'resealed player name',
      (session) => {
        session.screen.panels.character.data.name = 'Другой приказчик';
        session.delivery_attempt.screen_digest =
          canonicalDigest(session.screen);
      }
    ],
    [
      'resealed body value',
      (session) => {
        session.screen.panels.character.data.health -= 1;
        session.delivery_attempt.screen_digest =
          canonicalDigest(session.screen);
      }
    ],
    [
      'resealed hidden screen',
      (session) => {
        session.screen.hidden_truth = { culprit: 'Жданко' };
        session.delivery_attempt.screen_digest =
          canonicalDigest(session.screen);
      }
    ]
  ]) {
    const f = fixture();
    const runtime = createRuntime(f);
    const started = await runtime.startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: `restart-tamper-${label}`
    });
    mutate(f.repository.sessions.get(started.party_id));
    await assert.rejects(
      () => createRuntime(f).getPartyScreen(started.party_id),
      { code: 'TRACE_PHASE_1B_SESSION_READ_INVALID' },
      label
    );
  }
});

test('historical trace reads use publication pins, not current globals', async () => {
  const source = await readFile(
    new URL('../src/runtime/lower-dvina-trace-session.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /\b(?:MATERIALIZER_VERSION|RNG_VERSION)\b/u
  );
  const f = fixture();
  const runtime = createRuntime(f);
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'historical-execution-read'
  });
  const session = f.repository.sessions.get(started.party_id);
  session.simulated_current_execution_versions = {
    materializer_version: 'code_materializer_v3',
    rng_algorithm_id: 'future_rng_v2'
  };
  assert.deepEqual(
    (await runtime.getPartyScreen(started.party_id)).screen,
    started.screen
  );
});

test('unsupported publication execution pin blocks before materialization', async () => {
  const publication = structuredClone(
    await loadLowerDvinaTracePhase1BPublication()
  );
  publication.binding.execution_identity.materializer_version =
    'code_materializer_v3';
  const f = fixture({
    publicationLoader: async () => publication
  });
  await assert.rejects(
    () => createRuntime(f).startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'unsupported-execution-pin'
    }),
    { code: 'TRACE_PHASE_1B_EXECUTION_VERSION_UNSUPPORTED' }
  );
  assert.equal(f.materializeCalls.length, 0);
});

test('acknowledgement rejects a tampered trace marker before mutation', async () => {
  const f = fixture();
  const runtime = createRuntime(f);
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'ack-tampered-marker'
  });
  const session = f.repository.sessions.get(started.party_id);
  session.stage26_result.scenario_id =
    'lower_dvina_late_summer_open_water_v1';
  await assert.rejects(
    () => runtime.acknowledgeOpening(started.party_id, {
      client_ack_id: 'must-not-commit'
    }),
    { code: 'TRACE_PHASE_1B_SESSION_READ_INVALID' }
  );
  assert.equal(session.delivery_ack_result, null);
});

test('first acknowledgement is immutable and exact replay performs no write', async () => {
  const f = fixture();
  const runtime = createRuntime(f);
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'immutable-ack'
  });
  const first = await runtime.acknowledgeOpening(started.party_id, {
    client_ack_id: 'ack-stable'
  });
  const repeated = await runtime.acknowledgeOpening(started.party_id, {
    client_ack_id: 'ack-stable'
  });
  assert.deepEqual(repeated, first);
  assert.equal(f.repository.ackWriteCalls, 1);
  await assert.rejects(
    () => runtime.acknowledgeOpening(started.party_id, {
      client_ack_id: 'ack-conflict'
    }),
    { code: 'OPENING_ACK_IDENTITY_CONFLICT' }
  );
  assert.equal(f.repository.ackWriteCalls, 1);
  assert.equal(
    f.repository.sessions.get(started.party_id)
      .delivery_ack_result.client_ack_id,
    'ack-stable'
  );
});

test('projection leak or failed materialization creates no session', async () => {
  const failed = fixture({ materializeError: error('STAGE25_FAILED') });
  await assert.rejects(
    () => createRuntime(failed).startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'failed-stage-25'
    }),
    { code: 'STAGE25_FAILED' }
  );
  assert.equal(failed.repository.sessions.size, 0);

  const leaked = fixture({ visibleExtra: { hidden_truth: { culprit: 'x' } } });
  await assert.rejects(
    () => createRuntime(leaked).startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'leaked-visible'
    }),
    { code: 'TRACE_PHASE_1B_VISIBLE_STATE_HIDDEN_LEAK' }
  );
  assert.equal(leaked.repository.sessions.size, 0);

  const invalidScreen = fixture({
    projectorOverride: () => ({ schema: 'wrong_screen' })
  });
  await assert.rejects(
    () => createRuntime(invalidScreen).startNewGame({
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'invalid-presentation'
    }),
    { code: 'TRACE_PHASE_1B_OPENING_SCREEN_INVALID' }
  );
  assert.equal(invalidScreen.repository.sessions.size, 0);
});

function createRuntime(f) {
  return createFirstPlayablePublicRuntime({
    partyPool: { connect() {} },
    committer: { commit() {} },
    release,
    runtimeCatalogPin,
    idFactory: () => 'fixed-id',
    now: () => '2026-07-29T00:00:00.000Z',
    traceStartAdapter: f.adapter,
    publicationLoader:
      f.publicationLoader ?? loadLowerDvinaTracePhase1BPublication,
    traceOpeningProjector(input) {
      f.events.push('project');
      return f.projector(input);
    },
    partyRepository: f.repository
  });
}

function fixture({
  failFirstAttach = false,
  materializeError = null,
  visibleExtra = {},
  projectorOverride = null,
  publicationLoader = null,
  committedRequest = null
} = {}) {
  const sessions = new Map();
  const events = [];
  const materializeCalls = [];
  const materializeStatuses = [];
  let lastRequest = committedRequest
    ? structuredClone(committedRequest)
    : null;
  let attachFailures = failFirstAttach ? 1 : 0;
  const repository = {
    sessions,
    createInitialCalls: 0,
    ackWriteCalls: 0,
    async assertNewGameCreationIdentity({
      partyId,
      creationIdentity
    }) {
      const current = sessions.get(partyId);
      if (!current) return;
      const stored = current.stage26_result?.creation_identity
        ?? current.creation_identity;
      if (JSON.stringify(stored) !== JSON.stringify(creationIdentity)) {
        throw error('NEW_GAME_CREATION_IDENTITY_CONFLICT');
      }
    },
    async createInitial({ state, screen }) {
      this.createInitialCalls += 1;
      const current = sessions.get(state.party_id);
      if (current) {
        if (JSON.stringify(current.creation_identity)
          !== JSON.stringify(state.creation_identity)) {
          throw error('NEW_GAME_CREATION_IDENTITY_CONFLICT');
        }
        return;
      }
      sessions.set(state.party_id, {
        request_id: state.request_id,
        creation_identity: structuredClone(state.creation_identity),
        screen,
        turn_number: 0,
        stage26_result: null,
        delivery_ack_result: null,
        party_materializer_version: 'first-playable-materializer@1',
        party_scenario_manifest_digest: 'boatman-content-digest',
        party_snapshot_schema: state.schema
      });
    },
    async attachCommittedOpeningSession(input) {
      events.push('attach');
      if (attachFailures > 0) {
        attachFailures -= 1;
        throw error('SIMULATED_SESSION_FAILURE');
      }
      const current = sessions.get(input.partyId);
      const next = {
        request_id: input.requestId,
        stage26_result: structuredClone(input.sessionIdentity),
        delivery_attempt: structuredClone(input.deliveryAttempt),
        delivery_ack_result: current?.delivery_ack_result ?? null,
        screen: structuredClone(input.screen),
        turn_number: 0,
        last_turn_id: null,
        state_version: 1,
        party_materializer_version: lastRequest.materializer_version,
        party_rng_algorithm_id: lastRequest.rng_algorithm_id,
        party_scenario_manifest_digest:
          lastRequest.scenario_manifest_digest,
        party_snapshot_schema:
          'rus.lower_dvina_trace_initial_party_snapshot.v2'
      };
      if (current && JSON.stringify(current.screen)
        !== JSON.stringify(next.screen)) {
        throw error('TRACE_PHASE_1B_SESSION_IDENTITY_CONFLICT');
      }
      sessions.set(input.partyId, next);
    },
    async loadSession(partyId) {
      events.push('loadSession');
      const value = sessions.get(partyId);
      if (!value) throw error('PARTY_NOT_FOUND');
      return structuredClone(value);
    },
    async acknowledgeOpening({ partyId, clientAckId, acknowledgedAt }) {
      const value = sessions.get(partyId);
      if (value.delivery_ack_result != null) {
        if (value.delivery_ack_result.client_ack_id === clientAckId) {
          return structuredClone(value.delivery_ack_result);
        }
        throw error('OPENING_ACK_IDENTITY_CONFLICT');
      }
      this.ackWriteCalls += 1;
      const result = {
        pass: true,
        client_ack_id: clientAckId,
        acknowledged_at: acknowledgedAt
      };
      value.delivery_ack_result = result;
      return structuredClone(result);
    }
  };
  const visible = {
    party_id: null,
    player: {
      character_id: 'player-1',
      name: 'Микула',
      social_status: {
        social_role_id: 'nov_role_merchant_clerk',
        occupation_id: 'nov_occ_merchant_clerk',
        display_name: 'младший приказчик'
      }
    },
    position: {
      g4_id: 'g4-wreck',
      g5_node_id: 'g5-wreck',
      g5_anchor_id: 'anchor-wreck'
    },
    timestamp: {
      whole_minutes: '333060',
      subminute_numerator: '0',
      subminute_denominator: '1'
    },
    body: {
      profile_ref: {},
      health: 80,
      energy: 40,
      satiety: 60
    },
    environment: {
      environment_profile_id: 'trace_ld_v1_env_cold_wet_shore',
      facts: ['cold', 'wet', 'exposed']
    },
    ...visibleExtra
  };
  const adapter = {
    assertExecutionSupport(executionIdentity) {
      if (executionIdentity?.materializer_version
          !== MATERIALIZER_VERSION
        || executionIdentity.rng_algorithm_id !== RNG_VERSION) {
        throw error('TRACE_PHASE_1B_EXECUTION_VERSION_UNSUPPORTED');
      }
    },
    async materialize(request) {
      events.push('materialize');
      if (materializeError) throw materializeError;
      lastRequest = structuredClone(request);
      materializeCalls.push(lastRequest);
      const status = materializeCalls.length === 1
        ? 'committed'
        : 'replayed';
      materializeStatuses.push(status);
      return { status };
    },
    async loadInternal(partyId) {
      events.push('loadInternal');
      return {
        party_id: partyId,
        request_identity: structuredClone(lastRequest)
      };
    },
    async loadVisible(partyId) {
      events.push('loadVisible');
      return { ...structuredClone(visible), party_id: partyId };
    }
  };
  return {
    adapter,
    events,
    materializeCalls,
    materializeStatuses,
    publicationLoader,
    repository,
    projector: projectorOverride
      ?? (({ visible: value, approvedProjection }) =>
      buildLowerDvinaTraceOpeningScreen({
        visible: value,
        approvedProjection
      }))
  };
}

function error(code) {
  return Object.assign(new Error(code), { code, status: 409 });
}
