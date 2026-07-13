import { knowledgeSourceError } from '../errors.js';

const SCHEMA = 'rus.knowledge_corpus_manifest.v1';

export function validateCorpusManifest(value) {
  if (!value || typeof value !== 'object' || value.schema_version !== SCHEMA || !Array.isArray(value.documents)) {
    throw knowledgeSourceError('MANIFEST_INVALID', `Corpus manifest must use ${SCHEMA}.`);
  }
  const ids = new Set();
  const paths = new Set();
  const documents = value.documents.map((item, index) => normalizeDocument(item, index, ids, paths));
  return deepFreeze({
    schema_version: SCHEMA,
    corpus_id: requiredText(value.corpus_id, 'corpus_id'),
    release: optionalText(value.release),
    documents
  });
}

function normalizeDocument(item, index, ids, paths) {
  if (!item || typeof item !== 'object') throw knowledgeSourceError('MANIFEST_INVALID', `documents[${index}] must be an object.`);
  const documentId = requiredText(item.document_id, `documents[${index}].document_id`);
  const canonicalPath = requiredText(item.canonical_path, `documents[${index}].canonical_path`).replaceAll('\\', '/');
  if (!/^corpus\/DOCUMENTS\/[^/]+$/u.test(canonicalPath)) {
    throw knowledgeSourceError('MANIFEST_INVALID', `${canonicalPath} is outside corpus/DOCUMENTS.`);
  }
  if (ids.has(documentId)) throw knowledgeSourceError('DOCUMENT_ID_DUPLICATE', `Duplicate document_id: ${documentId}`);
  if (paths.has(canonicalPath)) throw knowledgeSourceError('CANONICAL_PATH_DUPLICATE', `Duplicate canonical_path: ${canonicalPath}`);
  ids.add(documentId);
  paths.add(canonicalPath);
  const digest = requiredText(item.sha256, `documents[${index}].sha256`);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw knowledgeSourceError('MANIFEST_INVALID', `Invalid SHA-256 for ${documentId}.`);
  const bytes = Number(item.bytes);
  if (!Number.isInteger(bytes) || bytes < 0) throw knowledgeSourceError('MANIFEST_INVALID', `Invalid bytes for ${documentId}.`);
  return {
    document_id: documentId,
    canonical_path: canonicalPath,
    file_name: requiredText(item.file_name, `documents[${index}].file_name`),
    sha256: digest,
    bytes,
    status: optionalText(item.status) || 'active',
    source_legacy_path: optionalText(item.source_legacy_path)
  };
}

export function validateAliases(value, manifest) {
  if (!value || value.schema_version !== 'rus.knowledge_source_aliases.v1' || !value.aliases || typeof value.aliases !== 'object') {
    throw knowledgeSourceError('MANIFEST_INVALID', 'Source aliases manifest is invalid.');
  }
  const known = new Set(manifest.documents.map((item) => item.document_id));
  const aliases = {};
  for (const [alias, documentId] of Object.entries(value.aliases)) {
    const cleanAlias = requiredText(alias, 'alias');
    const cleanId = requiredText(documentId, `aliases.${alias}`);
    if (!known.has(cleanId)) throw knowledgeSourceError('MANIFEST_INVALID', `Alias ${cleanAlias} references unknown document ${cleanId}.`);
    aliases[cleanAlias] = cleanId;
  }
  return deepFreeze({ schema_version: value.schema_version, aliases });
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredText(value, field) {
  const result = String(value ?? '').trim();
  if (!result) throw knowledgeSourceError('MANIFEST_INVALID', `${field} is required.`);
  return result;
}

function optionalText(value) {
  return String(value ?? '').trim();
}
