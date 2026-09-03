#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildG1WorkQueue, parseTsv, projectLegacyG1Rows, validateG1CellPackage, validateG1Mask, validateMapRevision } from './index.js';
import { loadWorldKnowledgeAuthoringInput } from './world-knowledge-authoring-loader.js';
import { compileWorldKnowledgePack } from './world-knowledge-pack.js';
import { benchmarkWorldKnowledgeVectors,
  buildWorldKnowledgeVectorIndex } from './world-knowledge-embeddings.js';

const [command, ...args] = process.argv.slice(2);
const options = parseArgs(args);
try {
  if (command === 'validate-revision') {
    const revision = await readJsonRequired(options.revision);
    await emit(options.out, validateMapRevision(revision));
  } else if (command === 'prepare-legacy-g1') {
    const revision = await readJsonRequired(options.revision);
    const rows = parseTsv(await readFileRequired(options.tsv));
    const cells = projectLegacyG1Rows(rows);
    const validation = validateG1Mask(cells, revision);
    const queue = buildG1WorkQueue(cells, revision, { allowIncomplete: true });
    await emit(options.maskOut, { schema_version: 'rus.g1_mask.v1', map_revision_id: revision.map_revision_id, cells });
    await emit(options.reportOut, validation);
    await emit(options.queueOut, queue);
  } else if (command === 'validate-cell-package') {
    const value = await readJsonRequired(options.package);
    await emit(options.out, validateG1CellPackage(value));
  } else if (command === 'compile-world-knowledge') {
    const value = await loadWorldKnowledgeAuthoringInput(options.pack);
    await emit(options.out, compileWorldKnowledgePack(value));
  } else if (command === 'build-world-knowledge-vectors') {
    const result = await buildWorldKnowledgeVectorIndex({
      bundlePath: options.bundle, profilePath: options.profile,
      metadataOut: options.metadataOut, vectorsOut: options.vectorsOut,
      python: options.python ?? 'python'
    });
    process.stdout.write(`${JSON.stringify(result.metrics)}\n`);
  } else if (command === 'benchmark-world-knowledge-vectors') {
    const result = await benchmarkWorldKnowledgeVectors({
      bundlePath: options.bundle, profilePath: options.profile,
      metadataPath: options.metadata, vectorsPath: options.vectors,
      benchmarkPath: options.benchmark, reportOut: options.reportOut,
      python: options.python ?? 'python'
    });
    process.stdout.write(`${JSON.stringify(result.decision)}\n`);
  } else usage();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key?.startsWith('--') || args[index + 1] == null) usage();
    result[toCamel(key.slice(2))] = args[index + 1];
  }
  return result;
}
async function readJsonRequired(path) { return JSON.parse(await readFileRequired(path)); }
async function readFileRequired(path) { if (!path) throw new TypeError('required path argument is missing'); return readFile(resolve(path), 'utf8'); }
async function emit(path, value) { const text = `${JSON.stringify(value, null, 2)}\n`; if (!path) process.stdout.write(text); else { const target = resolve(path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, text); } }
function toCamel(value) { return value.replace(/-([a-z])/gu, (_, char) => char.toUpperCase()); }
function usage() { throw new TypeError('usage: validate-revision --revision FILE [--out FILE] | prepare-legacy-g1 --revision FILE --tsv FILE --mask-out FILE --report-out FILE --queue-out FILE | validate-cell-package --package FILE [--out FILE] | compile-world-knowledge --pack FILE [--out FILE] | build-world-knowledge-vectors --bundle FILE --profile FILE --metadata-out FILE --vectors-out FILE | benchmark-world-knowledge-vectors --bundle FILE --profile FILE --metadata FILE --vectors FILE --benchmark FILE --report-out FILE'); }
