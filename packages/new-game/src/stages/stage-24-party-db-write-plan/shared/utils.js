import { computePartyDbWritePlanDigest as contractPlanDigest, computeStage24ArtifactDigest } from '@rus/contracts';
import { FORMAT_PLAN_CODES } from '../policy/constants.js';

export function canonicalJson(value) { return JSON.stringify(sortValue(value)); }
export function computeStage24Digest(value) { return computeStage24ArtifactDigest(value); }
export function computePartyDbWritePlanDigest(value) { return contractPlanDigest(value); }
export function historyEntry(kind, role, issueCodes) {
  return { attempt_index: Date.now(), kind, role, issue_codes: [...new Set(array(issueCodes).filter(text))] };
}
export async function callRole(callback, payload, role) {
  const result = await callback(safeClone(payload));
  if (result == null) throw new Error(`${role} returned no result.`);
  return result?.output ?? result?.parsed_json ?? result;
}
export function parseRoleResult(value) {
  if (typeof value === 'string') {
    try { return { value: JSON.parse(stripMarkdownFence(value)), raw: value, parseError: null }; }
    catch (error) { return { value: null, raw: value, parseError: error.message }; }
  }
  return { value: safeClone(value), raw: value, parseError: null };
}
export function unwrapRoleResult(value) { return parseRoleResult(value).value; }
export function stripMarkdownFence(value) { return String(value).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''); }
export function stage24Error(message, concerns = [], failedGate = null, repairRoute = null) {
  const error = new Error(`${message}${concerns.length ? ` ${concerns.map((item) => item.code).join(',')}` : ''}`);
  error.lifecycle = {
    stage_id: 24, stage_slug: 'party_write_plan', stage_type: 'isolated_llm_block', failed_gate: failedGate,
    concerns: safeClone(concerns), repair_route: safeClone(repairRoute),
    terminal_status: repairRoute ? 'repair_required' : 'stage_failed'
  };
  return error;
}
export function issue(code, message, path = null, severity = null) {
  return { code, severity: severity ?? defaultSeverity(code), message, path };
}
export function defaultSeverity(code) {
  if (FORMAT_PLAN_CODES.has(code) || code === 'WRITE_PLAN_AUDIT_INVALID') return 'format_error';
  if (code.includes('INPUT_BINDING') || code.includes('MANIFEST') || code.includes('DATABASE_SCHEMA')) return 'upstream_block';
  if (code.includes('WORLD_BASE') || code.includes('HIDDEN_PUBLIC') || code.includes('NON_ATOMIC')) return 'hard_block';
  return 'repairable';
}
export function passCheck(pass) { return { pass: Boolean(pass) }; }
export function tableName(table) { return table?.name ?? table?.table_name ?? null; }
export function text(value) { return typeof value === 'string' ? value.trim() : ''; }
export function array(value) { return Array.isArray(value) ? value : []; }
export function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function safeClone(value) { return value == null ? value : structuredClone(value); }
export function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
export function walk(value, callback, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, callback, path ? `${path}[${index}]` : `[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, current] of Object.entries(value)) {
    const currentPath = path ? `${path}.${key}` : key;
    callback(key, current, currentPath);
    walk(current, callback, currentPath);
  }
}
