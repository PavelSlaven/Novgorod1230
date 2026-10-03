import {
  applyPresenceRulesFirstArrival,
  mergePlaceFamilyPresenceRules,
} from '@rus/materialization';
import {
  loadCategoryParentMap,
  loadG0RegionIdForSpatialNode,
  loadG1NodeIdForSpatialNode,
  loadPlacePopulationComposition,
  loadPresenceRulesForPlaceFamilies,
} from '@rus/runtime-catalog';
import { serverError } from '../../errors.js';

export const PRESENCE_FIRST_ARRIVAL_GAP = Object.freeze({
  NO_PLACE_FAMILY_BINDING: 'no_place_family_binding',
  NO_MERGED_PRESENCE_RULES: 'no_merged_presence_rules',
});

const APPROVED_O1_ITEM_TEMPLATE_BY_REF = Object.freeze([
  ['it_hh_awl', 'item_tpl_nov_awl_v1'],
  ['it_hh_firesteel', 'item_tpl_nov_firesteel_v1'],
  ['it_hh_flint', 'item_tpl_nov_striking_flint_v1'],
  ['it_hh_hollowed_bowl', 'item_tpl_nov_wooden_bowl_v1'],
  ['it_hh_kindling', 'item_tpl_nov_kindling_bundle_v1'],
  ['it_hh_kitchen_knife', 'item_tpl_nov_utility_knife_v1'],
  ['it_hh_pestle', 'item_tpl_nov_pestle_v1'],
  ['it_hh_rope', 'item_tpl_nov_rope_v1'],
  ['it_hh_tinder', 'item_tpl_nov_tinder_v1'],
  ['it_hh_trough', 'item_tpl_nov_trough_v1'],
  ['it_hh_wooden_spoon', 'item_tpl_nov_wooden_spoon_v1'],
  ['it_ps_bark_sheet_blank', 'item_tpl_nov_birch_bark_sheet_v1'],
].map((entry) => Object.freeze(entry)));

export function createApprovedO1TemplateBackedItemRefs(verifiedItemCatalog) {
  const templates = verifiedItemCatalog?.records_by_table?.item_templates;
  if (verifiedItemCatalog?.schema !== 'rus.verified_item_catalog.v2'
      || verifiedItemCatalog.verified !== true || !Array.isArray(templates)) {
    presenceFirstArrivalError('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
      'Approved O1 item templates require the pinned verified item catalog.',
      { reason: 'verified_item_catalog_missing' });
  }
  const availableTemplateIds = new Set(templates.map((row) => row?.id));
  const missingTemplateIds = APPROVED_O1_ITEM_TEMPLATE_BY_REF
    .map(([, templateId]) => templateId)
    .filter((templateId) => !availableTemplateIds.has(templateId));
  if (missingTemplateIds.length > 0) {
    presenceFirstArrivalError('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP',
      'The verified item catalog does not cover the approved O1 item mappings.',
      { reason: 'approved_template_missing', missing_template_ids: missingTemplateIds });
  }
  return new Set(APPROVED_O1_ITEM_TEMPLATE_BY_REF.map(([itemRef]) => itemRef));
}

function scopeInstanceRefForSite(siteId) {
  return siteId.startsWith('g5:') ? siteId : `g5:${siteId}`;
}

function presenceFirstArrivalError(code, message, details = null) {
  throw serverError(code, message, { status: 409, details, public_exposure: 'internal' });
}

export function emptyPresenceFirstArrivalResult({
  partyId,
  siteId,
  presence_gap,
  periodNumber = null,
  people = null,
}) {
  return {
    partyId,
    rules: [],
    presence_gap,
    scopeInstanceRef: scopeInstanceRefForSite(siteId),
    parentById: new Map(),
    periodNumber,
    requestIdentityPrefix: `presence-first-arrival:${siteId}`,
    ...(people ? { people } : {}),
  };
}

export async function loadPinnedG4NodeRef({
  worldBaseReader,
  spatialWorldPin,
  nodeId,
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
  const version = Number(row?.version);
  if (!Number.isInteger(version) || version < 1) return null;
  return {
    id: nodeId,
    version,
    world_revision_id: revisionId,
    canonical_digest: row.canonical_digest,
  };
}

async function loadApprovedPlaceFamilyBindings({
  worldBaseReader,
  spatialWorldPin,
  spatialNodeId,
  spatialNodeVersion,
}) {
  const revisionId = spatialWorldPin.world_revision_id;
  const bindings = await worldBaseReader.read(
    `SELECT place_family_id, place_family_version, binding_role
       FROM world_base.spatial_node_place_family_bindings
      WHERE world_revision_id = $1
        AND node_id = $2
        AND node_version = $3
        AND status = 'approved'`,
    [revisionId, spatialNodeId, spatialNodeVersion],
  );
  return bindings.rows ?? [];
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
  bindingRows = null,
  withPlacePeople = false,
}) {
  if (!worldBaseReader?.read || !spatialNodeId || !Number.isInteger(spatialNodeVersion)) {
    presenceFirstArrivalError(
      'PRESENCE_FIRST_ARRIVAL_SITE_CONTEXT_INVALID',
      'Presence first arrival requires a world reader and pinned spatial node version.',
    );
  }
  if (typeof regionId !== 'string' || !regionId.trim() || typeof season !== 'string' || !season.trim()) {
    presenceFirstArrivalError(
      'PRESENCE_FIRST_ARRIVAL_CALENDAR_CONTEXT_INVALID',
      'Presence first arrival requires committed region and season.',
      { regionId, season },
    );
  }
  return resolvePresenceRulesFirstArrivalForSiteInner({
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
    bindingRows,
    withPlacePeople,
  });
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
  bindingRows = null,
  withPlacePeople = false,
}) {
  const rows = bindingRows ?? await loadApprovedPlaceFamilyBindings({
    worldBaseReader,
    spatialWorldPin,
    spatialNodeId,
    spatialNodeVersion,
  });
  if (rows.length === 0) {
    return emptyPresenceFirstArrivalResult({
      partyId,
      siteId,
      presence_gap: PRESENCE_FIRST_ARRIVAL_GAP.NO_PLACE_FAMILY_BINDING,
      periodNumber,
    });
  }
  const primaryIds = rows.filter((row) => row.binding_role === 'primary').map((row) => row.place_family_id);
  const secondaryIds = rows.filter((row) => row.binding_role === 'secondary').map((row) => row.place_family_id);
  const readerInput = {
    worldBaseReader,
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
  };
  // D-2 people of a canonical place: the composition of its primary place family (empty or absent = none).
  const people = withPlacePeople ? { compositions: await loadPrimaryPlaceFamilyCompositions({ ...readerInput, primaryIds }) } : null;
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
  if (rules.length === 0) {
    return emptyPresenceFirstArrivalResult({
      partyId,
      siteId,
      presence_gap: PRESENCE_FIRST_ARRIVAL_GAP.NO_MERGED_PRESENCE_RULES,
      periodNumber,
      people,
    });
  }
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
    ...(people ? { people } : {}),
  };
}

/** The D-2 compositions with people groups of the primary place families, each under its own composition ref. */
async function loadPrimaryPlaceFamilyCompositions({ primaryIds, ...readerInput }) {
  const compositions = [];
  for (const placeFamilyId of [...primaryIds].sort()) {
    const composition = await loadPlacePopulationComposition({ ...readerInput, placeFamilyId });
    if (composition?.population_groups?.length) {
      compositions.push({ composition_ref: composition.composition_ref, population_groups: composition.population_groups });
    }
  }
  return compositions;
}

export function applyResolvedPresenceRulesFirstArrival({ aggregate, context }) {
  if (!context?.rules?.length) {
    return Object.freeze({ aggregate, presence_gaps: Object.freeze([]) });
  }
  const presenceGaps = [];
  const next = applyPresenceRulesFirstArrival({ aggregate, ...context,
    onO1TemplateGap: (gap) => presenceGaps.push(gap) });
  return Object.freeze({ aggregate: next, presence_gaps: Object.freeze(presenceGaps) });
}

/** The resolver is installed after the first-entry owners are built; an uninstalled port must not skip presence. */
export function delegateToPresenceResolverPort(port) {
  return async (...args) => {
    if (typeof port?.resolve !== 'function') {
      throw serverError('SPATIAL_V3_TARGET_PRESENCE_RESOLVER_REQUIRED',
        'Target presence first-arrival resolver is not installed.');
    }
    return port.resolve(...args);
  };
}

export function createTargetPresenceRulesFirstArrivalResolver({
  worldBaseReader,
  spatialWorldPin,
  worldPin,
  runtimeCatalogPin,
  readPartyPresenceCalendar,
  o1Selector = null,
  templateBackedItemRefs = null,
} = {}) {
  return async function resolvePresenceRulesFirstArrival({
    transaction,
    request,
    site,
    partyId,
    firstEntryBinding,
    scope,
    withPlacePeople = false,
  }) {
    let resolvedSite = site;
    let g4 = request?.g4;
    if (!resolvedSite && transaction?.query && partyId && scope?.entity_id) {
      const hosted = await transaction.query(
        `SELECT g6.host_id, g5.origin, g5.canonical_g5_ref, g5.parent_g4_id, g5.generated_template_ref
           FROM party_runtime.party_g6_instances g6
           JOIN party_runtime.party_g5_sites g5
             ON g5.party_id=g6.party_id AND g5.id=g6.host_id
          WHERE g6.party_id=$1 AND g6.id=$2 AND g6.status='active'`,
        [partyId, scope.entity_id],
      );
      const row = hosted.rows[0];
      if (!row?.host_id) {
        presenceFirstArrivalError(
          'PRESENCE_FIRST_ARRIVAL_HOST_SITE_MISSING',
          'Active G6 host site is required for presence first arrival.',
          { partyId, g6Id: scope.entity_id },
        );
      }
      resolvedSite = {
        id: row.host_id,
        origin: row.origin,
        canonical_g5_ref: row.canonical_g5_ref,
        parent_g4_id: row.parent_g4_id,
        generated_template_ref: row.generated_template_ref,
      };
      if (!g4 && row.parent_g4_id) {
        g4 = await loadPinnedG4NodeRef({
          worldBaseReader,
          spatialWorldPin,
          nodeId: row.parent_g4_id,
        });
      }
    }
    if (!resolvedSite) {
      presenceFirstArrivalError(
        'PRESENCE_FIRST_ARRIVAL_SITE_MISSING',
        'Party site context is required for presence first arrival.',
      );
    }
    if (!g4?.id && request?.g4?.id) g4 = request.g4;
    if (!g4?.id && resolvedSite.parent_g4_id) {
      g4 = await loadPinnedG4NodeRef({
        worldBaseReader,
        spatialWorldPin,
        nodeId: resolvedSite.parent_g4_id,
      });
    }
    if (!g4?.id || !Number.isInteger(g4.version) || g4.version < 1) {
      presenceFirstArrivalError(
        'PRESENCE_FIRST_ARRIVAL_G4_PIN_MISSING',
        'Pinned parent G4 node is required for presence first arrival.',
        { parentG4Id: resolvedSite.parent_g4_id ?? null },
      );
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
      ? Number(canonicalRef?.authoring_version ?? canonicalRef?.version)
      : g4.version;
    if (!Number.isInteger(spatialNodeVersion) || spatialNodeVersion < 1) {
      presenceFirstArrivalError(
        'PRESENCE_FIRST_ARRIVAL_SPATIAL_NODE_VERSION_INVALID',
        'Pinned spatial node version is required for presence first arrival.',
        { spatialNodeId },
      );
    }
    const bindingRows = await loadApprovedPlaceFamilyBindings({
      worldBaseReader,
      spatialWorldPin,
      spatialNodeId,
      spatialNodeVersion,
    });
    if (bindingRows.length === 0) {
      return emptyPresenceFirstArrivalResult({
        partyId: partyId ?? request?.party_id,
        siteId: resolvedSite.id,
        presence_gap: PRESENCE_FIRST_ARRIVAL_GAP.NO_PLACE_FAMILY_BINDING,
      });
    }
    const calendar = await readPartyPresenceCalendar?.({ transaction, partyId, request });
    if (!calendar?.season || calendar.periodNumber == null) {
      throw serverError('SPATIAL_V3_PARTY_CALENDAR_REQUIRED',
        'Committed party calendar season and year are required for presence resolution.');
    }
    const regionId = await loadG0RegionIdForSpatialNode({
      ...readerInput,
      nodeId: spatialNodeId,
      nodeVersion: spatialNodeVersion,
    });
    if (!regionId) {
      presenceFirstArrivalError(
        'PRESENCE_FIRST_ARRIVAL_REGION_MISSING',
        'G0 region binding is required for presence first arrival.',
        { spatialNodeId, spatialNodeVersion },
      );
    }
    const result = await resolvePresenceRulesFirstArrivalForSite({
      ...readerInput,
      spatialNodeId,
      spatialNodeVersion,
      partyId: partyId ?? request?.party_id,
      siteId: resolvedSite.id,
      regionId,
      season: calendar.season,
      periodNumber: calendar.periodNumber,
      bindingRows,
      withPlacePeople: withPlacePeople && useCanonicalG5Node,
    });
    if (!o1Selector || !useCanonicalG5Node) return result;
    const canonicalG5Ref = `${canonicalNodeId}@${spatialNodeVersion}`;
    const g4Ref = `${g4.id}@${g4.version}`;
    const selectorEntries = o1Selector?.applicability?.selectors;
    if (!Array.isArray(selectorEntries)) {
      presenceFirstArrivalError('SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED',
        'Release-pinned O1 applicability selector is malformed.');
    }
    const selectorEntry = selectorEntries.find((entry) =>
      entry.g4_ref === g4Ref && entry.canonical_g5_ref === canonicalG5Ref);
    if (!selectorEntry) return result;
    if (!resolvedSite.parent_g4_id || resolvedSite.parent_g4_id !== g4.id) return result;
    const canonicalParent = await worldBaseReader.read(
      `SELECT parent_id, parent_version
         FROM world_base.spatial_v3_node_parents
        WHERE child_id=$1 AND child_version=$2 AND world_revision_id=$3
        LIMIT 2`,
      [canonicalNodeId, spatialNodeVersion, spatialWorldPin.world_revision_id],
    );
    if (canonicalParent.rows?.length !== 1
        || canonicalParent.rows[0].parent_id !== g4.id
        || Number(canonicalParent.rows[0].parent_version) !== g4.version) return result;
    const pinnedParentG4 = await loadPinnedG4NodeRef({
      worldBaseReader, spatialWorldPin, nodeId: resolvedSite.parent_g4_id,
    });
    if (!pinnedParentG4 || pinnedParentG4.version !== g4.version) return result;
    const g1Id = await loadG1NodeIdForSpatialNode({
      worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
      nodeId: canonicalNodeId, nodeVersion: spatialNodeVersion,
    });
    return { ...result, o1Applicability: {
      selector: o1Selector,
      templateBackedItemRefs,
      tuple: { g1_ref: g1Id, g4_ref: g4Ref, canonical_g5_ref: canonicalG5Ref,
        place_family_refs: bindingRows.map((row) => ({ source_pf_id: row.place_family_id,
          place_family_ref: `${row.place_family_id}@${row.place_family_version}` })) },
    } };
  };
}
