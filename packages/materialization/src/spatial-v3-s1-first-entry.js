import { failure, freeze, text } from './spatial-v3-validation.js';

/** S1 formal topology stays code-owned; P16 only persists these row templates. */
export function materializeS1FormalSpatialProposal({ party_id, request_id, local_ref, kind,
  structural_variant, baseline_ref, g5_ref, position_ref, topology = null }) {
  if (!text(party_id) || !text(request_id) || !text(local_ref)
      || !['ordinary_structure', 'local_natural_feature'].includes(kind)
      || !['open_one_space', 'descriptive_local_reference'].includes(structural_variant)
      || !text(baseline_ref) || !text(g5_ref) || !text(position_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_formal_spatial_refs' });
  }
  const structural = structural_variant === 'open_one_space';
  if (structural && !s1Topology(topology, baseline_ref, g5_ref, position_ref)) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_first_entry_topology' });
  }
  const refs = {
    schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized', structural_variant,
    local_ref, placement_ref: `${kind}:${local_ref}`,
    g6_instance_ref: structural ? topology.g6_instance_ref : null,
    position_ref: structural ? topology.interior_position_ref : null, portal_ref: null,
    movement_edge_refs: structural ? topology.movement_edge_refs : [],
    visibility_link_refs: structural ? topology.visibility_link_refs : [] };
  const placement = (position_node_id) => ({ target_table: 'entity_placements', id: refs.placement_ref,
    record: { entity_kind: kind, entity_id: local_ref, placement_kind: 'scene_position',
      position_node_id, host_entity_ref: null, occupies_capacity_units: 0,
      visibility_modifier_ref: null, interaction_profile_ref: null, state_version: 0 } });
  if (!structural) return freeze({ ok: true, proposal: {
    schema: 'rus.s1_formal_spatial_proposal.v1', refs, rows: [placement(position_ref)] } });
  return freeze({ ok: true, proposal: { schema: 'rus.s1_formal_spatial_proposal.v1', refs,
    rows: [placement(structural ? topology.interior_position_ref : position_ref)] } });
}

/** First-entry-only physical topology. Late S1 may only bind these immutable refs. */
export function materializeS1OpenOneSpaceTopology({ party_id, baseline_ref, g5_ref,
  position_ref, base_position_slot_key, scene_template_ref, slot,
  world_base_reference_snapshot }) {
  const closure = closureFor(world_base_reference_snapshot, scene_template_ref);
  const resolved = closure && resolveSlot(closure, slot, base_position_slot_key);
  if (![party_id, baseline_ref, g5_ref, position_ref, scene_template_ref].every(text)
      || !resolved) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_first_entry_topology' });
  }
  const { g6, position, movement: [out, back], visibility: [visibleOut, visibleBack] } = resolved;
  const base = `s1:${party_id}:${baseline_ref}:${g6.scene_slot_key}`;
  const topology = { g6_instance_ref: `${base}:g6`, position_ref: `${base}:position`,
    movement_edge_refs: [`${base}:edge:out`, `${base}:edge:back`],
    visibility_link_refs: [`${base}:edge:out:visible`, `${base}:edge:back:visible`] };
  const rows = [
    { target_table: 'party_g6_instances', id: topology.g6_instance_ref,
      record: { id: topology.g6_instance_ref, scene_baseline_id: baseline_ref,
        source_scene_template_ref: versionedSceneTemplate(scene_template_ref), scene_slot_key: g6.scene_slot_key,
        enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: g5_ref,
        physical_class_id: g6.physical_class_id,
        primary_scene_role_id: g6.primary_scene_role_id,
        vertical_context_id: g6.vertical_context_id,
        overhead_cover_id: g6.overhead_cover_id,
        intra_g6_visibility_mode: g6.intra_g6_visibility_mode,
        default_visibility_distance_band: g6.default_visibility_distance_band,
        acoustic_uniformity: g6.acoustic_uniformity, status: 'active', state_version: 0 } },
    { target_table: 'scene_position_nodes', id: topology.position_ref,
      record: { id: topology.position_ref, g6_instance_id: topology.g6_instance_ref,
        position_type_id: position.position_type_id, template_slot_key: position.position_slot_key,
        template_instance_ordinal: 0, stable_basis_ref: null, capacity: position.capacity,
        access_class_id: position.access_class_id, light_profile_ref: null, hazard_profile_ref: null,
        status: 'active', state_version: 0 } }
  ];
  rows.push(movementRow(topology.movement_edge_refs[0], position_ref,
    topology.position_ref, topology.movement_edge_refs[1], out, baseline_ref,
    scene_template_ref));
  rows.push(movementRow(topology.movement_edge_refs[1], topology.position_ref,
    position_ref, topology.movement_edge_refs[0], back, baseline_ref,
    scene_template_ref));
  rows.push(visibilityRow(topology.visibility_link_refs[0], position_ref,
    topology.position_ref, topology.visibility_link_refs[1], visibleOut,
    baseline_ref, scene_template_ref));
  rows.push(visibilityRow(topology.visibility_link_refs[1], topology.position_ref,
    position_ref, topology.visibility_link_refs[0], visibleBack, baseline_ref,
    scene_template_ref));
  return freeze({ ok: true, topology: freeze(topology), rows: freeze(rows),
    base_static_template: freeze({ g6: structuredClone(resolved.baseG6),
      position: structuredClone(resolved.basePosition) }) });
}

export function materializeS1SceneBaseStatic({ scene_template_ref, g6_slot_key,
  position_slot_key, world_base_reference_snapshot }) {
  const closure = closureFor(world_base_reference_snapshot, scene_template_ref);
  const g6 = one(closure?.g6_slots, 'scene_slot_key', g6_slot_key);
  const position = one(closure?.position_slots, 'position_slot_key', position_slot_key);
  if (!g6 || !position || position.g6_scene_slot_key !== g6.scene_slot_key
      || !physicalRowsComplete(g6, position, g6, position, [], [])) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_scene_base_static' });
  }
  return freeze({ ok: true, base_static_template: freeze({
    scene_template_ref: versionedSceneTemplate(scene_template_ref),
    g6: { source_scene_template_ref: versionedSceneTemplate(scene_template_ref),
      ...structuredClone(g6) },
    position: { template_slot_key: position.position_slot_key,
      position_type_id: position.position_type_id, capacity: position.capacity,
      access_class_id: position.access_class_id }
  }) });
}

export function materializeS1FirstEntryPreparation({ party_id, binding, start_binding,
  source_g4_id, scene, npcs, world_base_reference_snapshot }) {
  const sourceG5 = canonicalG5Binding(world_base_reference_snapshot,
    binding?.source?.canonical_g5_ref,
    binding?.source?.materialization_profile_ref,
    start_binding?.node_template_ref, source_g4_id);
  const destinationG5 = canonicalG5Binding(world_base_reference_snapshot,
    binding?.destination?.g5?.canonical_ref,
    binding?.destination?.g5?.materialization_profile_ref,
    binding?.destination?.g6?.scene_template_ref, scene?.node?.parent_g4_id);
  const source = materializeS1SceneBaseStatic({
    scene_template_ref: start_binding?.node_template_ref,
    g6_slot_key: start_binding?.anchor_template?.slot_key,
    position_slot_key: start_binding?.anchor_template?.state?.zone_ref,
    world_base_reference_snapshot
  });
  const destination = materializeS1SceneBaseStatic({
    scene_template_ref: binding?.destination?.g6?.scene_template_ref,
    g6_slot_key: scene?.anchor?.slot_key,
    position_slot_key: scene?.anchor?.state?.zone_ref,
    world_base_reference_snapshot
  });
  const s1 = materializeS1OpenOneSpaceTopology({
    party_id,
    baseline_ref: `baseline:${scene?.node?.instance_id}`,
    g5_ref: `g5:${scene?.node?.instance_id}`,
    position_ref: `position:${scene?.anchor?.instance_id}`,
    base_position_slot_key: scene?.anchor?.slot_key,
    scene_template_ref: binding?.destination?.g6?.scene_template_ref,
    slot: binding?.destination?.g6?.s1_topology_slot,
    world_base_reference_snapshot
  });
  if (!sourceG5 || !destinationG5 || !source.ok || !destination.ok || !s1.ok) {
    return failure('s1_formal_spatial_data_gap', null, { stage: 's1_first_entry_static' });
  }
  return freeze({ ok: true, preparation: freeze({
    binding: structuredClone(binding), scene: structuredClone(scene),
    npcs: structuredClone(npcs), base_static_templates: {
      source: structuredClone(source.base_static_template),
      destination: structuredClone(destination.base_static_template)
    },
    canonical_g5_refs: {
      source: canonicalNodeRef(sourceG5), destination: canonicalNodeRef(destinationG5)
    },
    scene_materialization_profile_refs: {
      source: materializationProfileRef(sourceG5),
      destination: materializationProfileRef(destinationG5)
    },
    s1_topology: structuredClone(s1.topology),
    s1_physical_writes: structuredClone(s1.rows)
  }) });
}

function canonicalG5Binding(snapshot, canonicalRef, profileRef, sceneTemplateId,
  parentG4Id) {
  const rows = snapshot?.canonical_g5_scene_bindings?.filter((row) =>
    versionedRef(canonicalRef, 'canonical_spatial_node', row?.id)
    && row.version === 1 && row.spatial_level === 'G5' && row.status === 'approved'
    && row.parent_id === parentG4Id && Number.isSafeInteger(row.parent_version)
    && versionedRef(profileRef, 'scene_materialization_profile',
      row.materialization_profile_id)
    && row.materialization_profile_version === 1
    && row.scene_template_id === sceneTemplateId
    && row.scene_template_version === 1
    && /^[a-f0-9]{64}$/u.test(row.canonical_digest ?? '')
    && /^[a-f0-9]{64}$/u.test(row.materialization_profile_digest ?? '')) ?? [];
  return rows.length === 1 ? rows[0] : null;
}

function canonicalNodeRef(row) {
  return freeze({ entity_kind: 'canonical_spatial_node', entity_id: row.id,
    authoring_version: String(row.version) });
}

function materializationProfileRef(row) {
  return freeze({ entity_kind: 'scene_materialization_profile',
    entity_id: row.materialization_profile_id,
    authoring_version: String(row.materialization_profile_version) });
}

function closureFor(snapshot, sceneTemplateRef) {
  const rows = snapshot?.scene_template_closures?.filter((row) => row?.header?.id === sceneTemplateRef && row.header.version === 1) ?? [];
  return rows.length === 1 ? rows[0] : null;
}
function resolveSlot(closure, slot, basePositionSlotKey) {
  if (!slot || !versionedRef(slot.source_scene_template_ref, 'scene_template', closure?.header?.id)) return null;
  const g6 = one(closure.g6_slots, 'scene_slot_key', slot.g6_slot_key);
  const position = one(closure.position_slots, 'position_slot_key', slot.position_slot_key);
  const basePosition = one(closure.position_slots, 'position_slot_key', basePositionSlotKey);
  const baseG6 = basePosition && one(closure.g6_slots, 'scene_slot_key', basePosition.g6_scene_slot_key);
  const movement = selectedRows(closure.movement_edges, 'edge_slot_key', slot.movement_edge_slot_keys);
  const visibility = selectedRows(closure.visibility_links, 'link_slot_key', slot.visibility_link_slot_keys);
  if (!g6 || !position || !baseG6 || !basePosition
      || g6.scene_slot_key === baseG6.scene_slot_key
      || position.position_slot_key === basePosition.position_slot_key
      || position.g6_scene_slot_key !== g6.scene_slot_key
      || basePosition.g6_scene_slot_key !== baseG6.scene_slot_key
      || !directedPair(movement, 'edge_slot_key', 'reverse_edge_slot_key',
        basePosition.position_slot_key, position.position_slot_key)
      || !directedPair(visibility, 'link_slot_key', 'reverse_link_slot_key',
        basePosition.position_slot_key, position.position_slot_key)
      || !physicalRowsComplete(g6, position, baseG6, basePosition, movement, visibility)) return null;
  return { g6, position, baseG6, basePosition, movement, visibility };
}
function one(rows, key, value) { const found = (rows ?? []).filter((row) => row?.[key] === value); return found.length === 1 ? found[0] : null; }
function selectedRows(rows, key, keys) { return Array.isArray(keys) && keys.length === 2 && keys[0] !== keys[1] ? keys.map((value) => one(rows, key, value)) : null; }
function directedPair(rows, key, reverse, base, interior) { return Array.isArray(rows) && rows.length === 2 && rows.every(Boolean) && rows[0].from_position_slot_key === base && rows[0].to_position_slot_key === interior && rows[1].from_position_slot_key === interior && rows[1].to_position_slot_key === base && rows[0][reverse] === rows[1][key] && rows[1][reverse] === rows[0][key]; }
function physicalRowsComplete(g6, position, baseG6, basePosition, movement, visibility) {
  const has = (row, keys) => keys.every((key) => Object.hasOwn(row, key));
  const exactKeys = (row, keys) => Object.keys(row).length === keys.length
    && Object.keys(row).every((key) => keys.includes(key));
  const g6Keys = ['scene_slot_key', 'physical_class_id', 'primary_scene_role_id',
    'vertical_context_id', 'overhead_cover_id', 'intra_g6_visibility_mode',
    'default_visibility_distance_band', 'acoustic_uniformity'];
  const positionKeys = ['position_slot_key', 'g6_scene_slot_key', 'position_type_id',
    'capacity', 'access_class_id'];
  const movementKeys = ['edge_slot_key', 'from_position_slot_key', 'to_position_slot_key',
    'reverse_edge_slot_key', 'passage_type_id', 'transition_environment_profile_id',
    'transition_environment_profile_version', 'movement_orientation_profile_id',
    'movement_orientation_profile_version', 'cost_kind', 'action_units',
    'baseline_movement_method_id', 'movement_method_cost_profile_id',
    'movement_method_cost_profile_version', 'base_minutes', 'dynamic_recheck_policy_id',
    'dynamic_recheck_policy_version', 'capacity', 'portal_template_id',
    'portal_template_version', 'availability_condition_set_id',
    'availability_condition_set_version'];
  const visibilityKeys = ['link_slot_key', 'from_position_slot_key',
    'to_position_slot_key', 'reverse_link_slot_key', 'quality', 'distance_band',
    'portal_template_id', 'portal_template_version', 'condition_profile_id',
    'condition_profile_version'];
  return has(g6, g6Keys) && has(baseG6, g6Keys)
    && has(position, positionKeys) && has(basePosition, positionKeys)
    && [g6, baseG6].every((row) => exactKeys(row, g6Keys))
    && [position, basePosition].every((row) => exactKeys(row, positionKeys))
    && movement.every((row) => has(row, movementKeys) && exactKeys(row, movementKeys)
      && row.passage_type_id === 'passage.local'
      && row.cost_kind === 'action' && row.action_units === 1 && row.capacity === 1
      && ['baseline_movement_method_id', 'movement_method_cost_profile_id',
        'movement_method_cost_profile_version', 'base_minutes',
        'dynamic_recheck_policy_id', 'dynamic_recheck_policy_version',
        'portal_template_id', 'portal_template_version',
        'availability_condition_set_id', 'availability_condition_set_version']
        .every((key) => row[key] === null)
      && ['transition_environment_profile', 'movement_orientation_profile',
        'movement_method_cost_profile', 'dynamic_recheck_policy',
        'portal_template', 'availability_condition_set'].every((prefix) =>
        catalogReferenceComplete(row, prefix)))
    && visibility.every((row) => has(row, visibilityKeys) && exactKeys(row, visibilityKeys)
      && row.portal_template_id === null && row.portal_template_version === null
      && row.condition_profile_id === null && row.condition_profile_version === null
      && ['portal_template', 'condition_profile'].every((prefix) =>
        catalogReferenceComplete(row, prefix)));
}
function catalogReferenceComplete(row, prefix) { const id = row[`${prefix}_id`]; const version = row[`${prefix}_version`]; return id == null && version == null || typeof id === 'string' && Number.isSafeInteger(version) && version > 0; }
function catalogRef(row, prefix) { const id = row?.[`${prefix}_id`]; const version = row?.[`${prefix}_version`]; return id == null && version == null ? null : typeof id === 'string' && Number.isSafeInteger(version) && version > 0 ? { entity_ref: { entity_kind: prefix, entity_id: id }, authoring_version: String(version) } : undefined; }
function movementRow(id, from, to, reverse, row, baseline, template) { return { target_table: 'scene_movement_edges', id, record: { id, scene_baseline_id: baseline, source_scene_template_ref: versionedSceneTemplate(template), source_edge_slot_key: row.edge_slot_key, from_position_id: from, to_position_id: to, passage_type_id: row.passage_type_id, transition_environment_profile_ref: catalogRef(row, 'transition_environment_profile'), movement_orientation_profile_ref: catalogRef(row, 'movement_orientation_profile'), cost_kind: row.cost_kind, action_units: row.action_units, baseline_movement_method_id: row.baseline_movement_method_id, movement_method_cost_profile_ref: catalogRef(row, 'movement_method_cost_profile'), base_minutes: row.base_minutes, dynamic_recheck_policy_ref: catalogRef(row, 'dynamic_recheck_policy'), capacity: row.capacity, portal_entity_id: row.portal_template_id, availability_condition_set_ref: catalogRef(row, 'availability_condition_set'), reverse_edge_id: reverse, status: 'active', state_version: 0 } }; }
function visibilityRow(id, from, to, reverse, row, baseline, template) { return { target_table: 'visibility_links', id, record: { id, scene_baseline_id: baseline, source_scene_template_ref: versionedSceneTemplate(template), source_link_slot_key: row.link_slot_key, from_position_id: from, to_position_id: to, quality: row.quality, distance_band: row.distance_band, portal_entity_id: row.portal_template_id, condition_profile_ref: catalogRef(row, 'condition_profile'), reverse_link_id: reverse, status: 'active', state_version: 0 } }; }

function versionedRef(value, kind, id) {
  return value && Object.keys(value).sort().join('\u0000') === 'authoring_version\u0000entity_ref'
    && value.authoring_version === '1' && value.entity_ref
    && Object.keys(value.entity_ref).sort().join('\u0000') === 'entity_id\u0000entity_kind'
    && value.entity_ref.entity_kind === kind && value.entity_ref.entity_id === id;
}

function versionedSceneTemplate(entityId) {
  return { entity_ref: { entity_kind: 'scene_template', entity_id: entityId }, authoring_version: '1' };
}

function s1Topology(value, baseline_ref, g5_ref, position_ref) {
  return value && typeof value === 'object' && value.baseline_ref === baseline_ref
    && value.g5_ref === g5_ref && value.position_ref === position_ref
    && text(value.g6_instance_ref) && text(value.interior_position_ref)
    && Array.isArray(value.movement_edge_refs) && value.movement_edge_refs.length === 2
    && Array.isArray(value.visibility_link_refs) && value.visibility_link_refs.length === 2
    && [...value.movement_edge_refs, ...value.visibility_link_refs].every(text);
}
