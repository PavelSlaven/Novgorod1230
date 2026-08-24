import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';
import {
  buildNpcReactionPolicySnapshotFromAuthoringRow
} from '@rus/npc-runtime';

const SOURCES = Object.freeze({
  node: 'world_base.spatial_v3_nodes', route: 'world_base.spatial_v3_world_routes',
  profile: 'world_base.spatial_v3_scene_materialization_profiles', template: 'world_base.spatial_v3_scene_templates',
  orientation_profile: 'world_base.spatial_v3_movement_orientation_profiles', movement_cost_profile: 'world_base.spatial_v3_movement_method_cost_profiles'
});
const COLUMNS = Object.freeze({
  node: 'id,version,world_revision_id,spatial_level,primary_class_id,status,canonical_digest', route: 'id,version,world_revision_id,route_kind_id,status,canonical_digest',
  profile: 'id,version,world_revision_id,source_kind,source_entity_id,source_entity_version,selection_rule_id,selection_rule_version,status,canonical_digest', template: 'id,version,world_revision_id,regional_template_id,regional_template_version,status,canonical_digest',
  orientation_profile: 'id,version,world_revision_id,reference_frame_id,reference_frame_version,profile_kind,fixed_local_azimuth_mdeg,vertical_direction,status,canonical_digest', movement_cost_profile: 'id,version,world_revision_id,baseline_movement_method_id,status,canonical_digest'
});
const SCENE_TEMPLATE_CLOSURE_COLUMNS = Object.freeze({
  spatial_v3_g6_template_slots: 'scene_slot_key,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity',
  spatial_v3_scene_position_templates: 'position_slot_key,g6_scene_slot_key,position_type_id,capacity,access_class_id',
  spatial_v3_scene_movement_edge_templates: 'edge_slot_key,from_position_slot_key,to_position_slot_key,reverse_edge_slot_key,passage_type_id,transition_environment_profile_id,transition_environment_profile_version,movement_orientation_profile_id,movement_orientation_profile_version,cost_kind,action_units,baseline_movement_method_id,movement_method_cost_profile_id,movement_method_cost_profile_version,base_minutes,dynamic_recheck_policy_id,dynamic_recheck_policy_version,capacity,portal_template_id,portal_template_version,availability_condition_set_id,availability_condition_set_version',
  spatial_v3_visibility_link_templates: 'link_slot_key,from_position_slot_key,to_position_slot_key,reverse_link_slot_key,quality,distance_band,portal_template_id,portal_template_version,condition_profile_id,condition_profile_version'
});
const ENTITY_KINDS = Object.freeze({ node: 'canonical_spatial_node', route: 'world_route', profile: 'scene_materialization_profile', template: 'scene_template', orientation_profile: 'movement_orientation_profile', movement_cost_profile: 'movement_method_cost_profile' });
function failure(code, kind, id, diagnostics = {}) { const subject_ref = { entity_kind: ENTITY_KINDS[kind] ?? 'world_revision', entity_id: id || 'unknown' }; const pin = { dependency_role: 'source_authoring', entity_ref: subject_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'required' } }; return Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref, dependency_pins: { pins: [pin], canonical_digest: computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '') }, diagnostics }) }); }
function exact(ref) { return ref && typeof ref.id === 'string' && ref.id.trim() && Number.isInteger(ref.version) && ref.version > 0 && typeof ref.world_revision_id === 'string' && ref.world_revision_id.trim() && typeof ref.canonical_digest === 'string' && /^[a-f0-9]{64}$/i.test(ref.canonical_digest); }

const REACTION_RECORD_COLUMNS = Object.freeze([
  'record_id',
  'family_id',
  'record_kind',
  'record_version',
  'applicability',
  'status',
  'provenance_refs',
  'normalized_reference_ids',
  'source_history_refs',
  'payload',
  'canonical_digest'
]);
const reactionRecordColumnsSql = REACTION_RECORD_COLUMNS.join(',');

function reactionFailure(ref, diagnostics = {}) {
  const subject_ref = {
    entity_kind: 'source_record',
    entity_id: ref?.id ?? ref?.record_id ?? 'unknown'
  };
  const pin = {
    dependency_role: 'source_dependency',
    entity_ref: subject_ref,
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(ref?.version ?? ref?.record_version ?? 'required')
    }
  };
  return Object.freeze({
    ok: false,
    error: createSpatialV3TypedError('npc_decision_policy_gap', {
      subject_ref,
      dependency_pins: {
        pins: [pin],
        canonical_digest:
          computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '')
      },
      diagnostics
    })
  });
}

function exactReactionRef(ref) {
  return ref
    && typeof ref.id === 'string'
    && ref.id.length > 0
    && /^[1-9][0-9]*$/u.test(String(ref.version ?? ''))
    && typeof ref.canonical_digest === 'string'
    && /^[a-f0-9]{64}$/iu.test(ref.canonical_digest);
}

/** Read-only authoring reader. Every lookup requires one explicit version and revision pin. */
export function createSpatialV3WorldBaseReader({ query } = {}) {
  async function read({ kind, ref } = {}) {
    if (!SOURCES[kind] || !exact(ref)) return failure('authoring_dependency_pin_missing', kind ?? 'authoring', ref?.id, { kind });
    if (typeof query !== 'function') return failure('generated_schema_mismatch', kind, ref.id, { reason: 'read-only query port is required' });
    const result = await query(`SELECT ${COLUMNS[kind]} FROM ${SOURCES[kind]} WHERE id=$1 AND version=$2 AND world_revision_id=$3 AND canonical_digest=$4 LIMIT 2`, [ref.id, ref.version, ref.world_revision_id, ref.canonical_digest]);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) return failure(result?.rows?.length > 1 ? 'route_plan_version_pin_missing' : 'route_plan_snapshot_missing', kind, ref.id, { version: ref.version, world_revision_id: ref.world_revision_id });
    return Object.freeze({ ok: true, value: Object.freeze(structuredClone(result.rows[0])), ref: Object.freeze({ ...ref }) });
  }
  async function readNpcReactionPolicy(ref) {
    if (!exactReactionRef(ref)) {
      return reactionFailure(ref, { reason: 'exact_record_pin_required' });
    }
    if (typeof query !== 'function') {
      return reactionFailure(ref, { reason: 'read_only_query_port_required' });
    }
    const result = await query(
      `SELECT ${reactionRecordColumnsSql} FROM world_base.temporal_authoring_records WHERE record_id=$1 AND record_version=$2 AND canonical_digest=$3 AND record_kind='npc_reaction_policy' AND status='approved' LIMIT 2`,
      [ref.id, String(ref.version), ref.canonical_digest]
    );
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      return reactionFailure(ref, {
        reason: result?.rows?.length > 1
          ? 'ambiguous_approved_record'
          : 'approved_record_missing'
      });
    }
    return buildNpcReactionPolicySnapshotFromAuthoringRow(result.rows[0]);
  }
  async function readSceneTemplateClosure(ref) {
    const header = await read({ kind: 'template', ref });
    if (!header.ok) return header;
    return composeSceneTemplateClosure(header.value, ref);
  }
  async function readPinnedSceneTemplateClosure({ id, version, world_revision_id } = {}) {
    if (typeof id !== 'string' || !id.trim() || !Number.isInteger(version)
      || version < 1 || typeof world_revision_id !== 'string'
      || !world_revision_id.trim()) {
      return failure('authoring_dependency_pin_missing', 'template', id, {
        reason: 'exact_template_header_pin_required'
      });
    }
    if (typeof query !== 'function') {
      return failure('generated_schema_mismatch', 'template', id, {
        reason: 'read-only query port is required'
      });
    }
    const result = await query(
      `SELECT ${COLUMNS.template} FROM ${SOURCES.template} WHERE id=$1 AND version=$2 AND world_revision_id=$3 AND status='approved' LIMIT 2`,
      [id, version, world_revision_id]
    );
    if (!Array.isArray(result?.rows) || result.rows.length !== 1
      || !exact(result.rows[0])) {
      return failure('route_plan_snapshot_missing', 'template', id, {
        reason: result?.rows?.length > 1
          ? 'ambiguous_approved_scene_template'
          : 'approved_scene_template_missing',
        version,
        world_revision_id
      });
    }
    const header = Object.freeze(structuredClone(result.rows[0]));
    return composeSceneTemplateClosure(header, header);
  }
  async function readPinnedCanonicalG5SceneBinding({ id, version,
    world_revision_id } = {}) {
    if (typeof id !== 'string' || !id.trim() || !Number.isInteger(version)
      || version < 1 || typeof world_revision_id !== 'string'
      || !world_revision_id.trim()) {
      return failure('authoring_dependency_pin_missing', 'node', id, {
        reason: 'exact_canonical_g5_pin_required'
      });
    }
    if (typeof query !== 'function') {
      return failure('generated_schema_mismatch', 'node', id, {
        reason: 'read-only query port is required'
      });
    }
    const result = await query(`SELECT n.id,n.version,n.world_revision_id,
      n.spatial_level,n.primary_class_id,n.status,n.canonical_digest,
      parent.parent_id,parent.parent_version,
      profile.id AS materialization_profile_id,
      profile.version AS materialization_profile_version,
      profile.canonical_digest AS materialization_profile_digest,
      candidate.scene_template_id,candidate.scene_template_version
      FROM world_base.spatial_v3_nodes n
      JOIN world_base.spatial_v3_node_parents parent
        ON parent.child_id=n.id AND parent.child_version=n.version
       AND parent.world_revision_id=n.world_revision_id
      JOIN world_base.spatial_v3_scene_materialization_profiles profile
        ON profile.source_kind='canonical_g5'
       AND profile.source_entity_id=n.id
       AND profile.source_entity_version=n.version
       AND profile.world_revision_id=n.world_revision_id
       AND profile.status='approved'
      JOIN world_base.spatial_v3_scene_materialization_candidates candidate
        ON candidate.profile_id=profile.id
       AND candidate.profile_version=profile.version
      WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
        AND n.spatial_level='G5' AND n.status='approved' LIMIT 2`,
    [id, version, world_revision_id]);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      return failure('route_plan_snapshot_missing', 'node', id, {
        reason: result?.rows?.length > 1
          ? 'ambiguous_canonical_g5_scene_binding'
          : 'canonical_g5_scene_binding_missing', version, world_revision_id
      });
    }
    return Object.freeze({ ok: true,
      value: Object.freeze(structuredClone(result.rows[0])) });
  }
  async function composeSceneTemplateClosure(header, ref) {
    const tables = Object.keys(SCENE_TEMPLATE_CLOSURE_COLUMNS);
    const results = await Promise.all(tables.map((table) => query(`SELECT ${SCENE_TEMPLATE_CLOSURE_COLUMNS[table]} FROM world_base.${table} WHERE scene_template_id=$1 AND scene_template_version=$2`, [header.id, header.version])));
    if (results.some((result) => !Array.isArray(result?.rows))) return failure('route_plan_snapshot_missing', 'template', ref.id, { reason: 'scene_template_closure_missing' });
    return Object.freeze({ ok: true, value: Object.freeze({ header,
      g6_slots: structuredClone(results[0].rows), position_slots: structuredClone(results[1].rows),
      movement_edges: structuredClone(results[2].rows), visibility_links: structuredClone(results[3].rows) }), ref: Object.freeze({ ...ref }) });
  }
  return Object.freeze({
    read,
    readNode: (ref) => read({ kind: 'node', ref }),
    readRoute: (ref) => read({ kind: 'route', ref }),
    readProfile: (ref) => read({ kind: 'profile', ref }),
    readTemplate: (ref) => read({ kind: 'template', ref }),
    readSceneTemplateClosure,
    readPinnedSceneTemplateClosure,
    readPinnedCanonicalG5SceneBinding,
    readOrientationProfile: (ref) =>
      read({ kind: 'orientation_profile', ref }),
    readMovementCostProfile: (ref) =>
      read({ kind: 'movement_cost_profile', ref }),
    readNpcReactionPolicy
  });
}

export { buildNpcReactionPolicySnapshotFromAuthoringRow };
