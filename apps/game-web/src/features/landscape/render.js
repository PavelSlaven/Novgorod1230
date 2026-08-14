import { escapeHtml } from '../../shared/escape-html.js';

const WEATHER = new Map([
  ['clear', 'clear'], ['ясно', 'clear'],
  ['cloudy', 'cloudy'], ['облачно', 'cloudy'],
  ['overcast', 'overcast'], ['пасмурно', 'overcast'],
  ['rain', 'rain'], ['дождь', 'rain'],
  ['snow', 'snow'], ['снег', 'snow'],
  ['fog', 'fog'], ['туман', 'fog']
]);
const DAY_PART = new Map([
  ['dawn', 'dawn'], ['рассвет', 'dawn'],
  ['morning', 'morning'], ['утро', 'morning'],
  ['day', 'day'], ['день', 'day'],
  ['evening', 'evening'], ['вечер', 'evening'],
  ['dusk', 'dusk'], ['сумерки', 'dusk'],
  ['night', 'night'], ['ночь', 'night']
]);
const ENVIRONMENT_FACTS = new Set(['cold', 'wet', 'exposed']);

export function renderLandscape(screen) {
  const context = screen.visible_context ?? {};
  const facts = new Set(Array.isArray(context.environment?.facts)
    ? context.environment.facts.filter((value) =>
        typeof value === 'string' && ENVIRONMENT_FACTS.has(value))
    : []);
  const weather = controlledValue(
    [context.weather, context.weather_label], WEATHER
  );
  const dayPart = controlledValue(
    [context.day_part, context.day_part_label], DAY_PART
  );
  const modifiers = [
    weather ? `landscape--weather-${weather}` : null,
    dayPart ? `landscape--day-${dayPart}` : null,
    ...[...facts].sort().map((fact) => `landscape--${fact}`)
  ].filter(Boolean).join(' ');
  const label = scalar(context.location_label ?? context.place);
  const semanticLayers = facts.size > 0 || weather !== null || dayPart !== null
    ? '<div class="landscape-sky" aria-hidden="true"></div><div class="landscape-horizon" aria-hidden="true"></div><div class="landscape-ground" aria-hidden="true"></div><div class="landscape-weather" aria-hidden="true"></div>'
    : '';
  return `<section class="scene-viewport landscape${modifiers ? ` ${modifiers}` : ''}" data-landscape aria-label="Условный вид места действия">${semanticLayers}<div class="scene-grain" aria-hidden="true"></div>${label ? `<p class="landscape-caption">${escapeHtml(label)}</p>` : ''}</section>`;
}

function controlledValue(candidates, vocabulary) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLocaleLowerCase('ru');
    if (vocabulary.has(normalized)) return vocabulary.get(normalized);
  }
  return null;
}

function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
