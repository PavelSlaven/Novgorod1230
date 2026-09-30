#!/usr/bin/env node
// Live D49 slice run on Linux: v17 bootstrap on Docker PG, the production composition root with the real LLM
// (settings file at RUS_LLM_SETTINGS_PATH), the game HTTP server on loopback, scripted legs over the public API.
// Run under the slot lock on a shared host:  pg-slot node tools/local-play/v17-slice-run.mjs [options]
// Exit: 0 all legs pass · 1 a leg failed or is blocked · 2 usage · 3 preflight · 4 stand crash.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEG_IDS, createRedactor, exitCodeOf, playtestFileName, renderPlaytestMarkdown,
  secretsOfLlmSettings } from './v17-slice-report.js';
import { RESERVE_MAKE_TURNS, runLegs } from './v17-slice-legs.js';

export const EXIT = Object.freeze({ PASS: 0, LEGS: 1, USAGE: 2, PREFLIGHT: 3, STAND: 4 });
const DEFAULT_SCENARIO = 'novgorod_vikhtuy_work_storage_v1';
const HTTP_TURN_TIMEOUT_MS = 8 * 60_000;

export class UsageError extends Error {}
export class PreflightError extends Error {}

const USAGE = `Usage: v17-slice-run.mjs [--scenario <id|work_storage|household_cluster>] [--out-dir <dir>]
  [--playtest-dir <dir>] [--max-turns <n>] [--deadline-min <n>] [--wk-encoder stub|giga] [--run-id <id>]
Env: RUS_LLM_SETTINGS_PATH (required); RUS_WORLD_KNOWLEDGE_PYTHON [+ RUS_WORLD_KNOWLEDGE_MODEL_PATH] for --wk-encoder giga.`;

export function parseArgs(argv, env = process.env) {
  const options = { scenario: DEFAULT_SCENARIO, outDir: null, playtestDir: null, maxTurns: 24, deadlineMin: 26,
    wkEncoder: 'stub', runId: null, help: false };
  const integer = (flag, value, min) => {
    const number = Number(value);
    if (!/^\d+$/u.test(String(value)) || number < min) throw new UsageError(`${flag} expects an integer >= ${min}, got "${value}"`);
    return number;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    const value = argv[i + 1];
    if (!flag.startsWith('--') || value === undefined || value.startsWith('--')) throw new UsageError(`unknown or incomplete option "${flag}"`);
    i += 1;
    if (flag === '--scenario') options.scenario = value.startsWith('novgorod_') ? value : `novgorod_vikhtuy_${value}_v1`;
    else if (flag === '--out-dir') options.outDir = value;
    else if (flag === '--playtest-dir') options.playtestDir = value;
    else if (flag === '--max-turns') options.maxTurns = integer(flag, value, 0);
    else if (flag === '--deadline-min') options.deadlineMin = integer(flag, value, 1);
    else if (flag === '--run-id') options.runId = value;
    else if (flag === '--wk-encoder') {
      if (!['stub', 'giga'].includes(value)) throw new UsageError(`--wk-encoder expects stub|giga, got "${value}"`);
      options.wkEncoder = value;
    } else throw new UsageError(`unknown option "${flag}"`);
  }
  options.runId ??= new Date().toISOString().replace(/\D/gu, '').slice(0, 14);
  if (!/^[\w-]+$/u.test(options.runId)) throw new UsageError('--run-id may contain only letters, digits, _ and -');
  options.outDir ??= join(tmpdir(), `v17-slice-${options.runId}`);
  if (!options.help && options.wkEncoder === 'giga' && !env.RUS_WORLD_KNOWLEDGE_PYTHON) {
    throw new PreflightError('--wk-encoder giga needs RUS_WORLD_KNOWLEDGE_PYTHON');
  }
  return options;
}

/** Cleanup stack: every finalizer runs, in reverse order, even if another one throws; idempotent. */
export function createFinalizers() {
  const stack = [];
  let ran = false;
  return {
    add(name, fn) { stack.push({ name, fn }); },
    async run() {
      if (ran) return [];
      ran = true;
      const errors = [];
      for (const { name, fn } of stack.reverse()) {
        try { await fn(); } catch (error) { errors.push(`${name}: ${error.message}`); }
      }
      return errors;
    }
  };
}

export function removeContainer(name) {
  return spawnSync('docker', ['rm', '-fv', name], { encoding: 'utf8', timeout: 60_000 });
}

/** Reads the settings file at `path`; never returns or logs values, only the record for the owner. */
export async function readLlmSettingsRecord(path, { load }) {
  if (!path) throw new PreflightError('RUS_LLM_SETTINGS_PATH is not set');
  let record;
  try { record = await load(path); } catch (error) { throw new PreflightError(`llm settings file is unreadable (${error.code ?? error.name})`); }
  const settings = record?.settings;
  const ok = record?.version === 2 && settings?.mode === 'custom' && settings?.compatibility === 'openai_compatible'
    && ['base_url', 'model', 'api_key'].every((key) => typeof settings?.[key] === 'string' && settings[key].trim() !== '');
  if (!ok) throw new PreflightError('llm settings file does not match {version:2, settings:{mode:custom, compatibility:openai_compatible, base_url, model, api_key}}');
  return record;
}

const SNAPSHOT_SQL = `
WITH me AS (
  SELECT n.id AS node_id, n.template_slot_key AS slot, n.g6_instance_id AS g6
    FROM party_runtime.party_journey_locations l
    JOIN party_runtime.party_player_characters a ON a.party_id=l.party_id AND a.character_id=l.owner_id
    JOIN party_runtime.scene_position_nodes n ON n.party_id=l.party_id AND n.id=l.scene_position_id
   WHERE l.party_id=$1 AND l.owner_kind='actor')
SELECT
  (SELECT state_version FROM party_runtime.parties WHERE party_id=$1) AS state_version,
  (SELECT jsonb_build_object('slot', me.slot, 'site_id', s.id, 'origin', s.origin,
      'canonical_g5', COALESCE(s.canonical_g5_ref->>'entity_id', s.canonical_g5_ref->>'id'),
      'generated_template', s.generated_template_ref)
     FROM me
     JOIN party_runtime.party_g6_instances g ON g.party_id=$1 AND g.id=me.g6
     JOIN party_runtime.party_scene_baselines b ON b.party_id=g.party_id AND b.id=g.scene_baseline_id AND b.host_kind='g5_site'
     JOIN party_runtime.party_g5_sites s ON s.party_id=b.party_id AND s.id=b.host_id) AS position,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_kind', pl.entity_kind, 'entity_id', pl.entity_id,
      'slot', pos.template_slot_key, 'occupies_capacity_units', pl.occupies_capacity_units)
      ORDER BY pl.entity_kind, pl.entity_id), '[]'::jsonb)
     FROM party_runtime.entity_placements pl
     JOIN party_runtime.scene_position_nodes pos ON pos.party_id=pl.party_id AND pos.id=pl.position_node_id
     JOIN me ON pos.g6_instance_id=me.g6
    WHERE pl.party_id=$1) AS placements_here,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_id', pl.entity_id, 'slot', pos.template_slot_key,
      'g6_instance_id', pos.g6_instance_id) ORDER BY pl.entity_id), '[]'::jsonb)
     FROM party_runtime.entity_placements pl
     JOIN party_runtime.scene_position_nodes pos ON pos.party_id=pl.party_id AND pos.id=pl.position_node_id
    WHERE pl.party_id=$1 AND pl.entity_kind='npc') AS npc_placements_all,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', p.item_id, 'holder', p.holder_character_id,
      'position', p.physical_position) ORDER BY p.item_id), '[]'::jsonb)
     FROM party_runtime.party_item_placements p WHERE p.party_id=$1) AS items,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('item_id', i.item_id, 'state_version', i.state_version,
      'action_production', i.state::text LIKE '%action_production%') ORDER BY i.item_id), '[]'::jsonb)
     FROM party_runtime.party_items i WHERE i.party_id=$1) AS party_items,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('resource_node_id', resource_node_id,
      'quantity_numerator', quantity_numerator, 'quantity_denominator', quantity_denominator,
      'lifecycle_state', lifecycle_state, 'state_version', state_version) ORDER BY resource_node_id), '[]'::jsonb)
     FROM party_runtime.party_resource_nodes WHERE party_id=$1) AS resource_nodes,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('resource_node_id', resource_node_id,
      'before_numerator', before_numerator, 'decrement_numerator', decrement_numerator,
      'after_numerator', after_numerator) ORDER BY resource_node_id, causal_transition_identity), '[]'::jsonb)
     FROM party_runtime.party_resource_node_decrements WHERE party_id=$1) AS resource_decrements,
  (SELECT COALESCE(jsonb_agg(st), '[]'::jsonb)
     FROM party_runtime.party_state_snapshots s
     JOIN party_runtime.parties p ON p.party_id=s.party_id AND p.state_version=s.state_version
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.state_payload->'conversation_statements', '[]'::jsonb)) st
    WHERE s.party_id=$1 AND st->'speaker_ref'->>'entity_kind'='npc') AS npc_statements`;

export function createSnapshotReader(partyPool) {
  return {
    async snapshot(partyId) {
      try { return (await partyPool.query(SNAPSHOT_SQL, [partyId])).rows[0]; }
      catch (error) { return { error: `snapshot failed: ${error.message}` }; }
    }
  };
}

/** HTTP client of the driver: real requests to the loopback server through the fetch captured before metering. */
export function createHttpApi(baseUrl, httpFetch) {
  const call = async (method, path, body, timeoutMs = 60_000) => {
    const response = await httpFetch(`${baseUrl}${path}`, {
      method, signal: AbortSignal.timeout(timeoutMs),
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    });
    const envelope = await response.json().catch(() => null);
    return { status: response.status, ok: envelope?.ok === true, data: envelope?.data ?? null,
      error: envelope?.ok === true ? null : (envelope?.error ?? { code: `HTTP_${response.status}`, message: 'unreadable response' }) };
  };
  const party = (id) => `/api/v1/parties/${encodeURIComponent(id)}`;
  return {
    health: () => call('GET', '/api/v1/health'),
    newGame: (input) => call('POST', '/api/v1/new-games', input, HTTP_TURN_TIMEOUT_MS),
    ack: (id, input) => call('POST', `${party(id)}/opening-ack`, input),
    screen: (id) => call('GET', `${party(id)}/screen`),
    turn: (id, input) => call('POST', `${party(id)}/turns`, input, HTTP_TURN_TIMEOUT_MS),
    recover: (id, input) => call('POST', `${party(id)}/presentation-recovery`, input, HTTP_TURN_TIMEOUT_MS)
  };
}

/** Server-side reason of a failed request: the HTTP layer masks it as TEMPORARY_ACTION_UNAVAILABLE, its console.error keeps it. */
export function describeServerError(error) {
  const nested = (error?.details?.errors ?? []).map((entry) => entry?.code ?? entry?.message ?? JSON.stringify(entry)).slice(0, 6);
  return { code: error?.code ?? error?.name ?? 'unknown', message: String(error?.message ?? '').slice(0, 300),
    ...(nested.length > 0 ? { validation: nested } : {}) };
}

/** Counts LLM calls by role head (no request/response content is kept) and collects masked server errors. */
export function installLlmMeter({ log = console } = {}) {
  const previous = globalThis.fetch;
  const previousError = log.error;
  const calls = [];
  const serverErrors = [];
  log.error = (...args) => {
    if (typeof args[0] === 'string' && /^\[game-server\] request \S+ failed/u.test(args[0]) && args[1] instanceof Error) {
      serverErrors.push(describeServerError(args[1])); // one summary instead of the stack
      return;
    }
    previousError.apply(log, args);
  };
  globalThis.fetch = async (url, init) => {
    const started = Date.now();
    let role = 'unknown';
    try {
      const system = JSON.parse(init.body).messages?.[0]?.content ?? '';
      role = system.replace(/^Return a valid json object\.\s*/u, '').slice(0, 60).replace(/\s+/gu, ' ');
    } catch { /* not a chat call */ }
    try {
      const response = await previous(url, init);
      calls.push({ role, ms: Date.now() - started, status: response.status });
      return response;
    } catch (error) {
      calls.push({ role, ms: Date.now() - started, status: 'transport_error' });
      throw error;
    }
  };
  return { calls, serverErrors, count: () => calls.length, serverErrorCount: () => serverErrors.length,
    serverErrorsSince: (n) => serverErrors.slice(n), httpFetch: previous,
    restore() { globalThis.fetch = previous; log.error = previousError; } };
}

export function summarizeLlm(calls) {
  const by_role = {};
  for (const { role } of calls) by_role[role] = (by_role[role] ?? 0) + 1;
  return { total: calls.length, failed: calls.filter(({ status }) => status !== 200).length, by_role };
}

function gitIdentity(cwd) {
  const git = (...args) => spawnSync('git', ['-c', 'core.fileMode=false', ...args], { cwd, encoding: 'utf8' }).stdout?.trim() ?? '';
  return { head: git('rev-parse', 'HEAD') || 'unknown', branch: git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown',
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '' };
}

/** Production dependencies. Imports are lazy so that argument parsing and unit tests stay light. */
export async function createDefaultDeps({ options, env = process.env, repoRoot }) {
  const fixture = await import('../../test/spatial-v3/presence-rules-production-e2e-fixture.js');
  const { createGameHttpServer, listen } = await import('../../apps/game-server/src/http/server.js');
  const { createLlmSettingsFileStore } = await import('../../apps/game-server/src/infrastructure/filesystem/llm-settings-file.js');
  const settingsModule = await import('../../apps/game-server/src/runtime/llm-settings.js');
  const { createProductionLlmRoleRunner } = await import('../../apps/game-server/src/infrastructure/provider/deepseek.js');
  const { createOrdinaryMaterializationStageBQualifier } = await import('../../apps/game-server/src/runtime/ordinary-materialization-stage-b-qualification.js');
  const { loadLowerDvinaTraceOrdinaryMaterializationProfile } = await import('../../apps/game-server/src/internal/lower-dvina-trace-ordinary-materialization-profile.js');
  return {
    repoRoot,
    postgresImage: fixture.POSTGRES_IMAGE,
    routeLabels: (screen) => fixture.routeMovementLabels(screen),
    loadSettings: async (path) => {
      const record = await readLlmSettingsRecord(path, { load: (file) => createLlmSettingsFileStore({ filePath: file }).load() });
      return record;
    },
    bootstrap: () => fixture.bootstrapV17PresenceE2e(null),
    // Same owner assembly as modular-entry.js, but the stored file is only read, never rewritten.
    async createLlmOwner(record) {
      const ordinaryProfile = await loadLowerDvinaTraceOrdinaryMaterializationProfile();
      const runner = createProductionLlmRoleRunner({ env });
      const owner = settingsModule.createLlmSettingsOwner({
        initialRecord: record,
        probeCustom: (candidate) => runner.probe(candidate),
        qualifyCustom: settingsModule.createProductionLlmQualifier({ roleRunner: runner,
          qualifyOrdinary: createOrdinaryMaterializationStageBQualifier({ roleRunner: runner,
            evalContract: ordinaryProfile.stage_b_classification_eval }) })
      });
      await settingsModule.applyInitialLlmSettings(owner, record);
      return owner;
    },
    createRoot: ({ bootstrapEnv, llmSettings }) => fixture.createPresenceProductionRoot({
      ...bootstrapEnv, llmSettings,
      env: options.wkEncoder === 'giga'
        ? { RUS_WORLD_KNOWLEDGE_PYTHON: env.RUS_WORLD_KNOWLEDGE_PYTHON,
            ...(env.RUS_WORLD_KNOWLEDGE_MODEL_PATH ? { RUS_WORLD_KNOWLEDGE_MODEL_PATH: env.RUS_WORLD_KNOWLEDGE_MODEL_PATH } : {}),
            HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' }
        : {},
      ...(options.wkEncoder === 'giga' ? { worldKnowledgeEncoderFactory: null } : {})
    }),
    async startServer(root) {
      const server = createGameHttpServer({ root, maxBodyBytes: 1024 * 1024 });
      const address = await listen(server, { host: '127.0.0.1', port: 0 });
      return { server, url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => { server.close(done); server.closeAllConnections?.(); }) };
    }
  };
}

/**
 * The whole run. `deps` are injectable (see createDefaultDeps). Always: report written when possible, then every
 * finalizer (server, root, pools, container), and the caller exits explicitly.
 */
export async function runHarness(options, deps, { env = process.env, finalizers = createFinalizers(), now = Date.now } = {}) {
  const started = now();
  const startedAt = new Date(started).toISOString();
  const report = { schema: 'v17_slice_run_v1', identity: null, preconditions: null, opening: null, legs: [], turns: [],
    llm: { total: 0, failed: 0, by_role: {} }, readback: null, infra_error: null, cleanup_errors: [] };
  const git = gitIdentity(deps.repoRoot ?? process.cwd());
  let redact = createRedactor([]);
  let meter = null;
  let code = EXIT.LEGS;
  let queue = Promise.resolve();
  const write = async () => {
    await mkdir(options.outDir, { recursive: true });
    const summary = { ...report, llm: summarizeLlm(meter?.calls ?? []) };
    await writeFile(join(options.outDir, 'report.json'), redact(JSON.stringify(summary, null, 1)));
  };
  const persist = () => { queue = queue.then(write, write); return queue; }; // serialized: no interleaved writes
  try {
    const settingsPath = env.RUS_LLM_SETTINGS_PATH;
    const record = await deps.loadSettings(settingsPath);
    redact = createRedactor(secretsOfLlmSettings(record));
    report.identity = { run_id: options.runId, scenario_id: options.scenario, branch: git.branch, head: git.head, dirty: git.dirty,
      started_at: startedAt, ended_at: null, duration_ms: 0, model: record.settings.model, llm_settings_path: settingsPath };
    report.preconditions = { postgres_image: deps.postgresImage, wk_encoder: options.wkEncoder, max_turns: options.maxTurns,
      reserve_make: RESERVE_MAKE_TURNS, deadline_min: options.deadlineMin, qualification: 'не выполнена' };
    meter = installLlmMeter();
    finalizers.add('llm meter', () => meter.restore());

    const bootstrapEnv = await deps.bootstrap();
    finalizers.add('container safety net', () => removeContainer(bootstrapEnv.container));
    finalizers.add('bootstrap dispose', () => bootstrapEnv.dispose?.());
    const llmSettings = await deps.createLlmOwner(record);
    report.preconditions.qualification = `выполнена, ${meter.count()} вызовов LLM`;
    const { runtime } = await deps.createRoot({ bootstrapEnv, llmSettings });
    finalizers.add('composition root', () => runtime.close());
    const served = await deps.startServer(runtime);
    finalizers.add('http server', () => served.close());
    const api = (deps.createApi ?? createHttpApi)(served.url, meter.httpFetch);
    const health = await api.health();
    if (!health.ok) throw new Error(`health check failed: ${health.error?.code}`);

    const sql = (deps.createSql ?? createSnapshotReader)(bootstrapEnv.partyPool);
    const result = await runLegs({
      api, sql, routeLabels: deps.routeLabels, llm: meter, scenarioId: options.scenario, runId: options.runId,
      maxTurns: options.maxTurns, deadlineAt: now() + options.deadlineMin * 60_000, now, // the play window starts after bootstrap and qualification
      persist: (state) => { Object.assign(report, { legs: state.legs, turns: state.turns, opening: state.opening }); persist().catch(() => {}); }
    });
    Object.assign(report, { legs: result.legs, turns: result.turns, opening: result.opening, readback: result.final_snapshot });
    code = exitCodeOf(result.legs);
  } catch (error) {
    report.infra_error = error.message;
    code = error instanceof PreflightError ? EXIT.PREFLIGHT : EXIT.STAND;
    if (report.legs.length === 0) report.legs = LEG_IDS.map((id) => ({ id, status: 'blocked', reason: `стенд не поднялся: ${error.message}`, detail: null }));
  }
  const ended = now();
  if (report.identity) Object.assign(report.identity, { ended_at: new Date(ended).toISOString(), duration_ms: ended - started });
  try {
    if (meter) report.llm = summarizeLlm(meter.calls);
    await persist();
    if (report.identity && options.playtestDir && code !== EXIT.PREFLIGHT) {
      await mkdir(options.playtestDir, { recursive: true });
      const file = join(options.playtestDir, playtestFileName({ date: startedAt.slice(0, 10), head: git.head, runId: options.runId }));
      await writeFile(file, renderPlaytestMarkdown(report, redact));
      report.playtest_file = file;
    } else if (report.identity) {
      await writeFile(join(options.outDir, 'playtest.md'), renderPlaytestMarkdown(report, redact));
    }
  } catch (error) { report.infra_error ??= `report: ${error.message}`; if (code === EXIT.PASS) code = EXIT.STAND; }
  report.cleanup_errors = await finalizers.run();
  return { code, report };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try { options = parseArgs(argv, env); } catch (error) {
    console.error(error.message);
    return error instanceof PreflightError ? EXIT.PREFLIGHT : EXIT.USAGE;
  }
  if (options.help) { console.log(USAGE); return EXIT.PASS; }
  const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const finalizers = createFinalizers();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await finalizers.run(); process.exit(130); });
  }
  const deps = await createDefaultDeps({ options, env, repoRoot });
  const { code, report } = await runHarness(options, deps, { env, finalizers });
  console.log(`[v17-slice] ${report.legs.map((leg) => `${leg.id}:${leg.status}`).join(' ')} · report ${join(options.outDir, 'report.json')}`
    + `${report.playtest_file ? ` · playtest ${report.playtest_file}` : ''}`);
  if (report.infra_error) console.error(`[v17-slice] stand error: ${report.infra_error}`);
  for (const line of report.cleanup_errors) console.error(`[v17-slice] cleanup: ${line}`);
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => { console.error(error?.message ?? error); process.exit(EXIT.STAND); });
}
