import {
  applyPresenceRulesFirstArrival,
  mergePlaceFamilyPresenceRules,
} from '@rus/materialization';
import {
  loadCategoryParentMap,
  loadG0RegionIdForSpatialNode,
  loadPresenceRulesForPlaceFamilies,
} from '@rus/runtime-catalog';
import { serverError } from '../../errors.js';

function scopeInstanceRefForSite(siteId) {
  return siteId.startsWith('g5:') ? siteId : `g5:${siteId}`;
}

async function loadPinnedG4NodeRef({
  worldBaseReader,
  spatialWorldPin,
  nodeId,
  requestG4,
}) {
  const revisionId = spatialWorldPin.world_revision_id;
  const pinned = await worldBaseReader.read(
    `SELECT version, canonical_digest
       FROM world_base.spatial_v3_nodes
      WHERE id=$1 AND world_revision_id=$2 AND status='approved'
      ORDER BY version DESC
      LIMIT 1`,
    [nodeId, revisionId],
  );
  const row = pinned.rows?.[0];
  const version = Number(row?.version ?? requestG4?.version);
  if (!Number.isInteger(version) || version < 1) return null;
  return {
    id: nodeId,
    version,
    world_revision_id: revisionId,
    canonical_digest: row?.canonical_digest ?? requestG4?.canonical_digest,
  };
}

function isWaveNotActivatedError(error) {
  return error?.code === 'M2C_NPC_WAVE_ACTIVATION_MISSING';
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
  regionId,
  season,
  periodNumber = null,
}) {
  if (!worldBaseReader?.read || !spatialNodeId || !Number.isInteger(spatialNodeVersion)) {
    return null;
  }
  if (typeof regionId !== 'string' || !regionId.trim() || typeof season !== 'string' || !season.trim()) {
    return null;
  }
  try {
    return await resolvePresenceRulesFirstArrivalForSiteInner({
      worldBaseReader,
      spatialWorldPin,
      worldPin,
      runtimeCatalogPin,
      spatialNodeId,
      spatialNodeVersion,
      partyId,
      siteId,
      regionId: regionId.trim(),
      season: season.trim(),
      periodNumber,
    });
  } catch (error) {
    if (isWaveNotActivatedError(error)) return null;
    throw error;
  }
}

async function resolvePresenceRulesFirstArrivalForSiteInner({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  spatialNodeId,
  spatialNodeVersion,
  partyId,
  siteId,
  regionId,
  season,
  periodNumber = null,
}) {
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
  readPartyPresenceCalendar,
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
        `SELECT g6.host_id, g5.canonical_g5_ref, g5.parent_g4_id, g5.generated_template_ref
           FROM party_runtime.party_g6_instances g6
           JOIN party_runtime.party_g5_sites g5
             ON g5.party_id=g6.party_id AND g5.id=g6.host_id
          WHERE g6.party_id=$1 AND g6.id=$2 AND g6.status='active'`,
        [partyId, scope.entity_id],
      );
      const row = hosted.rows[0];
      if (!row?.host_id) return null;
      resolvedSite = {
        id: row.host_id,
        canonical_g5_ref: row.canonical_g5_ref,
        parent_g4_id: row.parent_g4_id,
        generated_template_ref: row.generated_template_ref,
      };
      if (!g4 && row.parent_g4_id) {
        g4 = await loadPinnedG4NodeRef({
          worldBaseReader,
          spatialWorldPin,
          nodeId: row.parent_g4_id,
          requestG4: request?.g4,
        });
      }
    }
    if (!resolvedSite) return null;
    if (!g4?.id && request?.g4?.id) g4 = request.g4;
    if (!g4?.id && resolvedSite.parent_g4_id) {
      g4 = await loadPinnedG4NodeRef({
        worldBaseReader,
        spatialWorldPin,
        nodeId: resolvedSite.parent_g4_id,
        requestG4: request?.g4,
      });
    }
    if (!g4?.id || !Number.isInteger(g4.version) || g4.version < 1) return null;
    const calendar = await readPartyPresenceCalendar?.({ transaction, partyId, request });
    if (!calendar?.season || calendar.periodNumber == null) {
      throw serverError('SPATIAL_V3_PARTY_CALENDAR_REQUIRED',
        'Committed party calendar season and year are required for presence resolution.');
    }
    const readerInput = {
      worldBaseReader,
      spatialWorldPin,
      worldPin,
      runtimeCatalogPin,
    };
    const canonicalRef = resolvedSite.canonical_g5_ref;
    const canonicalNodeId = canonicalRef?.entity_id ?? canonicalRef?.id;
    const useCanonicalG5Node = typeof canonicalNodeId === 'string' && canonicalNodeId.length > 0
      && resolvedSite.origin !== 'generated';
    const spatialNodeId = useCanonicalG5Node ? canonicalNodeId : g4.id;
    const spatialNodeVersion = useCanonicalG5Node
      ? Number(canonicalRef?.authoring_version ?? canonicalRef?.version ?? 1)
      : g4.version;
    const regionId = await loadG0RegionIdForSpatialNode({
      ...readerInput,
      nodeId: spatialNodeId,
      nodeVersion: spatialNodeVersion,
    });
    return resolvePresenceRulesFirstArrivalForSite({
      ...readerInput,
      spatialNodeId,
      spatialNodeVersion,
      partyId: partyId ?? request?.party_id,
      siteId: resolvedSite.id,
      regionId,
      season: calendar.season,
      periodNumber: calendar.periodNumber,
    });
  };
}
