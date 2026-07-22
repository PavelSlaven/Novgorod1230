import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, cp, appendFile, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const sourceRoot = path.resolve('data/knowledge-source/corpus/DOCUMENTS');
const checker = path.resolve('tools/spatial-v3/check-p02.mjs');
const declarationSource = path.resolve('docs/migration/spatial-v3/evidence/p02-boundary-declaration.json');
const schemaSource = path.resolve('data/contracts/spatial-v3/p02-boundary-declaration.schema.json');
const files = [
  'code_driven_world_materialization_architecture.md',
  'spatial_v3_target_code_driven_world_materialization_architecture.md',
  'world_base_materialization_table_requirements.md',
  'spatial_v3_target_world_base_materialization_table_requirements.md',
  'read_only_database_and_graph_architecture.md',
  'spatial_v3_target_read_only_database_and_graph_architecture.md',
  'map_g0_g4_workflow.txt',
  'spatial_v3_target_map_g0_g4_workflow.txt'
];

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'p02-normative-'));
  await Promise.all(files.map((file) => cp(path.join(sourceRoot, file), path.join(root, file))));
  await cp(declarationSource, path.join(root, 'p02-boundary-declaration.json'));
  await cp(schemaSource, path.join(root, 'p02-boundary-declaration.schema.json'));
  return root;
}

function run(root) {
  return spawnSync(
    process.execPath,
    [
      checker,
      '--documents-root', root,
      '--declaration', path.join(root, 'p02-boundary-declaration.json'),
      '--schema', path.join(root, 'p02-boundary-declaration.schema.json')
    ],
    { encoding: 'utf8' }
  );
}

async function mutateDeclaration(root, mutate) {
  const declarationPath = path.join(root, 'p02-boundary-declaration.json');
  const declaration = JSON.parse(await readFile(declarationPath, 'utf8'));
  mutate(declaration);
  await writeFile(declarationPath, `${JSON.stringify(declaration, null, 2)}\n`);
}

async function repinTarget(root, targetFile) {
  const targetPath = path.join(root, targetFile);
  const digest = createHash('sha256').update(await readFile(targetPath)).digest('hex');
  await mutateDeclaration(root, (declaration) => {
    const pair = declaration.documents.find((document) => document.target.path === targetFile);
    assert.ok(pair, `declaration pair missing for ${targetFile}`);
    pair.target.sha256 = digest;
    pair.target.section_sha256 = digest;
  });
}

async function replaceRequiredText(file, expected, replacement) {
  const content = await readFile(file, 'utf8');
  assert.ok(content.includes(expected), `fixture text missing: ${expected}`);
  await writeFile(file, content.replace(expected, replacement));
}

test('P02 checker accepts the repository active/target document pairs', async () => {
  const root = await fixture();
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
});

test('P02 active owner documents route explicitly to target supplements and the approved P12 manifest', async () => {
  const pairs = [
    ['code_driven_world_materialization_architecture.md', 'spatial_v3_target_code_driven_world_materialization_architecture.md'],
    ['world_base_materialization_table_requirements.md', 'spatial_v3_target_world_base_materialization_table_requirements.md'],
    ['read_only_database_and_graph_architecture.md', 'spatial_v3_target_read_only_database_and_graph_architecture.md'],
    ['map_g0_g4_workflow.txt', 'spatial_v3_target_map_g0_g4_workflow.txt']
  ];
  for (const [activeName, targetName] of pairs) {
    const active = await readFile(path.join(sourceRoot, activeName), 'utf8');
    assert.match(active, /P02 target routing/);
    assert.ok(active.includes(targetName), `${activeName}: target supplement route missing`);
    assert.ok(active.includes('data/world-catalogs/novgorod/spatial-v3/manifest.json'), `${activeName}: P12 manifest route missing`);
    assert.match(active, /37 SHA-256-pinned datasets/);
    assert.match(active, /data_gaps:\s*\[\]/);
    assert.match(active, /v2 remains the sole production owner until P28/i);
    assert.match(active, /does not authorize production import, runtime use, write, or activation/i);
  }
});

const unsafeCases = [
  ['dual write', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'Dual write is ALLOWED before P28.', 'pre-P28 dual write'],
  ['mixed authority', 'spatial_v3_target_read_only_database_and_graph_architecture.md', 'Mixed execution and read authority is supported before P28.', 'mixed execution/read authority'],
  ['fallback', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'V3 may use FALLBACK to v2 before P28.', 'v3 fallback to v2'],
  ['partial activation', 'spatial_v3_target_world_base_materialization_table_requirements.md', 'Partial activation is permitted before P28.', 'partial or early activation'],
  ['party-only G5', 'spatial_v3_target_map_g0_g4_workflow.txt', 'Canonical G5 is forbidden; G5 is only in party runtime.', 'canonical G5 forbidden or party-only'],
  ['G7 introduced', 'spatial_v3_target_map_g0_g4_workflow.txt', 'The target introduces G7 as a required level.', 'G7/G8 introduced or required'],
  ['двойную запись', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'До P28 разрешена двойная запись.', 'pre-P28 dual write'],
  ['смешанное чтение', 'spatial_v3_target_read_only_database_and_graph_architecture.md', 'До P28 допускается смешанное чтение authority v2 и v3.', 'mixed execution/read authority'],
  ['откат v3 к v2', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'V3 разрешено использовать fallback к v2 до P28.', 'v3 fallback to v2'],
  ['частичную активацию', 'spatial_v3_target_world_base_materialization_table_requirements.md', 'До P28 возможна частичная активация.', 'partial or early activation'],
  ['запрет canonical G5', 'spatial_v3_target_map_g0_g4_workflow.txt', 'Канонический G5 запрещён; G5 хранится только в party.', 'canonical G5 forbidden or party-only'],
  ['введение G8', 'spatial_v3_target_map_g0_g4_workflow.txt', 'Target вводит обязательный G8.', 'G7/G8 introduced or required'],
  ['enabled dual write', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'Dual write is enabled before P28.', 'pre-P28 dual write'],
  ['writes both stores', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'Before P28, production writes each change to both v2 and v3 stores.', 'pre-P28 dual write'],
  ['falls back', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'The v3 path falls back to v2.', 'v3 fallback to v2'],
  ['canonical must not exist', 'spatial_v3_target_map_g0_g4_workflow.txt', 'Canonical G5 must not exist; every G5 belongs in party runtime.', 'canonical G5 forbidden or party-only'],
  ['split-line dual write', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'Dual write\nis allowed before P28.', 'pre-P28 dual write']
];

for (const [name, file, assertion, diagnostic] of unsafeCases) {
  test(`P02 checker rejects ${name}`, async () => {
    const root = await fixture();
    await appendFile(path.join(root, file), `\n${assertion}\n`);
    await repinTarget(root, file);
    const result = run(root);
    assert.notEqual(result.status, 0, `checker accepted unsafe assertion: ${assertion}`);
    assert.match(`${result.stderr}\n${result.stdout}`, new RegExp(`unsafe target assertion permits ${diagnostic.replaceAll('/', '\\/')}`));
  });
}

const routingOmissions = [
  ['target supplement', 'spatial_v3_target_code_driven_world_materialization_architecture.md', 'omitted_target_supplement.md', /active owner does not route to its target supplement/],
  ['canonical target standard', 'spatial_architecture_standard_g0_g6.md', 'omitted_target_standard.md', /canonical target standard route is missing/],
  ['P12 manifest', 'data/world-catalogs/novgorod/spatial-v3/manifest.json', 'omitted/p12-manifest.json', /approved P12 manifest route is missing/],
  ['P12 37+0 state', '37 SHA-256-pinned datasets and `data_gaps: []`', 'approved dataset and gap counts omitted', /approved P12 state is missing/],
  ['sole-v2 ownership', 'Materialization v2 remains the sole production owner until P28.', 'Production ownership statement omitted.', /pre-P28 production ownership is ambiguous/]
];

for (const [name, expected, replacement, diagnostic] of routingOmissions) {
  test(`P02 checker rejects active routing omission: ${name}`, async () => {
    const root = await fixture();
    const activePath = path.join(root, 'code_driven_world_materialization_architecture.md');
    await replaceRequiredText(activePath, expected, replacement);
    const result = run(root);
    assert.notEqual(result.status, 0, `checker accepted routing omission: ${name}`);
    assert.match(`${result.stderr}\n${result.stdout}`, diagnostic);
  });
}

test('P02 checker rejects mutation of a pinned active v2 normative', async () => {
  const root = await fixture();
  await appendFile(path.join(root, 'code_driven_world_materialization_architecture.md'), '\nmutation\n');
  const result = run(root);
  assert.notEqual(result.status, 0, 'checker accepted mutated active v2 bytes');
});

test('P02 checker rejects active mutation even when manifest is repinned to it', async () => {
  const root = await fixture();
  const activePath = path.join(root, 'code_driven_world_materialization_architecture.md');
  await appendFile(activePath, '\nmutation with matching mutable manifest pin\n');
  const digest = createHash('sha256').update(await readFile(activePath)).digest('hex');
  await mutateDeclaration(root, (declaration) => {
    declaration.documents[0].active.sha256 = digest;
    declaration.documents[0].active.section_sha256 = digest;
  });
  assert.notEqual(run(root).status, 0, 'checker trusted a mutually repinned active document and manifest');
});

test('P02 checker accepts explicit prohibition wording', async () => {
  const root = await fixture();
  const targetPath = path.join(root, 'spatial_v3_target_code_driven_world_materialization_architecture.md');
  await appendFile(
    targetPath,
    '\nDual write, mixed execution, v3 fallback to v2 and partial activation are prohibited before P28.\n\nG7 is not introduced and is not required.\n'
  );
  const digest = createHash('sha256').update(await readFile(targetPath)).digest('hex');
  await mutateDeclaration(root, (declaration) => {
    declaration.documents[0].target.sha256 = digest;
    declaration.documents[0].target.section_sha256 = digest;
  });
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
});

const declarationFieldMutations = {
  schema_version: (value) => `${value}.invalid`,
  phase: () => 'P28',
  active_owner: () => 'v3',
  target_status: () => 'active',
  production_read: () => 'mixed',
  production_write: () => 'v3_only',
  dual_write: () => true,
  mixed_authority: () => true,
  fallback: () => true,
  partial_activation: () => true,
  canonical_g5: () => 'party_runtime',
  generated_g5: () => 'world_base',
  max_level: () => 'G7'
};

for (const [field, mutate] of Object.entries(declarationFieldMutations)) {
  test(`P02 checker rejects declaration mutation: ${field}`, async () => {
    const root = await fixture();
    await mutateDeclaration(root, (declaration) => {
      declaration[field] = mutate(declaration[field]);
    });
    assert.notEqual(run(root).status, 0, `checker accepted mutated declaration field ${field}`);
  });
}

const structuralDeclarationMutations = [
  ['missing property', (declaration) => { delete declaration.production_read; }],
  ['additional property', (declaration) => { declaration.unexpected = true; }],
  ['duplicate pair', (declaration) => { declaration.documents[3].pair_id = 'architecture'; }],
  ['active path', (declaration) => { declaration.documents[0].active.path = 'wrong.md'; }],
  ['target path', (declaration) => { declaration.documents[0].target.path = 'wrong.md'; }],
  ['active digest', (declaration) => { declaration.documents[0].active.sha256 = '0'.repeat(64); }],
  ['target digest', (declaration) => { declaration.documents[0].target.sha256 = '0'.repeat(64); }],
  ['section id', (declaration) => { declaration.documents[0].target.section_id = 'other'; }],
  ['section digest', (declaration) => { declaration.documents[0].target.section_sha256 = '0'.repeat(64); }],
  ['pin extra property', (declaration) => { declaration.documents[0].target.extra = true; }]
];

for (const [name, mutate] of structuralDeclarationMutations) {
  test(`P02 checker rejects declaration structure: ${name}`, async () => {
    const root = await fixture();
    await mutateDeclaration(root, mutate);
    assert.notEqual(run(root).status, 0, `checker accepted declaration mutation: ${name}`);
  });
}

async function mutateSchema(root, mutate) {
  const schemaPath = path.join(root, 'p02-boundary-declaration.schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  mutate(schema);
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
}

const schemaMutations = [
  ['dual_write const true', (schema) => { schema.properties.dual_write.const = true; }],
  ['required empty', (schema) => { schema.required = []; }],
  ['evil pair id', (schema) => { schema.properties.documents.items.properties.pair_id.enum[0] = 'evil'; }],
  ['open document pin', (schema) => { schema.$defs.documentPin.additionalProperties = true; }],
  ['three document pairs', (schema) => { schema.properties.documents.minItems = 3; }],
  ['five document pairs', (schema) => { schema.properties.documents.maxItems = 5; }]
];

for (const [name, mutate] of schemaMutations) {
  test(`P02 checker rejects schema mutation: ${name}`, async () => {
    const root = await fixture();
    await mutateSchema(root, mutate);
    assert.notEqual(run(root).status, 0, `checker accepted untrusted schema mutation: ${name}`);
  });
}
