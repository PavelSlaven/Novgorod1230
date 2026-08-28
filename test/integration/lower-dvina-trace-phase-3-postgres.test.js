import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
import { addElapsedTime } from '@rus/time-events-history';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import {
  createLowerDvinaTracePublicRuntime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import {
  createLowerDvinaTracePhase2Runtime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import {
  createM2ConversationModels
} from '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import {
  createLowerDvinaTraceTurnStepTestModel
} from '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
import {
  createLowerDvinaTracePhase1BProductionAdapter
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import {
  createLowerDvinaTracePhase2PostgresRepository
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  createLowerDvinaTracePhase2DurableNarrator
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { digestRunIdentity } from
  '../../apps/game-server/src/infrastructure/postgres/party-store-turn.js';
import {
  firstPlayableCommitRecheck
} from '../../apps/game-server/src/runtime/releases/spatial-v3-production-binding-shared.js';
import {
  loadLowerDvinaTraceMaterializationBundle
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import {
  runPartyRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { installLowerDvinaTraceV5World, lowerDvinaTraceV5World as world } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

const docker = (args) => spawnSync(
  'docker', args, { encoding: 'utf8', timeout: 45_000 }
);

test('Phase 3 PostgreSQL semantic conversation persists and survives restart', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 3 PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-3-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=phase3',
    '-e', 'POSTGRES_DB=phase3',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const port = Number(
    docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]
  );
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'phase3',
    password: 'local_only',
    database: 'phase3',
    max: 8
  });
  await installSchemas(pool);
  await installLowerDvinaTraceV5World(pool);
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 9
  });
  const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({
    ...sourcePin,
    compatible_world_revision_id: world.revision,
    compatible_world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      world.manifest
  });
  const release = Object.freeze({
    release_id: 'phase-3-postgres-release',
    world_revision_id: world.revision,
    world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });

  const pathA = buildRuntime({
    pool, release, runtimeCatalogPin
  });
  const partyA = await createParty(pathA, 'phase-3-path-a');
  await pathA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-inspection',
    idempotency_key: 'phase-3-a-inspection',
    raw_text: 'Осмотреть место крушения подробно.'
  });
  const movedA = await pathA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-move',
    idempotency_key: 'phase-3-a-move',
    raw_text: 'Дойти до рыбацкого стана.'
  });
  assert.equal(movedA.option_id, 'follow_path_to_fishing_camp');
  assert.equal(movedA.movement.result.elapsed_minutes, 8);
  assert.equal(movedA.check, null);
  assert.equal(await count(pool,
    'party_runtime.party_route_plans', partyA.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_route_plan_executions', partyA.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.traveller_travel_states', partyA.party_id), 1);
  assert.equal(await traversalIntervalCount(pool, partyA.party_id), 1);
  assert.equal(await traversalLifecycleCount(pool, partyA.party_id), 4);
  const firstTalk = await pathA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk',
    idempotency_key: 'phase-3-a-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.deepEqual(firstTalk.conversation.semantic_exchange, {
    response_kind: 'withhold',
    npc_utterance: 'Нечего мне больше сказать.',
    disclosed_route_ref: null
  });
  assert.equal(firstTalk.time_update.exact_elapsed.exact_minutes.numerator,
    '5');
  assert.equal(await count(pool,
    'party_runtime.party_conversation_sessions', partyA.party_id), 1);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyA.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_contributions', partyA.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyA.party_id), 1);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', partyA.party_id), 1);
  assert.equal(await knowledgeCount(pool, partyA.party_id,
    'trace_ld_v1_route_camp_to_shed'), 0);

  const restartedA = buildRuntime({ pool, release, runtimeCatalogPin });
  const restoredA = await restartedA.getPartyScreen(partyA.party_id);
  assert.deepEqual(restoredA.screen, firstTalk.screen);
  const replayA = await restartedA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk',
    idempotency_key: 'phase-3-a-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.deepEqual(replayA, firstTalk);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyA.party_id), 2);
  const repeatedTalk = await restartedA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk-repeat',
    idempotency_key: 'phase-3-a-talk-repeat',
    raw_text: 'Ещё раз спросить Еремея о крушении.'
  });
  assert.deepEqual(repeatedTalk.conversation.semantic_exchange, {
    response_kind: 'withhold',
    npc_utterance: 'Нечего мне больше сказать.',
    disclosed_route_ref: null
  });
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyA.party_id), 4);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_contributions', partyA.party_id), 4);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', partyA.party_id), 2);

  const pathB = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: () => 0.99
  });
  const partyB = await createParty(pathB, 'phase-3-path-b');
  const inspectedB = await inspectAndMove(pathB, partyB.party_id, 'b');
  const ownership = await blueWoolOwnership(pool, partyB.party_id);
  assert.deepEqual(ownership.owner_external_ref, {
    entity_kind: 'participant_slot',
    entity_id: 'ratsha_storehouse_helper'
  });
  assert.equal(ownership.controller_character_id,
    inspectedB.clue.placement.holder_character_id);
  assert.equal(ownership.claim_state, 'owner_preserved_evidence_held');
  const positionBefore = await positionFor(pool, partyB.party_id);
  const disclosureInput = {
    request_id: 'phase-3-b-disclosure',
    idempotency_key: 'phase-3-b-disclosure',
    raw_text: 'Показать Еремею синюю шерсть.'
  };
  const disclosed = await pathB.submitTurn(partyB.party_id, disclosureInput);
  assert.equal(disclosed.check.outcome.success, true);
  assert.deepEqual(disclosed.conversation.semantic_exchange, {
    response_kind: 'route_disclosure',
    npc_utterance: 'От лагеря иди к старой сушильне по тропе.',
    disclosed_route_ref: 'trace_ld_v1_route_camp_to_shed'
  });
  assert.equal(disclosed.time_update.exact_elapsed.exact_minutes.numerator,
    '10');
  assert.deepEqual(await positionFor(pool, partyB.party_id), positionBefore);
  assert.equal(await knowledgeCount(pool, partyB.party_id,
    'trace_ld_v1_route_camp_to_shed'), 1);
  const disclosureStatement = (await pool.query(
    `SELECT statement_id
       FROM party_runtime.party_conversation_statements
      WHERE party_id=$1
        AND interaction_tags @> '["route_disclosure"]'::jsonb`,
    [partyB.party_id]
  )).rows;
  assert.equal(disclosureStatement.length, 1);
  assert.deepEqual((await pool.query(
    `SELECT knowledge_state,evidence
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1 AND fact_id='trace_ld_v1_route_camp_to_shed'`,
    [partyB.party_id]
  )).rows, [{
    knowledge_state: 'known_from_committed_source',
    evidence: [disclosureStatement[0].statement_id]
  }]);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyB.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyB.party_id), 1);
  const postDisclosureTalk = await pathB.submitTurn(partyB.party_id, {
    request_id: 'phase-3-b-post-disclosure-talk',
    idempotency_key: 'phase-3-b-post-disclosure-talk',
    raw_text: 'Снова спросить Еремея о крушении.'
  });
  assert.deepEqual(postDisclosureTalk.conversation.semantic_exchange, {
    response_kind: 'withhold',
    npc_utterance: 'Нечего мне больше сказать.',
    disclosed_route_ref: null
  });
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyB.party_id), 4);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', partyB.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_check_resolutions', partyB.party_id), 2);

  const restartedB = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: () => {
      throw new Error('replay must not draw RNG');
    }
  });
  assert.deepEqual(
    await restartedB.submitTurn(partyB.party_id, disclosureInput),
    disclosed
  );
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements', partyB.party_id), 4);
  await pool.query(
    `UPDATE party_runtime.party_ownership o
        SET owner_external_ref=$2::jsonb
       FROM party_runtime.party_items i
      WHERE i.party_id=o.party_id AND i.item_id=o.item_id
        AND o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyB.party_id, JSON.stringify({
      entity_kind: 'participant_slot',
      entity_id: 'eremey_fisher'
    })]
  );
  await assert.rejects(
    () => restartedB.getPartyScreen(partyB.party_id),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
  await pool.query(
    `UPDATE party_runtime.party_ownership o
        SET owner_external_ref=$2::jsonb
       FROM party_runtime.party_items i
      WHERE i.party_id=o.party_id AND i.item_id=o.item_id
        AND o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyB.party_id, JSON.stringify({
      entity_kind: 'participant_slot',
      entity_id: 'ratsha_storehouse_helper'
    })]
  );
  const tamperClient = await pool.connect();
  try {
    await tamperClient.query(
      `ALTER TABLE party_runtime.party_check_resolutions
         DISABLE TRIGGER USER`
    );
    await tamperClient.query(
      `UPDATE party_runtime.party_check_resolutions
          SET roll_value=roll_value+1
        WHERE party_id=$1
          AND check_scope_key->>'option_id'=
            'show_clue_and_seek_eremey_cooperation'`,
      [partyB.party_id]
    );
  } finally {
    await tamperClient.query(
      `ALTER TABLE party_runtime.party_check_resolutions
         ENABLE TRIGGER USER`
    );
    tamperClient.release();
  }
  await assert.rejects(
    () => restartedB.getPartyScreen(partyB.party_id),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );

  const pathC = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: (requestId) =>
      requestId === 'phase-3-c-evidence' ? 0 : 0.99
  });
  const partyC = await createParty(pathC, 'phase-3-path-c');
  await inspectAndMove(pathC, partyC.party_id, 'c');
  const guarded = await pathC.submitTurn(partyC.party_id, {
    request_id: 'phase-3-c-evidence',
    idempotency_key: 'phase-3-c-evidence',
    raw_text: 'Показать улику Еремею и попросить помочь.'
  });
  assert.equal(guarded.check.outcome.success, false);
  assert.deepEqual(guarded.conversation.semantic_exchange, {
    response_kind: 'withhold',
    npc_utterance: 'Нечего мне больше сказать.',
    disclosed_route_ref: null
  });
  assert.equal(await knowledgeCount(pool, partyC.party_id,
    'trace_ld_v1_route_camp_to_shed'), 0);
  assert.equal(
    JSON.stringify(guarded.screen).includes('must-not-reach-llm'),
    false
  );

  await assertRepeatedNpcCausalChain({
    pool,
    release,
    runtimeCatalogPin
  });

  await assertTemporalConversationRestart({
    pool, release, runtimeCatalogPin
  });

  await assertPerceptionRestartVariants({
    pool,
    release,
    runtimeCatalogPin
  });
});

async function assertRepeatedNpcCausalChain({
  pool,
  release,
  runtimeCatalogPin
}) {
  const baseModels = createM2ConversationModels({
    ratshaResponseKind: 'speech'
  });
  let eremeyRef = null;
  let responderRef = null;
  let npcCalls = 0;
  const requestIds = [];
  const conversationModels = {
    playerConversationModel: baseModels.playerConversationModel,
    async npcSemanticModel(request) {
      npcCalls += 1;
      requestIds.push(request.request_id);
      const plan = await baseModels.npcSemanticModel(request);
      const targetRef = npcCalls === 1
        ? responderRef : npcCalls === 2 ? eremeyRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer',
          target_refs: [targetRef]
        };
      }
      return plan;
    }
  };
  const runtime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    conversationModels
  });
  const party = await createParty(runtime, 'phase-3-causal-a-b-a');
  await inspectAndMove(runtime, party.party_id, 'causal-a-b-a');
  const before = await latestSnapshot(pool, party.party_id);
  eremeyRef = refForNpc(before, 'eremey_fisher');
  responderRef = refForNpc(before, 'background_fisher_1');
  const input = {
    request_id: 'phase-3-causal-a-b-a-evidence',
    idempotency_key: 'phase-3-causal-a-b-a-evidence',
    raw_text: 'Показать Еремею синюю шерсть.'
  };
  const result = await runtime.submitTurn(party.party_id, input);

  assert.equal(npcCalls, 3);
  assert.equal(new Set(requestIds).size, 3);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', party.party_id), 3);
  const persistedRequestIds = (await pool.query(
    `SELECT semantic_request->>'request_id' AS request_id
       FROM party_runtime.party_npc_decision_traces
      WHERE party_id=$1`,
    [party.party_id]
  )).rows.map(({ request_id: requestId }) => requestId);
  assert.equal(new Set(persistedRequestIds).size, 3);

  const restarted = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    conversationModels
  });
  await restarted.getPartyScreen(party.party_id);
  const replay = await restarted.submitTurn(party.party_id, input);
  assert.deepEqual(replay, result);
  assert.equal(npcCalls, 3);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', party.party_id), 3);
}

function refForNpc(state, participantSlot) {
  const npc = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === participantSlot);
  assert.ok(npc, `NPC slot ${participantSlot} must exist`);
  return { entity_kind: 'npc', entity_id: npc.instance_id };
}

async function assertPerceptionRestartVariants({
  pool,
  release,
  runtimeCatalogPin
}) {
  const variants = [
    {
      suffix: 'unheard',
      participantSlot: 'eremey_fisher',
      machinePatch: { hearing_capability: 'none' },
      expectedResult: null,
      expectedDecisionCount: 0
    },
    {
      suffix: 'partial',
      participantSlot: 'eremey_fisher',
      machinePatch: { hearing_capability: 'partial' },
      expectedResult: 'perceived_partial',
      expectedDecisionCount: 1
    },
    {
      suffix: 'unidentified',
      participantSlot: 'eremey_fisher',
      semanticPatch: { speaker_recognition: 'unidentified' },
      expectedResult: 'perceived_unidentified',
      expectedDecisionCount: 1
    },
    {
      suffix: 'partial-bystander',
      participantSlot: 'background_fisher_1',
      machinePatch: { hearing_capability: 'partial' },
      expectedResult: 'perceived_partial',
      expectedDecisionCount: 1
    }
  ];
  for (const variant of variants) {
    const runtime = buildRuntime({ pool, release, runtimeCatalogPin });
    const party = await createParty(
      runtime,
      `phase-3-perception-${variant.suffix}`
    );
    await inspectAndMove(runtime, party.party_id, variant.suffix);
    const perceiverId = await patchNpcPerceptionState(
      pool,
      party.party_id,
      variant
    );
    const patchedRuntime = buildRuntime({ pool, release, runtimeCatalogPin });
    await patchedRuntime.submitTurn(party.party_id, {
      request_id: `phase-3-${variant.suffix}-talk`,
      idempotency_key: `phase-3-${variant.suffix}-talk`,
      raw_text: 'Поговорить с Еремеем о крушении.'
    });
    assert.equal(await count(pool,
      'party_runtime.party_conversation_contributions', party.party_id),
    variant.expectedDecisionCount + 1);
    assert.equal(await count(pool,
      'party_runtime.party_npc_decision_traces', party.party_id),
    variant.expectedDecisionCount);
    const perceptionRows = (await pool.query(
      `SELECT p.perceiver_id,p.result_kind
         FROM party_runtime.party_perception_records p
         JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
        WHERE p.party_id=$1
          AND e.event_kind='conversation_message_received'
        ORDER BY p.perceiver_id`,
      [party.party_id]
    )).rows;
    if (variant.expectedResult === null) {
      assert.equal(perceptionRows.some(
        ({ perceiver_id: candidateId }) => candidateId === perceiverId
      ), false);
    } else {
      assert.equal(perceptionRows.some(({ perceiver_id: candidateId,
        result_kind: resultKind }) => candidateId === perceiverId
          && resultKind === variant.expectedResult), true);
    }
    const restarted = buildRuntime({ pool, release, runtimeCatalogPin });
    await restarted.getPartyScreen(party.party_id);
  }
}

async function assertTemporalConversationRestart({
  pool, release, runtimeCatalogPin
}) {
  const backgroundRuntime = buildRuntime({ pool, release, runtimeCatalogPin });
  const backgroundParty = await createParty(
    backgroundRuntime, 'phase-3-background-boundary'
  );
  await inspectAndMove(backgroundRuntime, backgroundParty.party_id,
    'background-boundary');
  await insertConversationBoundary(pool, backgroundParty.party_id, {
    minutes: 2, interruptEffect: 'background'
  });
  const backgroundResult = await buildRuntime({
    pool, release, runtimeCatalogPin
  }).submitTurn(backgroundParty.party_id, {
    request_id: 'phase-3-background-talk',
    idempotency_key: 'phase-3-background-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.equal(backgroundResult.time_update.exact_elapsed.exact_minutes
    .numerator, '3');
  assert.deepEqual(backgroundResult.conversation.semantic_exchange, {
    response_kind: null, npc_utterance: null, disclosed_route_ref: null
  });
  assert.equal((await latestSnapshot(pool, backgroundParty.party_id)).npcs
    .find(({ participant_slot_ref: slot }) => slot === 'eremey_fisher')
    .machine_state.hearing_capability, 'none');
  assert.equal(await conversationEventStatus(
    pool, backgroundParty.party_id, 'background'
  ), 'resolved');
  await buildRuntime({ pool, release, runtimeCatalogPin })
    .getPartyScreen(backgroundParty.party_id);

  const interruptedPlayerRuntime = buildRuntime({
    pool, release, runtimeCatalogPin
  });
  const interruptedPlayerParty = await createParty(
    interruptedPlayerRuntime, 'phase-3-interrupted-player'
  );
  await inspectAndMove(interruptedPlayerRuntime,
    interruptedPlayerParty.party_id, 'interrupted-player');
  await insertConversationBoundary(pool, interruptedPlayerParty.party_id, {
    minutes: 2, interruptEffect: 'hard_interrupt'
  });
  const interruptedPlayer = await buildRuntime({
    pool, release, runtimeCatalogPin
  }).submitTurn(interruptedPlayerParty.party_id, {
    request_id: 'phase-3-interrupted-player-talk',
    idempotency_key: 'phase-3-interrupted-player-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.equal(interruptedPlayer.time_update.exact_elapsed.exact_minutes
    .numerator, '2');
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements',
    interruptedPlayerParty.party_id), 0);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_contributions',
    interruptedPlayerParty.party_id), 0);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces',
    interruptedPlayerParty.party_id), 0);
  const interruptedPlayerReload = await latestSnapshot(
    pool, interruptedPlayerParty.party_id
  );
  assert.deepEqual(interruptedPlayerReload.conversation_statements ?? [], []);
  assert.deepEqual(interruptedPlayerReload.conversation_contributions ?? [], []);
  assert.deepEqual(interruptedPlayerReload.conversation_audiences ?? [], []);
  assert.deepEqual(interruptedPlayerReload.received_messages ?? [], []);
  assert.deepEqual(interruptedPlayerReload.npc_decision_signals ?? [], []);
  assert.deepEqual(
    interruptedPlayerReload.consumed_npc_decision_signal_ids ?? [], []
  );
  const interruptedPlayerProjection = interruptedPlayerReload.activity_history
    .at(-1).execution_result.semantic_exchange_projection;
  assert.equal(interruptedPlayerProjection.factual_status, 'not_applied');
  assert.equal(interruptedPlayerProjection.npc_ref, null);
  assert.deepEqual(interruptedPlayerProjection.statement_refs, []);
  assert.deepEqual(interruptedPlayerProjection.time_budget, {
    total_minutes: 5, elapsed_minutes: 2, remaining_minutes: 3,
    status: 'paused'
  });
  await buildRuntime({
    pool, release, runtimeCatalogPin
  }).getPartyScreen(interruptedPlayerParty.party_id);

  const interruptedRuntime = buildRuntime({ pool, release, runtimeCatalogPin });
  const interruptedParty = await createParty(
    interruptedRuntime, 'phase-3-interrupted-npc'
  );
  await inspectAndMove(interruptedRuntime, interruptedParty.party_id,
    'interrupted-npc');
  await insertConversationBoundary(pool, interruptedParty.party_id, {
    minutes: 7, interruptEffect: 'hard_interrupt'
  });
  const interrupted = await buildRuntime({
    pool, release, runtimeCatalogPin
  }).submitTurn(interruptedParty.party_id, {
    request_id: 'phase-3-interrupted-disclosure',
    idempotency_key: 'phase-3-interrupted-disclosure',
    raw_text: 'Показать Еремею синюю шерсть.'
  });
  assert.equal(interrupted.time_update.exact_elapsed.exact_minutes.numerator,
    '7');
  assert.deepEqual(interrupted.conversation.semantic_exchange, {
    response_kind: null, npc_utterance: null, disclosed_route_ref: null
  });
  assert.equal(await knowledgeCount(pool, interruptedParty.party_id,
    'trace_ld_v1_route_camp_to_shed'), 0);
  assert.equal(await conversationEventStatus(
    pool, interruptedParty.party_id, 'hard_interrupt'
  ), 'resolved');
  const activity = (await pool.query(
    `SELECT status,original_total_minutes::int AS total,
            cumulative_elapsed_numerator::int AS elapsed,
            remaining_time_numerator::int AS remaining
      FROM party_runtime.party_timed_activity_executions
      WHERE left(id,length($1))=$1
      ORDER BY id DESC LIMIT 1`,
    [`activity:${interruptedParty.party_id}:trace-phase3:`]
  )).rows[0];
  assert.deepEqual(activity, {
    status: 'paused', total: 10, elapsed: 7, remaining: 3
  });
  const reloaded = await latestSnapshot(pool, interruptedParty.party_id);
  assert.equal(reloaded.activity_history.at(-1).execution_result
    .semantic_exchange_projection.response_kind, null);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_statements',
    interruptedParty.party_id), 1);
  assert.equal(await count(pool,
    'party_runtime.party_conversation_contributions',
    interruptedParty.party_id), 1);
  assert.equal(reloaded.conversation_statements.length, 1);
  assert.equal(reloaded.conversation_statements[0].speaker_ref.entity_kind,
    'player_character');
  assert.equal(reloaded.conversation_contributions.length, 1);
  assert.equal(reloaded.conversation_audiences.length, 1);
  assert.equal(reloaded.received_messages.some(({ speaker_ref: speaker }) =>
    speaker?.entity_kind === 'npc'), false);
  await buildRuntime({ pool, release, runtimeCatalogPin })
    .getPartyScreen(interruptedParty.party_id);
}

async function patchNpcPerceptionState(pool, partyId, {
  participantSlot,
  machinePatch = {},
  semanticPatch = {}
}) {
  const latest = (await pool.query(
    `SELECT state_version,state_payload
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1
      ORDER BY state_version DESC
      LIMIT 1`,
    [partyId]
  )).rows[0];
  const payload = structuredClone(latest.state_payload);
  const npc = payload.npcs.find(({ participant_slot_ref: slot }) =>
    slot === participantSlot);
  assert.ok(npc,
    `NPC slot ${participantSlot} must exist in the persisted test state`);
  npc.machine_state = { ...npc.machine_state, ...machinePatch };
  npc.semantic_state = { ...npc.semantic_state, ...semanticPatch };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE party_runtime.party_npcs
          SET machine_state=machine_state || $3::jsonb,
              semantic_state=semantic_state || $4::jsonb
        WHERE party_id=$1 AND npc_id=$2`,
      [partyId, npc.instance_id, JSON.stringify(machinePatch),
        JSON.stringify(semanticPatch)]
    );
    await client.query(
      `ALTER TABLE party_runtime.party_state_snapshots
         DISABLE TRIGGER USER`
    );
    await client.query(
      `UPDATE party_runtime.party_state_snapshots
          SET state_payload=$3::jsonb,state_digest=$4
        WHERE party_id=$1 AND state_version=$2`,
      [partyId, latest.state_version, JSON.stringify(payload),
        digestRunIdentity(payload)]
    );
    await client.query(
      `ALTER TABLE party_runtime.party_state_snapshots
         ENABLE TRIGGER USER`
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return npc.instance_id;
}

async function insertConversationBoundary(pool, partyId, {
  minutes, interruptEffect
}) {
  const payload = await latestSnapshot(pool, partyId);
  const eremey = payload.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  const eventId = `event:${partyId}:conversation:${interruptEffect}`;
  const scheduledAt = addElapsedTime(payload.clock, { exact_minutes: {
    numerator: String(minutes), denominator: '1'
  } });
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_events(
       event_id,party_id,event_kind,status,
       scheduled_at_whole_minutes,scheduled_at_subminute_numerator,
       scheduled_at_subminute_denominator,rule_ref,policy_ref,
       preconditions_digest,idempotency_key,change_set_id
     ) VALUES($1,$2,'conversation_test_boundary','pending',$3,$4,$5,
       $6::jsonb,$7::jsonb,$8,$9,$10)`, [
      eventId, partyId, scheduledAt.whole_minutes,
      scheduledAt.subminute_numerator, scheduledAt.subminute_denominator,
      JSON.stringify({ ...versionedRef('action_contract',
        'rule:conversation-postgres-boundary'),
      resolution_class: 'execution_outcome' }),
      JSON.stringify(versionedRef('activity_contract',
        'policy:conversation-postgres-boundary')),
      'a'.repeat(64), eventId, `${eventId}:created`
    ]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_event_subjects(
       event_id,subject_kind,subject_id,subject_role)
     VALUES($1,'npc',$2,'conversation_listener')`,
    [eventId, eremey.instance_id]
  );
}

async function createParty(runtime, requestId) {
  const party = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: requestId
  });
  await runtime.acknowledgeOpening(party.party_id, {
    client_ack_id: `${requestId}-ack`
  });
  return party;
}

async function inspectAndMove(runtime, partyId, suffix) {
  const inspected = await runtime.submitTurn(partyId, {
    request_id: `phase-3-${suffix}-inspection`,
    idempotency_key: `phase-3-${suffix}-inspection`,
    raw_text: 'Осмотреть место крушения подробно.'
  });
  assert.equal(inspected.check.outcome.success, true);
  assert.equal(inspected.clue.placement.physical_position, 'hands');
  await runtime.submitTurn(partyId, {
    request_id: `phase-3-${suffix}-move`,
    idempotency_key: `phase-3-${suffix}-move`,
    raw_text: 'Дойти до рыбацкого стана.'
  });
  return inspected;
}

function buildRuntime({
  pool,
  release,
  runtimeCatalogPin,
  rollForRequest = () => 0.99,
  conversationModels = null
}) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-07-30T08:00:00.000Z')
  });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool,
    committer
  });
  const { playerConversationModel, npcSemanticModel } =
    conversationModels ?? createM2ConversationModels();
  const turnStepModel = createLowerDvinaTraceTurnStepTestModel();
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository,
    turnStepModel,
    playerConversationModel,
    npcSemanticModel,
    semanticResolver: async (request) => ({
      option_id: semanticOption(request.raw_text, request.action_set)
    }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService: {
        async run(request) {
          assert.equal(JSON.stringify(request).includes('must-not-reach-llm'),
            false);
          return approvedNarration(request.request_id);
        }
      }
    }),
    randomSourceFactory: ({ request_id: requestId }) => {
      const source = createSeededRandomSource(`phase-3:${requestId}`);
      let counter = 0;
      return {
        next() {
          counter += 1;
          return rollForRequest(requestId);
        },
        snapshot: () => ({
          ...source.snapshot(),
          counter
        })
      };
    },
    decisionSecret: 'phase-3-postgres-secret',
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      source_registrations: lowerDvinaTraceTemporalSourceRegistrations([
        conversationTestSourceRegistration()
      ]),
      effect_registrations:
        lowerDvinaTraceConversationTemporalEffectRegistrations()
    }),
    now: () => '2026-07-30T08:00:00.000Z'
  });
  return createLowerDvinaTracePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin,
    traceStartAdapter:
      createLowerDvinaTracePhase1BProductionAdapter({
        partyPool: pool,
        worldPool: pool,
        release,
        runtimeCatalogPin
      }),
    traceTurnRuntime
  });
}

function conversationTestSourceRegistration() {
  return {
    rule_ref: versionedRef('action_contract',
      'rule:conversation-postgres-boundary'),
    policy_ref: versionedRef('activity_contract',
      'policy:conversation-postgres-boundary'),
    resolve(candidate, { projection }) {
      const next = structuredClone(projection);
      const world = next.conversation_state.world_state;
      const eremey = world.npcs.find(
        ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
      );
      eremey.machine_state = {
        ...eremey.machine_state, hearing_capability: 'none'
      };
      const eventVersion = world.temporal_source_proof
        .event_versions[candidate.boundary_id];
      const changeSetId = `change:${world.party_id}:trace-phase3:${
        world.party_state.turn_number + 1}`;
      const writeSet = { inserts: [], appends: [], deletes: [], updates: [{
        target_table: 'party_temporal_events', id: candidate.boundary_id,
        record: { event_id: candidate.boundary_id, party_id: world.party_id,
          status: 'resolved', terminal_change_set_id: changeSetId,
          state_version: eventVersion + 1 }
      }, {
        target_table: 'party_npcs', id: eremey.instance_id,
        record: { party_id: world.party_id, npc_id: eremey.instance_id,
          machine_state: structuredClone(eremey.machine_state) }
      }] };
      return {
        disposition: 'execute',
        proposals: [{
          proposal_id: `${candidate.boundary_id}:disable-hearing`,
          write_target: `party_npcs:${eremey.instance_id}`,
          write_set: writeSet,
          expected_state_versions: [{
            target_table: 'party_temporal_events', id: candidate.boundary_id,
            state_version: eventVersion
          }],
          physical_keys: [
            `party_runtime.party_temporal_events:${candidate.boundary_id}`,
            `party_runtime.party_npcs:${eremey.instance_id}`
          ]
        }],
        state_projection: next,
        follow_up_candidates: [],
        stop_after_current_batch:
          candidate.boundary_id.endsWith(':hard_interrupt')
      };
    }
  };
}

function versionedRef(entityKind, entityId) {
  return { entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: '1' };
}

async function latestSnapshot(pool, partyId) {
  return (await latestSnapshotRow(pool, partyId)).state_payload;
}

async function latestSnapshotRow(pool, partyId) {
  return (await pool.query(
    `SELECT state_version,state_payload
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1`,
    [partyId]
  )).rows[0];
}

async function conversationEventStatus(pool, partyId, interruptEffect) {
  return (await pool.query(
    `SELECT status FROM party_runtime.party_temporal_events
      WHERE event_id=$1 AND party_id=$2`,
    [`event:${partyId}:conversation:${interruptEffect}`, partyId]
  )).rows[0]?.status;
}

function semanticOption(rawText, actionSet) {
  const normalized = rawText.toLowerCase();
  const selected = normalized.includes('осмотр')
    ? 'inspect_wreck_in_detail'
    : normalized.includes('показ')
      ? 'show_clue_and_seek_eremey_cooperation'
      : normalized.includes('стан')
        ? 'follow_path_to_fishing_camp'
        : 'ask_eremey_about_wreck';
  const available = actionSet.some(({ option_id: id }) => id === selected);
  assert.equal(available, true);
  return selected;
}

function approvedNarration(requestId) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose: 'Сохранённое видимое состояние описано без новых фактов.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['persisted visible context']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}

async function installSchemas(pool) {
  await pool.query('SELECT 1');
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogMigrationIndex = partyFiles.findIndex((file) =>
    file.startsWith('012_')
  );
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyFiles.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal(
    (await runPartyRuntimeCatalogMigration(pool)).status,
    'applied'
  );
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}


async function count(pool, table, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function knowledgeCount(pool, partyId, factId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1 AND fact_id=$2`,
    [partyId, factId]
  )).rows[0].count;
}

async function positionFor(pool, partyId) {
  return (await pool.query(
    `SELECT g4_id,g5_node_id,g5_anchor_id
       FROM party_runtime.party_positions WHERE party_id=$1`,
    [partyId]
  )).rows[0];
}

async function traversalIntervalCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_traversal_interval_results r
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=r.route_plan_execution_id
      WHERE e.party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function traversalLifecycleCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_route_plan_execution_events v
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=v.execution_id
      WHERE e.party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function blueWoolOwnership(pool, partyId) {
  return (await pool.query(
    `SELECT o.owner_external_ref,o.controller_character_id,o.claim_state
       FROM party_runtime.party_ownership o
       JOIN party_runtime.party_items i
         ON i.party_id=o.party_id AND i.item_id=o.item_id
      WHERE o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyId]
  )).rows[0];
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
