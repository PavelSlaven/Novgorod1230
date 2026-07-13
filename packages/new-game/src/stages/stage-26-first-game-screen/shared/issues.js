import { array, isObject, optionalPublicText, text } from './utils.js';

export function normalizeAuditConcerns(concerns) {
  return array(concerns).map((item) => {
    if (isObject(item)) return issue(item.code ?? 'FIRST_SCREEN_AUDIT_FAILED', item.message ?? item.code ?? 'Stage 26 audit failed.', item.path ?? item.field ?? 'audit', item.severity ?? 'repairable');
    return issue('FIRST_SCREEN_AUDIT_FAILED', String(item), 'audit', 'repairable');
  });
}

export function stage26Error(phase, concerns, message = 'Stage 26 failed.') {
  const error = new Error(message);
  error.stage26_phase = phase;
  error.concerns = normalizeAuditConcerns(concerns);
  return error;
}

export function extractIssues(error, fallbackCode) {
  if (Array.isArray(error?.concerns)) return normalizeAuditConcerns(error.concerns);
  return [issue(fallbackCode, error?.message ?? String(error), 'stage26', 'hard_block')];
}

export function issue(code, message, path = null, severity = 'hard_block') {
  return { code, severity, path, message };
}

export function dedupeIssues(items) {
  const seen = new Set();
  return array(items).filter((item) => {
    const key = `${item.code}|${item.path ?? ''}|${item.message ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function requirePublicText(value, field) {
  const result = optionalPublicText(value);
  if (!result) throw stage26Error('projection', [issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', `Public text is required: ${field}.`, field, 'hard_block')]);
  return result;
}

export function requireText(value, field) {
  const result = text(value);
  if (!result) throw stage26Error('projection', [issue('FIRST_SCREEN_INPUT_INVALID', `Text is required: ${field}.`, field, 'hard_block')]);
  return result;
}
