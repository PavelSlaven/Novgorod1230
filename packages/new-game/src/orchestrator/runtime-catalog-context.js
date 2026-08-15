import { computeStage24ArtifactDigest } from '@rus/contracts';

const PINNED_STAGES = new Set([7, 8, 13, 14, 16, 24, 25]);
const PIN_FIELDS = Object.freeze([
  'catalog_scope',
  'catalog_revision_id',
  'catalog_digest',
  'import_id',
  'import_audit_digest',
  'record_registry_digest',
  'runtime_contract_digest',
  'compatible_world_revision_id',
  'compatible_world_catalog_digest',
  'compatible_world_pin_manifest_digest',
  'activation_event_id'
]);

export function bindRuntimeCatalogStageInput({
  stage,
  input,
  runtimeCatalogContext,
  required = false
}) {
  if (!PINNED_STAGES.has(Number(stage?.id))) return input;
  if (!validContext(runtimeCatalogContext)) {
    if (!required) return input;
    throw runtimeCatalogError(
      'RUNTIME_CATALOG_CONTEXT_MISSING',
      `Stage ${stage?.id ?? '?'} requires one verified runtime catalog context.`
    );
  }
  assertStagePin(Number(stage.id), input, runtimeCatalogContext);
  const bound = {
    ...structuredClone(input),
    runtime_catalog_context: deepFreeze(structuredClone(runtimeCatalogContext))
  };
  if (Number(stage.id) === 24) {
    bound.party_creation_context = {
      ...structuredClone(bound.party_creation_context),
      domain_catalog_pin: structuredClone(runtimeCatalogContext.pin)
    };
    bound.party_db_write_plan_input_digest = computeStage24ArtifactDigest({
      ...bound,
      party_db_write_plan_input_digest: undefined
    });
  }
  return bound;
}

export function validateRuntimeCatalogContext(context) {
  if (!validContext(context)) {
    throw runtimeCatalogError(
      'RUNTIME_CATALOG_CONTEXT_INVALID',
      'Runtime catalog context must contain the exact verified domain pin and catalog.'
    );
  }
  return context;
}

function validContext(context) {
  return context?.schema === 'rus.runtime_catalog_context.v2'
    && context.pin?.schema === 'rus.runtime_catalog_pin.v2'
    && context.pin.catalog_scope === 'item_container_materialization_v2'
    && context.world_pin?.world_revision_id === context.pin.compatible_world_revision_id
    && context.world_pin?.world_catalog_digest === context.pin.compatible_world_catalog_digest
    && context.verified_catalog?.schema === 'rus.verified_item_catalog.v2'
    && context.verified_catalog.verified === true
    && samePin(context.verified_catalog.pin, context.pin)
    && (context.actor_profile_catalog == null
      || (context.actor_profile_catalog.schema
          === 'rus.verified_actor_profile_catalog.v1'
        && context.actor_profile_catalog.verified === true
        && context.actor_profile_catalog.world_pin?.world_revision_id
          === context.world_pin.world_revision_id
        && context.actor_profile_catalog.world_pin?.world_catalog_digest
          === context.world_pin.world_catalog_digest))
    && (context.applicable_catalog == null
      || (context.applicable_catalog.schema === 'rus.verified_item_catalog.v2'
        && context.applicable_catalog.verified === true
        && samePin(context.applicable_catalog.pin, context.pin)));
}

function assertStagePin(stageId, input, context) {
  const pin = context.pin;
  const worldRevisionId = pin.compatible_world_revision_id;
  if (stageId === 7) {
    assertFields([
      ['world_revision_id', input?.world_revision_id, worldRevisionId],
      ['approved_actor_profile_snapshot.world_revision_id', input?.approved_actor_profile_snapshot?.world_revision_id, worldRevisionId],
      ['approved_actor_profile_snapshot.source_catalog_digest', input?.approved_actor_profile_snapshot?.source_catalog_digest, context.world_pin.world_catalog_digest]
    ], stageId);
    return;
  }
  if (stageId === 8) {
    assertFields([
      ['world_revision_id', input?.world_revision_id, worldRevisionId],
      ['approved_catalog_snapshot.world_revision_id', input?.approved_catalog_snapshot?.world_revision_id, worldRevisionId],
      ['approved_catalog_snapshot.source_catalog_digest', input?.approved_catalog_snapshot?.source_catalog_digest, pin.catalog_digest]
    ], stageId);
    return;
  }
  if (stageId === 13) {
    assertCandidateSet(input?.item_profile_candidate_set, pin, worldRevisionId, stageId);
    assertAllowedTemplateSet(input?.allowed_g5_template_set, pin, worldRevisionId, stageId);
    assertFields([
      ['materialization_context.world_revision_id', input?.materialization_context?.world_revision_id, worldRevisionId]
    ], stageId);
    return;
  }
  if (stageId === 14) {
    assertCandidateSet(input?.item_profile_candidate_set, pin, worldRevisionId, stageId);
    assertAllowedTemplateSet(input?.allowed_g5_template_set, pin, worldRevisionId, stageId);
    assertMaterializationTrace(
      input?.g5_scene_graph_draft?.materialization_run,
      input?.allowed_g5_template_set?.catalog_digest,
      pin,
      worldRevisionId,
      stageId
    );
    return;
  }
  if (stageId === 16) {
    assertCandidateSet(input?.item_profile_candidate_set, pin, worldRevisionId, stageId);
    assertMaterializationTrace(
      input?.g5_scene_graph?.materialization_run,
      null,
      pin,
      worldRevisionId,
      stageId
    );
    return;
  }
  if (stageId === 25 && input?.party_creation_context?.domain_catalog_pin != null
    && !samePin(input.party_creation_context.domain_catalog_pin, pin)) {
    mismatch(stageId, 'party_creation_context.domain_catalog_pin');
  }
}

function assertCandidateSet(candidateSet, pin, worldRevisionId, stageId) {
  assertFields([
    ['item_profile_candidate_set.world_revision_id', candidateSet?.world_revision_id, worldRevisionId],
    ['item_profile_candidate_set.source_catalog_digest', candidateSet?.source_catalog_digest, pin.catalog_digest]
  ], stageId);
}

function assertAllowedTemplateSet(templateSet, pin, worldRevisionId, stageId) {
  assertFields([
    ['allowed_g5_template_set.world_revision_id', templateSet?.world_revision_id, worldRevisionId],
    ['allowed_g5_template_set.source_catalog_digest', templateSet?.source_catalog_digest, pin.catalog_digest]
  ], stageId);
  for (const [index, template] of (templateSet?.allowed_g5_templates ?? []).entries()) {
    if (template?.source_catalog_digest !== pin.catalog_digest) {
      mismatch(stageId, `allowed_g5_template_set.allowed_g5_templates[${index}].source_catalog_digest`);
    }
  }
}

function assertMaterializationTrace(
  trace,
  expectedBundleDigest,
  pin,
  worldRevisionId,
  stageId
) {
  const fields = [
    ['materialization_run.world_revision_id', trace?.world_revision_id, worldRevisionId],
    ['materialization_run.catalog_digest', trace?.catalog_digest, pin.catalog_digest]
  ];
  if (expectedBundleDigest != null) {
    fields.push([
      'materialization_run.catalog_bundle_digest',
      trace?.catalog_bundle_digest,
      expectedBundleDigest
    ]);
  }
  assertFields(fields, stageId);
}

function assertFields(fields, stageId) {
  for (const [field, actual, expected] of fields) {
    if (actual !== expected) mismatch(stageId, field);
  }
}

function mismatch(stageId, field) {
  throw runtimeCatalogError(
    'RUNTIME_CATALOG_STAGE_PIN_MISMATCH',
    `Stage ${stageId} input does not preserve the exact runtime catalog pin at ${field}.`
  );
}

function samePin(left, right) {
  return left?.schema === 'rus.runtime_catalog_pin.v2'
    && right?.schema === 'rus.runtime_catalog_pin.v2'
    && PIN_FIELDS.every((field) => left[field] === right[field]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function runtimeCatalogError(code, message) {
  return Object.assign(new Error(message), { code });
}
