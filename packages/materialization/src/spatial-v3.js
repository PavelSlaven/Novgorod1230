import { copy, digest, endpoint, exactSlots, failure, freeze, same, sameVersioned, sealed, text, validCandidate, validCatalog, validEndpointBindings, validLockedFrontier, validPins, validReservation, validateSceneTopology, versioned } from './spatial-v3-validation.js';

// Kept during the target-only migration so the P08 public-surface contract
// remains independently fail-closed until a caller deliberately uses P20 APIs.
export { createTopologyProposalValidator } from './spatial-v3-ports.js';

/** S1 formal topology stays code-owned; P16 only persists these row templates. */
export function materializeS1FormalSpatialProposal({ party_id, request_id, local_ref, kind,
  structural_variant, baseline_ref, g5_ref, position_ref }) {
  if (!text(party_id) || !text(request_id) || !text(local_ref)
      || !['ordinary_structure', 'local_natural_feature'].includes(kind)
      || !['open_one_space', 'descriptive_local_reference'].includes(structural_variant)
      || !text(baseline_ref) || !text(g5_ref) || !text(position_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_formal_spatial_refs' });
  }
  const base = `s1:${party_id}:${request_id}`;
  const structural = structural_variant === 'open_one_space';
  const refs = {
    schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized', structural_variant,
    local_ref, placement_ref: `${kind}:${local_ref}`,
    g6_instance_ref: structural ? `${base}:g6` : null,
    position_ref: structural ? `${base}:position` : null, portal_ref: null,
    movement_edge_refs: structural ? [`${base}:edge:out`, `${base}:edge:back`] : [],
    visibility_link_refs: structural
      ? [`${base}:edge:out:visible`, `${base}:edge:back:visible`] : [] };
  const placement = (position_node_id) => ({ target_table: 'entity_placements', id: refs.placement_ref,
    record: { entity_kind: kind, entity_id: local_ref, placement_kind: 'scene_position',
      position_node_id, host_entity_ref: null, occupies_capacity_units: 0,
      visibility_modifier_ref: null, interaction_profile_ref: null, state_version: 0 } });
  if (!structural) return freeze({ ok: true, proposal: {
    schema: 'rus.s1_formal_spatial_proposal.v1', refs, rows: [placement(position_ref)] } });
  const rows = [
    { target_table: 'party_g6_instances', id: refs.g6_instance_ref,
      record: { id: refs.g6_instance_ref, scene_baseline_id: baseline_ref,
        source_scene_template_ref: { entity_id: refs.g6_instance_ref }, scene_slot_key: refs.g6_instance_ref,
        enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: g5_ref,
        physical_class_id: 'ordinary', primary_scene_role_id: 'ordinary_local',
        vertical_context_id: 'ground', overhead_cover_id: 'none',
        intra_g6_visibility_mode: 'default_clear', default_visibility_distance_band: 'near',
        acoustic_uniformity: 'uniform', status: 'active', state_version: 0 } },
    { target_table: 'scene_position_nodes', id: refs.position_ref,
      record: { id: refs.position_ref, g6_instance_id: refs.g6_instance_ref,
        position_type_id: 'ordinary_local', template_slot_key: refs.position_ref,
        template_instance_ordinal: 0, stable_basis_ref: null, capacity: 1,
        access_class_id: 'public', light_profile_ref: null, hazard_profile_ref: null,
        status: 'active', state_version: 0 } }
  ];
  for (const [id, from, to, reverse] of [[refs.movement_edge_refs[0], position_ref,
    refs.position_ref, refs.movement_edge_refs[1]], [refs.movement_edge_refs[1], refs.position_ref,
    position_ref, refs.movement_edge_refs[0]]]) rows.push({ target_table: 'scene_movement_edges', id,
    record: { id, scene_baseline_id: baseline_ref, source_scene_template_ref: { entity_id: id },
      source_edge_slot_key: id, from_position_id: from, to_position_id: to,
      passage_type_id: 'passage.local', transition_environment_profile_ref: { entity_ref: {
        entity_kind: 'transition_environment_profile', entity_id: 'env.local_variable' }, authoring_version: '1' },
      movement_orientation_profile_ref: { entity_ref: { entity_kind: 'movement_orientation_profile',
        entity_id: 'orientation.topological_local' }, authoring_version: '1' }, cost_kind: 'action',
      action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
      base_minutes: null, dynamic_recheck_policy_ref: null, capacity: 1, portal_entity_id: null,
      availability_condition_set_ref: null, reverse_edge_id: reverse, status: 'active', state_version: 0 } });
  for (const [id, from, to, reverse] of [[refs.visibility_link_refs[0], position_ref,
    refs.position_ref, refs.visibility_link_refs[1]], [refs.visibility_link_refs[1], refs.position_ref,
    position_ref, refs.visibility_link_refs[0]]]) rows.push({ target_table: 'visibility_links', id,
    record: { id, scene_baseline_id: baseline_ref, source_scene_template_ref: { entity_id: id },
      source_link_slot_key: id, from_position_id: from, to_position_id: to, quality: 'clear',
      distance_band: 'near', portal_entity_id: null, condition_profile_ref: null,
      reverse_link_id: reverse, status: 'active', state_version: 0 } });
  return freeze({ ok: true, proposal: { schema: 'rus.s1_formal_spatial_proposal.v1', refs,
    rows: [...rows, placement(position_ref)] } });
}


/**
 * P20-S01. The caller owns I/O. This adapter validates and freezes one exact
 * trigger snapshot; it has no DB, cache, time or global-state fallback.
 */
export function createSpatialContextLoader({ loadSnapshot } = {}) {
  if (typeof loadSnapshot !== 'function') throw new TypeError('P20 SpatialContextLoader requires loadSnapshot port.');
  async function load(request) {
    if (!request || typeof request !== 'object' || !text(request.party_id) || !text(request.trigger_id) || !validPins(request.dependency_pins) || !versioned(request.catalog_bundle_ref) || !text(request.expected_catalog_kind) || !sealed(request)) return failure('generated_schema_mismatch', request, { stage: 'context_loader', reason: 'request must be sealed with party, trigger, catalog ref and dependency pins' });
    const loaded = await loadSnapshot(freeze(request));
    const snapshot = loaded?.snapshot ?? loaded;
    if (!loaded?.ok || !snapshot || !sealed(snapshot) || !validPins(snapshot.dependency_pins) || !same(snapshot.dependency_pins, request.dependency_pins)
      || snapshot.party_id !== request.party_id || snapshot.trigger_id !== request.trigger_id || snapshot.request_digest !== request.canonical_digest
      || !sealed(snapshot.catalog_bundle) || snapshot.catalog_bundle.kind !== request.expected_catalog_kind
      || !sameVersioned(snapshot.catalog_bundle_ref, request.catalog_bundle_ref) || !same(snapshot.catalog_bundle.dependency_pins, request.dependency_pins)
      || snapshot.catalog_bundle.canonical_digest !== snapshot.catalog_digest) return failure('route_plan_snapshot_missing', request, { stage: 'context_loader', reason: 'port did not return the exact sealed catalog-bound trigger snapshot' });
    return freeze({ ok: true, snapshot });
  }
  return Object.freeze({ load });
}

/** P20-S02. Emits a stable scene baseline proposal only; it never commits. */
export function createSceneMaterializer() {
  function materialize(context) {
    if (!context || typeof context !== 'object' || !sealed(context) || !validPins(context.dependency_pins) || !text(context.party_id) || !text(context.scene_host_ref?.entity_kind) || !text(context.scene_host_ref?.entity_id) || !versioned(context.scene_profile_ref) || !versioned(context.scene_template_ref) || !validCatalog(context) || !text(context.materializer_version) || !text(context.idempotency_key)) return failure('generated_schema_mismatch', context, { stage: 'scene_materializer', reason: 'sealed catalog-bound host/profile/template context is required' });
    const slots = exactSlots(context.required_slots);
    if (!slots || !validateSceneTopology(context, slots)) return failure('scene_endpoint_slot_ambiguous', context, { stage: 'scene_materializer', reason: 'every required slot and G6 relation must resolve exactly from the approved catalog' });
    if (context.existing_baseline) {
      const baseline = context.existing_baseline;
      if (!sealed(baseline) || baseline.kind !== 'scene_baseline_proposal' || baseline.party_id !== context.party_id || !same(baseline.scene_host_ref, context.scene_host_ref) || !sameVersioned(baseline.scene_profile_ref, context.scene_profile_ref) || !sameVersioned(baseline.scene_template_ref, context.scene_template_ref) || baseline.catalog_digest !== context.catalog_digest || baseline.materializer_version !== context.materializer_version || baseline.source_kind !== context.source_kind || baseline.idempotency_key !== context.idempotency_key || !same(baseline.dependency_pins, context.dependency_pins) || !same(baseline.slots, slots) || !same(baseline.g6, context.g6 ?? []) || !same(baseline.relations, context.relations ?? []) || !same(baseline.dynamic_slots, context.dynamic_slots ?? [])) return failure('route_plan_snapshot_missing', context, { stage: 'scene_materializer', reason: 'existing baseline violates exact catalog/template/pin/identity/scene parity' });
      return freeze({ ok: true, reused: true, proposal: context.existing_baseline });
    }
    const baseline = { kind: 'scene_baseline_proposal', party_id: context.party_id, scene_host_ref: context.scene_host_ref, scene_profile_ref: context.scene_profile_ref, scene_template_ref: context.scene_template_ref, materializer_version: context.materializer_version, catalog_digest: context.catalog_digest, source_kind: context.source_kind, dependency_pins: context.dependency_pins, slots, g6: copy(context.g6 ?? []), relations: copy(context.relations ?? []), dynamic_slots: copy(context.dynamic_slots ?? []), idempotency_key: context.idempotency_key };
    return freeze({ ok: true, reused: false, proposal: { ...baseline, canonical_digest: digest(baseline) } });
  }
  return Object.freeze({ materialize });
}

/** P20-S03. Resolves topology under an already supplied lock/capacity snapshot. */
export function createFrontierTopologyResolver({ selectTemplate, acquireExclusiveReservation } = {}) {
  if (typeof selectTemplate !== 'function' || typeof acquireExclusiveReservation !== 'function') throw new TypeError('P20 frontier resolver requires selectTemplate and acquireExclusiveReservation ports.');
  async function resolve(context) {
    if (!context || typeof context !== 'object' || !sealed(context) || !validPins(context.dependency_pins) || !text(context.party_id) || !text(context.frontier?.id) || !Number.isInteger(context.frontier?.state_version) || !validLockedFrontier(context.locked, context) || !context.capacity || !Number.isInteger(context.capacity.committed_residual_capacity) || !Number.isInteger(context.capacity.reservable_residual_capacity)) return failure('generated_schema_mismatch', context, { stage: 'frontier', reason: 'sealed versioned frontier lock/lease and capacity snapshot are required' });
    const { frontier, capacity } = context;
    if (capacity.committed_residual_capacity < 0 || capacity.reservable_residual_capacity < 0) return failure('continuation_capacity_violation', context, { stage: 'frontier', reason: 'capacity cannot be negative' });
    const terminal = frontier.slot_role === 'through' ? frontier.ordinal === frontier.terminal_ordinal : capacity.committed_residual_capacity === 0;
    if (frontier.slot_role === 'through' && frontier.ordinal > frontier.terminal_ordinal) return failure('continuation_terminal_ordinal_invalid', context, { stage: 'frontier' });
    if (!terminal && capacity.committed_residual_capacity > 0 && capacity.reservable_residual_capacity === 0) return freeze({ ok: true, status: 'temporarily_blocked', proposal: null, blocking_reason: 'expansion_capacity_temporarily_reserved' });
    if (terminal) {
      const terminalResolution = context.terminal_resolution;
      const physical = terminalResolution?.kind === 'physical_boundary';
      const connection = ['connect_existing', 'world_route_exit'].includes(terminalResolution?.kind);
      if (!sealed(terminalResolution) || !(physical || connection) || !text(terminalResolution.owner_ref?.entity_kind) || !text(terminalResolution.owner_ref?.entity_id)
        || (physical && (!same(terminalResolution.owner_ref, context.scene_host_ref) || terminalResolution.endpoint_bindings?.length))
        || (connection && (!endpoint(terminalResolution.target_endpoint_ref) || !validEndpointBindings(terminalResolution.endpoint_bindings, context)
          || terminalResolution.endpoint_bindings.some((binding) => binding.endpoint_ref.endpoint_id !== terminalResolution.target_endpoint_ref.endpoint_id && binding.role === 'arrival')))) return failure('terminal_target_gap', context, { stage: 'frontier', reason: 'terminal target must have exact compatible owner and both endpoint bindings' });
      const proposal = { kind: 'frontier_terminal_proposal', party_id: context.party_id, frontier_id: frontier.id, expected_frontier_state_version: frontier.state_version, terminal_resolution: terminalResolution, dependency_pins: context.dependency_pins, idempotency_key: context.idempotency_key, moves_traveller: false, advances_time: false };
      return freeze({ ok: true, status: 'proposal', proposal: { ...proposal, canonical_digest: digest(proposal) } });
    }
    if (!Array.isArray(context.approved_candidates) || !context.approved_candidates.length || !context.approved_candidates.every(validCandidate)) return failure('spatial_candidate_gap', context, { stage: 'frontier', reason: 'positive capacity needs a sealed non-empty approved candidate set' });
    const reservationRequest = context.reservation_request;
    if (!sealed(reservationRequest) || reservationRequest.party_id !== context.party_id || reservationRequest.frontier_id !== frontier.id || reservationRequest.requested_units !== 1 || reservationRequest.idempotency_key !== context.idempotency_key || reservationRequest.frontier_state_version !== frontier.state_version || reservationRequest.capacity_snapshot_digest !== digest(context.capacity) || reservationRequest.lock_id !== context.locked.lock_id || reservationRequest.lock_digest !== context.locked.canonical_digest || reservationRequest.lock_lease_expires_at !== context.locked.lease_expires_at) return failure('expansion_reservation_conflict', context, { stage: 'frontier', reason: 'sealed one-unit reservation request must bind the exact lock/version/lease/capacity snapshot' });
    const claimed = await acquireExclusiveReservation(freeze({ reservation_request: reservationRequest, locked: copy(context.locked), dependency_pins: copy(context.dependency_pins) }));
    const reservation = claimed?.reservation ?? claimed;
    if (!claimed?.ok || !validReservation(reservation, context)) return failure('expansion_reservation_conflict', context, { stage: 'frontier', reason: 'exclusive reservation was not acquired under the supplied lock/version/expiry' });
    const candidate = await selectTemplate(freeze({ frontier: copy(frontier), candidates: copy(context.approved_candidates), reservation: copy(reservation), dependency_pins: copy(context.dependency_pins) }));
    const selected = context.approved_candidates.find((entry) => entry.candidate_id === candidate?.selected_candidate_id);
    if (!candidate?.ok || !sealed(candidate) || !selected || !sameVersioned(candidate.selected_template_ref, selected.template_ref) || candidate.candidate_set_digest !== digest(context.approved_candidates)) return failure('spatial_candidate_gap', context, { stage: 'frontier', reason: 'selection must name one member of the exact approved finite candidate set' });
    const successor = context.successor_rule;
    const departure = successor?.endpoint_bindings?.find((binding) => binding.role === 'departure'); const arrival = successor?.endpoint_bindings?.find((binding) => binding.role === 'arrival');
    if (!sealed(successor) || successor.source_frontier_id !== frontier.id || !text(successor.successor_frontier_id) || !endpoint(successor.source_endpoint_ref) || !endpoint(successor.successor_endpoint_ref) || !validEndpointBindings(successor.endpoint_bindings, context) || successor.endpoint_bindings.some((binding) => binding.role === 'departure' && binding.endpoint_ref.endpoint_id !== successor.source_endpoint_ref.endpoint_id) || successor.endpoint_bindings.some((binding) => binding.role === 'arrival' && binding.endpoint_ref.endpoint_id !== successor.successor_endpoint_ref.endpoint_id) || !text(successor.generated_site_id) || selected.generated_site_id !== successor.generated_site_id || departure?.scene_host_ref?.entity_id !== successor.generated_site_id || !text(successor.target_projection_host_ref?.entity_id) || arrival?.scene_host_ref?.entity_id !== successor.target_projection_host_ref.entity_id || arrival?.endpoint_scene_host_ref?.entity_id !== successor.target_projection_host_ref.entity_id) return failure('continuation_capacity_violation', context, { stage: 'frontier', reason: 'successor must bind selected generated source site and exact target projection/scene hosts' });
    const proposal = { kind: 'frontier_generation_proposal', party_id: context.party_id, frontier_id: frontier.id, expected_frontier_state_version: frontier.state_version, reservation: copy(reservation), selected_candidate_id: selected.candidate_id, selected_template_ref: selected.template_ref, selection_digest: candidate.canonical_digest, successor_frontier_id: successor.successor_frontier_id, successor: copy(successor), dependency_pins: context.dependency_pins, idempotency_key: context.idempotency_key, moves_traveller: false, advances_time: false };
    return freeze({ ok: true, status: 'proposal', proposal: { ...proposal, canonical_digest: digest(proposal) } });
  }
  return Object.freeze({ resolve });
}

/** P20-S04. Preparation reuses immutable baselines and returns no opaque token. */
export function createTargetPreparationService({ materializeScene, readSnapshot, claimPreparation, writeSnapshot, releasePreparation } = {}) {
  if (typeof materializeScene !== 'function' || typeof readSnapshot !== 'function' || typeof claimPreparation !== 'function' || typeof writeSnapshot !== 'function' || typeof releasePreparation !== 'function') throw new TypeError('P20 preparation requires materialize/read/claim/write/release ports.');
  async function prepare(context) {
    if (!context || typeof context !== 'object' || !sealed(context) || !validPins(context.dependency_pins) || !text(context.party_id) || !text(context.request_id) || !text(context.request_digest) || !text(context.idempotency_key) || !Array.isArray(context.members) || !context.members.length) return failure('generated_schema_mismatch', context, { stage: 'preparation', reason: 'sealed request, digest, idempotency and non-empty members are required' });
    const existing = await readSnapshot(freeze({ party_id: context.party_id, request_id: context.request_id, request_digest: context.request_digest, idempotency_key: context.idempotency_key, dependency_pins: context.dependency_pins }));
    if (existing?.ok && existing.snapshot) {
      const snapshot = existing.snapshot;
      if (!sealed(snapshot) || snapshot.party_id !== context.party_id || snapshot.request_id !== context.request_id || snapshot.request_digest !== context.request_digest || snapshot.idempotency_key !== context.idempotency_key || !same(snapshot.dependency_pins, context.dependency_pins)) return failure('target_preparation_failed', context, { stage: 'preparation', reason: 're-query snapshot identity/pins mismatch' });
      return freeze({ ok: true, reused: true, snapshot });
    }
    if (existing?.ok === false && existing.code && existing.code !== 'not_found') return failure('target_preparation_failed', context, { stage: 'preparation', reason: 'snapshot read rejected' });
    const claimResult = await claimPreparation(freeze({ party_id: context.party_id, request_id: context.request_id, request_digest: context.request_digest, idempotency_key: context.idempotency_key, dependency_pins: context.dependency_pins }));
    const claim = claimResult?.claim ?? claimResult;
    if (!claimResult?.ok || !sealed(claim) || claim.party_id !== context.party_id || claim.request_id !== context.request_id || claim.idempotency_key !== context.idempotency_key || !['reusable', 'execution_exclusive'].includes(claim.share_mode) || !Number.isInteger(claim.state_version) || claim.state_version < 1) return failure('preparation_claim_conflict', context, { stage: 'preparation', reason: 'sealed idempotent preparation claim is required' });
    const abort = async (reason, details = {}) => {
      const released = await releasePreparation(freeze({ claim, party_id: context.party_id, request_id: context.request_id, idempotency_key: context.idempotency_key, reason, dependency_pins: context.dependency_pins }));
      if (!released?.ok) return failure('preparation_claim_conflict', context, { stage: 'preparation', reason: 'claim release failed', ...details });
      return failure('target_preparation_failed', context, { stage: 'preparation', reason, ...details });
    };
    try {
      const keys = new Set(); const members = [];
      for (const member of context.members) {
        if (!sealed(member) || !['endpoint', 'transfer_scene'].includes(member.kind) || !text(member.member_id) || !text(member.dependency_digest) || keys.has(`${member.kind}:${member.dependency_digest}`) || !['reusable', 'execution_exclusive'].includes(member.share_mode)) return await abort('members must be unique sealed endpoint/transfer scenes');
        keys.add(`${member.kind}:${member.dependency_digest}`);
        const result = await materializeScene(freeze(member.scene_context));
        if (!result?.ok || !sealed(result.proposal)) return await abort('scene materialization failed', { member_id: member.member_id });
        members.push({ kind: member.kind, member_id: member.member_id, dependency_digest: member.dependency_digest, share_mode: member.share_mode, baseline_proposal_digest: result.proposal.canonical_digest, proposal: result.proposal });
      }
      const snapshot = { kind: 'target_preparation_snapshot', id: context.snapshot_id ?? `preparation:${context.request_id}`, party_id: context.party_id, request_id: context.request_id, request_digest: context.request_digest, dependency_pins: context.dependency_pins, members, claim_id: claim.id, idempotency_key: context.idempotency_key, moves_traveller: false, advances_time: false };
      const sealedSnapshot = { ...snapshot, canonical_digest: digest(snapshot) };
      const written = await writeSnapshot(freeze({ snapshot: sealedSnapshot, claim, dependency_pins: context.dependency_pins }));
      if (!written?.ok || !sealed(written.snapshot) || !same(written.snapshot, sealedSnapshot)) return await abort('atomic snapshot write did not preserve the sealed proposal');
      return freeze({ ok: true, reused: false, snapshot: written.snapshot });
    } catch (error) {
      return await abort('preparation port threw', { error_name: error?.name ?? 'Error' });
    }
  }
  return Object.freeze({ prepare });
}

/** P20-S05. Domains submit proposals; composition never fills a missing slot. */
export function createCrossDomainProposalComposer() {
  function compose(context) {
    if (!context || typeof context !== 'object' || !sealed(context) || !validPins(context.dependency_pins) || !text(context.party_id) || !text(context.idempotency_key) || !sealed(context.spatial_proposal) || context.spatial_proposal.party_id !== context.party_id || context.spatial_proposal.idempotency_key !== context.idempotency_key || !same(context.spatial_proposal.dependency_pins, context.dependency_pins) || !Array.isArray(context.spatial_proposal.slots) || !Array.isArray(context.required_slots)) return failure('generated_schema_mismatch', context, { stage: 'composition' });
    const proposals = [context.spatial_proposal];
    for (const domain of ['npc', 'item', 'container', 'property']) {
      const required = context.required_slots.filter((slot) => slot.domain === domain);
      const proposal = context.domain_proposals?.[domain];
      if (required.length && (!sealed(proposal) || proposal.domain !== domain || proposal.party_id !== context.party_id || proposal.idempotency_key !== context.idempotency_key || !same(proposal.dependency_pins, context.dependency_pins) || !Array.isArray(proposal.placements) || required.some((slot) => {
        const spatial = context.spatial_proposal.slots.find((item) => item.slot_key === slot.spatial_slot_key);
        const placement = proposal.placements.find((item) => item.slot_key === slot.slot_key);
        return !spatial || !placement || placement.position_id !== spatial.position_id || placement.g6_id !== spatial.g6_id;
      }))) return failure('spatial_candidate_gap', context, { stage: 'composition', domain, reason: 'required domain slot must target its exact resolved spatial position/G6' });
      if (proposal) proposals.push(proposal);
    }
    const proposal_digests = proposals.map((proposal) => proposal.canonical_digest);
    const combined = { kind: 'combined_materialization_proposal', party_id: context.party_id, dependency_pins: context.dependency_pins, proposal_digests, proposals, idempotency_key: context.idempotency_key, moves_traveller: false, advances_time: false };
    return freeze({ ok: true, proposal: { ...combined, canonical_digest: digest(combined) } });
  }
  return Object.freeze({ compose });
}
