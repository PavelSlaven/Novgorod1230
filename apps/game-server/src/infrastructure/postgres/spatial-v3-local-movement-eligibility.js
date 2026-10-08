import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { serverError } from '../../errors.js';

export function loadApprovedLocalMovementEligibilityPins(worldRevisionId) {
  const root = new URL('../../../../../data/world-catalogs/novgorod/m2c-scene-movement-edges/local-movement-eligibility-v1/', import.meta.url);
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  try {
    const approval = JSON.parse(readFileSync(new URL('mapped-repin-v2-data-approval.json', root)));
    const manifestBytes = readFileSync(new URL('manifest.json', root));
    const manifest = JSON.parse(manifestBytes);
    const dataset = manifest.datasets.find((row) =>
      row.table === 'spatial_v3_local_movement_eligibility_profiles');
    if (approval.decision !== 'APPROVE_DATA_ONLY'
        || digest(manifestBytes) !== approval.manifest_sha256
        || dataset?.sha256 !== approval.dataset_sha256
        || manifest.world_revision_id !== worldRevisionId) throw new Error('approval mismatch');
    const policyBytes = readFileSync(new URL(dataset.file, root));
    const policies = JSON.parse(policyBytes);
    if (digest(policyBytes) !== approval.dataset_sha256
        || !Array.isArray(policies) || policies.length !== 68
        || policies.some((row) => row.world_revision_id !== worldRevisionId)) {
      throw new Error('policy mismatch');
    }
    return policies.map((row) => ({ id: row.id, version: row.version,
      world_revision_id: row.world_revision_id, canonical_digest: row.canonical_digest }));
  } catch {
    throw serverError('SPATIAL_V3_LOCAL_MOVEMENT_PINS_INVALID',
      'Approved local movement eligibility pins are required.');
  }
}

/** Reads only explicitly selected, imported Spatial adjunct versions. No latest-version selection. */
export function createSpatialV3LocalMovementEligibilityReader({ worldPool, pins } = {}) {
  if (!worldPool?.query || !Array.isArray(pins) || pins.some((pin) =>
    !pin?.id || !Number.isSafeInteger(pin.version) || pin.version < 1
      || !pin.world_revision_id || !/^[a-f0-9]{64}$/u.test(pin.canonical_digest))) {
    throw new TypeError('Local movement requires exact imported Spatial eligibility pins.');
  }
  const selected = structuredClone(pins);
  return async function readLocalMovementEligibility(row) {
    if (!row || row.reverse_edge_id !== null || row.edge_capacity !== null
        || row.opposing_reverse_edge_id !== null || row.opposing_capacity !== null
        || row.source_instance_ordinal !== 0 || row.destination_instance_ordinal !== 0
        || !isDeepStrictEqual(row.scene_template_ref, row.edge_scene_template_ref)
        || !isDeepStrictEqual(row.scene_template_ref, row.opposing_scene_template_ref)) return null;
    const result = await worldPool.query(`SELECT policy.*,to_jsonb(edge) AS source_edge,
        to_jsonb(opposing) AS source_opposing
      FROM world_base.spatial_v3_local_movement_eligibility_profiles policy
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind=policy.entity_kind AND av.entity_id=policy.id
          AND av.version=policy.version AND av.world_revision_id=policy.world_revision_id
          AND av.canonical_digest=policy.canonical_digest AND av.status='approved'
      JOIN world_base.spatial_v3_world_revisions world
        ON world.id=policy.world_revision_id AND world.status='approved' AND world.catalog_digest=$2
      JOIN world_base.spatial_v3_scene_templates scene
        ON scene.id=policy.scene_template_id AND scene.version=policy.scene_template_version
          AND scene.canonical_digest=policy.scene_template_digest AND scene.status='approved'
      JOIN world_base.spatial_v3_scene_movement_edge_templates edge
        ON edge.scene_template_id=scene.id AND edge.scene_template_version=scene.version
          AND edge.edge_slot_key=policy.edge_slot_key
      JOIN world_base.spatial_v3_scene_movement_edge_templates opposing
        ON opposing.scene_template_id=scene.id AND opposing.scene_template_version=scene.version
          AND opposing.edge_slot_key=policy.opposing_edge_slot_key
      WHERE policy.world_revision_id=$1 AND policy.status='approved'
        AND policy.scene_template_id=$3 AND policy.scene_template_version=$4
        AND policy.edge_slot_key=$5 AND policy.opposing_edge_slot_key=$6
        AND policy.id=ANY($7::text[])`, [row.world_revision_id, row.world_catalog_digest,
      row.scene_template_ref?.entity_id, row.scene_template_ref?.authoring_version,
      row.edge_slot_key, row.opposing_edge_slot_key, selected.map((pin) => pin.id)]);
    const matches = result.rows.filter((policy) => selected.some((pin) =>
      ['id', 'version', 'world_revision_id', 'canonical_digest'].every((key) => pin[key] === policy[key])));
    if (matches.length !== 1) return null;
    const policy = matches[0];
    if (policy.eligibility_kind !== 'two_approved_directed_edges'
        || policy.scene_template_digest !== row.scene_template_digest
        || policy.from_position_slot_key !== row.source_slot_key
        || policy.to_position_slot_key !== row.destination_slot_key
        || !matchesSource(policy.source_edge, row, false)
        || !matchesSource(policy.source_opposing, row, true)) return null;
    return Object.freeze({ pin: Object.freeze(Object.fromEntries(
      ['id', 'version', 'world_revision_id', 'canonical_digest'].map((key) => [key, policy[key]]))),
    max_root_owners_per_transition: policy.max_root_owners_per_transition });
  };
}

function matchesSource(source, row, opposing) {
  const from = opposing ? row.destination_slot_key : row.source_slot_key;
  const to = opposing ? row.source_slot_key : row.destination_slot_key;
  return source.from_position_slot_key === from && source.to_position_slot_key === to
    && source.passage_type_id === row[opposing ? 'opposing_passage_type_id' : 'passage_type_id']
    && source.reverse_edge_slot_key == null && source.capacity == null
    && source.portal_template_id == null && source.availability_condition_set_id == null
    && source.cost_kind === 'action' && source.action_units === Number(opposing
      ? row.opposing_action_units : row.action_units)
    && ['transition_environment_profile', 'movement_orientation_profile',
      'movement_method_cost_profile', 'dynamic_recheck_policy'].every((key) => isDeepStrictEqual(
      source[`${key}_id`] == null ? null : { entity_id: source[`${key}_id`],
        authoring_version: String(source[`${key}_version`]) },
      row[`${opposing ? 'opposing_' : ''}${key}_ref`] ?? null))
    && ['baseline_movement_method_id', 'base_minutes'].every((key) =>
      (source[key] ?? null) === (row[opposing ? `opposing_${key}` : key] ?? null));
}
