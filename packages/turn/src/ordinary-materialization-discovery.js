import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  computeOrdinaryIdentityBudget,
  createOrdinaryResolutionRef
} from '@rus/materialization';
import {
  admitOrdinaryWorldMaterialization,
  resolveOrdinaryWorldPropertyPlacement
} from '@rus/items-property';
import { resolveOrdinaryMaterializationPresence,
  selectOrdinaryMaterializationSupportingBasis } from
  './ordinary-materialization-presence.js';
import { resolveOrdinaryMaterializationSeedScope } from
  './ordinary-materialization-seed.js';

/** Common O1 owner; callers supply only committed context/profile adapters. */
export function createOrdinaryMaterializationDiscoveryOwner({
  loadDiscoveryContext, ordinaryMaterializationModel, verifyStageBCutover,
  inputDigest, buildSeedRequest, buildPresenceRequest, sealAtomicWritePlan,
  resolveFiniteResourceEffects = () => null
} = {}) {
  const ports = { loadDiscoveryContext, ordinaryMaterializationModel,
    verifyStageBCutover, buildSeedRequest, buildPresenceRequest,
    sealAtomicWritePlan };
  if (Object.values(ports).some((port) => typeof port !== 'function')) {
    throw new TypeError('ordinary discovery owner requires all ports');
  }
  if (typeof resolveFiniteResourceEffects !== 'function') {
    throw new TypeError('ordinary finite-resource effect owner must be a function');
  }
  return async function resolve(request) {
    const enabled = await loadDiscoveryContext(request);
    if (enabled == null) return ordinaryNoop(request);
    const modelBudget = semanticModelCallBudget(ordinaryMaterializationModel);
    const { party_id: partyId, scope_ref: scopeRef } = enabled;
    const execution = enabled.execution_context;
    const rootId = request.request.root_turn_id;
    const runtimeAnchorId = request.committed_state?.position?.g5_anchor_id;
    if (typeof runtimeAnchorId !== 'string' || runtimeAnchorId.length === 0
        || runtimeAnchorId.trim() !== runtimeAnchorId) {
      return ordinaryNoop(request);
    }
    const objective = { ...enabled.objective_context,
      request_id: `${rootId}:ordinary:seed` };
    let projection = Object.freeze({ ordinary_materialization_aggregate:
      structuredClone(enabled.ordinary_aggregate) });
    const transitions = [];
    let newBases = [];
    if (!enabled.ordinary_aggregate.seeded) {
      const seed = await resolveOrdinaryMaterializationSeedScope({
        request: buildSeedRequest({ objective_context: objective,
          authority_context: seedAuthorityContext({ execution,
            objective: enabled.objective_context,
            scopeRef: enabled.ordinary_aggregate.scope_ref }) }),
        ordinaryMaterializationModel: modelBudget.invoke,
        repairAvailable: modelBudget.hasRemaining,
        workingProjection: projection,
        basisCatalog: admissionBases(execution.supporting_bases),
        allowedDisclosurePolicyRefs: execution.allowed_disclosure_policy_refs,
        resolveIdentityBudget: async ({ density_band, hard_technical_max }) =>
          computeOrdinaryIdentityBudget({ density_band,
            scope: enabled.ordinary_aggregate.scope_ref,
            function_refs: enabled.objective_context.context_refs.function_refs,
            request: null, policy: execution.density_policy,
            hard_technical_max })
      });
      if (seed.status !== 'seeded') return ordinaryNoop(request);
      transitions.push({ kind: 'seed', request_identity: objective.request_id,
        expected_state_version:
          projection.ordinary_materialization_aggregate.state_version,
        density_band: seed.decision.density_band,
        identity_budget: seed.identity_budget_resolution.identity_budget,
        background_groups: seed.prepared_background_groups });
      newBases = seed.prepared_background_groups.map(preparedBasis);
      projection = seed.working_projection;
    }
    const bases = [...structuredClone(enabled.expected_supporting_bases
        ?? execution.supporting_bases),
      ...structuredClone(newBases)].sort((left, right) =>
      left.basis_ref.localeCompare(right.basis_ref));
    if (modelBudget.hasRemaining() === false
        && enabled.code_owned_resolution == null) {
      return resolvedPlan({ request, enabled, partyId, scopeRef,
        inputDigest, sealAtomicWritePlan, transitions, newBases, bases,
        next: projection.ordinary_materialization_aggregate,
        requestIdentity: objective.request_id, resolution: 'no_change' });
    }
    const presenceObjective = { ...enabled.objective_context,
      request_id: `${rootId}:ordinary:presence`,
      policy_refs: presencePolicyRefs({
        policyRefs: enabled.objective_context.policy_refs,
        bases,
        aggregate: projection.ordinary_materialization_aggregate,
        currentSeedRequestId: newBases.length === 0
          ? null : objective.request_id,
        currentPreparedRefs: new Set(newBases.map(({ basis_ref: ref }) => ref))
      }),
      ordinary_state_version:
        projection.ordinary_materialization_aggregate.state_version,
      ordinary_state: ordinaryState(
        projection.ordinary_materialization_aggregate),
      property_placement_context: enabled.property_placement_context };
    const candidateContext = candidateForDiscovery({
      candidateContext: execution.candidate_context,
      query: request.operation.query });
    if (candidateContext == null) return ordinaryNoop(request);
    const selectedSupportingBasisRef = selectOrdinaryMaterializationSupportingBasis({
      request: { scope_ref: presenceObjective.scope_ref,
        policy_refs: presenceObjective.policy_refs }, identity: candidateContext,
      basisCatalog: admissionBases(bases) });
    const envelope = buildPresenceRequest({ objective_context: presenceObjective,
      candidate_context: candidateContext,
      selected_supporting_basis_ref: selectedSupportingBasisRef });
    const presence = await resolveOrdinaryMaterializationPresence({ envelope,
      ordinaryMaterializationModel: modelBudget.invoke,
      repairAvailable: modelBudget.hasRemaining,
      workingProjection: projection,
      basisCatalog: admissionBases(bases), beforeModel: () =>
        verifyStageBCutover({
          eval_contract: execution.stage_b_classification_eval
        }), codeOwnedResolution: enabled.code_owned_resolution ?? null,
      mechanicsPolicy: execution.mechanics_policy });
    if (presence.status === 'already_resolved') return ordinaryNoop(request);
    if (presence.status === 'no_change' && presence.decision === null) {
      if (transitions.length === 0) return ordinaryNoop(request);
      return resolvedPlan({ request, enabled, partyId, scopeRef,
        inputDigest, sealAtomicWritePlan, transitions, newBases, bases,
        next: projection.ordinary_materialization_aggregate,
        requestIdentity: objective.request_id, resolution: 'no_change' });
    }
    let transition = presenceTransition({ envelope, presence, aggregate:
      projection.ordinary_materialization_aggregate });
    let item = null;
    let authorizedPresence = presence;
    let next = presence.working_projection?.ordinary_materialization_aggregate
      ?? null;
    if (presence.status === 'pending_items_property_admission') {
      const proposed = presence.pending_items_property_admission.proposed_item;
      if (proposed.property_basis_ref
          !== envelope.request.context_refs.property_context_ref) {
        return ordinaryNoop(request);
      }
      const propertyInput = { ...enabled.property_placement_context,
        supporting_basis_ref: proposed.supporting_basis_ref,
        causal_basis_refs: structuredClone(proposed.causal_basis.basis_refs),
        requested_position_ref: proposed.placement_proposal.position_ref };
      const property = resolveOrdinaryWorldPropertyPlacement(propertyInput);
      if (!property.pass) return ordinaryNoop(request);
      const authorityProfile = enabled.ordinary_authority?.context_bound_profile
        ?? enabled.ordinary_authority?.constrained_resource_profile ?? null;
      const baseHandoff = { ...structuredClone(
        presence.pending_items_property_admission), admission_evidence: {
        ...structuredClone(presence.pending_items_property_admission.admission_evidence),
        property_placement_context_digest:
          property.evidence.property_placement_context_digest,
        property_catalog_version_ref:
          property.evidence.property_catalog_version_ref,
        placement_catalog_version_ref:
          property.evidence.placement_catalog_version_ref } };
      const pendingHandoff = authorityProfile?.condition_state == null ? baseHandoff
        : { ...baseHandoff, admission_evidence: {
            ...baseHandoff.admission_evidence,
            condition_state: authorityProfile.condition_state
          } };
      authorizedPresence = { ...structuredClone(presence),
        pending_items_property_admission: pendingHandoff };
      const admissionInput = { handoff: pendingHandoff, admission_context: {
          schema: 'rus.items.ordinary_world_admission_context.v3', version: 3,
          supporting_bases: bases, property_placement_input: propertyInput,
          approved_permission_refs:
            structuredClone(envelope.request.policy_refs.context_bound_permission_refs),
          mechanics_policy: execution.mechanics_policy, causal_identity: {
            request_id: envelope.request.request_id,
            candidate_key: envelope.identity.candidate_key,
            coverage_key: envelope.identity.coverage_key,
            context_version: envelope.identity.context_version,
            causal_ref: execution.causal_ref,
            source_refs: sourceRefs({ envelope, proposed, execution, property,
              permissionRefs: pendingHandoff.admission_evidence.permission_refs })
          }, ...semanticIdentityProfile(authorityProfile)
        } };
      const admitted = admitOrdinaryWorldMaterialization(
        structuredClone(admissionInput));
      if (!admitted.pass) throw turnFailure(
        'TURN_ORDINARY_ITEM_ADMISSION_REJECTED',
        'Code-owned ordinary item admission rejected the model proposal.');
      const identityKey = `ordinary_identity_${canonicalDigest({
        candidate_key: envelope.identity.candidate_key,
        coverage_key: envelope.identity.coverage_key,
        context_version: envelope.identity.context_version
      }).slice(0, 24)}`;
      transition = presenceTransition({ envelope, presence: {
        status: 'materialize' }, aggregate:
        projection.ordinary_materialization_aggregate, identityKey });
      next = applyOrdinaryAggregateTransition({ aggregate:
        projection.ordinary_materialization_aggregate, transition });
      item = admittedItem({ partyId, scopeRef, envelope,
        presence: authorizedPresence, admitted,
        runtimeAnchorId, authorityProfile });
    }
    if (transition != null && next?.state_version ===
        projection.ordinary_materialization_aggregate.state_version) {
      next = applyOrdinaryAggregateTransition({ aggregate:
        projection.ordinary_materialization_aggregate, transition });
    }
    if (transition == null || next == null) return ordinaryNoop(request);
    const finiteResourceEffects = item == null ? null
      : resolveFiniteResourceEffects({ enabled, item, envelope,
        presence: authorizedPresence });
    if (item?.causal_basis_kind === 'finite_source'
        && finiteResourceEffects == null) return ordinaryNoop(request);
    return resolvedPlan({ request, enabled, partyId, scopeRef,
      inputDigest, sealAtomicWritePlan,
      transitions: [...transitions, transition], newBases, bases, next,
      requestIdentity: envelope.request.request_id,
      resolution: item == null ? presence.status : 'materialize', item,
      finiteResourceEffects });
  };
}

function seedAuthorityContext({ execution, objective, scopeRef }) {
  const mappings = execution.density_policy?.mappings ?? [];
  const matches = mappings.filter((entry) => entry?.scope_kind === scopeRef.entity_kind
    && (entry.function_ref === null
      || objective.context_refs.function_refs.includes(entry.function_ref)));
  const bands = matches.length === 1 ? Object.entries(matches[0].bands ?? {})
    .filter(([band, limit]) => ['sparse','ordinary','dense'].includes(band)
      && Number.isSafeInteger(limit) && limit >= 0)
    .map(([band]) => band) : [];
  return { stage: 'seed_scope', density_bands: bands,
    disclosure_policy_refs: structuredClone(
      execution.allowed_disclosure_policy_refs ?? []),
    group_bases: execution.supporting_bases.map((basis) => ({
      basis_ref: basis.basis_ref, basis_state: basis.state,
      functional_buckets: structuredClone(basis.functional_buckets),
      allowed_admission_classes: structuredClone(basis.allowed_admission_classes),
      permission_refs: structuredClone(basis.permission_refs ?? []) })) };
}

function semanticModelCallBudget(model) {
  let remaining = 2;
  return Object.freeze({
    hasRemaining: () => remaining > 0,
    invoke: async (request, context) => {
      if (remaining < 1) {
        throw new Error('ordinary materialization semantic-call budget exhausted');
      }
      remaining -= 1;
      return model(request, context);
    }
  });
}
function semanticIdentityProfile(profile) {
  const sensitive = ['currency_or_precious','document_like','other_restricted']
    .includes(profile?.admission_class);
  const constrained = profile?.schema
    === 'rus.items.constrained_natural_resource_profile.v1';
  if (!sensitive && !constrained) return {};
  return { semantic_identity_profile: {
    schema: 'rus.items.ordinary_world_semantic_identity_profile.v1', version: 1,
    profile_ref: profile.permission_refs?.[0]
      ?? profile.regional_permission_ref ?? profile.profile_ref,
    admission_class: profile.admission_class,
    semantic_type: profile.semantic_type, public_name: profile.public_name
  } };
}

function resolvedPlan({ request, enabled, partyId, scopeRef, inputDigest,
  sealAtomicWritePlan, transitions, newBases, bases, next, requestIdentity,
  resolution, item = null, finiteResourceEffects = null }) {
  const expected = enabled.version_pins;
  const plan = sealAtomicWritePlan({ party_id: partyId,
    scope_ref: structuredClone(scopeRef),
    semantic_target_ref: enabled.semantic_target_ref,
    request_identity: requestIdentity,
    input_digest: canonicalDigest({ inputDigest, request_id: requestIdentity }),
    transition_digest: canonicalDigest(transitions.at(-1)),
    expected_versions: structuredClone(expected),
    expected_supporting_basis_catalog:
      structuredClone(enabled.expected_supporting_bases
        ?? enabled.execution_context.supporting_bases),
    new_prepared_bases: structuredClone(newBases),
    next_supporting_basis_catalog: structuredClone(bases),
    next_supporting_basis_catalog_version:
      expected.supporting_basis_catalog_version + (newBases.length ? 1 : 0),
    next_supporting_basis_catalog_digest: basisDigest(bases),
    expected_property_placement_context:
      structuredClone(enabled.property_placement_context),
    enablement_pin: { objective_digest: enabled.objective_digest,
      enabled: true }, resolution, transitions: structuredClone(transitions),
    next_aggregate: structuredClone(next), item: structuredClone(item),
    ...(finiteResourceEffects == null ? {}
      : structuredClone(finiteResourceEffects)) });
  return Object.freeze({ working_projection: request.working_projection,
    write_fragments: [], summary: 'ordinary discovery resolved',
    duration_minutes: 0,
    player_response_boundary: item == null || request.plan?.continuation == null,
    ordinary_materialization_atomic_write_plan: plan });
}

function candidateForDiscovery({ candidateContext, query }) {
  const { target_ref: targetRef, candidate_ref_namespace: namespace,
    ...candidate } = candidateContext;
  const normalized = normalizeDiscoveryQuery(query);
  if (normalized == null || typeof targetRef !== 'string' || !targetRef
      || typeof namespace !== 'string' || !namespace) return null;
  return { ...candidate, normalized_candidate_ref:
    `${namespace}:${canonicalDigest({
      domain: 'rus.ordinary.discovery.query_candidate.v1',
      target_ref: targetRef, normalized_query: normalized
    }).slice(0, 32)}`, candidate_hint: normalized };
}
function normalizeDiscoveryQuery(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
  return normalized.length === 0 ? null : normalized;
}
function presenceTransition({ envelope, presence, aggregate,
  identityKey = null }) {
  if (!['materialize', 'absent', 'no_change', 'authority_required']
    .includes(presence.status)) return null;
  const { identity } = envelope;
  return { kind: 'resolve_presence',
    request_identity: envelope.request.request_id,
    expected_state_version: aggregate.state_version,
    resolution_ref: createOrdinaryResolutionRef({
      scope_ref: envelope.request.scope_ref,
      candidate_key: identity.candidate_key, coverage_key: identity.coverage_key,
      context_version: identity.context_version,
      request_identity: envelope.request.request_id,
      policy_version: identity.policy_version }),
    candidate_key: identity.candidate_key, coverage_key: identity.coverage_key,
    category_key: identity.category_key, context_version: identity.context_version,
    resolution: presence.status,
    ...(identityKey == null ? {} : { identity_key: identityKey }) };
}
function admittedItem({ partyId, scopeRef, envelope, presence, admitted,
  runtimeAnchorId, authorityProfile }) {
  const proposal = admitted.proposal;
  return { item_id: `ordinary_item_${canonicalDigest({ party_id: partyId,
    scope_ref: scopeRef, candidate_key: envelope.identity.candidate_key,
    coverage_key: envelope.identity.coverage_key,
    context_version: envelope.identity.context_version }).slice(0, 24)}`,
  candidate_key: envelope.identity.candidate_key,
  coverage_key: envelope.identity.coverage_key,
  context_version: envelope.identity.context_version,
  functional_bucket: envelope.identity.functional_bucket,
  admission_class: envelope.identity.admission_class,
  supporting_basis_ref: proposal.supporting_basis_ref,
  causal_basis_refs:
    presence.pending_items_property_admission.proposed_item.causal_basis.basis_refs,
  ...(proposal.causal_basis_kind == null ? {} : {
    causal_basis_kind: proposal.causal_basis_kind,
    ...(envelope.identity.availability_class === 'context_bound'
      ? { condition_state: proposal.condition_state ?? null } : {})
  }),
  ...(envelope.identity.availability_class === 'context_bound' ? {
    permission_refs: structuredClone(
      envelope.request.policy_refs.context_bound_permission_refs)
  } : {}),
  property_basis_ref: proposal.property_basis_ref,
  position_ref: proposal.placement.position_ref,
  runtime_placement: { anchor_id: runtimeAnchorId },
  mechanics_policy_ref: proposal.runtime_item_mechanics_policy_ref,
  ...(authorityProfile?.weapon_mechanics_snapshot == null ? {}
    : { weapon_mechanics_snapshot:
      structuredClone(authorityProfile.weapon_mechanics_snapshot) }),
  item_proposal: proposal,
  mechanics_snapshot: admitted.runtime_instance_mechanics_snapshot };
}
function sourceRefs({ envelope, proposed, execution, property, permissionRefs }) {
  return [...new Set([envelope.identity.candidate_key,
    envelope.identity.coverage_key,
    proposed.supporting_basis_ref, ...proposed.causal_basis.basis_refs,
    proposed.property_basis_ref, proposed.placement_proposal.position_ref,
    ...permissionRefs,
    execution.mechanics_policy.policy_ref, property.evidence.property_source_ref,
    property.evidence.property_catalog_version_ref,
    property.evidence.placement_catalog_version_ref,
    property.evidence.placement_context_ref,
    property.evidence.property_placement_context_digest,
    ...(property.evidence.unowned_cause_ref == null ? []
      : [property.evidence.unowned_cause_ref])].filter(Boolean))].sort();
}
function ordinaryNoop(request) { return Object.freeze({
  working_projection: structuredClone(request?.working_projection ?? {}),
  write_fragments: [], summary: 'ordinary discovery unavailable',
  duration_minutes: 0,
  player_response_boundary: true }); }
function ordinaryState(a) { return { seeded: a.seeded,
  density_band: a.density_band,
  remaining_identity_budget: a.remaining_identity_budget,
  background_groups: a.background_groups.map(({ group_ref }) => group_ref),
  presence_resolutions: a.presence_resolutions.map(({ resolution_ref }) =>
    resolution_ref),
  closed_observation_scopes: a.closed_observation_scopes.map(({ coverage_key }) =>
    coverage_key) }; }
function preparedBasis(group) { return { basis_ref: group.group_ref,
  state: 'prepared_seed', scope_ref: structuredClone(group.scope_ref),
  prepared_seed_provenance: structuredClone(group.prepared_seed_provenance),
  functional_buckets: [group.functional_bucket],
  allowed_admission_classes: structuredClone(group.allowed_admission_classes) }; }
function presencePolicyRefs({ policyRefs, bases, aggregate,
  currentSeedRequestId, currentPreparedRefs }) {
  const allowed = new Map(policyRefs.allowed_supporting_bases.map((entry) =>
    [entry.basis_ref, structuredClone(entry)]));
  for (const basis of bases) {
    if (basis.state !== 'prepared_seed') continue;
    const group = aggregate.background_groups.find(({ group_ref: ref }) =>
      ref === basis.basis_ref);
    const current = currentPreparedRefs.has(basis.basis_ref);
    if (!group || canonicalDigest({
      scope_ref: basis.scope_ref,
      prepared_seed_provenance: basis.prepared_seed_provenance,
      functional_buckets: basis.functional_buckets,
      allowed_admission_classes: basis.allowed_admission_classes
    }) !== canonicalDigest({
      scope_ref: group.scope_ref,
      prepared_seed_provenance: group.prepared_seed_provenance,
      functional_buckets: [group.functional_bucket],
      allowed_admission_classes: group.allowed_admission_classes
    }) || current && basis.prepared_seed_provenance.seed_request_id
        !== currentSeedRequestId) {
      throw new TypeError('prepared supporting basis is not bound to aggregate');
    }
    allowed.set(basis.basis_ref, {
      basis_ref: basis.basis_ref, basis_state: 'prepared_seed'
    });
  }
  return { ...structuredClone(policyRefs),
    allowed_supporting_bases: [...allowed.values()].sort((left, right) =>
      left.basis_ref.localeCompare(right.basis_ref)) };
}
function admissionBases(bases) { return bases.map((basis) => ({
  ...structuredClone(basis), policy: {
    functional_buckets: structuredClone(basis.functional_buckets),
    allowed_admission_classes:
      structuredClone(basis.allowed_admission_classes),
    permission_refs: structuredClone(basis.permission_refs ?? []) } })); }
function basisDigest(supporting_bases) { return canonicalDigest({
  domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases }); }
