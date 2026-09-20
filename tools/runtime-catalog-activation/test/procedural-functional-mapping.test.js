import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateProceduralFunctionalMappings,
  validateProceduralFunctionalMappingCandidate } from
  '../../../scripts/generate-procedural-functional-mappings.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');
const v5 = 'data/knowledge-source/imports/item-container-120-v5/candidate';

test('functional candidate and request are byte-stable and non-executable',
  async () => {
    const first = await generateProceduralFunctionalMappings(root);
    const second = await generateProceduralFunctionalMappings(root);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
    const directory = new URL(
      '../../../data/world-catalogs/novgorod/procedural-scene-v2/functional-mapping-v1/',
      import.meta.url);
    assert.equal(await readFile(new URL('candidate.json', directory), 'utf8'),
      `${JSON.stringify(first.candidate, null, 2)}\n`);
    assert.equal(await readFile(new URL('approval-request.json', directory),
      'utf8'), `${JSON.stringify(first.approvalRequest, null, 2)}\n`);
    for (const value of [first.candidate, first.approvalRequest]) {
      assert.equal(value.import_authorized, false);
      assert.equal(value.activation_authorized, false);
      assert.equal(value.activation_request, null);
      assert.doesNotMatch(JSON.stringify(value),
        /"(?:import_id|activation_event|runtime_instance)"\s*:/u);
    }
    assert.equal(first.candidate.authoring_approval,
      'pending_independent_review');
    assert.equal(first.approvalRequest.authoring_approval,
      'pending_independent_review');
  });

test('mapping uses IDs, never display names', async () => {
  const path = `${v5}/tables/item_templates.json`;
  const templates = await readJson(path);
  const baseline = await generateProceduralFunctionalMappings(root);
  const renamed = structuredClone(templates);
  for (const row of renamed) row.title = `renamed:${row.id}`;
  const changed = await generateProceduralFunctionalMappings(root,
    { [path]: renamed });
  assert.deepEqual(changed, baseline);
  assert.doesNotMatch(JSON.stringify(changed), /renamed:/u);
});

test('missing and ambiguous category mappings fail closed', async () => {
  const path = `${v5}/tables/item_template_category_bindings.json`;
  const bindings = await readJson(path);
  const target = bindings.find(({ category_id: id, binding_kind: kind }) =>
    id === 'cat_item_object_fishhook_v1' && kind === 'object_type');
  await assert.rejects(() => generateProceduralFunctionalMappings(root, {
    [path]: bindings.filter(({ id }) => id !== target.id)
  }), { code: 'FUNCTIONAL_CATEGORY_MAPPING_MISSING' });
  await assert.rejects(() => generateProceduralFunctionalMappings(root, {
    [path]: [...bindings, { ...target, id: `${target.id}_duplicate` }]
  }), { code: 'FUNCTIONAL_CATEGORY_MAPPING_AMBIGUOUS' });
});

test('functional completeness, place storage and typed gaps are enforced',
  async () => {
    const { candidate } = await generateProceduralFunctionalMappings(root);
    assert.equal(validateProceduralFunctionalMappingCandidate(candidate),
      candidate);
    const fishing = candidate.mappings.filter(({ family_candidate_ref: ref }) =>
      ref === 'novgorod_inland_fishing_worksite_v3@1');
    assert.deepEqual(fishing.map(({ layer }) => layer).sort(),
      ['storage', 'tool', 'work_material', 'work_zone']);
    assert.ok(fishing.filter(({ candidates }) => candidates)
      .flatMap(({ candidates }) => candidates).every((member) =>
        member.profile_entry_ref && member.profile_ref
          && member.object_category_ref && member.item_template_ref
          && member.quantity_profile_ref && member.inventory_profile_ref
          && member.source_binding_refs.length === 4
          && member.source_refs.length > 0));
    const placeGroups = candidate.mappings.filter(({ layer }) =>
      layer === 'storage' || layer === 'work_zone');
    assert.ok(placeGroups.every((row) => row.persistent === true
      && row.item_template_refs.length === 0
      && row.container_template_refs.length === 0));
    const dormant = candidate.mappings.filter(({ family_candidate_ref: ref,
      variant_id: variant }) => ref ===
        'novgorod_drying_storage_workspace_v3@1' && variant === 'dormant');
    assert.deepEqual(dormant.map(({ layer }) => layer).sort(),
      ['storage', 'work_zone']);
    assert.ok(candidate.remaining_gaps.some(({ code }) =>
      code === 'FUNCTIONAL_CONTAINER_MAPPING_MISSING'));
    assert.ok(candidate.remaining_gaps.some(({ code }) =>
      code === 'FINITE_WRECK_SOURCE_REF_REQUIRED'));
    assert.equal(candidate.source_accounting.runtime_instances_created, false);
  });

test('cross-layer item reuse fails single-source accounting guard', async () => {
  const { candidate } = await generateProceduralFunctionalMappings(root);
  const changed = structuredClone(candidate);
  const tool = changed.mappings.find(({ layer }) => layer === 'tool');
  const material = changed.mappings.find(({ layer }) =>
    layer === 'work_material');
  material.candidates.push(structuredClone(tool.candidates[0]));
  assert.throws(() => validateProceduralFunctionalMappingCandidate(changed),
    { code: 'FUNCTIONAL_CROSS_LAYER_SOURCE_DUPLICATE' });
});

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(`../../../${relative}`,
    import.meta.url), 'utf8'));
}
