import {
  applyOrdinaryAggregateTransition, canonicalDigest,
  createOrdinaryMaterializationWorkingProjection,
  createOrdinaryResolutionRef
} from '@rus/materialization';
import {
  admitOrdinaryWorldMaterialization, resolveOrdinaryWorldPropertyPlacement
} from '@rus/items-property';
import {
  resolveOrdinaryMaterializationPresence,
  resolveOrdinaryMaterializationSeedScope
} from '@rus/turn';
import {
  buildOrdinaryMaterializationPresenceRequest,
  buildOrdinaryMaterializationSeedScopeRequest
} from './ordinary-materialization-seed-request.js';
import {
  createOrdinaryMaterializationAtomicWritePlan
} from '../infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import {
  constrainedNaturalResourceFiniteInitialization,
  constrainedNaturalResourceFiniteTransition,
  resolveConstrainedNaturalResourcePolicy
} from './constrained-natural-resource-policy.js';
import { resolveContextBoundOrdinaryPolicy } from './context-bound-ordinary-policy.js';
import { snapshotOrdinaryMaterializationEnablement } from
  './ordinary-materialization-enablement-snapshot.js';
import { admissionBases, basisDigest, bindCommittedSourceIdentity, candidateForDiscovery,
  currentG6, ordinaryNoop, ordinaryState, presenceTransition, preparedBasis,
  validExecution } from './lower-dvina-trace-ordinary-discovery-internal.js';

// The resolver deliberately has no player text in its model inputs.  The
// operation merely selects the already installed G6 enablement scope.
export function createLowerDvinaTraceOrdinaryDiscoveryResolver({
  partyId, loadEnablement, ordinaryMaterializationModel, inputDigest
} = {}) {
  if (typeof loadEnablement !== 'function'
      || typeof ordinaryMaterializationModel !== 'function') {
    throw new TypeError('ordinary discovery requires enablement loader and model');
  }
  return async function resolve(request) {
    const scopeRef = currentG6(request?.committed_state, request?.operation);
    if (scopeRef == null) return ordinaryNoop(request);
    const enabled = snapshotOrdinaryMaterializationEnablement(await loadEnablement({ partyId, scopeRef }));
    if (enabled == null) return ordinaryNoop(request);
    const execution = enabled.execution_context;
    if (!validExecution(execution) || execution.candidate_context.target_ref
      !== request.operation.target_refs[0]) return ordinaryNoop(request);
    const rootId = request.request?.root_turn_id;
    if (typeof rootId !== 'string' || !rootId) return ordinaryNoop(request);
    let candidate = candidateForDiscovery({
      candidateContext: execution.candidate_context,
      query: request.operation.query
    });
    const contextBound = resolveContextBoundOrdinaryPolicy({
      objective_context: enabled.objective_context, execution_context: execution,
      candidate_context: candidate, scope_ref: scopeRef,
      property_placement_context: enabled.property_placement_context
    });
    const constrainedResource = contextBound.profile === null
      || requiresFiniteResourceOwner(contextBound.profile)
      ? resolveConstrainedNaturalResourcePolicy({
        objective_context: enabled.objective_context, execution_context: execution,
        candidate_context: candidate, scope_ref: scopeRef,
        property_placement_context: enabled.property_placement_context
      }) : { resolution: null, profile: null };
    // This gate is deliberately before Stage A as well: an unapproved source
    // is not a reason to ask a model to seed, estimate, or discover geology.
    if (contextBound.resolution !== null || constrainedResource.resolution !== null) return ordinaryNoop(request);
    candidate = bindCommittedSourceIdentity(candidate,
      contextBound.profile?.source_basis_ref
        ?? constrainedResource.profile?.source_basis_ref
        ?? null);
    if (candidate == null) return ordinaryNoop(request);
    const objective = { ...enabled.objective_context,
      request_id: `${rootId}:ordinary:seed` };
    const initial = createOrdinaryMaterializationWorkingProjection({
      ordinary_aggregate: enabled.ordinary_aggregate
    });
    let projection = initial;
    const transitions = [];
    let newBases = [];
    if (!enabled.ordinary_aggregate.seeded) {
      const seed = await resolveOrdinaryMaterializationSeedScope({
        request: buildOrdinaryMaterializationSeedScopeRequest({
          objective_context: objective
        }), ordinaryMaterializationModel, workingProjection: projection,
        basisCatalog: admissionBases(execution.supporting_bases),
        allowedDisclosurePolicyRefs: execution.allowed_disclosure_policy_refs,
        resolveIdentityBudget: async () => execution.identity_budget
      });
      if (seed.status !== 'seeded') return ordinaryNoop(request);
      transitions.push({ kind: 'seed', request_identity:
        objective.request_id, expected_state_version:
        projection.ordinary_aggregate.state_version, density_band:
        seed.decision.density_band, identity_budget:
        seed.identity_budget_resolution.identity_budget,
        background_groups: seed.prepared_background_groups });
      newBases = seed.prepared_background_groups.map(preparedBasis);
      projection = seed.working_projection;
    }
    const initialAmountChoices = constrainedResource.profile?.finite_source.lifecycle_state
      === 'uninitialized' ? constrainedResource.profile.finite_source.approved_initial_amounts
        .map(({ selection_ref }) => ({ schema: 'finite_source_initial_amount_choice_v1', selection_ref }))
      : null;
    const envelope = buildOrdinaryMaterializationPresenceRequest({
      objective_context: { ...enabled.objective_context,
        request_id: `${rootId}:ordinary:presence`,
        ordinary_state_version: projection.ordinary_aggregate.state_version,
        ordinary_state: ordinaryState(projection.ordinary_aggregate),
        property_placement_context: enabled.property_placement_context,
        ...(initialAmountChoices == null ? {} : { policy_refs: {
          ...enabled.objective_context.policy_refs,
          finite_source_initial_amount_choices: initialAmountChoices } }) },
      candidate_context: candidate
    });
    const bases = [
      ...structuredClone(execution.supporting_bases),
      ...structuredClone(newBases)
    ];
    const presence = await resolveOrdinaryMaterializationPresence({ envelope,
      ordinaryMaterializationModel, workingProjection: projection,
      basisCatalog: admissionBases(bases),
      codeOwnedResolution: constrainedResource.resolution });
    if (presence.status === 'already_resolved') return ordinaryNoop(request);
    let transition = presenceTransition({ envelope, presence, aggregate:
      projection.ordinary_aggregate });
    let item = null;
    let next = presence.working_projection?.ordinary_aggregate ?? null;
    if (presence.status === 'pending_items_property_admission') {
      const proposed = presence.pending_items_property_admission.proposed_item;
      const propertyInput = {
        ...enabled.property_placement_context,
        supporting_basis_ref: proposed.supporting_basis_ref,
        causal_basis_refs: proposed.causal_basis.basis_refs,
        requested_position_ref: proposed.placement_proposal.position_ref
      };
      const property = resolveOrdinaryWorldPropertyPlacement(propertyInput);
      if (!property.pass) return ordinaryNoop(request);
      const sourceCandidates = [envelope.identity.candidate_key, envelope.identity.coverage_key,
        proposed.supporting_basis_ref, ...proposed.causal_basis.basis_refs,
        proposed.property_basis_ref, proposed.placement_proposal.position_ref,
        ...envelope.request.policy_refs.context_bound_permission_refs,
        execution.mechanics_policy.policy_ref, property.evidence.property_source_ref,
        property.evidence.property_catalog_version_ref,
        property.evidence.placement_catalog_version_ref,
        property.evidence.placement_context_ref,
        property.evidence.property_placement_context_digest,
        ...(property.evidence.unowned_cause_ref === null ? [] : [property.evidence.unowned_cause_ref])]
        .filter(Boolean);
      const sources = [...new Set(sourceCandidates)].sort();
      const admissionContext = structuredClone({
          schema: 'rus.items.ordinary_world_admission_context.v3', version: 3,
          supporting_bases: bases, property_placement_input: propertyInput,
          approved_permission_refs: envelope.request.policy_refs.context_bound_permission_refs,
          mechanics_policy: execution.mechanics_policy, causal_identity: {
            request_id: envelope.request.request_id,
            candidate_key: envelope.identity.candidate_key,
            coverage_key: envelope.identity.coverage_key,
            context_version: envelope.identity.context_version,
            causal_ref: execution.causal_ref,
            source_refs: sources
          }
        });
      const pendingAdmission = contextBound.profile == null
        ? presence.pending_items_property_admission
        : { ...structuredClone(presence.pending_items_property_admission), admission_evidence: {
          ...structuredClone(presence.pending_items_property_admission.admission_evidence),
          condition_state: contextBound.profile.condition_state } };
      const admitted = admitOrdinaryWorldMaterialization({ handoff:
        pendingAdmission, admission_context: admissionContext });
      if (!admitted.pass) return ordinaryNoop(request);
      const identityKey = `ordinary_identity_${canonicalDigest({
        candidate_key: envelope.identity.candidate_key,
        coverage_key: envelope.identity.coverage_key,
        context_version: envelope.identity.context_version
      }).slice(0, 24)}`;
      transition = presenceTransition({ envelope, presence: { status:
        'materialize' }, aggregate: projection.ordinary_aggregate, identityKey });
      next = applyOrdinaryAggregateTransition({ aggregate:
        projection.ordinary_aggregate, transition });
      const proposal = admitted.proposal;
      item = { item_id: `ordinary_item_${canonicalDigest({ party_id: partyId,
        scope_ref: scopeRef, candidate_key: envelope.identity.candidate_key,
        coverage_key: envelope.identity.coverage_key,
        context_version: envelope.identity.context_version }).slice(0, 24)}`,
      candidate_key: envelope.identity.candidate_key, coverage_key:
        envelope.identity.coverage_key, context_version: envelope.identity.context_version,
      functional_bucket: envelope.identity.functional_bucket, admission_class:
        envelope.identity.admission_class, supporting_basis_ref:
      proposal.supporting_basis_ref, causal_basis_refs:
        presence.pending_items_property_admission.proposed_item.causal_basis.basis_refs,
      causal_basis_kind: proposal.causal_basis_kind,
      condition_state: proposal.condition_state ?? null,
      permission_refs: envelope.request.policy_refs.context_bound_permission_refs,
      property_basis_ref: proposal.property_basis_ref, position_ref:
        proposal.placement.position_ref, mechanics_policy_ref:
        proposal.runtime_item_mechanics_policy_ref, item_proposal: proposal,
      mechanics_snapshot: admitted.runtime_instance_mechanics_snapshot };
    }
    if (transition == null || next == null) return ordinaryNoop(request);
    const finiteInitialization = item == null || constrainedResource.profile == null
      || constrainedResource.profile.finite_source.lifecycle_state !== 'uninitialized' ? null
      : constrainedNaturalResourceFiniteInitialization({ profile: constrainedResource.profile,
        item, request_identity: envelope.request.request_id, selection_ref:
          presence.pending_items_property_admission?.proposed_item
            .finite_source_initial_amount_choice?.selection_ref });
    const finiteResourceTransition = finiteInitialization?.finite_resource_transition
      ?? (item == null || constrainedResource.profile == null ? null
      : constrainedNaturalResourceFiniteTransition({ profile: constrainedResource.profile,
        item, request_identity: envelope.request.request_id }));
    if (item != null && constrainedResource.profile != null
        && finiteResourceTransition == null) return ordinaryNoop(request);
    const allTransitions = [...transitions, transition];
    const expected = enabled.version_pins;
    const plan = createOrdinaryMaterializationAtomicWritePlan({ party_id: partyId,
      scope_ref: structuredClone(scopeRef), request_identity: envelope.request.request_id,
      input_digest: canonicalDigest({ inputDigest, request_id: envelope.request.request_id }),
      transition_digest: next.committed_request_fingerprints.at(-1).transition_digest,
      expected_versions: structuredClone(expected), expected_supporting_basis_catalog:
        structuredClone(execution.supporting_bases), new_prepared_bases: structuredClone(newBases),
      next_supporting_basis_catalog: structuredClone(bases),
      next_supporting_basis_catalog_version:
        expected.supporting_basis_catalog_version + (newBases.length ? 1 : 0),
      next_supporting_basis_catalog_digest: basisDigest(bases),
      expected_property_placement_context: structuredClone(enabled.property_placement_context),
      enablement_pin: { objective_digest: enabled.objective_digest, enabled: true },
      resolution: item == null ? presence.status : 'materialize',
      transitions: structuredClone(allTransitions), next_aggregate: structuredClone(next),
      item: structuredClone(item), ...(finiteResourceTransition == null ? {} : {
        finite_resource_transition: finiteResourceTransition,
        ...(finiteInitialization == null ? {} : {
          finite_resource_initialization: finiteInitialization.finite_resource_initialization }) }) });
    return Object.freeze({ working_projection: request.working_projection,
      write_fragments: [], summary: 'ordinary discovery resolved',
      player_response_boundary: true,
      ordinary_materialization_atomic_write_plan: plan });
  };
}

function requiresFiniteResourceOwner(profile) {
  return profile?.schema === 'rus.items.context_bound_ordinary_profile.v2'
    && profile.version === 2 && profile.profile_kind === 'specialized_stock'
    && profile.condition_state === 'damaged' && profile.basis_kind === 'remnant';
}
