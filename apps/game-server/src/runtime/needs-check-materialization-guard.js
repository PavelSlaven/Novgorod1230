import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { TurnWorkflowError } from '@rus/turn';

export const NEEDS_CHECK_MATERIALIZATION_BLOCKED =
  'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED';

/** Turn guard for the immutable snapshot in the turn's pinned catalog context. */
export function createNeedsCheckMaterializationGuard({ worldBaseReader,
  calendarProfile } = {}) {
  if (typeof worldBaseReader?.read !== 'function' || calendarProfile == null) {
    throw new TypeError('Pinned needs-check materialization context is required.');
  }
  const regions = new Map();
  return async function assertAllowed({ partyId, committedState, candidate,
    catalogContext } = {}) {
    const context = catalogContext;
    const blockerSnapshot = context?.needs_check_blocker_snapshot ?? null;
    const exactWorldPin = context.world_pin;
    const exactRuntimePin = context.pin;
    if (blockerSnapshot == null) {
      // V1 predates this approved profile. Newer immutable pins must carry it.
      if (exactRuntimePin?.catalog_revision_id !== 'procedural_scene_final_candidate_v1_001') {
        throw new TurnWorkflowError('NEEDS_CHECK_BLOCKER_CATALOG_REQUIRED',
          'Pinned runtime catalog is missing its needs-check blocker snapshot.',
          { queue_id: null });
      }
      return;
    }
    NEEDS_CHECK_BLOCKER.validateSnapshot(blockerSnapshot);
    const spatialWorldPin = {
      world_revision_id: exactWorldPin?.world_revision_id,
      catalog_digest: exactWorldPin?.world_catalog_digest
    };
    if (!exactWorldPin || !exactRuntimePin) {
      throw new TypeError('Exact party world and runtime catalog pins are required.');
    }
    const stateWorld = committedState?.world_identity;
    const sameWorld = stateWorld?.world_revision_id === spatialWorldPin.world_revision_id
      && stateWorld?.world_catalog_digest === spatialWorldPin.catalog_digest;
    const g4Id = committedState?.position?.g4_id;
    let region;
    if (sameWorld && text(g4Id)) {
      const key = `${partyId}:${exactRuntimePin.catalog_revision_id}:${g4Id}`;
      if (!regions.has(key)) regions.set(key, loadRegion({ g4Id,
        spatialWorldPin, worldPin: exactWorldPin,
        runtimeCatalogPin: exactRuntimePin }));
      region = await regions.get(key);
    }
    const clock = committedState?.clock
      ?? committedState?.clock_weather_light?.clock;
    let year;
    if (sameWorld && clock != null) {
      year = Number(projectCalendar(clock, calendarProfile).year);
    }
    const hits = NEEDS_CHECK_BLOCKER.matchesAll({ snapshot: blockerSnapshot, candidate: {
      ...candidate,
      ...(text(region) ? { region } : {}),
      ...(Number.isSafeInteger(year) ? { year } : {})
    } });
    if (hits.length > 0) throw new TurnWorkflowError(
      NEEDS_CHECK_MATERIALIZATION_BLOCKED,
      'Committed needs-check blocker matched a proposed materialization.',
      { queue_id: hits[0].queue_id });
  };

  async function loadRegion({ g4Id, spatialWorldPin }) {
    const worldRows = await worldBaseReader.read(
      `SELECT id,catalog_digest,status FROM world_base.spatial_v3_world_revisions
        WHERE id=$1 AND catalog_digest=$2 AND status='approved' LIMIT 2`,
      [spatialWorldPin.world_revision_id, spatialWorldPin.catalog_digest]);
    if (worldRows.rows?.length !== 1) return null;
    const result = await worldBaseReader.read(
      `WITH RECURSIVE chain AS (
         SELECT n.id, n.version, n.spatial_level, 0 AS depth
           FROM world_base.spatial_v3_nodes n
          WHERE n.id = $1 AND n.world_revision_id = $2
            AND n.spatial_level = 'G4' AND n.status = 'approved'
         UNION ALL
         SELECT p.parent_id, p.parent_version, pn.spatial_level, chain.depth + 1
           FROM chain
           JOIN world_base.spatial_v3_node_parents p
             ON p.child_id = chain.id AND p.child_version = chain.version
            AND p.world_revision_id = $2
           JOIN world_base.spatial_v3_nodes pn
             ON pn.id = p.parent_id AND pn.version = p.parent_version
            AND pn.world_revision_id = $2 AND pn.status = 'approved'
          WHERE chain.depth < 24
       )
       SELECT id FROM (
         SELECT DISTINCT id, MAX(depth) AS depth
           FROM chain WHERE spatial_level = 'G0'
          GROUP BY id
       ) g0 ORDER BY depth DESC LIMIT 2`,
      [g4Id, spatialWorldPin.world_revision_id]);
    if (result.rows?.length !== 1) return null;
    return result.rows[0].id;
  }
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
