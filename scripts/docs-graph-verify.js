import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const corpusDir = resolve(root, 'DOCUMENTS', 'documents-kg', 'corpus', 'DOCUMENTS');
const graphPath = resolve(root, 'DOCUMENTS', 'documents-kg', 'graphify-out', 'graph.json');
const errors = [];

function fail(message) {
  errors.push(message);
}

function resolveCorpusFile(sourceFile) {
  const normalized = String(sourceFile ?? '').replace(/\\/gu, '/');
  if (!normalized) return null;
  const directName = normalized.replace(/^DOCUMENTS\//u, '');
  const direct = resolve(corpusDir, directName);
  if (existsSync(direct)) return direct;
  const base = basename(normalized);
  if (base) {
    const topLevel = resolve(corpusDir, base);
    if (existsSync(topLevel)) return topLevel;
  }
  const nested = resolve(root, normalized.replace(/^DOCUMENTS\//u, 'DOCUMENTS/documents-kg/corpus/'));
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

function listCorpusFiles(dir) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(relative(dir, path).split(sep).join('/'));
      }
    }
  };
  visit(dir);
  return files.sort((left, right) => left.localeCompare(right));
}

const corpusFiles = listCorpusFiles(corpusDir);
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
  referenced.add(relative(corpusDir, filePath).split(sep).join('/'));
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

if (errors.length) {
  console.error('docs graph verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`docs graph verify ok (${corpusFiles.length} corpus files, ${nodes.length} graph nodes)`);
