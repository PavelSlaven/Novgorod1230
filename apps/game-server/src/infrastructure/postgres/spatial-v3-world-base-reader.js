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
  spatial_v3_g6_template_slots: 'scene_slot_key,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,enclosing_structure_slot_key',
  spatial_v3_scene_position_templates: 'position_slot_key,g6_scene_slot_key,instance_count,position_type_id,capacity,access_class_id',
  spatial_v3_scene_endpoint_slots: 'slot_key,endpoint_role,required_position_slot_key,required_position_instance_ordinal',
  spatial_v3_scene_movement_edge_templates: 'edge_slot_key,from_position_slot_key,to_position_slot_key,reverse_edge_slot_key,passage_type_id,transition_environment_profile_id,transition_environment_profile_version,movement_orientation_profile_id,movement_orientation_profile_version,cost_kind,action_units,baseline_movement_method_id,movement_method_cost_profile_id,movement_method_cost_profile_version,base_minutes,dynamic_recheck_policy_id,dynamic_recheck_policy_version,capacity,portal_template_id,portal_template_version,availability_condition_set_id,availability_condition_set_version',
  spatial_v3_visibility_link_templates: 'link_slot_key,from_position_slot_key,to_position_slot_key,reverse_link_slot_key,quality,distance_band,portal_template_id,portal_template_version,condition_profile_id,condition_profile_version',
  spatial_v3_acoustic_edge_templates: 'edge_slot_key,from_g6_scene_slot_key,to_g6_scene_slot_key,base_loss,portal_template_id,portal_template_version,closed_extra_loss,reverse_edge_slot_key,condition_profile_id,condition_profile_version',
  spatial_v3_portal_templates: 'id,version,portal_slot_key,portal_class_id,default_state,controlling_structure_slot_key,status,provenance_ref,canonical_digest',
  spatial_v3_portal_state_template_behaviors: 'portal_template_id,portal_template_version,relation_kind,state,behavior_id,behavior_version',
  spatial_v3_stable_structure_templates: 'structure_slot_key,structure_class_id,material_profile_id,material_profile_version,state_profile_id,state_profile_version,evidence_ref'
});
const ENTITY_KINDS = Object.freeze({ node: 'canonical_spatial_node', route: 'world_route', profile: 'scene_materialization_profile', template: 'scene_template', orientation_profile: 'movement_orientation_profile', movement_cost_profile: 'movement_method_cost_profile', npc_composition: 'canonical_spatial_node', npc_runtime_profile: 'canonical_spatial_node', npc_regional_context: 'canonical_spatial_node' });
function failure(code, kind, id, diagnostics = {}) { const subject_ref = { entity_kind: ENTITY_KINDS[kind] ?? 'world_revision', entity_id: id || 'unknown' }; const pin = { dependency_role: 'source_authoring', entity_ref: subject_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'required' } }; return Object.freeze({ ok: false, error: createSpatialV3TypedError(code, { subject_ref, dependency_pins: { pins: [pin], canonical_digest: computeSpatialV3CanonicalDigest([pin]).replace('sha256:', '') }, diagnostics }) }); }
function exact(ref) { return ref && typeof ref.id === 'string' && ref.id.trim() && Number.isInteger(ref.version) && ref.version > 0 && typeof ref.world_revision_id === 'string' && ref.world_revision_id.trim() && typeof ref.canonical_digest === 'string' && /^[a-f0-9]{64}$/i.test(ref.canonical_digest); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

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
      `WITH RECURSIVE revision_ancestry(id) AS (
         SELECT $3::text
         UNION
         SELECT parent.parent_revision_id
         FROM world_base.spatial_v3_world_revisions parent
         JOIN revision_ancestry child ON parent.id=child.id
         WHERE parent.parent_revision_id IS NOT NULL
       )
       SELECT t.${COLUMNS.template.replaceAll(',', ',t.')}
       FROM ${SOURCES.template} t
       JOIN world_base.spatial_v3_regional_scene_template_bases b
         ON b.id=t.regional_template_id AND b.version=t.regional_template_version
       JOIN revision_ancestry ancestry ON ancestry.id=b.world_revision_id
       JOIN world_base.spatial_v3_authoring_versions av
         ON av.entity_kind='regional_scene_template_basis' AND av.entity_id=b.id
        AND av.version=b.version AND av.world_revision_id=b.world_revision_id
       WHERE t.id=$1 AND t.version=$2 AND t.world_revision_id=$3
         AND t.status='approved' AND b.status='approved' AND av.status='approved'
         AND (b.world_revision_id<>t.world_revision_id
           OR t.canonical_digest=b.canonical_digest)
       LIMIT 2`,
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
  async function readPinnedG5AcousticClosure({ g5_template, scene_template,
    world_revision_id } = {}) {
    const invalid = (reason) => failure('authoring_dependency_pin_missing',
      'template', g5_template?.id, { reason });
    if (!exact(g5_template) || !exact(scene_template)
        || g5_template.world_revision_id !== world_revision_id
        || scene_template.world_revision_id !== world_revision_id) {
      return invalid('exact_generated_template_and_scene_template_pins_required');
    }
    if (typeof query !== 'function') {
      return failure('generated_schema_mismatch', 'template', g5_template.id,
        { reason: 'read-only query port is required' });
    }
    const result = await query(`SELECT b.id,b.version,b.world_revision_id,
      b.g5_template_id,b.g5_template_version,b.scene_template_id,
      b.scene_template_version,b.g6_scene_slot_key,b.ambient_noise,
      b.directness,b.confidence,b.status,b.provenance_ref,b.canonical_digest,
      bav.status AS authoring_status,bav.canonical_digest AS authoring_digest,
      g.status AS g5_template_status,g.canonical_digest AS g5_template_digest,
      gav.status AS g5_authoring_status,
      gav.canonical_digest AS g5_authoring_digest,
      p.status AS profile_status,pav.status AS profile_authoring_status,
      p.canonical_digest AS profile_digest,
      pav.canonical_digest AS profile_authoring_digest,
      s.status AS scene_template_status,s.canonical_digest AS scene_template_digest,
      sb.status AS scene_basis_status,sb.canonical_digest AS scene_basis_digest,
      sav.status AS scene_authoring_status,
      sav.canonical_digest AS scene_authoring_digest,
      slot.acoustic_uniformity,wr.status AS world_revision_status
      FROM world_base.spatial_v3_g5_generation_templates g
      JOIN world_base.spatial_v3_world_revisions wr
        ON wr.id=g.world_revision_id AND wr.status='approved'
      JOIN world_base.spatial_v3_authoring_versions gav
        ON gav.entity_kind='g5_generation_template' AND gav.entity_id=g.id
       AND gav.version=g.version AND gav.world_revision_id=g.world_revision_id
       AND gav.status='approved' AND gav.canonical_digest=g.canonical_digest
      JOIN world_base.spatial_v3_scene_materialization_profiles p
        ON p.id=g.scene_materialization_profile_id
       AND p.version=g.scene_materialization_profile_version
       AND p.world_revision_id=g.world_revision_id
       AND p.source_kind='g5_generation_template'
       AND p.source_entity_id=g.id AND p.source_entity_version=g.version
       AND p.status='approved'
      JOIN world_base.spatial_v3_authoring_versions pav
        ON pav.entity_kind='scene_materialization_profile'
       AND pav.entity_id=p.id AND pav.version=p.version
       AND pav.world_revision_id=p.world_revision_id
       AND pav.status='approved' AND pav.canonical_digest=p.canonical_digest
      JOIN world_base.spatial_v3_scene_materialization_candidates c
        ON c.profile_id=p.id AND c.profile_version=p.version
       AND c.scene_template_id=$4 AND c.scene_template_version=$5
      JOIN world_base.spatial_v3_scene_templates s
        ON s.id=c.scene_template_id AND s.version=c.scene_template_version
       AND s.world_revision_id=g.world_revision_id AND s.status='approved'
      JOIN world_base.spatial_v3_regional_scene_template_bases sb
        ON sb.id=s.regional_template_id
       AND sb.version=s.regional_template_version
       AND sb.world_revision_id=s.world_revision_id AND sb.status='approved'
      JOIN world_base.spatial_v3_authoring_versions sav
        ON sav.entity_kind='regional_scene_template_basis'
       AND sav.entity_id=sb.id AND sav.version=sb.version
       AND sav.world_revision_id=sb.world_revision_id
       AND sav.status='approved' AND sav.canonical_digest=sb.canonical_digest
      JOIN world_base.spatial_v3_g6_template_slots slot
        ON slot.scene_template_id=s.id AND slot.scene_template_version=s.version
      LEFT JOIN world_base.spatial_v3_g6_acoustic_baselines b
        ON b.g5_template_id=g.id AND b.g5_template_version=g.version
       AND b.scene_template_id=s.id AND b.scene_template_version=s.version
       AND b.g6_scene_slot_key=slot.scene_slot_key
       AND b.world_revision_id=g.world_revision_id
      LEFT JOIN world_base.spatial_v3_authoring_versions bav
        ON bav.entity_kind='g6_acoustic_baseline' AND bav.entity_id=b.id
       AND bav.version=b.version AND bav.world_revision_id=b.world_revision_id
      WHERE g.id=$1 AND g.version=$2 AND g.world_revision_id=$3
        AND g.status='approved' AND g.canonical_digest=$6
        AND s.id=$4 AND s.version=$5 AND s.canonical_digest=$7
      ORDER BY slot.scene_slot_key`, [g5_template.id, g5_template.version,
      world_revision_id, scene_template.id, scene_template.version,
      g5_template.canonical_digest, scene_template.canonical_digest]);
    const rows = result?.rows;
    const valid = Array.isArray(rows) && rows.length > 0
      && rows.every((row) => row.id && Number.isInteger(row.ambient_noise)
        && row.ambient_noise >= 0 && row.ambient_noise <= 2
        && row.status === 'approved' && row.authoring_status === 'approved'
        && row.canonical_digest === row.authoring_digest
        && row.g5_template_status === 'approved'
        && row.world_revision_status === 'approved'
        && row.g5_authoring_status === 'approved'
        && row.g5_template_digest === row.g5_authoring_digest
        && row.profile_status === 'approved'
        && row.profile_authoring_status === 'approved'
        && row.profile_digest === row.profile_authoring_digest
        && row.scene_template_status === 'approved'
        && row.scene_authoring_status === 'approved'
        && row.scene_basis_status === 'approved'
        && row.scene_template_digest === row.scene_authoring_digest
        && row.scene_template_digest === row.scene_basis_digest
        && row.acoustic_uniformity === 'uniform'
        && row.directness && row.confidence && row.provenance_ref
        && row.g5_template_id === g5_template.id
        && row.g5_template_version === g5_template.version
        && row.scene_template_id === scene_template.id
        && row.scene_template_version === scene_template.version
        && row.world_revision_id === world_revision_id)
      && new Set(rows.map(({ g6_scene_slot_key: key }) => key)).size
        === rows.length;
    if (!valid) return failure('route_plan_snapshot_missing', 'template',
      g5_template.id, { reason: 'approved_g6_acoustic_baseline_closure_missing_or_invalid',
        scene_template_id: scene_template.id,
        scene_template_version: scene_template.version,
        world_revision_id });
    const value = deepFreeze({ rows: structuredClone(rows) });
    return Object.freeze({ ok: true, value,
      ref: Object.freeze({ g5_template: { ...g5_template },
        scene_template: { ...scene_template }, world_revision_id }) });
  }
  async function readPinnedCanonicalG5AcousticClosure({ canonical_g5,
    scene_template, world_revision_id } = {}) {
    const invalid = (reason) => failure('authoring_dependency_pin_missing',
      'node', canonical_g5?.id, { reason });
    if (!exact(canonical_g5) || !exact(scene_template)
        || canonical_g5.world_revision_id !== world_revision_id
        || scene_template.world_revision_id !== world_revision_id) {
      return invalid('exact_canonical_g5_and_scene_template_pins_required');
    }
    if (typeof query !== 'function') {
      return failure('generated_schema_mismatch', 'node', canonical_g5.id,
        { reason: 'read-only query port is required' });
    }
    const result = await query(`SELECT b.id,b.version,b.world_revision_id,
      b.g5_template_id,b.g5_template_version,b.canonical_g5_id,
      b.canonical_g5_version,b.scene_template_id,b.scene_template_version,
      b.g6_scene_slot_key,b.ambient_noise,b.directness,b.confidence,b.status,
      b.provenance_ref,b.canonical_digest,
      bav.status AS authoring_status,bav.canonical_digest AS authoring_digest,
      n.status AS canonical_g5_status,n.canonical_digest AS canonical_g5_digest,
      nav.status AS canonical_g5_authoring_status,
      nav.canonical_digest AS canonical_g5_authoring_digest,
      p.id AS profile_id,p.version AS profile_version,
      p.status AS profile_status,p.canonical_digest AS profile_digest,
      pav.status AS profile_authoring_status,
      pav.canonical_digest AS profile_authoring_digest,
      s.status AS scene_template_status,s.canonical_digest AS scene_template_digest,
      sb.status AS scene_basis_status,sb.canonical_digest AS scene_basis_digest,
      sav.status AS scene_authoring_status,
      sav.canonical_digest AS scene_authoring_digest,
      slot.acoustic_uniformity,wr.status AS world_revision_status
      FROM world_base.spatial_v3_nodes n
      JOIN world_base.spatial_v3_world_revisions wr
        ON wr.id=n.world_revision_id AND wr.status='approved'
      JOIN world_base.spatial_v3_authoring_versions nav
        ON nav.entity_kind='spatial_node' AND nav.entity_id=n.id
       AND nav.version=n.version AND nav.world_revision_id=n.world_revision_id
       AND nav.status='approved' AND nav.canonical_digest=n.canonical_digest
      JOIN world_base.spatial_v3_scene_materialization_profiles p
        ON p.source_kind='canonical_g5' AND p.source_entity_id=n.id
       AND p.source_entity_version=n.version
       AND p.world_revision_id=n.world_revision_id AND p.status='approved'
      JOIN world_base.spatial_v3_authoring_versions pav
        ON pav.entity_kind='scene_materialization_profile'
       AND pav.entity_id=p.id AND pav.version=p.version
       AND pav.world_revision_id=p.world_revision_id
       AND pav.status='approved' AND pav.canonical_digest=p.canonical_digest
      JOIN world_base.spatial_v3_scene_materialization_candidates c
        ON c.profile_id=p.id AND c.profile_version=p.version
       AND c.scene_template_id=$4 AND c.scene_template_version=$5
      JOIN world_base.spatial_v3_scene_templates s
        ON s.id=c.scene_template_id AND s.version=c.scene_template_version
       AND s.world_revision_id=n.world_revision_id AND s.status='approved'
      JOIN world_base.spatial_v3_regional_scene_template_bases sb
        ON sb.id=s.regional_template_id
       AND sb.version=s.regional_template_version
       AND sb.world_revision_id=s.world_revision_id AND sb.status='approved'
      JOIN world_base.spatial_v3_authoring_versions sav
        ON sav.entity_kind='regional_scene_template_basis'
       AND sav.entity_id=sb.id AND sav.version=sb.version
       AND sav.world_revision_id=sb.world_revision_id
       AND sav.status='approved' AND sav.canonical_digest=sb.canonical_digest
      JOIN world_base.spatial_v3_g6_template_slots slot
        ON slot.scene_template_id=s.id AND slot.scene_template_version=s.version
      LEFT JOIN world_base.spatial_v3_g6_acoustic_baselines b
        ON b.canonical_g5_id=n.id AND b.canonical_g5_version=n.version
       AND b.scene_template_id=s.id AND b.scene_template_version=s.version
       AND b.g6_scene_slot_key=slot.scene_slot_key
       AND b.world_revision_id=n.world_revision_id
      LEFT JOIN world_base.spatial_v3_authoring_versions bav
        ON bav.entity_kind='g6_acoustic_baseline' AND bav.entity_id=b.id
       AND bav.version=b.version AND bav.world_revision_id=b.world_revision_id
      WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
        AND n.spatial_level='G5' AND n.status='approved'
        AND n.canonical_digest=$6 AND s.id=$4 AND s.version=$5
        AND s.canonical_digest=$7
        AND s.canonical_digest=sb.canonical_digest
      ORDER BY slot.scene_slot_key`, [canonical_g5.id, canonical_g5.version,
      world_revision_id, scene_template.id, scene_template.version,
      canonical_g5.canonical_digest, scene_template.canonical_digest]);
    const rows = result?.rows;
    const valid = Array.isArray(rows) && rows.length > 0
      && rows.every((row) => row.id && Number.isInteger(row.ambient_noise)
        && row.ambient_noise >= 0 && row.ambient_noise <= 2
        && row.status === 'approved' && row.authoring_status === 'approved'
        && row.canonical_digest === row.authoring_digest
        && row.g5_template_id === null
        && row.canonical_g5_id === canonical_g5.id
        && row.canonical_g5_version === canonical_g5.version
        && row.canonical_g5_status === 'approved'
        && row.canonical_g5_digest === row.canonical_g5_authoring_digest
        && row.canonical_g5_authoring_status === 'approved'
        && row.world_revision_status === 'approved'
        && row.profile_status === 'approved'
        && row.profile_authoring_status === 'approved'
        && row.profile_digest === row.profile_authoring_digest
        && row.scene_template_status === 'approved'
        && row.scene_basis_status === 'approved'
        && row.scene_template_digest === row.scene_basis_digest
        && row.scene_authoring_status === 'approved'
        && row.scene_template_digest === row.scene_authoring_digest
        && row.acoustic_uniformity === 'uniform'
        && row.directness && row.confidence && row.provenance_ref
        && row.scene_template_id === scene_template.id
        && row.scene_template_version === scene_template.version
        && row.world_revision_id === world_revision_id)
      && new Set(rows.map(({ g6_scene_slot_key: key }) => key)).size
        === rows.length
      && new Set(rows.map(({ profile_id: id, profile_version: version }) =>
        `${id}:${version}`)).size === 1;
    if (!valid) return failure('route_plan_snapshot_missing', 'node',
      canonical_g5.id, { reason: 'approved_canonical_g5_acoustic_baseline_closure_missing_or_invalid',
        scene_template_id: scene_template.id,
        scene_template_version: scene_template.version, world_revision_id });
    const value = deepFreeze({ rows: structuredClone(rows) });
    return Object.freeze({ ok: true, value,
      ref: Object.freeze({ canonical_g5: { ...canonical_g5 },
        scene_template: { ...scene_template }, world_revision_id }) });
  }
  async function readPinnedG4NpcCompositionClosure({ g4,
    generation_template: generationTemplate, canonical_g5: canonicalG5 } = {}) {
    const invalid = (reason) => failure('authoring_dependency_pin_missing',
      'npc_composition', g4?.id, { reason });
    const hasGenerationTemplate = generationTemplate !== undefined;
    const hasCanonicalG5 = canonicalG5 !== undefined;
    const target = hasGenerationTemplate ? generationTemplate : canonicalG5;
    if (!exact(g4) || hasGenerationTemplate === hasCanonicalG5 || !exact(target)
        || g4.world_revision_id !== target.world_revision_id) {
      return invalid('exact_g4_and_one_same_revision_npc_target_pin_required');
    }
    if (typeof query !== 'function') {
      return failure('generated_schema_mismatch', 'npc_composition', g4.id,
        { reason: 'read-only query port is required' });
    }
    const revision = g4.world_revision_id;
    const targetResultPromise = hasGenerationTemplate
      ? query(`SELECT t.id,t.version,t.world_revision_id,t.g5_class_id,
        t.regional_template_id,t.regional_template_version,t.scene_materialization_profile_id,
        t.scene_materialization_profile_version,t.status,t.canonical_digest,
        av.status AS authoring_status,av.canonical_digest AS authoring_digest
        FROM world_base.spatial_v3_g5_generation_templates t
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind='g5_generation_template' AND av.entity_id=t.id
         AND av.version=t.version AND av.world_revision_id=t.world_revision_id
         AND av.status='approved' AND av.canonical_digest=t.canonical_digest
        WHERE t.id=$1 AND t.version=$2 AND t.world_revision_id=$3
          AND t.canonical_digest=$4 AND t.status='approved' LIMIT 2`,
      [target.id, target.version, revision, target.canonical_digest])
      : query(`SELECT n.id,n.version,n.world_revision_id,n.spatial_level,n.status,
        n.canonical_digest,av.status AS authoring_status,
        av.canonical_digest AS authoring_digest
        FROM world_base.spatial_v3_nodes n
        JOIN world_base.spatial_v3_node_parents parent
          ON parent.child_id=n.id AND parent.child_version=n.version
         AND parent.parent_id=$5 AND parent.parent_version=$6
         AND parent.world_revision_id=n.world_revision_id
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind='spatial_node' AND av.entity_id=n.id
         AND av.version=n.version AND av.world_revision_id=n.world_revision_id
         AND av.status='approved' AND av.canonical_digest=n.canonical_digest
        WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
          AND n.canonical_digest=$4 AND n.spatial_level='G5'
          AND n.status='approved' LIMIT 2`,
      [target.id, target.version, revision, target.canonical_digest,
        g4.id, g4.version]);
    const compositionResultPromise = hasGenerationTemplate
      ? query(`SELECT c.entity_kind,c.id,c.version,c.world_revision_id,c.g4_id,
        c.g4_version,c.generation_template_id,c.generation_template_version,
        c.canonical_g5_id,c.canonical_g5_version,c.min_count,c.max_count,c.payload,
        c.status,c.provenance_ref,c.directness,c.confidence,c.canonical_digest,
        av.status AS authoring_status,av.canonical_digest AS authoring_digest
        FROM world_base.spatial_v3_g4_npc_composition_bindings c
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind=c.entity_kind AND av.entity_id=c.id
         AND av.version=c.version AND av.world_revision_id=c.world_revision_id
         AND av.status='approved' AND av.canonical_digest=c.canonical_digest
        WHERE c.world_revision_id=$1 AND c.g4_id=$2 AND c.g4_version=$3
          AND c.generation_template_id=$4 AND c.generation_template_version=$5
          AND c.canonical_g5_id IS NULL AND c.status='approved'
        ORDER BY c.id,c.version LIMIT 2`,
      [revision, g4.id, g4.version, target.id, target.version])
      : query(`SELECT c.entity_kind,c.id,c.version,c.world_revision_id,c.g4_id,
        c.g4_version,c.generation_template_id,c.generation_template_version,
        c.canonical_g5_id,c.canonical_g5_version,c.min_count,c.max_count,c.payload,
        c.status,c.provenance_ref,c.directness,c.confidence,c.canonical_digest,
        av.status AS authoring_status,av.canonical_digest AS authoring_digest
        FROM world_base.spatial_v3_g4_npc_composition_bindings c
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind=c.entity_kind AND av.entity_id=c.id
         AND av.version=c.version AND av.world_revision_id=c.world_revision_id
         AND av.status='approved' AND av.canonical_digest=c.canonical_digest
        WHERE c.world_revision_id=$1 AND c.g4_id=$2 AND c.g4_version=$3
          AND c.canonical_g5_id=$4 AND c.canonical_g5_version=$5
          AND c.generation_template_id IS NULL AND c.status='approved'
        ORDER BY c.id,c.version LIMIT 2`,
      [revision, g4.id, g4.version, target.id, target.version]);
    const [nodeResult, targetResult, compositionResult] = await Promise.all([
      query(`SELECT n.id,n.version,n.world_revision_id,n.spatial_level,n.status,
        n.canonical_digest,av.status AS authoring_status,
        av.canonical_digest AS authoring_digest
        FROM world_base.spatial_v3_nodes n
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind='spatial_node' AND av.entity_id=n.id
         AND av.version=n.version AND av.world_revision_id=n.world_revision_id
         AND av.status='approved' AND av.canonical_digest=n.canonical_digest
        WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
          AND n.canonical_digest=$4 AND n.spatial_level='G4'
          AND n.status='approved' LIMIT 2`,
      [g4.id, g4.version, revision, g4.canonical_digest]),
      targetResultPromise,
      compositionResultPromise
    ]);
    const nodes = nodeResult?.rows;
    const targets = targetResult?.rows;
    const compositions = compositionResult?.rows;
    if (!Array.isArray(nodes) || nodes.length !== 1 || !Array.isArray(targets)
        || targets.length !== 1 || !Array.isArray(compositions)
        || compositions.length !== 1) {
      return failure('route_plan_snapshot_missing', 'npc_composition', g4.id, {
        reason: nodes?.length !== 1 ? 'approved_exact_g4_missing_or_ambiguous'
          : targets?.length !== 1 ? (hasGenerationTemplate
            ? 'approved_exact_generation_template_missing_or_ambiguous'
            : 'approved_exact_canonical_g5_missing_or_ambiguous')
            : compositions?.length > 1 ? 'ambiguous_approved_npc_composition'
              : 'approved_npc_composition_missing',
        target_id: target.id, target_version: target.version,
        target_kind: hasGenerationTemplate ? 'g5_generation_template' : 'canonical_g5',
        world_revision_id: revision
      });
    }
    const targetRow = targets[0];
    if (targetRow.id !== target.id || targetRow.version !== target.version
        || targetRow.world_revision_id !== revision || targetRow.status !== 'approved'
        || targetRow.authoring_status !== 'approved'
        || targetRow.canonical_digest !== target.canonical_digest
        || targetRow.authoring_digest !== target.canonical_digest
        || (hasCanonicalG5 && targetRow.spatial_level !== 'G5')) {
      return failure('route_plan_snapshot_missing', 'npc_composition', g4.id, {
        reason: 'approved_exact_npc_target_pin_mismatch',
        target_id: target.id, target_version: target.version,
        world_revision_id: revision
      });
    }
    const composition = compositions[0];
    const payload = composition.payload;
    const weightedProfiles = payload?.weighted_profile_refs;
    const countWeights = payload?.count_weights;
    const exactRefs = (refs) => Array.isArray(refs) && refs.every((ref) =>
      ref && typeof ref.id === 'string' && ref.id.trim()
        && Number.isInteger(ref.version) && ref.version > 0);
    if (composition.entity_kind !== 'g4_npc_composition_binding'
        || composition.g4_id !== g4.id || composition.g4_version !== g4.version
        || composition.generation_template_id !== (hasGenerationTemplate ? target.id : null)
        || composition.generation_template_version !== (hasGenerationTemplate ? target.version : null)
        || composition.canonical_g5_id !== (hasCanonicalG5 ? target.id : null)
        || composition.canonical_g5_version !== (hasCanonicalG5 ? target.version : null)
        || composition.world_revision_id !== revision
        || composition.status !== 'approved'
        || composition.authoring_status !== 'approved'
        || composition.authoring_digest !== composition.canonical_digest
        || !composition.provenance_ref || !composition.directness
        || !composition.confidence || !payload || typeof payload !== 'object'
        || !Array.isArray(weightedProfiles)
        || (composition.max_count > 0 && weightedProfiles.length === 0)
        || !exactRefs(weightedProfiles.map((entry) => entry?.profile_ref))
        || weightedProfiles.some((entry) => !Number.isSafeInteger(entry.weight)
          || entry.weight < 1)
        || new Set(weightedProfiles.map((entry) =>
          `${entry.profile_ref.id}:${entry.profile_ref.version}`)).size
          !== weightedProfiles.length
        || !Array.isArray(countWeights)
        || countWeights.length !== composition.max_count - composition.min_count + 1
        || countWeights.some((weight) => !Number.isSafeInteger(weight) || weight < 1)) {
      return failure('route_plan_snapshot_missing', 'npc_composition', g4.id, {
        reason: 'approved_npc_composition_payload_invalid',
        composition_id: composition.id, composition_version: composition.version
      });
    }
    const bindingRefs = weightedProfiles.map(({ profile_ref }) => profile_ref);
    const readRuntimeProfiles = async (refs) => {
      const rowsByRef = new Map();
      let pending = refs;
      while (pending.length) {
        const uniquePending = [...new Map(pending.map((ref) =>
          [`${ref.id}:${ref.version}`, ref])).values()]
          .filter((ref) => !rowsByRef.has(`${ref.id}:${ref.version}`));
        if (!uniquePending.length) break;
        const result = await query(`SELECT p.entity_kind,p.id,p.version,
          p.world_revision_id,p.profile_kind,p.role_ref,p.occupation_ref,p.payload,
          p.status,p.provenance_ref,p.directness,p.confidence,p.canonical_digest,
          av.status AS authoring_status,av.canonical_digest AS authoring_digest
          FROM unnest($1::text[],$2::int[]) AS wanted(id,version)
          JOIN world_base.spatial_v3_npc_runtime_profiles p
            ON p.id=wanted.id AND p.version=wanted.version
           AND p.world_revision_id=$3
          JOIN world_base.spatial_v3_authoring_versions av
            ON av.entity_kind=p.entity_kind AND av.entity_id=p.id
           AND av.version=p.version AND av.world_revision_id=p.world_revision_id
           AND av.status='approved' AND av.canonical_digest=p.canonical_digest
          WHERE p.status='approved' ORDER BY p.id,p.version`,
        [uniquePending.map((ref) => ref.id), uniquePending.map((ref) => ref.version), revision]);
        const rows = result?.rows;
        if (!Array.isArray(rows) || rows.length !== uniquePending.length) return null;
        const next = [];
        for (const row of rows) {
          if (row.entity_kind !== 'npc_runtime_profile'
              || row.world_revision_id !== revision || row.status !== 'approved'
              || row.authoring_status !== 'approved'
              || row.authoring_digest !== row.canonical_digest
              || !row.profile_kind || !row.provenance_ref || !row.directness
              || !row.confidence || !row.payload || typeof row.payload !== 'object') return null;
          const key = `${row.id}:${row.version}`;
          rowsByRef.set(key, row);
          if (row.profile_kind === 'npc_binding') {
            if (!row.role_ref || !row.occupation_ref
                || row.payload.role_ref !== row.role_ref
                || row.payload.occupation_ref !== row.occupation_ref
                || !exactRefs(row.payload.runtime_profile_refs)
                || !exactRefs(row.payload.regional_context_refs)
                || row.payload.runtime_profile_refs.length === 0
                || row.payload.regional_context_refs.length === 0) return null;
            next.push(...row.payload.runtime_profile_refs);
          } else if (row.payload.runtime_profile_refs !== undefined) {
            if (!exactRefs(row.payload.runtime_profile_refs)) return null;
            next.push(...row.payload.runtime_profile_refs);
          }
        }
        pending = next;
      }
      return [...rowsByRef.values()].sort((left, right) =>
        left.id.localeCompare(right.id) || left.version - right.version);
    };
    const runtimeProfiles = await readRuntimeProfiles(bindingRefs);
    if (!runtimeProfiles || bindingRefs.some((ref) => {
      const row = runtimeProfiles.find((profile) => profile.id === ref.id
        && profile.version === ref.version);
      return !row || row.profile_kind !== 'npc_binding';
    })) return failure('route_plan_snapshot_missing', 'npc_runtime_profile', g4.id, {
      reason: 'approved_npc_runtime_profile_closure_missing_or_invalid'
    });
    const regionalRefs = [...new Map(runtimeProfiles
      .filter((row) => row.profile_kind === 'npc_binding')
      .flatMap((row) => row.payload.regional_context_refs)
      .map((ref) => [`${ref.id}:${ref.version}`, ref])).values()];
    const regionalResult = regionalRefs.length === 0 ? { rows: [] }
      : await query(`SELECT p.entity_kind,p.id,p.version,p.world_revision_id,
        p.payload,p.status,p.provenance_ref,p.directness,p.confidence,p.canonical_digest,
        av.status AS authoring_status,av.canonical_digest AS authoring_digest
        FROM unnest($1::text[],$2::int[]) AS wanted(id,version)
        JOIN world_base.spatial_v3_npc_regional_context_profiles p
          ON p.id=wanted.id AND p.version=wanted.version
         AND p.world_revision_id=$3
        JOIN world_base.spatial_v3_authoring_versions av
          ON av.entity_kind=p.entity_kind AND av.entity_id=p.id
         AND av.version=p.version AND av.world_revision_id=p.world_revision_id
         AND av.status='approved' AND av.canonical_digest=p.canonical_digest
        WHERE p.status='approved' ORDER BY p.id,p.version`,
      [regionalRefs.map((ref) => ref.id), regionalRefs.map((ref) => ref.version), revision]);
    const regionalProfiles = regionalResult?.rows;
    if (!Array.isArray(regionalProfiles) || regionalProfiles.length !== regionalRefs.length
        || regionalProfiles.some((row) => row.entity_kind !== 'npc_regional_context_profile'
          || row.world_revision_id !== revision || row.status !== 'approved'
          || row.authoring_status !== 'approved' || row.authoring_digest !== row.canonical_digest
          || !row.provenance_ref || !row.directness || !row.confidence
          || !row.payload || typeof row.payload !== 'object'
          || row.payload.id !== row.id || row.payload.version !== row.version
          || row.payload.world_revision_id !== revision
          || !Array.isArray(row.payload.applicability))) {
      return failure('route_plan_snapshot_missing', 'npc_regional_context', g4.id, {
        reason: 'approved_npc_regional_context_closure_missing_or_invalid'
      });
    }
    const exactApplicability = (row) => row.payload.applicability.some((item) => {
      const selectorIsExact = hasGenerationTemplate
        ? item.generation_template_ref?.id === target.id
          && item.generation_template_ref?.version === target.version
          && item.canonical_g5_ref === undefined
        : item.canonical_g5_ref?.id === target.id
          && item.canonical_g5_ref?.version === target.version
          && item.generation_template_ref === undefined;
      return selectorIsExact && item.g4_ref?.world_revision_id === revision
        && item.g4_ref?.id === g4.id && item.g4_ref?.version === g4.version;
    });
    const applicableRegionalRefsByProfile = runtimeProfiles
      .filter((row) => row.profile_kind === 'npc_binding')
      .map((row) => ({ profile_id: row.id, profile_version: row.version,
        refs: row.payload.regional_context_refs.filter((ref) =>
          regionalProfiles.find((profile) => profile.id === ref.id
            && profile.version === ref.version && exactApplicability(profile))) }));
    if (applicableRegionalRefsByProfile.some(({ refs }) => refs.length === 0)) {
      return failure('route_plan_snapshot_missing', 'npc_regional_context', g4.id, {
        reason: 'npc_profile_has_no_applicable_regional_context'
      });
    }
    const value = deepFreeze(structuredClone({
      schema: 'rus.m2c_npc_binding_bundle.v1', world_revision_id: revision,
      g4_ref: { id: g4.id, version: g4.version, world_revision_id: revision },
      ...(hasGenerationTemplate
        ? { generation_template_ref: { id: target.id, version: target.version } }
        : { canonical_g5_ref: { id: target.id, version: target.version } }),
      composition,
      runtime_profiles: runtimeProfiles,
      regional_context_profiles: regionalProfiles,
      applicable_regional_refs_by_profile: applicableRegionalRefsByProfile
    }));
    return Object.freeze({ ok: true, value,
      ref: Object.freeze({ g4: { ...g4 },
        ...(hasGenerationTemplate ? { generation_template: { ...target } }
          : { canonical_g5: { ...target } }) }) });
  }
  async function readPinnedCanonicalG5SceneBinding({ id, version,
    world_revision_id, scene_template_ref, scene_materialization_profile_ref } = {}) {
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
    if ((scene_template_ref && (typeof scene_template_ref.id !== 'string'
      || !Number.isInteger(scene_template_ref.version) || scene_template_ref.version < 1))
      || (scene_materialization_profile_ref
        && (typeof scene_materialization_profile_ref.id !== 'string'
          || !Number.isInteger(scene_materialization_profile_ref.version)
          || scene_materialization_profile_ref.version < 1))) {
      return failure('authoring_dependency_pin_missing', 'node', id, {
        reason: 'exact_canonical_g5_scene_pin_required'
      });
    }
    const result = await query(`SELECT n.id,n.version,n.world_revision_id,
      n.spatial_level,n.primary_class_id,n.status,n.canonical_digest,
      parent.parent_id,parent.parent_version,
      profile.id AS materialization_profile_id,
      profile.version AS materialization_profile_version,
      profile.canonical_digest AS materialization_profile_digest,
      profile.selection_rule_id,profile.selection_rule_version,
      candidate.applicability_rule_id,candidate.applicability_rule_version,
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
      JOIN world_base.spatial_v3_authoring_versions nav
        ON nav.entity_kind='spatial_node' AND nav.entity_id=n.id AND nav.version=n.version
       AND nav.world_revision_id=n.world_revision_id AND nav.status='approved'
      WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
        AND n.spatial_level='G5' AND n.status='approved'
        AND ($4::text IS NULL OR candidate.scene_template_id=$4)
        AND ($5::int IS NULL OR candidate.scene_template_version=$5)
        AND ($6::text IS NULL OR profile.id=$6)
        AND ($7::int IS NULL OR profile.version=$7)
      LIMIT 2`,
    [id, version, world_revision_id, scene_template_ref?.id ?? null,
      scene_template_ref?.version ?? null, scene_materialization_profile_ref?.id ?? null,
      scene_materialization_profile_ref?.version ?? null]);
    if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
      return failure('route_plan_snapshot_missing', 'node', id, {
        reason: result?.rows?.length > 1
          ? 'ambiguous_canonical_g5_scene_binding'
          : 'canonical_g5_scene_binding_missing', version, world_revision_id
      });
    }
    // The approved S1 importer pins typed profiles and inherited rules; its
    // authoring-version digests identify registrations, not typed-row payloads.
    const rules = await readSceneRulePins(result.rows, world_revision_id, true);
    if (!rules.ok) return rules;
    return Object.freeze({ ok: true,
      value: deepFreeze(structuredClone({ ...result.rows[0], scene_rules: rules.value })) });
  }
  async function readG4ExpansionBinding({ g4_id, world_revision_id } = {}) {
    const invalid = (reason) => failure('authoring_dependency_pin_missing',
      'node', g4_id, { reason, world_revision_id });
    if (typeof g4_id !== 'string' || !g4_id.trim()
      || typeof world_revision_id !== 'string' || !world_revision_id.trim()) {
      return invalid('exact_g4_id_and_world_revision_required');
    }
    if (typeof query !== 'function') return invalid('read_only_query_port_required');
    const g4Result = await query(`SELECT n.id,n.version,n.world_revision_id,
        n.canonical_digest,av.canonical_digest AS authoring_version_digest
      FROM world_base.spatial_v3_nodes n
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind='spatial_node' AND av.entity_id=n.id
       AND av.version=n.version AND av.world_revision_id=n.world_revision_id
       AND av.status='approved' AND av.canonical_digest=n.canonical_digest
      WHERE n.id=$1 AND n.world_revision_id=$2 AND n.spatial_level='G4'
        AND n.status='approved' ORDER BY n.version LIMIT 2`,
    [g4_id, world_revision_id]);
    const g4Rows = g4Result?.rows;
    if (!Array.isArray(g4Rows) || g4Rows.length !== 1) {
      return failure('route_plan_snapshot_missing', 'node', g4_id, {
        reason: g4Rows?.length > 1 ? 'ambiguous_approved_g4'
          : 'approved_g4_missing', world_revision_id
      });
    }
    const g4 = g4Rows[0];
    const profileResult = await query(`SELECT p.id,p.version,p.world_revision_id,
        p.g4_id,p.g4_version,p.status,p.canonical_digest,
        av.canonical_digest AS authoring_version_digest,
        e.source_entity_kind,e.source_entity_id,e.source_version,
        e.dependency_role,e.target_entity_kind,e.target_entity_id,
        e.target_version,e.canonical_ordinal
      FROM world_base.spatial_v3_authoring_dependency_edges e
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind=e.target_entity_kind
       AND av.entity_id=e.target_entity_id AND av.version=e.target_version
       AND av.world_revision_id=e.world_revision_id AND av.status='approved'
      JOIN world_base.spatial_v3_g4_expansion_profiles p
        ON p.id=e.target_entity_id AND p.version=e.target_version
       AND p.world_revision_id=e.world_revision_id AND p.status='approved'
      WHERE e.source_entity_kind='spatial_node' AND e.source_entity_id=$1
        AND e.source_version=$2 AND e.world_revision_id=$3
        AND e.dependency_role='g4_expansion_profile'
        AND e.target_entity_kind='g4_expansion_profile'
      ORDER BY e.canonical_ordinal LIMIT 2`,
    [g4.id, g4.version, world_revision_id]);
    const profiles = profileResult?.rows;
    if (!Array.isArray(profiles) || profiles.length !== 1
      || profiles[0].source_entity_kind !== 'spatial_node'
      || profiles[0].source_entity_id !== g4.id
      || profiles[0].source_version !== g4.version
      || profiles[0].dependency_role !== 'g4_expansion_profile'
      || profiles[0].target_entity_kind !== 'g4_expansion_profile'
      || profiles[0].canonical_ordinal !== 0
      || profiles[0].g4_id !== g4.id || profiles[0].g4_version !== g4.version
      || profiles[0].world_revision_id !== world_revision_id
      || profiles[0].authoring_version_digest !== profiles[0].canonical_digest) {
      return failure('route_plan_snapshot_missing', 'node', g4_id, {
        reason: profiles?.length > 1 ? 'ambiguous_g4_expansion_profile'
          : 'approved_g4_expansion_profile_missing',
        world_revision_id
      });
    }
    const profile = profiles[0];
    return Object.freeze({ ok: true, value: deepFreeze({
      g4: { id: g4.id, version: g4.version,
        world_revision_id: g4.world_revision_id,
        canonical_digest: g4.canonical_digest },
      profile: { id: profile.id, version: profile.version,
        world_revision_id: profile.world_revision_id,
        canonical_digest: profile.canonical_digest }
    }) });
  }
  async function readPinnedG4ExpansionClosure({ g4, profile } = {}) {
    const validPin = (ref) => ref && typeof ref.id === 'string' && ref.id.trim()
      && Number.isInteger(ref.version) && ref.version > 0
      && typeof ref.canonical_digest === 'string'
      && /^[a-f0-9]{64}$/iu.test(ref.canonical_digest);
    const invalid = (reason) => failure('authoring_dependency_pin_missing', 'profile', profile?.id, { reason });
    if (!validPin(g4) || typeof g4.world_revision_id !== 'string' || !g4.world_revision_id.trim() || !validPin(profile)) {
      return invalid('exact_g4_and_expansion_profile_pins_required');
    }
    if (typeof query !== 'function') return invalid('read_only_query_port_required');
    const revision = g4.world_revision_id;
    const [g4Rows, profileEdgeRows] = await Promise.all([
      query(`SELECT n.id,n.version,n.world_revision_id,n.spatial_level,n.status,n.canonical_digest,av.canonical_digest AS authoring_version_digest FROM world_base.spatial_v3_nodes n JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='spatial_node' AND av.entity_id=n.id AND av.version=n.version AND av.world_revision_id=n.world_revision_id AND av.status='approved' AND av.canonical_digest=n.canonical_digest WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3 AND n.canonical_digest=$4 AND n.spatial_level='G4' AND n.status='approved' LIMIT 2`, [g4.id, g4.version, revision, g4.canonical_digest]),
      query(`SELECT p.id,p.version,p.world_revision_id,p.g4_id,p.g4_version,p.adjacency_rule_set_id,p.adjacency_rule_set_version,p.connectivity_rule_set_id,p.connectivity_rule_set_version,p.seed_policy_id,p.seed_policy_version,p.status,p.provenance_ref,p.canonical_digest,av.canonical_digest AS authoring_version_digest,e.source_entity_kind,e.source_entity_id,e.source_version,e.dependency_role,e.target_entity_kind,e.target_entity_id,e.target_version,e.canonical_ordinal,e.provenance_ref AS edge_provenance_ref FROM world_base.spatial_v3_authoring_dependency_edges e JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind=e.target_entity_kind AND av.entity_id=e.target_entity_id AND av.version=e.target_version AND av.world_revision_id=e.world_revision_id AND av.status='approved' JOIN world_base.spatial_v3_g4_expansion_profiles p ON p.id=e.target_entity_id AND p.version=e.target_version AND p.world_revision_id=e.world_revision_id WHERE e.source_entity_kind='spatial_node' AND e.source_entity_id=$1 AND e.source_version=$2 AND e.world_revision_id=$3 AND e.dependency_role='g4_expansion_profile' AND e.target_entity_kind='g4_expansion_profile' AND p.status='approved' ORDER BY e.canonical_ordinal LIMIT 2`, [g4.id, g4.version, revision])
    ]);
    const g4Row = g4Rows?.rows?.length === 1 ? g4Rows.rows[0] : null;
    const profileEdge = profileEdgeRows?.rows?.length === 1 ? profileEdgeRows.rows[0] : null;
    if (!g4Row || !profileEdge || profileEdge.id !== profile.id || profileEdge.version !== profile.version
      || profileEdge.canonical_digest !== profile.canonical_digest || profileEdge.authoring_version_digest !== profile.canonical_digest || profileEdge.g4_id !== g4.id
      || profileEdge.g4_version !== g4.version || profileEdge.world_revision_id !== revision
      || profileEdge.canonical_ordinal !== 0) return failure('route_plan_snapshot_missing', 'profile', profile.id, {
      reason: g4Rows?.rows?.length > 1 || profileEdgeRows?.rows?.length > 1
        ? 'ambiguous_g4_expansion_pin' : 'approved_g4_expansion_pin_missing',
      g4_id: g4.id, g4_version: g4.version, profile_id: profile.id,
      profile_version: profile.version, world_revision_id: revision
    });
    const ruleSetResult = await query(`SELECT e.dependency_role,e.canonical_ordinal,e.provenance_ref AS edge_provenance_ref,r.id,r.version,r.world_revision_id,r.rule_kind,r.strategy,r.status,r.provenance_ref,r.canonical_digest,av.canonical_digest AS authoring_digest FROM world_base.spatial_v3_authoring_dependency_edges e JOIN world_base.spatial_v3_expansion_rule_sets r ON r.id=e.target_entity_id AND r.version=e.target_version AND r.world_revision_id=e.world_revision_id JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='expansion_rule_set' AND av.entity_id=r.id AND av.version=r.version AND av.world_revision_id=r.world_revision_id AND av.status='approved' AND av.canonical_digest=r.canonical_digest WHERE e.source_entity_kind='g4_expansion_profile' AND e.source_entity_id=$1 AND e.source_version=$2 AND e.world_revision_id=$3 AND e.dependency_role IN ('adjacency_rule_set','connectivity_rule_set','seed_policy') AND e.target_entity_kind='expansion_rule_set' ORDER BY e.dependency_role,e.canonical_ordinal`, [profile.id, profile.version, revision]);
    const ruleSets = ruleSetResult?.rows;
    const expectedRules = [
      ['adjacency_rule_set', profileEdge.adjacency_rule_set_id, profileEdge.adjacency_rule_set_version, 'adjacency'],
      ['connectivity_rule_set', profileEdge.connectivity_rule_set_id, profileEdge.connectivity_rule_set_version, 'connectivity'],
      ['seed_policy', profileEdge.seed_policy_id, profileEdge.seed_policy_version, 'seed']
    ];
    if (!Array.isArray(ruleSets) || ruleSets.length !== expectedRules.length || expectedRules.some(([role, id, version, kind]) => {
      const rows = ruleSets.filter((r) => r.dependency_role === role);
      return rows.length !== 1 || rows[0].id !== id || rows[0].version !== version
        || rows[0].rule_kind !== kind || rows[0].status !== 'approved'
        || rows[0].authoring_digest !== rows[0].canonical_digest || rows[0].canonical_ordinal !== 0;
    })) return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'expansion_rule_set_dependency_missing_or_invalid' });
    const seedPolicy = ruleSets.find((r) => r.rule_kind === 'seed');
    const connectionProfilesResult = await query(`SELECT p.id,p.version,p.profile_scope,p.passage_type_id,p.transition_environment_profile_id,p.transition_environment_profile_version,p.movement_orientation_profile_id,p.movement_orientation_profile_version,p.cost_kind,p.action_units,p.baseline_movement_method_id,p.movement_method_cost_profile_id,p.movement_method_cost_profile_version,p.base_minutes,p.dynamic_recheck_policy_id,p.dynamic_recheck_policy_version,p.capacity,p.capacity_semantics_ref,p.risk_profile_ref,p.availability_condition_set_ref,p.status,p.provenance_ref,p.canonical_digest,av.canonical_digest AS authoring_version_digest,e.canonical_ordinal,e.provenance_ref AS edge_provenance_ref FROM world_base.spatial_v3_authoring_dependency_edges e JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind=e.target_entity_kind AND av.entity_id=e.target_entity_id AND av.version=e.target_version AND av.world_revision_id=e.world_revision_id AND av.status='approved' JOIN world_base.spatial_v3_canonical_g5_connection_profiles p ON p.id=e.target_entity_id AND p.version=e.target_version AND p.status='approved' WHERE e.source_entity_kind='g4_expansion_profile' AND e.source_entity_id=$1 AND e.source_version=$2 AND e.world_revision_id=$3 AND e.dependency_role='expansion_site_connection_profile' AND e.target_entity_kind='canonical_g5_connection_profile' ORDER BY e.canonical_ordinal`, [profile.id, profile.version, revision]);
    const connectionProfiles = connectionProfilesResult?.rows;
    if (!Array.isArray(connectionProfiles) || !connectionProfiles.length
      || connectionProfiles.some((p, ordinal) => p.canonical_ordinal !== ordinal)) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'expansion_site_connection_profile_missing_or_invalid' });
    }
    const [slotsResult, exitsResult] = await Promise.all([
      query(`SELECT s.id,s.version,s.world_revision_id,s.profile_id,s.profile_version,s.g4_id,s.g4_version,s.continuation_role,s.direction_context_id,s.directional_exit_id,s.directional_exit_version,s.max_instances,s.continuation_length_rule_id,s.continuation_length_rule_version,s.terminal_policy_id,s.terminal_policy_version,s.status,s.provenance_ref,s.canonical_digest,av.status AS authoring_status,av.canonical_digest AS authoring_digest,e.g4_id AS exit_g4_id,e.g4_version AS exit_g4_version,e.exit_kind,e.exit_canonical_g5_id,e.exit_canonical_g5_version,e.status AS exit_status,t.policy_kind,t.target_directional_exit_id,t.target_directional_exit_version,t.status AS terminal_status,l.selection_kind,l.status AS length_status FROM world_base.spatial_v3_expansion_slots s LEFT JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='expansion_slot' AND av.entity_id=s.id AND av.version=s.version AND av.world_revision_id=s.world_revision_id LEFT JOIN world_base.spatial_v3_g4_directional_exits e ON e.id=s.directional_exit_id AND e.version=s.directional_exit_version AND e.world_revision_id=s.world_revision_id LEFT JOIN world_base.spatial_v3_terminal_policies t ON t.id=s.terminal_policy_id AND t.version=s.terminal_policy_version AND t.world_revision_id=s.world_revision_id LEFT JOIN world_base.spatial_v3_continuation_length_rules l ON l.id=s.continuation_length_rule_id AND l.version=s.continuation_length_rule_version AND l.world_revision_id=s.world_revision_id WHERE s.profile_id=$1 AND s.profile_version=$2 AND s.g4_id=$3 AND s.g4_version=$4 AND s.world_revision_id=$5 ORDER BY s.id,s.version`, [profile.id, profile.version, g4.id, g4.version, revision]),
      query(`SELECT e.id,e.version,e.g4_id,e.g4_version,e.direction_context_id,e.exit_kind,e.exit_canonical_g5_id,e.exit_canonical_g5_version,e.status,e.canonical_digest,av.canonical_digest AS authoring_version_digest FROM world_base.spatial_v3_g4_directional_exits e JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='g4_directional_exit' AND av.entity_id=e.id AND av.version=e.version AND av.world_revision_id=e.world_revision_id AND av.status='approved' AND av.canonical_digest=e.canonical_digest WHERE e.g4_id=$1 AND e.g4_version=$2 AND e.world_revision_id=$3 AND e.status='approved' ORDER BY e.id,e.version`, [g4.id, g4.version, revision])
    ]);
    const slots = slotsResult?.rows;
    const exits = exitsResult?.rows;
    const throughSlots = Array.isArray(slots) ? slots.filter((s) => s.continuation_role === 'through') : [];
    if (!Array.isArray(slots) || !slots.length || !Array.isArray(exits) || !exits.length
      || throughSlots.length !== exits.length || new Set(throughSlots.map((s) => `${s.directional_exit_id}:${s.directional_exit_version}`)).size !== throughSlots.length || exits.some((e) => e.authoring_version_digest !== e.canonical_digest) || slots.some((s) => s.status !== 'approved'
      || s.world_revision_id !== revision || s.g4_id !== g4.id || s.g4_version !== g4.version
      || s.profile_id !== profile.id || s.profile_version !== profile.version
      || s.authoring_status !== 'approved' || s.authoring_digest !== s.canonical_digest || !s.terminal_status || (s.continuation_role === 'through'
        ? !s.exit_status || s.exit_status !== 'approved' || s.exit_g4_id !== g4.id
          || s.exit_g4_version !== g4.version || !s.length_status
        : s.directional_exit_id !== null || s.directional_exit_version !== null
          || s.continuation_length_rule_id !== null || s.continuation_length_rule_version !== null)) || exits.some((e) => !throughSlots.some((s) => s.directional_exit_id === e.id
          && s.directional_exit_version === e.version))) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'g4_expansion_slots_invalid_or_missing' });
    }
    const [slotTemplatesResult, limitResult] = await Promise.all([
      query(`SELECT st.slot_id,st.slot_version,st.template_id,st.template_version,st.selection_weight,st.compatibility_rule_id,st.compatibility_rule_version,t.world_revision_id AS template_world_revision_id,t.g5_class_id,t.regional_template_id,t.regional_template_version,t.scene_materialization_profile_id,t.scene_materialization_profile_version,t.status AS template_status,t.canonical_digest AS template_digest,av.canonical_digest AS template_authoring_digest FROM world_base.spatial_v3_expansion_slot_templates st JOIN unnest($1::text[],$2::int[]) AS wanted(id,version) ON wanted.id=st.slot_id AND wanted.version=st.slot_version JOIN world_base.spatial_v3_g5_generation_templates t ON t.id=st.template_id AND t.version=st.template_version JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='g5_generation_template' AND av.entity_id=t.id AND av.version=t.version AND av.world_revision_id=t.world_revision_id AND av.status='approved' AND av.canonical_digest=t.canonical_digest WHERE t.world_revision_id=$3 ORDER BY st.slot_id,st.template_id`, [slots.map((s) => s.id), slots.map((s) => s.version), revision]),
      query(`SELECT profile_id,profile_version,template_id,template_version,max_count FROM world_base.spatial_v3_expansion_profile_template_limits WHERE profile_id=$1 AND profile_version=$2 ORDER BY template_id`, [profile.id, profile.version])
    ]);
    const slotTemplates = slotTemplatesResult?.rows;
    const limits = limitResult?.rows;
    if (!Array.isArray(slotTemplates) || !slotTemplates.length || !Array.isArray(limits)
      || slotTemplates.some((r) => r.template_status !== 'approved' || r.template_authoring_digest !== r.template_digest || r.template_world_revision_id !== revision
        || !slots.some((s) => s.id === r.slot_id && s.version === r.slot_version)
        || !limits.some((l) => l.template_id === r.template_id && l.template_version === r.template_version
          && l.profile_id === profile.id && l.profile_version === profile.version && l.max_count > 0))) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'g5_template_or_limit_closure_invalid' });
    }
    const templateRefs = [...new Map(slotTemplates.map((r) => [`${r.template_id}:${r.template_version}`, { id: r.template_id, version: r.template_version }])).values()];
    const lengthRuleRefs = [...new Map(throughSlots.map((s) => [`${s.continuation_length_rule_id}:${s.continuation_length_rule_version}`, { id: s.continuation_length_rule_id, version: s.continuation_length_rule_version }])).values()];
    const [sceneResult, successorResult, lengthResult] = await Promise.all([
      query(`SELECT p.id,p.version,p.world_revision_id,p.source_kind,p.source_entity_id,p.source_entity_version,p.selection_rule_id,p.selection_rule_version,p.status,p.provenance_ref,p.canonical_digest,pav.canonical_digest AS profile_authoring_digest,c.scene_template_id,c.scene_template_version,c.weight,c.applicability_rule_id,c.applicability_rule_version,t.regional_template_id,t.regional_template_version,t.status AS scene_status,t.canonical_digest AS scene_digest,sb.status AS scene_basis_status,sb.canonical_digest AS scene_basis_digest,tav.canonical_digest AS scene_authoring_digest FROM unnest($1::text[],$2::int[]) AS wanted(id,version) JOIN world_base.spatial_v3_g5_generation_templates g ON g.id=wanted.id AND g.version=wanted.version JOIN world_base.spatial_v3_scene_materialization_profiles p ON p.id=g.scene_materialization_profile_id AND p.version=g.scene_materialization_profile_version JOIN world_base.spatial_v3_authoring_versions pav ON pav.entity_kind='scene_materialization_profile' AND pav.entity_id=p.id AND pav.version=p.version AND pav.world_revision_id=p.world_revision_id AND pav.status='approved' AND pav.canonical_digest=p.canonical_digest JOIN world_base.spatial_v3_scene_materialization_candidates c ON c.profile_id=p.id AND c.profile_version=p.version JOIN world_base.spatial_v3_scene_templates t ON t.id=c.scene_template_id AND t.version=c.scene_template_version AND t.world_revision_id=p.world_revision_id JOIN world_base.spatial_v3_regional_scene_template_bases sb ON sb.id=t.regional_template_id AND sb.version=t.regional_template_version AND sb.world_revision_id=t.world_revision_id AND sb.status='approved' JOIN world_base.spatial_v3_authoring_versions tav ON tav.entity_kind='regional_scene_template_basis' AND tav.entity_id=sb.id AND tav.version=sb.version AND tav.world_revision_id=sb.world_revision_id AND tav.status='approved' AND tav.canonical_digest=sb.canonical_digest WHERE g.world_revision_id=$3 AND p.world_revision_id=$3 AND p.source_kind='g5_generation_template' AND p.status='approved' AND p.source_entity_id=g.id AND p.source_entity_version=g.version AND t.status='approved' AND t.canonical_digest=sb.canonical_digest ORDER BY g.id,p.id,t.id`, [templateRefs.map((r) => r.id), templateRefs.map((r) => r.version), revision]),
      query(`SELECT r.g5_template_id,r.g5_template_version,r.ordinal,r.source_expansion_slot_id,r.source_expansion_slot_version,r.successor_kind,r.target_expansion_slot_id,r.target_expansion_slot_version,r.scene_endpoint_slot_key,r.terminal_policy_id,r.terminal_policy_version,r.condition_rule_id,r.condition_rule_version FROM unnest($1::text[],$2::int[],$3::text[],$4::int[]) AS wanted(template_id,template_version,slot_id,slot_version) JOIN world_base.spatial_v3_g5_successor_frontier_rules r ON r.g5_template_id=wanted.template_id AND r.g5_template_version=wanted.template_version AND r.source_expansion_slot_id=wanted.slot_id AND r.source_expansion_slot_version=wanted.slot_version ORDER BY r.g5_template_id,r.g5_template_version,r.ordinal`, [slotTemplates.map((r) => r.template_id), slotTemplates.map((r) => r.template_version), slotTemplates.map((r) => r.slot_id), slotTemplates.map((r) => r.slot_version)]),
      query(`SELECT c.rule_id,c.rule_version,c.terminal_ordinal,c.weight,r.world_revision_id,r.selection_kind,r.status,r.provenance_ref,r.canonical_digest,rav.canonical_digest AS authoring_digest FROM unnest($1::text[],$2::int[]) AS wanted(id,version) JOIN world_base.spatial_v3_continuation_length_rules r ON r.id=wanted.id AND r.version=wanted.version JOIN world_base.spatial_v3_authoring_versions rav ON rav.entity_kind='continuation_length_rule' AND rav.entity_id=r.id AND rav.version=r.version AND rav.world_revision_id=r.world_revision_id AND rav.status='approved' AND rav.canonical_digest=r.canonical_digest JOIN world_base.spatial_v3_continuation_length_candidates c ON c.rule_id=r.id AND c.rule_version=r.version WHERE r.world_revision_id=$3 AND r.status='approved' ORDER BY c.rule_id,c.rule_version,c.terminal_ordinal`, [lengthRuleRefs.map((r) => r.id), lengthRuleRefs.map((r) => r.version), revision])
    ]);
    const scenes = sceneResult?.rows;
    const successors = successorResult?.rows;
    const lengths = lengthResult?.rows;
    if (!Array.isArray(scenes) || !scenes.length || !Array.isArray(successors)
      || !Array.isArray(lengths) || slots.some((s) => s.continuation_role === 'through'
        && !lengths.some((r) => r.rule_id === s.continuation_length_rule_id
          && r.rule_version === s.continuation_length_rule_version && r.status === 'approved' && r.authoring_digest === r.canonical_digest))
      || templateRefs.some(({ id, version }) => !scenes.some((r) => r.source_entity_id === id && r.source_entity_version === version))
      || scenes.some((r) => r.profile_authoring_digest !== r.canonical_digest || r.scene_authoring_digest !== r.scene_digest || r.scene_basis_status !== 'approved' || r.scene_status !== 'approved')) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'scene_or_continuation_closure_missing' });
    }
    const sceneRefs = [...new Map(scenes.map((r) => [`${r.scene_template_id}:${r.scene_template_version}`, { id: r.scene_template_id, version: r.scene_template_version }])).values()];
    const generatedEndpointsResult = await query(`SELECT e.scene_template_id,e.scene_template_version,e.slot_key,e.endpoint_role,e.required_position_slot_key,e.required_position_instance_ordinal FROM unnest($1::text[],$2::int[]) AS wanted(id,version) JOIN world_base.spatial_v3_scene_endpoint_slots e ON e.scene_template_id=wanted.id AND e.scene_template_version=wanted.version ORDER BY e.scene_template_id,e.scene_template_version,e.slot_key`, [sceneRefs.map((r) => r.id), sceneRefs.map((r) => r.version)]);
    const generatedEndpoints = generatedEndpointsResult?.rows;
    if (!Array.isArray(generatedEndpoints) || successors.some((rule) => {
      const applicableScenes = scenes.filter((r) => r.source_entity_id === rule.g5_template_id
        && r.source_entity_version === rule.g5_template_version);
      return !applicableScenes.length || applicableScenes.some((candidate) => generatedEndpoints.filter((endpoint) =>
        endpoint.scene_template_id === candidate.scene_template_id
        && endpoint.scene_template_version === candidate.scene_template_version
        && endpoint.slot_key === rule.scene_endpoint_slot_key
        && ['departure', 'both'].includes(endpoint.endpoint_role)).length !== 1);
    })) return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'generated_scene_endpoint_missing_or_ambiguous' });
    for (const { id, version } of templateRefs) {
      const profilePins = new Set(scenes.filter((r) => r.source_entity_id === id && r.source_entity_version === version).map((r) => `${r.id}:${r.version}`));
      if (profilePins.size !== 1) return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'g5_scene_profile_missing_or_ambiguous', template_id: id, template_version: version });
    }
    for (const st of slotTemplates) {
      const rules = successors.filter((r) => r.g5_template_id === st.template_id
        && r.g5_template_version === st.template_version && r.source_expansion_slot_id === st.slot_id
        && r.source_expansion_slot_version === st.slot_version);
      const sourceSlot = slots.find((s) => s.id === st.slot_id && s.version === st.slot_version);
      if (rules.length !== 1 || (sourceSlot.continuation_role === 'through'
        ? rules[0].successor_kind !== 'through_successor'
          || rules[0].target_expansion_slot_id !== st.slot_id
          || rules[0].target_expansion_slot_version !== st.slot_version
        : rules[0].successor_kind !== 'branch_frontier'
          || !slots.some((s) => s.id === rules[0].target_expansion_slot_id
            && s.version === rules[0].target_expansion_slot_version && s.continuation_role === 'branch'))
        || !slots.some((s) => s.id === rules[0].source_expansion_slot_id
          && s.version === rules[0].source_expansion_slot_version)) {
        return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'successor_rule_missing_or_ambiguous', slot_id: st.slot_id, template_id: st.template_id });
      }
    }
    const terminalRefs = [...new Map([...slots.map((s) => ({ id: s.terminal_policy_id, version: s.terminal_policy_version })), ...successors.map((r) => ({ id: r.terminal_policy_id, version: r.terminal_policy_version }))].map((r) => [`${r.id}:${r.version}`, r])).values()];
    const terminalResult = await query(`SELECT t.id,t.version,t.world_revision_id,t.policy_kind,t.target_directional_exit_id,t.target_directional_exit_version,t.status,t.provenance_ref,t.canonical_digest,av.canonical_digest AS authoring_digest FROM unnest($1::text[],$2::int[]) AS wanted(id,version) JOIN world_base.spatial_v3_terminal_policies t ON t.id=wanted.id AND t.version=wanted.version JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='expansion_terminal_policy' AND av.entity_id=t.id AND av.version=t.version AND av.world_revision_id=t.world_revision_id AND av.status='approved' AND av.canonical_digest=t.canonical_digest WHERE t.world_revision_id=$3 AND t.status='approved' ORDER BY t.id,t.version`, [terminalRefs.map((r) => r.id), terminalRefs.map((r) => r.version), revision]);
    if (!Array.isArray(terminalResult?.rows) || terminalResult.rows.some((t) => t.authoring_digest !== t.canonical_digest)
      || slots.some((s) => !terminalResult.rows.some((t) => t.id === s.terminal_policy_id && t.version === s.terminal_policy_version))
      || successors.some((r) => !terminalResult.rows.some((t) => t.id === r.terminal_policy_id && t.version === r.terminal_policy_version))) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'terminal_policy_missing' });
    }
    const entryResult = await query(`SELECT b.id,b.version,b.g4_id,b.g4_version,b.canonical_g5_id,b.canonical_g5_version,b.arrival_scene_endpoint_slot_key,b.departure_scene_endpoint_slot_key,b.source_pair_id,b.source_pair_version,b.status,b.provenance_ref,av.canonical_digest,sp.source_payload_sha256,n.world_revision_id AS g5_world_revision_id,n.status AS g5_status,n.canonical_digest AS g5_digest,nav.canonical_digest AS g5_authoring_digest FROM world_base.spatial_v3_g4_entry_endpoint_bindings b JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind='g4_entry_endpoint_binding' AND av.entity_id=b.id AND av.version=b.version AND av.world_revision_id=$3 AND av.status='approved' JOIN world_base.spatial_v3_approved_physical_source_pairs sp ON sp.id=b.source_pair_id AND sp.version=b.source_pair_version AND sp.status='approved' JOIN world_base.spatial_v3_nodes n ON n.id=b.canonical_g5_id AND n.version=b.canonical_g5_version AND n.spatial_level='G5' AND n.status='approved' JOIN world_base.spatial_v3_authoring_versions nav ON nav.entity_kind='spatial_node' AND nav.entity_id=n.id AND nav.version=n.version AND nav.world_revision_id=n.world_revision_id AND nav.status='approved' AND nav.canonical_digest=n.canonical_digest WHERE b.g4_id=$1 AND b.g4_version=$2 AND b.status='approved' AND n.world_revision_id=$3 ORDER BY b.id,b.version`, [g4.id, g4.version, revision]);
    const entryBindings = entryResult?.rows;
    if (!Array.isArray(entryBindings) || !entryBindings.length || entryBindings.some((b) => b.g4_id !== g4.id
      || b.g4_version !== g4.version || b.g5_status !== 'approved' || b.g5_world_revision_id !== revision
      || b.g5_digest !== b.g5_authoring_digest)) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'g4_entry_endpoint_binding_missing_or_invalid' });
    }
    const [entryScenesResult, entryRulesResult] = await Promise.all([
      query(`SELECT b.id AS binding_id,b.version AS binding_version,p.id AS profile_id,p.version AS profile_version,p.canonical_digest AS profile_digest,pav.canonical_digest AS profile_authoring_digest,p.status AS profile_status,c.scene_template_id,c.scene_template_version,t.status AS scene_template_status,t.canonical_digest AS scene_template_digest,tav.canonical_digest AS scene_authoring_digest,tav.status AS scene_template_authoring_status,a.slot_key AS arrival_slot_key,a.endpoint_role AS arrival_role,d.slot_key AS departure_slot_key,d.endpoint_role AS departure_role FROM unnest($1::text[],$2::int[],$3::text[],$4::int[]) AS wanted(binding_id,binding_version,g5_id,g5_version) JOIN world_base.spatial_v3_g4_entry_endpoint_bindings b ON b.id=wanted.binding_id AND b.version=wanted.binding_version LEFT JOIN world_base.spatial_v3_scene_materialization_profiles p ON p.source_kind='canonical_g5' AND p.source_entity_id=wanted.g5_id AND p.source_entity_version=wanted.g5_version AND p.world_revision_id=$5 AND p.status='approved' LEFT JOIN world_base.spatial_v3_authoring_versions pav ON pav.entity_kind='scene_materialization_profile' AND pav.entity_id=p.id AND pav.version=p.version AND pav.world_revision_id=p.world_revision_id AND pav.status='approved' AND pav.canonical_digest=p.canonical_digest LEFT JOIN world_base.spatial_v3_scene_materialization_candidates c ON c.profile_id=p.id AND c.profile_version=p.version LEFT JOIN world_base.spatial_v3_scene_templates t ON t.id=c.scene_template_id AND t.version=c.scene_template_version AND t.world_revision_id=$5 LEFT JOIN world_base.spatial_v3_regional_scene_template_bases sb ON sb.id=t.regional_template_id AND sb.version=t.regional_template_version AND sb.world_revision_id=t.world_revision_id AND sb.status='approved' LEFT JOIN world_base.spatial_v3_authoring_versions tav ON tav.entity_kind='regional_scene_template_basis' AND tav.entity_id=sb.id AND tav.version=sb.version AND tav.world_revision_id=sb.world_revision_id AND tav.status='approved' AND tav.canonical_digest=sb.canonical_digest LEFT JOIN world_base.spatial_v3_scene_endpoint_slots a ON a.scene_template_id=c.scene_template_id AND a.scene_template_version=c.scene_template_version AND a.slot_key=b.arrival_scene_endpoint_slot_key LEFT JOIN world_base.spatial_v3_scene_endpoint_slots d ON d.scene_template_id=c.scene_template_id AND d.scene_template_version=c.scene_template_version AND d.slot_key=b.departure_scene_endpoint_slot_key WHERE t.id IS NULL OR t.status='approved' AND t.canonical_digest=sb.canonical_digest ORDER BY b.id,b.version,c.scene_template_id,c.scene_template_version`, [entryBindings.map((b) => b.id), entryBindings.map((b) => b.version), entryBindings.map((b) => b.canonical_g5_id), entryBindings.map((b) => b.canonical_g5_version), revision]),
      query(`SELECT e.source_entity_id AS entry_binding_id,e.source_version AS entry_binding_version,e.target_entity_id AS slot_id,e.target_version AS slot_version,e.canonical_ordinal,e.provenance_ref,av.canonical_digest AS slot_digest,av.status AS slot_authoring_status,s.canonical_digest AS slot_canonical_digest,s.profile_id,s.profile_version,s.g4_id,s.g4_version,s.continuation_role,s.direction_context_id,s.directional_exit_id,s.directional_exit_version,s.status AS slot_status FROM unnest($1::text[],$2::int[]) AS wanted(id,version) JOIN world_base.spatial_v3_authoring_dependency_edges e ON e.source_entity_kind='g4_entry_endpoint_binding' AND e.source_entity_id=wanted.id AND e.source_version=wanted.version AND e.world_revision_id=$3 AND e.dependency_role='expansion_entry_slot' AND e.target_entity_kind='expansion_slot' LEFT JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind=e.target_entity_kind AND av.entity_id=e.target_entity_id AND av.version=e.target_version AND av.world_revision_id=e.world_revision_id LEFT JOIN world_base.spatial_v3_expansion_slots s ON s.id=e.target_entity_id AND s.version=e.target_version AND s.world_revision_id=$3 ORDER BY e.source_entity_id,e.canonical_ordinal`, [entryBindings.map((b) => b.id), entryBindings.map((b) => b.version), revision])
    ]);
    const entryScenes = entryScenesResult?.rows;
    const entryRules = entryRulesResult?.rows;
    if (!Array.isArray(entryScenes) || !Array.isArray(entryRules)
      || entryBindings.some((b) => {
        const candidates = entryScenes.filter((r) => r.binding_id === b.id && r.binding_version === b.version);
        const profilePins = new Set(candidates.filter((r) => r.profile_id).map((r) => `${r.profile_id}:${r.profile_version}`));
        return candidates.length === 0 || profilePins.size !== 1 || candidates.some((r) => r.profile_status !== 'approved'
          || r.profile_digest !== r.profile_authoring_digest || !r.scene_template_id || !r.scene_template_version
          || r.scene_template_status !== 'approved' || r.scene_template_authoring_status !== 'approved'
          || !r.scene_template_digest || r.scene_template_digest !== r.scene_authoring_digest
          || r.arrival_slot_key !== b.arrival_scene_endpoint_slot_key || !['arrival','both'].includes(r.arrival_role)
          || r.departure_slot_key !== b.departure_scene_endpoint_slot_key || !['departure','both'].includes(r.departure_role));
      })
      || entryBindings.some((b) => {
        const options = entryRules.filter((r) => r.entry_binding_id === b.id && r.entry_binding_version === b.version);
        return options.length === 0 || options.some((r, index) => r.canonical_ordinal !== index
          || r.slot_authoring_status !== 'approved' || r.slot_status !== 'approved'
          || r.slot_digest !== r.slot_canonical_digest
          || r.profile_id !== profile.id || r.profile_version !== profile.version
          || r.g4_id !== g4.id || r.g4_version !== g4.version);
      })) {
      return failure('route_plan_snapshot_missing', 'profile', profile.id, { reason: 'g4_entry_scene_or_rule_closure_missing' });
    }
    const sceneRulePins = await readSceneRulePins(scenes, revision);
    if (!sceneRulePins.ok) return sceneRulePins;
    const value = deepFreeze(structuredClone({ g4: g4Row, profile: Object.fromEntries(Object.entries(profileEdge).filter(([key]) => !['source_entity_kind','source_entity_id','source_version','dependency_role','target_entity_kind','target_entity_id','target_version','canonical_ordinal','edge_provenance_ref'].includes(key))), profile_edge: Object.fromEntries(Object.entries(profileEdge).filter(([key]) => ['source_entity_kind','source_entity_id','source_version','dependency_role','target_entity_kind','target_entity_id','target_version','canonical_ordinal','edge_provenance_ref'].includes(key))),
      scene_rules: sceneRulePins.value,
      directional_exits: exits,
      slots, slot_templates: slotTemplates, template_limits: limits,
      scene_materialization_profiles: [...new Map(scenes.map((r) => [`${r.id}:${r.version}`, Object.fromEntries(Object.entries(r).filter(([key]) => !['scene_template_id','scene_template_version','weight','applicability_rule_id','applicability_rule_version','scene_status','scene_digest','regional_template_id','regional_template_version'].includes(key)))] )).values()],
      scene_materialization_candidates: scenes.map(({ id, version, scene_template_id, scene_template_version, weight, applicability_rule_id, applicability_rule_version }) => ({ profile_id: id, profile_version: version, scene_template_id, scene_template_version, weight, applicability_rule_id, applicability_rule_version })),
      terminal_policies: terminalResult.rows, continuation_length_rules: [...new Map(lengths.map((r) => [`${r.rule_id}:${r.rule_version}`, { id: r.rule_id, version: r.rule_version, world_revision_id: r.world_revision_id, selection_kind: r.selection_kind, status: r.status, provenance_ref: r.provenance_ref, canonical_digest: r.canonical_digest }])).values()],
      continuation_length_candidates: lengths.map(({ rule_id, rule_version, terminal_ordinal, weight }) => ({ rule_id, rule_version, terminal_ordinal, weight })),
      successor_frontier_rules: successors, generated_scene_endpoints: generatedEndpoints,
      expansion_rule_sets: ruleSets, seed_policy: seedPolicy, connection_profiles: connectionProfiles,
      entry_endpoint_bindings: entryBindings,
      entry_scene_endpoints: entryScenes, entry_slot_rules: entryRules }));
    return Object.freeze({ ok: true, value, ref: Object.freeze({ g4: { ...g4 }, profile: { ...profile } }) });
  }
  async function readSceneRulePins(sources, revision, inherited = false) {
    const requested = sources.flatMap((row) => [
      { entity_kind: 'scene_selection_rule', id: row.selection_rule_id, version: row.selection_rule_version },
      { entity_kind: 'scene_applicability_rule', id: row.applicability_rule_id, version: row.applicability_rule_version }
    ]);
    const invalid = () => failure('authoring_dependency_pin_missing', 'profile', revision,
      { reason: 'approved_exact_scene_rule_required' });
    if (requested.some((row) => !row.id || !Number.isSafeInteger(row.version) || row.version < 1)) return invalid();
    const unique = [...new Map(requested.map((row) => [`${row.entity_kind}:${row.id}:${row.version}`, row])).values()];
    const ancestry = inherited ? `WITH RECURSIVE revision_ancestry(id) AS (
      SELECT id FROM world_base.spatial_v3_world_revisions WHERE id=$4 AND status='approved'
      UNION
      SELECT parent.id FROM world_base.spatial_v3_world_revisions child
      JOIN revision_ancestry current ON current.id=child.id
      JOIN world_base.spatial_v3_world_revisions parent ON parent.id=child.parent_revision_id
      WHERE parent.status='approved'
    ), typed_rules AS (
      SELECT entity_kind,id,version,world_revision_id,status FROM world_base.spatial_v3_scene_selection_rules
      UNION ALL
      SELECT entity_kind,id,version,world_revision_id,status FROM world_base.spatial_v3_scene_applicability_rules
    )` : '';
    const result = await query(`${ancestry} SELECT av.entity_kind,av.entity_id AS id,av.version,av.world_revision_id,av.status,av.canonical_digest
      FROM unnest($1::text[],$2::text[],$3::int[]) AS wanted(entity_kind,id,version)
      JOIN world_base.spatial_v3_authoring_versions av ON av.entity_kind=wanted.entity_kind
        AND av.entity_id=wanted.id AND av.version=wanted.version
      ${inherited ? `JOIN revision_ancestry ancestry ON ancestry.id=av.world_revision_id
      JOIN typed_rules rule ON rule.entity_kind=av.entity_kind AND rule.id=av.entity_id
        AND rule.version=av.version AND rule.world_revision_id=av.world_revision_id AND rule.status='approved'
      WHERE av.status='approved'` : "WHERE av.world_revision_id=$4 AND av.status='approved'"}
      ORDER BY av.entity_kind,av.entity_id,av.version`,
    [unique.map((row) => row.entity_kind), unique.map((row) => row.id), unique.map((row) => row.version), revision]);
    if (!Array.isArray(result?.rows) || result.rows.length !== unique.length || unique.some((pin) =>
      result.rows.filter((row) => row.entity_kind === pin.entity_kind && row.id === pin.id
        && row.version === pin.version && (inherited || row.world_revision_id === revision) && row.status === 'approved'
        && /^[a-f0-9]{64}$/u.test(row.canonical_digest ?? '')).length !== 1)) return invalid();
    return { ok: true, value: result.rows };
  }
  async function composeSceneTemplateClosure(header, ref) {
    const tables = Object.keys(SCENE_TEMPLATE_CLOSURE_COLUMNS);
    const results = await Promise.all(tables.map((table) => table === 'spatial_v3_portal_state_template_behaviors'
      ? query(`SELECT ${SCENE_TEMPLATE_CLOSURE_COLUMNS[table]} FROM world_base.${table} behavior JOIN world_base.spatial_v3_portal_templates portal ON portal.id=behavior.portal_template_id AND portal.version=behavior.portal_template_version WHERE portal.scene_template_id=$1 AND portal.scene_template_version=$2`, [header.id, header.version])
      : query(`SELECT ${SCENE_TEMPLATE_CLOSURE_COLUMNS[table]} FROM world_base.${table} WHERE scene_template_id=$1 AND scene_template_version=$2`, [header.id, header.version])));
    if (results.some((result) => !Array.isArray(result?.rows))) return failure('route_plan_snapshot_missing', 'template', ref.id, { reason: 'scene_template_closure_missing' });
    const closure = Object.fromEntries(tables.map((table, index) => [table, structuredClone(results[index].rows)]));
    return Object.freeze({ ok: true, value: Object.freeze({ header,
      g6_slots: closure.spatial_v3_g6_template_slots,
      position_slots: closure.spatial_v3_scene_position_templates,
      endpoint_slots: closure.spatial_v3_scene_endpoint_slots,
      movement_edges: closure.spatial_v3_scene_movement_edge_templates,
      visibility_links: closure.spatial_v3_visibility_link_templates,
      acoustic_edges: closure.spatial_v3_acoustic_edge_templates,
      portals: closure.spatial_v3_portal_templates,
      portal_behaviors: closure.spatial_v3_portal_state_template_behaviors,
      stable_structures: closure.spatial_v3_stable_structure_templates }), ref: Object.freeze({ ...ref }) });
  }
  return Object.freeze({
    read,
    readNode: (ref) => read({ kind: 'node', ref }),
    readRoute: (ref) => read({ kind: 'route', ref }),
    readProfile: (ref) => read({ kind: 'profile', ref }),
    readTemplate: (ref) => read({ kind: 'template', ref }),
    readSceneTemplateClosure,
    readPinnedSceneTemplateClosure,
    readPinnedG5AcousticClosure,
    readPinnedCanonicalG5AcousticClosure,
    readPinnedCanonicalG5SceneBinding,
    readPinnedG4ExpansionClosure,
    readG4ExpansionBinding,
    readPinnedG4NpcCompositionClosure,
    readOrientationProfile: (ref) =>
      read({ kind: 'orientation_profile', ref }),
    readMovementCostProfile: (ref) =>
      read({ kind: 'movement_cost_profile', ref }),
    readNpcReactionPolicy
  });
}

export { buildNpcReactionPolicySnapshotFromAuthoringRow };
