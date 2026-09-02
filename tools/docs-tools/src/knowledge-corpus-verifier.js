import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const SOURCE_ROOT = 'data/knowledge-source';

export async function verifyCanonicalCorpus({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const sourceRoot = join(projectRoot, SOURCE_ROOT);
  const errors = [];
  const manifestBytes = await readFile(join(sourceRoot, 'corpus-manifest.json')).catch((error) => {
    errors.push(`corpus manifest missing: ${error.message}`);
    return null;
  });
  if (!manifestBytes) return freezeResult({ errors, documentCount: 0, legacyCount: 0 });

  const manifest = parseJson(manifestBytes, 'corpus manifest', errors);
  const aliasesBytes = await readFile(join(sourceRoot, 'source-aliases.json')).catch((error) => {
    errors.push(`source aliases missing: ${error.message}`);
    return null;
  });
  const aliases = aliasesBytes ? parseJson(aliasesBytes, 'source aliases', errors) : null;
  if (!manifest || !aliases) return freezeResult({ errors, documentCount: 0, legacyCount: 0 });

  if (manifest.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(manifest.documents)) {
    errors.push('invalid corpus manifest schema');
    return freezeResult({ errors, documentCount: 0, legacyCount: 0 });
  }
  if (aliases.schema_version !== 'rus.knowledge_source_aliases.v1' || !aliases.aliases || typeof aliases.aliases !== 'object') {
    errors.push('invalid source aliases schema');
  }

  const ids = new Set();
  const paths = new Set();
  let legacyCount = 0;
  let activeCount = 0;
  let proposedCount = 0;
  for (const record of manifest.documents) {
    const id = String(record.document_id ?? '');
    const canonicalPath = String(record.canonical_path ?? '');
    const status = String(record.status ?? '');
    if (!id) errors.push('document without document_id');
    if (ids.has(id)) errors.push(`duplicate document_id: ${id}`);
    ids.add(id);
    if (!['active', 'proposed', 'deprecated'].includes(status)) errors.push(`${id}: invalid document status ${status || '<empty>'}`);
    if (status === 'active') activeCount += 1;
    if (status === 'proposed') proposedCount += 1;
    if (!/^corpus\/DOCUMENTS\/[^/]+$/u.test(canonicalPath)) {
      errors.push(`${id}: invalid canonical_path`);
      continue;
    }
    if (paths.has(canonicalPath)) errors.push(`duplicate canonical_path: ${canonicalPath}`);
    paths.add(canonicalPath);

    const bytes = await readFile(join(sourceRoot, canonicalPath)).catch(() => null);
    if (!bytes) {
      errors.push(`${id}: document file missing`);
      continue;
    }
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== record.sha256 || bytes.length !== record.bytes) {
      errors.push(`${id}: document hash or size mismatch; actual sha256=${actualSha256} bytes=${bytes.length}`);
    }
    if (record.file_name !== basename(canonicalPath)) errors.push(`${id}: file_name differs from canonical_path`);
    if (record.source_legacy_path) legacyCount += 1;
  }

  for (const [alias, id] of Object.entries(aliases.aliases ?? {})) {
    if (!alias.trim()) errors.push('empty source alias');
    if (!ids.has(id)) errors.push(`alias ${alias} references unknown document ${id}`);
  }

  return freezeResult({ errors, documentCount: manifest.documents.length, activeCount, proposedCount, legacyCount, manifestSha256: sha256(manifestBytes) });
}

function parseJson(bytes, label, errors) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    errors.push(`${label} is invalid JSON: ${error.message}`);
    return null;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function freezeResult({ errors, documentCount, activeCount = 0, proposedCount = 0, legacyCount, manifestSha256 = '' }) {
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...errors]),
    document_count: documentCount,
    active_document_count: activeCount,
    proposed_document_count: proposedCount,
    legacy_document_count: legacyCount,
    corpus_manifest_sha256: manifestSha256
  });
}
