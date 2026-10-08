import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import * as legacy from '../../../tools/world-catalog-workflow/src/runtime-catalog-loaders.js';
import * as legacyDigest from '../../../tools/world-catalog-workflow/src/digest.js';
import { resolveG4MaterializationBinding as legacyBinding } from
  '../../../tools/world-catalog-workflow/src/g4-item-container-coverage.js';
import { loadCommonCatalogLookupRecords } from
  '../../../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const names = ['buildApprovedActorProfileSnapshot',
  'buildApprovedItemCatalogSnapshot', 'buildAllowedG5TemplateSet'];
const golden = {
  actor: 'a3be7277137ffd1e2f4636fc2690977976d6061b069c735cbf4d65bb095ea5b5',
  item: '54432ad84a1d3230a0a7158732379cfc99cd30ba33614714e223c156e59ac2eb',
  g5: 'ab382965046c7c8e69cbc46a48a106e73f6745b1170e5473096f9f1f6d3f5d01'
};

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

async function inputs() {
  const actorRoot = 'data/world-catalogs/novgorod/live-world-runtime-v17/';
  const actorManifest = await json(`${actorRoot}appearance-transfer-v3-import-manifest.json`);
  const actorRecords = {};
  for (const dataset of actorManifest.datasets) {
    const bytes = await readFile(resolve(root, actorRoot, dataset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), dataset.sha256,
      `appearance input pin: ${dataset.file}`);
    actorRecords[dataset.table] = JSON.parse(bytes);
  }
  const actorRevision = actorRecords.world_revisions[0];
  const actor_args = { records_by_table: actorRecords,
    world_revision_id: actorRevision.id, catalog_digest: actorRevision.catalog_digest,
    region_id: 'region_novgorod_land' };

  // Historical PR17 fixture, NOT a capture of active v17 item/G5 membership.
  // Match the existing public loader test's promotion and graph reconstruction.
  const candidateRoot = 'data/knowledge-source/imports/item-container-120-v5/candidate/';
  const manifest = await json(`${candidateRoot}manifest.json`);
  const records = {};
  for (const dataset of manifest.datasets) {
    const rows = await json(`${candidateRoot}${dataset.path}`);
    records[dataset.table] = rows.map((row) => row.status === 'draft'
      ? { ...row, status: 'approved' } : row);
  }
  Object.assign(records, await loadCommonCatalogLookupRecords({ rootDir: root }));
  const mappings = (await json(
    'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json'
  )).profile_mappings;
  records.graph_nodes = mappings.map((mapping) => ({
    id: mapping.graph_node_id, title: mapping.graph_node_title,
    node_type: mapping.node_type, scale_level: 'G4',
    place_template_id: mapping.place_template_id,
    building_template_id: mapping.building_template_id ?? null,
    region_id: 'region_novgorod_land', status: 'approved'
  }));
  const revision = records.world_revisions.find((row) =>
    row.id === 'world_revision_novgorod_1230_item_catalogue_001');
  assert.ok(revision);
  const item_args = { records_by_table: records,
    world_revision_id: revision.id, catalog_digest: revision.catalog_digest };
  const mapping = mappings.find((row) => row.context_domain === 'craft_work');
  assert.ok(mapping);
  const g5_args = { records_by_table: records,
    graph_node_id: mapping.graph_node_id, selected_g4_type_id: mapping.node_type,
    world_revision_id: revision.id, source_catalog_digest: revision.catalog_digest };
  return { actor_args, item_args, g5_args, source: {
    actor: 'v17 appearance-transfer-v3 exact file datasets (no live DB claim)',
    item: 'historical PR17/v5 test reconstruction (not active v17)',
    g5: 'historical PR17/v5 test reconstruction (not active v17)'
  } };
}

function outputs(api, input) {
  return {
    actor: api.buildApprovedActorProfileSnapshot(input.actor_args),
    item: api.buildApprovedItemCatalogSnapshot(input.item_args),
    g5: api.buildAllowedG5TemplateSet(input.g5_args)
  };
}

function deeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) deeplyFrozen(child);
}

const args = process.argv.slice(2);
if (args.includes('--capture')) {
  // Before: --capture legacy; after: --capture runtime. Use --input with exact
  // reader-captured {actor_args,item_args,g5_args,source} for mandatory live-v17 parity.
  // No input means ONLY the explicitly labelled offline regression fixtures above.
  const mode = args[args.indexOf('--capture') + 1];
  assert.ok(['legacy', 'runtime'].includes(mode));
  assert.ok(args.includes('--output'));
  const input = args.includes('--input')
    ? JSON.parse(await readFile(args[args.indexOf('--input') + 1], 'utf8'))
    : await inputs();
  const api = mode === 'legacy' ? legacy
    : await import('@rus/runtime-catalog/approved-record-snapshots');
  const bytes = legacyDigest.stableStringify({ source: input.source,
    outputs: outputs(api, input) }) + '\n';
  await writeFile(args[args.indexOf('--output') + 1], bytes, { flag: 'wx' });
  console.log(JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: Buffer.byteLength(bytes), source: input.source }));
} else {
  test('offline historical/v17-file baselines freeze the original projection bytes', async () => {
    const input = await inputs();
    const before = structuredClone(input);
    const value = outputs(legacy, input);
    for (const name of ['actor', 'item', 'g5']) {
      assert.equal(legacyDigest.digestValue(value[name]), golden[name], name);
      deeplyFrozen(value[name]);
    }
    assert.equal(value.actor.appearance_contract_version, 'actor_base_appearance_v1');
    assert.equal(value.item.item_profile_candidates.length, 102);
    assert.equal(value.item.container_profile_candidates.length, 18);
    assert.deepEqual(input, before);
  });

  test('runtime projections preserve baseline bytes, pins, deep-freeze and inputs', async () => {
    const api = await import('@rus/runtime-catalog/approved-record-snapshots');
    const input = await inputs();
    const before = structuredClone(input);
    const value = outputs(api, input);
    for (const name of ['actor', 'item', 'g5']) {
      assert.equal(legacyDigest.digestValue(value[name]), golden[name], name);
      deeplyFrozen(value[name]);
    }
    assert.equal(value.actor.source_catalog_digest, input.actor_args.catalog_digest);
    assert.equal(value.item.source_catalog_digest, input.item_args.catalog_digest);
    assert.equal(value.g5.source_catalog_digest, input.g5_args.source_catalog_digest);
    assert.deepEqual(input, before);
  });

  test('the tools projections, G4 resolver and digest are facades of one runtime implementation', async () => {
    const api = await import('@rus/runtime-catalog/approved-record-snapshots');
    const binding = await import('@rus/runtime-catalog/g4-materialization-binding');
    const digest = await import('@rus/runtime-catalog/snapshot-digest');
    for (const name of names) assert.equal(legacy[name], api[name], name);
    assert.equal(legacyBinding, binding.resolveG4MaterializationBinding);
    assert.equal(legacyDigest.stableStringify, digest.stableStringify);
    assert.equal(legacyDigest.digestValue, digest.digestValue);
  });

  test('moved digest retains decomposed Unicode and the former JSON conversion rules', async () => {
    const digest = await import('@rus/runtime-catalog/snapshot-digest');
    const value = { z: 'e\u0301', a: { x: undefined, n: NaN }, arr: [undefined, -0] };
    const bytes = '{"a":{"n":null},"arr":[null,0],"z":"e\u0301"}';
    assert.equal(digest.stableStringify(value), bytes);
    assert.notEqual(digest.stableStringify(value), bytes.normalize('NFC'));
    assert.equal(digest.digestValue(value), createHash('sha256').update(bytes).digest('hex'));
  });

  test('moved G4 resolver retains specificity, numeric priority and ambiguous/missing outputs', async () => {
    const { resolveG4MaterializationBinding: resolveBinding } =
      await import('@rus/runtime-catalog/g4-materialization-binding');
    const node = { id: 'g4-one', node_type: 'location', place_template_id: 'place-one' };
    const exact = { id: 'exact', graph_node_id: node.id, priority: 0, status: 'approved' };
    const generic = { id: 'generic', node_type: 'location', priority: 999, status: 'approved' };
    const input = { graph_node: node, bindings: [generic, exact] };
    const before = structuredClone(input);
    const result = resolveBinding(input);
    assert.deepEqual(result, { status: 'resolved', binding: exact,
      match_kind: 'graph_node_id', priority: 0, binding_ids: ['exact'] });
    assert.notEqual(result.binding, exact);
    deeplyFrozen(result);
    assert.deepEqual(input, before);
    const numeric = { id: 'numeric', graph_node_id: node.id, priority: '2', status: 'approved' };
    assert.equal(resolveBinding({ graph_node: node, bindings: [exact, numeric] }).binding.id, 'numeric');
    assert.deepEqual(resolveBinding({ graph_node: node, bindings: [
      { ...exact, id: 'b' }, { ...exact, id: 'a' }
    ] }), { status: 'ambiguous', binding: null, match_kind: 'graph_node_id',
      priority: 0, binding_ids: ['a', 'b'] });
    assert.deepEqual(resolveBinding({ graph_node: node, bindings: [{ ...exact, status: 'draft' }] }),
      { status: 'missing', binding: null, binding_ids: [] });
    assert.deepEqual(resolveBinding({}),
      { status: 'missing_graph_node', binding: null, binding_ids: [] });
  });

  test('projection failures retain plain Error names, codes and messages', async () => {
    const api = await import('@rus/runtime-catalog/approved-record-snapshots');
    const input = await inputs();
    for (const [name, original, digestField] of [
      [names[0], input.actor_args, 'catalog_digest'],
      [names[1], input.item_args, 'catalog_digest'],
      [names[2], input.g5_args, 'source_catalog_digest']
    ]) {
      assert.throws(() => api[name]({ ...original, [digestField]: 'not-a-digest' }), {
        name: 'Error', code: 'RUNTIME_SOURCE_CATALOG_DIGEST_INVALID',
        message: 'RUNTIME_SOURCE_CATALOG_DIGEST_INVALID:not-a-digest'
      });
      assert.throws(() => api[name]({ ...original, [digestField]: 'f'.repeat(64) }), {
        name: 'Error', code: 'RUNTIME_SOURCE_CATALOG_DIGEST_MISMATCH',
        message: `RUNTIME_SOURCE_CATALOG_DIGEST_MISMATCH:${original.world_revision_id}`
      });
    }
  });
}
