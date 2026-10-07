#!/usr/bin/env node
// Build the m2c world-route candidate. This emits draft authoring data only;
// importing it is gated on the b2 runtime reader cutover.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeSpatialV3CanonicalDigest } from '../../packages/contracts/src/spatial-v3/registry.js';
import { lineNameProblems, policyProblem, policySlices } from './build-line-wave.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const CATALOG = 'data/world-catalogs/novgorod';
const CANDIDATE = `${CATALOG}/spatial-v3/candidates/m2c-world-routes-v1`;
const SPEC_PATH = `${CANDIDATE}/route-spec.json`;
const BASE_CANDIDATE = `${CATALOG}/spatial-v3/candidates/m2c-g4-expansion-v1`;
const BASE = `${BASE_CANDIDATE}/datasets`;
const LINE_CANDIDATE = `${CATALOG}/spatial-v3/candidates/m2c-lines-v1`;
const LINE_DATA = `${LINE_CANDIDATE}/datasets`;
const LINE_SPEC_PATH = `${LINE_CANDIDATE}/line-kind-spec.json`;
const PLACE_GEO = `${CATALOG}/m2c-place-coordinates`;
const DERIVED_PATH = `${PLACE_GEO}/derived-report.json`;
const NAMES_PATH = `${CATALOG}/m2c-line-names/candidate.json`;
const WORLD_REVISION = 'novgorod_spatial_v3_target_contract_approval_001';
const CANDIDATE_SOURCE = 'm2c_world_routes_v1_candidate';
const LINE_SOURCE = 'm2c_lines_v1_candidate';
const ROUTE_VERSION = 2;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const digestRow = (row) => {
  const { canonical_digest: _old, ...content } = row;
  return computeSpatialV3CanonicalDigest(content).slice(7);
};
const sealed = (row) => ({ ...row, canonical_digest: digestRow(row) });
const authoringVersion = (kind, row, provenanceRef = CANDIDATE_SOURCE) => ({
  entity_kind: kind,
  entity_id: row.id,
  version: row.version,
  world_revision_id: row.world_revision_id,
  canonical_digest: row.canonical_digest,
  status: row.status,
  provenance_ref: row.provenance_ref ?? provenanceRef,
});
const ref = (id, version) => `${id}@${version}`;
const equalJson = (left, right) => stableJson(left) === stableJson(right);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const mappedMethod = (inputs, sourceId) => {
  const target = inputs.lineSpec.movement_method_map?.[sourceId];
  requireValue(typeof target === 'string' && target.trim(), `D5_METHOD_UNMAPPED:${sourceId}`);
  return target;
};

const TABLES = Object.freeze({
  routes: 'spatial_v3_world_routes', points: 'spatial_v3_world_route_points', segments: 'spatial_v3_world_route_segments',
  contexts: 'spatial_v3_world_route_segment_spatial_contexts', endpoints: 'spatial_v3_world_route_endpoint_bindings',
  versions: 'spatial_v3_authoring_versions', edges: 'spatial_v3_authoring_dependency_edges', sources: 'source_records',
  envs: 'spatial_v3_transition_environment_profiles', costs: 'spatial_v3_movement_method_cost_profiles',
  costOptions: 'spatial_v3_movement_method_cost_options', lineProfiles: 'spatial_v3_line_kind_profiles',
  lineAlternatives: 'spatial_v3_line_kind_alternative_methods', external: 'spatial_v3_external_dependency_versions',
  nodes: 'spatial_v3_nodes', parents: 'spatial_v3_node_parents', exits: 'spatial_v3_g4_directional_exits',
  topoOrientations: 'spatial_v3_topological_movement_orientation_profiles', directionContexts: 'spatial_v3_topological_direction_contexts',
  exitOrientationRules: 'spatial_v3_topological_exit_orientation_rules', rechecks: 'spatial_v3_dynamic_recheck_policies',
  connections: 'spatial_v3_canonical_g5_connection_bindings', entries: 'spatial_v3_g4_entry_endpoint_bindings',
  sourcePairs: 'spatial_v3_approved_physical_source_pairs', connectionProfiles: 'spatial_v3_canonical_g5_connection_profiles',
});

const INVERSE_BEARING = Object.freeze({
  'direction.north': 'direction.south', 'direction.northeast': 'direction.southwest',
  'direction.east': 'direction.west', 'direction.southeast': 'direction.northwest',
  'direction.south': 'direction.north', 'direction.southwest': 'direction.northeast',
  'direction.west': 'direction.east', 'direction.northwest': 'direction.southeast',
});
const LINE_KIND_FOR_CLASS = Object.freeze({
  path: 'path', forest_track: 'forest_track', shore: 'shore', wetland_path: 'wetland_path', offroad: 'offroad',
});

function routeMaps(spec, derived, names, source) {
  requireValue(spec.schema_version === 'rus.m2c_world_route_wave_spec.v1', 'ROUTE_SPEC_SCHEMA_VERSION');
  const derivedById = new Map(derived.lines.map((row) => [row.id, row]));
  const namesByPair = new Map(names.world_routes.map((row) => [row.route_pair_id, row]));
  const routeById = new Map(source.routes.map((row) => [ref(row.id, row.version), row]));
  const pointsByRoute = group(source.points, (row) => ref(row.world_route_id, row.world_route_version));
  const segmentsByRoute = group(source.segments, (row) => ref(row.world_route_id, row.world_route_version));
  const endpointsByRoute = group(source.endpoints, (row) => ref(row.world_route_id, row.world_route_version));
  const result = [];
  const seen = new Set();
  for (const pair of spec.routes) {
    requireValue(/^cross_g4_(0[1-9]|1[0-9]|2[0-4])$/u.test(pair.route_pair_id), `INVALID_ROUTE_PAIR:${pair.route_pair_id}`);
    requireValue(!seen.has(pair.route_pair_id), `DUPLICATE_ROUTE_PAIR:${pair.route_pair_id}`);
    seen.add(pair.route_pair_id);
    requireValue(Array.isArray(pair.world_route_ids) && pair.world_route_ids.length === 2, `PAIR_ROUTE_IDS:${pair.route_pair_id}`);
    const [forwardId, reverseId] = pair.world_route_ids;
    const forward = routeById.get(ref(forwardId, 1)); const reverse = routeById.get(ref(reverseId, 1));
    requireValue(forward && reverse, `SOURCE_ROUTE_MISSING:${pair.route_pair_id}`);
    requireValue(forward.reverse_route_id === reverse.id && forward.reverse_route_version === reverse.version
      && reverse.reverse_route_id === forward.id && reverse.reverse_route_version === forward.version, `SOURCE_ROUTE_MIRROR:${pair.route_pair_id}`);
    const namesRow = namesByPair.get(pair.route_pair_id);
    requireValue(namesRow && namesRow.world_route_ids?.[0] === forward.id && namesRow.world_route_ids?.[1] === reverse.id, `LINE_NAMES_SOURCE_MISMATCH:${pair.route_pair_id}`);
    requireValue(pair.forward_line_name === namesRow.name_ru && pair.reverse_line_name === namesRow.name_ru, `LINE_NAME_MISMATCH:${pair.route_pair_id}`);
    requireValue(pair.source_line_kind === namesRow.line_kind, `SOURCE_LINE_KIND_MISMATCH:${pair.route_pair_id}`);
    const forwardGeo = derivedById.get(forward.id); const reverseGeo = derivedById.get(reverse.id);
    requireValue(forwardGeo && reverseGeo, `PLACE_GEO_ROUTE_MISSING:${pair.route_pair_id}`);
    const forwardSource = routeSource(forward, pointsByRoute, segmentsByRoute, endpointsByRoute);
    const reverseSource = routeSource(reverse, pointsByRoute, segmentsByRoute, endpointsByRoute);
    requireValue(pair.from_g5_id === forwardSource.from.canonical_g5_id && pair.to_g5_id === forwardSource.to.canonical_g5_id,
      `PAIR_ENDPOINTS:${pair.route_pair_id}`);
    requireValue(pair.direction_minutes?.forward === forwardGeo.proposed_minutes && pair.direction_minutes?.reverse === reverseGeo.proposed_minutes,
      `PAIR_MINUTES:${pair.route_pair_id}`);
    const groups = validateGroups(pair, forwardGeo, reverseGeo, namesRow);
    result.push({ pair, forward, reverse, namesRow, forwardGeo, reverseGeo, forwardSource, reverseSource, groups });
  }
  requireValue(seen.size === 24, `PAIR_COUNT:${seen.size}`);
  requireValue(seen.size === new Set([...seen].sort()).size, 'PAIR_DUPLICATE');
  return result.sort((a, b) => a.pair.route_pair_id.localeCompare(b.pair.route_pair_id));
}

function group(rows, key) { const map = new Map(); for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]); return map; }
function routeSource(route, pointsByRoute, segmentsByRoute, endpointsByRoute) {
  const key = ref(route.id, route.version);
  const points = [...(pointsByRoute.get(key) ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const segments = [...(segmentsByRoute.get(key) ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const endpoints = endpointsByRoute.get(key) ?? [];
  requireValue(points.length === 2 && segments.length === 1 && endpoints.length === 2, `SOURCE_ROUTE_TOPOLOGY:${key}`);
  const from = endpoints.find((row) => row.endpoint_role === 'from'); const to = endpoints.find((row) => row.endpoint_role === 'to');
  requireValue(from && to, `SOURCE_ROUTE_ENDPOINT_ROLES:${key}`);
  return { points, segments, endpoints, from, to };
}
function legKey(leg) { return stableJson([leg.surface, leg.waterbody_ref ?? null, leg.movement_class, leg.movement_method_id]); }
function closeNumber(left, right, tolerance = 1e-7) { return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance; }
function validLineName(name) {
  if (typeof name !== 'string' || name.trim() === '' || /\d/u.test(name)) return false;
  return !/(^|[^а-яё])(перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят)(ый|ой|ий|ая|ья|ое|ье|ые|ьи|ого|ьего|ому|ьему|ым|ьим|ом|ьем|ую|ью|ых|ьих|ыми|ьими|ьей|ей)($|[^а-яё])|№/iu.test(name);
}
function validateGroupLabelAndBasis(pair, item, index, expectedBasis) {
  requireValue(validLineName(item.line_name), `GROUP_LINE_NAME_INVALID:${pair.route_pair_id}:${index}`);
  requireValue(item.line_name === pair.forward_line_name, `GROUP_LINE_NAME:${pair.route_pair_id}:${index}`);
  requireValue(item.kind_basis === expectedBasis, `GROUP_KIND_BASIS:${pair.route_pair_id}:${index}`);
}
function validateGroups(pair, forward, reverse, namesRow) {
  const traces = forward.route_trace_segments;
  const reverseTraces = reverse.route_trace_segments;
  if (pair.geometry_mode === 'chord_fallback') {
    requireValue(!Array.isArray(traces) || traces.length === 0, `CHORD_HAS_TRACE:${pair.route_pair_id}`);
    requireValue(!Array.isArray(reverseTraces) || reverseTraces.length === 0, `CHORD_HAS_REVERSE_TRACE:${pair.route_pair_id}`);
    requireValue(pair.segments?.length === 1 && pair.segments[0].geometry_mode === 'chord_fallback', `CHORD_GROUP:${pair.route_pair_id}`);
    const item = pair.segments[0];
    validateGroupLabelAndBasis(pair, item, 0, `line-names movement_class ${item.movement_class} (chord fallback)`);
    requireValue(item.line_kind === namesRow.line_kind && item.line_kind === LINE_KIND_FOR_CLASS[forward.movement_class],
      `CHORD_LINE_KIND:${pair.route_pair_id}:${namesRow.line_kind}`);
    requireValue(item.movement_class === forward.movement_class && item.movement_class === reverse.movement_class
      && item.movement_method_id === forward.movement_method_id && item.movement_method_id === reverse.movement_method_id,
    `CHORD_MOVEMENT_SOURCE:${pair.route_pair_id}`);
    return [{ spec: pair.segments[0], forwardLegs: [], reverseLegs: [] }];
  }
  requireValue(pair.geometry_mode === 'trace' && Array.isArray(traces) && traces.length > 0, `TRACE_MISSING:${pair.route_pair_id}`);
  requireValue(pair.trace_mirror_verified === true, `TRACE_MIRROR_NOT_APPROVED:${pair.route_pair_id}`);
  requireValue(Array.isArray(reverseTraces) && reverseTraces.length === traces.length, `REVERSE_TRACE_COUNT:${pair.route_pair_id}`);
  requireValue(Array.isArray(pair.segments) && pair.segments.length > 0, `TRACE_GROUPS_MISSING:${pair.route_pair_id}`);
  for (let i = 0; i < traces.length; i += 1) {
    const f = traces[i]; const r = reverseTraces[reverseTraces.length - 1 - i];
    requireValue(legKey(f) === legKey(r), `TRACE_MIRROR_KEY:${pair.route_pair_id}:${i}`);
    requireValue(closeNumber(f.from.lat, r.to.lat) && closeNumber(f.from.lon, r.to.lon)
      && closeNumber(f.to.lat, r.from.lat) && closeNumber(f.to.lon, r.from.lon), `TRACE_MIRROR_COORDINATE:${pair.route_pair_id}:${i}`);
  }
  const expectedRanges = [];
  let start = 0;
  for (let index = 1; index <= traces.length; index += 1) {
    if (index === traces.length || legKey(traces[start]) !== legKey(traces[index])) {
      expectedRanges.push([start, index - 1]); start = index;
    }
  }
  requireValue(expectedRanges.length === pair.segments.length, `GROUP_COUNT:${pair.route_pair_id}:${expectedRanges.length}/${pair.segments.length}`);
  for (let i = 0; i < expectedRanges.length; i += 1) {
    const item = pair.segments[i]; const [first, last] = expectedRanges[i];
    requireValue(item.trace_start_index === first && item.trace_end_index === last, `GROUP_RANGE:${pair.route_pair_id}:${i}`);
    requireValue(item.geometry_mode === 'trace' && item.surface === traces[first].surface
      && (item.waterbody_ref ?? null) === (traces[first].waterbody_ref ?? null)
      && item.movement_class === traces[first].movement_class && item.movement_method_id === traces[first].movement_method_id,
    `GROUP_KEY:${pair.route_pair_id}:${i}`);
    const expectedKind = traces[first].surface === 'water'
      ? ((traces[first].waterbody_ref ?? 'main') === 'main' ? 'river_channel' : 'side_channel')
      : LINE_KIND_FOR_CLASS[traces[first].movement_class];
    requireValue(expectedKind && item.line_kind === expectedKind, `GROUP_LINE_KIND:${pair.route_pair_id}:${i}:${expectedKind}`);
    const expectedBasis = traces[first].surface === 'water'
      ? ((traces[first].waterbody_ref ?? 'main') === 'main' ? 'waterbody_ref=main → river_channel'
        : `waterbody_ref=${traces[first].waterbody_ref} → side_channel (editorial authored waterbody mapping; central_head_branch per A-routes-b2-01/limit7)`)
      : `movement_class=${traces[first].movement_class} on surface=land`;
    validateGroupLabelAndBasis(pair, item, i, expectedBasis);
    const idxs = Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
    requireValue(equalJson(item.trace_leg_indices, idxs), `GROUP_TRACE_INDICES:${pair.route_pair_id}:${i}`);
    if (i > 0) validateBoundary(pair, traces, item, i, first);
  }
  return pair.segments.map((spec) => ({
    spec,
    forwardLegs: traces.slice(spec.trace_start_index, spec.trace_end_index + 1),
    reverseLegs: reverseTraces.slice(reverseTraces.length - 1 - spec.trace_end_index, reverseTraces.length - spec.trace_start_index),
  }));
}
function validateBoundary(pair, traces, groupSpec, groupIndex, start) {
  const boundary = groupSpec.boundary_before;
  requireValue(boundary && boundary.trace_vertex_index === start, `BOUNDARY_REQUIRED:${pair.route_pair_id}:${groupIndex}`);
  requireValue(boundary.point_kind === 'waypoint' && boundary.anchor_policy === 'ordinary_transit'
    && boundary.context_switch_phase === 'outbound_dispatch' && boundary.stable_label_id === null && boundary.toponym === null,
  `BOUNDARY_POLICY:${pair.route_pair_id}:${groupIndex}`);
  const before = traces[start - 1]; const after = traces[start];
  const expectedFrom = { surface: before.surface, waterbody_ref: before.waterbody_ref ?? null, movement_class: before.movement_class, movement_method_id: before.movement_method_id };
  const expectedTo = { surface: after.surface, waterbody_ref: after.waterbody_ref ?? null, movement_class: after.movement_class, movement_method_id: after.movement_method_id };
  requireValue(equalJson(boundary.from, expectedFrom) && equalJson(boundary.to, expectedTo), `BOUNDARY_SNAPSHOT:${pair.route_pair_id}:${groupIndex}`);
  requireValue(Array.isArray(boundary.changed_fields) && boundary.changed_fields.some((field) => expectedFrom[field] !== expectedTo[field]), `BOUNDARY_NOT_CHANGED:${pair.route_pair_id}:${groupIndex}`);
  requireValue(closeNumber(boundary.coordinate?.lat, after.from.lat) && closeNumber(boundary.coordinate?.lon, after.from.lon), `BOUNDARY_COORDINATE:${pair.route_pair_id}:${groupIndex}`);
  requireValue(typeof boundary.evidence === 'string' && boundary.evidence.includes('trace vertex'), `BOUNDARY_PROVENANCE:${pair.route_pair_id}:${groupIndex}`);
}

function largestRemainder(groups, minutes) {
  requireValue(Number.isInteger(minutes) && minutes > 0, `INVALID_PROPOSED_MINUTES:${minutes}`);
  if (groups.length === 1 && groups[0].weight === null) return [minutes];
  const total = groups.reduce((sum, item) => sum + item.weight, 0);
  requireValue(total > 0, 'ZERO_TRACE_DURATION');
  const exact = groups.map((item) => minutes * item.weight / total);
  const allocated = exact.map(Math.floor);
  let remainder = minutes - allocated.reduce((sum, n) => sum + n, 0);
  const order = exact.map((value, index) => ({ index, fractional: value - Math.floor(value), key: groups[index].key }))
    .sort((a, b) => (b.fractional - a.fractional) || a.key.localeCompare(b.key));
  for (let index = 0; index < remainder; index += 1) allocated[order[index].index] += 1;
  requireValue(allocated.every((value) => Number.isInteger(value) && value > 0) && allocated.reduce((sum, n) => sum + n, 0) === minutes,
    `MINUTE_ALLOCATION_INVALID:${minutes}:${allocated.join(',')}`);
  return allocated;
}
function keyForGroup(groupSpec) { return `${groupSpec.surface}|${groupSpec.waterbody_ref ?? ''}|${groupSpec.movement_class}|${groupSpec.movement_method_id}|${groupSpec.trace_start_index ?? 'chord'}`; }
function bearing(from, to) {
  const rad = (n) => n * Math.PI / 180;
  const lat1 = rad(from.lat); const lat2 = rad(to.lat); const deltaLon = rad(to.lon - from.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const sectors = ['direction.north', 'direction.northeast', 'direction.east', 'direction.southeast', 'direction.south', 'direction.southwest', 'direction.west', 'direction.northwest'];
  return sectors[Math.round(degrees / 45) % 8];
}
function traceEnds(group, routeTrace, isReverse) {
  if (group.legs?.length) return { from: group.legs[0].from, to: group.legs.at(-1).to };
  requireValue(Array.isArray(routeTrace?.points) && routeTrace.points.length >= 2, 'CHORD_ENDPOINT_COORDINATES_MISSING');
  const points = isReverse ? [...routeTrace.points].reverse() : routeTrace.points;
  return { from: points[0], to: points.at(-1) };
}

function buildCandidate(inputs) {
  const { spec, lineSpec, lineDatasets, baseDatasets } = inputs;
  const pairs = routeMaps(spec, inputs.derived, inputs.names, {
    routes: baseDatasets[TABLES.routes], points: baseDatasets[TABLES.points], segments: baseDatasets[TABLES.segments],
    endpoints: baseDatasets[TABLES.endpoints],
  });
  const out = Object.fromEntries(Object.values(TABLES).map((table) => [table, []]));
  const profilesByKind = new Map(lineDatasets[TABLES.lineProfiles].map((row) => [row.line_kind_id.replace(/^line\./u, ''), row]));
  const profileByKind = (kind) => {
    if (kind === 'offroad') return offroadProfile(inputs).profile;
    const profile = profilesByKind.get(kind);
    requireValue(profile, `LINE_PROFILE_MISSING:${kind}`);
    return profile;
  };
  const addVersion = (kind, row, provenance = CANDIDATE_SOURCE) => out[TABLES.versions].push(authoringVersion(kind, row, provenance));
  const allSegmentRows = [];
  let longSegments = 0; let recheckSliceCount = 0;
  for (const pairInfo of pairs) {
    const { pair, forward, reverse, forwardGeo, reverseGeo, forwardSource, reverseSource, groups } = pairInfo;
    const directional = [
      { route: forward, geo: forwardGeo, source: forwardSource, name: pair.forward_line_name, isReverse: false },
      { route: reverse, geo: reverseGeo, source: reverseSource, name: pair.reverse_line_name, isReverse: true },
    ];
    const directionalSegments = new Map();
    for (const dir of directional) {
      const groupsOrdered = dir.isReverse ? [...groups].reverse() : groups;
      const groupParts = groupsOrdered.map((groupEntry) => {
        const groupSpec = groupEntry.spec;
        const legs = dir.isReverse ? groupEntry.reverseLegs : groupEntry.forwardLegs;
        return { ...groupEntry, groupSpec, legs, weight: legs.length ? legs.reduce((sum, leg) => sum + leg.duration_minutes_unrounded, 0) : null,
          key: keyForGroup(groupSpec) };
      });
      const minutes = dir.geo.proposed_minutes;
      const allocations = largestRemainder(groupParts, minutes);
      for (let index = 0; index < groupParts.length; index += 1) {
        const expected = dir.isReverse ? groupParts[index].groupSpec.reverse_minutes : groupParts[index].groupSpec.forward_minutes;
        requireValue(expected === allocations[index], `SPEC_MINUTE_MISMATCH:${pair.route_pair_id}:${dir.isReverse ? 'r' : 'f'}:${index}:${allocations[index]}/${expected}`);
      }
      const baseRoute = dir.route; const src = dir.source;
      const routeId = baseRoute.id; const routeVersion = ROUTE_VERSION;
      const pointIds = [src.points[0].id];
      for (let internalIndex = 1; internalIndex < groupParts.length; internalIndex += 1) {
        pointIds.push(`${routeId.replace(/^wrv3/u, 'wrpointv3')}__internal_${String(internalIndex).padStart(2, '0')}`);
      }
      pointIds.push(src.points.at(-1).id);
      const routePoints = [];
      const builtDirectionSegments = [];
      for (let pointIndex = 0; pointIndex < pointIds.length; pointIndex += 1) {
        const old = pointIndex === 0 ? src.points[0] : pointIndex === pointIds.length - 1 ? src.points.at(-1) : null;
        const groupBoundary = pointIndex > 0 && pointIndex < pointIds.length - 1
          ? (dir.isReverse ? groupsOrdered[pointIndex - 1].spec.boundary_before : groupsOrdered[pointIndex].spec.boundary_before) : null;
        const point = sealed({
          entity_kind: 'world_route_point', id: pointIds[pointIndex], version: old ? ROUTE_VERSION : 1, world_revision_id: WORLD_REVISION,
          world_route_id: routeId, world_route_version: routeVersion, ordinal: pointIndex,
          point_kind: old ? old.point_kind : 'waypoint', anchor_policy: old ? old.anchor_policy : 'ordinary_transit',
          stable_label_id: old?.stable_label_id ?? groupBoundary?.stable_label_id ?? null,
          context_switch_phase: old ? null : groupBoundary?.context_switch_phase ?? 'outbound_dispatch',
          status: 'approved', provenance_ref: CANDIDATE_SOURCE,
        });
        routePoints.push(point); out[TABLES.points].push(point); addVersion('world_route_point', point);
      }
      const profileList = groupParts.map((part) => profileByKind(part.groupSpec.line_kind));
      const firstProfile = profileList[0];
      const firstSegmentRisk = parseRisk(inputs.lineSpec.kinds[groupParts[0].groupSpec.line_kind]?.risk) ?? src.segments[0].risk_profile_id;
      const firstSegmentRiskVersion = parseRiskVersion(inputs.lineSpec.kinds[groupParts[0].groupSpec.line_kind]?.risk) ?? src.segments[0].risk_profile_version;
      const route = sealed({ ...baseRoute, version: routeVersion, world_revision_id: WORLD_REVISION,
        route_kind_id: firstProfile.route_kind_id, risk_profile_id: firstSegmentRisk, risk_profile_version: firstSegmentRiskVersion,
        reverse_route_id: dir.isReverse ? forward.id : reverse.id,
        reverse_route_version: ROUTE_VERSION, status: 'approved', provenance_ref: CANDIDATE_SOURCE });
      out[TABLES.routes].push(route); addVersion('world_route', route);
      addWorldRouteEdge(out, route, inputs.externalById);

      for (let segmentIndex = 0; segmentIndex < groupParts.length; segmentIndex += 1) {
        const part = groupParts[segmentIndex]; const profile = profileList[segmentIndex];
        const oldSegment = src.segments[0];
        const segId = segmentIndex === 0 ? oldSegment.id : `${routeId.replace(/^wrv3/u, 'wrsegv3')}__add_${String(segmentIndex).padStart(2, '0')}`;
        const segVersion = segmentIndex === 0 ? ROUTE_VERSION : 1;
        const ends = traceEnds(part, inputs.routeTraces.get(routeId), dir.isReverse);
        const direction = bearing(ends.from, ends.to);
        const baseMethod = mappedMethod(inputs, part.groupSpec.movement_method_id);
        requireValue(baseMethod === profile.baseline_movement_method_id, `PROFILE_METHOD_MISMATCH:${pair.route_pair_id}:${part.groupSpec.line_kind}:${baseMethod}/${profile.baseline_movement_method_id}`);
        const segmentMinutes = allocations[segmentIndex];
        const policy = baseDatasets[TABLES.rechecks].find((row) => row.id === profile.dynamic_recheck_policy_id
          && row.version === profile.dynamic_recheck_policy_version);
        const problem = policyProblem(policy);
        const slices = problem == null ? policySlices(segmentMinutes, policy) : null;
        requireValue(problem == null && Number.isInteger(slices) && slices >= 1,
          `RECHECK_POLICY_INVALID:${routeId}:${problem ?? profile.dynamic_recheck_policy_id}`);
        recheckSliceCount += slices;
        if (segmentMinutes > 30) {
          const satisfiesStep = problem == null && (policy.policy_kind === 'fixed_time_interval'
            ? policy.interval_minutes <= 30 : segmentMinutes * policy.progress_slice_ppm <= 30 * 1_000_000);
          requireValue(satisfiesStep, `RECHECK_SLICING_REQUIRED:${routeId}:${segmentMinutes}:${problem ?? profile.dynamic_recheck_policy_id}`);
          longSegments += 1;
        }
        const segment = sealed({
          entity_kind: 'world_route_segment', id: segId, version: segVersion, world_revision_id: WORLD_REVISION,
          world_route_id: routeId, world_route_version: routeVersion, ordinal: segmentIndex,
          from_point_id: routePoints[segmentIndex].id, from_point_version: routePoints[segmentIndex].version,
          to_point_id: routePoints[segmentIndex + 1].id, to_point_version: routePoints[segmentIndex + 1].version,
          transition_environment_profile_id: profile.transition_environment_profile_id,
          transition_environment_profile_version: profile.transition_environment_profile_version,
          movement_orientation_profile_id: null, movement_orientation_profile_version: null,
          topological_orientation_profile_id: profile.topological_orientation_profile_id,
          topological_orientation_profile_version: profile.topological_orientation_profile_version,
          baseline_movement_method_id: baseMethod,
          movement_method_cost_profile_id: profile.movement_method_cost_profile_id,
          movement_method_cost_profile_version: profile.movement_method_cost_profile_version,
          base_minutes: segmentMinutes, dynamic_recheck_policy_id: profile.dynamic_recheck_policy_id,
          dynamic_recheck_policy_version: profile.dynamic_recheck_policy_version,
          capacity: oldSegment.capacity, risk_profile_id: parseRisk(inputs.lineSpec.kinds[part.groupSpec.line_kind]?.risk) ?? oldSegment.risk_profile_id,
          risk_profile_version: parseRiskVersion(inputs.lineSpec.kinds[part.groupSpec.line_kind]?.risk) ?? oldSegment.risk_profile_version,
          availability_condition_set_id: oldSegment.availability_condition_set_id,
          availability_condition_set_version: oldSegment.availability_condition_set_version,
          line_kind_id: profile.line_kind_id, line_kind_profile_id: profile.id, line_kind_profile_version: profile.version,
          line_name: part.groupSpec.line_name, line_discriminator: null, line_direction_id: direction, line_toponym: null,
          status: 'approved', provenance_ref: CANDIDATE_SOURCE,
        });
        out[TABLES.segments].push(segment); allSegmentRows.push(segment); addVersion('world_route_segment', segment);
        builtDirectionSegments.push(segment);
        const contextSource = srcContext(inputs.baseDatasets[TABLES.contexts], oldSegment);
        const context = sealed({ ...contextSource, segment_id: segment.id, segment_version: segment.version, status: 'approved', provenance_ref: CANDIDATE_SOURCE });
        out[TABLES.contexts].push(context);
        addSegmentEdges(out, segment, context, inputs.externalById);
      }
      for (const sourceEndpoint of [src.from, src.to]) {
        const role = sourceEndpoint.endpoint_role;
        const pointIndex = role === 'from' ? 0 : routePoints.length - 1;
        const endpoint = sealed({ ...sourceEndpoint, version: ROUTE_VERSION, world_revision_id: WORLD_REVISION,
          world_route_id: routeId, world_route_version: routeVersion,
          route_point_id: routePoints[pointIndex].id, route_point_version: routePoints[pointIndex].version,
          status: 'approved', provenance_ref: CANDIDATE_SOURCE });
        out[TABLES.endpoints].push(endpoint); addVersion('world_route_endpoint_binding', endpoint);
        addG5EndpointEdge(out, endpoint);
      }
      directionalSegments.set(routeId, builtDirectionSegments);
    }
    const forwardSegments = directionalSegments.get(forward.id);
    const reverseSegments = directionalSegments.get(reverse.id);
    requireValue(forwardSegments.length === reverseSegments.length, `REVERSE_SEGMENT_COUNT:${pair.route_pair_id}`);
    for (let index = 0; index < forwardSegments.length; index += 1) {
      const f = forwardSegments[index]; const r = reverseSegments[reverseSegments.length - 1 - index];
      requireValue(f.line_kind_id === r.line_kind_id && f.line_kind_profile_id === r.line_kind_profile_id
        && f.baseline_movement_method_id === r.baseline_movement_method_id, `REVERSE_SEGMENT_PROFILE:${pair.route_pair_id}:${index}`);
      requireValue(INVERSE_BEARING[f.line_direction_id] === r.line_direction_id, `REVERSE_SEGMENT_BEARING:${pair.route_pair_id}:${index}`);
    }
  }
  requireValue(out[TABLES.routes].length === 48 && out[TABLES.segments].length === 60
    && out[TABLES.points].length === 108 && out[TABLES.endpoints].length === 96, 'OUTPUT_COUNT_MISMATCH');
  for (const route of out[TABLES.routes]) {
    const expectedName = pairs.find(({ forward, reverse }) => forward.id === route.id || reverse.id === route.id)?.pair.forward_line_name;
    const routeSegments = out[TABLES.segments].filter((segment) => segment.world_route_id === route.id && segment.world_route_version === route.version);
    requireValue(typeof expectedName === 'string' && routeSegments.every((segment) => validLineName(segment.line_name)
      && segment.line_name === expectedName && segment.line_kind_id === `line.${segment.line_kind_profile_id.replace(/^lkp__/u, '')}`),
    `GENERATED_ROUTE_SEGMENT_LABEL_OR_KIND:${route.id}`);
  }
  const routeEndpoints = new Map(out[TABLES.endpoints].filter((endpoint) => endpoint.endpoint_role === 'from')
    .map((endpoint) => [endpoint.world_route_id, endpoint.canonical_g5_id]));
  const firstSegments = out[TABLES.segments].filter((segment) => segment.ordinal === 0).map((segment) => ({
    id: segment.id, from_canonical_g5_id: routeEndpoints.get(segment.world_route_id), line_name: segment.line_name,
    line_discriminator: segment.line_discriminator, line_direction_id: segment.line_direction_id,
  }));
  const labelProblems = lineNameProblems([...lineDatasets[TABLES.connections], ...firstSegments]);
  requireValue(labelProblems.length === 0, `LINE_NAME_SET_INVALID:${labelProblems.join('; ')}`);

  // Carry the six wave-1 profiles and their direct immutable rows as closure snapshots.
  const usedKinds = new Set(pairs.flatMap(({ pair }) => pair.segments.map((s) => s.line_kind)));
  for (const kind of usedKinds) {
    if (kind === 'offroad') continue;
    const profile = profilesByKind.get(kind);
    const row = lineDatasets[TABLES.lineProfiles].find((item) => item.id === profile.id && item.version === profile.version);
    out[TABLES.lineProfiles].push(row);
    const version = lineDatasets[TABLES.versions].find((item) => item.entity_kind === 'line_kind_profile' && item.entity_id === row.id && item.version === row.version);
    requireValue(version, `WAVE1_PROFILE_VERSION_MISSING:${kind}`); out[TABLES.versions].push(version);
    const cost = lineDatasets[TABLES.costs].find((item) => item.id === profile.movement_method_cost_profile_id && item.version === profile.movement_method_cost_profile_version);
    requireValue(cost, `WAVE1_COST_MISSING:${kind}`); out[TABLES.costs].push(cost);
    const sourceMethods = new Set(pairs.flatMap(({ pair }) => pair.segments.filter((segment) => segment.line_kind === kind).map((segment) => segment.movement_method_id)));
    requireValue(sourceMethods.size > 0 && [...sourceMethods].every((sourceMethod) => mappedMethod(inputs, sourceMethod) === profile.baseline_movement_method_id),
      `WAVE1_PROFILE_D5_METHOD_MISMATCH:${kind}`);
    requireValue(cost.baseline_movement_method_id === profile.baseline_movement_method_id, `WAVE1_COST_BASELINE_MISMATCH:${kind}`);
    const costVersion = lineDatasets[TABLES.versions].find((item) => item.entity_kind === 'movement_method_cost_profile' && item.entity_id === cost.id && item.version === cost.version);
    requireValue(costVersion, `WAVE1_COST_VERSION_MISSING:${kind}`); out[TABLES.versions].push(costVersion);
    const options = lineDatasets[TABLES.costOptions].filter((item) => item.profile_id === cost.id && item.profile_version === cost.version);
    requireValue(options.some((option) => option.cost_mode === 'baseline' && option.movement_method_id === profile.baseline_movement_method_id), `WAVE1_COST_BASELINE_OPTION_MISSING:${kind}`);
    for (const option of options) out[TABLES.costOptions].push(option);
    for (const alternative of lineDatasets[TABLES.lineAlternatives].filter((item) => item.profile_id === row.id && item.profile_version === row.version)) out[TABLES.lineAlternatives].push(alternative);
    const env = lineDatasets[TABLES.envs].find((item) => item.id === profile.transition_environment_profile_id && item.version === profile.transition_environment_profile_version)
      ?? baseDatasets[TABLES.envs].find((item) => item.id === profile.transition_environment_profile_id && item.version === profile.transition_environment_profile_version);
    requireValue(env, `WAVE1_ENV_MISSING:${kind}`); out[TABLES.envs].push(env);
    const envVersion = [...lineDatasets[TABLES.versions], ...baseDatasets[TABLES.versions]].find((item) => item.entity_kind === 'transition_environment_profile' && item.entity_id === env.id && item.version === env.version);
    if (envVersion) out[TABLES.versions].push(envVersion);
    for (const id of [profile.topological_orientation_profile_id]) {
      const orientation = baseDatasets[TABLES.topoOrientations].find((item) => item.id === id && item.version === profile.topological_orientation_profile_version);
      requireValue(orientation, `TOPO_ORIENTATION_MISSING:${id}`); out[TABLES.topoOrientations].push(orientation);
    }
    const recheck = baseDatasets[TABLES.rechecks].find((item) => item.id === profile.dynamic_recheck_policy_id && item.version === profile.dynamic_recheck_policy_version);
    requireValue(recheck, `RECHECK_MISSING:${kind}`); out[TABLES.rechecks].push(recheck);
    for (const edge of lineDatasets[TABLES.edges].filter((item) => item.source_entity_kind === 'line_kind_profile' && item.source_entity_id === row.id && item.source_version === row.version)) out[TABLES.edges].push(edge);
  }
  const offroad = offroadProfile(inputs);
  requireValue(offroad.cost.baseline_movement_method_id === offroad.profile.baseline_movement_method_id
    && offroad.costOption.movement_method_id === mappedMethod(inputs, 'movement.foot'), 'OFFROAD_COST_METHOD_MISMATCH');
  requireValue(offroad.costOption.cost_mode === 'baseline', 'OFFROAD_BASELINE_COST_OPTION_MISSING');
  out[TABLES.envs].push(offroad.env);
  const offroadEnvironmentVersion = baseDatasets[TABLES.versions].find((item) => item.entity_kind === 'transition_environment_profile' && item.entity_id === offroad.env.id && item.version === offroad.env.version);
  requireValue(offroadEnvironmentVersion, 'OFFROAD_ENV_AUTHORING_VERSION_MISSING');
  out[TABLES.versions].push(offroadEnvironmentVersion);
  for (const [table, kind, row] of [
    [TABLES.costs, 'movement_method_cost_profile', offroad.cost],
    [TABLES.lineProfiles, 'line_kind_profile', offroad.profile],
  ]) { out[table].push(row); addVersion(kind, row); }
  out[TABLES.costOptions].push(offroad.costOption);
  addOffroadProfileEdges(out, offroad, inputs.externalById);

  addSourceRecord(out, LINE_SOURCE, lineDatasets[TABLES.sources].find((item) => item.id === LINE_SOURCE));
  addSourceRecord(out, CANDIDATE_SOURCE, {
    id: CANDIDATE_SOURCE, title: 'M2c world routes v1 candidate (cross-G4 routes)', source_type: 'project_note',
    file_reference: `${CANDIDATE}/generator-report.json`, page_or_section: 'inputs: route-spec.json and generator-report.json#inputs',
    summary: 'Cross-G4 world-route candidate based on place-geo traces/minutes, line-names, and wave-1 line-kind profiles.',
    limitations: 'Candidate only; import only with the b2 runtime reader cutover. Reviewer limits and unresolved assumptions are listed in README.md#review-assumptions-and-limits.',
    status: 'approved', confidence: 'medium', checked_by: 'Opus REVIEW-routes-b2-1 (2026-10-01), independent pass; author fleet/routes-b2',
  });

  addBaseClosures(out, inputs, pairs);
  const allExternalEdges = out[TABLES.edges].filter((edge) => edge.target_entity_kind === 'external_dependency');
  const externalKeys = new Set(allExternalEdges.map(externalKeyFromEdge));
  const retainedSourceMethodPins = new Set(['movement.foot@1', 'movement.small_river_craft@1']);
  for (const row of inputs.baseDatasets[TABLES.external]) {
    if (externalKeys.has(externalKeyFromRow(row)) || retainedSourceMethodPins.has(`${row.dependency_id}@${row.dependency_version}`)) out[TABLES.external].push(row);
  }
  const externalRows = new Set(out[TABLES.external].map(externalKeyFromRow));
  requireValue([...externalKeys].every((key) => externalRows.has(key)), `EXTERNAL_PIN_CLOSURE:${externalKeys.size}/${externalRows.size}`);
  for (const table of [TABLES.edges, TABLES.versions, TABLES.sources, TABLES.envs, TABLES.costs, TABLES.costOptions, TABLES.lineProfiles, TABLES.lineAlternatives, TABLES.external, TABLES.nodes, TABLES.parents, TABLES.exits, TABLES.topoOrientations, TABLES.directionContexts, TABLES.exitOrientationRules, TABLES.rechecks, TABLES.connections, TABLES.entries]) {
    out[table] = uniqueRows(out[table], table);
  }
  validateWorldRouteDependencyEdges(out);
  const proposedMinutes = new Map(inputs.derived.lines.map((line) => [line.id, line.proposed_minutes]));
  const sumMismatchRoutes = out[TABLES.routes].filter((route) => {
    const total = out[TABLES.segments]
      .filter((segment) => segment.world_route_id === route.id && segment.world_route_version === route.version)
      .reduce((sum, segment) => sum + segment.base_minutes, 0);
    return total !== proposedMinutes.get(route.id);
  }).length;
  const report = {
    schema: 'rus.m2c_world_route_wave_report.v1', status: 'candidate_unapproved', import_authorized: false, activation_authorized: false,
    import_policy: 'Import only together with the b2 runtime reader cutover; no bootstrap import.',
    counts: Object.fromEntries(Object.entries(out).filter(([, rows]) => rows.length).map(([table, rows]) => [table, rows.length])),
    scope: { pairs: pairs.length, directed_routes: out[TABLES.routes].length, directed_segments: out[TABLES.segments].length, internal_points: out[TABLES.points].length - 96, endpoints: out[TABLES.endpoints].length },
    minutes: { source: 'place-geo proposed_minutes', sum_mismatch_routes: sumMismatchRoutes, largest_remainder: true,
      long_segments_over_30_minutes: longSegments, recheck_slices: recheckSliceCount },
    assumptions_for_opus: spec.decisions.assumptions_for_opus,
    inputs: { route_spec: SPEC_PATH, place_geo_derived: DERIVED_PATH, line_names: NAMES_PATH, line_kind_spec: LINE_SPEC_PATH },
  };
  return { datasets: out, report, manifest: buildManifest(out) };
}

function parseRisk(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/@\d+$/u, '');
}
function parseRiskVersion(value) { return typeof value === 'string' ? Number(value.match(/@(\d+)$/u)?.[1] ?? NaN) || null : null; }
function srcContext(rows, segment) { const row = rows.find((item) => item.segment_id === segment.id && item.segment_version === segment.version); requireValue(row, `SOURCE_CONTEXT_MISSING:${segment.id}`); return row; }
function addSourceRecord(out, id, row) { requireValue(row, `SOURCE_RECORD_MISSING:${id}`); out[TABLES.sources].push(row); }
function externalKeyFromRow(row) { return [row.registry_type,row.registry_id,row.registry_version,row.registry_digest,row.dependency_id,row.dependency_version,row.dependency_digest].join('|'); }
function externalKeyFromEdge(edge) { return [edge.target_registry_type,edge.target_registry_id,edge.target_registry_version,edge.target_registry_digest,edge.target_entity_id,edge.target_version,edge.target_dependency_digest].join('|'); }
function externalTarget(edge, externalById, role, id, version) {
  const row = externalById.get(`${id}@${version}`);
  requireValue(row && row.registry_type === 'spatial_materialization', `EXTERNAL_PIN_MISSING:${id}@${version}`);
  return { ...edge, dependency_role: role, target_entity_kind: 'external_dependency', target_entity_id: id, target_version: version,
    target_registry_type: row.registry_type, target_registry_id: row.registry_id, target_registry_version: row.registry_version,
    target_registry_digest: row.registry_digest, target_dependency_digest: row.dependency_digest };
}
function addSegmentEdges(out, segment, context, externalById) {
  const common = { source_entity_kind: 'world_route_segment', source_entity_id: segment.id, source_version: segment.version,
    world_revision_id: segment.world_revision_id, canonical_ordinal: 0, provenance_ref: CANDIDATE_SOURCE };
  const deps = [['g0', context.g0_id], ['g1', context.g1_id], ['weather_scope', context.weather_scope_id]];
  for (const [role, id] of deps) out[TABLES.edges].push(externalTarget(common, externalById, role, id, 1));
}
function addWorldRouteEdge(out, route, externalById) {
  const common = { source_entity_kind: 'world_route', source_entity_id: route.id, source_version: route.version,
    world_revision_id: route.world_revision_id, canonical_ordinal: 0, provenance_ref: CANDIDATE_SOURCE };
  out[TABLES.edges].push(externalTarget(common, externalById, 'route_kind', route.route_kind_id, 1));
}
function addG5EndpointEdge(out, endpoint) {
  out[TABLES.edges].push({ source_entity_kind: 'world_route_endpoint_binding', source_entity_id: endpoint.id, source_version: endpoint.version,
    world_revision_id: endpoint.world_revision_id, dependency_role: 'canonical_g5', target_entity_kind: 'spatial_node',
    target_entity_id: endpoint.canonical_g5_id, target_version: endpoint.canonical_g5_version, canonical_ordinal: 0, provenance_ref: CANDIDATE_SOURCE });
}
function addOffroadProfileEdges(out, offroad, externalById) {
  const profile = offroad.profile;
  const common = { source_entity_kind: 'line_kind_profile', source_entity_id: profile.id, source_version: profile.version,
    world_revision_id: profile.world_revision_id, canonical_ordinal: 0, provenance_ref: CANDIDATE_SOURCE };
  for (const [role, targetKind, id, version] of [
    ['transition_environment_profile', 'transition_environment_profile', profile.transition_environment_profile_id, profile.transition_environment_profile_version],
    ['movement_method_cost_profile', 'movement_method_cost_profile', profile.movement_method_cost_profile_id, profile.movement_method_cost_profile_version],
    ['dynamic_recheck_policy', 'dynamic_recheck_policy', profile.dynamic_recheck_policy_id, profile.dynamic_recheck_policy_version],
  ]) out[TABLES.edges].push({ ...common, dependency_role: role, target_entity_kind: targetKind,
    target_entity_id: id, target_version: version });
  const routeKind = externalById.get(`${profile.route_kind_id}@1`);
  requireValue(routeKind, `EXTERNAL_PIN_MISSING:${profile.route_kind_id}`);
  out[TABLES.edges].push(externalTarget(common, externalById, 'route_kind', profile.route_kind_id, 1));
}

export function validateWorldRouteDependencyEdges(datasets) {
  const routes = datasets[TABLES.routes] ?? [];
  const segments = datasets[TABLES.segments] ?? [];
  const edges = datasets[TABLES.edges] ?? [];
  const routeEdges = edges.filter((edge) => edge.source_entity_kind === 'world_route');
  requireValue(routeEdges.length === routes.length, `WORLD_ROUTE_KIND_EDGE_COUNT:${routeEdges.length}/${routes.length}`);
  for (const route of routes) {
    const matching = routeEdges.filter((edge) => edge.source_entity_id === route.id && edge.source_version === route.version);
    requireValue(matching.length === 1, `WORLD_ROUTE_KIND_EDGE_MISSING:${route.id}@${route.version}`);
    const edge = matching[0];
    requireValue(edge.dependency_role === 'route_kind' && edge.target_entity_kind === 'external_dependency'
      && edge.target_entity_id === route.route_kind_id && edge.target_version === 1,
    `WORLD_ROUTE_KIND_EDGE_TARGET_MISMATCH:${route.id}@${route.version}`);
  }
  const segmentByRef = new Map(segments.map((segment) => [`${segment.id}@${segment.version}`, segment]));
  for (const edge of edges.filter((item) => item.dependency_role === 'baseline_movement_method')) {
    const segment = segmentByRef.get(`${edge.source_entity_id}@${edge.source_version}`);
    requireValue(edge.source_entity_kind === 'world_route_segment' && segment,
      `SEGMENT_METHOD_EDGE_SOURCE_MISSING:${edge.source_entity_id}@${edge.source_version}`);
    requireValue(edge.target_entity_id === segment.baseline_movement_method_id,
      `SEGMENT_METHOD_EDGE_TARGET_MISMATCH:${edge.source_entity_id}@${edge.source_version}`);
  }
  return true;
}
function offroadProfile(inputs) {
  const lineSpec = inputs.lineSpec;
  const sourceCross11 = inputs.pairs.find((pair) => pair.pair.route_pair_id === 'cross_g4_11');
  requireValue(sourceCross11, 'OFFROAD_BASIS_CROSS11_MISSING');
  const method = mappedMethod(inputs, 'movement.foot');
  const cost = sealed({ id: 'cost.line_offroad', version: 1, world_revision_id: WORLD_REVISION,
    baseline_movement_method_id: method, base_minutes: null, dynamic_modifiers_required: true, calibration_kind: 'minutes_on_line',
    distance_derived: null, measured_historical_duration: false,
    definition: 'offroad: authored for cross_g4_11 from its place-geo land-crossing basis; line minutes are stored on segments.',
    status: 'approved', provenance_ref: CANDIDATE_SOURCE });
  const env = inputs.baseDatasets[TABLES.envs].find((row) => row.id === 'env.offroad' && row.version === 1);
  requireValue(env && env.world_revision_id === WORLD_REVISION, 'OFFROAD_ENV_BASE_ROW_MISSING');
  const profile = sealed({ id: 'lkp__offroad', version: 1, world_revision_id: WORLD_REVISION, line_kind_id: 'line.offroad',
    transition_environment_profile_id: env.id, transition_environment_profile_version: env.version,
    topological_orientation_profile_id: 'orientation.topological_route', topological_orientation_profile_version: 1,
    baseline_movement_method_id: method, movement_method_cost_profile_id: cost.id, movement_method_cost_profile_version: cost.version,
    dynamic_recheck_policy_id: 'recheck.land_30m', dynamic_recheck_policy_version: 1, route_kind_id: 'route.offroad_crossing',
    status: 'approved', provenance_ref: CANDIDATE_SOURCE });
  const costOption = { profile_id: cost.id, profile_version: cost.version, movement_method_id: method, cost_mode: 'baseline', factor_numerator: null, factor_denominator: null };
  return { cost, env, profile, costOption, source_route: sourceCross11.pair.route_pair_id, lineSpec };
}

function addBaseClosures(out, inputs, pairs) {
  const { baseDatasets } = inputs;
  const g5Ids = new Set(pairs.flatMap(({ forwardSource, reverseSource }) => [forwardSource.from.canonical_g5_id, forwardSource.to.canonical_g5_id, reverseSource.from.canonical_g5_id, reverseSource.to.canonical_g5_id]));
  const endpointIds = new Set(pairs.flatMap(({ forwardSource, reverseSource }) => [...forwardSource.endpoints, ...reverseSource.endpoints].map((item) => item.directional_exit_id).filter(Boolean)));
  const contexts = pairs.flatMap(({ forwardSource, reverseSource }) => [forwardSource, reverseSource])
    .map(({ segments }) => srcContext(baseDatasets[TABLES.contexts], segments[0]));
  const requiredNodeIds = new Set([...g5Ids, ...contexts.flatMap((row) => [row.g0_id, row.g1_id, row.g2_id, row.g3_id, row.g4_corridor_id].filter(Boolean))]);
  const parentRows = [];
  let frontier = [...requiredNodeIds];
  while (frontier.length) {
    const parents = baseDatasets[TABLES.parents].filter((row) => frontier.includes(row.child_id) && !requiredNodeIds.has(row.parent_id));
    parentRows.push(...parents);
    frontier = parents.map((row) => row.parent_id);
    for (const id of frontier) requiredNodeIds.add(id);
  }
  const nodeRows = baseDatasets[TABLES.nodes].filter((row) => requiredNodeIds.has(row.id));
  out[TABLES.nodes].push(...nodeRows);
  out[TABLES.parents].push(...baseDatasets[TABLES.parents].filter((row) => requiredNodeIds.has(row.child_id) && requiredNodeIds.has(row.parent_id)));
  const exitRows = baseDatasets[TABLES.exits].filter((row) => endpointIds.has(row.id));
  out[TABLES.exits].push(...exitRows);
  const directionContextIds = new Set(exitRows.map((row) => row.direction_context_id).filter(Boolean));
  const directionContexts = baseDatasets[TABLES.directionContexts].filter((row) => directionContextIds.has(row.id));
  requireValue(directionContexts.length === directionContextIds.size, 'EXIT_DIRECTION_CONTEXT_CLOSURE_MISSING');
  out[TABLES.directionContexts].push(...directionContexts);
  const exitRuleIds = new Set(exitRows.map((row) => ref(row.exit_orientation_rule_id, row.exit_orientation_rule_version)).filter((value) => !value.startsWith('null@')));
  const exitRules = baseDatasets[TABLES.exitOrientationRules].filter((row) => exitRuleIds.has(ref(row.id, row.version)));
  requireValue(exitRules.length === exitRuleIds.size, 'EXIT_ORIENTATION_RULE_CLOSURE_MISSING');
  out[TABLES.exitOrientationRules].push(...exitRules);
  const connectionsByRef = new Map(baseDatasets[TABLES.connections].map((row) => [ref(row.id, row.version), row]));
  const connections = new Map(); const entries = new Map();
  for (const { forwardSource, reverseSource } of pairs) for (const endpoint of [...forwardSource.endpoints, ...reverseSource.endpoints]) {
    const matches = baseDatasets[TABLES.connections].filter((row) => endpoint.endpoint_role === 'from'
      ? row.from_canonical_g5_id === endpoint.canonical_g5_id && row.from_scene_endpoint_slot_key === endpoint.scene_endpoint_slot_key
      : row.to_canonical_g5_id === endpoint.canonical_g5_id && row.to_scene_endpoint_slot_key === endpoint.scene_endpoint_slot_key)
      .sort((left, right) => ref(left.id, left.version).localeCompare(ref(right.id, right.version)));
    if (matches.length) {
      const binding = matches[0]; const opposite = connectionsByRef.get(ref(binding.reverse_binding_id, binding.reverse_binding_version));
      requireValue(opposite, `CONNECTION_REVERSE_CLOSURE_MISSING:${binding.id}`);
      connections.set(ref(binding.id, binding.version), binding); connections.set(ref(opposite.id, opposite.version), opposite);
    } else {
      const matchingEntry = baseDatasets[TABLES.entries].find((row) => row.canonical_g5_id === endpoint.canonical_g5_id
        && (endpoint.endpoint_role === 'from' ? row.departure_scene_endpoint_slot_key : row.arrival_scene_endpoint_slot_key) === endpoint.scene_endpoint_slot_key);
      requireValue(matchingEntry, `ENDPOINT_SLOT_CLOSURE_MISSING:${endpoint.id}`);
      entries.set(ref(matchingEntry.id, matchingEntry.version), matchingEntry);
    }
  }
  out[TABLES.connections].push(...connections.values());
  out[TABLES.entries].push(...entries.values());
  const connectionProfileIds = new Set([...connections.values()].map((row) => ref(row.connection_profile_id, row.connection_profile_version)));
  const connectionProfiles = baseDatasets[TABLES.connectionProfiles].filter((row) => connectionProfileIds.has(ref(row.id, row.version)));
  requireValue(connectionProfiles.length === connectionProfileIds.size, 'CONNECTION_PROFILE_CLOSURE_MISSING');
  out[TABLES.connectionProfiles].push(...connectionProfiles);
  const sourcePairIds = new Set([...connections.values(), ...entries.values()].map((row) => ref(row.source_pair_id, row.source_pair_version)));
  const sourcePairs = baseDatasets[TABLES.sourcePairs].filter((row) => sourcePairIds.has(ref(row.id, row.version)));
  requireValue(sourcePairs.length === sourcePairIds.size, 'PHYSICAL_SOURCE_PAIR_CLOSURE_MISSING');
  out[TABLES.sourcePairs].push(...sourcePairs);
  const versions = baseDatasets[TABLES.versions];
  for (const [kind, rows] of [['spatial_node', nodeRows], ['g4_directional_exit', exitRows], ['topological_direction_context', directionContexts], ['canonical_g5_connection_binding', [...connections.values()]], ['g4_entry_endpoint_binding', [...entries.values()]], ['canonical_g5_connection_profile', connectionProfiles]]) {
    for (const row of rows) {
      const version = versions.find((item) => item.entity_kind === kind && item.entity_id === row.id && item.version === row.version);
      requireValue(version, `BASE_AUTHORING_VERSION_MISSING:${kind}:${row.id}@${row.version}`);
      out[TABLES.versions].push(version);
    }
  }
  const baseSources = new Map(baseDatasets[TABLES.sources].map((row) => [row.id, row]));
  for (const row of [...nodeRows, ...exitRows, ...directionContexts, ...exitRules, ...connections.values(), ...entries.values(), ...parentRows, ...connectionProfiles, ...sourcePairs]) {
    if (!row.provenance_ref) continue;
    const source = baseSources.get(row.provenance_ref);
    if (source) out[TABLES.sources].push(source);
  }
  for (const profile of connectionProfiles) {
    const orientation = baseDatasets[TABLES.topoOrientations].find((row) => row.id === profile.movement_orientation_profile_id && row.version === profile.movement_orientation_profile_version);
    requireValue(orientation, `CONNECTION_PROFILE_ORIENTATION_MISSING:${profile.id}`);
    out[TABLES.topoOrientations].push(orientation);
  }
  for (const row of [...out[TABLES.envs], ...out[TABLES.rechecks], ...out[TABLES.topoOrientations], ...connectionProfiles.map((profile) => ({ id: profile.transition_environment_profile_id, version: profile.transition_environment_profile_version, entity_kind: 'transition_environment_profile' })), ...connectionProfiles.map((profile) => ({ id: profile.movement_method_cost_profile_id, version: profile.movement_method_cost_profile_version, entity_kind: 'movement_method_cost_profile' })), ...connectionProfiles.map((profile) => ({ id: profile.dynamic_recheck_policy_id, version: profile.dynamic_recheck_policy_version, entity_kind: 'dynamic_recheck_policy' }))]) {
    const kind = row.entity_kind;
    if (!kind) continue;
    const version = versions.find((item) => item.entity_kind === kind && item.entity_id === row.id && item.version === row.version);
    if (version) out[TABLES.versions].push(version);
  }
  for (const profile of connectionProfiles) {
    for (const [table, id, version] of [[TABLES.envs, profile.transition_environment_profile_id, profile.transition_environment_profile_version], [TABLES.costs, profile.movement_method_cost_profile_id, profile.movement_method_cost_profile_version], [TABLES.rechecks, profile.dynamic_recheck_policy_id, profile.dynamic_recheck_policy_version]]) {
      if (!id) continue;
      const row = baseDatasets[table].find((candidate) => candidate.id === id && candidate.version === version);
      requireValue(row, `CONNECTION_PROFILE_DEPENDENCY_MISSING:${profile.id}:${id}@${version}`);
      out[table].push(row);
    }
    if (profile.movement_method_cost_profile_id) {
      const options = baseDatasets[TABLES.costOptions].filter((row) => row.profile_id === profile.movement_method_cost_profile_id && row.profile_version === profile.movement_method_cost_profile_version);
      out[TABLES.costOptions].push(...options);
    }
  }
  for (const [table, kind] of [[TABLES.envs, 'transition_environment_profile'], [TABLES.costs, 'movement_method_cost_profile'], [TABLES.rechecks, 'dynamic_recheck_policy'], [TABLES.topoOrientations, 'topological_movement_orientation_profile']]) {
    for (const row of out[table]) {
      const version = versions.find((item) => item.entity_kind === kind && item.entity_id === row.id && item.version === row.version);
      if (version) out[TABLES.versions].push(version);
      const source = baseSources.get(row.provenance_ref);
      if (source) out[TABLES.sources].push(source);
    }
  }
  for (const edge of out[TABLES.edges]) if (edge.target_entity_kind === 'spatial_node') {
    const node = baseDatasets[TABLES.nodes].find((row) => row.id === edge.target_entity_id && row.version === edge.target_version);
    requireValue(node, `EDGE_NODE_CLOSURE_MISSING:${edge.target_entity_id}`);
    if (!out[TABLES.nodes].some((row) => row.id === node.id && row.version === node.version)) out[TABLES.nodes].push(node);
  }
  for (const id of requiredNodeIds) requireValue(out[TABLES.nodes].some((row) => row.id === id), `NODE_CLOSURE_MISSING:${id}`);
}

function uniqueRows(rows, table) {
  const primary = {
    [TABLES.sources]: ['id'], [TABLES.versions]: ['entity_kind', 'entity_id', 'version'], [TABLES.edges]: ['source_entity_kind', 'source_entity_id', 'source_version', 'dependency_role', 'target_entity_kind', 'target_entity_id', 'target_version'],
    [TABLES.external]: ['registry_type', 'registry_id', 'registry_version', 'registry_digest', 'dependency_id', 'dependency_version', 'dependency_digest'],
    [TABLES.envs]: ['id', 'version'], [TABLES.costs]: ['id', 'version'], [TABLES.costOptions]: ['profile_id', 'profile_version', 'movement_method_id'],
    [TABLES.lineProfiles]: ['id', 'version'], [TABLES.lineAlternatives]: ['profile_id', 'profile_version', 'movement_method_id'],
    [TABLES.nodes]: ['id', 'version'], [TABLES.parents]: ['child_id', 'child_version'], [TABLES.exits]: ['id', 'version'],
    [TABLES.topoOrientations]: ['id', 'version'], [TABLES.rechecks]: ['id', 'version'], [TABLES.connections]: ['id', 'version'],
    [TABLES.entries]: ['id', 'version'], [TABLES.sourcePairs]: ['id', 'version'], [TABLES.connectionProfiles]: ['id', 'version'],
  }[table] ?? [];
  const seen = new Map();
  for (const row of rows) {
    const key = primary.length ? primary.map((field) => row[field]).join('|') : stableJson(row);
    const old = seen.get(key);
    if (old && !equalJson(old, row)) throw new Error(`DUPLICATE_PRIMARY_KEY_CONFLICT:${table}:${key}`);
    if (!old) seen.set(key, row);
  }
  return [...seen.values()];
}

const MANIFEST_TABLES = [
  [TABLES.external, 'closure', []],
  [TABLES.sources, 'own', []],
  [TABLES.versions, 'own', [TABLES.sources]],
  [TABLES.nodes, 'closure', [TABLES.sources, TABLES.versions]],
  [TABLES.parents, 'closure', [TABLES.nodes]],
  [TABLES.sourcePairs, 'closure', [TABLES.sources]],
  [TABLES.topoOrientations, 'closure', [TABLES.sources]],
  [TABLES.exitOrientationRules, 'closure', [TABLES.sources]],
  [TABLES.envs, 'closure', [TABLES.sources, TABLES.versions]],
  [TABLES.costs, 'own', [TABLES.sources, TABLES.versions]],
  [TABLES.costOptions, 'own', [TABLES.costs]],
  [TABLES.rechecks, 'closure', [TABLES.sources]],
  [TABLES.connectionProfiles, 'closure', [TABLES.sources, TABLES.versions, TABLES.envs, TABLES.costs, TABLES.costOptions, TABLES.rechecks, TABLES.topoOrientations]],
  [TABLES.lineProfiles, 'own', [TABLES.versions, TABLES.envs, TABLES.costs, TABLES.rechecks, TABLES.topoOrientations]],
  [TABLES.lineAlternatives, 'closure', [TABLES.lineProfiles]],
  [TABLES.exits, 'closure', [TABLES.nodes]],
  [TABLES.routes, 'own', [TABLES.sources, TABLES.versions]],
  [TABLES.points, 'own', [TABLES.sources, TABLES.versions, TABLES.routes]],
  [TABLES.segments, 'own', [TABLES.sources, TABLES.versions, TABLES.routes, TABLES.points, TABLES.envs, TABLES.costs, TABLES.rechecks, TABLES.lineProfiles]],
  [TABLES.contexts, 'own', [TABLES.sources, TABLES.segments]],
  [TABLES.endpoints, 'own', [TABLES.sources, TABLES.versions, TABLES.routes, TABLES.points, TABLES.nodes, TABLES.exits]],
  [TABLES.edges, 'own', [TABLES.sources, TABLES.versions, TABLES.external, TABLES.nodes]],
  [TABLES.connections, 'closure', [TABLES.nodes, TABLES.lineProfiles, TABLES.connectionProfiles, TABLES.sourcePairs]],
  [TABLES.entries, 'closure', [TABLES.nodes, TABLES.sourcePairs]],
  [TABLES.directionContexts, 'closure', []],
];
function buildManifest(datasets) {
  const entries = MANIFEST_TABLES.filter(([table]) => datasets[table]?.length).map(([table, kind, dependsOn]) => ({
    table, file: `datasets/${table}.json`, sha256: sha(stableJson(datasets[table])), status: 'draft',
    provenance_ref: kind === 'closure' ? `${BASE_CANDIDATE}/import-manifest.json#dependency-closure` : `${CANDIDATE}/generator-report.json`,
    delete_policy: 'forbid', depends_on: dependsOn,
  }));
  return { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_kind: 'dependency_closure',
    bundle_id: 'novgorod_m2c_world_routes_v1_candidate', world_revision_id: WORLD_REVISION, status: 'draft',
    provenance_ref: `${CANDIDATE}/generator-report.json`, delete_policy: 'forbid', data_gaps: [], datasets: entries };
}

export function collectInputs() {
  const spec = readJson(SPEC_PATH); const derived = readJson(DERIVED_PATH); const names = readJson(NAMES_PATH); const lineSpec = readJson(LINE_SPEC_PATH);
  const placeCandidate = readJson(`${PLACE_GEO}/candidate.json`);
  const baseManifest = readJson(`${BASE_CANDIDATE}/import-manifest.json`);
  const table = (dir, name) => readJson(`${dir}/${name}.json`);
  const baseDatasets = Object.fromEntries(Object.values(TABLES).filter((name) => existsSync(resolve(ROOT, `${BASE}/${name}.json`))).map((name) => [name, table(BASE, name)]));
  const lineDatasets = Object.fromEntries(Object.values(TABLES).filter((name) => existsSync(resolve(ROOT, `${LINE_DATA}/${name}.json`))).map((name) => [name, table(LINE_DATA, name)]));
  const pairs = routeMaps(spec, derived, names, {
    routes: baseDatasets[TABLES.routes], points: baseDatasets[TABLES.points], segments: baseDatasets[TABLES.segments],
    endpoints: baseDatasets[TABLES.endpoints],
  });
  const extRows = baseDatasets[TABLES.external];
  const externalById = new Map(extRows.map((row) => [`${row.dependency_id}@${row.dependency_version}`, row]));
  const routeTraces = new Map();
  for (const pair of pairs) {
    const trace = placeCandidate.route_traces[pair.pair.route_pair_id];
    requireValue(trace, `PLACE_GEO_TRACE_SOURCE_MISSING:${pair.pair.route_pair_id}`);
    routeTraces.set(pair.forward.id, trace);
    routeTraces.set(pair.reverse.id, trace);
  }
  return { spec, derived, names, placeCandidate, routeTraces, lineSpec, baseManifest, baseDatasets, lineDatasets, pairs, externalById };
}

function filesFor(result) {
  const files = new Map();
  for (const [table, rows] of Object.entries(result.datasets)) if (rows.length) files.set(`${CANDIDATE}/datasets/${table}.json`, stableJson(rows));
  files.set(`${CANDIDATE}/import-manifest.json`, stableJson(result.manifest));
  files.set(`${CANDIDATE}/generator-report.json`, stableJson(result.report));
  return files;
}
export function buildWorldRouteWave(inputs = collectInputs()) { return buildCandidate(inputs); }
export function validateWorldRouteWave(inputs = collectInputs()) {
  const built = buildCandidate(inputs);
  const manifest = built.manifest;
  requireValue(manifest.status === 'draft' && manifest.delete_policy === 'forbid', 'MANIFEST_CANDIDATE_STATE');
  requireValue(manifest.datasets.every((item) => item.status === 'draft'), 'MANIFEST_DATASET_STATUS');
  requireValue(manifest.datasets.every((item) => item.file.startsWith('datasets/') && !item.file.includes('..')), 'MANIFEST_DATASET_ESCAPE');
  requireValue(manifest.datasets.every((item) => item.depends_on.every((dep) => manifest.datasets.findIndex((dataset) => dataset.table === dep) < manifest.datasets.findIndex((dataset) => dataset.table === item.table))), 'MANIFEST_DEPENDENCY_ORDER');
  return built;
}

function main() {
  const check = process.argv.includes('--check');
  const built = validateWorldRouteWave(); const files = filesFor(built); const changed = [];
  for (const [relativePath, content] of files) {
    const path = resolve(ROOT, relativePath);
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) changed.push(relativePath);
    } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
  }
  if (check && changed.length) { console.error(`world route candidate differs: ${changed.join(', ')}`); process.exitCode = 1; return; }
  console.log(JSON.stringify({ ok: true, check, counts: built.report.counts, manifest_datasets: built.manifest.datasets.length }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
