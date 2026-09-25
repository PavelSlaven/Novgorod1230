import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const CONTRACT_INDEX_REL = 'data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md';
const PRIORITY_TIERS = new Set([
  'highest_materialization_normative',
  'profile_normative',
  'development_process_normative',
  'technical_contract',
  'navigation',
  'reference'
]);

/**
 * Map CONTRACT_INDEX label → corpus-manifest retrieval status + priority_tier.
 * ACTIVE* → active with top normative priority; UNDECLARED / REFERENCE / REDIRECT → not active.
 */
export function mapIndexLabelToCorpusFields(indexLabel) {
  const label = String(indexLabel ?? '').trim().toUpperCase();
  if (!label) throw new Error('Empty CONTRACT_INDEX status label.');
  if (label.startsWith('ACTIVE') || label === 'GOVERNING') {
    const priority_tier = label.includes('SPECIALIZATION')
      ? 'highest_materialization_normative'
      : 'technical_contract';
    return { status: 'active', priority_tier, index_status: indexLabel.trim() };
  }
  if (label.startsWith('PROPOSED')) {
    return { status: 'proposed', priority_tier: 'profile_normative', index_status: indexLabel.trim() };
  }
  if (label.includes('REDIRECT') || label.startsWith('SUPERSEDED')) {
    return { status: 'deprecated', priority_tier: 'navigation', index_status: indexLabel.trim() };
  }
  if (label.startsWith('MIGRATION') || label.includes('ROLLBACK')) {
    return { status: 'deprecated', priority_tier: 'reference', index_status: indexLabel.trim() };
  }
  if (label.startsWith('REFERENCE') || label.startsWith('UNDECLARED')) {
    return { status: 'deprecated', priority_tier: 'reference', index_status: indexLabel.trim() };
  }
  throw new Error(`Unsupported CONTRACT_INDEX status label: ${indexLabel}`);
}

export function documentIdForCorpusFile(fileName) {
  if (fileName === 'README.md') return 'documentation-corpus-readme';
  return fileName.replace(/\.(?:md|txt)$/u, '').replaceAll('_', '-').toLowerCase();
}

export function parseContractIndexCorpusStatuses(markdown) {
  const byFile = new Map();
  const rowPattern = /^\|\s*\[`?([^`\]]+\.(?:md|txt))`?\]\([^)]+\)\s*\|\s*`([^`]+)`/gmu;
  for (const match of String(markdown ?? '').matchAll(rowPattern)) {
    const fileName = basenamePath(match[1]);
    if (fileName.includes('/')) continue;
    if (byFile.has(fileName)) continue; // first table row wins (§4 before weaker §5 repeats)
    byFile.set(fileName, mapIndexLabelToCorpusFields(match[2]));
  }
  // CONTRACT_INDEX itself is the navigation owner; header marks it active.
  if (!byFile.has('CONTRACT_INDEX.md')) {
    byFile.set('CONTRACT_INDEX.md', {
      status: 'active',
      priority_tier: 'navigation',
      index_status: 'ACTIVE / navigation index'
    });
  }
  return byFile;
}

export async function loadContractIndexCorpusStatuses({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const text = await readFile(join(projectRoot, CONTRACT_INDEX_REL), 'utf8');
  return parseContractIndexCorpusStatuses(text);
}

export function expectedCorpusFieldsForRecord(record, statusByFile) {
  const fileName = String(record?.file_name ?? '').trim();
  const derived = statusByFile.get(fileName);
  if (!derived) {
    throw new Error(`${record?.document_id ?? fileName}: file is not listed in CONTRACT_INDEX tables and has no default`);
  }
  return derived;
}

export function applyContractIndexStatusesToDocuments(documents, statusByFile) {
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array.');
  let changed = 0;
  for (const record of documents) {
    const derived = expectedCorpusFieldsForRecord(record, statusByFile);
    if (record.status !== derived.status || record.priority_tier !== derived.priority_tier) changed += 1;
    record.status = derived.status;
    record.priority_tier = derived.priority_tier;
  }
  return changed;
}

export function assertPriorityTier(value, label = 'priority_tier') {
  const tier = String(value ?? '').trim();
  if (!PRIORITY_TIERS.has(tier)) throw new Error(`Invalid ${label}: ${tier || '<empty>'}`);
  return tier;
}

export function diffCorpusStatusesAgainstIndex(documents, statusByFile) {
  const errors = [];
  for (const record of documents ?? []) {
    let derived;
    try {
      derived = expectedCorpusFieldsForRecord(record, statusByFile);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    if (record.status !== derived.status) {
      errors.push(`${record.document_id}: status ${record.status} != CONTRACT_INDEX-derived ${derived.status} (${derived.index_status})`);
    }
    if (record.priority_tier !== derived.priority_tier) {
      errors.push(`${record.document_id}: priority_tier ${record.priority_tier} != CONTRACT_INDEX-derived ${derived.priority_tier} (${derived.index_status})`);
    }
  }
  return errors;
}

function basenamePath(value) {
  return String(value ?? '').replaceAll('\\', '/').split('/').pop();
}
