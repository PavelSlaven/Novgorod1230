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
  return Object.freeze({
    read,
    readNode: (ref) => read({ kind: 'node', ref }),
    readRoute: (ref) => read({ kind: 'route', ref }),
    readProfile: (ref) => read({ kind: 'profile', ref }),
    readTemplate: (ref) => read({ kind: 'template', ref }),
    readOrientationProfile: (ref) =>
      read({ kind: 'orientation_profile', ref }),
    readMovementCostProfile: (ref) =>
      read({ kind: 'movement_cost_profile', ref }),
    readNpcReactionPolicy
  });
}

export { buildNpcReactionPolicySnapshotFromAuthoringRow };
