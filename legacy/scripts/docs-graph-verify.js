import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const corpusDir = resolve(root, 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
const graphPath = resolve(root, 'DOCUMENTS', 'documents-kg', 'graphify-out', 'graph.json');
const errors = [];

function fail(message) {
  errors.push(message);
}

function resolveCorpusFile(sourceFile) {
  const base = basename(String(sourceFile ?? ''));
  if (!base) return null;
  const direct = resolve(corpusDir, base);
  if (existsSync(direct)) return direct;
  const nested = resolve(root, String(sourceFile).replace(/^DOCUMENTS\//u, 'DOCUMENTS/documents-kg/corpus/'));
  return existsSync(nested) ? nested : null;
}

function lineCount(filePath) {
  return readFileSync(filePath, 'utf8').split(/\r?\n/u).length;
}

if (!existsSync(corpusDir)) {
  fail(`corpus dir missing: ${corpusDir}`);
}
if (!existsSync(graphPath)) {
  fail(`graph missing: ${graphPath}`);
}

if (errors.length) {
  console.error('docs graph verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

const corpusFiles = readdirSync(corpusDir).filter((name) => !name.startsWith('.'));
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
const referenced = new Set();

for (const node of nodes) {
  const location = node?.source_location ?? node?.sourceLocation ?? null;
  if (!location || typeof location !== 'object') continue;
  const filePath = resolveCorpusFile(location.file ?? node.source_file);
  if (!filePath) {
    fail(`graph node ${node.id ?? node.label ?? '?'} references missing file: ${location.file ?? node.source_file}`);
    continue;
  }
  referenced.add(basename(filePath));
  const lines = lineCount(filePath);
  const start = Number(location.line_start ?? location.lineStart);
  const end = Number(location.line_end ?? location.lineEnd);
  if (Number.isFinite(start) && start < 1) {
    fail(`invalid line_start for ${basename(filePath)}: ${start}`);
  }
  if (Number.isFinite(end) && end > lines) {
    fail(`line_end ${end} exceeds ${basename(filePath)} length ${lines}`);
  }
  if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
    fail(`line range inverted for ${basename(filePath)}: ${start}-${end}`);
  }
}

for (const file of corpusFiles) {
  if (!referenced.has(file)) {
    fail(`corpus file missing from graph sources: ${file}`);
  }
}

if (errors.length) {
  console.error('docs graph verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`docs graph verify ok (${corpusFiles.length} corpus files, ${nodes.length} graph nodes)`);
