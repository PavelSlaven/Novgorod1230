import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCorpusChunks } from '../docs-tools/src/knowledge-chunks.js';

const root = resolve(process.cwd());
const sourceRoot = resolve(root, 'data/knowledge-source');
const manifestBytes = await readFile(resolve(sourceRoot, 'corpus-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const policy = JSON.parse(await readFile(resolve(sourceRoot, 'retrieval-policy.json'), 'utf8'));
const aliases = JSON.parse(await readFile(resolve(sourceRoot, 'source-aliases.json'), 'utf8'));
const errors = [];
const corpusFiles = {};

for (const record of manifest.documents ?? []) {
  const bytes = await readFile(resolve(sourceRoot, record.canonical_path));
  const digest = sha256(bytes);
  if (digest !== record.sha256 || bytes.length !== record.bytes) {
    errors.push(`${record.document_id}: manifest hash/size mismatch`);
  }
  corpusFiles[`DOCUMENTS/${record.file_name}`] = bytes.toString('utf8');
}

const temporalRecord = (manifest.documents ?? [])
  .find(({ document_id: documentId }) => documentId === 'temporal-world-and-interruptible-activities');
if (!temporalRecord) errors.push('temporal normative document is absent from corpus manifest');
if (temporalRecord?.status !== 'active') {
  errors.push(`accepted temporal normative status must be active; got ${temporalRecord?.status ?? '<missing>'}`);
}
if (aliases.aliases?.['temporal_world_and_interruptible_activities.md'] !== temporalRecord?.document_id) {
  errors.push('temporal normative source alias is absent or incorrect');
}

const policyRecord = (policy.documents ?? [])
  .find(({ document_id: documentId }) => documentId === temporalRecord?.document_id);
if (!policyRecord) errors.push('temporal normative retrieval metadata is absent');
if (policy.baseline_manifest_sha256 !== sha256(manifestBytes)) {
  errors.push('retrieval policy is not bound to the current corpus manifest');
}

const requiredFragments = new Map([
  ['DOCUMENTS/temporal_world_and_interruptible_activities.md', [
    'status: active',
    '`temporal-world-v1`',
    '`4.3.0-target.1`',
    '`temporal-world-v1.1`',
    '`4.4.0-target.1`',
    'production_runtime: materialization_v2_until_versioned_production_activation_cutover'
  ]],
  ['DOCUMENTS/llm_documentation_navigation.md', [
    'temporal_world_and_interruptible_activities.md',
    '`4.4.0-target.1`'
  ]],
  ['DOCUMENTS/time_system.txt', [
    '`temporal-world-v1.1`',
    'decimal strings'
  ]],
  ['DOCUMENTS/base_turn_orchestration.txt', [
    'Narrator',
    'persisted package',
    'hidden-leak validation'
  ]],
  ['DOCUMENTS/movement_locations_regions.txt', [
    'Traversal interval не округляет duration'
  ]],
  ['DOCUMENTS/interface_ux.md', [
    'player-safe factual package'
  ]]
]);

for (const [file, fragments] of requiredFragments) {
  const text = corpusFiles[file];
  if (text === undefined) {
    errors.push(`${file}: required corpus document is missing`);
    continue;
  }
  for (const fragment of fragments) {
    if (!text.includes(fragment)) errors.push(`${file}: required temporal statement is missing: ${fragment}`);
  }
}

let chunks = [];
try {
  chunks = buildCorpusChunks(corpusFiles);
} catch (error) {
  errors.push(error.message);
}
const indexedText = chunks.map(({ text }) => text).join('\n');
const forbiddenIndexedFragments = [
  'tokens truncated',
  '<!-- knowledge-retrieval-exclude:',
  'Если точность не важна, время можно округлять',
  '## 3. LLM Visibility Projector',
  '## 17. LLM Visibility Projector'
];
for (const fragment of forbiddenIndexedFragments) {
  if (indexedText.includes(fragment)) errors.push(`retrieval-visible legacy conflict: ${fragment}`);
}

if (errors.length > 0) {
  console.error(JSON.stringify({
    schema_version: 'rus.temporal_docs_conflict_check.v1',
    conflict_count: errors.length,
    conflicts: errors
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    schema_version: 'rus.temporal_docs_conflict_check.v1',
    conflict_count: 0,
    manifest_sha256: sha256(manifestBytes),
    document_count: manifest.documents.length,
    chunk_count: chunks.length,
    temporal_status: temporalRecord.status
  }, null, 2));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
