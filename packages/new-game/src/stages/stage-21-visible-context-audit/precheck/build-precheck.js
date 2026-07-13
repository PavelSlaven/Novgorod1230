import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { STAGE21_PRECHECK_SCHEMA } from '../policy/constants.js';
import { validateStage21Input } from '../input/input-boundary.js';
import { buildVisibleContextReferenceIndex, buildVisibleContextVisibilityFilter } from '../../../visible-context/reference-index.js';
import { buildVisibleContextCodePrecheckBoundary } from '../../../visible-context/boundary-validation.js';
import { array, dedupe, deepEqual, isObject, issue, sorted } from '../../../visible-context/shared.js';

export function buildStage21ReferenceIndex(input) {
  const refs = buildVisibleContextReferenceIndex(input);
  const filter = buildVisibleContextVisibilityFilter(input, refs);
  return {
    refs,
    filter,
    summary: {
      anchor_ids: sorted(refs.anchorIds),
      g5_edge_ids: sorted(refs.g5EdgeIds),
      npc_instance_ids: sorted(refs.npcIds),
      item_instance_ids: sorted(refs.itemIds),
      container_instance_ids: sorted(refs.containerIds),
      knowledge_ids: sorted(refs.knowledgeIds),
      hidden_fact_ids: sorted(refs.hiddenFactIds),
      sensitive_hidden_fact_ids: sorted(refs.sensitiveHiddenFactIds),
      visible_anchor_ids: [...filter.visible_anchor_ids],
      audible_anchor_ids: [...filter.audible_anchor_ids],
      visible_npc_ids: [...filter.visible_npc_ids],
      audible_npc_ids: [...filter.audible_npc_ids],
      visible_item_ids: [...filter.visible_item_ids],
      visible_container_ids: [...filter.visible_container_ids],
      allowed_visible_hint_refs: [...filter.allowed_visible_hint_refs],
      forbidden_hidden_fact_ids: [...filter.forbidden_hidden_fact_ids]
    }
  };
}

export function buildStage21AuditCodePrecheck(input, referenceIndex = buildStage21ReferenceIndex(input)) {
  const concerns = [];
  const inputConcerns = validateStage21Input(input);
  concerns.push(...inputConcerns);
  const recomputed = buildVisibleContextCodePrecheckBoundary(
    input?.visible_context_package,
    input,
    referenceIndex.refs,
    referenceIndex.filter
  );
  if (recomputed.pass !== true) concerns.push(...array(recomputed.concerns).map((item) => normalizeStage20Concern(item)));
  if (!deepEqual(recomputed.checks, input?.visible_context_code_precheck?.checks)) concerns.push(issue('VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH', 'Stage 21 recomputed precheck differs from Stage 20 precheck.', 'visible_context_code_precheck.checks'));
  const actualDigest = isObject(input?.visible_context_package) ? computeVisibleContextPackageDigest(input.visible_context_package) : null;
  if (actualDigest !== input?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH', 'Package digest mismatch.', 'visible_context_package_digest', actualDigest, input?.visible_context_package_digest));
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...items) => items.every((code) => !codes.has(code));
  return {
    version: 1,
    schema: STAGE21_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: actualDigest,
    pass: concerns.length === 0,
    checks: {
      input_integrity: inputConcerns.length === 0,
      stage20_precheck_integrity: none('VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_STAGE20_PRECHECK_INVALID'),
      package_schema: none('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_PACKAGE_INVALID'),
      request_id_match: none('VISIBLE_CONTEXT_REQUEST_ID_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH'),
      package_digest_match: none('VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH'),
      position_match: none('VISIBLE_CONTEXT_POSITION_CONFLICT'),
      clock_match: none('VISIBLE_CONTEXT_CLOCK_CONFLICT'),
      season_match: none('VISIBLE_CONTEXT_SEASON_CONFLICT'),
      weather_match: none('VISIBLE_CONTEXT_WEATHER_CONFLICT'),
      light_match: none('VISIBLE_CONTEXT_LIGHT_CONFLICT'),
      anchor_refs_exist: none('VISIBLE_CONTEXT_INVALID_ANCHOR_REF'),
      exit_refs_exist: none('VISIBLE_CONTEXT_INVALID_EXIT_REF'),
      npc_refs_exist: none('VISIBLE_CONTEXT_INVALID_NPC_REF'),
      item_refs_exist: none('VISIBLE_CONTEXT_INVALID_ITEM_REF'),
      container_refs_exist: none('VISIBLE_CONTEXT_INVALID_CONTAINER_REF'),
      action_target_refs_exist: none('VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK'),
      source_trace_present: none('VISIBLE_CONTEXT_SOURCE_TRACE_MISSING'),
      narrator_scope_present: none('VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING'),
      must_not_include_present: none('VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE'),
      no_new_entity_ids: none('VISIBLE_CONTEXT_NEW_ENTITY', 'VISIBLE_CONTEXT_NEW_WORLD_FACT'),
      no_forbidden_hidden_ids: none('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK', 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK', 'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK'),
      no_raw_hidden_fields: none('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK', 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'),
      no_audit_debug_fields: none('VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT')
    },
    concerns: dedupe(concerns),
    evidence: [
      { kind: 'stage21_independent_code_precheck', result: concerns.length === 0 ? 'passed' : 'failed' },
      { kind: 'visible_context_package_digest', digest: actualDigest },
      { kind: 'reference_counts', anchors: referenceIndex.refs.anchorIds.size, npcs: referenceIndex.refs.npcIds.size, items: referenceIndex.refs.itemIds.size, containers: referenceIndex.refs.containerIds.size }
    ]
  };
}

export function normalizeStage20Concern(item) {
  const mapping = {
    VISIBLE_CONTEXT_SCHEMA_MISMATCH: 'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
    VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING: 'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
    VISIBLE_CONTEXT_POSITION_MISMATCH: 'VISIBLE_CONTEXT_POSITION_CONFLICT',
    VISIBLE_CONTEXT_CLOCK_MISMATCH: 'VISIBLE_CONTEXT_CLOCK_CONFLICT',
    VISIBLE_CONTEXT_SEASON_MISMATCH: 'VISIBLE_CONTEXT_SEASON_CONFLICT',
    VISIBLE_CONTEXT_WEATHER_MISMATCH: 'VISIBLE_CONTEXT_WEATHER_CONFLICT',
    VISIBLE_CONTEXT_LIGHT_MISMATCH: 'VISIBLE_CONTEXT_LIGHT_CONFLICT',
    VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_ANCHOR_REF',
    VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_EXIT_REF',
    VISIBLE_CONTEXT_NPC_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_NPC_REF',
    VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_ITEM_REF',
    VISIBLE_CONTEXT_CONTAINER_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_CONTAINER_REF',
    VISIBLE_CONTEXT_NOT_VISIBLE: 'VISIBLE_CONTEXT_UNSEEN_NPC',
    VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK: 'VISIBLE_CONTEXT_UNSEEN_ITEM',
    VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK: 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK',
    VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK: 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK',
    VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK: 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK',
    VISIBLE_CONTEXT_FUTURE_EVENT_LEAK: 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK',
    VISIBLE_CONTEXT_TRUE_OWNERSHIP_LEAK: 'VISIBLE_CONTEXT_UNKNOWN_OWNERSHIP_LEAK',
    VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK: 'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK',
    VISIBLE_CONTEXT_RUMOR_TREATED_AS_FACT: 'VISIBLE_CONTEXT_RUMOR_AS_FACT',
    VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT: 'VISIBLE_CONTEXT_UNCERTAINTY_AS_FACT',
    VISIBLE_CONTEXT_ACTION_LABEL_USES_HIDDEN_TRUTH: 'VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK',
    VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING: 'VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT',
    VISIBLE_CONTEXT_CREATED_WORLD_FACT: 'VISIBLE_CONTEXT_NEW_WORLD_FACT',
    VISIBLE_CONTEXT_CREATED_NPC: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ITEM: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_CONTAINER: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ANCHOR: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ROUTE: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_NARRATOR_PROSE: 'VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT',
    VISIBLE_CONTEXT_SOURCE_MISSING: 'VISIBLE_CONTEXT_SOURCE_TRACE_MISSING',
    VISIBLE_CONTEXT_MUST_NOT_INCLUDE_MISSING: 'VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE'
  };
  return {
    ...item,
    code: mapping[item?.code] ?? item?.code ?? 'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
    severity: 'hard_block'
  };
}
