import { escapeHtml } from '../../shared/escape-html.js';

const OUTCOME_LABELS = Object.freeze({
  clean_success: 'чистый успех', success: 'успех',
  success_with_cost: 'успех с ценой',
  failure_with_consequence: 'неудача с последствием',
  severe_failure: 'тяжёлая неудача'
});

export function renderChecks(screen) {
  const checks = screen.checks ?? [];
  if (checks.length === 0) return '';
  return `<section class="check-history" aria-label="Проверки хода">${checks
    .map(renderCheck).join('')}</section>`;
}

function renderCheck(check) {
  const outcome = OUTCOME_LABELS[check.outcome.band];
  const note = check.outcome.roll_note === 'natural_1' ? ' · выпала 1'
    : check.outcome.roll_note === 'natural_20' ? ' · выпало 20' : '';
  const modifiers = check.modifiers.map((modifier) =>
    `<div><dt>${escapeHtml(modifier.label)}</dt><dd>${signed(modifier.value)}</dd></div>`
  ).join('');
  const consequence = check.consequence_label == null ? ''
    : `<p>${escapeHtml(check.consequence_label)}</p>`;
  return `<article class="check-card"><p class="check-action"><strong>${escapeHtml(check.actor_label)}</strong> · ${escapeHtml(check.action_label)}</p><p class="check-summary"><span>${escapeHtml(check.die)}: <strong>${check.roll}</strong></span><span>итог <strong>${check.total}</strong> против сложности <strong>${check.difficulty}</strong></span><span class="check-outcome">${escapeHtml(outcome)}${note}</span></p><details><summary>Расшифровка броска</summary><p class="check-formula">${escapeHtml(check.formula)}</p><dl class="check-modifiers">${modifiers}<div><dt>Запас</dt><dd>${signed(check.outcome.margin)}</dd></div></dl>${consequence}</details></article>`;
}

function signed(value) {
  return escapeHtml(value > 0 ? `+${value}` : String(value));
}
