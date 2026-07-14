import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const CORPUS_MANIFEST_PATH = 'data/knowledge-source/corpus-manifest.json';
const CORPUS_PREFIX = 'data/knowledge-source/corpus/';

export async function validateCanonicalCorpusDelegation({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const errors = [];
  const registry = await readJson(join(projectRoot, 'docs/migration/CANONICAL_PATHS.json')).catch(() => null);
  const corpus = await readJson(join(projectRoot, CORPUS_MANIFEST_PATH)).catch(() => null);

  if (registry?.schema_version !== 'rus.canonical_document_paths.v1' || !Array.isArray(registry.documents)) {
    errors.push('docs/migration/CANONICAL_PATHS.json: invalid registry');
  }
  if (corpus?.schema_version !== 'rus.knowledge_corpus_manifest.v2' || !Array.isArray(corpus.documents)) {
    errors.push(`${CORPUS_MANIFEST_PATH}: invalid corpus manifest`);
  }

  const registryDocuments = registry?.documents ?? [];
  const manifestRegistrations = registryDocuments.filter((item) => item?.canonical_path === CORPUS_MANIFEST_PATH);
  if (manifestRegistrations.length !== 1) {
    errors.push(`${CORPUS_MANIFEST_PATH}: must be registered exactly once in CANONICAL_PATHS.json`);
  }

  const directCorpusRegistrations = registryDocuments.filter((item) => String(item?.canonical_path ?? '').startsWith(CORPUS_PREFIX));
  if (directCorpusRegistrations.length > 0) {
    errors.push('CANONICAL_PATHS.json must delegate corpus file ownership to corpus-manifest.json');
  }

  const seenPaths = new Set();
  let duplicateCanonicalPathCount = 0;
  for (const item of corpus?.documents ?? []) {
    const relativePath = String(item?.canonical_path ?? '');
    const fullPath = relativePath ? `data/knowledge-source/${relativePath}` : '';
    if (!relativePath || !relativePath.startsWith('corpus/')) {
      errors.push(`${item?.document_id ?? '?'}: invalid corpus canonical_path`);
      continue;
    }
    if (seenPaths.has(fullPath)) {
      duplicateCanonicalPathCount += 1;
      errors.push(`${fullPath}: duplicate corpus canonical path`);
    }
    seenPaths.add(fullPath);
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    corpus_document_count: (corpus?.documents ?? []).length,
    duplicate_canonical_path_count: duplicateCanonicalPathCount,
    direct_corpus_file_registration_count: directCorpusRegistrations.length
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
