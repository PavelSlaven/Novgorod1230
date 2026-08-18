import { createOrdinaryMaterializationDiscoveryOwner } from '@rus/turn';
import {
  buildOrdinaryMaterializationPresenceRequest,
  buildOrdinaryMaterializationSeedScopeRequest
} from './ordinary-materialization-seed-request.js';
import { createOrdinaryMaterializationAtomicWritePlan } from
  '../infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { constrainedNaturalResourceFiniteInitialization,
  constrainedNaturalResourceFiniteTransition,
  resolveConstrainedNaturalResourcePolicy } from
  './constrained-natural-resource-policy.js';
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
      const profile = enabled.ordinary_authority
        ?.constrained_resource_profile ?? null;
      if (profile == null) return null;
      if (profile.finite_source.lifecycle_state === 'uninitialized') {
        return constrainedNaturalResourceFiniteInitialization({ profile, item,
          request_identity: envelope.request.request_id,
          estimated_amount: presence.pending_items_property_admission
            ?.proposed_item?.finite_source_initial_amount_estimate?.amount });
      }
      const transition = constrainedNaturalResourceFiniteTransition({ profile,
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
      const execution = enabled?.execution_context;
      if (!validExecution(execution)
          || execution.candidate_context.target_ref
            !== request?.operation?.target_refs?.[0]) return null;
      const policyInput = {
        objective_context: structuredClone(enabled.objective_context),
        execution_context: structuredClone(execution),
        candidate_context: structuredClone(execution.candidate_context),
        scope_ref: structuredClone(scopeRef),
        property_placement_context:
          structuredClone(enabled.property_placement_context)
      };
      const contextBound = resolveContextBoundOrdinaryPolicy(policyInput);
      const constrained = contextBound.profile == null
        || requiresFiniteResourceOwner(contextBound.profile)
        ? resolveConstrainedNaturalResourcePolicy(policyInput)
        : { resolution: null, profile: null };
      const codeOwnedResolution = contextBound.resolution
        ?? constrained.resolution ?? null;
      if (codeOwnedResolution !== null && !enabled.ordinary_aggregate.seeded) {
        return null;
      }
      const sourceRef = contextBound.profile?.source_basis_ref
        ?? constrained.profile?.source_basis_ref ?? null;
      const candidate = bindCommittedSourceIdentity(
        execution.candidate_context, sourceRef);
      if (candidate == null) return null;
      const estimatePolicy = finiteEstimatePolicy(constrained.profile);
      const objectiveContext = estimatePolicy == null
        ? enabled.objective_context
        : { ...enabled.objective_context, policy_refs: {
          ...enabled.objective_context.policy_refs,
          finite_source_initial_amount_estimate_policy: estimatePolicy
        } };
      return { ...enabled, party_id: partyId, scope_ref: scopeRef,
        objective_context: objectiveContext,
        execution_context: { ...execution, candidate_context: candidate },
        ordinary_authority: {
          context_bound_profile: contextBound.profile,
          constrained_resource_profile: constrained.profile
        }, code_owned_resolution: codeOwnedResolution };
    }
  });
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
function requiresFiniteResourceOwner(profile) {
  return profile?.schema === 'rus.items.context_bound_ordinary_profile.v2'
    && profile.version === 2
    && (profile.basis_kind === 'finite_source'
      || (['specialized_stock', 'armament'].includes(profile.profile_kind)
        && profile.condition_state === 'damaged'
        && profile.basis_kind === 'remnant'));
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
