import {
  applyPresenceRulesFirstArrival,
  mergePlaceFamilyPresenceRules,
} from '@rus/materialization';
import {
  loadCategoryParentMap,
  loadPresenceRulesForPlaceFamilies,
} from '@rus/runtime-catalog';

function scopeInstanceRefForSite(siteId) {
  return siteId.startsWith('g5:') ? siteId : `g5:${siteId}`;
}

export async function resolvePresenceRulesFirstArrivalForSite({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  spatialNodeId,
  spatialNodeVersion,
  partyId,
  siteId,
  regionId = null,
  season,
  periodNumber = null,
}) {
  if (!worldBaseReader?.read || !spatialNodeId || !Number.isInteger(spatialNodeVersion)) {
    return null;
  }
  const revisionId = spatialWorldPin.world_revision_id;
  const bindings = await worldBaseReader.read(
    `SELECT place_family_id, binding_role
       FROM world_base.spatial_node_place_family_bindings
      WHERE world_revision_id = $1
        AND node_id = $2
        AND node_version = $3
        AND status = 'approved'`,
    [revisionId, spatialNodeId, spatialNodeVersion],
  );
  const rows = bindings.rows ?? [];
  if (rows.length === 0) return null;
  const primaryIds = rows.filter((row) => row.binding_role === 'primary').map((row) => row.place_family_id);
  const secondaryIds = rows.filter((row) => row.binding_role === 'secondary').map((row) => row.place_family_id);
  const readerInput = {
    worldBaseReader,
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
  };
  const [primaryRules, secondaryRules] = await Promise.all([
    loadPresenceRulesForPlaceFamilies({ ...readerInput, placeFamilyIds: primaryIds }),
    loadPresenceRulesForPlaceFamilies({ ...readerInput, placeFamilyIds: secondaryIds }),
  ]);
  const rules = mergePlaceFamilyPresenceRules({
    primaryRules,
    secondaryRules,
    regionId,
    season,
  });
  if (rules.length === 0) return null;
  const categoryIds = rules
    .filter((row) => row.subject_kind === 'category')
    .map((row) => row.subject_ref);
  const parentById = await loadCategoryParentMap({
    ...readerInput,
    categoryIds,
  });
  return {
    partyId,
    scopeInstanceRef: scopeInstanceRefForSite(siteId),
    rules,
    parentById,
    periodNumber,
    requestIdentityPrefix: `presence-first-arrival:${siteId}`,
  };
}

export function applyResolvedPresenceRulesFirstArrival({ aggregate, context }) {
  if (!context) return aggregate;
  return applyPresenceRulesFirstArrival({ aggregate, ...context });
}

export function createTargetPresenceRulesFirstArrivalResolver({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  readPartySeason,
} = {}) {
  return async function resolvePresenceRulesFirstArrival({
    transaction,
    request,
    site,
    partyId,
    firstEntryBinding,
    scope,
  }) {
    let resolvedSite = site;
    let g4 = request?.g4;
    if (!resolvedSite && transaction?.query && partyId && scope?.entity_id) {
      const hosted = await transaction.query(
        `SELECT g6.host_id, g5.canonical_g5_ref, g5.parent_g4_id
           FROM party_runtime.party_g6_instances g6
           JOIN party_runtime.party_g5_sites g5
             ON g5.party_id=g6.party_id AND g5.id=g6.host_id
          WHERE g6.party_id=$1 AND g6.id=$2 AND g6.status='active'`,
        [partyId, scope.entity_id],
      );
      const row = hosted.rows[0];
      if (!row?.host_id) return null;
      resolvedSite = { id: row.host_id, canonical_g5_ref: row.canonical_g5_ref };
      if (!g4 && row.parent_g4_id) {
        g4 = { id: row.parent_g4_id, version: 1, world_revision_id: spatialWorldPin.world_revision_id };
      }
    }
    if (!resolvedSite || !g4?.id) return null;
    const season = await readPartySeason?.({ transaction, partyId, request }) ?? 'summer';
    const nodeId = resolvedSite.canonical_g5_ref?.entity_id ?? g4.id;
    const nodeVersion = resolvedSite.canonical_g5_ref
      ? Number(resolvedSite.canonical_g5_ref.authoring_version)
      : g4.version;
    return resolvePresenceRulesFirstArrivalForSite({
      worldBaseReader,
      spatialWorldPin,
      worldPin,
      runtimeCatalogPin,
      spatialNodeId: nodeId,
      spatialNodeVersion: nodeVersion,
      partyId: partyId ?? request?.party_id,
      siteId: resolvedSite.id,
      regionId: null,
      season,
      periodNumber: null,
    });
  };
}
