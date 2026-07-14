function normalizeVital(value, fallback = 100) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeAlertKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

const ALERT_TAGS = new Map([
  ['wounded', 'ранен'],
  ['injury', 'ранен'],
  ['injured', 'ранен'],
  ['рана', 'ранен'],
  ['ранение', 'ранен'],
  ['ранен', 'ранен'],
  ['cold', 'мёрзнет'],
  ['холод', 'мёрзнет'],
  ['мерзнет', 'мёрзнет'],
  ['мёрзнет', 'мёрзнет'],
  ['wet', 'промок'],
  ['промокание', 'промок'],
  ['промок', 'промок'],
  ['hunger', 'голоден'],
  ['голод', 'голоден'],
  ['голоден', 'голоден'],
  ['fatigue', 'обессилен'],
  ['усталость', 'обессилен'],
  ['обессилен', 'обессилен'],
  ['fear', 'напуган'],
  ['страх', 'напуган'],
  ['напуган', 'напуган'],
  ['bleeding', 'кровотечение'],
  ['кровотечение', 'кровотечение'],
  ['illness', 'болен'],
  ['disease', 'болен'],
  ['болезнь', 'болен'],
  ['болен', 'болен'],
  ['overloaded', 'перегружен'],
  ['перегружен', 'перегружен'],
  ['bound', 'связан'],
  ['restrained', 'связан'],
  ['связан', 'связан'],
  ['drunk', 'пьян'],
  ['intoxicated', 'пьян'],
  ['опьянение', 'пьян'],
  ['пьян', 'пьян'],
  ['poisoned', 'отравлен'],
  ['poison', 'отравлен'],
  ['отравлен', 'отравлен'],
  ['отравление', 'отравлен']
]);

function summarizeActiveConditions(player = {}) {
  return Array.isArray(player.activeStates)
    ? player.activeStates.map((state) => ({
      id: state?.id ?? state?.code ?? state,
      label: state?.label ?? state?.name ?? state
    })).filter((state) => state.id || state.label)
    : [];
}

export function getPlayerAlertTags(player = {}) {
  const alerts = [];
  const seen = new Set();
  const pushAlert = (value) => {
    const key = normalizeAlertKey(value);
    const label = ALERT_TAGS.get(key);
    if (!label || seen.has(label)) return;
    seen.add(label);
    alerts.push(label);
  };

  for (const state of summarizeActiveConditions(player)) {
    pushAlert(state.id);
    pushAlert(state.label);
  }

  const legacyConditions = Array.isArray(player?.body?.active_conditions)
    ? player.body.active_conditions
    : [];
  for (const condition of legacyConditions) {
    pushAlert(condition);
  }

  const loadCategory = normalizeAlertKey(player?.items?.load_category ?? player?.load_category);
  if (loadCategory === 'overloaded') {
    pushAlert(loadCategory);
  }

  return alerts;
}

export function summarizeStateBadgeText(player = {}) {
  const count = getPlayerAlertTags(player).length;
  if (count === 0) return 'Тревог нет';
  if (count === 1) return '1 тревога';
  if (count >= 2 && count <= 4) return `${count} тревоги`;
  return `${count} тревог`;
}

export function getPlayerVitals(player = {}) {
  const states = player?.states && typeof player.states === 'object' ? player.states : {};
  return {
    health: normalizeVital(states.health, 100),
    satiety: normalizeVital(states.satiety, 100),
    vigor: normalizeVital(states.vigor, 100)
  };
}

export function summarizeNeedsText(player = {}) {
  if (!player) return '—';
  const vitals = getPlayerVitals(player);
  const alerts = getPlayerAlertTags(player);
  return [
    `Здоровье ${Math.round(vitals.health)}`,
    `Сытость ${Math.round(vitals.satiety)}`,
    `Бодрость ${Math.round(vitals.vigor)}`,
    alerts.length ? `Тревоги: ${alerts.slice(0, 4).join(' / ')}` : ''
  ].filter(Boolean).join(' · ');
}
