import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { executeCheck } from '@rus/checks-rng';
import { safeWritePlanFailure } from '../../apps/game-server/src/runtime/llm-diagnostics.js';
import { createTraceRandomSourceFactory } from '../../apps/game-server/src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { startLocalPlay } from './local-play.js';

const SCENARIO_ID = 'lower_dvina_trace_v1';
export const PUBLIC_PLAYTEST_BRANCH = 1;
const REQUIRED_ROLES = Object.freeze(['player_conversation_interpreter', 'npc_conversation_responder', 'npc_autonomous_decider', 'npc_combat_decider', 'ordinary_materialization', 'world_process_step']);
const AUTHORITATIVE_TURN_CEILING_MS = 30_000;
const IMPOSSIBLE_DOMAIN_REJECTION_TEST = 'apps/game-server/test/lower-dvina-trace-turn-step-llm.test.js#impossible jump and absent spaceship plans stay grounded model contracts/jump';
export const DETERMINISTIC_PROOFS = Object.freeze([
  proof('narration-failure-after-factual-commit', 'apps/game-server/test/lower-dvina-trace-phase-2.test.js#narration failure after factual commit returns its pending public result'),
  proof('deadline-exhaustion-before-commit', 'apps/game-server/test/lower-dvina-trace-turn-budget-boundary.test.js#pre-commit reserve blocks phase 2 repository commit'),
  proof('narration-localized-semantic-repair', 'packages/narration/test/narration-flow.test.js#repairs only auditor-flagged segment and re-audits complete prose'),
  proof('cross-workflow-gameplay-repairs', 'apps/game-server/test/llm-turn-budget.test.js#cross-workflow gameplay repairs execute, duplicate repair is blocked before provider')
]);
const TERMINAL = new Set(['completed', 'ended', 'terminal']);
export const PUBLIC_PLAYTEST_MANIFEST = Object.freeze([
  entry('fire-start', 'world_process', 'Разжечь огонь кресалом, используя сухую растопку.', { required_waterfall: ['gameplay_narrator', 'gameplay_narrator_auditor'] }), entry('fire-affect', 'world_process', 'Вылить всю имеющуюся воду на горящий огонь.', { required_role_ids: ['turn_step_planner', 'world_process_step'] }), entry('inspect', 'inspection', 'Осмотреть место крушения подробно.', { expect: 'blue_wool_found' }), entry('camp', 'movement', 'Дойти до рыбацкого стана.'), entry('ordinary-discovery', 'ordinary_materialization', 'Поискать на берегу у стана обычную сухую ветку, если она там есть.', { required_role_ids: ['turn_step_planner', 'ordinary_materialization'] }), entry('ordinary-use', 'free_form', 'Использовать найденную сухую ветку как простую указку, не создавая новых вещей.', { required_waterfall: ['gameplay_narrator', 'gameplay_narrator_auditor'] }), entry('clue', 'conversation', 'Показать улику Еремею и попросить помочь.', { expect: 'route_to_shed_disclosed' }), entry('route', 'movement', 'Пройти известной тропой к старой сушильне.', { expect: 'onisim_found' }), entry('surrender', 'conversation', 'Предложить Ратше условную защиту и потребовать сдачи.', { expect: 'ratsha_surrendered' }), entry('treatment', 'physical_action', 'Оказать Онисиму первую помощь.', { expect: 'onisim_treatment_completed' }), entry('carry', 'physical_transformation', 'Сделать носилки и отнести Онисима в стан.', { expect: 'onisim_carried', required_waterfall: ['gameplay_narrator', 'gameplay_narrator_auditor'] }), entry('rest', 'world_process', 'Отдохнуть у огня полчаса и подсушить одежду. Попросить Еремея и рыбака пойти со мной к Жданко.', { required_role_ids: ['turn_step_planner', 'npc_autonomous_decider', 'player_conversation_interpreter', 'npc_conversation_responder'] }), entry('phase8-route', 'movement', 'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.'), entry('accuse', 'autonomous_npc', 'Обвинить Жданко и потребовать вернуть дорожную сумку.'), entry('combat', 'combat', 'Помочь Еремею обезоружить Жданко, не убивая его.'), entry('combat-followup-1', 'combat', 'Сдержать Жданко, не убивая его.'), entry('combat-followup-2', 'combat', 'Не дать Жданко уйти и не наносить лишнего вреда.'), entry('bag', 'physical_action', 'Забрать дорожную сумку у Жданко.'), entry('open', 'physical_action', 'Открыть возвращённую дорожную сумку.'), entry('packet', 'inspection', 'Извлечь свёрток и осмотреть печать, не вскрывая документ.'), entry('return', 'movement', 'Вернуться всей группой к Онисиму.'), entry('testimony', 'conversation', 'Попросить Онисима рассказать, что он знает о Жданко и свёртке.'), entry('evidence', 'world_process', 'Сопоставить все подтверждённые доказательства.'), entry('disposition', 'world_process', 'Зафиксировать временное решение по людям, имуществу и обещанию.'), entry('disposition-replay', 'world_process', 'Ещё раз проверить и зафиксировать временное решение по людям, имуществу и обещанию.')
]);
export const IMPOSSIBLE_PROBE = Object.freeze(entry('impossible-jump', 'impossible_domain', 'Прыгну очень высоко и осмотрю окрестности как птица', { expectedFailure: true }));

export async function runPublicPlaytest({ start = startLocalPlay, fetchImpl = fetch, manifest = PUBLIC_PLAYTEST_MANIFEST, impossibleProbe = IMPOSSIBLE_PROBE, now = () => Date.now(), git = gitState, branch = PUBLIC_PLAYTEST_BRANCH, createRunIdentity = () => `public-playtest-run:${randomUUID()}`, log = console.log, stop = stopOwnedServer } = {}) {
  assertManifest(manifest);
  const gitSnapshot = requireCleanGitSnapshot(git());
  const scenarioSeed = playtestSeed(branch);
  preflightPublicPlaytestSeed(branch);
  const runIdentity = text(createRunIdentity());
  if (!runIdentity) throw new TypeError('createRunIdentity must return a non-empty identity.');
  const local = await start({ env: { ...process.env, RUS_DEVELOPER_MODE: 'true',
    RUS_PUBLIC_PLAYTEST_SCENARIO_SEED: scenarioSeed } });
  try {
    const http = createPublicClient(local.url, fetchImpl, now);
    const health = await http.get('/api/v1/health'); const catalog = await http.get('/api/v1/scenarios'); assertCurrentCatalog(catalog.data);
    const created = await http.post('/api/v1/new-games', { scenario_id: SCENARIO_ID,
      request_id: `${runIdentity}:new-game` }, 201);
    const partyId = text(created.data?.party_id); if (!partyId) throw gateError('PLAYTEST_PARTY_ID_MISSING', 'new-game response has no party_id.');
    const ack = await http.post(`/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, { client_ack_id: `${runIdentity}:opening` });
    const turns = []; let stopReason = null; let turnFailure = null;
    for (const turn of [...manifest, impossibleProbe]) {
      try { const result = await runTurn({ turn, partyId, http, now,
        scenarioSeed, runIdentity }); turns.push(result); if (result.presentation_pending) { turnFailure = { turn_id: turn.id, code: 'PUBLIC_PLAYTEST_PRESENTATION_PENDING' }; break; } if (!result.public_evidence.pass) { turnFailure = { turn_id: turn.id, code: 'PUBLIC_PLAYTEST_CAUSAL_EVIDENCE_MISSING' }; break; } if (missingTurnRoleEvidence(result).length) { turnFailure = { turn_id: turn.id, code: 'PUBLIC_PLAYTEST_PREREQUISITE_MISSING' }; break; } if (isTerminal(result)) { stopReason = `terminal completion before remaining probes: ${turn.id}`; break; } }
      catch (error) { if (error.failedTurn) turns.push(error.failedTurn); turnFailure = { turn_id: turn.id, code: text(error.code) || 'PUBLIC_PLAYTEST_TURN_FAILED', http_status: error.report?.status, public_error_code: error.report?.public_error_code }; break; }
    }
    const screen = turnFailure || stopReason ? null : await http.get(`/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    const finalGitSnapshot = requireCleanGitSnapshot(git());
    const report = buildReport({ gitSnapshot, finalGitSnapshot, scenarioSeed,
      runIdentity, manifest, health, catalog, created, ack, screen, turns,
      stopReason, turnFailure }); report.gates = roleGate(report);
    if (!sameGitSnapshot(gitSnapshot, finalGitSnapshot)) throw gateError('PUBLIC_PLAYTEST_GIT_SNAPSHOT_CHANGED', 'Git snapshot changed during public playtest.', report);
    if (turnFailure) throw gateError(turnFailure.code, `turn failed: ${turnFailure.turn_id}`, report);
    if (!report.gates.pass) throw gateError('PUBLIC_PLAYTEST_GATE_FAILED', report.gates.gaps.join('; '), report);
    log(JSON.stringify(report)); return report;
  } finally { await stop(local.child); }
}

function buildReport({ gitSnapshot, finalGitSnapshot, scenarioSeed, runIdentity, manifest, health, catalog, created, ack, screen, turns, stopReason, turnFailure }) { return sanitizeReport({ schema: 'public_production_playtest_v1', generated_at: new Date().toISOString(), git: gitSnapshot, git_after: finalGitSnapshot, scenario_seed: scenarioSeed, run_identity: runIdentity, manifest_digest: manifestDigest(manifest), scenario_id: SCENARIO_ID, public_responses: { health: publicSummary(health), scenarios: publicSummary(catalog), new_game: publicSummary(created), opening_ack: publicSummary(ack), screen: publicSummary(screen) }, turns, observed_role_ids: [...new Set(turns.flatMap((turn) => turn.role_ids))].sort(), deterministic_proofs: DETERMINISTIC_PROOFS, latency: aggregateLatency(turns), stop_reason: stopReason, turn_failure: turnFailure, limitations: ['Only public HTTP responses and developer LLM reports are read.', `Exact impossible-action nearest realistic failure is proved by deterministic ${IMPOSSIBLE_DOMAIN_REJECTION_TEST}; live run observes the same probe's public commit and turn_step_planner only.`, 'Planner and narration repair paths are deterministic focused proofs, not live waterfalls.'] }); }
async function runTurn({ turn, partyId, http, now, scenarioSeed, runIdentity }) { const requestId = `${scenarioSeed}:${turn.id}`; const startedAt = now(); const path = `/api/v1/parties/${encodeURIComponent(partyId)}/turns`; const input = { request_id: requestId, idempotency_key: `${runIdentity}:${turn.id}`, raw_text: turn.raw_text }; const diagnosticPath = `/api/v1/developer/llm-turn-reports/${encodeURIComponent(partyId)}/${encodeURIComponent(requestId)}`; let initial; try { initial = await http.post(path, input); } catch (error) { const report = await failedTurnDiagnostics(http, diagnosticPath); if (report) { const llm = mergeLlmReports([report]); error.failedTurn = sanitizeTurn({ turn_id: turn.id, scenario_class: turn.scenario_class, request_id: requestId, client_duration_ms: now() - startedAt, status: error.report?.status, expected_failure: turn.expectedFailure === true, required_role_ids: turn.required_role_ids, required_waterfall: turn.required_waterfall, public_evidence: { expected: turn.expect ?? null, pass: turn.expect == null }, response: error.report, presentation_ack: null, presentation_pending: false, role_ids: llm.waterfall.map((call) => text(call.role)).filter(Boolean), llm }); } throw error; } const reports = [(await http.get(diagnosticPath)).data]; const presentationAck = isPendingPresentation(initial) && !isTerminalPublicResponse(initial) ? await http.post(path, input) : null; if (presentationAck) reports.push((await http.get(diagnosticPath)).data); const response = presentationAck ?? initial; const llm = mergeLlmReports(reports); return sanitizeTurn({ turn_id: turn.id, scenario_class: turn.scenario_class, request_id: requestId, client_duration_ms: now() - startedAt, status: response.status, expected_failure: turn.expectedFailure === true, required_role_ids: turn.required_role_ids, required_waterfall: turn.required_waterfall, public_evidence: publicEvidence(turn.expect, response.data), response: publicSummary(response), presentation_ack: presentationAck, presentation_pending: isPendingPresentation(response), role_ids: llm.waterfall.map((call) => text(call.role)).filter(Boolean), llm }); }
async function failedTurnDiagnostics(http, path) { try { return (await http.get(path)).data ?? null; } catch { return null; } }
export function roleGate(report) { const observed = new Set(report.observed_role_ids ?? []); const gaps = REQUIRED_ROLES.filter((role) => !observed.has(role)).map((role) => `required role not observed: ${role}`); if (report.stop_reason) gaps.push(report.stop_reason); if (report.turn_failure) gaps.push(`turn failure: ${report.turn_failure.turn_id}`); for (const turn of report.turns ?? []) { const missing = missingTurnRoleEvidence(turn); if (missing.length) gaps.push(`missing compound prerequisite: ${turn.turn_id}: ${missing.join(', ')}`); const waterfall = missingWaterfallEvidence(turn); if (waterfall.length) gaps.push(`missing live waterfall: ${turn.turn_id}: ${waterfall.join(' -> ')}`); const repeatedRepair = repeatedRepairRole(turn.llm?.waterfall); if (repeatedRepair) gaps.push(`repeated repair role: ${turn.turn_id}: ${repeatedRepair}`); if (turn.llm?.aggregate?.deadline_exceeded === true || Number(turn.llm?.turn_duration_ms) >= AUTHORITATIVE_TURN_CEILING_MS) gaps.push(`deadline exceeded: ${turn.turn_id}`); if (turn.status < 200 || turn.status >= 300) gaps.push(`unexpected non-2xx: ${turn.turn_id}`); if (turn.expected_failure && !turn.response?.turn_id) gaps.push(`impossible probe has no public committed turn: ${turn.turn_id}`); if (turn.expected_failure && !turn.role_ids?.includes('turn_step_planner')) gaps.push(`impossible probe planner not observed: ${turn.turn_id}`); } return Object.freeze({ pass: gaps.length === 0, gaps: Object.freeze(gaps), live_waterfalls: true, deterministic_proofs: DETERMINISTIC_PROOFS }); }
export function manifestDigest(manifest = PUBLIC_PLAYTEST_MANIFEST) { return createHash('sha256').update(JSON.stringify(manifest)).digest('hex'); }
export function sanitizeReport(value = {}) { const turns = Array.isArray(value.turns) ? value.turns.map(sanitizeTurn) : []; return { schema: text(value.schema), generated_at: text(value.generated_at), git: sanitizeGit(value.git), git_after: sanitizeGit(value.git_after), scenario_seed: nullableText(value.scenario_seed), run_identity: nullableText(value.run_identity), manifest_digest: text(value.manifest_digest), scenario_id: text(value.scenario_id), public_responses: Object.fromEntries(Object.entries(value.public_responses ?? {}).map(([key, response]) => [key, publicSummary(response)])), turns, observed_role_ids: strings(value.observed_role_ids), deterministic_proofs: proofs(value.deterministic_proofs), latency: latency(value.latency), stop_reason: nullableText(value.stop_reason), turn_failure: failure(value.turn_failure), limitations: strings(value.limitations), ...(value.gates ? { gates: { pass: value.gates.pass === true, gaps: strings(value.gates.gaps), live_waterfalls: value.gates.live_waterfalls === true, deterministic_proofs: proofs(value.gates.deterministic_proofs) } } : {}) }; }
function createPublicClient(baseUrl, fetchImpl, now) { const request = async (method, path, body, expected = 200) => { const response = await fetchImpl(`${baseUrl}${path}`, { method, headers: body == null ? undefined : { 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) }); const payload = await response.json(); const result = { ok: response.ok && payload?.ok === true, status: httpStatus(response.status), data: payload?.data ?? null, public_error_code: publicErrorCode(payload?.error?.code), elapsed_ms: now() }; if (!result.ok) throw gateError('PUBLIC_HTTP_FAILED', `${method} ${path} returned ${response.status}.`, result); if (response.status !== expected) throw gateError('PUBLIC_HTTP_STATUS_INVALID', `${method} ${path} returned ${response.status}.`, result); return result; }; return { get: (path) => request('GET', path), post: (path, body, expected) => request('POST', path, body, expected) }; }
function sanitizeTurn(turn = {}) { const llm = turn.llm == null ? null : llmSummary(turn.llm); return { turn_id: text(turn.turn_id), scenario_class: text(turn.scenario_class), request_id: text(turn.request_id), client_duration_ms: number(turn.client_duration_ms), status: number(turn.status), expected_failure: turn.expected_failure === true, required_role_ids: strings(turn.required_role_ids), required_waterfall: strings(turn.required_waterfall), public_evidence: { expected: nullableText(turn.public_evidence?.expected), pass: turn.public_evidence?.pass !== false }, response: publicSummary(turn.response), presentation_ack: publicSummary(turn.presentation_ack), presentation_pending: turn.presentation_pending === true, role_ids: strings(turn.role_ids), llm, llm_active_wall_ms: number(llm?.aggregate?.llm_active_wall_ms), llm_total_duration_ms: number(llm?.aggregate?.llm_total_duration_ms), llm_calls: number(llm?.aggregate?.llm_calls), repair_calls: number(llm?.aggregate?.repair_calls), slowest_role: slowestRole(llm?.waterfall), slowest_call_ms: number(llm?.aggregate?.slowest_llm_call_ms), budget_exhausted: llm?.aggregate?.budget_exhausted === true, deadline_exceeded: llm == null ? false : llm.aggregate.deadline_exceeded || number(llm.turn_duration_ms) >= AUTHORITATIVE_TURN_CEILING_MS }; }
function llmSummary(value = {}) { return { turn_duration_ms: number(value.turn_duration_ms), turn_deadline_ms: number(value.turn_deadline_ms), failure: diagnosticFailure(value.failure), waterfall: Array.isArray(value.waterfall) ? value.waterfall.map((call) => ({ role: nullableText(call?.role), duration_ms: number(call?.duration_ms), status: nullableText(call?.status), repair: call?.repair === true, error_category: nullableText(call?.error_category) })) : [], aggregate: { llm_active_wall_ms: number(value.aggregate?.llm_active_wall_ms), llm_total_duration_ms: number(value.aggregate?.llm_total_duration_ms), slowest_llm_call_ms: number(value.aggregate?.slowest_llm_call_ms), llm_calls: number(value.aggregate?.llm_calls ?? value.aggregate?.calls), repair_calls: number(value.aggregate?.repair_calls), budget_exhausted: value.aggregate?.budget_exhausted === true, deadline_exceeded: value.aggregate?.deadline_exceeded === true }, attempts: Array.isArray(value.attempts) ? value.attempts.map((attempt) => llmSummary({ ...attempt, attempts: [] })) : [] }; }
function mergeLlmReports(reports) { const attempts = reports.filter((report) => report && typeof report === 'object'); const summary = attempts.map((attempt) => llmSummary(attempt)); const duration = summary.reduce((total, attempt) => total + attempt.turn_duration_ms, 0); return { turn_duration_ms: duration, turn_deadline_ms: AUTHORITATIVE_TURN_CEILING_MS, failure: summary.map((attempt) => attempt.failure).filter(Boolean).at(-1) ?? null, waterfall: summary.flatMap((attempt) => attempt.waterfall), aggregate: { llm_active_wall_ms: summary.reduce((total, attempt) => total + attempt.aggregate.llm_active_wall_ms, 0), llm_total_duration_ms: summary.reduce((total, attempt) => total + attempt.aggregate.llm_total_duration_ms, 0), slowest_llm_call_ms: Math.max(0, ...summary.map((attempt) => attempt.aggregate.slowest_llm_call_ms)), llm_calls: summary.reduce((total, attempt) => total + attempt.aggregate.llm_calls, 0), repair_calls: summary.reduce((total, attempt) => total + attempt.aggregate.repair_calls, 0), budget_exhausted: summary.some((attempt) => attempt.aggregate.budget_exhausted), deadline_exceeded: summary.some((attempt) => attempt.aggregate.deadline_exceeded || (attempt.turn_deadline_ms > 0 && attempt.turn_duration_ms >= attempt.turn_deadline_ms)) || duration >= AUTHORITATIVE_TURN_CEILING_MS }, attempts: summary }; }
function publicSummary(response = {}) { const data = response?.data ?? response; const turn = data?.turn ?? {}; const screen = data?.screen ?? {}; return { status: number(response?.status ?? data?.status), ok: response?.ok === true || data?.ok === true, schema: nullableText(data?.schema ?? screen?.schema), version: number(data?.version ?? screen?.version), party_id: nullableText(data?.party_id), turn_id: nullableText(turn?.turn_id ?? data?.turn_id ?? screen?.turn_id), request_id: nullableText(data?.request_id), message_id: nullableText(data?.message_id), scenario_id: nullableText(data?.scenario_id), mode: nullableText(turn?.mode ?? data?.mode), screen_status: nullableText(screen?.screen_status ?? data?.screen_status), option_id: nullableText(data?.selected_action_option_id ?? turn?.selected_action_option_id ?? data?.option_id) }; }
function aggregateLatency(turns) { const values = turns.map((turn) => Number(turn.client_duration_ms) || 0).sort((a, b) => a - b); return { turn_count: turns.length, p50_ms: percentile(values, .5), p95_ms: percentile(values, .95), max_ms: values.at(-1) ?? 0 }; }
function isTerminal(turn) { return [turn.response?.status, turn.response?.mode, turn.response?.screen_status].some((value) => TERMINAL.has(text(value))); }
function isTerminalPublicResponse(response) { const summary = publicSummary(response); return [summary.status, summary.mode, summary.screen_status].some((value) => TERMINAL.has(text(value))); }
function isPendingPresentation(response) { return publicSummary(response).screen_status === 'committed_presentation_pending'; }
function assertCurrentCatalog(catalog) { const scenarios = catalog?.scenarios; if (!Array.isArray(scenarios) || scenarios.length !== 1 || scenarios[0]?.scenario_id !== SCENARIO_ID || scenarios[0]?.available !== true) throw gateError('PUBLIC_CATALOG_INVALID', 'Public catalog is not exactly current scenario.'); }
function assertManifest(manifest) { if (!Array.isArray(manifest) || manifest.length < 20 || manifest.length > 30 || new Set(manifest.map((turn) => turn.id)).size !== manifest.length) throw new TypeError('Manifest must contain 20–30 uniquely named turns.'); }
function playtestSeed(branch) { const value = Number(branch); if (!Number.isInteger(value) || value < 0) throw new TypeError('branch must be a non-negative integer.'); return `public-playtest:${SCENARIO_ID}:branch:${value}`; }
export function preflightPublicPlaytestSeed(branch = PUBLIC_PLAYTEST_BRANCH) {
  const scenarioSeed = playtestSeed(branch), randomSourceFactory =
    createTraceRandomSourceFactory({ env: { RUS_DEVELOPER_MODE: 'true',
      RUS_PUBLIC_PLAYTEST_SCENARIO_SEED: scenarioSeed } });
  const profiles = seedProfiles(), player = profiles.player;
  const activity = (turnId, checkId, identity = {}) => {
    const profile = profiles.activity.get(checkId);
    if (!profile) throw new TypeError(`Missing playtest check profile: ${checkId}`);
    return seededCheck(turnId, scenarioSeed, randomSourceFactory, {
      check_id: checkId, difficulty: profile.dc,
      attribute_value: player.attributes[profile.attribute].value,
      skill_bonus: player.skills[profile.skill].bonus,
      state_modifier: profile.modifiers.state,
      equipment_modifier: profile.modifiers.item_or_evidence,
      circumstance_modifier: profile.modifiers.circumstance
    }, identity);
  };
  const combatProfile = profiles.combat;
  const combat = ['combat', 'combat-followup-1', 'combat-followup-2'].map(
    (turnId) => seededCheck(turnId, scenarioSeed, randomSourceFactory, {
      check_id: combatProfile.check_profile_ref,
      difficulty: combatProfile.check_request.target_defense,
      attribute_value: combatProfile.check_request.attribute_value,
      skill_bonus: combatProfile.check_request.skill_bonus,
      equipment_modifier: combatProfile.check_request.equipment_modifier
    }));
  const gates = [{ gate_id: 'inspect', results: [activity('inspect',
    'trace_ld_v1_check_detailed_wreck_inspection')] },
  { gate_id: 'clue', results: [activity('clue',
    'trace_ld_v1_check_eremey_cooperation')] },
  { gate_id: 'surrender', results: [activity('surrender',
    'trace_ld_v1_check_ratsha_surrender_attempt', {
      check_profile_ref: profiles.social.profile_id })] },
  { gate_id: 'treatment', results: [activity('treatment',
    'trace_ld_v1_check_risky_first_aid')], anyOutcome: true },
  { gate_id: 'combat', results: combat }].map(
    ({ anyOutcome = false, ...gate }) => ({ ...gate,
      pass: anyOutcome || gate.results.some((result) => result.outcome.success) }));
  const failed = gates.filter(({ pass }) => !pass);
  if (failed.length) throw gateError('PUBLIC_PLAYTEST_SEED_INCAPABLE',
    `seed cannot pass required stochastic gates: ${failed.map(({ gate_id }) => gate_id).join(', ')}`,
    { scenario_seed: scenarioSeed, gates });
  return Object.freeze({ scenario_seed: scenarioSeed, gates: Object.freeze(gates) });
}
function seededCheck(turnId, scenarioSeed, randomSourceFactory, request,
  identity = {}) {
  return executeCheck(request, randomSourceFactory({
    request_id: `${scenarioSeed}:${turnId}`, ...identity
  }));
}
let loadedSeedProfiles;
function seedProfiles() {
  if (loadedSeedProfiles) return loadedSeedProfiles;
  const root = resolve(import.meta.dirname, '../..');
  const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const activity = read('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-5-content/activity-check-consequence-profiles.json');
  const player = read('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content/player-profile.json');
  const bindings = read('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m5-content/turn-step-bindings.json');
  const conversation = read('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m2-content/conversation-semantic-bindings.json');
  loadedSeedProfiles = { player,
    activity: new Map(activity.check_profiles.map((profile) => [profile.check_id, profile])),
    social: conversation.npc_social_check_profiles.find(({ actor_ref }) =>
      actor_ref === 'ratsha_storehouse_helper'),
    combat: bindings.player_execution_profiles.find(({ profile_id }) =>
      profile_id === 'trace_ld_v1_combat_player_control') };
  if (!loadedSeedProfiles.social || !loadedSeedProfiles.combat) {
    throw new TypeError('Missing playtest check profile.');
  }
  return loadedSeedProfiles;
}
function publicEvidence(expected, data) { const context = data?.screen?.visible_context ?? {}; const changes = context.visible_changes ?? []; if (!expected) return { expected: null, pass: true }; if (expected === 'blue_wool_found') return { expected, pass: (context.visible_objects ?? []).some((object) => text(object?.entity_ref?.entity_id).endsWith(':blue-wool')) }; if (expected === 'route_to_shed_disclosed') return { expected, pass: (context.known_context ?? []).some((line) => text(line).includes('путь к сушильне')) }; if (expected === 'onisim_treatment_completed') return { expected, pass: ['onisim_stabilized_unable_to_walk', 'onisim_first_aid_completed_without_stabilization'].some((marker) => changes.includes(marker)) }; const marker = { onisim_found: 'onisim_found_alive', ratsha_surrendered: 'ratsha_surrendered', onisim_carried: 'onisim_carried_to_camp_committed' }[expected]; if (!marker) throw new TypeError(`Unknown public evidence predicate: ${expected}`); return { expected, pass: changes.includes(marker) }; }
function requireCleanGitSnapshot(value) { const snapshot = sanitizeGit(value); if (!/^[a-f0-9]{40}$/u.test(snapshot.head) || snapshot.dirty !== false) throw gateError('PUBLIC_PLAYTEST_GIT_EVIDENCE_INVALID', 'Public playtest requires a clean exact git HEAD.', { schema: 'public_production_playtest_v1', git: snapshot }); return snapshot; }
function sanitizeGit(value = {}) { return { head: text(value.head), dirty: value.dirty === true ? true : value.dirty === false ? false : null }; }
function sameGitSnapshot(first, second) { return first.head === second.head && first.dirty === second.dirty; }
function entry(id, scenario_class, raw_text, extra = {}) { return Object.freeze({
  id, scenario_class, raw_text,
  ...(id === 'combat' ? { required_role_ids: [
    'turn_step_planner', 'npc_combat_decider'] } : {}),
  ...extra }); }
function proof(id, test) { return Object.freeze({ id, proof_kind: 'deterministic_focused_test', test }); }
function proofs(value) { return Array.isArray(value) ? value.map(({ id, proof_kind, test }) => proof(text(id), text(test))) : []; }
function strings(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function nullableText(value) { const result = text(value); return result || null; }
function number(value) { return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0; }
function latency(value = {}) { return { turn_count: number(value.turn_count), p50_ms: number(value.p50_ms), p95_ms: number(value.p95_ms), max_ms: number(value.max_ms) }; }
function failure(value) { return value && typeof value === 'object' ? { turn_id: nullableText(value.turn_id), code: nullableText(value.code), http_status: httpStatus(value.http_status), public_error_code: publicErrorCode(value.public_error_code) } : null; }
function missingTurnRoleEvidence(turn = {}) { const observed = new Set(strings(turn.role_ids)); return strings(turn.required_role_ids).filter((role) => !observed.has(role)); }
function missingWaterfallEvidence(turn = {}) { const required = strings(turn.required_waterfall); const actual = strings(turn.llm?.waterfall?.map((call) => call?.role) ?? turn.role_ids); let index = 0; for (const role of actual) if (role === required[index]) index += 1; return required.slice(index); }
function repeatedRepairRole(waterfall = []) { const seen = new Set(); for (const { role, repair } of waterfall) if (repair === true && role && (seen.has(role) || !seen.add(role))) return role; return null; }
function httpStatus(value) { const status = Number(value); return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null; }
function publicErrorCode(value) { const code = text(value); return /^[A-Z][A-Z0-9_]{0,127}$/u.test(code) ? code : null; }
function diagnosticFailure(value) { return safeWritePlanFailure(value); }
function slowestRole(waterfall = []) { return nullableText(waterfall.slice().sort((a, b) => number(b.duration_ms) - number(a.duration_ms))[0]?.role); }
function percentile(values, fraction) { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] : 0; }
function text(value) { return String(value ?? '').trim(); }
function gateError(code, message, report = null) { const error = new Error(message); error.code = code; error.report = report; return error; }
function gitState() { const read = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim(); try { return { head: read(['rev-parse', 'HEAD']), dirty: read(['status', '--porcelain']) !== '' }; } catch { return { head: null, dirty: null }; } }
export async function stopOwnedServer(child, { timeoutMs = 2_000, sleep = delay } = {}) { if (!child || child.exitCode != null || typeof child.kill !== 'function') return; child.kill('SIGTERM'); if (await waitForExit(child, timeoutMs, sleep)) return; child.kill('SIGKILL'); await waitForExit(child, timeoutMs, sleep); }
async function waitForExit(child, timeoutMs, sleep) { if (child.exitCode != null) return true; if (typeof child.once !== 'function') return false; let exited = false; child.once('exit', () => { exited = true; }); await sleep(timeoutMs); return exited || child.exitCode != null; }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
if (import.meta.main) { const out = process.argv.indexOf('--out'); try { const report = await runPublicPlaytest(); if (out >= 0 && process.argv[out + 1]) await writeFile(resolve(process.argv[out + 1]), `${JSON.stringify(report, null, 2)}\n`); } catch (error) { const report = error.report ? sanitizeReport(error.report) : { code: error.code ?? 'PUBLIC_PLAYTEST_FAILED' }; if (out >= 0 && process.argv[out + 1]) await writeFile(resolve(process.argv[out + 1]), `${JSON.stringify(report, null, 2)}\n`); console.error(JSON.stringify(report)); process.exitCode = 1; } }
