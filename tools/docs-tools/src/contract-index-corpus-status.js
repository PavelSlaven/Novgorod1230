import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const CONTRACT_INDEX_REL = 'data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md';
const PRIORITY_TIERS = new Set([
  'highest_materialization_normative',
  'profile_normative',
  'development_process_normative',
  'technical_contract',
  'navigation',
  'proposed',
  'reference'
]);

/** Exact CONTRACT_INDEX status labels → corpus retrieval fields. Unknown label → throw. */
const INDEX_LABEL_MAP = Object.freeze({
  ACTIVE: { status: 'active', priority_tier: 'technical_contract' },
  'ACTIVE SPECIALIZATION': { status: 'active', priority_tier: 'highest_materialization_normative' },
  'ACTIVE DOMAIN NORM': { status: 'active', priority_tier: 'technical_contract' },
  GOVERNING: { status: 'active', priority_tier: 'technical_contract' },
  'ACTIVE / navigation index': { status: 'active', priority_tier: 'navigation' },
  PROPOSED: { status: 'proposed', priority_tier: 'proposed' },
  'PROPOSED UMBRELLA TARGET': { status: 'proposed', priority_tier: 'proposed' },
  'UNDECLARED / DOMAIN GUIDE': { status: 'reference', priority_tier: 'reference' },
  REFERENCE: { status: 'reference', priority_tier: 'reference' },
  'REFERENCE / DOMAIN GUIDE': { status: 'reference', priority_tier: 'reference' },
  'REFERENCE / KNOWLEDGE GUIDE': { status: 'reference', priority_tier: 'reference' },
  'REFERENCE / TEMPLATE': { status: 'reference', priority_tier: 'reference' },
  'REFERENCE FOR PROPOSED POLICY': { status: 'reference', priority_tier: 'reference' },
  'REFERENCE / LEGACY': { status: 'deprecated', priority_tier: 'reference' },
  'SUPERSEDED / REDIRECT': { status: 'deprecated', priority_tier: 'navigation' },
  REDIRECT: { status: 'deprecated', priority_tier: 'navigation' },
  'MIGRATION / ROLLBACK': { status: 'deprecated', priority_tier: 'reference' }
});

/**
 * Map CONTRACT_INDEX label → corpus-manifest retrieval status + priority_tier.
 * Exact labels only; unknown label → throw (knowledge:check fails).
 */
export function mapIndexLabelToCorpusFields(indexLabel) {
  const label = String(indexLabel ?? '').trim();
  if (!label) throw new Error('Empty CONTRACT_INDEX status label.');
  const mapped = INDEX_LABEL_MAP[label];
  if (!mapped) throw new Error(`Unsupported CONTRACT_INDEX status label: ${indexLabel}`);
  return { ...mapped, index_status: label };
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
    const fields = mapIndexLabelToCorpusFields(match[2]);
    if (byFile.has(fileName)) {
      const previous = byFile.get(fileName);
      if (previous.index_status !== fields.index_status) {
        throw new Error(
          `${fileName}: duplicate CONTRACT_INDEX rows with different labels (${previous.index_status} vs ${fields.index_status})`
        );
      }
      continue;
    }
    byFile.set(fileName, fields);
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
    throw new Error(
      `${record?.document_id ?? fileName}: not listed in CONTRACT_INDEX; add a table row before knowledge:repin`
    );
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
