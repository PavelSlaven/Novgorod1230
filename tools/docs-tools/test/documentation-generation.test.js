import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocumentationOutputs,
  checkDocumentationOutputs,
  validateDocumentationTree
} from '../src/index.js';
import { buildWorldBaseSchemaReference } from '../../../scripts/generate-world-base-schema-reference.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('documentation outputs are deterministic', async () => {
  const first = await buildDocumentationOutputs(root);
  const second = await buildDocumentationOutputs(root);
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

const AGENT_INSTRUCTION_FILES = ['AGENTS.md', '.github/README.md', '.github/copilot-instructions.md'];
const SKILL_ROOTS = ['.agents/skills', '.claude/skills'];
const GOVERNANCE_FILES = ['README.md', 'PRODUCT_CONSTITUTION.md', 'ARCHITECTURE_INVARIANTS.md', 'WORKFLOW_RULES.md', 'AUDIT_RULES.md', 'GIT_SAFETY_RULES.md']
  .map((name) => `docs/governance/${name}`);
const ROUTER_MAX_BYTES = 16384;
const ROUTER_MAX_LINES = 200;

async function markdownFilesUnder(relativeDir) {
  const entries = await readdir(join(root, relativeDir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1).replaceAll('\\', '/'))
    .sort();
}

function withoutCode(text) {
  return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gmu, '').replace(/`[^`\n]*`/gu, '');
}

function markdownLinkTargets(text) {
  return [...withoutCode(text).matchAll(/\[[^\]]*\]\(<?([^)>]+)>?\)/gu)].map((match) => match[1].trim());
}

async function assertLinksResolve(relativePath, { requireLinks }) {
  const absolutePath = join(root, relativePath);
  const targets = markdownLinkTargets(await readFile(absolutePath, 'utf8'));
  if (requireLinks) assert.ok(targets.length > 0, `${relativePath} must contain repository links`);
  for (const target of targets) {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
    const pathPart = target.split('#')[0];
    assert.notEqual(pathPart, '', `${relativePath}: anchor-only link ${target}`);
    const resolvedTarget = resolve(dirname(absolutePath), decodeURIComponent(pathPart));
    const info = await stat(resolvedTarget).catch(() => null);
    assert.equal(info?.isFile(), true, `${relativePath}: link must point to an existing file: ${target}`);
  }
}

test('agent instruction links resolve to repository files', async () => {
  for (const relativePath of AGENT_INSTRUCTION_FILES) {
    await assertLinksResolve(relativePath, { requireLinks: true });
  }
  const navigationDocs = [
    'docs/README.md',
    ...GOVERNANCE_FILES,
    ...await markdownFilesUnder('docs/context'),
    ...await markdownFilesUnder('docs/process'),
    'docs/work/CURRENT_SPRINT.md',
    'docs/work/LEGACY_WARNINGS.md',
    ...(await Promise.all(SKILL_ROOTS.map(markdownFilesUnder))).flat()
  ];
  for (const relativePath of navigationDocs) {
    await assertLinksResolve(relativePath, { requireLinks: false });
  }
  await assert.rejects(stat(join(root, '.github/AGENTS.md')));
  await assert.rejects(stat(join(root, '.codex/skills/README.md')));
  await assert.rejects(stat(join(root, '.codex/skills/graphify/SKILL.md')));
  await assert.rejects(stat(join(root, '.agents/skills/graphify/SKILL.md')));

  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /\.github\/AGENTS\.md/u);
  assert.doesNotMatch(readme, /Правила автоматического применения/u);
});

function parseSkillFrontmatter(text, relativePath) {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  assert.ok(match, `${relativePath}: missing frontmatter`);
  const fields = {};
  let section = null;
  for (const line of match[1].split('\n')) {
    const nested = /^ {2}([a-z_]+):\s*(.*)$/u.exec(line);
    const top = /^([a-z_]+):\s*(.*)$/u.exec(line);
    const unquote = (value) => value.replace(/^"(.*)"$/u, '$1');
    if (nested && section) fields[`${section}.${nested[1]}`] = unquote(nested[2]);
    else if (top) {
      section = top[2] === '' ? top[1] : null;
      if (top[2] !== '') fields[top[1]] = unquote(top[2]);
    }
  }
  return fields;
}

test('agent skill stubs are identical across tools and point to existing canon', async () => {
  const [agentsSkills, claudeSkills] = await Promise.all(SKILL_ROOTS.map(async (skillRoot) =>
    (await readdir(join(root, skillRoot), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()));
  assert.deepEqual(claudeSkills, agentsSkills, 'skill sets differ between .agents/skills and .claude/skills');
  assert.ok(agentsSkills.length > 0);
  for (const name of agentsSkills) {
    assert.match(name, /^[a-z0-9-]{1,64}$/u);
    assert.doesNotMatch(name, /graphify/u);
    const [agentsText, claudeText] = await Promise.all(SKILL_ROOTS.map((skillRoot) => readFile(join(root, skillRoot, name, 'SKILL.md'), 'utf8')));
    assert.equal(claudeText, agentsText, `${name}: SKILL.md differs between tools`);
    const fields = parseSkillFrontmatter(agentsText, name);
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length <= 1024, `${name}: description must be 1..1024 chars`);
    assert.ok(fields['metadata.canonical'], `${name}: metadata.canonical is required`);
    assert.equal((await stat(join(root, fields['metadata.canonical']))).isFile(), true, `${name}: missing canonical ${fields['metadata.canonical']}`);
  }
});

test('AGENTS.md router fits the agent context budget and links every governance file', async () => {
  const router = await readFile(join(root, 'AGENTS.md'));
  assert.ok(router.length <= ROUTER_MAX_BYTES, `AGENTS.md is ${router.length} bytes; limit ${ROUTER_MAX_BYTES}`);
  const text = router.toString('utf8');
  assert.ok(text.split('\n').length <= ROUTER_MAX_LINES + 1, 'AGENTS.md exceeds the router line limit');
  const linked = new Set(markdownLinkTargets(text).map((target) => target.split('#')[0]));
  for (const file of GOVERNANCE_FILES) assert.ok(linked.has(file), `AGENTS.md must link ${file}`);
  for (const relativePath of ['AGENTS.md', ...GOVERNANCE_FILES]) {
    const imports = withoutCode(await readFile(join(root, relativePath), 'utf8')).match(/(?:^|\s)@[\w.~/-]+/gmu) ?? [];
    assert.deepEqual(imports, [], `${relativePath}: @path outside code spans would be imported by Claude Code`);
  }
});

test('canonical documentation preserves active guidance without obsolete workflow gates', async () => {
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');
  const corpus = (await Promise.all(['AGENTS.md', ...GOVERNANCE_FILES].map((path) => readFile(join(root, path), 'utf8')))).join('\n');

  assert.doesNotMatch(corpus, /Перед любой задачей полностью прочитай/u);
  assert.doesNotMatch(corpus, /Перед grep, file search, GitHub code search/u);
  assert.doesNotMatch(corpus, /PR №13/u);
  assert.match(agents, /Канонический индекс контрактов/u);
  assert.match(agents, /`codebase-memory-mcp` в режиме Verify \(Tier 2\)/u);
  assert.match(agents, /`detect_changes` для фактического diff/u);
  assert.match(agents, /`check_index_coverage` для всех путей/u);
  assert.match(agents, /`@rus\/knowledge-source` остаётся отдельным нормативным каналом/u);
  assert.match(agents, /очевидной локальной задачи[\s\S]*прямой `rg`/u);
  assert.doesNotMatch(corpus, /Graphify|repo-intel/u);

  const developmentRules = await readFile(join(root, 'data/knowledge-source/corpus/DOCUMENTS/development_rules.txt'), 'utf8');
  assert.match(developmentRules, /Эти правила реализуют active-архитектуру materialization v2 и проверяются единым release gate/u);
  assert.doesNotMatch(developmentRules, /До повышения `code_driven_world_materialization_architecture\.md` в active/u);

  const navigation = await readFile(join(root, 'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md'), 'utf8');
  assert.match(navigation, /Status:\*\* superseded navigation filename retained for compatibility/u);
  assert.match(navigation, /canonical documentation map is now \[`CONTRACT_INDEX\.md`\]\(CONTRACT_INDEX\.md\)/iu);
  assert.match(navigation, /1\. root \[`AGENTS\.md`\][\s\S]*2\. \[`CONTRACT_INDEX\.md`\][\s\S]*active release\/profile\/bindings/u);
  assert.match(navigation, /Proposed, migration, historical and reference documents are not current production contracts/u);
});

test('committed documentation and generated data are reproducible', async () => {
  const result = await checkDocumentationOutputs(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.checked_files, [
    'MODULE_INDEX.md',
    'generated/generated-manifest.json',
    'generated/module-index.json',
    'generated/schema-reference.json',
    'generated/schema-reference.md'
  ]);
});

test('MODULE_INDEX lists every production package exactly once', async () => {
  const index = JSON.parse(await readFile(join(root, 'generated/module-index.json'), 'utf8'));
  const packageDirs = (await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort();
  assert.deepEqual(index.modules.map((item) => item.path).sort(), packageDirs);
  assert.equal(new Set(index.modules.map((item) => item.name)).size, index.modules.length);
  assert.ok(index.modules.every((item) => item.owns.length > 0));
});

test('schema reference binds contract names and external DDL', async () => {
  const reference = JSON.parse(await readFile(join(root, 'generated/schema-reference.json'), 'utf8'));
  assert.equal(reference.schema_version, 'rus.generated_schema_reference.v1');
  assert.ok(reference.contract_schemas.some((item) => item.schema === 'weather_state'));
  const ddl = reference.external_schemas.find((item) => item.path === 'schemas/party-db/001_party_runtime.sql');
  assert.ok(ddl);
  assert.match(ddl.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(ddl.bytes > 0);
});

test('world-base schema reference expands every column in multi-column ALTER TABLE', async () => {
  const { schema } = await buildWorldBaseSchemaReference({ root });
  const byTable = new Map(schema.tables.map((table) => [table.name, table]));
  const expectedAddedColumns = {
    item_templates: ['category_id', 'world_revision_id', 'source_id'],
    g5_anchor_templates: ['valid_from', 'valid_to', 'confidence'],
    materialization_slot_rules: ['valid_from', 'valid_to', 'applicability', 'confidence']
  };
  for (const [tableName, columnNames] of Object.entries(expectedAddedColumns)) {
    const actual = new Map(byTable.get(tableName).columns.map((column) => [column.name, column.type]));
    for (const columnName of columnNames) {
      assert.equal(actual.has(columnName), true, `${tableName}.${columnName}`);
      assert.doesNotMatch(actual.get(columnName), /\bADD\s+COLUMN\b/iu);
    }
  }
});

test('canonical document registry has unique existing targets and no obsolete root copies', async () => {
  const registry = JSON.parse(await readFile(join(root, 'docs/migration/CANONICAL_PATHS.json'), 'utf8'));
  const targets = registry.documents.map((item) => item.canonical_path);
  assert.equal(new Set(targets).size, targets.length);
  for (const item of registry.documents) {
    assert.equal((await stat(join(root, item.canonical_path))).isFile(), true);
    for (const previous of item.previous_paths) {
      if (previous === item.canonical_path) continue;
      await assert.rejects(stat(join(root, previous)));
    }
  }
});
