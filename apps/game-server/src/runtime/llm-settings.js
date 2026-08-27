import { serverError } from '../errors.js';

export function createLlmSettingsOwner() {
  let active = defaultSnapshot();
  return Object.freeze({
    read() { return publicSnapshot(active); },
    providerSnapshot() { return active; },
    apply(input) {
      const next = normalizeSettings(input);
      active = next;
      return publicSnapshot(active);
    },
    reset() {
      active = defaultSnapshot();
      return publicSnapshot(active);
    }
  });
}

export function normalizeLlmSettingsCandidate(input) {
  return normalizeCustom(input);
}

function normalizeSettings(input) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  if (input.mode === 'default') {
    assertFields(input, ['mode']);
    return defaultSnapshot();
  }
  if (input.mode === 'custom') return normalizeCustom(input);
  invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be default or custom.');
}

function normalizeCustom(input) {
  if (!plain(input)) invalid('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.');
  assertFields(input, ['mode', 'compatibility', 'base_url', 'model', 'api_key']);
  if (input.mode !== 'custom') invalid('LLM_SETTINGS_MODE_INVALID', 'mode must be custom.');
  if (input.compatibility != null && input.compatibility !== 'openai_compatible') invalid('LLM_SETTINGS_COMPATIBILITY_INVALID', 'compatibility must be openai_compatible.');
  const baseUrl = normalizeUrl(input.base_url);
  const model = requiredText(input.model, 'LLM_SETTINGS_MODEL_REQUIRED', 'model is required.');
  const apiKey = optionalText(input.api_key, 'LLM_SETTINGS_API_KEY_INVALID', 'api_key must be a string.');
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
