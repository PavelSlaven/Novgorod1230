import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { projectPerceivedPeopleAbsence } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';

const ACTION = 'Здороваюсь с человеком.';
const SCENARIO = 'novgorod_zaostrovye_settlement_approach_v1';
// Public request_id fixes party identity and therefore the authored/NPC seeds.
const START_REQUEST_ID = 'issue-573:novgorod_zaostrovye_settlement_approach_v1:seed-1';

test('ожидаемо красный, issue #573: v17 greeting without a visible target gives writer a perceived cause',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const requestLog = [];
    const narrationLog = [];
    const plannerRequests = [];
    const restoreFetch = installPresenceProductionE2eFetch({
      requestLog,
      narrationLog,
      turnStepPlanner: ({ request }) => {
        plannerRequests.push(structuredClone(request));
        return {
          operation_choice: null,
          interpretation: { player_goal: ACTION, grounded_attempt: ACTION,
            adaptation: 'literal' },
          resolution: 'direct', goal_result: 'not_achieved',
          activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
          operations: [], check: null, continuation: null, clarification: null,
          direct_result_kind: null,
          reason_code: 'no_visible_greeting_target',
          reason: 'В переданной сцене нет видимого человека, к которому можно обратиться.',
        };
      },
    });
    t.after(restoreFetch);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    assert.equal(runtime.health().release_id, 'spatial-v3-production-v17');
    const opening = await runtime.startNewGame({
      scenario_id: SCENARIO, request_id: START_REQUEST_ID,
    });
    const partyId = opening.party_id;
    const seeds = (await env.partyPool.query(
      `SELECT run_id, seed_digest, rng_version, trace->'npc_selection_trace' AS npc_selection_trace
         FROM party_runtime.party_materialization_runs
        WHERE party_id=$1 AND run_kind='baseline' AND run_id LIKE 'authored_%'`,
      [partyId],
    )).rows;
    assert.equal(seeds.length, 1, 'precondition: persisted authored-start seed is available');
    assert.match(seeds[0].seed_digest, /^[a-f0-9]{64}$/u);
    assert.match(seeds[0].npc_selection_trace.seed_digest, /^[a-f0-9]{64}$/u);
    t.diagnostic(`issue573 seed: ${JSON.stringify({ scenario_id: SCENARIO,
      start_request_id: START_REQUEST_ID, party_id: partyId, ...seeds[0] })}`);
    await runtime.acknowledgeOpening(partyId, { client_ack_id: 'issue-573-opening-ack' });
    // Discard opening calls: only the submitted greeting may supply this beat.
    requestLog.length = 0;
    narrationLog.length = 0;
    const result = await runtime.submitTurn(partyId, {
      raw_text: ACTION, request_id: 'issue-573-greeting',
    });
    assert.equal(plannerRequests.length, 1, 'precondition: one accepted direct greeting plan');
    assert.equal(plannerRequests[0].root_player_action, ACTION);
    const scene = plannerRequests[0].player_safe_state?.current_visible_context;
    t.diagnostic(`issue573 perception: ${JSON.stringify({ scenario_id: SCENARIO,
      start_request_id: START_REQUEST_ID, visible_npc: scene?.visible_npc })}`);
    assert.ok(scene, 'precondition: production planner receives current perception');
    assert.deepEqual(scene.visible_npc, [], 'precondition: no visible greeting target');
    assert.ok(narrationLog.length > 0, 'precondition: production turn reaches writer');
    assert.equal(Number(result.screen.turn_number), 1, 'precondition: turn commits and delivers');
    const writer = requestLog.find(({ system, user }) =>
      system.startsWith('Return only {"prose"') && user.required_current_beat);
    assert.ok(writer, 'precondition: actual provider request contains turn writer beat');
    const changes = writer.user.required_current_beat.changes.map(({ text }) => text);
    t.diagnostic(`issue573: ${JSON.stringify({ release: runtime.health().release_id,
      scenario_id: SCENARIO, start_request_id: START_REQUEST_ID,
      seed_digest: seeds[0].seed_digest,
      npc_seed_digest: seeds[0].npc_selection_trace.seed_digest,
      action: ACTION, visible_npc: scene.visible_npc, writer_changes: changes })}`);
    // No default output path: CI runs this without writing captures.
    if (process.env.ISSUE_573_CAPTURE_DIR) {
      await mkdir(process.env.ISSUE_573_CAPTURE_DIR, { recursive: true });
      await writeFile(join(process.env.ISSUE_573_CAPTURE_DIR, 'v17-greeting.json'),
        JSON.stringify({ scenario_id: SCENARIO, start_request_id: START_REQUEST_ID,
          seeds, planner: plannerRequests[0], writer, changes }, null, 2));
    }
    // The planner projection omits these policy lists; all perception facts stay intact.
    const perceivedAbsence = projectPerceivedPeopleAbsence({ currentVisibleContext: {
      ...scene, allowed_tensions: [], do_not_imply: [] },
      currentSpatialContextIsFresh: true, currentSpatialContextFiltersEntities: true });
    assert.ok(perceivedAbsence != null && changes.includes(perceivedAbsence),
      `issue #573: writer needs a perceived absence of a greeting target, not only goal status; got ${JSON.stringify(changes)}`);
    assert.doesNotMatch(perceivedAbsence,
      /[a-z]|Цель .*не достигнута|(?:человек|собеседник)[^.]*?(?:ответил|промолчал|не ответил)|(?<!\p{L})(?:виден|видна|видно|видны)(?!\p{L})/iu);
    assert.equal(changes.some((fact) => /^Цель .*не достигнута\.$/u.test(fact)), false,
      'issue #573: a goal status plus raw intent is not a perceived result');
    assert.equal(changes.some((fact) => /(?:человек|собеседник)[^.]*?(?:ответил|промолчал|не ответил)/iu.test(fact)), false,
      'issue #573: absence of a visible target cannot confirm a response or silence');
  });
