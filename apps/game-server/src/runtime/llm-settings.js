import { serverError } from '../errors.js';

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
  let generation = 0;
  let commitQueue = Promise.resolve();
  return Object.freeze({
    read() { return publicSnapshot(active, runtimeStatus); },
    providerSnapshot() { return active; },
    ordinaryMaterializationIdentity() { return qualifiedO1Identity; },
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
    version: 1,
    settings: { mode: snapshot.mode, compatibility: snapshot.compatibility,
      base_url: snapshot.baseUrl, model: snapshot.model, api_key: snapshot.apiKey },
    ordinary_materialization_identity: identity
  });
}

function normalizeStoredRecord(record) {
  if (!plain(record) || record.version !== 1 || !plain(record.settings)) {
    throw serverError('LLM_SETTINGS_FILE_INVALID',
      'Saved LLM settings are invalid.', { status: 500, public_exposure: 'internal' });
  }
  const active = normalizeSettings(record.settings, null);
  const legacyDefault = record.settings.mode === 'default';
  const identity = legacyDefault ? null
    : normalizeIdentity(record.ordinary_materialization_identity);
  return { active, identity };
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
