import { createHash } from 'node:crypto';
import { explainJsonObjectParse } from '@rus/contracts/json';
import { resolveLlmExecutionConfig } from './provider-config.js';
import { buildProviderRequestPayload } from './provider-request.js';

export function describeRoleLlmCall({ scope, roleId = null, tierId = null,
  env = process.env, overrides = null, runtimeProviderOverride = null } = {}) {
  const resolution = resolveLlmExecutionConfig({ scope, roleId, tierId, env,
    overrides, runtimeProviderOverride });
  if (!resolution.enabled) return null;
  const config = resolution.config;
  return Object.freeze({ provider: config.provider, model: config.model,
    scope: config.scope, role_id: config.role_id,
    request_timeout_ms: config.requestTimeoutMs,
    config_hash: hashConfig(config) });
}

export async function executeRoleLlmCall({
  scope,
  roleId = null,
  tierId = null,
  messages,
  env = process.env,
  telemetry = null,
  overrides = null,
  runtimeProviderOverride = null,
  repair = false
} = {}) {
  const resolution = resolveLlmExecutionConfig({ scope, roleId, tierId, env, overrides,
    runtimeProviderOverride });
  if (!resolution.enabled) {
    return {
      raw_text: '',
      provider: 'deepseek',
      model: null,
      scope,
      role_id: roleId ?? null,
      tier_id: tierId ?? null,
      durationMs: 0,
      status: 'provider_disabled',
      error: {
        code: resolution.reason,
        message: `LLM execution disabled: ${resolution.reason}.`,
        retryable: false
      },
      config_hash: 'disabled',
      output_contract_mode: null
    };
  }

  return invokeResolvedLlmCall({
    config: resolution.config,
    messages,
    telemetry: repair === true ? repairTelemetry(telemetry) : telemetry
  });
}

function repairTelemetry(telemetry) {
  if (typeof telemetry?.onCall !== 'function') return telemetry;
  return Object.freeze({ onCall(record) { telemetry.onCall({ ...record, repair: true }); } });
}

export function createScopedChatCompletionClient({
  scope,
  roleId = null,
  tierId = null,
  env = process.env,
  telemetry = null,
  roleResolver = null,
  tierResolver = null,
  runtimeProviderOverride = null
} = {}) {
  return {
    chat: {
      completions: {
        async create(payload = {}, meta = {}) {
          const role = meta.roleId ?? roleId ?? roleResolver?.(payload, meta) ?? null;
          const tier = meta.tierId ?? tierId ?? tierResolver?.(payload, meta) ?? null;
          const result = await executeRoleLlmCall({
            scope,
            roleId: role,
            tierId: tier,
            env,
            telemetry,
            messages: Array.isArray(payload.messages) ? payload.messages : [],
            overrides: {
              maxTokens: payload.max_tokens,
              temperature: payload.temperature,
              topP: payload.top_p
            },
            runtimeProviderOverride
          });

          if (result.status === 'provider_disabled') {
            throw new Error(result.error?.message ?? 'LLM provider is disabled.');
          }
          if (result.status === 'transport_error') {
            throw new Error(result.error?.message ?? 'LLM transport failed.');
          }

          return {
            choices: [
              {
                message: {
                  content: result.raw_text
                }
              }
            ],
            usage: result.usage ?? null
          };
        }
      }
    }
  };
}

async function invokeResolvedLlmCall({ config, messages, telemetry = null }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Provider request timeout'));
  }, config.requestTimeoutMs);
  const configHash = hashConfig(config);
  let responseData = null;
  let callError = null;

  try {
    const response = await fetch(config.requestUrl, {
      method: 'POST',
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildProviderRequestPayload(config, messages)),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await safeReadText(response, config.apiKey);
      callError = {
        code: `http_${response.status}`,
        message: `Provider request failed (${response.status}): ${body}`,
        retryable: response.status >= 500 || response.status === 429
      };
      return buildResult({
        config,
        startedAt,
        status: 'transport_error',
        error: callError,
        configHash
      }, telemetry);
    }

    try {
      responseData = await response.json();
    } catch {
      return buildResult({
        config,
        startedAt,
        status: 'transport_error',
        error: {
          code: 'invalid_response',
          message: 'Provider returned an invalid response.',
          retryable: false
        },
        configHash
      }, telemetry);
    }
    const rawText = String(responseData?.choices?.[0]?.message?.content ?? '');
    const reasoningContent = responseData?.choices?.[0]?.message?.reasoning_content;
    if (config.parseJson) {
      const parsed = explainJsonObjectParse(rawText);
      if (!parsed.ok) {
        return buildResult({
          config,
          startedAt,
          status: 'parse_error',
          rawText,
          reasoningContent,
          usage: responseData?.usage ?? null,
          error: {
            code: 'json_parse_failed',
            message: parsed.error,
            retryable: false
          },
          configHash
        }, telemetry);
      }
      return buildResult({
        config,
        startedAt,
        status: 'ok',
        rawText,
        reasoningContent,
        parsedJson: parsed.data,
        usage: responseData?.usage ?? null,
        configHash
      }, telemetry);
    }

    return buildResult({
      config,
      startedAt,
      status: 'ok',
      rawText,
      reasoningContent,
      usage: responseData?.usage ?? null,
      configHash
    }, telemetry);
  } catch (error) {
    callError = {
      code: timedOut ? 'timeout' : 'transport_error',
      message: timedOut ? 'Provider request timeout.' : 'Provider request failed.',
      retryable: true
    };
    return buildResult({
      config,
      startedAt,
      status: 'transport_error',
      error: callError,
      configHash
    }, telemetry);
  } finally {
    clearTimeout(timeout);
  }
}

function buildResult(base, telemetry) {
  const result = {
    raw_text: base.rawText ?? '',
    ...(typeof base.reasoningContent === 'string'
      ? { reasoning_content: base.reasoningContent } : {}),
    ...(base.parsedJson !== undefined ? { parsed_json: base.parsedJson } : {}),
    ...(base.usage ? { usage: base.usage } : {}),
    provider: base.config.provider,
    model: base.config.model,
    scope: base.config.scope,
    role_id: base.config.role_id ?? null,
    tier_id: base.config.tier_id ?? null,
    durationMs: Math.max(0, Date.now() - base.startedAt),
    status: base.status,
    ...(base.error ? { error: base.error } : {}),
    config_hash: base.configHash,
    output_contract_mode: base.config.outputContractMode
  };

  telemetry?.onCall?.({
    started_at_ms: base.startedAt,
    provider: result.provider,
    providerMode: result.provider,
    model: result.model,
    scope: result.scope,
    roleId: result.role_id,
    tierId: result.tier_id,
    durationMs: result.durationMs,
    status: result.status,
    errorCategory: result.error?.code ?? null,
    tokenUsage: result.usage ?? null,
    configHash: result.config_hash,
    outputContractMode: result.output_contract_mode,
    maxTokens: base.config.maxTokens,
    temperature: base.config.temperature ?? null
  });

  return result;
}

function hashConfig(config) {
  const snapshot = {
    scope: config.scope,
    role_id: config.role_id ?? null,
    tier_id: config.tier_id ?? null,
    provider: config.provider,
    base_url: sanitizeHashBaseUrl(config.baseUrl),
    model: config.model,
    thinking: config.thinking ?? null,
    reasoning_effort: config.reasoningEffort ?? null,
    response_format: config.responseFormat ?? null,
    max_tokens: config.maxTokens,
    temperature: config.temperature ?? null,
    top_p: config.topP ?? null,
    output_contract_mode: config.outputContractMode,
    expected_schema: config.expectedSchema ?? null,
    parse_json: config.parseJson === true
  };
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 16);
}

function sanitizeBaseUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return 'invalid-base-url';
  }
}

function sanitizeHashBaseUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '');
    return sanitizeBaseUrl(url);
  } catch {
    return 'invalid-base-url';
  }
}

async function safeReadText(response, apiKey) {
  try {
    const body = (await response.text()).slice(0, 512);
    return apiKey ? body.replaceAll(apiKey, '[redacted]') : body;
  } catch {
    return '<unable to read response body>';
  }
}
