import { STAGE19_OUTPUT_SCHEMA, STAGE19_PRECHECK_SCHEMA, OUTPUT_ARRAYS, BLOCK_ID_FIELDS, STATUS } from '../policy/constants.js';
import { validateStage19Input } from '../input/input-boundary.js';
import { buildStage19ReferenceIndex, collectByKeys } from '../references/reference-index.js';
import { array, dedupe, isObject, issue, text } from '../shared/utils.js';
import {
  validateAccessState,
  validateContainerState,
  validateEnvironmentState,
  validateEventState,
  validateForbiddenSurfaces,
  validateFrameAndParent,
  validateItemState,
  validateNpcState,
  validatePropertyState,
  validateRiskState,
  validateRouteState,
  validateSocialState
} from './entity-validation.js';
import {
  validateConsequenceHooks,
  validateConsequenceReferences,
  validateDiscoveryRules,
  validateEmptyLimited,
  validateFactDisclosureLinks,
  validateForbiddenCoverage,
  validateKnowledgeBoundary,
  validatePropertyBindings,
  validateRevealConditions
} from './disclosure-validation.js';
import { registerId } from './validation-helpers.js';
export function validateFullHiddenSceneState(output, input, refs = buildStage19ReferenceIndex(input)) {
  const concerns = [];
  if (!isObject(output)) return [issue('HIDDEN_STATE_INVALID_JSON', 'full_hidden_scene_state must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE19_OUTPUT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `Expected ${STAGE19_OUTPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (output.request_id !== input?.request_id) {
    concerns.push(issue('HIDDEN_STATE_REQUEST_ID_MISMATCH', 'Stage 19 output request_id must match input.', 'request_id', input?.request_id, output.request_id));
  }
  if (!STATUS.has(output.hidden_state_status)) {
    concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', 'hidden_state_status is outside the allowed enum.', 'hidden_state_status'));
  }
  for (const key of OUTPUT_ARRAYS) {
    if (!Array.isArray(output[key])) concerns.push(issue('HIDDEN_STATE_ARRAY_INVALID', `${key} must be an array.`, key));
  }
  if (!isObject(output.frame)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'frame must be an object.', 'frame'));
  if (!isObject(output.parent_scene)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'parent_scene must be an object.', 'parent_scene'));
  if (!isObject(output.player_facing_boundary)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'player_facing_boundary must be an object.', 'player_facing_boundary'));
  if (!isObject(output.audit_self_check)) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', 'audit_self_check must be an object.', 'audit_self_check'));

  validateFrameAndParent(output, input, refs, concerns);
  validateForbiddenSurfaces(output, concerns);

  const idRegistry = new Map();
  for (const [arrayName, idField] of Object.entries(BLOCK_ID_FIELDS)) {
    for (const [index, item] of array(output[arrayName]).entries()) {
      const path = `${arrayName}[${index}]`;
      if (!isObject(item)) {
        concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `${path} must be an object.`, path));
        continue;
      }
      registerId(item[idField], path, idRegistry, concerns);
    }
  }

  const factRegistry = new Map();
  validateNpcState(output, refs, factRegistry, idRegistry, concerns);
  validateAccessState(output, refs, factRegistry, concerns);
  validatePropertyState(output, refs, factRegistry, concerns);
  validateContainerState(output, input, refs, factRegistry, concerns);
  validateItemState(output, refs, factRegistry, concerns);
  validateRiskState(output, refs, factRegistry, concerns);
  validateEventState(output, factRegistry, concerns);
  validateSocialState(output, refs, factRegistry, concerns);
  validateRouteState(output, refs, factRegistry, concerns);
  validateEnvironmentState(output, refs, factRegistry, concerns);

  const revealIds = new Set(array(output.reveal_conditions).map((x) => x?.reveal_condition_id).filter(text));
  const discoveryIds = new Set(array(output.discovery_rules).map((x) => x?.discovery_rule_id).filter(text));
  const consequenceIds = new Set(array(output.consequence_hooks).map((x) => x?.consequence_hook_id).filter(text));

  validateDiscoveryRules(output, refs, factRegistry, consequenceIds, concerns);
  validateRevealConditions(output, factRegistry, concerns);
  validateConsequenceHooks(output, refs, concerns);
  validateFactDisclosureLinks(factRegistry, revealIds, discoveryIds, output, concerns);
  validateConsequenceReferences(output, consequenceIds, concerns);
  validateForbiddenCoverage(output, factRegistry, concerns);
  validateKnowledgeBoundary(output, input, concerns);
  validatePropertyBindings(output, refs, concerns);
  validateEmptyLimited(output, input, concerns);

  if (input?.hidden_state_policy?.require_source_trace === true && array(output.source_trace).length === 0) {
    concerns.push(issue('HIDDEN_STATE_SOURCE_MISSING', 'source_trace must not be empty.', 'source_trace'));
  }
  if (!Array.isArray(output.audit_self_check?.evidence) || output.audit_self_check.evidence.length === 0) {
    concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', 'audit_self_check.evidence'));
  }
  if (output.audit_self_check?.pass === false && array(output.audit_self_check?.concerns).length === 0) {
    concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'Failed audit_self_check requires concerns.', 'audit_self_check.concerns'));
  }
  if (output.audit_self_check?.pass !== true) {
    concerns.push(issue('HIDDEN_STATE_SELF_CHECK_FAILED', 'audit_self_check.pass must be true before semantic audit.', 'audit_self_check.pass'));
  }
  return dedupe(concerns);
}

export function buildFullHiddenStateCodePrecheck(output, input, refs = buildStage19ReferenceIndex(input)) {
  const concerns = [
    ...validateStage19Input(input),
    ...validateFullHiddenSceneState(output, input, refs)
  ];
  const failed = (code) => concerns.some((item) => item.code === code && item.severity !== 'warning');
  const prefixFailed = (prefix) => concerns.some((item) => item.code.startsWith(prefix) && item.severity !== 'warning');
  return {
    version: 1,
    schema: STAGE19_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: concerns.every((item) => item.severity === 'warning'),
    checks: {
      schema_valid: !failed('HIDDEN_STATE_SCHEMA_MISMATCH') && !failed('HIDDEN_STATE_INVALID_JSON'),
      all_hidden_fact_ids_present: !failed('HIDDEN_STATE_MISSING_HIDDEN_FACT_ID'),
      all_npc_refs_exist: !failed('HIDDEN_STATE_NPC_REF_NOT_FOUND'),
      all_item_refs_exist: !failed('HIDDEN_STATE_ITEM_REF_NOT_FOUND'),
      all_container_refs_exist: !failed('HIDDEN_STATE_CONTAINER_REF_NOT_FOUND'),
      all_anchor_refs_exist: !failed('HIDDEN_STATE_ANCHOR_REF_NOT_FOUND'),
      all_route_refs_exist: !failed('HIDDEN_STATE_ROUTE_REF_NOT_FOUND') && !failed('HIDDEN_STATE_ROUTE_ID_FORBIDDEN_BEFORE_COMMIT'),
      no_new_entities_created: !prefixFailed('HIDDEN_STATE_CREATED_'),
      reveal_conditions_present: !failed('HIDDEN_STATE_NO_REVEAL_CONDITION'),
      discovery_rules_present: !failed('HIDDEN_STATE_NO_DISCOVERY_RULE'),
      consequence_hooks_valid: !prefixFailed('HIDDEN_STATE_CONSEQUENCE_'),
      forbidden_output_rules_present: !failed('HIDDEN_STATE_FORBIDDEN_OUTPUT_RULE_MISSING'),
      no_visible_scene_created: !failed('HIDDEN_STATE_CREATED_VISIBLE_SCENE'),
      no_intro_prose_created: !failed('HIDDEN_STATE_CREATED_INTRO_PROSE'),
      no_narrator_text_created: !failed('HIDDEN_STATE_CREATED_NARRATOR_TEXT'),
      source_trace_present: !failed('HIDDEN_STATE_SOURCE_MISSING'),
      character_knowledge_consistent: !failed('HIDDEN_STATE_CHARACTER_KNOWLEDGE_CONFLICT'),
      time_light_consistent: !failed('HIDDEN_STATE_TIME_LIGHT_CONFLICT'),
      property_bindings_consistent: !failed('HIDDEN_STATE_PROPERTY_CONFLICT')
    },
    concerns,
    evidence: concerns.length === 0
      ? [{ kind: 'stage19_code_precheck', result: 'passed' }]
      : concerns.map((item) => ({ kind: 'validation_issue', code: item.code, field: item.field }))
  };
}

export function formatOnlyStateValidation(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('HIDDEN_STATE_INVALID_JSON', 'Output must be an object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE19_OUTPUT_SCHEMA) concerns.push(issue('HIDDEN_STATE_SCHEMA_MISMATCH', `Expected ${STAGE19_OUTPUT_SCHEMA} version 1.`, 'schema'));
  for (const key of OUTPUT_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('HIDDEN_STATE_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['frame', 'parent_scene', 'player_facing_boundary', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('HIDDEN_STATE_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));
  return concerns;
}

