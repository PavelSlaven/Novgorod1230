import { createOrdinaryMaterializationDiscoveryOwner } from '@rus/turn';
import {
  buildOrdinaryMaterializationPresenceRequest,
  buildOrdinaryMaterializationSeedScopeRequest
} from './ordinary-materialization-seed-request.js';
import { createOrdinaryMaterializationAtomicWritePlan } from
  '../infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { resolveConstrainedNaturalResourcePolicy } from
  './constrained-natural-resource-policy.js';
import { finiteSourceInitialization, finiteSourceTransition,
  resolveFiniteSourceAuthority } from
  './finite-source-effects.js';
import { resolveContextBoundOrdinaryPolicy } from
  './context-bound-ordinary-policy.js';
import { bindCommittedSourceIdentity } from
  './lower-dvina-trace-ordinary-discovery-internal.js';
import { snapshotOrdinaryMaterializationEnablement } from
  './ordinary-materialization-enablement-snapshot.js';

/** Lower Dvina supplies profile/context adapters to the common @rus/turn owner. */
export function createLowerDvinaTraceOrdinaryDiscoveryResolver({
  partyId, loadEnablement, ordinaryMaterializationModel,
  verifyStageBCutover = ordinaryMaterializationModel?.verifyStageBCutover,
  inputDigest
} = {}) {
  if (typeof loadEnablement !== 'function'
      || typeof ordinaryMaterializationModel !== 'function'
      || typeof verifyStageBCutover !== 'function') {
    throw new TypeError('ordinary discovery requires enablement and verified model ports');
  }
  return createOrdinaryMaterializationDiscoveryOwner({
    ordinaryMaterializationModel,
    verifyStageBCutover: (input) => verifyStageBCutover.call(
      ordinaryMaterializationModel, input),
    inputDigest,
    buildSeedRequest: buildOrdinaryMaterializationSeedScopeRequest,
    buildPresenceRequest: buildOrdinaryMaterializationPresenceRequest,
    sealAtomicWritePlan: createOrdinaryMaterializationAtomicWritePlan,
    resolveFiniteResourceEffects({ enabled, item, envelope, presence }) {
      const profile = enabled.ordinary_authority?.finite_source_profile ?? null;
      if (profile == null) return null;
      if (profile.finite_source.lifecycle_state === 'uninitialized') {
        return finiteSourceInitialization({ profile, item,
          request_identity: envelope.request.request_id,
          estimated_amount: presence.pending_items_property_admission
            ?.proposed_item?.finite_source_initial_amount_estimate?.amount });
      }
      const transition = finiteSourceTransition({ profile,
        item, request_identity: envelope.request.request_id });
      return transition == null ? null
        : { finite_resource_transition: transition };
    },
    async loadDiscoveryContext(request) {
      const scopeRef = currentG6(request?.committed_state);
      const rootId = request?.request?.root_turn_id;
      if (scopeRef == null || typeof rootId !== 'string' || !rootId) return null;
      const enabled = snapshotOrdinaryMaterializationEnablement(
        await loadEnablement({ partyId, scopeRef }));
      if (enabled == null) return null;
      const selected = selectDiscoveryContext({
        execution: enabled?.execution_context,
        objective: enabled?.objective_context,
        targetRef: request?.operation?.target_refs?.[0],
        locationRef: request?.committed_state?.position?.location_ref,
        scopeRef
      });
      const execution = selected?.execution;
      if (!validExecution(execution)) return null;
      const policyInput = {
        objective_context: structuredClone(selected.objective),
        execution_context: structuredClone(execution),
        candidate_context: structuredClone(execution.candidate_context),
        scope_ref: structuredClone(scopeRef),
        property_placement_context:
          structuredClone(enabled.property_placement_context)
      };
      const contextBound = resolveContextBoundOrdinaryPolicy(policyInput);
      const constrained = execution.constrained_natural_resource_profile == null
        ? { resolution: null, profile: null }
        : resolveConstrainedNaturalResourcePolicy(policyInput);
      const codeOwnedResolution = contextBound.resolution
        ?? constrained.resolution ?? null;
      const genericFinite = resolveFiniteSourceAuthority({
        authority: execution.finite_source_authority,
        committed_source: execution.committed_finite_source
      });
      const finiteProfile = constrained.profile ?? genericFinite;
      const sourceRef = contextBound.profile?.source_basis_ref
        ?? constrained.profile?.source_basis_ref ?? null;
      const candidate = codeOwnedResolution == null
        ? bindCommittedSourceIdentity(execution.candidate_context, sourceRef)
        : execution.candidate_context;
      if (candidate == null) return null;
      const estimatePolicy = finiteEstimatePolicy(finiteProfile);
      const objectiveContext = estimatePolicy == null
        ? selected.objective
        : { ...selected.objective, policy_refs: {
          ...selected.objective.policy_refs,
          finite_source_initial_amount_estimate_policy: estimatePolicy
        } };
      return { ...enabled, party_id: partyId, scope_ref: scopeRef,
        semantic_target_ref: request.operation.target_refs[0],
        expected_supporting_bases:
          structuredClone(enabled.execution_context.supporting_bases),
        objective_context: objectiveContext,
        execution_context: { ...execution, candidate_context: candidate },
        ordinary_authority: {
          context_bound_profile: contextBound.profile,
          constrained_resource_profile: constrained.profile,
          finite_source_profile: finiteProfile
        }, code_owned_resolution: codeOwnedResolution };
    }
  });
}
function selectDiscoveryContext({ execution, objective, targetRef, locationRef, scopeRef }) {
  if (!validExecution(execution) || typeof targetRef !== 'string') return null;
  if (execution.candidate_context.target_ref === targetRef
      || targetRef === locationRef
        && execution.candidate_context.target_ref === scopeRef?.entity_id) {
    const basisRefs = new Set(execution.supporting_bases.map(({ basis_ref }) =>
      basis_ref));
    return { execution: bindCommittedFiniteSource(execution),
      objective: { ...objective, policy_refs: {
      ...objective.policy_refs,
      allowed_supporting_bases: objective.policy_refs.allowed_supporting_bases
        .filter(({ basis_ref }) => basisRefs.has(basis_ref)) } } };
  }
  const matches = (execution.context_bound_capabilities ?? []).filter(
    ({ source_ref }) => source_ref === targetRef);
  if (matches.length !== 1) return null;
  const selected = matches[0];
  const { context_bound_capabilities: _, ...baseExecution } = execution;
  return { execution: bindCommittedFiniteSource({ ...baseExecution,
    candidate_context: selected.candidate_context,
    supporting_bases: selected.supporting_bases,
    context_bound_ordinary_profile:
      selected.context_bound_ordinary_profile,
    constrained_natural_resource_profile:
      selected.constrained_natural_resource_profile,
    finite_source_authority: selected.finite_source_authority ?? null }),
  objective: { ...objective, context_refs: selected.context_refs,
    policy_refs: selected.policy_refs } };
}

function bindCommittedFiniteSource(execution) {
  const authority = execution.finite_source_authority
    ?? execution.constrained_natural_resource_profile
    ?? execution.context_bound_ordinary_profile;
  const sourceId = authority?.finite_source?.source_resource_node_id;
  if (typeof sourceId !== 'string') return execution;
  const sources = Array.isArray(execution.committed_finite_sources)
    ? execution.committed_finite_sources
    : execution.committed_finite_source == null
      ? [] : [execution.committed_finite_source];
  const matches = sources.filter(
    ({ source_resource_node_id: id }) => id === sourceId);
  const { committed_finite_sources: _, ...selected } = execution;
  return { ...selected, committed_finite_source:
    matches.length === 1 ? structuredClone(matches[0]) : null };
}

function currentG6(state) {
  const id = state?.position?.g6_id ?? state?.position?.g6_ref;
  return typeof id === 'string' && id.length
    ? { entity_kind: 'g6', entity_id: id } : null;
}
function validExecution(value) {
  return value != null && typeof value === 'object'
    && Array.isArray(value.supporting_bases)
    && value.candidate_context != null
    && value.density_policy != null
    && value.mechanics_policy != null
    && value.stage_b_classification_eval != null
    && typeof value.causal_ref === 'string'
    && Array.isArray(value.source_refs)
    && typeof value.candidate_context.target_ref === 'string'
    && typeof value.candidate_context.candidate_ref_namespace === 'string'
    && typeof value.candidate_context.normalizer_version === 'string'
    && typeof value.candidate_context.semantic_type === 'string'
    && typeof value.candidate_context.functional_bucket === 'string'
    && (value.candidate_context.admission_class === 'common_mundane'
      ? value.candidate_context.semantic_type === 'ordinary_object_candidate'
        && value.candidate_context.functional_bucket === 'other_ordinary'
        && value.candidate_context.availability_class === 'common'
      : value.candidate_context.availability_class === 'context_bound')
    && validMechanicsPolicy(value.mechanics_policy);
}
function finiteEstimatePolicy(profile) {
  const source = profile?.finite_source;
  if (source?.lifecycle_state !== 'uninitialized') return null;
  const bounds = source.initial_amount_bounds;
  return bounds == null ? null : {
    schema: 'finite_source_initial_amount_estimate_policy_v1',
    minimum: structuredClone(bounds.minimum),
    maximum: structuredClone(bounds.maximum)
  };
}
function validMechanicsPolicy(value) {
  return value != null && typeof value === 'object'
    && typeof value.policy_ref === 'string'
    && Number.isSafeInteger(value.max_mass_grams)
    && Array.isArray(value.allowed_external_hand_costs)
    && Array.isArray(value.allowed_carry_forms)
    && Number.isSafeInteger(value.max_packing_slot_cost)
    && Number.isSafeInteger(value.max_quantity);
}
