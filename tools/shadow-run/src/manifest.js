import { readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

export const REQUIRED_SHADOW_CATEGORIES = Object.freeze([
  'schema_equivalence',
  'canonical_ids',
  'no_new_facts_from_code',
  'audit_decisions',
  'repair_tier',
  'db_write_plan',
  'commit_result',
  'visible_hidden_separation',
  'ui_read_model',
  'error_classification',
  'idempotency',
  'telemetry_completeness'
]);

export async function loadShadowManifest(root, path = 'data/shadow-corpus/manifest.json') {
  const absolute = resolve(root, path);
  const parsed = JSON.parse(await readFile(absolute, 'utf8'));
  return validateShadowManifest(parsed, root);
}

export function validateShadowManifest(manifest, root = process.cwd()) {
  const errors = [];
  if (manifest?.schema_version !== 'rus.shadow_corpus.v1') errors.push('schema_version must be rus.shadow_corpus.v1');
  if (!text(manifest?.corpus_id)) errors.push('corpus_id is required');
  if (manifest?.comparison_policy?.prose_comparison !== 'semantic_invariants_only') errors.push('prose_comparison must be semantic_invariants_only');
  if (!Array.isArray(manifest?.cases) || manifest.cases.length === 0) errors.push('cases must be a non-empty array');
  const ids = new Set();
  const covered = new Set();
  for (const item of manifest?.cases ?? []) {
    if (!text(item?.id)) errors.push('case id is required');
    else if (ids.has(item.id)) errors.push(`duplicate case id: ${item.id}`);
    else ids.add(item.id);
    if (!['parity', 'isolation', 'rollback'].includes(item?.kind)) errors.push(`${item?.id ?? '<unknown>'}: invalid kind`);
    if (!Array.isArray(item?.categories) || item.categories.length === 0) errors.push(`${item?.id ?? '<unknown>'}: categories are required`);
    for (const category of item?.categories ?? []) {
      if (!REQUIRED_SHADOW_CATEGORIES.includes(category)) errors.push(`${item?.id ?? '<unknown>'}: unknown category ${category}`);
      covered.add(category);
    }
    try { assertTestPath(root, item?.test_file); } catch (error) { errors.push(`${item?.id ?? '<unknown>'}: ${error.message}`); }
  }
  for (const category of REQUIRED_SHADOW_CATEGORIES) if (!covered.has(category)) errors.push(`required category is not covered: ${category}`);
  if (errors.length) throw shadowError('SHADOW_MANIFEST_INVALID', errors.join('; '), { errors });
  return Object.freeze(structuredClone(manifest));
}

export function assertTestPath(root, testFile) {
  const value = text(testFile);
  if (!value) throw shadowError('SHADOW_CASE_PATH_INVALID', 'test_file is required');
  const absoluteRoot = resolve(root);
  const absoluteTest = resolve(root, value);
  const rel = relative(absoluteRoot, absoluteTest);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || !rel.replaceAll('\\', '/').startsWith('test/')) {
    throw shadowError('SHADOW_CASE_PATH_INVALID', `test_file must stay inside test/: ${value}`);
  }
  if (!/\.test\.[cm]?js$/u.test(value)) throw shadowError('SHADOW_CASE_PATH_INVALID', `test_file must be a Node test module: ${value}`);
  return absoluteTest;
}

function text(value) { return String(value ?? '').trim(); }
function shadowError(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
