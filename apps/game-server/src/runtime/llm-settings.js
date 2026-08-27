import { serverError } from '../errors.js';

export function createLlmSettingsOwner({ qualifyCustom = null, now = Date.now } = {}) {
  let active = defaultSnapshot();
  let qualifiedO1Identity = null;
  let generation = 0;
  return Object.freeze({
    read() { return publicSnapshot(active); },
    providerSnapshot() { return active; },
    ordinaryMaterializationIdentity() { return qualifiedO1Identity; },
    async apply(input) {
      const next = normalizeSettings(input, active);
      const applyingGeneration = ++generation;
      const qualified = next.mode === 'custom'
        ? await qualify(next, qualifyCustom) : null;
      if (applyingGeneration !== generation) throw serverError(
        'LLM_SETTINGS_APPLY_STALE', 'LLM settings apply was superseded.', { status: 409 });
      active = next;
      qualifiedO1Identity = qualified;
      return publicSnapshot(active);
    },
    async probe(input) {
      const candidate = input?.mode === 'custom' && Object.hasOwn(input, 'baseUrl')
        ? input : normalizeCustom(input, active);
      const started = now();
      await qualify(candidate, qualifyCustom);
      return Object.freeze({ ok: true, provider: 'openai_compatible',
        model: candidate.model, category: 'ok', duration_ms: now() - started });
    },
    reset() {
      generation += 1;
      active = defaultSnapshot();
      qualifiedO1Identity = null;
      return publicSnapshot(active);
    }
  });
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
  return normalizeCustom(input);
}

function normalizeSettings(input, active) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  if (input.mode === 'default') {
    assertFields(input, ['mode']);
    return defaultSnapshot();
  }
  if (input.mode === 'custom') return normalizeCustom(input, active);
  invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be default or custom.');
}

function normalizeCustom(input, active = null) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  assertFields(input, ['mode', 'compatibility', 'base_url', 'model', 'api_key']);
  if (input.mode !== 'custom') invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be custom.');
  if (input.compatibility != null && input.compatibility !== 'openai_compatible') invalid('LLM_SETTINGS_COMPATIBILITY_INVALID', 'compatibility must be openai_compatible.');
  const baseUrl = normalizeUrl(input.base_url);
  const model = requiredText(input.model, 'LLM_SETTINGS_MODEL_REQUIRED', 'model is required.');
  const apiKey = optionalText(input.api_key, 'LLM_SETTINGS_API_KEY_INVALID', 'api_key must be a string.')
    ?? (active?.mode === 'custom' && active.baseUrl === baseUrl ? active.apiKey : null);
  return Object.freeze({ mode: 'custom', compatibility: 'openai_compatible', baseUrl, model, apiKey });
}

function defaultSnapshot() { return Object.freeze({ mode: 'default' }); }
function publicSnapshot(snapshot) {
  return Object.freeze(snapshot.mode === 'default'
    ? { mode: 'default', base_url: null, model: null, api_key_present: false, compatibility: 'deepseek' }
    : { mode: 'custom', compatibility: snapshot.compatibility, base_url: snapshot.baseUrl, model: snapshot.model, api_key_present: snapshot.apiKey != null });
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
