import { createApiClient } from '../api/client.js';
import { resolvePortraitInput } from './input.js';
import { renderPortrait } from './renderer.js';
import { SAMPLE_PORTRAIT_SPEC, SAMPLE_PORTRAIT_TEXT } from './sample.js';

export function bootstrapPortraitLab({
  root = document.querySelector('[data-portrait-lab-root]'),
  api = createApiClient()
} = {}) {
  if (!root) throw new TypeError('portrait lab root element is required.');
  const form = required(root, '[data-portrait-form]');
  const input = required(root, '[data-portrait-input]');
  const canvas = required(root, '[data-portrait-canvas]');
  const json = required(root, '[data-portrait-json]');
  const errorBox = required(root, '[data-portrait-error]');
  const status = required(root, '[data-portrait-status]');
  const submit = required(root, '[data-portrait-submit]');
  const download = required(root, '[data-portrait-download]');

  input.value = input.value.trim() || SAMPLE_PORTRAIT_TEXT;
  showPortrait(canvas, json, SAMPLE_PORTRAIT_SPEC);
  status.textContent = 'Пример построен локально из JSON.';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    errorBox.hidden = true;
    errorBox.textContent = '';
    status.textContent = 'Готовим портрет…';
    try {
      const result = await resolvePortraitInput(input.value, {
        normalizeText: (text) => api.normalizePortraitSpec({ text })
      });
      showPortrait(canvas, json, result.spec);
      status.textContent = result.source === 'json'
        ? 'Нарисовано напрямую из JSON — DeepSeek не вызывался.'
        : 'Описание преобразовано DeepSeek и нарисовано из полученного JSON.';
      root.dataset.lastSource = result.source;
    } catch (error) {
      errorBox.textContent = friendlyMessage(error);
      errorBox.hidden = false;
      status.textContent = 'Портрет не изменён.';
      root.dataset.lastSource = 'error';
    } finally {
      submit.disabled = false;
    }
  });

  download.addEventListener('click', () => downloadPng(canvas));
  return Object.freeze({ api, canvas, form, input });
}

function showPortrait(canvas, json, spec) {
  renderPortrait(canvas, spec);
  json.textContent = JSON.stringify(spec, null, 2);
}

function friendlyMessage(error) {
  if (error?.code === 'PORTRAIT_SPEC_PROVIDER_FAILED') {
    return 'DeepSeek сейчас недоступен. Проверьте серверную конфигурацию и повторите запрос.';
  }
  if (error?.code === 'PORTRAIT_SPEC_PROVIDER_INVALID'
      || error?.code === 'PORTRAIT_SPEC_SERVER_INVALID') {
    return 'DeepSeek вернул неподдерживаемые данные. Портрет не был нарисован.';
  }
  return String(error?.message ?? 'Не удалось построить портрет.');
}

function downloadPng(canvas) {
  canvas.toBlob?.((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'portrait-lab.png';
    link.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new TypeError(`Missing portrait lab element: ${selector}`);
  return element;
}
