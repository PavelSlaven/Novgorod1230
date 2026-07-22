import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildWorldBaseSchemaReference } from '../../scripts/generate-world-base-schema-reference.mjs';
import { buildTransactionalImportSql } from './p12-authoring-importer.mjs';

const execFile = promisify(execFileCallback);
const ROOT = resolve(import.meta.dirname, '../..');
const ZIP = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip';
const APPROVED_SOURCE_PAIRS = 'data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/data/physical-exit-source-pairs.json';
const PACKAGE = 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1';
const mappings = Object.freeze({
  p12_target_world_revision: 'spatial_v3_world_revisions',
  canonical_spatial_node: 'spatial_v3_nodes',
  scene_materialization_profile: 'spatial_v3_scene_materialization_profiles',
  scene_materialization_candidate: 'spatial_v3_scene_materialization_candidates',
  canonical_g5_connection_profile: 'spatial_v3_canonical_g5_connection_profiles',
  canonical_g5_connection_binding: 'spatial_v3_canonical_g5_connection_bindings',
  g4_entry_endpoint_binding: 'spatial_v3_g4_entry_endpoint_bindings',
  topological_direction_context: 'spatial_v3_topological_direction_contexts',
  g4_traversal_profile: 'spatial_v3_g4_traversal_profiles',
  g4_directional_exit: 'spatial_v3_g4_directional_exits',
  world_route: 'spatial_v3_world_routes',
  world_route_point: 'spatial_v3_world_route_points',
  world_route_segment: 'spatial_v3_world_route_segments',
  world_route_segment_spatial_context: 'spatial_v3_world_route_segment_spatial_contexts',
  world_route_endpoint_binding: 'spatial_v3_world_route_endpoint_bindings',
  authoring_dependency_edge: 'spatial_v3_authoring_dependency_edges'
});
// A physical table alone is not authorization: each immutable contract shape
// must also have a reviewed deterministic row compiler.
const compiledContracts = new Set(Object.keys(mappings));
const WORLD_REVISION = 'novgorod_spatial_v3_target_contract_approval_001';
const PROVENANCE = 'prov_p12_g1_r2_r3_v1';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pin = (value) => {
  if (value === null || value === undefined) return [null, null];
  const match = String(value).match(/^(.+)@([1-9][0-9]*)$/u);
  if (!match) throw new Error(`P12_V11_UNPINNED_REFERENCE:${value}`);
  return [match[1], Number(match[2])];
};
const version = (value) => Number(value);
const authored = (kind, row) => ({ entity_kind: kind, entity_id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, canonical_digest: digest(row), status: row.status ?? 'approved', provenance_ref: row.provenance_ref ?? PROVENANCE });

const refSet = (rows, getRef) => new Set(rows.map(getRef));
const sameSet = (left, right) => left.size === right.size && [...left].every((value) => right.has(value));

export function validateP12ApprovedProjectionSource({ approvedSourcePairs, connectionBindings, entryBindings, directRouteBindings, routeContextLinks, legacyMappings, retainedHierarchyTargets, canonicalG5, sourceProfiles, sourceCandidates, assignments, families }) {
  const errors = [];
  const fail = (code, subject = 'projection') => errors.push({ code, subject_ref: subject });
  const approvedByRef = new Map(approvedSourcePairs.map((row) => [`${row.physical_exit_pair_id}@${version(row.version)}`, row]));
  if (approvedByRef.size !== 358 || approvedByRef.size !== approvedSourcePairs.length) fail('P12_SOURCE_PAIR_SET_INVALID');
  const partitions = [
    ['intra_g4_site_connection_source', 227, 2, connectionBindings],
    ['host_entry_site_connection_source', 32, 1, entryBindings],
    ['cross_g4_world_route_source', 43, 1, directRouteBindings],
    ['route_context', 56, 1, routeContextLinks]
  ];
  const union = new Set();
  for (const [kind, expected, multiplicity, rows] of partitions) {
    const occurrences = Map.groupBy(rows, (row) => row.source_pair_ref);
    const refs = new Set(occurrences.keys());
    if (rows.length !== expected * multiplicity || refs.size !== expected || [...occurrences.values()].some((bindings) => bindings.length !== multiplicity)) fail('P12_SOURCE_PAIR_PARTITION_MULTIPLICITY_INVALID', kind);
    for (const ref of refs) {
      if (union.has(ref)) fail('P12_SOURCE_PAIR_PARTITION_OVERLAP', ref);
      union.add(ref);
      const source = approvedByRef.get(ref);
      if (!source) fail('P12_SOURCE_PAIR_UNKNOWN', ref);
      else if (kind === 'route_context') {
        if (!['corridor_to_host_route_context_source', 'world_route_segment_context_source'].includes(source.target_mapping_kind)) fail('P12_SOURCE_PAIR_CLASSIFICATION_INVALID', ref);
      } else if (source.target_mapping_kind !== kind) fail('P12_SOURCE_PAIR_CLASSIFICATION_INVALID', ref);
    }
  }
  if (!sameSet(union, new Set(approvedByRef.keys()))) fail('P12_SOURCE_PAIR_PARTITION_INCOMPLETE');
  const directionIds = new Set();
  for (const row of approvedSourcePairs) {
    const directions = row.directions ?? [];
    if (row.direction_count !== 2 || row.directional_target_row_count !== 2 || directions.length !== 2) fail('P12_DIRECTION_COUNT_INVALID', row.physical_exit_pair_id);
    for (const direction of directions) {
      if (directionIds.has(direction.direction_id)) fail('P12_DIRECTION_ID_DUPLICATE', direction.direction_id);
      directionIds.add(direction.direction_id);
    }
    const forward = directions[0]; const reverse = directions[1];
    if (!forward || !reverse || JSON.stringify(forward.from) !== JSON.stringify(row.source_from) || JSON.stringify(forward.to) !== JSON.stringify(row.source_to) || JSON.stringify(reverse.from) !== JSON.stringify(row.source_to) || JSON.stringify(reverse.to) !== JSON.stringify(row.source_from)) fail('P12_DIRECTION_SEMANTICS_INVALID', row.physical_exit_pair_id);
  }
  if (directionIds.size !== 716) fail('P12_DIRECTION_SET_INVALID');

  const physicalMappings = legacyMappings.filter((row) => row.physical);
  const retainedMappings = legacyMappings.filter((row) => row.target_mapping_kind === 'retained_hierarchy_dependency');
  const g5ParentMappings = legacyMappings.filter((row) => row.target_mapping_kind === 'canonical_g5_parent_dependency');
  if (legacyMappings.length !== 600 || new Set(legacyMappings.map((row) => row.binding_id)).size !== 600 || new Set(legacyMappings.map((row) => row.legacy_edge_id)).size !== 600 || retainedMappings.length !== 47 || g5ParentMappings.length !== 195 || physicalMappings.length !== 358) fail('P12_LEGACY_MAPPING_DECOMPOSITION_INVALID');
  if (!sameSet(new Set(physicalMappings.map((row) => row.legacy_edge_id)), new Set(approvedSourcePairs.map((row) => row.legacy_edge_id)))) fail('P12_PHYSICAL_MAPPING_SET_INVALID');
  if (!sameSet(new Set(retainedMappings.map((row) => row.source_to.id)), new Set(retainedHierarchyTargets))) fail('P12_RETAINED_HIERARCHY_MAPPING_SET_INVALID');
  if (!sameSet(new Set(g5ParentMappings.map((row) => row.source_to.id)), new Set(canonicalG5.map((row) => row.id)))) fail('P12_G5_PARENT_MAPPING_SET_INVALID');

  const g5Ids = new Set(canonicalG5.map((row) => row.id));
  const profileIds = new Set(sourceProfiles.map((row) => row.id));
  if (g5Ids.size !== 195 || sourceProfiles.length !== 195 || sourceCandidates.length !== 195 || assignments.length !== 195 || families.length !== 17) fail('P12_SCENE_CARDINALITY_INVALID');
  if (!sameSet(new Set(sourceProfiles.map((row) => row.source_ref.replace(/@1$/u, ''))), g5Ids)) fail('P12_G5_PROFILE_BIJECTION_INVALID');
  if (!sameSet(new Set(sourceCandidates.map((row) => row.profile_id)), profileIds)) fail('P12_PROFILE_CANDIDATE_BIJECTION_INVALID');
  if (!sameSet(new Set(assignments.map((row) => row.canonical_g5_id)), g5Ids) || !sameSet(new Set(assignments.map((row) => row.scene_profile_ref.replace(/@1$/u, ''))), profileIds)) fail('P12_SCENE_ASSIGNMENT_BIJECTION_INVALID');
  if (!sameSet(new Set(assignments.map((row) => row.source_profile_family_id)), new Set(families.map((row) => row.profile_id)))) fail('P12_SCENE_FAMILY_COVERAGE_INVALID');
  return Object.freeze(errors);
}

export function validateApprovedPhysicalSourceRows(approvedSourcePairs, rows) {
  const expected = new Map(approvedSourcePairs.map((row) => [`${row.physical_exit_pair_id}@${version(row.version)}`, row]));
  const actual = new Map(rows.map((row) => [`${row.id}@${row.version}`, row]));
  const errors = [];
  if (!sameSet(new Set(expected.keys()), new Set(actual.keys()))) errors.push({ code: 'P12_APPROVED_SOURCE_PAIR_ROW_SET_INVALID', subject_ref: 'spatial_v3_approved_physical_source_pairs' });
  for (const [ref, source] of expected) {
    const row = actual.get(ref);
    if (row && (row.source_payload_sha256 !== digest(source) || row.status !== source.status || row.provenance_ref !== source.provenance_ref)) errors.push({ code: 'P12_APPROVED_SOURCE_PAIR_PAYLOAD_DRIFT', subject_ref: ref });
  }
  return Object.freeze(errors);
}

export function classifyP12DependencyEntityId(id) {
  const value = String(id);
  const mappings = [
    ['cg5bindv3__', 'canonical_g5_connection_binding'], ['cprofv3__', 'canonical_g5_connection_profile'],
    ['g4entryv3__', 'g4_entry_endpoint_binding'], ['g4traversal__', 'g4_traversal_profile'],
    ['dctxv3__', 'topological_direction_context'], ['g4exitv3__', 'g4_directional_exit'],
    ['wrpointv3__', 'world_route_point'], ['wrsegv3__', 'world_route_segment'],
    ['wrebv3__', 'world_route_endpoint_binding'], ['wrv3__', 'world_route'],
    ['g4v3__', 'spatial_node'], ['cg5v3__', 'spatial_node'], ['smpv3__', 'scene_materialization_profile'],
    ['env.', 'transition_environment_profile'], ['cost.', 'movement_method_cost_profile'], ['recheck.', 'dynamic_recheck_policy']
  ];
  const match = mappings.find(([prefix]) => value.startsWith(prefix));
  if (match) return match[1];
  const reservedCompiledStem = mappings.some(([prefix]) => value.startsWith(prefix.replace(/(?:v3)?__$/u, '')));
  if (reservedCompiledStem) throw new Error(`P12_V11_UNKNOWN_COMPILED_DEPENDENCY_ID:${value}`);
  return 'external_dependency';
}

export async function compileP12V11PhysicalRows({ root = ROOT } = {}) {
  const zip = resolve(root, ZIP);
  const load = async (name) => (await zipJson(zip, `target/${name}.json`)).records;
  const source = async (name) => JSON.parse(await readFile(resolve(root, `data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/data/${name}.json`), 'utf8')).records;
  const [nodes, profiles, candidates, orientations, exitRules, connectionProfiles, connectionBindings, entryBindings, directions, traversals, exits, routes, points, environments, costs, rechecks, segments, contexts, endpoints, dependencies, directRouteBindings, routeContextLinks, approvedSourcePairs, legacyMappings, retainedNodes, canonicalG5, sourceProfiles, sourceCandidates, assignments, families] = await Promise.all([
    load('canonical-spatial-nodes'), load('scene-materialization-profiles'), load('scene-materialization-candidates'),
    load('topological-movement-orientation-profiles'), load('topological-exit-orientation-rules'),
    load('canonical-g5-connection-profiles'), load('canonical-g5-connection-bindings'), load('g4-entry-endpoint-bindings'),
    load('topological-direction-contexts'), load('g4-traversal-profiles'), load('g4-directional-exits'),
    load('world-routes'), load('world-route-points'), load('transition-environment-profiles'),
    load('movement-method-cost-profiles'), load('dynamic-recheck-policies'), load('world-route-segments'),
    load('world-route-segment-spatial-contexts'), load('world-route-endpoint-bindings'), load('authoring-dependency-edges'),
    load('direct-route-source-bindings'), load('route-context-links'),
    readFile(resolve(root, APPROVED_SOURCE_PAIRS), 'utf8').then((value) => JSON.parse(value).records),
    source('legacy-edge-mapping-bindings'),
    readFile(resolve(root, 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/datasets/spatial_v3_nodes.json'), 'utf8').then(JSON.parse),
    source('canonical-g5-inventory'), source('scene-materialization-profiles'),
    source('scene-materialization-candidates'), source('scene-profile-assignments'), source('approved-scene-profile-families')
  ]);
  const retainedHierarchyTargets = retainedNodes.filter((row) => ['G2', 'G3'].includes(row.spatial_level)).map((row) => row.id);
  const sourceErrors = validateP12ApprovedProjectionSource({ approvedSourcePairs, connectionBindings, entryBindings, directRouteBindings, routeContextLinks, legacyMappings, retainedHierarchyTargets, canonicalG5, sourceProfiles, sourceCandidates, assignments, families });
  if (sourceErrors.length) throw new Error(sourceErrors.map((error) => `${error.code}:${error.subject_ref}`).join(','));
  const rows = new Map();
  const put = (table, values) => rows.set(table, values);
  const nodeRows = nodes.map((row) => ({
    entity_kind: 'spatial_node', id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION,
    spatial_level: row.scale_level, stable_label_id: null, primary_class_id: row.spatial_class_id,
    evidence_status: row.evidence_status, traversal_model: row.scale_level === 'G4' ? 'through_area' : null,
    status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row)
  }));
  put('spatial_v3_nodes', nodeRows);
  put('spatial_v3_node_classes', nodes.map((row) => ({ node_id: row.id, node_version: version(row.version), category_id: row.spatial_class_id, class_ordinal: 0 })));
  put('spatial_v3_node_parents', nodes.map((row) => { const [parent_id, parent_version] = pin(row.parent_ref); return { child_id: row.id, child_version: version(row.version), parent_id, parent_version, world_revision_id: WORLD_REVISION }; }));
  put('spatial_v3_scene_materialization_profiles', profiles.map((row) => { const [source_entity_id, source_entity_version] = pin(row.source_ref); const [selection_rule_id, selection_rule_version] = pin(row.selection_rule_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, source_kind: row.source_kind, source_entity_id, source_entity_version, selection_rule_id, selection_rule_version, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) }; }));
  put('spatial_v3_scene_materialization_candidates', candidates.map((row) => { const [scene_template_id, scene_template_version] = pin(row.scene_template_ref); const [applicability_rule_id, applicability_rule_version] = pin(row.applicability_rule_ref); return { profile_id: row.profile_id, profile_version: version(row.profile_version), scene_template_id, scene_template_version, weight: row.weight, applicability_rule_id, applicability_rule_version }; }));
  put('spatial_v3_topological_movement_orientation_profiles', orientations.map((row) => ({ id: row.id, version: version(row.version), orientation_kind: row.orientation_kind, vertical_direction: row.vertical_direction, forbids_compass_inference: row.forbids_compass_inference, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) })));
  put('spatial_v3_topological_exit_orientation_rules', exitRules.map((row) => ({ id: row.id, version: version(row.version), rule_kind: row.rule_kind, forbids_compass_inference: row.forbids_compass_inference, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) })));
  const sourcePairRefs = new Set();
  const rememberPair = (ref) => { sourcePairRefs.add(ref); return pin(ref); };
  put('spatial_v3_canonical_g5_connection_profiles', connectionProfiles.map((row) => {
    const [transition_environment_profile_id, transition_environment_profile_version] = pin(row.transition_environment_profile_ref);
    const [movement_orientation_profile_id, movement_orientation_profile_version] = pin(row.movement_orientation_profile_ref);
    const [movement_method_cost_profile_id, movement_method_cost_profile_version] = pin(row.movement_method_cost_profile_ref);
    const [dynamic_recheck_policy_id, dynamic_recheck_policy_version] = pin(row.dynamic_recheck_policy_ref);
    return { id: row.id, version: version(row.version), profile_scope: row.profile_scope, passage_type_id: row.passage_type_id, transition_environment_profile_id, transition_environment_profile_version, movement_orientation_profile_id, movement_orientation_profile_version, cost_kind: row.cost_kind, action_units: row.action_units, baseline_movement_method_id: row.baseline_movement_method_id, movement_method_cost_profile_id, movement_method_cost_profile_version, base_minutes: row.base_minutes, dynamic_recheck_policy_id, dynamic_recheck_policy_version, capacity: row.capacity, capacity_semantics_ref: row.capacity_semantics_ref, risk_profile_ref: row.risk_profile_ref, availability_condition_set_ref: row.availability_condition_set_ref, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) };
  }));
  put('spatial_v3_canonical_g5_connection_bindings', connectionBindings.map((row) => {
    const [connection_profile_id, connection_profile_version] = pin(row.connection_profile_ref); const [reverse_binding_id, reverse_binding_version] = pin(row.reverse_binding_ref); const [source_pair_id, source_pair_version] = rememberPair(row.source_pair_ref);
    return { id: row.id, version: version(row.version), parent_g4_id: row.parent_g4_id, parent_g4_version: 1, from_canonical_g5_id: row.from_canonical_g5_id, from_canonical_g5_version: 1, to_canonical_g5_id: row.to_canonical_g5_id, to_canonical_g5_version: 1, connection_profile_id, connection_profile_version, from_scene_endpoint_slot_key: row.from_scene_endpoint_slot_key, to_scene_endpoint_slot_key: row.to_scene_endpoint_slot_key, reverse_binding_id, reverse_binding_version, source_pair_id, source_pair_version, status: row.status, provenance_ref: row.provenance_ref };
  }));
  put('spatial_v3_g4_entry_endpoint_bindings', entryBindings.map((row) => { const [source_pair_id, source_pair_version] = rememberPair(row.source_pair_ref); return { id: row.id, version: version(row.version), g4_id: row.g4_id, g4_version: 1, canonical_g5_id: row.canonical_g5_id, canonical_g5_version: 1, arrival_scene_endpoint_slot_key: row.arrival_scene_endpoint_slot_key, departure_scene_endpoint_slot_key: row.departure_scene_endpoint_slot_key, source_pair_id, source_pair_version, status: row.status, provenance_ref: row.provenance_ref }; }));
  const approvedPairRefs = new Set(approvedSourcePairs.map((row) => `${row.physical_exit_pair_id}@${version(row.version)}`));
  for (const ref of sourcePairRefs) if (!approvedPairRefs.has(ref)) throw new Error(`P12_V11_SOURCE_PAIR_NOT_APPROVED:${ref}`);
  put('spatial_v3_approved_physical_source_pairs', approvedSourcePairs.map((row) => ({
    id: row.physical_exit_pair_id,
    version: version(row.version),
    provenance_ref: row.provenance_ref,
    source_payload_sha256: digest(row),
    status: row.status
  })));
  const sourceRowErrors = validateApprovedPhysicalSourceRows(approvedSourcePairs, rows.get('spatial_v3_approved_physical_source_pairs'));
  if (sourceRowErrors.length) throw new Error(sourceRowErrors.map((error) => `${error.code}:${error.subject_ref}`).join(','));
  put('spatial_v3_topological_direction_contexts', directions.map((row) => { const [from_g4_id, from_g4_version] = pin(row.from_g4_ref); const [to_g4_id, to_g4_version] = pin(row.to_g4_ref); const [from_canonical_g5_id, from_canonical_g5_version] = pin(row.from_canonical_g5_ref); const [to_canonical_g5_id, to_canonical_g5_version] = pin(row.to_canonical_g5_ref); const [orientation_profile_id, orientation_profile_version] = pin(row.orientation_profile_ref); return { id: row.id, version: version(row.version), from_g4_id, from_g4_version, to_g4_id, to_g4_version, from_canonical_g5_id, from_canonical_g5_version, to_canonical_g5_id, to_canonical_g5_version, orientation_profile_id, orientation_profile_version, status: row.status, provenance_ref: row.provenance_ref }; }));
  put('spatial_v3_g4_traversal_profiles', traversals.map((row) => ({ g4_id: row.g4_id, g4_version: version(row.g4_version), traversal_model: row.traversal_model, status: row.status })));
  put('spatial_v3_transition_environment_profiles', environments.map((row) => ({ id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, environment_class_id: null, permanent_cost_basis_id: null, dynamic_environment_rule_set_id: null, dynamic_environment_rule_set_version: null, definition: row.definition, status: row.status, provenance_ref: PROVENANCE, canonical_digest: digest(row) })));
  put('spatial_v3_movement_method_cost_profiles', costs.map((row) => { const [baseline_movement_method_id] = pin(row.baseline_method_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, baseline_movement_method_id, base_minutes: row.base_minutes, dynamic_modifiers_required: row.dynamic_modifiers_required, calibration_kind: row.calibration_kind, distance_derived: row.distance_derived, measured_historical_duration: row.measured_historical_duration, definition: row.definition, status: row.status, provenance_ref: PROVENANCE, canonical_digest: digest(row) }; }));
  put('spatial_v3_dynamic_recheck_policies', rechecks.map((row) => ({ id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, policy_kind: 'fixed_time_interval', progress_slice_ppm: null, interval_minutes: row.interval_minutes, event_triggers: row.event_triggers, definition: row.definition, status: row.status, provenance_ref: PROVENANCE, canonical_digest: digest(row) })));
  put('spatial_v3_g4_directional_exits', exits.map((row) => { const [exit_orientation_rule_id, exit_orientation_rule_version] = pin(row.exit_orientation_rule_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, g4_id: row.g4_id, g4_version: 1, direction_context_id: row.direction_context_id, exit_orientation_profile_id: null, exit_orientation_profile_version: null, exit_kind: row.exit_kind, exit_canonical_g5_id: row.exit_canonical_g5_id, exit_canonical_g5_version: row.exit_canonical_g5_id ? 1 : null, boundary_feature_entity_kind: null, boundary_feature_entity_id: null, boundary_feature_version: null, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row), exit_orientation_rule_id, exit_orientation_rule_version }; }));
  put('spatial_v3_world_routes', routes.map((row) => { const [reverse_route_id, reverse_route_version] = pin(row.reverse_route_ref); const [availability_condition_set_id, availability_condition_set_version] = pin(row.availability_condition_set_ref); const [risk_profile_id, risk_profile_version] = pin(row.risk_profile_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, route_kind_id: row.route_kind_id, reverse_route_id, reverse_route_version, availability_condition_set_id, availability_condition_set_version, risk_profile_id, risk_profile_version, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) }; }));
  put('spatial_v3_world_route_points', points.map((row) => { const [world_route_id, world_route_version] = pin(row.world_route_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, world_route_id, world_route_version, ordinal: row.ordinal, point_kind: row.point_kind, anchor_policy: row.anchor_policy, context_switch_phase: row.context_switch_phase, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) }; }));
  put('spatial_v3_world_route_segments', segments.map((row) => {
    const [world_route_id, world_route_version] = pin(row.world_route_ref); const [from_point_id, from_point_version] = pin(row.from_route_point_ref); const [to_point_id, to_point_version] = pin(row.to_route_point_ref); const [transition_environment_profile_id, transition_environment_profile_version] = pin(row.transition_environment_profile_ref); const [topological_orientation_profile_id, topological_orientation_profile_version] = pin(row.movement_orientation_profile_ref); const [movement_method_cost_profile_id, movement_method_cost_profile_version] = pin(row.movement_method_cost_profile_ref); const [dynamic_recheck_policy_id, dynamic_recheck_policy_version] = pin(row.dynamic_recheck_policy_ref); const [risk_profile_id, risk_profile_version] = pin(row.risk_profile_ref); const [availability_condition_set_id, availability_condition_set_version] = pin(row.availability_condition_set_ref);
    return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, world_route_id, world_route_version, ordinal: row.ordinal, from_point_id, from_point_version, to_point_id, to_point_version, transition_environment_profile_id, transition_environment_profile_version, movement_orientation_profile_id: null, movement_orientation_profile_version: null, topological_orientation_profile_id, topological_orientation_profile_version, baseline_movement_method_id: row.baseline_movement_method_id, movement_method_cost_profile_id, movement_method_cost_profile_version, base_minutes: row.base_minutes, dynamic_recheck_policy_id, dynamic_recheck_policy_version, capacity: row.capacity, risk_profile_id, risk_profile_version, availability_condition_set_id, availability_condition_set_version, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) };
  }));
  put('spatial_v3_world_route_segment_spatial_contexts', contexts.map((row) => { const [jurisdiction_profile_id, jurisdiction_profile_version] = pin(row.jurisdiction_profile_ref); const [event_pool_profile_id, event_pool_profile_version] = pin(row.event_pool_profile_ref); return { segment_id: row.segment_id, segment_version: version(row.segment_version), g0_id: row.g0_id, g0_version: 1, g1_id: row.g1_id, g1_version: 1, g2_id: row.g2_id, g2_version: row.g2_id ? 1 : null, g3_id: row.g3_id, g3_version: row.g3_id ? 1 : null, g4_corridor_id: row.g4_corridor_id, g4_corridor_version: row.g4_corridor_id ? 1 : null, jurisdiction_profile_id, jurisdiction_profile_version, weather_scope_id: row.weather_scope_id, event_pool_profile_id, event_pool_profile_version, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) }; }));
  put('spatial_v3_world_route_endpoint_bindings', endpoints.map((row) => { const [world_route_id, world_route_version] = pin(row.world_route_ref); const [route_point_id, route_point_version] = pin(row.route_point_ref); const [directional_exit_id, directional_exit_version] = pin(row.directional_exit_ref); return { id: row.id, version: version(row.version), world_revision_id: WORLD_REVISION, world_route_id, world_route_version, endpoint_role: row.endpoint_role, route_point_id, route_point_version, canonical_g5_id: row.canonical_g5_id, canonical_g5_version: 1, directional_exit_id, directional_exit_version, scene_endpoint_slot_key: row.scene_endpoint_slot_key, status: row.status, provenance_ref: row.provenance_ref, canonical_digest: digest(row) }; }));
  const dependencyRows = dependencies.map((row) => { const [source_entity_id, source_version] = pin(row.source_ref); const [target_entity_id, target_version] = pin(row.target_ref); return { source_entity_kind: classifyP12DependencyEntityId(source_entity_id), source_entity_id, source_version, world_revision_id: WORLD_REVISION, dependency_role: row.dependency_role, target_entity_kind: classifyP12DependencyEntityId(target_entity_id), target_entity_id, target_version, canonical_ordinal: row.canonical_ordinal, provenance_ref: row.provenance_ref }; });
  put('spatial_v3_authoring_dependency_edges', dependencyRows);
  const authoring = new Map();
  const addAuthored = (kind, collection) => { for (const row of collection) authoring.set(`${kind}:${row.id}:${version(row.version)}`, authored(kind, row)); };
  addAuthored('spatial_node', nodes); addAuthored('scene_materialization_profile', profiles); addAuthored('transition_environment_profile', environments); addAuthored('movement_method_cost_profile', costs); addAuthored('dynamic_recheck_policy', rechecks); addAuthored('g4_directional_exit', exits); addAuthored('world_route', routes); addAuthored('world_route_point', points); addAuthored('world_route_segment', segments); addAuthored('world_route_endpoint_binding', endpoints);
  for (const edge of dependencyRows) for (const [kind, id, v] of [[edge.source_entity_kind, edge.source_entity_id, edge.source_version], [edge.target_entity_kind, edge.target_entity_id, edge.target_version]]) {
    const key = `${kind}:${id}:${v}`; if (!authoring.has(key)) authoring.set(key, { entity_kind: kind, entity_id: id, version: v, world_revision_id: WORLD_REVISION, canonical_digest: digest({ kind, id, v }), status: 'approved', provenance_ref: PROVENANCE });
  }
  put('spatial_v3_authoring_versions', [...authoring.values()]);
  for (const [table, expected] of [
    ['spatial_v3_g4_directional_exits', 86], ['spatial_v3_topological_direction_contexts', 86],
    ['spatial_v3_world_routes', 86], ['spatial_v3_world_route_segments', 86],
    ['spatial_v3_world_route_points', 172], ['spatial_v3_world_route_endpoint_bindings', 172]
  ]) if (rows.get(table)?.length !== expected) throw new Error(`P12_V11_DIRECTIONAL_TARGET_COUNT_INVALID:${table}`);
  return Object.freeze({ rows, counts: Object.freeze(Object.fromEntries([...rows].map(([table, values]) => [table, values.length]))) });
}

export async function buildP12V11PhysicalProjectionSql({ root = ROOT, rollback = false, wrapTransaction = true, temporaryTablePrefix = 'p12_projection_candidate' } = {}) {
  const projectRoot = resolve(root);
  const compiled = await compileP12V11PhysicalRows({ root: projectRoot });
  const closureAuthoring = JSON.parse(await readFile(resolve(projectRoot, 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/datasets/spatial_v3_authoring_versions.json'), 'utf8'));
  const existingKeys = new Set(closureAuthoring.map((row) => `${row.entity_kind}:${row.entity_id}:${row.version}`));
  compiled.rows.set('spatial_v3_authoring_versions', compiled.rows.get('spatial_v3_authoring_versions').filter((row) => !existingKeys.has(`${row.entity_kind}:${row.entity_id}:${row.version}`)));
  const requestedOrder = [
    'spatial_v3_authoring_versions', 'spatial_v3_nodes', 'spatial_v3_node_classes', 'spatial_v3_node_parents',
    'spatial_v3_topological_movement_orientation_profiles', 'spatial_v3_topological_exit_orientation_rules',
    'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles', 'spatial_v3_dynamic_recheck_policies',
    'spatial_v3_canonical_g5_connection_profiles', 'spatial_v3_approved_physical_source_pairs',
    'spatial_v3_canonical_g5_connection_bindings', 'spatial_v3_g4_entry_endpoint_bindings', 'spatial_v3_topological_direction_contexts',
    'spatial_v3_g4_traversal_profiles', 'spatial_v3_scene_materialization_profiles', 'spatial_v3_scene_materialization_candidates',
    'spatial_v3_g4_directional_exits', 'spatial_v3_world_routes', 'spatial_v3_world_route_points',
    'spatial_v3_world_route_segments', 'spatial_v3_world_route_segment_spatial_contexts', 'spatial_v3_world_route_endpoint_bindings',
    'spatial_v3_authoring_dependency_edges'
  ];
  const registry = JSON.parse(await readFile(resolve(projectRoot, 'data/contracts/spatial-v3/world-base-import-registry.v1.json'), 'utf8'));
  const rank = new Map(registry.dependency_order.flat().map((table, index) => [table, index]));
  const order = requestedOrder.toSorted((left, right) => (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER));
  const temporary = await mkdtemp(join(tmpdir(), 'p12-v11-projection-'));
  try {
    const datasets = [];
    for (const table of order) {
      const rows = compiled.rows.get(table) ?? [];
      const file = `${table}.json`; const content = `${JSON.stringify(rows, null, 2)}\n`;
      await writeFile(join(temporary, file), content, 'utf8');
      datasets.push({ table, file, sha256: createHash('sha256').update(content).digest('hex'), status: 'approved', provenance_ref: PROVENANCE, delete_policy: 'forbid', depends_on: [] });
    }
    const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'p12_v1_1_physical_projection', world_revision_id: WORLD_REVISION, status: 'approved', provenance_ref: PROVENANCE, delete_policy: 'forbid', datasets, data_gaps: [] };
    await writeFile(join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return await buildTransactionalImportSql({ root: projectRoot, manifestPath: join(temporary, 'manifest.json'), rollback, wrapTransaction, temporaryTablePrefix });
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function zipJson(zip, path) {
  const { stdout } = await execFile('tar', ['-xOf', zip, `${PACKAGE}/${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return JSON.parse(stdout);
}

export async function assessP12V11PhysicalProjection({ root = ROOT } = {}) {
  const projectRoot = resolve(root);
  const zip = resolve(projectRoot, ZIP);
  const [matrix, ddl] = await Promise.all([
    zipJson(zip, 'data/ddl-contract-matrix.json'),
    buildWorldBaseSchemaReference({ root: projectRoot })
  ]);
  const tables = new Set(ddl.schema.tables.map((table) => table.name));
  const errors = [];
  const coverage = [];
  for (const contract of matrix.records) {
    if (contract.storage === 'compiler_staging_value') {
      coverage.push({ contract_name: contract.contract_name, disposition: 'compiler_staging_only', row_file: contract.row_file });
      continue;
    }
    const table = mappings[contract.contract_name];
    const rows = await zipJson(zip, contract.row_file);
    const countValid = Array.isArray(rows.records) && rows.records.length === contract.expected_rows;
    const disposition = table && tables.has(table) && countValid && compiledContracts.has(contract.contract_name) ? 'physical_table_and_compiler_present' : 'hard_gap';
    coverage.push({ contract_name: contract.contract_name, table: table ?? null, expected_rows: contract.expected_rows, actual_rows: rows.records?.length ?? null, disposition });
    if (disposition === 'hard_gap') errors.push({
      code: 'P12_V11_PHYSICAL_CONTRACT_COVERAGE_GAP',
      subject_ref: contract.contract_name,
      dependency_pins: Object.freeze([contract.row_file, table ?? 'unmapped']),
      blocking: true
    });
  }
  return Object.freeze({ ok: errors.length === 0, compilation_authorized: errors.length === 0, errors: Object.freeze(errors), coverage: Object.freeze(coverage) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await assessP12V11PhysicalProjection();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
