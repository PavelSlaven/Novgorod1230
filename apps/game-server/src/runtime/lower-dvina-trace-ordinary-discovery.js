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
    const enabled = await loadEnablement({ partyId, scopeRef });
    if (enabled == null) return ordinaryNoop(request);
    const execution = enabled.execution_context;
    if (!validExecution(execution) || execution.candidate_context.target_ref
      !== request.operation.target_refs[0]) return ordinaryNoop(request);
    const rootId = request.request?.root_turn_id;
    if (typeof rootId !== 'string' || !rootId) return ordinaryNoop(request);
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
    const candidate = candidateForDiscovery({
      candidateContext: execution.candidate_context,
      query: request.operation.query
    });
    const envelope = buildOrdinaryMaterializationPresenceRequest({
      objective_context: { ...enabled.objective_context,
        request_id: `${rootId}:ordinary:presence`,
        ordinary_state_version: projection.ordinary_aggregate.state_version,
        ordinary_state: ordinaryState(projection.ordinary_aggregate),
        property_placement_context: enabled.property_placement_context },
      candidate_context: candidate
    });
    const bases = [
      ...structuredClone(execution.supporting_bases),
      ...structuredClone(newBases)
    ];
    const presence = await resolveOrdinaryMaterializationPresence({ envelope,
      ordinaryMaterializationModel, workingProjection: projection,
      basisCatalog: admissionBases(bases) });
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
      const sources = [envelope.identity.candidate_key, envelope.identity.coverage_key,
        proposed.supporting_basis_ref, ...proposed.causal_basis.basis_refs,
        proposed.property_basis_ref, proposed.placement_proposal.position_ref,
        execution.mechanics_policy.policy_ref, property.evidence.property_source_ref,
        property.evidence.property_catalog_version_ref,
        property.evidence.placement_catalog_version_ref,
        property.evidence.placement_context_ref,
        property.evidence.property_placement_context_digest,
        ...(property.evidence.unowned_cause_ref === null ? [] : [property.evidence.unowned_cause_ref])]
        .filter(Boolean).sort();
      const admitted = admitOrdinaryWorldMaterialization({ handoff:
        presence.pending_items_property_admission, admission_context: {
          schema: 'rus.items.ordinary_world_admission_context.v3', version: 3,
          supporting_bases: bases, property_placement_input: propertyInput,
          mechanics_policy: execution.mechanics_policy, causal_identity: {
            request_id: envelope.request.request_id,
            candidate_key: envelope.identity.candidate_key,
            coverage_key: envelope.identity.coverage_key,
            context_version: envelope.identity.context_version,
            causal_ref: execution.causal_ref,
            source_refs: sources
          }
        } });
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
      property_basis_ref: proposal.property_basis_ref, position_ref:
        proposal.placement.position_ref, mechanics_policy_ref:
        proposal.runtime_item_mechanics_policy_ref, item_proposal: proposal,
      mechanics_snapshot: admitted.runtime_instance_mechanics_snapshot };
    }
    if (transition == null || next == null) return ordinaryNoop(request);
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
      item: structuredClone(item) });
    return Object.freeze({ working_projection: request.working_projection,
      write_fragments: [], summary: 'ordinary discovery resolved',
      player_response_boundary: true,
      ordinary_materialization_atomic_write_plan: plan });
  };
}

function ordinaryNoop(request) { return Object.freeze({
  working_projection: structuredClone(request?.working_projection ?? {}),
  write_fragments: [], summary: 'ordinary discovery unavailable',
  player_response_boundary: true
}); }
function currentG6(state, operation) {
  const id = state?.position?.g6_id ?? state?.position?.g6_ref;
  if (typeof id === 'string' && id.length) return { entity_kind: 'g6', entity_id: id };
  return null;
}
function ordinaryState(a) { return { seeded: a.seeded, density_band: a.density_band,
  remaining_identity_budget: a.remaining_identity_budget,
  background_groups: a.background_groups.map(({ group_ref }) => group_ref),
  presence_resolutions: a.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
  closed_observation_scopes: a.coverage_closures.map(({ coverage_key }) => coverage_key) }; }
function validExecution(v) { return v != null && typeof v === 'object'
  && Array.isArray(v.supporting_bases) && v.candidate_context != null
  && v.identity_budget != null && v.mechanics_policy != null
  && typeof v.causal_ref === 'string' && Array.isArray(v.source_refs)
  && typeof v.candidate_context.target_ref === 'string'; }
function preparedBasis(group) { return { basis_ref: group.group_ref,
  state: 'prepared_seed', scope_ref: structuredClone(group.scope_ref),
  prepared_seed_provenance: structuredClone(group.prepared_seed_provenance),
  functional_buckets: [group.functional_bucket],
  allowed_admission_classes: structuredClone(group.allowed_admission_classes) }; }

function admissionBases(bases) {
  return bases.map((basis) => ({ ...structuredClone(basis), policy: {
    functional_buckets: structuredClone(basis.functional_buckets),
    allowed_admission_classes: structuredClone(basis.allowed_admission_classes),
    permission_refs: []
  } }));
}

// Stage A is deliberately independent of the player action.  Stage B may use
// only a normalized discovery phrase to distinguish closed coverage records;
// it cannot change the authored category, admission class, or placement.
function candidateForDiscovery({ candidateContext, query }) {
  const { target_ref: targetRef, ...candidate } = candidateContext;
  const normalizedQuery = normalizeDiscoveryQuery(query);
  if (targetRef == null || normalizedQuery == null) return candidate;
  return {
    ...candidate,
    candidate_hint: normalizedQuery,
    coverage_ref: `${candidate.coverage_ref}:${normalizedQuery}`
  };
}

function normalizeDiscoveryQuery(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
  return normalized.length === 0 ? null : normalized;
}
function presenceTransition({ envelope, presence, aggregate, identityKey = null }) {
  if (!['materialize', 'absent', 'no_change', 'authority_required'].includes(presence.status)) return null;
  const { identity } = envelope;
  return { kind: 'resolve_presence', request_identity: envelope.request.request_id,
    expected_state_version: aggregate.state_version, resolution_ref:
    createOrdinaryResolutionRef({ scope_ref: envelope.request.scope_ref,
      candidate_key: identity.candidate_key, coverage_key: identity.coverage_key,
      context_version: identity.context_version, request_identity: envelope.request.request_id,
      policy_version: identity.policy_version }), candidate_key: identity.candidate_key,
    coverage_key: identity.coverage_key, category_key: identity.category_key,
    context_version: identity.context_version, resolution: presence.status,
    ...(identityKey == null ? {} : { identity_key: identityKey }) };
}
function basisDigest(supporting_bases) { return canonicalDigest({
  domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases
}); }
