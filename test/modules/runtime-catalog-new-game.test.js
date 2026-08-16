import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindRuntimeCatalogStageInput
} from '@rus/new-game/orchestrator';
import {
  computeStage24ArtifactDigest
} from '@rus/contracts';

const pin = Object.freeze({
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'domain-v2',
  catalog_digest: 'a'.repeat(64),
  import_id: 'import-v2',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: 'c'.repeat(64),
  runtime_contract_digest: 'd'.repeat(64),
  compatible_world_revision_id: 'world-v2',
  compatible_world_catalog_digest: 'e'.repeat(64),
  compatible_world_pin_manifest_digest: 'f'.repeat(64),
  activation_event_id: 'activation-v2'
});
const runtimeCatalogContext = Object.freeze({
  schema: 'rus.runtime_catalog_context.v2',
  source: 'active',
  pin,
  world_pin: Object.freeze({
    world_revision_id: pin.compatible_world_revision_id,
    world_catalog_digest: pin.compatible_world_catalog_digest
  }),
  actor_profile_catalog: Object.freeze({
    schema: 'rus.verified_actor_profile_catalog.v1',
    verified: true,
    world_pin: Object.freeze({
      world_revision_id: pin.compatible_world_revision_id,
      world_catalog_digest: pin.compatible_world_catalog_digest
    })
  }),
  selection: Object.freeze({
    region_id: 'region-novgorod',
    effective_date: '1230-06-01'
  }),
  verified_catalog: Object.freeze({
    schema: 'rus.verified_item_catalog.v2',
    verified: true,
    pin
  }),
  applicable_catalog: Object.freeze({
    schema: 'rus.verified_item_catalog.v2',
    verified: true,
    pin
  })
});
const projectionDigest = '1'.repeat(64);

test('new-game runtime catalog binding passes one exact immutable context through all catalog stages', () => {
  for (const stageId of [7, 8, 13, 14, 16, 24, 25]) {
    const bound = bindRuntimeCatalogStageInput({
      stage: { id: stageId },
      input: stageInput(stageId),
      runtimeCatalogContext,
      required: true
    });
    assert.deepEqual(bound.runtime_catalog_context.pin, pin, `stage ${stageId}`);
    assert.ok(Object.isFrozen(runtimeCatalogContext));
    if (stageId === 24) {
      assert.deepEqual(bound.party_creation_context.domain_catalog_pin, pin);
      assert.equal(
        bound.party_db_write_plan_input_digest,
        computeStage24ArtifactDigest({
          ...bound,
          party_db_write_plan_input_digest: undefined
        })
      );
    }
  }
});

test('new-game runtime catalog binding fails before Stage 8 when required context is missing', () => {
  assert.throws(
    () => bindRuntimeCatalogStageInput({
      stage: { id: 8 },
      input: {},
      runtimeCatalogContext: null,
      required: true
    }),
    (error) => error.code === 'RUNTIME_CATALOG_CONTEXT_MISSING'
  );
});

test('new-game runtime catalog binding rejects every stage artifact that breaks the exact pin chain', () => {
  const cases = [
    [8, (input) => { input.approved_catalog_snapshot.source_catalog_digest = '2'.repeat(64); }],
    [13, (input) => { input.allowed_g5_template_set.source_catalog_digest = '2'.repeat(64); }],
    [13, (input) => { input.item_profile_candidate_set.source_catalog_digest = '2'.repeat(64); }],
    [14, (input) => { input.g5_scene_graph_draft.materialization_run.catalog_digest = '2'.repeat(64); }],
    [14, (input) => { input.g5_scene_graph_draft.materialization_run.catalog_bundle_digest = '2'.repeat(64); }],
    [16, (input) => { input.g5_scene_graph.materialization_run.world_revision_id = 'world-other'; }]
  ];
  for (const [stageId, mutate] of cases) {
    const input = stageInput(stageId);
    mutate(input);
    assert.throws(
      () => bindRuntimeCatalogStageInput({
        stage: { id: stageId },
        input,
        runtimeCatalogContext,
        required: true
      }),
      (error) => error.code === 'RUNTIME_CATALOG_STAGE_PIN_MISMATCH',
      `stage ${stageId}`
    );
  }
});

function stageInput(stageId) {
  const itemCandidates = {
    world_revision_id: pin.compatible_world_revision_id,
    source_catalog_digest: pin.catalog_digest,
    catalog_digest: projectionDigest
  };
  const allowedTemplates = {
    world_revision_id: pin.compatible_world_revision_id,
    source_catalog_digest: pin.catalog_digest,
    catalog_digest: projectionDigest,
    allowed_g5_templates: [{
      source_catalog_digest: pin.catalog_digest
    }]
  };
  const materializationRun = {
    world_revision_id: pin.compatible_world_revision_id,
    catalog_digest: pin.catalog_digest,
    catalog_bundle_digest: projectionDigest
  };
  if (stageId === 7) {
    return {
      world_revision_id: pin.compatible_world_revision_id,
      approved_actor_profile_snapshot: {
        world_revision_id: pin.compatible_world_revision_id,
        source_catalog_digest: pin.compatible_world_catalog_digest
      }
    };
  }
  if (stageId === 8) {
    return {
      world_revision_id: pin.compatible_world_revision_id,
      approved_catalog_snapshot: structuredClone(itemCandidates)
    };
  }
  if (stageId === 13) {
    return {
      item_profile_candidate_set: itemCandidates,
      allowed_g5_template_set: allowedTemplates,
      materialization_context: {
        world_revision_id: pin.compatible_world_revision_id
      }
    };
  }
  if (stageId === 14) {
    return {
      item_profile_candidate_set: itemCandidates,
      allowed_g5_template_set: allowedTemplates,
      g5_scene_graph_draft: { materialization_run: materializationRun }
    };
  }
  if (stageId === 16) {
    return {
      item_profile_candidate_set: itemCandidates,
      g5_scene_graph: { materialization_run: materializationRun }
    };
  }
  if (stageId === 24) {
    return {
      party_creation_context: { party_id: 'party-v2' },
      party_db_write_plan_input_digest: 'old'
    };
  }
  return { party_creation_context: { domain_catalog_pin: pin } };
}
