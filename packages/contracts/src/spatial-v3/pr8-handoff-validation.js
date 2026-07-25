import {
  canonicalizeSpatialV3,
  computeSpatialV3CanonicalDigest
} from './registry.js';

const issue = (code, field, message) => ({ code, field, message });
const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalEqual = (left, right) =>
  JSON.stringify(canonicalizeSpatialV3(left)) ===
  JSON.stringify(canonicalizeSpatialV3(right));
const validateCompleteDigest = (value, field = 'canonical_digest') => {
  if (value?.[field] == null) return [];
  const { [field]: _digest, ...payload } = value;
  return value[field] === computeSpatialV3CanonicalDigest(payload)
    ? []
    : [issue('generated_schema_mismatch', field,
      `${field} must cover the complete immutable snapshot.`)];
};

function validateJourneySuccessorPlanPreparation(value) {
  if (!isObject(value.successor_path_query)) return [];
  const errors = [];
  if (!canonicalEqual(value.predecessor_handoff_endpoint_ref, value.successor_path_query.start_endpoint_ref)) {
    errors.push(issue(
      'generated_schema_mismatch',
      'successor_path_query.start_endpoint_ref',
      'The successor path query must start at the exact committed predecessor handoff endpoint.'
    ));
  }
  if (value.party_id !== value.successor_path_query.party_id) {
    errors.push(issue(
      'generated_schema_mismatch',
      'successor_path_query.party_id',
      'The successor path query must remain bound to the command party.'
    ));
  }
  return errors;
}

function validatePerceptionPropagationEdge(value) {
  const errors = [];
  const channels = Array.isArray(value.permitted_channels) ? value.permitted_channels : [];
  const isVisibility = value.relation_kind === 'visibility_link';
  const isAcoustic = value.relation_kind === 'acoustic_edge';
  if (isVisibility) {
    if (!canonicalEqual(channels, ['visual']) || value.visibility_quality == null || value.distance_band == null
      || value.acoustic_base_loss != null || value.acoustic_portal_extra_loss != null
      || value.resolved_condition_acoustic_loss != null) {
      errors.push(issue('generated_schema_mismatch', 'permitted_channels', 'A visibility_link snapshot requires only the visual channel and complete visibility values.'));
    }
  }
  if (isAcoustic) {
    if (!canonicalEqual(channels, ['acoustic']) || value.acoustic_base_loss == null
      || value.visibility_quality != null || value.distance_band != null
      || value.visibility_portal_result != null || value.resolved_condition_visibility != null) {
      errors.push(issue('generated_schema_mismatch', 'permitted_channels', 'An acoustic_edge snapshot requires only the acoustic channel and complete acoustic loss values.'));
    }
  }
  const portalFields = isVisibility
    ? [value.portal_ref, value.portal_state, value.visibility_portal_result]
    : isAcoustic
      ? [value.portal_ref, value.portal_state, value.acoustic_portal_extra_loss]
      : [];
  if (portalFields.length && ![0, portalFields.length].includes(portalFields.filter((entry) => entry != null).length)) {
    errors.push(issue('generated_schema_mismatch', 'portal_ref', 'Portal reference, state and channel-specific resolved result must be present together.'));
  }
  const conditionFields = isVisibility
    ? [value.condition_profile_ref, value.resolved_condition_visibility]
    : isAcoustic
      ? [value.condition_profile_ref, value.resolved_condition_acoustic_loss]
      : [];
  if (conditionFields.length && ![0, conditionFields.length].includes(conditionFields.filter((entry) => entry != null).length)) {
    errors.push(issue('generated_schema_mismatch', 'condition_profile_ref', 'Condition profile and channel-specific resolved result must be present together.'));
  }
  return errors;
}

function validatePerceptionPropagation(value) {
  const edges = Array.isArray(value.edges) ? value.edges : [];
  if (edges.length === 0) {
    return canonicalEqual(value.source_scope_ref, value.target_scope_ref)
      ? []
      : [issue('generated_schema_mismatch', 'edges', 'An empty propagation path is valid only within one scope.')];
  }
  const errors = [];
  if (!canonicalEqual(edges[0].from_ref, value.source_scope_ref)
    || !canonicalEqual(edges.at(-1).to_ref, value.target_scope_ref)
    || edges.some((edge, index) => index > 0 && !canonicalEqual(edges[index - 1].to_ref, edge.from_ref))) {
    errors.push(issue('generated_schema_mismatch', 'edges', 'Propagation edges must form one contiguous path from source_scope_ref to target_scope_ref.'));
  }
  const visitedNodes = new Set([JSON.stringify(canonicalizeSpatialV3(edges[0].from_ref))]);
  for (const edge of edges) {
    const nodeKey = JSON.stringify(canonicalizeSpatialV3(edge.to_ref));
    if (visitedNodes.has(nodeKey)) {
      errors.push(issue('generated_schema_mismatch', 'edges', 'Propagation path must be acyclic.'));
      break;
    }
    visitedNodes.add(nodeKey);
  }
  return errors;
}

function validateNpcPerceptionRequest(value) {
  if (value.canonical_input_digest == null) return [];
  const { canonical_input_digest: _excludedDigest, ...digestInput } = value;
  return value.canonical_input_digest === computeSpatialV3CanonicalDigest(digestInput)
    ? []
    : [issue('generated_schema_mismatch', 'canonical_input_digest', 'canonical_input_digest must equal the complete canonical sealed request payload excluding the digest field itself.')];
}

function validatePerceptionResult(value) {
  return validateCompleteDigest(value);
}

export function validatePr8HandoffContract(contractName, value) {
  const validators = {
    journey_successor_plan_preparation_command:
      validateJourneySuccessorPlanPreparation,
    perception_propagation_edge_snapshot: validatePerceptionPropagationEdge,
    perception_propagation_snapshot: validatePerceptionPropagation,
    npc_perception_request: validateNpcPerceptionRequest,
    perception_result: validatePerceptionResult
  };
  return validators[contractName]?.(value) ?? [];
}
