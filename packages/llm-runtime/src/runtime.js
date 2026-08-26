import { createHash } from 'node:crypto';
import { explainJsonObjectParse } from '@rus/contracts/json';
import { resolveLlmExecutionConfig } from './provider-config.js';

export function describeRoleLlmCall({ scope, roleId = null, tierId = null,
  env = process.env, overrides = null } = {}) {
  const resolution = resolveLlmExecutionConfig({ scope, roleId, tierId, env,
    overrides });
  if (!resolution.enabled) return null;
  const config = resolution.config;
  return Object.freeze({ provider: config.provider, model: config.model,
    scope: config.scope, role_id: config.role_id,
    config_hash: hashConfig(config) });
}

export async function executeRoleLlmCall({
  scope,
  roleId = null,
  tierId = null,
  messages,
  env = process.env,
  telemetry = null,
  overrides = null
} = {}) {
  const resolution = resolveLlmExecutionConfig({ scope, roleId, tierId, env, overrides });
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
    telemetry
  });
}

export function createScopedChatCompletionClient({
  scope,
  roleId = null,
  tierId = null,
  env = process.env,
  telemetry = null,
  roleResolver = null,
  tierResolver = null
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
            }
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
    controller.abort(new Error('DeepSeek request timeout'));
  }, config.requestTimeoutMs);
  const configHash = hashConfig(config);
  let responseData = null;
  let callError = null;

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRequestPayload(config, messages)),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await safeReadText(response);
      callError = {
        code: `http_${response.status}`,
        message: `DeepSeek request failed (${response.status}): ${body}`,
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

    responseData = await response.json();
    const rawText = String(responseData?.choices?.[0]?.message?.content ?? '');
    if (config.parseJson) {
      const parsed = explainJsonObjectParse(rawText);
      if (!parsed.ok) {
        return buildResult({
          config,
          startedAt,
          status: 'parse_error',
          rawText,
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
      usage: responseData?.usage ?? null,
      configHash
    }, telemetry);
  } catch (error) {
    callError = {
      code: timedOut ? 'timeout' : 'transport_error',
      message: String(error?.message ?? error ?? 'Unknown transport error'),
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

function buildRequestPayload(config, messages) {
  return {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    ...(config.responseFormat ? { response_format: config.responseFormat } : {}),
    ...(config.thinking ? { thinking: config.thinking } : {}),
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
    ...(config.temperature != null ? { temperature: config.temperature } : {}),
    ...(config.topP != null ? { top_p: config.topP } : {})
  };
}

function buildResult(base, telemetry) {
  const result = {
    raw_text: base.rawText ?? '',
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
    provider: result.provider,
    model: result.model,
    scope: result.scope,
    roleId: result.role_id,
    tierId: result.tier_id,
    durationMs: result.durationMs,
    status: result.status === 'ok' ? 'ok' : 'error',
    error: result.error?.message ?? null,
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
    base_url: sanitizeBaseUrl(config.baseUrl),
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

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '<unable to read response body>';
  }
}
