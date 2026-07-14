import { FORBIDDEN_PUBLIC_KEYS, TECHNICAL_TOKEN_PATTERN } from '../policy/constants.js';
import { issue } from '../shared/issues.js';
import { isObject } from '../shared/utils.js';

export function findForbiddenFirstScreenFields(value, path = 'screen') {
  const violations = [];
  walkPublicValue(value, path, violations);
  return violations;
}

export function findRawIdLeaks(screen) {
  const concerns = [];
  walkDisplayStrings(screen, 'screen', (value, path) => {
    if (TECHNICAL_TOKEN_PATTERN.test(value)) concerns.push(issue('FIRST_SCREEN_RAW_ID_LEAK', `Raw technical ID detected in player-visible text at ${path}.`, path, 'repairable'));
  });
  return concerns;
}

export function walkDisplayStrings(value, path, visitor, key = '') {
  if (typeof value === 'string') {
    if (isDisplayStringKey(key)) visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkDisplayStrings(item, `${path}[${index}]`, visitor, key));
    return;
  }
  if (!isObject(value)) return;
  for (const [childKey, child] of Object.entries(value)) walkDisplayStrings(child, `${path}.${childKey}`, visitor, childKey);
}

export function isDisplayStringKey(key) {
  return ['main_prose', 'label', 'public_position_label', 'public_time_label', 'public_light_label', 'public_weather_label', 'public_character_label', 'risk_hint', 'certainty', 'placeholder'].includes(key)
    || key.endsWith('_summary') || key.endsWith('_badges');
}

export function walkPublicValue(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPublicValue(item, `${path}[${index}]`, violations));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      violations.push({ code: codeForForbiddenKey(key), path: childPath, message: `Forbidden public field: ${key}.`, severity: 'hard_block' });
      continue;
    }
    walkPublicValue(child, childPath, violations);
  }
}

export function codeForForbiddenKey(key) {
  if (key.includes('source')) return 'FIRST_SCREEN_SOURCE_TRACE_LEAK';
  if (key.includes('audit')) return 'FIRST_SCREEN_AUDIT_TEXT_LEAK';
  if (key.includes('debug')) return 'FIRST_SCREEN_DEBUG_TEXT_LEAK';
  if (key.includes('raw')) return 'FIRST_SCREEN_RAW_JSON_LEAK';
  if (key.includes('private')) return 'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK';
  if (key.includes('closed_container')) return 'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK';
  if (key.includes('future')) return 'FIRST_SCREEN_FUTURE_EVENT_LEAK';
  return 'FIRST_SCREEN_HIDDEN_STATE_LEAK';
}
