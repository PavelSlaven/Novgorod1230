import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const PACK_SCHEMA = 'world_knowledge_authoring_pack_v1';
const DESCRIPTOR_SCHEMA = 'world_knowledge_authoring_descriptor_v1';
const FRAGMENT_SCHEMA = 'world_knowledge_authoring_fragment_v1';
const RECORD_ARRAYS = ['sources', 'evidence', 'concepts', 'claims', 'coverage_profiles', 'concept_localizations', 'claim_localizations', 'verifications'];

export class WorldKnowledgeAuthoringLoadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorldKnowledgeAuthoringLoadError';
    this.code = 'WORLD_KNOWLEDGE_AUTHORING_LOAD_INVALID';
  }
}

export async function loadWorldKnowledgeAuthoringInput(inputPath) {
  const descriptorPath = resolveRequired(inputPath);
  const input = await readJson(descriptorPath);
  if (input.schema === PACK_SCHEMA) return input;
  if (input.schema !== DESCRIPTOR_SCHEMA || !Array.isArray(input.includes) || input.includes.length === 0) {
    throw new WorldKnowledgeAuthoringLoadError(`input must be ${PACK_SCHEMA} or a non-empty ${DESCRIPTOR_SCHEMA}`);
  }
  rejectUnknownKeys(input, ['schema', 'includes'], 'descriptor');

  const root = await realpath(dirname(descriptorPath));
  const paths = [];
  const seen = new Set();
  for (const include of input.includes) {
    if (typeof include !== 'string' || include.trim() === '' || isAbsolute(include)) {
      throw new WorldKnowledgeAuthoringLoadError('descriptor includes must be non-empty relative paths');
    }
    const target = resolve(root, include);
    const relativePath = relative(root, target);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new WorldKnowledgeAuthoringLoadError(`include escapes pack root: ${include}`);
    const canonicalTarget = await realpath(target);
    const canonicalRelative = relative(root, canonicalTarget);
    if (canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative)) throw new WorldKnowledgeAuthoringLoadError(`include escapes pack root: ${include}`);
    const canonicalKey = canonicalTarget.toLocaleLowerCase();
    if (seen.has(canonicalKey)) throw new WorldKnowledgeAuthoringLoadError(`duplicate include: ${include}`);
    seen.add(canonicalKey);
    paths.push(canonicalTarget);
  }

  const assembled = Object.fromEntries(RECORD_ARRAYS.map((key) => [key, []]));
  assembled.schema = PACK_SCHEMA;
  assembled.predicate_registry = {};
  for (const path of paths.sort((a, b) => a.localeCompare(b))) mergeFragment(assembled, await readJson(path), path);
  if (!assembled.manifest) throw new WorldKnowledgeAuthoringLoadError('assembled shards require exactly one manifest');
  return assembled;
}

function mergeFragment(target, fragment, path) {
  if (![PACK_SCHEMA, FRAGMENT_SCHEMA].includes(fragment?.schema)) throw new WorldKnowledgeAuthoringLoadError(`${path}: invalid fragment schema`);
  rejectUnknownKeys(fragment, ['schema', 'manifest', 'predicate_registry', ...RECORD_ARRAYS], path);
  if (fragment.manifest) {
    if (target.manifest) throw new WorldKnowledgeAuthoringLoadError(`${path}: duplicate manifest across shards`);
    target.manifest = fragment.manifest;
  }
  if (fragment.predicate_registry != null) {
    if (!plainObject(fragment.predicate_registry)) throw new WorldKnowledgeAuthoringLoadError(`${path}: predicate_registry must be an object`);
    for (const [domain, predicates] of Object.entries(fragment.predicate_registry)) {
      if (!plainObject(predicates)) throw new WorldKnowledgeAuthoringLoadError(`${path}: predicate_registry.${domain} must be an object`);
      const domainTarget = target.predicate_registry[domain] ?? {};
      for (const [name, signature] of Object.entries(predicates)) {
        if (Object.hasOwn(domainTarget, name)) throw new WorldKnowledgeAuthoringLoadError(`${path}: duplicate predicate ${domain}.${name}`);
        domainTarget[name] = signature;
      }
      target.predicate_registry[domain] = domainTarget;
    }
  }
  for (const key of RECORD_ARRAYS) {
    if (fragment[key] == null) continue;
    if (!Array.isArray(fragment[key])) throw new WorldKnowledgeAuthoringLoadError(`${path}: ${key} must be an array`);
    target[key].push(...fragment[key]);
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new WorldKnowledgeAuthoringLoadError(`${path}: ${error.message}`);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  if (!plainObject(value)) throw new WorldKnowledgeAuthoringLoadError(`${label}: object is required`);
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new WorldKnowledgeAuthoringLoadError(`${label}: unknown field ${unknown}`);
}

function resolveRequired(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new WorldKnowledgeAuthoringLoadError('required input path is missing');
  return resolve(value);
}

function plainObject(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
