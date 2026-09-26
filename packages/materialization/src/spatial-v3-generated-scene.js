import { digest, failure, freeze, text } from './spatial-v3-validation.js';

const ref = (id, version) => ({ entity_id: id, authoring_version: String(version) });
const optionalRef = (row, name) => row[`${name}_id`] == null ? null
  : ref(row[`${name}_id`], row[`${name}_version`]);
const clean = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null]));

/** Exact approved scene rows; no inferred topology, ambient default or database access. */
export function materializeSpatialV3GeneratedScene({ party_id, site_id, baseline_id,
  change_set_id, materializer_version, materialization_trace_id, generation_template,
  canonical_g5, scene_closure, acoustic_rows, dependency_pins } = {}) {
  const context = { dependency_pins, world_revision_id: scene_closure?.header?.world_revision_id };
  const reject = (reason) => failure('authoring_dependency_pin_missing', context,
    { stage: 'generated_scene', reason });
  const header = scene_closure?.header;
  const source = canonical_g5 ?? generation_template;
  if (![party_id, site_id, baseline_id, change_set_id, materializer_version,
    materialization_trace_id, source?.id].every(text)
    || header?.status !== 'approved' || !header.canonical_digest
    || !Number.isSafeInteger(source.version) || (canonical_g5 && generation_template)) return reject('exact_scene_identity_required');
  const g6 = scene_closure.g6_slots;
  const positions = scene_closure.position_slots;
  const endpoints = scene_closure.endpoint_slots;
  const movements = scene_closure.movement_edges ?? [];
  if (!Array.isArray(g6) || !g6.length || !Array.isArray(positions) || !positions.length
    || !Array.isArray(endpoints) || !endpoints.length || !Array.isArray(acoustic_rows)) {
    return reject('scene_and_acoustic_closure_required');
  }
  // These template classes need their existing specialized materializer. Never omit them.
  if (['portals', 'stable_structures', 'visibility_links', 'acoustic_edges']
    .some((table) => (scene_closure[table] ?? []).length)
    || g6.some((row) => row.enclosing_structure_slot_key != null)) {
    return reject('scene_relation_materializer_required');
  }
  const g6Ids = new Map(g6.map((row) => [row.scene_slot_key, `${baseline_id}:g6:${row.scene_slot_key}`]));
  const positionIds = new Map();
  if (g6Ids.size !== g6.length || g6.some((row) => !['scene_slot_key', 'physical_class_id',
    'primary_scene_role_id', 'vertical_context_id', 'overhead_cover_id', 'intra_g6_visibility_mode',
    'default_visibility_distance_band', 'acoustic_uniformity'].every((key) => text(row[key])))) {
    return reject('ambiguous_or_incomplete_g6_slot');
  }
  for (const row of positions) {
    if (!text(row.position_slot_key) || !g6Ids.has(row.g6_scene_slot_key)
      || !Number.isSafeInteger(row.instance_count) || row.instance_count < 1
      || positionIds.has(row.position_slot_key) || !text(row.position_type_id) || !text(row.access_class_id)
      || !Number.isSafeInteger(row.capacity) || row.capacity < 1) return reject('invalid_position_slot');
    positionIds.set(row.position_slot_key, Array.from({ length: row.instance_count }, (_, ordinal) =>
      `${baseline_id}:position:${row.position_slot_key}:${ordinal}`));
  }
  const endpointRows = endpoints.map((row) => ({ ...row,
    position_id: positionIds.get(row.required_position_slot_key)?.[row.required_position_instance_ordinal] }));
  if (endpointRows.some((row) => !row.position_id)
    || new Set(endpoints.map((row) => row.slot_key)).size !== endpoints.length) return reject('ambiguous_endpoint_slot');
  const movementIds = new Map(movements.map((row) => [row.edge_slot_key, `${baseline_id}:edge:${row.edge_slot_key}`]));
  if (movementIds.size !== movements.length || movements.some((row) =>
    positionIds.get(row.from_position_slot_key)?.length !== 1
    || positionIds.get(row.to_position_slot_key)?.length !== 1
    || row.portal_template_id != null || row.availability_condition_set_id != null
    || (row.reverse_edge_slot_key != null && !movementIds.has(row.reverse_edge_slot_key)))) {
    return reject('movement_endpoint_or_condition_binding_required');
  }
  const ambientBySlot = new Map();
  for (const scene of g6) {
    const matches = acoustic_rows.filter((row) => (canonical_g5
      ? row.canonical_g5_id === source.id && row.canonical_g5_version === source.version
      : row.g5_template_id === source.id && row.g5_template_version === source.version)
      && row.scene_template_id === header.id && row.scene_template_version === header.version
      && row.g6_scene_slot_key === scene.scene_slot_key);
    const row = matches[0];
    if (matches.length !== 1 || row.status !== 'approved'
      || row.world_revision_id !== header.world_revision_id || !row.canonical_digest
      || row.authoring_digest !== row.canonical_digest || ![0, 1, 2].includes(row.ambient_noise)) {
      return reject('approved_exact_g6_ambient_baseline_required');
    }
    ambientBySlot.set(scene.scene_slot_key, row.ambient_noise);
  }
  const write = (target_table, id, record) => ({ target_table, id, record: {
    party_id, ...record, state_version: 1, created_change_set_id: change_set_id,
    updated_change_set_id: change_set_id } });
  const templateRef = ref(header.id, header.version);
  const rows = [write('party_scene_baselines', baseline_id, {
    id: baseline_id, host_kind: 'g5_site', host_id: site_id,
    source_kind: canonical_g5 ? 'canonical_template' : 'generated_template',
    scene_template_ref: templateRef, materialization_trace_id, materializer_version,
    catalog_digest: header.canonical_digest, status: 'active' })];
  for (const scene of g6) {
    const id = g6Ids.get(scene.scene_slot_key);
    rows.push(write('party_g6_instances', id, { id, scene_baseline_id: baseline_id,
      source_scene_template_ref: templateRef, ...clean(scene, ['scene_slot_key', 'physical_class_id',
        'primary_scene_role_id', 'vertical_context_id', 'overhead_cover_id', 'intra_g6_visibility_mode',
        'default_visibility_distance_band', 'acoustic_uniformity']),
      enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: site_id, status: 'active' }));
    rows.push({ target_table: 'g6_acoustic_profiles', id, record: { party_id, g6_instance_id: id,
      ambient_noise: ambientBySlot.get(scene.scene_slot_key), acoustic_uniformity: scene.acoustic_uniformity,
      state_version: 1, updated_change_set_id: change_set_id } });
  }
  for (const position of positions) {
    for (const [ordinal, id] of positionIds.get(position.position_slot_key).entries()) {
      rows.push(write('scene_position_nodes', id, { id, g6_instance_id: g6Ids.get(position.g6_scene_slot_key),
        template_slot_key: position.position_slot_key, template_instance_ordinal: ordinal,
        ...clean(position, ['position_type_id', 'capacity', 'access_class_id']), status: 'active' }));
    }
  }
  for (const edge of movements) {
    const id = movementIds.get(edge.edge_slot_key);
    rows.push(write('scene_movement_edges', id, { id, scene_baseline_id: baseline_id,
      source_scene_template_ref: templateRef, source_edge_slot_key: edge.edge_slot_key,
      from_position_id: positionIds.get(edge.from_position_slot_key)[0],
      to_position_id: positionIds.get(edge.to_position_slot_key)[0],
      ...clean(edge, ['passage_type_id', 'cost_kind', 'action_units', 'baseline_movement_method_id',
        'base_minutes', 'capacity']),
      transition_environment_profile_ref: optionalRef(edge, 'transition_environment_profile'),
      movement_orientation_profile_ref: optionalRef(edge, 'movement_orientation_profile'),
      movement_method_cost_profile_ref: optionalRef(edge, 'movement_method_cost_profile'),
      dynamic_recheck_policy_ref: optionalRef(edge, 'dynamic_recheck_policy'),
      reverse_edge_id: movementIds.get(edge.reverse_edge_slot_key) ?? null, status: 'active' }));
  }
  const proposal = { kind: 'generated_scene_rows', party_id, site_id, baseline_id,
    scene_template_ref: templateRef, dependency_pins, rows, endpoints: endpointRows,
    acoustic_profile_refs: acoustic_rows.map((row) => ref(row.id, row.version)),
    moves_traveller: false, advances_time: false };
  return freeze({ ok: true, proposal: { ...proposal, canonical_digest: digest(proposal) } });
}

/** Expansion of one locked G4. All rows remain a proposal until the P16 commit. */
export function materializeSpatialV3Expansion({ party_id, change_set_id, closure, snapshot,
  selection, source, scene, candidate_ordinal, dependency_pins, now, terminal_target,
  terminal_writes = [], materialization_trace_id } = {}) {
  const context = { dependency_pins, world_revision_id: closure?.profile?.world_revision_id };
  const reject = (reason) => failure('authoring_dependency_pin_missing', context,
    { stage: 'generated_topology', reason });
  if (!selection?.ok || !snapshot || !source || !text(party_id) || !text(change_set_id)
    || !text(materialization_trace_id) || !Number.isSafeInteger(candidate_ordinal)
    || !Number.isFinite(now)) return reject('exact_expansion_context_required');
  const { slot, directional_exit: exit } = selection;
  const profile = closure.profile;
  const site = snapshot.sites.find((row) => row.id === source.site_id);
  const position = snapshot.scene_positions.find((row) => row.id === source.position_id);
  const g6 = snapshot.g6_instances.find((row) => row.id === position?.g6_instance_id);
  const baseline = snapshot.scene_baselines.find((row) => row.id === g6?.scene_baseline_id);
  if (!site || site.parent_g4_id !== slot.g4_id || site.status !== 'active'
    || !position || position.status !== 'active' || baseline?.host_id !== site.id
    || baseline.status !== 'active' || g6?.status !== 'active') return reject('committed_source_scene_required');
  const suffix = digest({ party_id, profile: ref(profile.id, profile.version), slot: ref(slot.id, slot.version) }).slice(7);
  const chainId = `expansion:${suffix}:chain`;
  const frontierId = `expansion:${suffix}:frontier:${candidate_ordinal}`;
  const frontier = snapshot.frontiers.find((row) => row.id === frontierId);
  const chain = snapshot.chains.find((row) => row.id === chainId);
  const binding = snapshot.bindings.find((row) => row.frontier_id === frontierId && row.status === 'active');
  if (candidate_ordinal === 0 && !frontier) {
    const entry = closure.entry_endpoint_bindings.find((row) => row.id === source.entry_binding?.id
      && row.version === source.entry_binding?.version);
    if (!entry || site.origin !== 'canonical' || site.canonical_g5_ref?.entity_id !== entry.canonical_g5_id
      || String(site.canonical_g5_ref?.authoring_version) !== String(entry.canonical_g5_version)
      || position.template_slot_key !== source.departure_position_slot_key
      || source.departure_endpoint_slot_key !== entry.departure_scene_endpoint_slot_key || chain) {
      return reject('approved_initial_entry_binding_required');
    }
  } else if (!frontier || frontier.status !== 'open' || frontier.source_g5_site_id !== site.id
    || frontier.continuation_ordinal !== candidate_ordinal || frontier.continuation_chain_id !== chainId
    || frontier.slot_ref?.entity_id !== slot.id || String(frontier.slot_ref?.authoring_version) !== String(slot.version)
    || !chain || chain.terminal_ordinal !== selection.terminal_ordinal || binding?.position_id !== position.id) {
    return reject('committed_frontier_binding_required');
  }
  const profiles = closure.connection_profiles ?? [];
  if (profiles.length !== 1 || profiles[0].status !== 'approved') return reject('exact_connection_profile_required');
  const mechanics = profiles[0];
  const terminal = selection.status === 'terminal';
  const arrival = terminal ? terminal_target : scene?.endpoints?.find((row) => ['arrival', 'both'].includes(row.endpoint_role));
  if (terminal && (!arrival || arrival.canonical_g5_id !== exit.exit_canonical_g5_id
    || arrival.canonical_g5_version !== exit.exit_canonical_g5_version
    || ![...snapshot.sites, ...terminal_writes.filter((row) => row.target_table === 'party_g5_sites').map((row) => row.record)]
      .some((row) => row.id === arrival.site_id && row.origin === 'canonical'
      && row.parent_g4_id === slot.g4_id && row.canonical_g5_ref?.entity_id === exit.exit_canonical_g5_id))) {
    return reject('prepared_canonical_terminal_endpoint_required');
  }
  if (!terminal && (!scene || scene.site_id !== `expansion:${suffix}:site:${candidate_ordinal}`
    || !arrival || scene.endpoints.filter((row) => ['arrival', 'both'].includes(row.endpoint_role)).length !== 1)) {
    return reject('exact_generated_scene_required');
  }
  const targetSite = terminal ? arrival.site_id : scene.site_id;
  const connectionId = `expansion:${suffix}:connection:${candidate_ordinal}`;
  const rows = [...terminal_writes]; const updates = []; const expected_state_versions = [];
  const write = (target_table, id, record) => ({ target_table, id, record: { party_id, ...record } });
  const update = (target_table, id, record, current) => {
    updates.push(write(target_table, id, record));
    expected_state_versions.push({ target_table, id, state_version: Number(current.state_version) });
  };
  const frontierRecord = { id: frontierId, g4_id: slot.g4_id, source_g5_site_id: site.id,
    slot_ref: ref(slot.id, slot.version), direction_context_id: slot.direction_context_id,
    continuation_chain_id: chainId, continuation_ordinal: candidate_ordinal,
    status: 'consumed', resolution_kind: terminal ? 'world_route_exit' : 'generated_site',
    resolved_site_connection_id: connectionId, resolved_boundary_entity_id: null,
    resolved_change_set_id: change_set_id };
  if (frontier) {
    update('expansion_frontiers', frontierId, frontierRecord, frontier);
    update('scene_frontier_bindings', binding.id, { id: binding.id, status: 'inactive',
      deactivated_change_set_id: change_set_id }, binding);
  } else {
    rows.push(write('expansion_frontiers', frontierId, { ...frontierRecord, state_version: 1,
      created_change_set_id: change_set_id }));
    rows.push(write('scene_frontier_bindings', `binding:${frontierId}`, {
      id: `binding:${frontierId}`, position_id: position.id, frontier_id: frontierId,
      scene_baseline_id: baseline.id, status: 'inactive', state_version: 1,
      activated_change_set_id: change_set_id, deactivated_change_set_id: change_set_id }));
  }
  const chainRecord = { id: chainId, g4_id: slot.g4_id, slot_ref: ref(slot.id, slot.version),
    initial_frontier_id: `expansion:${suffix}:frontier:0`, terminal_ordinal: selection.terminal_ordinal,
    length_rule_ref: ref(slot.continuation_length_rule_id, slot.continuation_length_rule_version),
    candidate_digest: digest(closure.continuation_length_candidates), choice_trace_id: materialization_trace_id,
    status: terminal ? 'terminal_resolved' : 'active', updated_change_set_id: change_set_id,
    terminal_change_set_id: terminal ? change_set_id : null };
  if (!chain) rows.push(write('party_continuation_chains', chainId, { ...chainRecord,
    state_version: 1, created_change_set_id: change_set_id }));
  else if (terminal) update('party_continuation_chains', chainId,
    { id: chainId, status: 'terminal_resolved', updated_change_set_id: change_set_id,
      terminal_change_set_id: change_set_id }, chain);
  const ledgerId = `${party_id}:${slot.g4_id}:${profile.id}`;
  const ledger = snapshot.ledgers.find((row) => row.profile_ref_id === profile.id);
  const ledgerRecord = { g4_id: slot.g4_id, profile_ref: ref(profile.id, profile.version),
    updated_change_set_id: change_set_id };
  if (ledger) update('party_g4_expansion_ledgers', ledgerId, ledgerRecord, ledger);
  else rows.push(write('party_g4_expansion_ledgers', ledgerId, { ...ledgerRecord, state_version: 1 }));
  const versionedString = (value) => {
    if (value == null) return null;
    const at = value.lastIndexOf('@');
    return at > 0 ? ref(value.slice(0, at), value.slice(at + 1)) : null;
  };
  if ([mechanics.risk_profile_ref, mechanics.availability_condition_set_ref]
    .some((value) => value != null && versionedString(value) == null)) return reject('versioned_connection_condition_required');
  rows.push(write('g5_site_connections', connectionId, { id: connectionId,
    from_site_id: site.id, to_site_id: targetSite,
    ...clean(mechanics, ['passage_type_id', 'cost_kind', 'action_units', 'baseline_movement_method_id', 'base_minutes', 'capacity']),
    transition_environment_profile_ref: optionalRef(mechanics, 'transition_environment_profile'),
    movement_orientation_profile_ref: optionalRef(mechanics, 'movement_orientation_profile'),
    movement_method_cost_profile_ref: optionalRef(mechanics, 'movement_method_cost_profile'),
    dynamic_recheck_policy_ref: optionalRef(mechanics, 'dynamic_recheck_policy'),
    risk_profile_ref: versionedString(mechanics.risk_profile_ref),
    availability_condition_set_ref: versionedString(mechanics.availability_condition_set_ref),
    status: 'active', state_version: 1, created_change_set_id: change_set_id,
    updated_change_set_id: change_set_id }));
  for (const [role, endpointSite, endpointPosition, slotKey] of [
    ['from', site.id, position.id, source.departure_endpoint_slot_key],
    ['to', targetSite, arrival.position_id, arrival.slot_key]
  ]) rows.push(write('party_site_connection_endpoint_bindings', `${connectionId}:${role}`, {
    id: `${connectionId}:${role}`, site_connection_id: connectionId, endpoint_role: role,
    g5_site_id: endpointSite, position_id: endpointPosition, source_slot_key: slotKey,
    status: 'active', state_version: 1, activated_change_set_id: change_set_id }));
  if (!terminal) {
    const template = selection.selected_template;
    rows.push(write('party_g5_sites', scene.site_id, { id: scene.site_id, origin: 'generated',
      parent_g4_id: slot.g4_id, generated_template_ref: ref(template.template_id, template.template_version),
      expansion_slot_ref: ref(slot.id, slot.version), source_frontier_id: frontierId,
      generation_ordinal: candidate_ordinal, direction_context_id: slot.direction_context_id,
      continuation_chain_id: chainId, continuation_ordinal: candidate_ordinal,
      status: 'active', state_version: 1, created_change_set_id: change_set_id, updated_change_set_id: change_set_id }));
    rows.push(...scene.rows);
    const successor = closure.successor_frontier_rules.find((row) => row.g5_template_id === template.template_id
      && row.g5_template_version === template.template_version && row.source_expansion_slot_id === slot.id
      && row.source_expansion_slot_version === slot.version);
    const departure = scene.endpoints.find((row) => row.slot_key === successor?.scene_endpoint_slot_key);
    if (!departure || !['departure', 'both'].includes(departure.endpoint_role)) return reject('successor_endpoint_required');
    const next = `expansion:${suffix}:frontier:${candidate_ordinal + 1}`;
    rows.push(write('expansion_frontiers', next, { id: next, g4_id: slot.g4_id,
      source_g5_site_id: scene.site_id, slot_ref: ref(slot.id, slot.version),
      direction_context_id: slot.direction_context_id, continuation_chain_id: chainId,
      continuation_ordinal: candidate_ordinal + 1, status: 'open', state_version: 1, created_change_set_id: change_set_id }));
    rows.push(write('scene_frontier_bindings', `binding:${next}`, { id: `binding:${next}`,
      position_id: departure.position_id, frontier_id: next, scene_baseline_id: scene.baseline_id,
      status: 'active', state_version: 1, activated_change_set_id: change_set_id }));
    rows.push(write('expansion_capacity_reservations', `reservation:${frontierId}`, {
      id: `reservation:${frontierId}`, g4_id: slot.g4_id, profile_ref: ref(profile.id, profile.version),
      slot_ref: ref(slot.id, slot.version), selected_template_ref: ref(template.template_id, template.template_version),
      frontier_id: frontierId, idempotency_record_id: `idem:${change_set_id}`, status: 'consumed',
      expires_at: new Date(now).toISOString(), state_version: 1, terminal_change_set_id: change_set_id }));
  }
  const proposal = { kind: 'generated_expansion_rows', party_id, g4_id: slot.g4_id,
    change_set_id, inserts: rows, updates, expected_state_versions,
    connection_id: connectionId, target_site_id: targetSite, target_position_id: arrival.position_id,
    source_position_id: position.id, dependency_pins, moves_traveller: false, advances_time: false };
  return freeze({ ok: true, proposal: { ...proposal, canonical_digest: digest(proposal) } });
}
