const ALLOWED_OVERRIDE_KEYS = new Set(['maxTokens', 'temperature', 'topP', 'requestTimeoutMs']);
const JSON_FORMAT_INSTRUCTION = Object.freeze({
  role: 'system', content: 'Return a valid json object.'
});

export function resolveRuntimeProviderOverride(override) {
  if (override == null) return { ok: true, config: null };
  if (!override || typeof override !== 'object') return { ok: false };
  const compatibility = readText(override.compatibility ?? override.provider);
  if (compatibility !== 'openai_compatible' && compatibility !== 'deepseek') return { ok: false };
  const baseUrl = readText(override.requestUrl ?? override.baseUrl);
  const model = readText(override.model);
  const requestUrl = normalizeRequestUrl(baseUrl);
  if (!requestUrl || !model) return { ok: false };
  return {
    ok: true,
    config: {
      provider: compatibility,
      compatibility,
      baseUrl,
      requestUrl,
      model,
      apiKey: readText(override.apiKey) || null,
      requestTimeoutMs: readPositiveInt(override.requestTimeoutMs)
    }
  };
}

export function normalizeRequestUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (!url.pathname.endsWith('/chat/completions')) {
      url.pathname = `${url.pathname}/chat/completions`.replace(/\/+/g, '/');
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeBaseUrl(value) {
  return value?.trim().replace(/\/+$/, '') || 'https://api.deepseek.com';
}

export function applyProviderOverrides(config, overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  for (const [key, value] of Object.entries(overrides)) {
    if (!ALLOWED_OVERRIDE_KEYS.has(key)) continue;
    if (key === 'maxTokens') {
      const parsed = readPositiveInt(value);
      if (parsed) config.maxTokens = parsed;
      continue;
    }
    if (key === 'temperature') {
      const parsed = readNumber(value);
      if (parsed != null) config.temperature = parsed;
      continue;
    }
    if (key === 'topP') {
      const parsed = readNumber(value);
      if (parsed != null) config.topP = parsed;
      continue;
    }
    const parsed = readPositiveInt(value);
    if (parsed) config.requestTimeoutMs = parsed;
  }
}

export function buildProviderRequestPayload(config, messages) {
  return {
    model: config.model,
    messages: providerMessages(config, messages),
    max_tokens: config.maxTokens,
    ...(config.responseFormat ? { response_format: config.responseFormat } : {}),
    ...(config.compatibility === 'deepseek' && config.thinking ? { thinking: config.thinking } : {}),
    ...(config.compatibility === 'deepseek' && config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
    ...(config.temperature != null ? { temperature: config.temperature } : {}),
    ...(config.topP != null ? { top_p: config.topP } : {})
  };
}

function providerMessages(config, messages) {
  if (config.responseFormat?.type !== 'json_object'
      || messages.some(({ content }) => typeof content === 'string'
        && /json/iu.test(content))) return messages;
  return [JSON_FORMAT_INSTRUCTION, ...messages];
}

function readText(value) { return String(value ?? '').trim(); }

function readPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function readNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
