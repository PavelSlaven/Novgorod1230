import { rememberLlmSettings } from './llm-settings-preferences.js';

export function createLlmSettingsController({ root, api, store, storage }) {
  return Object.freeze({ open, submit, setFieldsDisabled });

  async function open() {
    store.openOverlay('llm_settings');
    root.querySelector('[data-overlay-panel]')?.focus();
    try {
      store.setLlmSettings(await api.getLlmSettings());
    } catch (error) {
      store.setLlmSettingsMessage({ kind: 'error', text: llmErrorText(error) });
    }
  }

  async function submit(form, action) {
    const values = new root.ownerDocument.defaultView.FormData(form);
    const mode = values.get('mode');
    if (action === 'reset') {
      try {
        const settings = await api.resetLlmSettings();
        rememberLlmSettings(storage, settings);
        store.setLlmSettingsDraft(settings);
        store.setLlmSettings(settings, { kind: 'success', text: 'Возвращены настройки по умолчанию.' });
      } catch (error) {
        store.setLlmSettingsMessage({ kind: 'error', text: llmErrorText(error) });
      }
      return;
    }
    const candidate = llmSettingsCandidate(values);
    if (mode === 'custom' && (!candidate.base_url || !candidate.model)) {
      store.setLlmSettingsMessage({ kind: 'error', text: !candidate.base_url ? 'Укажи API base URL.' : 'Укажи model.' });
      return;
    }
    try {
      const result = action === 'test'
        ? await api.testLlmSettings(candidate)
        : await api.applyLlmSettings(candidate);
      if (action === 'test') {
        assertLlmProbeSuccess(result);
        store.setLlmSettingsMessage({ kind: 'success', text: 'Подключение проверено.' });
      } else {
        const settings = result.settings ?? result;
        rememberLlmSettings(storage, settings);
        store.setLlmSettingsDraft(settings);
        store.setLlmSettings(settings, { kind: 'success', text: 'Настройки применены.' });
      }
    } catch (error) {
      store.setLlmSettingsMessage({ kind: 'error', text: llmErrorText(error) });
    }
  }

  function setFieldsDisabled(disabled) {
    root.querySelectorAll('[data-llm-settings-form] input[name="base_url"], [data-llm-settings-form] input[name="model"], [data-llm-settings-form] input[name="api_key"], [data-llm-settings-form] button[value="test"]')
      .forEach((input) => { input.disabled = disabled; });
  }
}

export function llmSettingsCandidate(values) {
  const mode = values.get('mode');
  if (mode === 'default') return { mode: 'default' };
  return {
    mode,
    base_url: String(values.get('base_url') ?? '').trim(),
    model: String(values.get('model') ?? '').trim(),
    api_key: String(values.get('api_key') ?? '')
  };
}

export function assertLlmProbeSuccess(result) {
  if (result?.ok === true) return result;
  throw uiError('LLM_PROBE_FAILED', `Проверка не пройдена: ${safeProbeCategory(result?.category)}.`);
}

function safeProbeCategory(value) {
  const category = String(value ?? '').trim();
  return /^[a-z0-9_-]{1,64}$/iu.test(category) ? category : 'unknown';
}

function llmErrorText(error) {
  const code = String(error?.code ?? '');
  if (code === 'LLM_PROBE_FAILED') return error.message;
  if (/URL|CONFIG/u.test(code)) return 'Проверь API base URL.';
  if (/MODEL/u.test(code)) return 'Проверь model.';
  if (/AUTH|401|403/u.test(code)) return 'Проверь API key.';
  if (/TIMEOUT/u.test(code)) return 'Провайдер не ответил вовремя.';
  if (/UNREACHABLE|CONNECTION|NETWORK|TRANSPORT/u.test(code)) return 'Не удалось подключиться к endpoint.';
  if (/MALFORMED|PARSE|RESPONSE/u.test(code)) return 'Endpoint вернул неподдерживаемый ответ.';
  return 'Не удалось применить настройки LLM.';
}

function uiError(code, message) {
  return Object.assign(new Error(message), { code });
}
