import assert from 'node:assert/strict';
import test from 'node:test';

import LIVE_WORLD_TURN_PROFILE from
  '../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };
import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { SCENE_NPC_SOURCE } from
  '../../apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js';
import { liveWorldConversationCommands } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { npcSharesPlayerScene } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-scene-presence.js';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import {
  PRESENCE_E2E_MOVE_TEXT,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

const TALK_TEXT = 'Здороваюсь с человеком.';
const profile = { profile: LIVE_WORLD_TURN_PROFILE, pin: {
  artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
  revision: LIVE_WORLD_TURN_PROFILE.revision,
  digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE) } };
const json = (output) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });

/** Deterministic LLM stub on top of the fixture stub: local approach then route, talk, conversation roles. */
function installStub({ onNarration = null } = {}) {
  const restore = installPresenceProductionE2eFetch();
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const input = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    if (system.startsWith('Return only {"prose"') && input.required_current_beat) {
      await onNarration?.();
    }
    if (system.includes('schema must equal world_knowledge_query_plan_v1.')
      && input.purpose !== 'semantic_resolution') {
      // only semantic_resolution may plan no domain
      return json({ schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: [input.allowed_domains[0]], focus_refs: [], requested_predicates: [],
        search_hints: [] });
    }
    if (system.startsWith('Return only one JSON object containing the semantic choice for one turn step.')) {
      const request = input.request ?? input;
      const choices = turnStepOperationChoices(request);
      const pickOp = (predicate) => choices.find(({ operation }) => predicate(operation));
      let pick = null;
      if (request.root_player_action === PRESENCE_E2E_MOVE_TEXT) {
        pick = pickOp((op) => op.op === 'request_movement' && op.movement_kind === 'route')
          ?? pickOp((op) => op.op === 'request_movement' && String(op.description ?? '').includes('подход'))
          ?? pickOp((op) => op.op === 'request_movement');
      } else if (request.root_player_action === TALK_TEXT) {
        pick = pickOp((op) => op.op === 'emit_interaction');
        assert.ok(pick, 'a conversation operation must be offered at the generated site');
      }
      if (pick) {
        return json({ interpretation: { player_goal: request.root_player_action,
          grounded_attempt: pick.operation.description ?? request.root_player_action,
          adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operation_family: pick.operation.op, operation_choice: pick.choice_id, check: null,
        continuation: null, clarification: null, direct_result_kind: null,
        reason_code: 'visible_choice', reason: 'Выбор видимой возможности.' });
      }
    } else if (system.startsWith('Return only {"prose"') && input.required_current_beat
      && [...input.required_current_beat.changes, ...input.required_current_beat.uncertainties]
        .length === 0) {
      return json({ prose: 'Вы оказываетесь на новом месте.' });
    } else if (system.startsWith('Return only one plain JSON object with the semantic conversation contribution. Do not return request_id')) {
      const target = input.player_safe_context.target_npc_ref;
      return json({ input_mode: 'intent_paraphrase', contribution_kind: 'speech',
        primary_addressee_ref: target, intended_addressee_refs: [target], affected_actor_refs: [],
        speech: { utterance_text: 'Здравствуй, добрый человек.', dominant_act: 'greet',
          interaction_tags: ['greeting'], topic_refs: [], claims: [],
          response_expectation: { kind: 'none', target_refs: [] } },
        interpretation: { intent: 'поздороваться', grounded_contribution: 'приветствие',
          adaptation: 'literal' }, resolution: 'automatic',
        activity: { duration_class: input.player_safe_context.allowed_duration_classes[0], effort: 'none' },
        supporting_operations: [], check: null, handoff: null });
    } else if (system.startsWith('Return only one plain JSON object with the semantic conversation contribution. Do not return request, boundary')) {
      const player = input.allowed_references.actor_refs.find(
        ({ entity_kind: kind }) => kind === 'player_character');
      return json({ contribution_kind: 'speech', primary_addressee_ref: player,
        intended_addressee_refs: [player], affected_actor_refs: [],
        speech: { utterance_text: 'Слышу тебя.', dominant_act: 'answer', interaction_tags: [],
          topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
        interpretation: { intent: 'ответить', grounded_contribution: 'ответ', adaptation: 'literal' },
        resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
        supporting_operations: [], check: null, handoff: null, reason: 'Ответ.' });
    } else if (system.startsWith('Return only {"pass":true,"concerns":[]}')) {
      return json({ pass: true, concerns: [] });
    }
    return base(url, init);
  };
  return restore;
}

function pathsWith(value, needle, path = '$') {
  if (value === needle) return [path];
  if (value == null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => pathsWith(child, needle, `${path}.${key}`));
}

async function snapshotNpcs(partyPool, partyId) {
  const { rows } = await partyPool.query(
    `SELECT s.state_version, s.state_payload FROM party_runtime.party_state_snapshots s
       JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
      WHERE s.party_id=$1`, [partyId]);
  return { version: rows[0].state_version, payload: rows[0].state_payload };
}

test('a generated site: its NPCs are loaded with G6, conversation is offered, the snapshot stays clean',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    let observingPartyId = null;
    let arrivalPendingScreen = null;
    const sceneProjectionDiagnostics = [];
    const restore = installStub({ onNarration: async () => {
      if (observingPartyId == null) return;
      const { rows } = await env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1',
        [observingPartyId]);
      if (rows[0]?.screen?.screen_status === 'committed_presentation_pending') {
        arrivalPendingScreen = rows[0].screen;
      }
    } });
    t.after(() => restore());
    const { runtime } = await createPresenceProductionRoot({ ...env,
      extraConfig: { onNpcSceneProjection: (event) =>
        sceneProjectionDiagnostics.push(event) }
    });
    try {
      let partyId = null;
      let arrivalResponse = null;
      for (let attempt = 0; attempt < 6 && partyId == null; attempt += 1) {
        const opening = await runtime.startNewGame({ scenario_id: 'novgorod_riverbank_approach_v1',
          request_id: `scene-npcs-start-${attempt}` });
        observingPartyId = opening.party_id;
        await runtime.acknowledgeOpening(opening.party_id, { client_ack_id: `scene-npcs-ack-${attempt}` });
        for (let step = 0; step < 8 && partyId == null; step += 1) {
          const generated = (await env.partyPool.query(
            'SELECT bool_or(origin=$2) AS g FROM party_runtime.party_g5_sites WHERE party_id=$1',
            [opening.party_id, 'generated'])).rows[0].g === true;
          if (generated) {
            const people = Number((await env.partyPool.query(
              `SELECT count(*)::int AS n FROM party_runtime.entity_placements pl
                 JOIN party_runtime.scene_position_nodes pos ON pos.party_id=pl.party_id
                  AND pos.id=pl.position_node_id
                 JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id
                  AND g6.id=pos.g6_instance_id
                 JOIN party_runtime.party_g5_sites site ON site.party_id=g6.party_id
                  AND site.id=g6.host_id AND site.origin='generated'
                WHERE pl.party_id=$1 AND pl.entity_kind='npc'`, [opening.party_id])).rows[0].n);
            if (people > 0) partyId = opening.party_id; // composition is 0-2 people per place
            break;
          }
          try {
            const route = (await runtime.getPartyScreen(opening.party_id)).screen?.panels?.route;
            if (!route?.visible && step === 0) {
              await runtime.submitTurn(opening.party_id, { raw_text: TARGET_SMOKE_INPUT,
                request_id: `scene-npcs-look-${attempt}` });
            }
            const response = await runtime.submitTurn(opening.party_id, { raw_text: PRESENCE_E2E_MOVE_TEXT,
              request_id: `scene-npcs-move-${attempt}-${step}` });
            const current = await snapshotNpcs(env.partyPool, opening.party_id);
            const siteId = current.payload.position?.site_id;
            if (siteId != null) {
              const location = await env.partyPool.query(
                `SELECT site.origin, count(n.npc_id)::int AS people
                   FROM party_runtime.party_g5_sites site
                   LEFT JOIN party_runtime.party_g6_instances g6 ON g6.party_id=site.party_id
                    AND g6.host_kind='g5_site' AND g6.host_id=site.id AND g6.status='active'
                   LEFT JOIN party_runtime.scene_position_nodes pos ON pos.party_id=g6.party_id
                    AND pos.g6_instance_id=g6.id AND pos.status='active'
                   LEFT JOIN party_runtime.entity_placements pl ON pl.party_id=pos.party_id
                    AND pl.placement_kind='scene_position' AND pl.position_node_id=pos.id
                    AND pl.entity_kind='npc'
                   LEFT JOIN party_runtime.party_npcs n ON n.party_id=pl.party_id
                    AND n.npc_id=pl.entity_id
                  WHERE site.party_id=$1 AND site.id=$2 GROUP BY site.origin`,
                [opening.party_id, siteId]);
              if (location.rows[0]?.origin === 'generated'
                  && Number(location.rows[0].people) > 0) {
                partyId = opening.party_id;
                arrivalResponse = response;
              }
            }
          } catch (error) { // ~1 in 4 parties: the planner offers no movement (B1 finding)
            console.log('SCENE-NPCS party skipped:', String(error.message).slice(0, 120));
            break;
          }
        }
      }
      assert.ok(partyId, 'a generated site must be reached');
      assert.equal(arrivalResponse?.screen?.turn_id, arrivalPendingScreen?.turn_id,
        'the pending screen must be captured during narration for the arrival turn');
      const readback = await runtime.getPartyScreen(partyId);
      const pendingPeople = arrivalPendingScreen?.panels?.people;
      const responsePeople = arrivalResponse?.screen?.panels?.people;
      const readbackPeople = readback.screen?.panels?.people;
      const visibleNpcIds = (arrivalPendingScreen?.visible_context?.visible_npc ?? [])
        .map(({ entity_ref: ref }) => ref?.entity_id).filter(Boolean);
      const arrivalProjection = sceneProjectionDiagnostics.find(({ after }) =>
        visibleNpcIds.some((id) => after?.current_visible_npc_ids?.includes(id)))?.after;
      const projectionEvents = sceneProjectionDiagnostics.map(({ request_id: id, after }) => ({
        request_id: id, player: after?.player,
        candidates: after?.candidates,
        projection_npc_ids: after?.projection_npc_ids,
        current_visible_npc_ids: after?.current_visible_npc_ids
      }));
      assert.equal(readbackPeople?.visible, true,
        'the final screen readback must show its People panel');
      assert.equal(readbackPeople?.data?.visible_npcs?.length > 0, true,
        'the final screen readback must include the scene NPC');
      assert.equal(pendingPeople?.visible, true,
        `the pending arrival screen must show its People panel; visible NPC ids: ${
          JSON.stringify(visibleNpcIds)}; prepared projection: ${
          JSON.stringify(arrivalProjection ?? null)}; projection events: ${
          JSON.stringify(projectionEvents)}`);
      assert.equal(pendingPeople?.data?.visible_npcs?.length > 0, true,
        'the pending arrival screen must include the scene NPC');
      assert.deepEqual(responsePeople, readbackPeople,
        'the completed turn response and screen readback must agree on People');
      assert.deepEqual(pendingPeople, responsePeople,
        'the pending screen and completed screen must agree on People');

      const repository = createLowerDvinaTracePhase2PostgresRepository({ partyPool: env.partyPool,
        committer: { async commit() { throw new Error('read-only'); } } });
      const state = await repository.loadPhase2State(partyId);
      const loaded = state.npcs.filter((npc) => npc.runtime_source === SCENE_NPC_SOURCE);
      assert.equal(loaded.length > 0, true, 'NPCs of the generated site must be loaded');
      for (const npc of loaded) {
        assert.equal(typeof npc.g6_instance_id, 'string');
        assert.equal(npc.anchor_id, null);
        assert.equal(state.scene_position_g6[npc.position_id], npc.g6_instance_id);
      }
      const inScene = loaded.filter((npc) => npcSharesPlayerScene(state, npc));
      assert.equal(inScene.length > 0, true, 'a generated-site NPC shares the arrival G6');
      const start = state.npcs.filter((npc) => npc.runtime_source !== SCENE_NPC_SOURCE);
      assert.equal(start.some((npc) => npcSharesPlayerScene(state, npc)), false,
        'the start NPC of the other site is not co-present');
      const noModels = async () => { throw new Error('unused'); };
      const commands = liveWorldConversationCommands({ state, inputDigest: 'a'.repeat(64),
        authoredTurnProfile: profile, playerConversationModel: noModels, npcSemanticModel: noModels,
        temporalAdvanceOwner: null, revalidateStateVersion: async () => 1 });
      assert.deepEqual(commands.map(({ command_id: id }) => id.replace('live_world.conversation.', '')).sort(),
        inScene.map(({ instance_id: id }) => id).sort());

      // A committed turn (talking) must keep loaded NPCs out of the snapshot.
      const before = await snapshotNpcs(env.partyPool, partyId);
      const pending = (await env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1', [partyId])).rows[0].screen;
      assert.notEqual(pending?.screen_status, 'committed_presentation_pending',
        'the arrival presentation must be finished');
      const first = await runtime.submitTurn(partyId, { raw_text: TALK_TEXT, request_id: 'scene-npcs-talk' });
      const after = await snapshotNpcs(env.partyPool, partyId);
      assert.equal(Number(after.version) > Number(before.version), true);
      assert.equal((after.payload.npcs ?? []).some(
        (npc) => npc.runtime_source === SCENE_NPC_SOURCE
          || loaded.some(({ instance_id: id }) => id === npc.instance_id)), false);
      assert.equal(Object.hasOwn(after.payload, 'scene_position_g6'), false);
      // the whole snapshot, not only npcs: no scene-read record hides in schedule rows or turn data
      assert.deepEqual(pathsWith(after.payload, SCENE_NPC_SOURCE), []);
      assert.equal(after.payload.conversation_statements?.some(
        ({ speaker_ref: speaker }) => speaker?.entity_kind === 'npc'), true);
      // The same request again is an idempotent replay: the stored digests were computed
      // over the envelope that the snapshot keeps, so the replay evidence is recognised.
      const repeated = await runtime.submitTurn(partyId, { raw_text: TALK_TEXT,
        request_id: 'scene-npcs-talk' });
      assert.equal(typeof first.state_version, 'number');
      assert.equal(repeated.state_version, first.state_version);
      assert.equal(repeated.turn_number, first.turn_number);
      assert.ok(first.screen?.turn_id, 'the first answer carries a screen turn_id');
      assert.equal(repeated.screen?.turn_id, first.screen.turn_id);
      assert.deepEqual(repeated.screen?.current_projection_anchor,
        first.screen.current_projection_anchor);
      const afterRepeat = await snapshotNpcs(env.partyPool, partyId);
      assert.equal(afterRepeat.version, after.version, 'no second write for a repeat');
      const replay = await repository.loadPhase2Replay({ partyId,
        idempotencyKey: 'scene-npcs-talk' });
      assert.ok(replay, 'the stored turn is replayable');
      // the next load re-checks snapshot against rows and reads the scene NPCs again
      const reloaded = await repository.loadPhase2State(partyId);
      assert.equal(loaded.every(({ instance_id: id }) => reloaded.npcs.some(
        (npc) => npc.instance_id === id && npc.runtime_source === SCENE_NPC_SOURCE)), true);

      const stateBeforeRace = await snapshotNpcs(env.partyPool, partyId);
      const screenBeforeRace = (await env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1',
        [partyId])).rows[0].screen;
      const originalPoolQuery = env.partyPool.query.bind(env.partyPool);
      const originalConnect = env.partyPool.connect;
      const hadOwnConnect = Object.hasOwn(env.partyPool, 'connect');
      let changedAfterPreparedRead = false;
      const instrumentClient = (client) => {
        const originalClientQuery = client.query.bind(client);
        client.query = async (...queryArgs) => {
          const [statement, positionalValues] = queryArgs;
          const sql = typeof statement === 'string' ? statement : statement?.text;
          const values = positionalValues ?? statement?.values;
          if (!changedAfterPreparedRead
              && typeof sql === 'string'
              && /SELECT\s+party_id\s+FROM\s+party_runtime\.parties\s+WHERE\s+party_id=\$1\s+FOR\s+UPDATE/iu.test(sql)
              && values?.[0] === partyId) {
            const changed = await originalPoolQuery(
              'UPDATE party_runtime.parties SET state_version=state_version+1 WHERE party_id=$1',
              [partyId]);
            assert.equal(changed.rowCount, 1,
              'the test must change party state before P16 locks the party row');
            changedAfterPreparedRead = true;
          }
          return originalClientQuery(...queryArgs);
        };
        return client;
      };
      env.partyPool.connect = function (...args) {
        if (typeof args[0] === 'function') {
          return originalConnect.call(this, (error, client, release) => {
            if (error) return args[0](error);
            return args[0](null, instrumentClient(client), release);
          });
        }
        return originalConnect.apply(this, args).then(instrumentClient);
      };
      try {
        await assert.rejects(runtime.submitTurn(partyId, {
          raw_text: PRESENCE_E2E_MOVE_TEXT, request_id: 'scene-npcs-stale-prepared-read'
        }), { code: 'TRACE_TURN_STEP_COMMIT_FAILED' });
      } finally {
        if (hadOwnConnect) env.partyPool.connect = originalConnect;
        else delete env.partyPool.connect;
      }
      assert.equal(changedAfterPreparedRead, true,
        'the party version must change before P16 locks and rechecks it');
      const screenAfterRace = (await env.partyPool.query(
        'SELECT screen FROM party_runtime.party_server_sessions WHERE party_id=$1',
        [partyId])).rows[0].screen;
      assert.deepEqual(screenAfterRace, screenBeforeRace,
        'a rejected stale commit must not issue a pending presentation screen');
    } finally {
      await runtime.close();
    }
  });
