import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';

const MANIFEST_PATH = resolve(process.cwd(),
  'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json');
const CANDIDATES_PATH = '/srv/novgorod-work/fleet/tasks/n1-wire/out/captures/seeded-candidates.json';
const CAPTURE_OUTPUT_DIR = '/srv/novgorod-work/fleet/tasks/npc-address-projection/out/captures/after';
const TARGET_ORDINALS = new Map([
  ['novgorod_pine_ridge_approach_v1', [0]],
  ['novgorod_reed_backwater_entrance_v1', [0]],
  ['novgorod_vikhtuy_resource_edge_approach_v1', [0]],
  ['novgorod_zaostrovye_settlement_approach_v1', [0]],
  ['novgorod_vikhtuy_household_cluster_v1', [0, 1]],
]);
const TALK_TEXT = 'Здороваюсь с человеком.';
const JSON_RESPONSE = (output) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(output) } }],
}), { status: 200 });

function speechRole(input, system) {
  if (input?.schema === 'player_conversation_input_v1') {
    return 'player_conversation_planner';
  }
  if (input?.schema === 'npc_conversation_response_request_v1') {
    return 'npc_conversation_responder';
  }
  if (input?.request?.schema === 'npc_conversation_response_request_v1'
      && Array.isArray(input.validation_errors)) {
    return 'npc_conversation_responder_format_repair';
  }
  if (input?.request?.schema === 'npc_conversation_response_request_v1'
      && input.plan != null && system.startsWith('Возвращай только {"pass":true,"concerns":[]}')) {
    return 'npc_conversation_grounding_auditor';
  }
  return null;
}

function playerContribution(input) {
  const target = input.player_safe_context.target_npc_ref;
  return {
    input_mode: 'intent_paraphrase', contribution_kind: 'speech',
    primary_addressee_ref: target, intended_addressee_refs: [target],
    affected_actor_refs: [], speech: { utterance_text: 'Здравствуй, добрый человек.',
      dominant_act: 'greet', interaction_tags: ['greeting'], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'поздороваться', grounded_contribution: 'приветствие',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: input.player_safe_context.allowed_duration_classes[0], effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
  };
}

function npcContribution(input) {
  const player = input.allowed_references.actor_refs.find(
    ({ entity_kind: kind }) => kind === 'player_character');
  return {
    contribution_kind: 'speech', primary_addressee_ref: player,
    intended_addressee_refs: [player], affected_actor_refs: [],
    speech: { utterance_text: 'Слышу тебя.', dominant_act: 'answer', interaction_tags: [],
      topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'ответ', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответ.',
  };
}

function plannerResult(request, targetOrdinal) {
  const targets = [];
  const seen = new Set();
  for (const choice of turnStepOperationChoices(request)) {
    const { operation } = choice;
    if (operation.op !== 'emit_interaction'
        || operation.target_actor_refs?.length !== 1) continue;
    const targetRef = operation.target_actor_refs[0];
    if (seen.has(targetRef)) continue;
    seen.add(targetRef);
    targets.push(choice);
  }
  const choice = targets[targetOrdinal];
  if (!choice) return null;
  const targetRef = choice.operation.target_actor_refs[0];
  return {
    targetRef,
    output: {
      interpretation: { player_goal: request.root_player_action,
        grounded_attempt: choice.operation.description ?? request.root_player_action,
        adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operation_family: choice.operation.op, operation_choice: choice.choice_id,
      check: null, continuation: null, clarification: null, direct_result_kind: null,
      reason_code: 'visible_choice', reason: 'Выбор видимой возможности.',
    },
  };
}

test('capture production v17 speech payloads for all seeded NPCs', {
  timeout: 1_800_000,
}, async (t) => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const candidates = JSON.parse(await readFile(CANDIDATES_PATH, 'utf8'));
  assert.equal(manifest.status, 'approved');
  const counts = new Map(candidates.scans.map(({ scenario_id, npc_count }) =>
    [scenario_id, npc_count]));
  const environment = await bootstrapV17PresenceE2e(t);
  let activeTurn = null;
  let currentTarget = null;
  const captured = [];
  const restoreFetch = installPresenceProductionE2eFetch({
    turnStepPlanner: async ({ request }) => {
      const planned = plannerResult(request, activeTurn.target_ordinal);
      if (planned == null) return null;
      currentTarget = planned.targetRef;
      activeTurn.target_ref = planned.targetRef;
      return planned.output;
    },
  });
  const fixtureFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://target-acceptance.invalid/chat/completions');
    const call = JSON.parse(init.body);
    const input = JSON.parse(call.messages.find(({ role }) => role === 'user').content);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const role = speechRole(input, system);
    if (activeTurn && role != null) {
      const parameters = Object.fromEntries(Object.entries(call)
        .filter(([key]) => key !== 'messages'));
      activeTurn.payloads.push({ role, system, user: input, parameters,
        messages: call.messages });
    }
    if (role === 'npc_conversation_responder') {
      activeTurn.responderCalls += 1;
      const initial = npcContribution(input);
      initial.speech.dominant_act = 'invalid_act_for_capture';
      return JSON_RESPONSE(initial);
    }
    if (role === 'player_conversation_planner') return JSON_RESPONSE(playerContribution(input));
    if (role === 'npc_conversation_grounding_auditor') {
      activeTurn.auditCalls += 1;
      return JSON_RESPONSE({ pass: true, concerns: [] });
    }
    if (role === 'npc_conversation_responder_format_repair') {
      activeTurn.repairCalls += 1;
      return JSON_RESPONSE(npcContribution(input.request));
    }
    if (input?.schema === 'world_knowledge_query_planner_request_v1'
        || system.includes('schema must equal world_knowledge_query_plan_v1.')) {
      return JSON_RESPONSE({ schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: [input.allowed_domains?.[0]].filter(Boolean), focus_refs: [],
        requested_predicates: [], search_hints: [] });
    }
    return fixtureFetch(url, init);
  };
  t.after(() => { globalThis.fetch = fixtureFetch; restoreFetch(); });
  await mkdir(CAPTURE_OUTPUT_DIR, { recursive: true });
  const { runtime } = await createPresenceProductionRoot(environment);
  t.after(() => runtime.close());

  const output = [];
  let ordinal = 0;
  for (const [startIndex, start] of manifest.starts.entries()) {
    const targetOrdinals = TARGET_ORDINALS.get(start.scenario_id) ?? [];
    assert.ok(targetOrdinals.every((targetOrdinal) =>
      targetOrdinal < (counts.get(start.scenario_id) ?? 0)), start.scenario_id);
    for (const targetOrdinal of targetOrdinals) {
      const captureNumber = ordinal + 1;
      const opening = await runtime.startNewGame({ scenario_id: start.scenario_id,
        request_id: `n1-wire-speech-start-${startIndex}-${targetOrdinal}` });
      await runtime.acknowledgeOpening(opening.party_id,
        { client_ack_id: `n1-wire-speech-ack-${startIndex}-${targetOrdinal}` });
      activeTurn = { scenario_id: start.scenario_id, partyId: opening.party_id,
        npc_index: captureNumber, target_ordinal: targetOrdinal,
        target_ref: null, payloads: [], responderCalls: 0, auditCalls: 0,
        repairCalls: 0 };
      currentTarget = null;
      await runtime.submitTurn(opening.party_id, { raw_text: TALK_TEXT,
        request_id: `n1-wire-speech-${startIndex}-${targetOrdinal}` });
      if (!currentTarget || !activeTurn.payloads.some(({ role }) =>
        role === 'npc_conversation_responder')) {
        const finding = { scenario_id: start.scenario_id,
          target_ordinal: targetOrdinal, result: 'not addressable on first turn',
          reason: !currentTarget ? 'no emit_interaction choice at this target ordinal'
            : 'turn completed without NPC responder payload' };
        await writeFile(resolve(CAPTURE_OUTPUT_DIR, 'first-turn-addressability-findings.json'),
          `${JSON.stringify({ source_commit: '1f90ece315a7f0e0197514dff4b750108d86770c',
            capture_version: 'after',
            source_state: 'npc-address-projection task worktree',
            findings: [...captured.filter(({ result }) => result === 'not addressable on first turn'), finding] }, null, 2)}\n`,
          { mode: 0o600 });
        captured.push(finding);
        activeTurn = null;
        continue;
      }
      const responder = activeTurn.payloads.find(({ role }) =>
        role === 'npc_conversation_responder');
      assert.equal(activeTurn.auditCalls, 1, `${start.scenario_id}: post-repair auditor`);
      assert.equal(activeTurn.repairCalls, 1, `${start.scenario_id}: semantic repair`);
      const capture = { scenario_id: start.scenario_id, npc_index: captureNumber,
        interlocutor: 'player_character', npc_ref_in_production_payload: currentTarget,
        payloads: activeTurn.payloads, responder_user_schema: responder.user.schema };
      output.push(capture);
      captured.push(capture);
      await writeFile(resolve(CAPTURE_OUTPUT_DIR,
        `npc-to-player-${start.scenario_id}-${String(targetOrdinal + 1).padStart(2, '0')}.json`),
      `${JSON.stringify({ source_commit: '1f90ece315a7f0e0197514dff4b750108d86770c',
        capture_version: 'after',
        source_state: 'npc-address-projection task worktree',
        capture_kind: 'production provider body captured by isolated fake provider; no model call',
        ...capture }, null, 2)}\n`, { mode: 0o600 });
      ordinal += 1;
      activeTurn = null;
    }
  }
  assert.equal(output.length, 6);
  await writeFile(resolve(CAPTURE_OUTPUT_DIR, 'npc-to-player-summary.json'),
    `${JSON.stringify({ capture_version: 'after',
      source_state: 'npc-address-projection task worktree',
      expected: 6, captured: output.length,
      selected_scenarios: [...TARGET_ORDINALS.keys()] }, null, 2)}\n`, { mode: 0o600 });
});
