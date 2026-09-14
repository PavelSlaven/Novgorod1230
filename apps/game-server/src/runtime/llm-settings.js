import { serverError } from '../errors.js';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNarrationService } from './lower-dvina-trace-narration-llm.js';

const QUALIFICATION_VERSION = 68;

export const LOCAL_LLM_PRESET = Object.freeze({
  base_url: 'http://127.0.0.1:8000/v1',
  model: 'HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced'
});

export function createLlmSettingsOwner({ qualifyCustom = null,
  probeCustom = null, now = Date.now, initialRecord = null,
  persistSettings = null, runtimeStatus = null } = {}) {
  const restored = initialRecord == null
    ? { active: defaultSnapshot(), identity: null }
    : normalizeStoredRecord(initialRecord);
  let active = restored.active;
  let qualifiedO1Identity = restored.identity;
  let requalificationRequired = restored.requalificationRequired === true;
  let generation = 0;
  let commitQueue = Promise.resolve();
  return Object.freeze({
    read() { return publicSnapshot(active, runtimeStatus); },
    providerSnapshot() { return active; },
    ordinaryMaterializationIdentity() { return qualifiedO1Identity; },
    requiresRequalification() { return requalificationRequired; },
    async apply(input) {
      const next = normalizeSettings(input, active);
      const applyingGeneration = ++generation;
      return commit(async () => {
        if (applyingGeneration !== generation) stale();
        const qualified = next.mode !== 'default'
          ? await qualify(next, qualifyCustom) : null;
        if (applyingGeneration !== generation) stale();
        await persistSettings?.(storedRecord(next, qualified));
        if (applyingGeneration !== generation) stale();
        active = next;
        qualifiedO1Identity = qualified;
        requalificationRequired = false;
        return publicSnapshot(active, runtimeStatus);
      });
    },
    async probe(input) {
      const candidate = normalizeProvider(input, active);
      const started = now();
      if (typeof probeCustom !== 'function') {
        await qualify(candidate, qualifyCustom);
        return Object.freeze({ ok: true, provider: 'openai_compatible',
          model: candidate.model, category: 'ok', duration_ms: now() - started });
      }
      const result = await probeCustom(candidate);
      return Object.freeze({
        ok: result?.ok === true,
        provider: 'openai_compatible',
        model: candidate.model,
        category: result?.ok === true ? 'ok'
          : String(result?.category ?? 'transport_error'),
        duration_ms: Number.isFinite(result?.duration_ms)
          ? result.duration_ms : now() - started
      });
    },
    reset() { return this.apply({ mode: 'default' }); }
  });

  function commit(operation) {
    const result = commitQueue.then(operation, operation);
    commitQueue = result.catch(() => {});
    return result;
  }
  function stale() {
    throw serverError('LLM_SETTINGS_APPLY_STALE',
      'LLM settings apply was superseded.', { status: 409 });
  }
}

export async function applyInitialLocalSettings(owner, storedRecord) {
  if (storedRecord == null) await owner.apply({ mode: 'local' });
  else if (owner.requiresRequalification()) await owner.apply(storedRecord.settings);
}

export function createProductionLlmQualifier({ qualifyOrdinary, roleRunner } = {}) {
  if (typeof qualifyOrdinary !== 'function') throw new TypeError('qualifyOrdinary is required.');
  return async (candidate) => {
    const identity = await qualifyOrdinary(candidate);
    await runNarrationWorkflowQualification({ roleRunner, candidate });
    return Object.freeze({ ...identity, qualification_version: QUALIFICATION_VERSION });
  };
}

export async function runNarrationWorkflowQualification({ roleRunner, candidate } = {}) {
  if (typeof roleRunner?.run !== 'function' || typeof roleRunner?.describe !== 'function') {
    throw new TypeError('Narration qualification requires LLM role transport.');
  }
  const fixtures = (await frozenNarrationFixtures()).filter(({ id }) => [
    'gameplay-narrator-auditor-cycle17-shore-catalogue',
    'gameplay-narrator-auditor-unseen-inspection-catalogue'
  ].includes(id));
  if (fixtures.length !== 2) throw narrationQualificationError();
  try {
    const probes = [];
    for (const fixture of fixtures) {
      const request = narrationRequest(fixture);
      let initialRaw = null;
      let initialProvider = null;
      const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
        async run(call) {
          if (call.role_id === 'gameplay_narrator') return { output: fixture.request.output };
          const expected = roleRunner.describe({ scope: call.scope, role_id: call.role_id,
            overrides: call.overrides, provider_snapshot: candidate });
          const response = await roleRunner.run({ ...call, provider_snapshot: candidate });
          if (!sameIdentity(expected, response?.provider_record)) throw narrationQualificationError();
          if (call.role_id === 'gameplay_narrator_auditor'
              && auditPhase(call) === 'initial') {
            initialRaw = response.output;
            initialProvider = response.provider_record;
          }
          return response;
        }
      } });
      const result = await narration.run(request);
      const initialWeakComposition = initialRaw?.literary_failures?.some(
        ({ check }) => check === 'weak_literary_composition') === true;
      if (result.status !== 'approved' || !result.approved_output?.prose?.trim()
          || result.repair_history.filter(({ role }) => role === 'semantic_repair').length !== 1
          || result.audit_history.length !== 2
          || result.audit_history[0]?.value?.pass !== false
          || !initialWeakComposition
          || result.audit_history[1]?.value?.pass !== true) throw narrationQualificationError();
      probes.push(Object.freeze({ fixture_id: fixture.id,
        provider: initialProvider?.provider ?? null, model: initialProvider?.model ?? null,
        role_id: initialProvider?.role_id ?? null,
        initial_raw_weak_literary_composition: initialWeakComposition,
        initial_assembled_rejected: result.audit_history[0].value.pass === false,
        repair_count: result.repair_history.filter(({ role }) => role === 'semantic_repair').length,
        final_pass: result.audit_history[1].value.pass === true,
        status: result.status, errors: [] }));
    }
    return Object.freeze(probes);
  } catch (error) {
    if (error?.code === 'LLM_SETTINGS_NARRATION_QUALIFICATION_FAILED') throw error;
    if (/^(?:timeout|transport_error|invalid_response|json_parse_failed|http_\d{3})$/u
      .test(String(error?.code ?? ''))) throw error;
    throw narrationQualificationError();
  }
}

function auditPhase(call) {
  try { return JSON.parse(call.messages?.at(-1)?.content).phase; }
  catch { return null; }
}

export const runNarrationAuditorQualification = runNarrationWorkflowQualification;

function narrationRequest(fixture) {
  const auditRequest = fixture?.request;
  return { version: 1, schema: 'narration_request', request_id: auditRequest?.output?.output_id,
    surface: 'turn', visible_context: auditRequest?.visible_context,
    style_policy: auditRequest?.style_policy ?? {} };
}

async function qualify(candidate, qualifyCustom) {
  if (typeof qualifyCustom !== 'function') {
    throw serverError('LLM_SETTINGS_QUALIFICATION_UNAVAILABLE',
      'Custom LLM qualification is unavailable.', { status: 503 });
  }
  const identity = await qualifyCustom(candidate);
  if (identity == null || typeof identity !== 'object') {
    throw serverError('LLM_SETTINGS_QUALIFICATION_INVALID',
      'Custom LLM qualification returned no identity.', { status: 503 });
  }
  return Object.freeze({ ...identity });
}

export function normalizeLlmSettingsCandidate(input) {
  return normalizeProvider(input);
}

function normalizeSettings(input, active) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  if (input.mode === 'default') {
    assertFields(input, ['mode']);
    return defaultSnapshot();
  }
  if (input.mode === 'local' || input.mode === 'custom') {
    return normalizeProvider(input, active);
  }
  invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be default, local, or custom.');
}

function normalizeProvider(input, active = null) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  assertFields(input, ['mode', 'compatibility', 'base_url', 'model', 'api_key']);
  if (input.mode !== 'local' && input.mode !== 'custom') {
    invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be local or custom.');
  }
  if (input.compatibility != null && input.compatibility !== 'openai_compatible') invalid('LLM_SETTINGS_COMPATIBILITY_INVALID', 'compatibility must be openai_compatible.');
  const baseUrl = normalizeUrl(input.base_url
    || (input.mode === 'local' ? LOCAL_LLM_PRESET.base_url : null));
  const model = requiredText(input.model
    || (input.mode === 'local' ? LOCAL_LLM_PRESET.model : null),
  'LLM_SETTINGS_MODEL_REQUIRED', 'model is required.');
  const apiKey = optionalText(input.api_key, 'LLM_SETTINGS_API_KEY_INVALID', 'api_key must be a string.')
    ?? (active?.mode !== 'default' && active?.baseUrl === baseUrl ? active.apiKey : null);
  return Object.freeze({ mode: input.mode, compatibility: 'openai_compatible',
    baseUrl, model, apiKey });
}

function defaultSnapshot() { return Object.freeze({ mode: 'local',
  compatibility: 'openai_compatible', baseUrl: LOCAL_LLM_PRESET.base_url,
  model: LOCAL_LLM_PRESET.model, apiKey: null }); }
function publicSnapshot(snapshot, runtimeStatus) {
  return Object.freeze({
    mode: snapshot.mode, compatibility: snapshot.compatibility,
    base_url: snapshot.baseUrl, model: snapshot.model,
    api_key_present: snapshot.apiKey != null,
    local_preset: LOCAL_LLM_PRESET,
    ...(runtimeStatus ? { local_runtime: runtimeStatus } : {})
  });
}

function storedRecord(snapshot, identity) {
  return Object.freeze({
    version: 2,
    settings: { mode: snapshot.mode, compatibility: snapshot.compatibility,
      base_url: snapshot.baseUrl, model: snapshot.model, api_key: snapshot.apiKey },
    ordinary_materialization_identity: identity,
    qualification_version: identity?.qualification_version ?? null
  });
}

function normalizeStoredRecord(record) {
  if (!plain(record) || record.version !== 2 || !plain(record.settings)) {
    throw serverError('LLM_SETTINGS_FILE_INVALID',
      'Saved LLM settings are invalid.', { status: 500, public_exposure: 'internal' });
  }
  const active = normalizeSettings(record.settings, null);
  const legacyDefault = record.settings.mode === 'default';
  if (legacyDefault) return { active, identity: null, requalificationRequired: false };
  if (record.qualification_version !== QUALIFICATION_VERSION) {
    return { active, identity: null, requalificationRequired: true };
  }
  return { active, identity: normalizeIdentity(record.ordinary_materialization_identity), requalificationRequired: false };
}

function normalizeIdentity(value) {
  const keys = ['provider', 'model', 'scope', 'role_id', 'config_hash'];
  if (!plain(value) || keys.some((key) => typeof value[key] !== 'string'
      || !value[key]) || value.scope !== 'turn_runtime'
      || value.role_id !== 'ordinary_materialization') {
    throw serverError('LLM_SETTINGS_FILE_INVALID',
      'Saved LLM settings are invalid.', { status: 500, public_exposure: 'internal' });
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, value[key]])));
}
function sameIdentity(expected, actual) {
  return ['provider', 'model', 'scope', 'role_id', 'config_hash'].every((key) =>
    expected?.[key] === actual?.[key]);
}
function narrationQualificationError() {
  return serverError('LLM_SETTINGS_NARRATION_QUALIFICATION_FAILED',
    'Custom LLM settings failed narration-auditor qualification.', { status: 422 });
}
let narrationFixtures;
async function frozenNarrationFixtures() {
  if (narrationFixtures == null) {
    const source = new URL('../../../../data/model-evals/llm-runtime/frozen-role-requests-v1.json', import.meta.url);
    narrationFixtures = JSON.parse(await readFile(source, 'utf8')).fixtures;
  }
  return narrationFixtures;
}
function normalizeUrl(value) {
  const raw = requiredText(value, 'LLM_SETTINGS_BASE_URL_REQUIRED', 'base_url is required.');
  let url;
  try { url = new URL(raw); } catch { invalid('LLM_SETTINGS_BASE_URL_INVALID', 'base_url must be an absolute HTTP URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    invalid('LLM_SETTINGS_BASE_URL_INVALID', 'base_url must be an absolute HTTP URL.');
  }
  return url.toString().replace(/\/+$/u, '');
}
function requiredText(value, code, message) {
  if (typeof value !== 'string' || !value.trim()) invalid(code, message);
  return value.trim();
}
function optionalText(value, code, message) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') invalid(code, message);
  return value;
}
function assertFields(value, allowed) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid('LLM_SETTINGS_FIELD_UNKNOWN', `Unknown LLM settings field: ${unknown[0]}.`);
}
function invalid(code, message) { throw serverError(code, message, { status: 400 }); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
