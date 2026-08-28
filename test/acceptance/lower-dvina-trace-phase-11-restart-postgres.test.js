import assert from 'node:assert/strict';
import test from 'node:test';

import { startLowerDvinaProductionAcceptanceEnv } from
  '../helpers/lower-dvina-production-acceptance-env.js';
import { createCanonicalPhase11LlmResponder, PHASE11_CANONICAL_TURNS } from
  '../helpers/lower-dvina-phase-11-llm.js';

test('revision 25 survives production restart and exact replay through Phase 10',
  { timeout: 300_000 }, async (context) => {
    const environment = await startLowerDvinaProductionAcceptanceEnv({
      llmRespond: createCanonicalPhase11LlmResponder()
    });
    context.after(() => environment.close());
    assert.equal(environment.root.health().release_id,
      'spatial-v3-production-v13');
    const started = await post(environment, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_trace_v1',
      request_id: 'phase11-new-game'
    });
    const partyId = started.party_id;
    await post(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, {
        client_ack_id: 'phase11-opening-ack'
      });
    const revision = (await environment.partyPool.query(
      `SELECT state_payload #>>
                '{materialization_trace,seed_context,scenario_definition_revision}'
                AS revision
         FROM party_runtime.party_state_snapshots
        WHERE party_id = $1 ORDER BY state_version DESC LIMIT 1`,
      [partyId]
    )).rows[0]?.revision;
    assert.equal(revision, '25');

    let restResult;
    for (const [turnId, rawText] of PHASE11_CANONICAL_TURNS) {
      const result = await submit(environment, partyId, turnId, rawText);
      if (turnId === 'rest') {
        restResult = result;
        const calls = environment.llm.requests.length;
        await environment.restartRoot();
        assert.deepEqual(
          await submit(environment, partyId, turnId, rawText),
          restResult
        );
        assert.equal(environment.llm.requests.length, calls,
          'replay after restart must not invoke the provider');
        environment.llm.requests.length = 0;
        environment.llm.responses.length = 0;
      }
    }
    const [lastId, lastText] = PHASE11_CANONICAL_TURNS.at(-1);
    await submit(environment, partyId, lastId, lastText);
    const screen = await get(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.equal(screen.screen.schema, 'lower_dvina_trace_turn_screen');
    assert.equal(JSON.stringify(screen).includes('hidden_truth'), false);
    assert.equal(JSON.stringify(screen).includes('роль Жданко доказана'),
      false);
    assert.equal(screen.screen.visible_context.uncertainties.some(
      (value) => value.includes('роль Жданко остаётся неустановленным')),
    true);
    const finalCalls = environment.llm.requests.length;
    await environment.restartRoot();
    await submit(environment, partyId, lastId, lastText);
    assert.equal(environment.llm.requests.length, finalCalls);
    const committed = (await environment.partyPool.query(
      `SELECT state_payload
       FROM party_runtime.party_state_snapshots
        WHERE party_id = $1 ORDER BY state_version DESC LIMIT 1`,
      [partyId]
    )).rows[0].state_payload;
    assert.equal(committed.completion.status, 'committed');
    assert.equal(committed.completion.outcome.primary_completion_state,
      'trace_ld_v1_completion_full',
    JSON.stringify({ outcome: committed.completion.outcome,
      evidence: committed.phase9?.evidence_resolution,
      facts: committed.phase9?.committed_facts,
      promise: committed.promise_instances?.[0] }));
    assert.equal(completionValue(committed.completion.outcome,
      'principal_resolution'), 'zhdanko_established');

    const catalog = await get(environment, '/api/v1/scenarios');
    assert.ok(catalog.scenarios.some(({ scenario_id: id }) =>
      id === 'lower_dvina_late_summer_open_water_v1'));
    const boatman = await post(environment, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_late_summer_open_water_v1',
      request_id: 'phase11-boatman-new-game'
    });
    await post(environment,
      `/api/v1/parties/${encodeURIComponent(boatman.party_id)}/opening-ack`, {
        client_ack_id: 'phase11-boatman-opening-ack'
      });
    const optionId = boatman.screen.action_panel.suggested_actions[0]
      .option_id;
    const boatmanTurn = await post(environment,
      `/api/v1/parties/${encodeURIComponent(boatman.party_id)}/turns`, {
        request_id: 'phase11-boatman-turn',
        idempotency_key: 'phase11-boatman-turn',
        selected_action_option_id: optionId
      });
    assert.equal(boatmanTurn.screen.schema, 'turn_screen');
    assert.equal(boatmanTurn.screen.screen_status, 'ready');
  });

test('production revision 24 admits independent Ratsha, Eremey and Zhdanko alternatives',
  { timeout: 600_000 }, async (context) => {
    let responder = createCanonicalPhase11LlmResponder();
    const environment = await startLowerDvinaProductionAcceptanceEnv({
      llmRespond: (request) => responder(request)
    });
    context.after(() => environment.close());

    responder = createCanonicalPhase11LlmResponder({
      eremeyCompanionResponse: 'evasive_accept'
    });
    const eremey = await startTraceParty(environment, 'phase11-eremey');
    let eremeyResult;
    for (const [id, text] of PHASE11_CANONICAL_TURNS.slice(0, 10)) {
      eremeyResult = await submit(environment, eremey, `eremey-${id}`, text);
    }
    environment.llm.requests.length = 0;
    environment.llm.responses.length = 0;
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      const state = await latestState(environment, eremey);
      if (state.player_response_boundary == null) break;
      eremeyResult = await submit(environment, eremey,
        `eremey-combat-${ordinal}`, PHASE11_CANONICAL_TURNS[10][1]);
    }
    assert.equal((await latestState(environment, eremey))
      .player_response_boundary, null);
    for (const [id, text] of PHASE11_CANONICAL_TURNS.slice(11)) {
      eremeyResult = await submit(environment, eremey, `eremey-${id}`, text);
    }
    let eremeyState = await latestState(environment, eremey);
    if (eremeyState.completion?.status !== 'committed') {
      await submit(environment, eremey, 'eremey-disposition-finalize',
        PHASE11_CANONICAL_TURNS.at(-1)[1]);
      eremeyState = await latestState(environment, eremey);
    }
    const eremeyNpcId = eremeyState.npcs.find(
      ({ participant_slot_ref: slot }) => slot === 'eremey_fisher')
      .instance_id;
    assert.equal(eremeyState.route_participant_commitments.some(
      ({ npc_ref: npc, role }) => npc.entity_id === eremeyNpcId
        && role === 'guide'), true,
    JSON.stringify(eremeyResult.conversation));
    const evasiveStatement = (await environment.partyPool.query(
      `SELECT claims FROM party_runtime.party_conversation_statements
        WHERE party_id=$1 AND utterance_text=$2`, [eremey,
        'Пойду к клети, но больше сейчас ничего объяснять не стану.']
    )).rows[0];
    assert.deepEqual(evasiveStatement.claims, []);
    assert.equal(eremeyState.completion.status, 'committed');

    responder = createCanonicalPhase11LlmResponder({
      ratshaResponseKind: 'combat_handoff'
    });
    const ratsha = await startTraceParty(environment, 'phase11-ratsha');
    for (const [id, text] of PHASE11_CANONICAL_TURNS.slice(0, 5)) {
      await submit(environment, ratsha, `ratsha-${id}`, text);
    }
    let combatState = await latestState(environment, ratsha);
    assert.equal(combatState.combat_sessions[0].status, 'paused_for_player');
    assert.equal((await environment.partyPool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_npc_decision_traces
        WHERE party_id=$1 AND decision_mode='combat'`, [ratsha]
    )).rows[0].count > 0, true);
    const combatCalls = environment.llm.requests.length;
    await environment.restartRoot();
    await submit(environment, ratsha, 'ratsha-surrender',
      PHASE11_CANONICAL_TURNS[4][1]);
    assert.equal(environment.llm.requests.length, combatCalls);
    await submit(environment, ratsha, 'ratsha-combat',
      'Сдержать Ратшу вместе с рыбаками, не убивая его.');
    combatState = await latestState(environment, ratsha);
    assert.equal(combatState.combat_sessions.length > 0, true);
    assert.equal((await environment.partyPool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_temporal_events
        WHERE party_id=$1 AND event_kind LIKE 'combat_%'`, [ratsha]
    )).rows[0].count > 0, true);

    environment.llm.requests.length = 0;
    environment.llm.responses.length = 0;

    responder = createCanonicalPhase11LlmResponder({
      zhdankoCombatChoice: 'break_contact',
      companionCombatChoice: 'hold',
      phase7Choice: 'wait',
      onisimResponse: 'silence'
    });
    const zhdanko = await startTraceParty(environment, 'phase11-zhdanko');
    for (const [id, text] of PHASE11_CANONICAL_TURNS.slice(0, 10)) {
      await submit(environment, zhdanko, `zhdanko-${id}`, text);
    }
    let zhdankoState = await latestState(environment, zhdanko);
    assert.equal(zhdankoState.combat_sessions[0].status, 'paused_for_player');
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      if (!(zhdankoState.combat_sessions ?? []).some(
        ({ status }) => status !== 'ended')) break;
      await submit(environment, zhdanko, `zhdanko-flight-${ordinal}`,
        'Не преследовать Жданко, удерживая остальных на месте.');
      zhdankoState = await latestState(environment, zhdanko);
    }
    const persistedCombat = (await environment.partyPool.query(
      `SELECT status, participant_states
         FROM party_runtime.party_combat_sessions WHERE party_id=$1`,
      [zhdanko]
    )).rows[0];
    const zhdankoNpcId = zhdankoState.npcs.find(
      ({ participant_slot_ref: slot }) =>
        slot === 'zhdanko_storehouse_controller').instance_id;
    const zhdankoParticipant = persistedCombat
      .participant_states.find(({ actor_ref: actor }) =>
        actor.entity_id === zhdankoNpcId);
    assert.equal(persistedCombat.status, 'ended');
    assert.equal(zhdankoParticipant.combat_status, 'left');
    for (const [id, text] of PHASE11_CANONICAL_TURNS.slice(14)) {
      await submit(environment, zhdanko, `zhdanko-${id}`, text);
    }
    let alternative = await latestState(environment, zhdanko);
    if (alternative.completion?.status !== 'committed') {
      await submit(environment, zhdanko, 'zhdanko-disposition-finalize',
        PHASE11_CANONICAL_TURNS.at(-1)[1]);
      alternative = await latestState(environment, zhdanko);
    }
    assert.equal(alternative.completion.status, 'committed');
    assert.ok(['trace_ld_v1_completion_partial',
      'trace_ld_v1_completion_case_open'].includes(
      alternative.completion.outcome.primary_completion_state));
  });

async function startTraceParty(environment, prefix) {
  const started = await post(environment, '/api/v1/new-games', {
    scenario_id: 'lower_dvina_trace_v1', request_id: `${prefix}-new-game`
  });
  await post(environment,
    `/api/v1/parties/${encodeURIComponent(started.party_id)}/opening-ack`, {
      client_ack_id: `${prefix}-opening-ack`
    });
  return started.party_id;
}

async function latestState(environment, partyId) {
  return (await environment.partyPool.query(
    `SELECT state_payload FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1`, [partyId]
  )).rows[0].state_payload;
}

async function submit(environment, partyId, id, rawText) {
  try {
    const identity = environment.requestIdentity(partyId, id);
    return await post(environment,
      `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, {
        ...identity,
        raw_text: rawText
      });
  } catch (error) {
    const recentRequests = environment.llm.requests.slice(-20).map((entry) => ({
      model: entry.body?.model,
      schema: entry.input?.schema,
      npc_ref: entry.input?.npc_ref,
      validation_errors: entry.input?.validation_errors,
      operation_contract: entry.input?.decision_scope?.operation_contract
        ?? entry.input?.operation_contract
    }));
    throw new Error(`${id}: ${error.message}\nRecent LLM requests: ${JSON.stringify(recentRequests)}`
      + `\nRecent LLM responses: ${JSON.stringify(
        environment.llm.responses.slice(-20))}`,
      { cause: error });
  }
}

async function post(environment, pathname, body) {
  const response = await fetch(`${environment.baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const envelope = await response.json();
  assert.equal(response.ok, true,
    `${response.status}: ${JSON.stringify(envelope)}`);
  return envelope.data;
}

async function get(environment, pathname) {
  const response = await fetch(`${environment.baseUrl}${pathname}`);
  const envelope = await response.json();
  assert.equal(response.ok, true,
    `${response.status}: ${JSON.stringify(envelope)}`);
  return envelope.data;
}

function completionValue(outcome, dimensionId) {
  return outcome.ordered_dimension_outcomes.find(
    ({ dimension_id: id }) => id === dimensionId)?.value_id;
}
