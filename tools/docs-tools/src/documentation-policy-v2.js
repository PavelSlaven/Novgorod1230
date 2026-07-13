import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  buildDocumentationOutputs as buildLegacyDocumentationOutputs,
  validateDocumentationTree as validateLegacyDocumentationTree
} from './documentation.js';
import { verifyKnowledgeSourceMigration } from './knowledge-source.js';

export const buildDocumentationOutputs = buildLegacyDocumentationOutputs;

export async function writeDocumentationOutputs(rootDir = '.') {
  const root = resolve(rootDir);
  const outputs = await buildDocumentationOutputs(root);
  for (const [rel, content] of outputs) {
    const target = join(root, rel);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  const validation = await validateDocumentationTree(root);
  if (!validation.ok) throw new Error(validation.errors.join('\n'));
  return Object.freeze({ ok: true, files: [...outputs.keys()].sort() });
}

export async function checkDocumentationOutputs(rootDir = '.') {
  const root = resolve(rootDir);
  const expected = await buildDocumentationOutputs(root);
  const errors = [];
  for (const [rel, content] of expected) {
    const actual = await readFile(join(root, rel), 'utf8').catch(() => null);
    if (actual === null) errors.push(`${rel}: generated file is missing`);
    else if (actual !== content) errors.push(`${rel}: generated file is stale; run npm run docs:generate`);
  }
  const validation = await validateDocumentationTree(root);
  errors.push(...validation.errors);
  const knowledge = await verifyKnowledgeSourceMigration({ root });
  errors.push(...knowledge.errors.map((item) => `knowledge-source: ${item}`));
  return Object.freeze({ ok: errors.length === 0, errors, checked_files: [...expected.keys()].sort() });
}

export async function validateDocumentationTree(rootDir = '.') {
  const legacy = await validateLegacyDocumentationTree(rootDir);
  const errors = legacy.errors.filter((error) => !isActiveWorldCatalogFalsePositive(error));
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function isActiveWorldCatalogFalsePositive(error) {
  return String(error).startsWith('data/world-catalogs/')
    && String(error).endsWith(': legacy runtime data is not declared in manifest');
}
