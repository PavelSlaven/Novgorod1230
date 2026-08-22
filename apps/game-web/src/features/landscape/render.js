import { escapeHtml } from '../../shared/escape-html.js';
import { buildLandscapeRenderModel } from './render-model.js';

export function renderLandscape(screen) {
  const model = buildLandscapeRenderModel(screen);
  const { semantics } = model;
  const modifiers = [
    semantics.weather ? `landscape--weather-${semantics.weather}` : null,
    semantics.dayPart ? `landscape--day-${semantics.dayPart}` : null,
    ...semantics.environmentFacts.map((fact) => `landscape--${fact}`)
  ].filter(Boolean).join(' ');
  const context = screen.visible_context ?? {};
  const label = scalar(context.location_label ?? context.place);
  return `<section class="scene-viewport landscape${
    modifiers ? ` ${modifiers}` : ''
  }" data-landscape aria-label="Вид места действия"><canvas data-landscape-canvas width="1280" height="720" aria-hidden="true"></canvas>${
    label ? `<p class="landscape-caption">${escapeHtml(label)}</p>` : ''
  }</section>`;
}

function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export { buildLandscapeRenderModel } from './render-model.js';
