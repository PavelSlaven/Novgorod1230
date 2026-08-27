const STORAGE_KEY = 'rus.llm_settings';

export function storedLlmSettings(storage) {
  try {
    const value = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    return {
      mode: value.mode === 'custom' ? 'custom' : 'default',
      base_url: text(value.base_url),
      model: text(value.model),
      api_key_present: false
    };
  } catch { return null; }
}

export function rememberLlmSettings(storage, settings) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify({
      mode: settings?.mode === 'custom' ? 'custom' : 'default',
      base_url: text(settings?.base_url),
      model: text(settings?.model)
    }));
  } catch { /* storage is optional */ }
}

function text(value) { return String(value ?? '').trim() || null; }
