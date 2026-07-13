import { FORBIDDEN_PUBLIC_KEYS } from '../policy/constants.js';

export function buildStage25ErrorConcern(error, code, fallback) {
  return issue(code, error?.message ?? fallback, null);
}

export function extractConcerns(error, code, fallback) {
  if (Array.isArray(error?.concerns) && error.concerns.length > 0) return normalizeConcerns(error.concerns);
  return [buildStage25ErrorConcern(error, code, fallback)];
}

export function stage25Error(phase, concerns, message) {
  const error = new Error(message);
  error.phase = phase;
  error.concerns = normalizeConcerns(concerns);
  return error;
}

export function normalizeConcerns(concerns) {
  return array(concerns).map((item) => isObject(item)
    ? { code: text(item.code) || 'STAGE25_UNKNOWN_ERROR', severity: item.severity ?? 'hard_block', message: text(item.message) || String(item.code ?? 'Stage 25 failure.'), ...(item.path ? { path: item.path } : {}) }
    : issue('STAGE25_UNKNOWN_ERROR', String(item)));
}

export function stripPhysicalPlan(preflight) {
  if (!isObject(preflight)) return preflight;
  const next = safeClone(preflight);
  delete next.physical_write_plan;
  return next;
}

export function routeKindForPhase(phase) {
  if (['input_validation', 'preflight', 'commit_gate'].includes(phase)) return 'stage24_result_rebuild';
  if (phase === 'dry_run') return 'party_db_write_plan_or_schema_repair';
  if (phase === 'idempotency') return 'manual_idempotency_review';
  if (phase === 'transaction') return 'transaction_infrastructure_or_plan_repair';
  if (phase === 'postcommit') return 'manual_postcommit_recovery';
  return 'stage24_result_rebuild';
}

export function hasDependencyCycle(byId) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of array(byId.get(id)?.depends_on_batches)) if (byId.has(dep) && visit(dep)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...byId.keys()].some(visit);
}

export function findForbiddenPublicPaths(value, path = '') {
  const results = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => results.push(...findForbiddenPublicPaths(item, `${path}[${index}]`)));
    return results;
  }
  if (!isObject(value)) return results;
  for (const [key, item] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) results.push(nextPath);
    results.push(...findForbiddenPublicPaths(item, nextPath));
  }
  return results;
}

export function passCheck(pass, evidence = []) {
  return { pass: pass === true, evidence: array(evidence) };
}

export function issue(code, message, path = null) {
  return { code, severity: 'hard_block', message, ...(path ? { path } : {}) };
}

export function sameScalarSet(a, b) {
  const left = array(a);
  const right = array(b);
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && left.every((item) => right.includes(item));
}

export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

export function safeClone(value) {
  return value == null ? value : structuredClone(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

export function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
