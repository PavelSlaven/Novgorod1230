import assert from 'node:assert/strict';
import test from 'node:test';
import { DETERMINISTIC_PROOFS, IMPOSSIBLE_PROBE, PUBLIC_PLAYTEST_MANIFEST, manifestDigest, preflightPublicPlaytestSeed, releaseCombatBranch, roleGate, runPublicPlaytest, sanitizeReport, stopOwnedServer } from '../public-playtest.mjs';

test('public playtest manifest is stable 20–30 named turns', () => { assert.equal(PUBLIC_PLAYTEST_MANIFEST.length, 25); assert.equal(new Set(PUBLIC_PLAYTEST_MANIFEST.map((turn) => turn.id)).size, 25); assert.match(manifestDigest(), /^[a-f0-9]{64}$/u); });
test('default seed passes deterministic causal preflight and branch 0 fails before server start', async () => {
  let starts = 0;
  await assert.rejects(() => runPublicPlaytest({ branch: 0, git: cleanGit,
    start: async () => { starts += 1; return localStart(); } }),
  { code: 'PUBLIC_PLAYTEST_SEED_INCAPABLE' });
  assert.equal(starts, 0);
  let startedEnv;
  const stop = new Error('stop after preflight');
  await assert.rejects(() => runPublicPlaytest({ git: cleanGit,
    start: async ({ env }) => { startedEnv = env; throw stop; } }),
  (error) => error === stop);
  assert.equal(startedEnv.RUS_PUBLIC_PLAYTEST_SCENARIO_SEED,
    'public-playtest:lower_dvina_trace_v1:branch:1');
  const proof = preflightPublicPlaytestSeed();
  assert.deepEqual(proof.gates.map(({ gate_id, pass }) => [gate_id, pass]),
    [['inspect', true], ['clue', true], ['surrender', true],
      ['treatment', true], ['combat', true]]);
  assert.deepEqual(proof.gates.map(({ results }) =>
    results.map(({ roll }) => roll)), [[18], [11], [18], [3], [9, 1, 11]]);
});
test('fire start requires causal evidence before the world-process follow-up', () => { const [start, affect] = PUBLIC_PLAYTEST_MANIFEST; assert.equal(start.id, 'fire-start'); assert.equal(start.expect, 'local_fire_started'); assert.equal(affect.id, 'fire-affect'); assert.deepEqual(affect.required_role_ids, ['turn_step_planner', 'world_process_step']); });
test('ordinary narration gates live writer then auditor, never repair', () => { const expected = ['gameplay_narrator', 'gameplay_narrator_auditor']; const ordinary = ['ordinary-use', 'carry'].map((id) => PUBLIC_PLAYTEST_MANIFEST.find((turn) => turn.id === id)); for (const turn of ordinary) assert.deepEqual(turn.required_waterfall, expected); const report = { observed_role_ids: [], turns: [{ turn_id: 'ordinary', scenario_class: 'free_form', status: 200, required_waterfall: expected, role_ids: expected, llm: { turn_duration_ms: 1, aggregate: { repair_calls: 0 }, waterfall: expected.map((role) => ({ role })) } }] }; assert.equal(roleGate(report).gaps.some((gap) => gap.includes('missing live waterfall')), false); report.turns[0].llm.waterfall = report.turns[0].llm.waterfall.slice(0, 1); assert.ok(roleGate(report).gaps.includes('missing live waterfall: ordinary: gameplay_narrator_auditor')); });
test('repair paths remain deterministic proofs, never live waterfall claims', () => { assert.deepEqual(DETERMINISTIC_PROOFS.map(({ id, proof_kind, test }) => [id, proof_kind, test]), [['impossible-action-grounding', 'deterministic_focused_test', 'apps/game-server/test/lower-dvina-trace-turn-step-llm.test.js#impossible jump and absent spaceship plans stay grounded model contracts/jump'], ['narration-failure-after-factual-commit', 'deterministic_focused_test', 'apps/game-server/test/lower-dvina-trace-phase-2.test.js#narration failure after factual commit returns its pending public result'], ['deadline-exhaustion-before-commit', 'deterministic_focused_test', 'apps/game-server/test/lower-dvina-trace-turn-budget-boundary.test.js#pre-commit reserve blocks phase 2 repository commit'], ['narration-localized-semantic-repair', 'deterministic_focused_test', 'packages/narration/test/narration-flow.test.js#repairs only auditor-flagged segment and re-audits complete prose'], ['cross-workflow-gameplay-repairs', 'deterministic_focused_test', 'apps/game-server/test/llm-turn-budget.test.js#cross-workflow gameplay repairs execute, duplicate repair is blocked before provider']]); assert.equal(PUBLIC_PLAYTEST_MANIFEST.some((turn) => turn.required_waterfall?.some((role) => role.includes('repair'))), false); const safe = sanitizeReport({ deterministic_proofs: DETERMINISTIC_PROOFS, gates: { pass: true, gaps: [], live_waterfalls: true, deterministic_proofs: DETERMINISTIC_PROOFS } }); assert.equal(safe.gates.live_waterfalls, true); assert.deepEqual(safe.gates.deterministic_proofs, DETERMINISTIC_PROOFS); assert.equal(JSON.stringify(safe.gates).includes('live_observed'), false); });
test('sanitizer uses strict public and diagnostic allowlists', () => { const safe = sanitizeReport({ api_key: 'secret', git: cleanGit(), public_responses: { turn: { status: 200, ok: true, data: { party_id: 'p', prose: 'hidden', turn: { turn_id: 't', mode: 'attention', summary: { outcome: 'not-a-code' } } } } }, turns: [{ turn_id: 'x', public_evidence: { expected: 'blue_wool_found', pass: false, prose: 'hidden' }, response: { status: 200, ok: true, data: { party_id: 'p', message: 'hidden' } }, llm: { turn_duration_ms: 4, turn_deadline_ms: 10, failure: { code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED', detail_code: 'generated_schema_mismatch', stage: 'write_plan_invariant', reason: 'hidden_party_42' }, waterfall: [{ role: 'turn_step_planner', duration_ms: 4, provider_payload: 'hidden' }], aggregate: { llm_calls: 1, deadline_exceeded: true, secret: 'hidden' } } }] }); assert.equal(safe.public_responses.turn.domain_outcome_code, undefined); assert.deepEqual(safe.turns[0].public_evidence, { expected: 'blue_wool_found', pass: false }); assert.equal(safe.turns[0].llm.aggregate.deadline_exceeded, true); assert.equal(safe.turns[0].llm.failure, null); assert.equal(JSON.stringify(safe).includes('hidden_party_42'), false); assert.equal(safe.turns[0].llm.waterfall[0].provider_payload, undefined); assert.equal(safe.turns[0].response.message, undefined); });
test('sanitizer retains only allowlisted narration failure categories', () => {
  const safe = sanitizeReport({ turns: [{ llm: { failure: {
    code: 'TRACE_PHASE_2_NARRATION_REJECTED',
    phase: 'final_audit_failed', concern_count: 3,
    concern_kinds: ['unsupported_fact', 'unsupported_success',
      'hidden-party-42'],
    prose: 'secret prose', prompt: 'secret prompt'
  } } }] });
  assert.deepEqual(safe.turns[0].llm.failure, {
    code: 'TRACE_PHASE_2_NARRATION_REJECTED',
    phase: 'final_audit_failed', concern_count: 3,
    concern_kinds: ['unsupported_fact', 'unsupported_success']
  });
  assert.equal(JSON.stringify(safe).includes('secret'), false);
  assert.equal(JSON.stringify(safe).includes('hidden-party-42'), false);
});
test('combat branch sanitizer retains no participant or arbitrary state', () => {
  const safe = sanitizeReport({ branch_outcome: 'ongoing_combat',
    public_responses: { screen: { combat_state: {
      status: 'paused_for_player', player_response_required: true,
      participant_ref: 'hidden-party-42' } } }, turns: [{ response: {
      combat_state: { status: 'SECRET_PROVIDER_DATA',
        player_response_required: true } } }] });
  assert.deepEqual(safe.public_responses.screen.combat_state, {
    status: 'paused_for_player', player_response_required: true });
  assert.equal(safe.turns[0].response.combat_state, null);
  assert.equal(JSON.stringify(safe).includes('hidden-party-42'), false);
  assert.equal(JSON.stringify(safe).includes('SECRET_PROVIDER_DATA'), false);
});
test('impossible 2xx requires public commit and planner observation', () => { const incomplete = roleGate({ observed_role_ids: [], turns: [{ turn_id: IMPOSSIBLE_PROBE.id, status: 200, expected_failure: true, response: {}, role_ids: [], llm: { turn_duration_ms: 1, turn_deadline_ms: 10, aggregate: { repair_calls: 0 } } }] }); assert.ok(incomplete.gaps.includes('impossible probe has no public committed turn: impossible-jump')); assert.ok(incomplete.gaps.includes('impossible probe planner not observed: impossible-jump')); const response = sanitizeReport({ turns: [{ response: traceTurn() }] }).turns[0].response; assert.equal(response.turn_id, 'turn-trace-1'); const observed = roleGate({ observed_role_ids: [], turns: [{ turn_id: IMPOSSIBLE_PROBE.id, status: 200, expected_failure: true, response, role_ids: ['turn_step_planner'], llm: { turn_duration_ms: 1, turn_deadline_ms: 10, aggregate: { repair_calls: 0 } } }] }); assert.equal(observed.gaps.some((gap) => gap.includes('impossible probe')), false); assert.equal(observed.deterministic_proofs.some(({ id }) => id === 'narration-failure-after-factual-commit'), true); });
test('deadline gate uses authoritative ceiling and LLM diagnostics, not client duration', () => { const withinDeadline = roleGate({ observed_role_ids: [], turns: [{ turn_id: 'x', status: 200, client_duration_ms: 99_999, llm: { turn_duration_ms: 1, turn_deadline_ms: 10, aggregate: { repair_calls: 0 } } }] }); assert.equal(withinDeadline.gaps.includes('deadline exceeded: x'), false); const ceilingExceeded = roleGate({ observed_role_ids: [], turns: [{ turn_id: 'ceiling', status: 200, llm: { turn_duration_ms: 30_000, turn_deadline_ms: 60_000, aggregate: { repair_calls: 0 } } }] }); assert.ok(ceilingExceeded.gaps.includes('deadline exceeded: ceiling')); const reportedExceeded = roleGate({ observed_role_ids: [], turns: [{ turn_id: 'y', status: 200, llm: { turn_duration_ms: 1, turn_deadline_ms: 60_000, aggregate: { repair_calls: 0, deadline_exceeded: true } } }] }); assert.ok(reportedExceeded.gaps.includes('deadline exceeded: y')); });
test('combat branch accepts only committed ready typed public states', () => {
  const value = (combat_state, extra = {}) => ({ status: 200,
    presentation_pending: false, response: { turn_id: 'turn-1',
      screen_status: 'ready', combat_state }, ...extra });
  assert.equal(releaseCombatBranch(value({ status: 'ended',
    player_response_required: false })), 'terminal_combat');
  assert.equal(releaseCombatBranch(value({ status: 'paused_for_player',
    player_response_required: true })), 'ongoing_combat');
  assert.equal(releaseCombatBranch(value({ status: 'paused_for_player',
    player_response_required: false })), null);
  assert.equal(releaseCombatBranch(value({ status: 'ended',
    player_response_required: false }, { response: { screen_status: 'ready' } })), null);
  assert.equal(releaseCombatBranch(value({ status: 'paused_for_player',
    player_response_required: true }, { presentation_pending: true })), null);
  assert.equal(releaseCombatBranch(value({ status: 'SECRET_PROVIDER_DATA',
    player_response_required: true })), null);
});
test('budget, pending presentation, and missing combat role remain failures', () => {
  const gate = roleGate({ observed_role_ids: [], turns: [{ turn_id: 'combat',
    status: 200, presentation_pending: true, llm: { turn_duration_ms: 1,
      aggregate: { budget_exhausted: true } } }] });
  assert.ok(gate.gaps.includes('budget exhausted: combat'));
  assert.ok(gate.gaps.includes('presentation pending: combat'));
  assert.ok(gate.gaps.includes('required role not observed: npc_combat_decider'));
});
test('ongoing combat is a legal release branch and skips Phase 9', async () => {
  const manifest = testManifest();
  const bodies = [];
  const report = await runPublicPlaytest({ manifest,
    impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart,
    fetchImpl: branchFetch(manifest, 'ongoing_combat', bodies),
    now: counter(), log() {} });
  assert.equal(report.branch_outcome, 'ongoing_combat');
  assert.equal(report.gates.pass, true);
  assert.equal(report.turns.at(-1).scenario_class, 'combat');
  assert.equal(report.public_responses.screen.combat_state.status,
    'paused_for_player');
  for (const skipped of [...manifest.slice(17), IMPOSSIBLE_PROBE]) {
    assert.equal(bodies.some(({ raw_text: raw }) => raw === skipped.raw_text),
      false);
  }
});
test('terminal combat continues through Phase 9 and the live impossible probe',
  async () => {
    const manifest = testManifest();
    const bodies = [];
    const report = await runPublicPlaytest({ manifest,
      impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart,
      fetchImpl: branchFetch(manifest, 'terminal_combat', bodies),
      now: counter(), log() {} });
    assert.equal(report.branch_outcome, 'terminal_combat');
    assert.equal(report.gates.pass, true);
    for (const executed of [manifest[17], manifest[18], manifest[19],
      IMPOSSIBLE_PROBE]) {
      assert.equal(bodies.some(({ raw_text: raw }) => raw === executed.raw_text),
        true);
    }
  });
test('repair gate permits distinct roles and rejects a repeated repair role', () => { const turn = (waterfall) => ({ turn_id: 'repair', status: 200, llm: { turn_duration_ms: 1, aggregate: { repair_calls: waterfall.length }, waterfall } }); const distinct = roleGate({ observed_role_ids: [], turns: [turn(['planner_repair', 'narrator_format_repair', 'narrator_semantic_repair'].map((role) => ({ role, repair: true })))] }); assert.equal(distinct.gaps.some((gap) => gap.includes('repair')), false); const repeated = roleGate({ observed_role_ids: [], turns: [turn(['narrator_semantic_repair', 'narrator_semantic_repair'].map((role) => ({ role, repair: true })))] }); assert.ok(repeated.gaps.includes('repeated repair role: repair: narrator_semantic_repair')); });
test('runner snapshots clean exact git before starting', async () => { let started = false; for (const git of [() => ({ head: 'short', dirty: false }), () => ({ head: 'a'.repeat(40), dirty: true })]) await assert.rejects(() => runPublicPlaytest({ git, start: async () => { started = true; } }), { code: 'PUBLIC_PLAYTEST_GIT_EVIDENCE_INVALID' }); assert.equal(started, false); });
test('runner reads diagnostics before pending ack and retains both attempts', async () => { const responses = [health(), catalog(), newGame(), ack(), pendingTurn(), diagnostics({ duration: 15_000, deadline: 60_000, role: 'turn_step_planner', repairCalls: 1, llmCalls: 2 }), turn(), diagnostics({ duration: 15_000, deadline: 60_000, role: 'turn_step_presenter', llmCalls: 1, budgetExhausted: true })]; const requests = []; await assert.rejects(() => runPublicPlaytest({ manifest: evidenceFirstManifest(), impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart, fetchImpl: async (url, request) => { requests.push({ url, body: request.body && JSON.parse(request.body) }); return responses.shift(); }, now: counter(), log() {} }), (error) => { const turn = error.report.turns[0]; assert.equal(turn.presentation_ack.screen_status, 'ready'); assert.deepEqual(turn.role_ids, ['turn_step_planner', 'turn_step_presenter']); assert.equal(turn.llm.turn_duration_ms, 30_000); assert.equal(turn.llm.aggregate.repair_calls, 1); assert.equal(turn.llm.aggregate.llm_calls, 3); assert.equal(turn.llm.aggregate.budget_exhausted, true); assert.deepEqual(turn.llm.attempts.map((attempt) => attempt.turn_deadline_ms), [60_000, 60_000]); assert.ok(error.report.gates.gaps.includes('deadline exceeded: probe-0')); return true; }); assert.match(requests[5].url, /developer\/llm-turn-reports/); assert.match(requests[6].url, /\/turns$/); assert.match(requests[7].url, /developer\/llm-turn-reports/); assert.deepEqual(requests[4].body, requests[6].body); });
test('runner skips presentation acknowledgement when turn is ready', async () => { const responses = [health(), catalog(), newGame(), ack(), turn(), diagnostics()]; const bodies = []; await assert.rejects(() => runPublicPlaytest({ manifest: evidenceFirstManifest(), impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart, fetchImpl: async (_url, request) => { if (request.body) bodies.push(JSON.parse(request.body)); return responses.shift(); }, now: counter(), log() {} }), (error) => { assert.equal(error.report.turns[0].presentation_ack.status, 0); return true; }); assert.equal(bodies.length, 3); });
test('runner rejects repeated pending presentation with typed local failure', async () => { const responses = [health(), catalog(), newGame(), ack(), pendingTurn(), diagnostics(), pendingTurn(), diagnostics()]; await assert.rejects(() => runPublicPlaytest({ manifest: testManifest(), impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart, fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.equal(error.code, 'PUBLIC_PLAYTEST_PRESENTATION_PENDING'); assert.deepEqual(error.report.turn_failure, { turn_id: 'probe-0', code: 'PUBLIC_PLAYTEST_PRESENTATION_PENDING', http_status: null, public_error_code: null }); assert.equal(error.report.turns[0].presentation_pending, true); assert.equal(error.report.turns[0].llm.attempts.length, 2); return true; }); });
test('runner reports failed presentation acknowledgement without unsafe payload', async () => { const responses = [health(), catalog(), newGame(), ack(), pendingTurn(), diagnostics(), { ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'PRESENTATION_DOWN', message: 'do not retain' } }) }]; await assert.rejects(() => runPublicPlaytest({ manifest: testManifest(), impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart, fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.deepEqual(error.report.turn_failure, { turn_id: 'probe-0', code: 'PUBLIC_HTTP_FAILED', http_status: 503, public_error_code: 'PRESENTATION_DOWN' }); assert.equal(JSON.stringify(error.report).includes('do not retain'), false); return true; }); });
test('runner retains partial turns when a later turn fails', async () => { const responses = [health(), catalog(), newGame(), ack(), turn(), diagnostics(), { ok: false, status: 503, json: async () => ({ ok: false }) }]; const manifest = testManifest(); await assert.rejects(() => runPublicPlaytest({ manifest, impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: async () => ({ url: 'http://local', child: { exitCode: 0, kill() {} } }), fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.ok(error.report, error.message); assert.deepEqual(error.report.git, cleanGit()); assert.equal(error.report.turns.length, 1); assert.equal(error.report.turn_failure.turn_id, 'probe-1'); return true; }); });
test('runner retains only safe status and public error code from failed turn', async () => { const responses = [health(), catalog(), newGame(), ack(), turn(), diagnostics(), { ok: false, status: 503, json: async () => ({ ok: false, error: { code: 'SAFE_CODE', message: 'do not retain' } }) }]; const manifest = testManifest(); await assert.rejects(() => runPublicPlaytest({ manifest, impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: async () => ({ url: 'http://local', child: { exitCode: 0, kill() {} } }), fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.deepEqual(error.report.turn_failure, { turn_id: 'probe-1', code: 'PUBLIC_HTTP_FAILED', http_status: 503, public_error_code: 'SAFE_CODE' }); assert.equal(JSON.stringify(error.report).includes('do not retain'), false); return true; }); });
test('runner retains diagnostics from a failed public turn without retrying it',
  async () => {
    const responses = [health(), catalog(), newGame(), ack(), {
      ok: false,
      status: 409,
      json: async () => ({ ok: false, error: {
        code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
        message: 'do not retain'
      } })
    }, diagnostics({ duration: 9, deadline: 30_000,
      role: 'gameplay_narrator_auditor', llmCalls: 3, repairCalls: 1,
      failure: {
        code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
        detail_code: 'lock_order_violation',
        stage: 'write_plan_invariant',
        reason: 'physical_lock_key_missing'
      } })];
    const requests = [];
    await assert.rejects(() => runPublicPlaytest({ manifest: testManifest(),
      impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart,
      fetchImpl: async (url, request) => {
        requests.push({ url, method: request.method });
        return responses.shift();
      }, now: counter(), log() {} }), (error) => {
      assert.deepEqual(error.report.turn_failure, {
        turn_id: 'probe-0', code: 'PUBLIC_HTTP_FAILED', http_status: 409,
        public_error_code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED'
      });
      assert.equal(error.report.turns.length, 1);
      assert.deepEqual(error.report.turns[0].role_ids,
        ['gameplay_narrator_auditor']);
      assert.equal(error.report.turns[0].llm_calls, 3);
      assert.deepEqual(error.report.turns[0].llm.failure, {
        code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
        detail_code: 'lock_order_violation',
        stage: 'write_plan_invariant',
        reason: 'physical_lock_key_missing'
      });
      assert.equal(JSON.stringify(error.report).includes('do not retain'), false);
      return true;
    });
    assert.equal(requests.filter(({ url, method }) =>
      method === 'POST' && /\/turns$/u.test(url)).length, 1);
    assert.match(requests.at(-1).url, /developer\/llm-turn-reports/u);
  });
test('consecutive runs keep scenario seed but use unique party and idempotency identities', async () => {
  const runs = [];
  for (const [suffix, head] of [['first', 'a'], ['second', 'b']]) {
    const responses = [health(), catalog(), newGame(`party-${suffix}`), ack(),
      turn(), diagnostics()];
    const bodies = [];
    let startedEnv;
    await assert.rejects(() => runPublicPlaytest({
      manifest: PUBLIC_PLAYTEST_MANIFEST.slice(2),
      git: () => ({ head: head.repeat(40), dirty: false }),
      branch: 1,
      createRunIdentity: () => `run-${suffix}`,
      start: async ({ env }) => {
        startedEnv = env;
        return { url: 'http://local', child: { exitCode: 0, kill() {} } };
      },
      fetchImpl: async (_url, request) => {
        if (request.body) bodies.push(JSON.parse(request.body));
        return responses.shift();
      },
      now: counter(), log() {}
    }), (error) => {
      assert.equal(error.code, 'PUBLIC_PLAYTEST_CAUSAL_EVIDENCE_MISSING');
      runs.push({ report: error.report, bodies, startedEnv });
      return true;
    });
  }
  const [first, second] = runs;
  const seed = 'public-playtest:lower_dvina_trace_v1:branch:1';
  assert.equal(first.report.scenario_seed, seed);
  assert.equal(second.report.scenario_seed, seed);
  assert.deepEqual([first.report.run_identity, second.report.run_identity],
    ['run-first', 'run-second']);
  assert.deepEqual([first.report.git.head, second.report.git.head],
    ['a'.repeat(40), 'b'.repeat(40)]);
  assert.deepEqual([
    first.report.public_responses.new_game.party_id,
    second.report.public_responses.new_game.party_id
  ], ['party-first', 'party-second']);
  assert.notEqual(first.bodies[0].request_id, second.bodies[0].request_id);
  assert.deepEqual([first.bodies[2].request_id, second.bodies[2].request_id],
    [`${seed}:inspect`, `${seed}:inspect`]);
  assert.deepEqual([
    first.bodies[2].idempotency_key,
    second.bodies[2].idempotency_key
  ], ['run-first:inspect', 'run-second:inspect']);
  assert.equal(first.startedEnv.RUS_PUBLIC_PLAYTEST_SCENARIO_SEED, seed);
  assert.equal(second.startedEnv.RUS_PUBLIC_PLAYTEST_SCENARIO_SEED, seed);
});
test('runner stops at surrender when public marker is absent', async () => { const responses = [health(), catalog(), newGame(), ack(), turn(), diagnostics()]; const bodies = []; await assert.rejects(() => runPublicPlaytest({ manifest: surrenderFirstManifest(), impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: async () => ({ url: 'http://local', child: { exitCode: 0, kill() {} } }), fetchImpl: async (_url, request) => { if (request.body) bodies.push(JSON.parse(request.body)); return responses.shift(); }, now: counter(), log() {} }), (error) => { assert.equal(error.code, 'PUBLIC_PLAYTEST_CAUSAL_EVIDENCE_MISSING'); assert.equal(error.report.turn_failure.turn_id, 'surrender'); assert.deepEqual(error.report.turns[0].public_evidence, { expected: 'ratsha_surrendered', pass: false }); return true; }); assert.equal(bodies.some(({ raw_text }) => raw_text === 'Оказать Онисиму первую помощь.'), false); });
test('treatment evidence accepts both code-owned terminal check outcomes', async () => { const treatment = PUBLIC_PLAYTEST_MANIFEST.find(({ id }) => id === 'treatment'); assert.equal(treatment.expect, 'onisim_treatment_completed'); for (const marker of ['onisim_stabilized_unable_to_walk', 'onisim_first_aid_completed_without_stabilization']) { const responses = [health(), catalog(), newGame(), ack(), turn([marker]), diagnostics(), { ok: false, status: 503, json: async () => ({ ok: false }) }]; await assert.rejects(() => runPublicPlaytest({ manifest: [treatment, ...testManifest().slice(1)], impossibleProbe: IMPOSSIBLE_PROBE, git: cleanGit, start: localStart, fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.equal(error.report.turns[0].public_evidence.pass, true); return true; }); } });
test('manifest role evidence reports compound prerequisite gaps', () => { const gate = roleGate({ observed_role_ids: [], turns: [{ turn_id: 'rest', required_role_ids: ['turn_step_planner', 'npc_autonomous_decider'], role_ids: ['turn_step_planner'], status: 200, llm: { turn_duration_ms: 1, turn_deadline_ms: 10, aggregate: { repair_calls: 0 } } }] }); assert.ok(gate.gaps.includes('missing compound prerequisite: rest: npc_autonomous_decider')); });
test('ordinary discovery requires local planner and materialization evidence', () => { const turn = PUBLIC_PLAYTEST_MANIFEST.find(({ id }) => id === 'ordinary-discovery'); assert.deepEqual(turn.required_role_ids, ['turn_step_planner', 'ordinary_materialization']); const camp = PUBLIC_PLAYTEST_MANIFEST.findIndex(({ id }) => id === 'camp'); const discovery = PUBLIC_PLAYTEST_MANIFEST.findIndex(({ id }) => id === 'ordinary-discovery'); const use = PUBLIC_PLAYTEST_MANIFEST.findIndex(({ id }) => id === 'ordinary-use'); const route = PUBLIC_PLAYTEST_MANIFEST.findIndex(({ id }) => id === 'route'); assert.ok(camp < discovery && discovery < use && use < route); const gate = roleGate({ observed_role_ids: [], turns: [{ turn_id: turn.id, required_role_ids: turn.required_role_ids, role_ids: ['turn_step_planner'], status: 200, llm: { turn_duration_ms: 1, turn_deadline_ms: 10, aggregate: { repair_calls: 0 } } }] }); assert.ok(gate.gaps.includes('missing compound prerequisite: ordinary-discovery: ordinary_materialization')); });
test('runner fails partial report when git snapshot changes during run', async () => { const responses = [health(), catalog(), newGame(), ack(), turn(), diagnostics(), { ok: false, status: 503, json: async () => ({ ok: false }) }]; const manifest = testManifest(); let calls = 0; await assert.rejects(() => runPublicPlaytest({ manifest, impossibleProbe: IMPOSSIBLE_PROBE, git: () => ++calls === 1 ? cleanGit() : { head: 'b'.repeat(40), dirty: false }, start: async () => ({ url: 'http://local', child: { exitCode: 0, kill() {} } }), fetchImpl: async () => responses.shift(), now: counter(), log() {} }), (error) => { assert.equal(error.code, 'PUBLIC_PLAYTEST_GIT_SNAPSHOT_CHANGED'); assert.deepEqual(error.report.git_after, { head: 'b'.repeat(40), dirty: false }); return true; }); });
test('owned server waits for SIGTERM then uses SIGKILL fallback', async () => { const signals = []; await stopOwnedServer({ exitCode: null, kill(signal) { signals.push(signal); }, once() {} }, { timeoutMs: 1, sleep: async () => {} }); assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); });
function cleanGit() { return { head: 'a'.repeat(40), dirty: false }; }
function testManifest() { return PUBLIC_PLAYTEST_MANIFEST.map(({ expect: _expect, ...turn }, index) => ({ ...turn, id: `probe-${index}` })); }
function evidenceFirstManifest() { const manifest = testManifest(); return [{ ...manifest[0], expect: 'blue_wool_found' }, ...manifest.slice(1)]; }
function surrenderFirstManifest() { const surrender = PUBLIC_PLAYTEST_MANIFEST.find(({ id }) => id === 'surrender'); return [surrender, ...PUBLIC_PLAYTEST_MANIFEST.filter(({ id }) => id !== 'surrender')]; }
function branchFetch(manifest, outcome, bodies) {
  const combatIndex = manifest.findLastIndex(
    ({ scenario_class: scenarioClass }) => scenarioClass === 'combat');
  const executed = outcome === 'ongoing_combat'
    ? manifest.slice(0, combatIndex + 1) : [...manifest, IMPOSSIBLE_PROBE];
  const state = outcome === 'ongoing_combat'
    ? { status: 'paused_for_player', player_response_required: true }
    : { status: 'ended', player_response_required: false };
  const responses = [health(), catalog(), newGame(), ack()];
  for (const [index, entry] of executed.entries()) {
    responses.push(turn([], index === combatIndex ? state : null));
    const roles = [...new Set([...(entry.required_role_ids ?? []),
      ...(entry.required_waterfall ?? []),
      ...(entry.expectedFailure ? ['turn_step_planner'] : [])])];
    responses.push(diagnosticsRoles(roles));
  }
  responses.push(finalScreen(outcome === 'ongoing_combat' ? state : null));
  return async (_url, request) => {
    if (request.body) bodies.push(JSON.parse(request.body));
    return responses.shift();
  };
}
function counter() { let value = 0; return () => ++value; }
const localStart = async () => ({ url: 'http://local', child: { exitCode: 0, kill() {} } });
function json(data) { return async () => ({ ok: true, data }); }
function health() { return { ok: true, status: 200, json: json({ status: 'ok' }) }; }
function catalog() { return { ok: true, status: 200, json: json({ scenarios: [{ scenario_id: 'lower_dvina_trace_v1', available: true }] }) }; }
function newGame(partyId = 'party-1') { return { ok: true, status: 201, json: json({ party_id: partyId }) }; }
function ack() { return { ok: true, status: 200, json: json({ party_id: 'party-1' }) }; }
function traceTurn() { return { status: 200, ok: true, data: { party_id: 'party-1', state_version: 7, option_id: 'wait', screen: { turn_id: 'turn-trace-1', turn_number: 1, screen_status: 'ready' } } }; }
function turn(visibleChanges = [], combatState = null) { return { ok: true, status: 200, json: json({ party_id: 'party-1', turn: { turn_id: 'turn-1', status: 'resolved', mode: 'attention' }, screen: { schema: 'turn_screen', version: 1, screen_status: 'ready', ...(combatState == null ? {} : { combat_state: combatState }), visible_context: { visible_changes: visibleChanges } } }) }; }
function finalScreen(combatState = null) { return { ok: true, status: 200,
  json: json({ party_id: 'party-1', screen: { schema: 'turn_screen',
    version: 1, screen_status: 'ready', ...(combatState == null ? {}
      : { combat_state: combatState }) } }) }; }
function pendingTurn() { return { ok: true, status: 200, json: json({ party_id: 'party-1', schema: 'turn_screen', version: 1, screen_status: 'committed_presentation_pending', turn: { turn_id: 'turn-1', status: 'resolved', mode: 'attention' } }) }; }
function diagnostics({ duration = 1, deadline = 10, role = null, repairCalls = 0, llmCalls = 0, budgetExhausted = false, failure = null } = {}) { return { ok: true, status: 200, json: json({ turn_duration_ms: duration, turn_deadline_ms: deadline, waterfall: role ? [{ role, duration_ms: duration, status: 'ok', repair: repairCalls > 0 }] : [], aggregate: { repair_calls: repairCalls, llm_calls: llmCalls, budget_exhausted: budgetExhausted }, failure }) }; }
function diagnosticsRoles(roles) { return { ok: true, status: 200,
  json: json({ turn_duration_ms: 1, turn_deadline_ms: 30_000,
    waterfall: roles.map((role) => ({ role, duration_ms: 1, status: 'ok',
      repair: false })), aggregate: { repair_calls: 0,
      llm_calls: roles.length, budget_exhausted: false } }) }; }
