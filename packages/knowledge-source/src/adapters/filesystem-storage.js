import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { knowledgeSourceError } from '../errors.js';

export function createFileSystemKnowledgeSourceStorage({ sourceRoot, generatedRoot, fileSystem = {} } = {}) {
  const source = resolveRequiredRoot(sourceRoot, 'sourceRoot');
  const generated = resolveRequiredRoot(generatedRoot, 'generatedRoot');
  const read = fileSystem.readFile ?? readFile;
  const getStat = fileSystem.stat ?? stat;
  return Object.freeze({
    readCorpusManifest: () => readJsonAndBytes(read, resolveWithin(source, 'corpus-manifest.json')),
    readAliases: () => readJsonAndBytes(read, resolveWithin(source, 'source-aliases.json')),
    readRetrievalPolicy: () => readJsonAndBytes(read, resolveWithin(source, 'retrieval-policy.json')),
    readDocument: (canonicalPath) => readBytes(read, getStat, resolveWithin(source, canonicalPath), 'DOCUMENT_FILE_MISSING'),
    readGeneratedManifest: (kind) => readOptionalJsonAndBytes(read, resolveWithin(generated, `${safeKind(kind)}/manifest.json`)),
    readGeneratedArtifact: (kind, name) => readBytes(read, getStat, resolveWithin(generated, `${safeKind(kind)}/${safeName(name)}`), 'GENERATED_INDEX_NOT_FOUND')
  });
}

async function readJsonAndBytes(read, path) {
  const bytes = await read(path).catch((error) => {
    throw knowledgeSourceError('MANIFEST_NOT_FOUND', `Manifest not found: ${path}`, { cause: error.message });
  });
  try {
    return Object.freeze({ value: JSON.parse(bytes.toString('utf8')), bytes: Buffer.from(bytes) });
  } catch (error) {
    throw knowledgeSourceError('MANIFEST_INVALID', `Manifest is not valid JSON: ${path}`, { cause: error.message });
  }
}

async function readOptionalJsonAndBytes(read, path) {
  const bytes = await read(path).catch(() => null);
  if (bytes === null) return null;
  try {
    return Object.freeze({ value: JSON.parse(bytes.toString('utf8')), bytes: Buffer.from(bytes) });
  } catch (error) {
    throw knowledgeSourceError('GENERATED_PROVENANCE_INVALID', `Generated manifest is not valid JSON: ${path}`, { cause: error.message });
  }
}

async function readBytes(read, getStat, path, code) {
  const info = await getStat(path).catch((error) => {
    throw knowledgeSourceError(code, `File not found: ${path}`, { cause: error.message });
  });
  if (!info.isFile()) throw knowledgeSourceError(code, `Expected file: ${path}`);
  const bytes = await read(path);
  return Object.freeze({ bytes: Buffer.from(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
}

function resolveRequiredRoot(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required.`);
  return resolve(text);
}

function resolveWithin(root, relativePath) {
  const target = resolve(root, String(relativePath ?? ''));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw knowledgeSourceError('PATH_TRAVERSAL_REJECTED', `Path escapes configured root: ${relativePath}`);
  }
  return target;
}

function safeKind(value) {
  const kind = String(value ?? '').trim();
  if (!['graph', 'rag'].includes(kind)) throw knowledgeSourceError('PATH_TRAVERSAL_REJECTED', `Unsupported generated kind: ${kind}`);
  return kind;
}

function safeName(value) {
  const name = String(value ?? '').trim();
  if (!/^[A-Za-z0-9._-]+$/u.test(name)) throw knowledgeSourceError('PATH_TRAVERSAL_REJECTED', `Unsafe generated file name: ${name}`);
  return name;
}
