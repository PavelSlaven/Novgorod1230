import { createSpatialV3Repository } from '@rus/party-store/spatial-v3';
import { serverError } from '../../errors.js';

/** The public command supplies actor/party identities only. Authoring pins come
 * from the active revision and its unique approved G4 dependency edge. */
export async function readSpatialV3ExpansionContext({ transaction, worldBaseReader,
  release, partyId, actorId } = {}) {
  if (typeof transaction?.query !== 'function'
    || typeof worldBaseReader?.readG4ExpansionBinding !== 'function') gap('expansion_context_reader_required');
  const result = await transaction.query(`SELECT party.world_revision_id,party.world_catalog_digest,
    to_jsonb(loc) AS location,to_jsonb(pos) AS position,to_jsonb(site) AS site,
    to_jsonb(baseline) AS baseline
    FROM party_runtime.party_journey_locations loc
    JOIN party_runtime.parties party ON party.party_id=loc.party_id
    JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id AND pos.status='active'
    JOIN party_runtime.party_g6_instances g6 ON g6.party_id=loc.party_id AND g6.id=pos.g6_instance_id AND g6.status='active'
    JOIN party_runtime.party_scene_baselines baseline ON baseline.party_id=loc.party_id AND baseline.id=g6.scene_baseline_id AND baseline.status='active'
    JOIN party_runtime.party_g5_sites site ON site.party_id=loc.party_id AND baseline.host_kind='g5_site' AND site.id=baseline.host_id AND site.status='active'
    WHERE loc.party_id=$1 AND loc.owner_kind='actor' AND loc.owner_id=$2 AND loc.location_kind='scene'`, [partyId, actorId]);
  if (result.rows.length !== 1) gap('committed_actor_scene_required');
  const current = result.rows[0];
  if (current.world_revision_id !== release?.world_revision_id
    || current.world_catalog_digest !== release?.world_catalog_digest) gap('active_release_pin_mismatch');
  const scene = await worldBaseReader.readPinnedSceneTemplateClosure({
    id: current.baseline.scene_template_ref.entity_id,
    version: Number(current.baseline.scene_template_ref.authoring_version), world_revision_id: current.world_revision_id });
  if (!scene?.ok) gap('approved_source_scene_required', scene?.error);
  const local = await transaction.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
        FROM party_runtime.scene_position_nodes p
        WHERE p.party_id=$1 AND p.g6_instance_id=$2 AND p.status='active') AS positions,
      (SELECT jsonb_agg(jsonb_build_object('id',e.id,'from_position_id',e.from_position_id,
          'to_position_id',e.to_position_id,'status',e.status))
        FROM party_runtime.scene_movement_edges e
        WHERE e.party_id=$1 AND e.scene_baseline_id=$3 AND e.status='active') AS movement_edges`,
    [partyId, current.position.g6_instance_id, current.baseline.id]);
  const sceneWithLocalTopology = { ...scene.value,
    positions: local.rows[0]?.positions ?? [], movement_edges: local.rows[0]?.movement_edges ?? [] };
  const binding = await worldBaseReader.readG4ExpansionBinding({ g4_id: current.site.parent_g4_id,
    world_revision_id: current.world_revision_id });
  if (!binding?.ok) gap('approved_g4_expansion_binding_required', binding?.error);
  const closure = await worldBaseReader.readPinnedG4ExpansionClosure(binding.value);
  if (!closure?.ok) gap('approved_g4_expansion_closure_required', closure?.error);
  const loaded = await createSpatialV3Repository({ transaction }).loadExpansionState({
    party_id: partyId, g4_id: current.site.parent_g4_id });
  if (!loaded.ok) gap('committed_expansion_snapshot_required', loaded.error);
  let canonical_connections = [];
  let canonical_connection_gaps = [];
  if (current.site.origin === 'canonical') {
    const connections = await worldBaseReader.readApprovedCanonicalG5Connections({ g4: binding.value.g4,
      canonical_g5: { id: current.site.canonical_g5_ref.entity_id,
        version: Number(current.site.canonical_g5_ref.authoring_version) } });
    if (!connections?.ok) gap('approved_canonical_connections_required', connections?.error);
    canonical_connections = connections.value;
    canonical_connection_gaps = connections.gaps ?? [];
  }
  return { ...current, ...binding.value, closure: closure.value, snapshot: loaded.snapshot,
    canonical_connections, canonical_connection_gaps, scene: sceneWithLocalTopology, partyId, actorId };
}

export function createSpatialV3ExpansionContextReader({ partyPool, worldBaseReader, release } = {}) {
  return async ({ partyId, actorId }) => {
    const transaction = await partyPool.connect();
    try {
      await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const context = await readSpatialV3ExpansionContext({ transaction, worldBaseReader, release, partyId, actorId });
      await transaction.query('COMMIT');
      return context;
    } catch (error) { await transaction.query('ROLLBACK'); throw error; }
    finally { transaction.release(); }
  };
}
function gap(reason, cause) { throw serverError('LIVE_WORLD_EXPANSION_CONTEXT_GAP',
  'Expansion context is unavailable.', { status: 409, details: { reason, ...(cause ? { cause } : {}) } }); }
