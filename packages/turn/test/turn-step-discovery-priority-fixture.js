import { turnStepPlan } from './turn-workflow-fixture.js';

export function unmatchedDiscoveryBinding() {
  return { binding_id: 'unmatched-authored-discovery',
    operation: 'request_discovery', matches: () => false };
}

export function discoveryProjection(ordinaryResolution = undefined,
  spatialSemantic = undefined) {
  return { actor: { actor_ref: 'party-1' }, player_safe_state: {
    position: { location_ref: 'place-gate' },
    visible_entities: [{ entity_ref: 'place-gate' }],
    ...(ordinaryResolution === undefined ? {} : {
      ordinary_resolution: ordinaryResolution }),
    ...(spatialSemantic === undefined ? {} : {
      spatial_semantic: spatialSemantic }) } };
}

export function spatialMarker() {
  return { semantic_grounding_available: true, position_ref: 'place-gate' };
}

export function discoveryPlan(request, query = 'осмотреть неизвестную деталь',
  discoveryKind = 'inspect') {
  return turnStepPlan(request, { resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: 'party-1',
      discovery_kind: discoveryKind, target_refs: ['place-gate'], query }],
    continuation: null });
}

export function ordinaryResult(request) {
  return { working_projection: {
    ...request.working_projection, ordinary_detail_resolved: true },
  summary: 'ordinary detail resolved', write_fragments: [{
    target: 'party_hidden_state', value: { ordinary_detail_resolved: true } }],
  player_response_boundary: true };
}
