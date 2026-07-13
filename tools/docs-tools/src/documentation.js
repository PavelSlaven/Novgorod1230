import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { verifyKnowledgeSourceMigration } from './knowledge-source.js';

const GENERATED_NOTICE = '<!-- GENERATED FILE. Run `npm run docs:generate`; do not edit manually. -->';
const GENERATED_OUTPUT_PATHS = new Set([
  'MODULE_INDEX.md',
  'generated/module-index.json',
  'generated/schema-reference.json',
  'generated/schema-reference.md',
  'generated/generated-manifest.json'
]);
const ROOT_MARKDOWN_ALLOWLIST = new Set([
  'README.md', 'CHANGELOG.md', 'MIGRATION_PHASES_SHORT.md', 'MIGRATION_STATUS.md', 'MODULE_INDEX.md'
]);

export async function buildDocumentationOutputs(rootDir = '.') {
  const root = resolve(rootDir);
  const rootPackage = await readJson(join(root, 'package.json'));
  const modules = await discoverModuleGroup(root, 'packages');
  const applications = await discoverModuleGroup(root, 'apps');
  const tools = await discoverModuleGroup(root, 'tools', { requirePackage: false });
  const schemaReference = await discoverSchemas(root, rootPackage.version);
  const canonicalRegistry = await readJson(join(root, 'docs/migration/CANONICAL_PATHS.json'));

  const moduleIndex = {
    schema_version: 'rus.module_index.v1',
    release: rootPackage.version,
    modules,
    applications,
    tools
  };

  const outputs = new Map();
  outputs.set('MODULE_INDEX.md', renderModuleIndex(moduleIndex));
  outputs.set('generated/module-index.json', stableJson(moduleIndex));
  outputs.set('generated/schema-reference.json', stableJson(schemaReference));
  outputs.set('generated/schema-reference.md', renderSchemaReference(schemaReference));

  const sourceInputs = await collectGeneratorInputs(root, canonicalRegistry);
  const inputDigest = digestEntries(sourceInputs);
  const files = [...outputs.entries()].map(([path, content]) => ({
    path,
    sha256: sha256(content),
    bytes: Buffer.byteLength(content)
  })).sort(byPath);
  const manifest = {
    schema_version: 'rus.generated_manifest.v1',
    release: rootPackage.version,
    generator: 'tools/docs-tools/src/cli.js',
    command: 'npm run docs:generate',
    input_digest: inputDigest,
    files
  };
  outputs.set('generated/generated-manifest.json', stableJson(manifest));
  return outputs;
}

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
  const root = resolve(rootDir);
  const errors = [];
  errors.push(...await validateCanonicalRegistry(root));
  errors.push(...await validateModuleDocumentation(root));
  errors.push(...await validateDataPolicy(root));
  errors.push(...await validateGeneratedPlacement(root));
  errors.push(...await validateArtifactManifests(root));
  return Object.freeze({ ok: errors.length === 0, errors });
}

async function discoverModuleGroup(root, group, { requirePackage = true } = {}) {
  const base = join(root, group);
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = join(base, entry.name);
    const packagePath = join(dir, 'package.json');
    const packageJson = await readJson(packagePath).catch(() => null);
    if (!packageJson && requirePackage) continue;
    const modulePath = join(dir, 'MODULE.md');
    const moduleText = await readFile(modulePath, 'utf8').catch(() => '');
    if (!packageJson && !moduleText) continue;
    const purpose = firstParagraph(section(moduleText, ['Назначение', 'Purpose'])) || 'Not documented.';
    const owned = bullets(section(moduleText, ['Владеет', 'Responsibilities', 'Public API']));
    const exportsValue = packageJson?.exports ?? null;
    result.push({
      name: packageJson?.name ?? `${group}/${entry.name}`,
      path: `${group}/${entry.name}`,
      version: packageJson?.version ?? null,
      purpose,
      owns: owned,
      public_entry: publicEntry(exportsValue),
      dependencies: Object.keys(packageJson?.dependencies ?? {}).sort()
    });
  }
  return result;
}

async function discoverSchemas(root, release) {
  const contractSchemas = [];
  for (const file of await walk(join(root, 'packages'))) {
    if (!['.js', '.mjs'].includes(extname(file))) continue;
    const text = await readFile(file, 'utf8');
    const rel = relative(root, file).replaceAll('\\', '/');
    const regex = /export\s+const\s+([A-Z][A-Z0-9_]*SCHEMA[A-Z0-9_]*)\s*=\s*(['"`])([^'"`]+)\2/gu;
    for (const match of text.matchAll(regex)) {
      contractSchemas.push({ constant: match[1], schema: match[3], source: rel });
    }
  }
  contractSchemas.sort((a, b) => a.schema.localeCompare(b.schema) || a.constant.localeCompare(b.constant) || a.source.localeCompare(b.source));

  const externalSchemas = [];
  for (const file of await walk(join(root, 'schemas'))) {
    const info = await stat(file);
    const content = await readFile(file);
    externalSchemas.push({
      path: relative(root, file).replaceAll('\\', '/'),
      type: extname(file).slice(1) || 'file',
      bytes: info.size,
      sha256: sha256(content)
    });
  }
  externalSchemas.sort(byPath);
  return {
    schema_version: 'rus.generated_schema_reference.v1',
    release,
    contract_schemas: contractSchemas,
    external_schemas: externalSchemas
  };
}

async function collectGeneratorInputs(root, canonicalRegistry) {
  const paths = new Set(['package.json', 'docs/migration/CANONICAL_PATHS.json']);
  for (const group of ['packages', 'apps', 'tools']) {
    for (const file of await walk(join(root, group))) {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (basename(file) === 'package.json' || basename(file) === 'MODULE.md') paths.add(rel);
      if (group === 'packages' && ['.js', '.mjs'].includes(extname(file))) {
        const text = await readFile(file, 'utf8');
        if (/export\s+const\s+[A-Z][A-Z0-9_]*SCHEMA/u.test(text)) paths.add(rel);
      }
    }
  }
  for (const file of await walk(join(root, 'schemas'))) paths.add(relative(root, file).replaceAll('\\', '/'));
  for (const document of canonicalRegistry.documents ?? []) {
    if (!GENERATED_OUTPUT_PATHS.has(document.canonical_path)) paths.add(document.canonical_path);
  }
  const entries = [];
  for (const rel of [...paths].sort()) {
    const content = await readFile(join(root, rel)).catch(() => Buffer.from(''));
    entries.push({ path: rel, sha256: sha256(content) });
  }
  return entries;
}

async function validateCanonicalRegistry(root) {
  const errors = [];
  const path = join(root, 'docs/migration/CANONICAL_PATHS.json');
  const registry = await readJson(path).catch(() => null);
  if (!registry || registry.schema_version !== 'rus.canonical_document_paths.v1') {
    return ['docs/migration/CANONICAL_PATHS.json: invalid or missing registry'];
  }
  const canonical = new Set();
  const previous = new Set();
  for (const document of registry.documents ?? []) {
    const target = String(document.canonical_path ?? '');
    if (!target) { errors.push('canonical registry contains an empty canonical_path'); continue; }
    if (canonical.has(target)) errors.push(`${target}: duplicate canonical document path`);
    canonical.add(target);
    if (!await exists(join(root, target))) errors.push(`${target}: canonical document is missing`);
    for (const oldPath of document.previous_paths ?? []) {
      if (previous.has(oldPath)) errors.push(`${oldPath}: previous document path is mapped more than once`);
      previous.add(oldPath);
      if (oldPath !== target && await exists(join(root, oldPath))) errors.push(`${oldPath}: obsolete duplicate still exists beside ${target}`);
    }
  }
  const rootMarkdown = (await readdir(root)).filter((name) => name.endsWith('.md'));
  for (const name of rootMarkdown) if (!ROOT_MARKDOWN_ALLOWLIST.has(name)) errors.push(`${name}: non-canonical markdown file remains in repository root`);
  for (const required of ['docs/architecture/MODULE_RULES.md', 'docs/architecture/DEPENDENCY_RULES.md', 'docs/architecture/CONTRACT_POLICY.md', 'docs/pipelines/new-game.md', 'docs/pipelines/turn.md', 'MODULE_INDEX.md']) {
    if (!canonical.has(required)) errors.push(`${required}: required canonical document is absent from registry`);
  }
  return errors;
}

async function validateModuleDocumentation(root) {
  const errors = [];
  for (const group of ['packages', 'apps']) {
    const dirs = await readdir(join(root, group), { withFileTypes: true });
    for (const entry of dirs.filter((item) => item.isDirectory())) {
      const rel = `${group}/${entry.name}/MODULE.md`;
      const text = await readFile(join(root, rel), 'utf8').catch(() => '');
      if (!text.trim()) errors.push(`${rel}: MODULE.md is missing`);
      else if (!section(text, ['Назначение', 'Purpose']).trim()) errors.push(`${rel}: purpose section is missing`);
    }
  }
  return errors;
}

async function validateDataPolicy(root) {
  const errors = [];
  const approved = await readJson(join(root, 'data/seeds/APPROVED_SOURCES.json')).catch(() => null);
  const history = await readJson(join(root, 'data/seeds/IMPORT_HISTORY.json')).catch(() => null);
  if (approved?.schema_version !== 'rus.approved_seed_sources.v1' || !Array.isArray(approved.sources)) errors.push('data/seeds/APPROVED_SOURCES.json: invalid registry');
  if (history?.schema_version !== 'rus.seed_import_history.v1' || !Array.isArray(history.imports)) errors.push('data/seeds/IMPORT_HISTORY.json: invalid history');
  const sourceIds = new Set((approved?.sources ?? []).map((source) => source.id));
  for (const source of approved?.sources ?? []) {
    if (!source.id || !source.path) errors.push('approved seed source requires id and path');
    else if (!await exists(join(root, source.path))) errors.push(`${source.path}: approved seed source is missing`);
  }
  for (const item of history?.imports ?? []) if (!sourceIds.has(item.source_id)) errors.push(`${item.source_id}: import history references unknown approved source`);
  for (const file of await walk(join(root, 'data/seeds'))) {
    const name = basename(file).toLowerCase();
    if (/\.(xlsx?|ods)$/u.test(name)) errors.push(`${relative(root, file)}: intermediate spreadsheet is forbidden in seed source`);
    if (/(?:^|[-_.])(final|fixed|v2)(?:[-_.]|$)/u.test(name)) errors.push(`${relative(root, file)}: ambiguous intermediate filename is forbidden in approved seed source`);
  }
  const legacy = await readJson(join(root, 'data/LEGACY_RUNTIME_DATA.json')).catch(() => null);
  if (legacy?.schema_version !== 'rus.legacy_runtime_data_manifest.v1') errors.push('data/LEGACY_RUNTIME_DATA.json: invalid manifest');
  const declared = new Set(legacy?.paths ?? []);
  for (const folder of ['data/regional-summary-cache', 'data/world-sessions']) {
    for (const file of await walk(join(root, folder))) {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (!declared.has(rel)) errors.push(`${rel}: legacy runtime data is not declared in manifest`);
    }
  }
  for (const rel of declared) if (!await exists(join(root, rel))) errors.push(`${rel}: legacy runtime manifest path is missing`);
  return errors;
}

async function validateGeneratedPlacement(root) {
  const errors = [];
  for (const group of ['apps', 'packages', 'tools']) {
    for (const file of await walk(join(root, group))) {
      const rel = relative(root, file).replaceAll('\\', '/');
      if (rel.includes('/src/generated/') || rel.includes('/generated/src/')) errors.push(`${rel}: generated output is forbidden in source directories`);
    }
  }
  for (const file of await walk(join(root, 'generated'))) {
    if (basename(file) === '.gitkeep') continue;
    const rel = relative(root, file).replaceAll('\\', '/');
    const allowed = ['.json', '.md'].includes(extname(file)) || rel === 'generated/knowledge-source/graph/graph.html';
    if (!allowed) errors.push(`${rel}: unsupported generated file type`);
  }
  return errors;
}

async function validateArtifactManifests(root) {
  const errors = [];
  const entries = await readdir(join(root, 'artifacts'), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/u.test(entry.name)) {
      errors.push(`artifacts/${entry.name}: artifacts must be grouped under a dated directory`);
      continue;
    }
    const manifestPath = join(root, 'artifacts', entry.name, 'manifest.json');
    const manifest = await readJson(manifestPath).catch(() => null);
    if (manifest?.schema_version !== 'rus.artifact_manifest.v1' || manifest.date !== entry.name || !Array.isArray(manifest.files)) {
      errors.push(`artifacts/${entry.name}/manifest.json: invalid or missing artifact manifest`);
      continue;
    }
    const declared = new Set(manifest.files.map((item) => item.path));
    for (const file of await walk(join(root, 'artifacts', entry.name))) {
      const local = relative(join(root, 'artifacts', entry.name), file).replaceAll('\\', '/');
      if (local !== 'manifest.json' && !declared.has(local)) errors.push(`artifacts/${entry.name}/${local}: artifact is not declared`);
    }
  }
  return errors;
}

function renderModuleIndex(index) {
  const lines = [GENERATED_NOTICE, '# MODULE_INDEX', '', `Release: \`${index.release}\``, '', '## Production modules', '', '| Package | Path | Owns | Public entry | Direct dependencies |', '|---|---|---|---|---|'];
  for (const module of index.modules) {
    lines.push(`| \`${escapeCell(module.name)}\` | \`${module.path}\` | ${escapeCell(ownerSummary(module))} | \`${escapeCell(module.public_entry)}\` | ${module.dependencies.length ? module.dependencies.map((item) => `\`${escapeCell(item)}\``).join(', ') : '—'} |`);
  }
  lines.push('', '## Applications', '', '| Application | Path | Purpose |', '|---|---|---|');
  for (const app of index.applications) lines.push(`| \`${escapeCell(app.name)}\` | \`${app.path}\` | ${escapeCell(app.purpose)} |`);
  lines.push('', '## Tools', '', '| Tool | Path | Purpose |', '|---|---|---|');
  for (const tool of index.tools) lines.push(`| \`${escapeCell(tool.name)}\` | \`${tool.path}\` | ${escapeCell(tool.purpose)} |`);
  lines.push('', 'Canonical ownership details are defined by each `MODULE.md`; domain ownership is summarized in `docs/domain/OWNERSHIP_MAP.md`.', '');
  return lines.join('\n');
}

function renderSchemaReference(reference) {
  const lines = [GENERATED_NOTICE, '# Schema reference', '', `Release: \`${reference.release}\``, '', '## Contract schema names', '', '| Schema | Constant | Source |', '|---|---|---|'];
  for (const item of reference.contract_schemas) lines.push(`| \`${escapeCell(item.schema)}\` | \`${item.constant}\` | \`${item.source}\` |`);
  lines.push('', '## External schemas', '', '| Path | Type | Bytes | SHA-256 |', '|---|---:|---:|---|');
  for (const item of reference.external_schemas) lines.push(`| \`${item.path}\` | ${item.type} | ${item.bytes} | \`${item.sha256}\` |`);
  lines.push('');
  return lines.join('\n');
}

function section(markdown, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lines = String(markdown ?? '').split(/\r?\n/u);
  let active = false;
  const result = [];
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/u.exec(line);
    if (match) {
      if (active) break;
      active = wanted.has(match[1].trim().toLowerCase());
      continue;
    }
    if (active) result.push(line);
  }
  return result.join('\n').trim();
}

function bullets(text) {
  return String(text ?? '').split(/\r?\n/u).map((line) => /^[-*]\s+(.+)$/u.exec(line)?.[1]?.trim().replace(/[;.]$/u, '')).filter(Boolean);
}

function firstParagraph(text) {
  return String(text ?? '').split(/\n\s*\n/u).map((item) => item.replace(/\s+/gu, ' ').trim()).find(Boolean) ?? '';
}

function ownerSummary(module) {
  if (module.owns.length) return module.owns.slice(0, 3).join('; ');
  return module.purpose;
}

function publicEntry(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return typeof value['.'] === 'string' ? value['.'] : 'package exports';
  return '—';
}

function stableJson(value) {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function digestEntries(entries) {
  return sha256(entries.slice().sort(byPath).map((entry) => `${entry.path}\0${entry.sha256}`).join('\n'));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function byPath(a, b) {
  return a.path.localeCompare(b.path);
}

function escapeCell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
