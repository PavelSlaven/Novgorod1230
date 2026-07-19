import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { deepFreeze } from '@rus/kernel';

export const SPATIAL_REF_KINDS = deepFreeze([
  'canonical_g0', 'canonical_g1', 'canonical_g2', 'canonical_g3', 'canonical_g4', 'canonical_g5',
  'party_g5_site', 'party_g6', 'scene_position', 'transit_anchor', 'route_anchor_scene'
]);

const PARENT_KIND = deepFreeze({
  canonical_g0: null,
  canonical_g1: 'canonical_g0',
  canonical_g2: 'canonical_g1',
  canonical_g3: 'canonical_g2',
  canonical_g4: 'canonical_g3',
  canonical_g5: 'canonical_g4',
  generated_g5: 'canonical_g4',
  party_g5_site: 'canonical_g5',
  scene_position: 'party_g6'
});
const SCENE_HOST_KINDS = new Set(['g5_site', 'transport', 'route_anchor_identity']);
const CLASS_PREFIX = deepFreeze({ canonical_g0: 'spatial.g0.', canonical_g1: 'spatial.g1.', canonical_g2: 'spatial.g2.', canonical_g3: 'spatial.g3.', canonical_g4: 'spatial.g4.', canonical_g5: 'spatial.g5.', party_g6: 'spatial.g6.', scene_position: 'scene_position.' });
const EDGE_KINDS = deepFreeze(['scene_edges', 'site_connections', 'route_segments', 'visibility_links', 'acoustic_edges']);
const ENDPOINT_INVENTORY = deepFreeze({
  scene_edges: ['scene_positions', 'scene_position'],
  visibility_links: ['scene_positions', 'scene_position'],
  site_connections: ['sites', 'party_g5_site'],
  route_segments: ['route_points', 'world_route_point'],
  acoustic_edges: ['g6', 'party_g6']
});
const text = (value) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
const frozen = (value) => deepFreeze(structuredClone(value));
const freezeObject = (value) => deepFreeze(value);
const result = (errors, value = null) => frozen({ ok: errors.length === 0, errors, value });

export function validateSpatialRef(ref) {
  const errors = [];
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) errors.push('spatial_ref must be an object');
  else {
    if (!SPATIAL_REF_KINDS.includes(ref.spatial_kind)) errors.push('spatial_ref.spatial_kind is not an approved G0–G6 reference kind');
    if (!text(ref.spatial_id)) errors.push('spatial_ref.spatial_id is required');
    if (Object.keys(ref).some((key) => !['spatial_kind', 'spatial_id'].includes(key))) errors.push('spatial_ref forbids additional properties');
  }
  return result(errors);
}

export function validateG1GridConvention(node) {
  const errors = [];
  if (node?.kind !== 'canonical_g1') return result(errors);
  if (!Number.isInteger(node.grid_x) || !Number.isInteger(node.grid_y)) errors.push('canonical_g1 requires integer grid_x and grid_y');
  if (!text(node.grid_convention_id)) errors.push('canonical_g1 requires an approved grid_convention_id');
  return result(errors);
}

export function validateSpatialClassification(entity) {
  const errors = [];
  const prefix = CLASS_PREFIX[entity?.spatial_kind];
  if (!prefix) errors.push('spatial classification requires an approved class-bearing spatial kind');
  else if (!text(entity.spatial_class_id)?.startsWith(prefix)) errors.push(`${entity.spatial_kind} requires a primary class in ${prefix}`);
  if (entity?.facets != null && !Array.isArray(entity.facets)) errors.push('spatial facets must be an array');
  const dimensions = new Set();
  for (const facet of Array.isArray(entity?.facets) ? entity.facets : []) {
    if (!text(facet?.dimension_id) || !text(facet?.value_id)) errors.push('spatial facet requires dimension_id and value_id');
    else if (dimensions.has(facet.dimension_id)) errors.push(`duplicate spatial facet dimension ${facet.dimension_id}`);
    else dimensions.add(facet.dimension_id);
  }
  return result(errors);
}

export function buildG1GridIndex(cells) {
  const errors = [];
  const byCoordinate = {};
  if (!Array.isArray(cells)) return freezeObject({ ok: false, errors: Object.freeze(['G1 cells must be an array']), byCoordinate: Object.freeze({}) });
  for (const cell of cells) {
    errors.push(...validateG1GridConvention(cell).errors);
    if (cell?.kind !== 'canonical_g1' || !Number.isInteger(cell.grid_x) || !Number.isInteger(cell.grid_y)) continue;
    const key = `${cell.grid_convention_id}:${cell.grid_x}:${cell.grid_y}`;
    if (byCoordinate[key]) errors.push(`duplicate G1 grid coordinate ${key}`);
    else byCoordinate[key] = frozen(cell);
  }
  return freezeObject({ ok: errors.length === 0, errors: frozen([...new Set(errors)]), byCoordinate: frozen(byCoordinate) });
}

export function validateContainmentRecords(records) {
  const errors = [];
  if (!Array.isArray(records)) return result(['containment records must be an array']);
  const byId = new Map();
  for (const record of records) {
    if (!text(record?.id)) errors.push('containment record id is required');
    else if (byId.has(record.id)) errors.push(`duplicate containment id ${record.id}`);
    else byId.set(record.id, record);
    if (!text(record?.kind)) errors.push(`containment record ${record?.id ?? '<unknown>'} kind is required`);
    if (String(record?.kind).includes('g7') || String(record?.kind).includes('g8')) errors.push('G7/G8 containment is forbidden');
    errors.push(...validateG1GridConvention(record).errors);
  }
  for (const record of records) {
    const requiredParent = PARENT_KIND[record?.kind];
    if (requiredParent === undefined && record?.kind === 'party_g6') {
      if (!SCENE_HOST_KINDS.has(record.host_kind) || !text(record.host_id)) errors.push('party_g6 requires exactly one approved host');
      const host = byId.get(record.host_id);
      if (text(record.host_id) && !host) errors.push(`party_g6 host ${record.host_id} does not exist`);
      if (record.host_kind === 'g5_site' && host && host.kind !== 'party_g5_site') errors.push('g5_site host must reference party_g5_site');
      if (record.parent_id != null) errors.push('party_g6 uses a host and cannot have a containment parent');
      continue;
    }
    if (requiredParent === undefined) {
      if (record?.kind !== 'transit_anchor' && record?.kind !== 'route_anchor_scene') errors.push(`unsupported containment kind ${record?.kind}`);
      continue;
    }
    if (requiredParent === null) {
      if (record.parent_id != null) errors.push('canonical_g0 cannot have a parent');
      continue;
    }
    if (!text(record.parent_id)) errors.push(`${record.kind} requires a direct parent_id`);
    const parent = byId.get(record.parent_id);
    if (text(record.parent_id) && !parent) errors.push(`${record.kind} parent ${record.parent_id} does not exist`);
    if (parent && parent.kind !== requiredParent) errors.push(`${record.kind} requires parent kind ${requiredParent}`);
    if (record.kind === 'party_g5_site' && parent?.kind === 'canonical_g5' && record.parent_id === record.id) errors.push('same-level containment is forbidden');
  }
  for (const record of records) {
    const seen = new Set([record?.id]);
    let parentId = record?.parent_id;
    while (parentId) {
      if (seen.has(parentId)) { errors.push(`containment cycle includes ${record.id}`); break; }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parent_id;
    }
  }
  return result([...new Set(errors)]);
}

export function buildContainmentIndex(records) {
  const validation = validateContainmentRecords(records);
  if (!validation.ok) return freezeObject({ ...validation, records: Object.freeze({}), ancestorIds: () => Object.freeze([]) });
  const byId = Object.fromEntries(records.map((record) => [record.id, frozen(record)]));
  const ancestorIds = (id) => {
    const ancestors = [];
    let cursor = byId[id];
    while (cursor?.parent_id) { ancestors.push(cursor.parent_id); cursor = byId[cursor.parent_id]; }
    if (cursor?.kind === 'party_g6' && cursor.host_kind === 'g5_site') {
      ancestors.push(cursor.host_id);
      cursor = byId[cursor.host_id];
      while (cursor?.parent_id) { ancestors.push(cursor.parent_id); cursor = byId[cursor.parent_id]; }
    }
    return frozen(ancestors);
  };
  return freezeObject({ ok: true, errors: [], records: byId, ancestorIds });
}

function typedEndpointIds(kind, inventory, errors) {
  const [inventoryKey, expectedKind] = ENDPOINT_INVENTORY[kind];
  const records = inventory?.[inventoryKey];
  if (!Array.isArray(records)) {
    errors.push(`${kind} requires explicit ${inventoryKey} endpoint inventory`);
    return new Set();
  }
  const ids = new Set();
  for (const record of records) {
    if (!text(record?.id) || record.kind !== expectedKind) errors.push(`${kind} ${inventoryKey} inventory contains an invalid typed endpoint`);
    else if (ids.has(record.id)) errors.push(`${kind} ${inventoryKey} inventory duplicates endpoint ${record.id}`);
    else ids.add(record.id);
  }
  return ids;
}

function validateEdges(kind, edges, inventory) {
  const errors = [];
  const fields = kind === 'scene_edges' || kind === 'visibility_links'
    ? ['from_position_id', 'to_position_id']
    : kind === 'site_connections' ? ['from_site_id', 'to_site_id']
      : kind === 'route_segments' ? ['from_route_point_id', 'to_route_point_id'] : ['from_g6_id', 'to_g6_id'];
  if (!Array.isArray(edges)) return { errors: [`${kind} must be an array`], fields };
  if (edges.length === 0) return { errors, fields };
  const endpointIds = typedEndpointIds(kind, inventory, errors);
  const ids = new Set();
  for (const edge of edges) {
    if (!text(edge?.id)) errors.push(`${kind} edge id is required`);
    else if (ids.has(edge.id)) errors.push(`duplicate ${kind} edge ${edge.id}`);
    else ids.add(edge.id);
    if (!text(edge?.[fields[0]]) || !text(edge?.[fields[1]])) errors.push(`${kind} requires typed endpoints`);
    if (edge?.[fields[0]] === edge?.[fields[1]]) errors.push(`${kind} cannot be self-referential`);
    if (text(edge?.[fields[0]]) && !endpointIds.has(edge[fields[0]])) errors.push(`${kind} from endpoint ${edge[fields[0]]} is missing or has the wrong kind`);
    if (text(edge?.[fields[1]]) && !endpointIds.has(edge[fields[1]])) errors.push(`${kind} to endpoint ${edge[fields[1]]} is missing or has the wrong kind`);
    if (kind === 'site_connections' && !text(edge?.parent_g4_id)) errors.push('site_connections require parent_g4_id; cross-G4 inference is forbidden');
  }
  return { errors, fields };
}

export function buildSpatialTopologyIndex(topology = {}) {
  const errors = [];
  const indexes = {};
  for (const kind of EDGE_KINDS) {
    const edges = topology[kind] ?? [];
    const { errors: edgeErrors, fields } = validateEdges(kind, edges, topology.endpoint_inventory);
    errors.push(...edgeErrors);
    const outgoing = {};
    for (const edge of Array.isArray(edges) ? edges : []) {
      const from = text(edge?.[fields[0]]);
      if (from) (outgoing[from] ??= []).push(frozen(edge));
    }
    indexes[kind] = outgoing;
  }
  const read = (kind, id) => frozen(indexes[kind]?.[text(id)] ?? []);
  return freezeObject({
    ok: errors.length === 0, errors: frozen([...new Set(errors)]),
    outgoingSceneEdges: (positionId) => read('scene_edges', positionId),
    outgoingSiteConnections: (siteId) => read('site_connections', siteId),
    outgoingRouteSegments: (routePointId) => read('route_segments', routePointId),
    outgoingVisibilityLinks: (positionId) => read('visibility_links', positionId),
    outgoingAcousticEdges: (g6Id) => read('acoustic_edges', g6Id)
  });
}

export function normalizeAzimuthMdeg(value) {
  if (!Number.isInteger(value)) throw new TypeError('azimuth must be an integer millidegree');
  return ((value % 360000) + 360000) % 360000;
}

export function transformLocalAzimuthToWorld(localAzimuthMdeg, cumulativeClockwiseNorthOffsetMdeg) {
  return normalizeAzimuthMdeg(localAzimuthMdeg + cumulativeClockwiseNorthOffsetMdeg);
}

function interpolateArc(from, to, progress, mode) {
  const clockwise = normalizeAzimuthMdeg(to - from);
  const counterclockwise = clockwise === 0 ? 0 : clockwise - 360000;
  const delta = mode === 'clockwise_arc' ? clockwise : mode === 'counterclockwise_arc' ? counterclockwise
    : Math.abs(clockwise) <= Math.abs(counterclockwise) ? clockwise : counterclockwise;
  return normalizeAzimuthMdeg(Math.round(from + (delta * progress)));
}

export function interpolateOrientationProfile(profile, progressPpm) {
  if (!Number.isInteger(progressPpm) || progressPpm < 0 || progressPpm > 1_000_000) throw new RangeError('progress_ppm must be 0..1000000');
  if (profile?.profile_kind === 'fixed') return normalizeAzimuthMdeg(profile.fixed_local_azimuth_mdeg);
  const points = profile?.points;
  if (profile?.profile_kind !== 'curved' || !Array.isArray(points) || points.length < 2) throw new TypeError('curved orientation profile requires ordered points');
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isInteger(point.progress_ppm) || !Number.isInteger(point.local_azimuth_mdeg) || (index && point.progress_ppm <= points[index - 1].progress_ppm)) throw new TypeError('orientation points must have strictly increasing integer progress');
  }
  const final = points.at(-1);
  if (progressPpm === final.progress_ppm) return normalizeAzimuthMdeg(final.local_azimuth_mdeg);
  const index = points.findIndex((point, pointIndex) => pointIndex < points.length - 1 && progressPpm >= point.progress_ppm && progressPpm < points[pointIndex + 1].progress_ppm);
  if (index < 0) throw new RangeError('progress is outside approved orientation profile points');
  const from = points[index]; const to = points[index + 1];
  if (!['shortest_arc', 'clockwise_arc', 'counterclockwise_arc'].includes(from.interpolation_to_next)) throw new TypeError('orientation interpolation_to_next is required for every non-final point');
  return interpolateArc(normalizeAzimuthMdeg(from.local_azimuth_mdeg), normalizeAzimuthMdeg(to.local_azimuth_mdeg), (progressPpm - from.progress_ppm) / (to.progress_ppm - from.progress_ppm), from.interpolation_to_next);
}

export function createFactualSpatialContextSnapshot(input) {
  const required = ['context_ref', 'dependency_pins', 'g0_id', 'g1_id', 'weather_scope_id'];
  for (const key of required) if (input?.[key] == null || (typeof input[key] === 'string' && !text(input[key]))) throw new TypeError(`factual context requires ${key}`);
  if (!Array.isArray(input.dependency_pins)) throw new TypeError('factual context dependency_pins must be explicit array');
  const snapshot = {
    context_ref: frozen(input.context_ref), dependency_pins: frozen(input.dependency_pins),
    g0_id: text(input.g0_id), g1_id: text(input.g1_id), g2_id: text(input.g2_id), g3_id: text(input.g3_id), g4_id: text(input.g4_id),
    jurisdiction_profile_ref: input.jurisdiction_profile_ref ? frozen(input.jurisdiction_profile_ref) : null,
    weather_scope_id: text(input.weather_scope_id), event_pool_profile_ref: input.event_pool_profile_ref ? frozen(input.event_pool_profile_ref) : null
  };
  return frozen({ ...snapshot, canonical_digest: computeSpatialV3CanonicalDigest(snapshot) });
}
