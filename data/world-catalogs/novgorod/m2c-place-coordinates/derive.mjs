import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const here = new URL('./', import.meta.url);
const datasets = new URL('../spatial-v3/datasets/', here);
const dossierUrl = new URL('../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-dossier.json', here);
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const travelCalibration = JSON.parse(readFileSync(new URL('./travel-calibration.json', import.meta.url), 'utf8'));
const speedBandsKmh = {
  path: [1.2, 6], forest: [0.6, 4.5], bog_offroad: [0.3, 3], shore_yard: [0.2, 5],
  boat_downstream: [1.5, 12], boat_upstream: [0.4, 6], boat_across: [0.4, 8], boat_open_water: [0.5, 8],
};
const tolerance = 0.2;
const radians = Math.PI / 180;

export function geometry(from, to) {
  const latitude1 = from.lat * radians;
  const latitude2 = to.lat * radians;
  const deltaLatitude = (to.lat - from.lat) * radians;
  const deltaLongitude = (to.lon - from.lon) * radians;
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  const distanceM = 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(deltaLongitude) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude);
  const azimuthDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return {
    distance_m: Math.round(distanceM),
    azimuth_deg: Math.round(azimuthDeg * 10) / 10,
    direction_candidate: distanceM === 0 ? null : directions[Math.floor((azimuthDeg + 22.5) / 45) % 8],
  };
}

function ringOf(polygon) {
  const ring = polygon?.type === 'Polygon' ? polygon.coordinates?.[0] : null;
  if (!Array.isArray(ring) || ring.length < 4) throw new Error('Expected GeoJSON Polygon with closed exterior ring');
  const first = ring[0];
  const last = ring.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('Polygon exterior ring must be closed');
  if (ring.some(point => !Array.isArray(point) || point.length < 2
    || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) {
    throw new Error('Polygon has invalid [longitude, latitude] coordinate');
  }
  return ring.slice(0, -1).map(([x, y]) => [x, y]);
}

const xy = point => Array.isArray(point) ? point : [point.lon, point.lat];
function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function onSegment(a, b, p, epsilon = 1e-10) {
  return Math.abs(cross(a, b, p)) <= epsilon
    && p[0] >= Math.min(a[0], b[0]) - epsilon && p[0] <= Math.max(a[0], b[0]) + epsilon
    && p[1] >= Math.min(a[1], b[1]) - epsilon && p[1] <= Math.max(a[1], b[1]) + epsilon;
}
function pointInRing(point, ring, inclusive = true) {
  const p = xy(point);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j]; const b = ring[i];
    if (onSegment(a, b, p)) return inclusive;
    if ((a[1] > p[1]) !== (b[1] > p[1])
      && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function properIntersection(a, b, c, d) {
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return ((abC > 1e-10 && abD < -1e-10) || (abC < -1e-10 && abD > 1e-10))
    && ((cdA > 1e-10 && cdB < -1e-10) || (cdA < -1e-10 && cdB > 1e-10));
}
function ringsOverlap(a, b) {
  const sameAt = (offset, reverse) => a.length === b.length && a.every((point, index) => {
    const target = b[(offset + (reverse ? -index : index) + b.length * 2) % b.length];
    return point[0] === target[0] && point[1] === target[1];
  });
  for (let offset = 0; offset < b.length; offset += 1) {
    if (sameAt(offset, false) || sameAt(offset, true)) return true;
  }
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) {
    if (properIntersection(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  }
  return pointInRing(centroid(a), b, false) || pointInRing(centroid(b), a, false)
    || pointInRing(a[0], b, false) || pointInRing(b[0], a, false);
}
function polygonInside(inner, outer) {
  for (let i = 0; i < inner.length; i += 1) {
    const a = inner[i]; const b = inner[(i + 1) % inner.length];
    if (!pointInRing(a, outer) || !pointInRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], outer)) return false;
  }
  return true;
}
function centroid(ring) {
  const points = ring.length ? ring : [[0, 0]];
  return points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
}
function lineSegments(points) {
  return points.slice(1).map((point, index) => [points[index], point]);
}
function nearestTangent(point, skeletons) {
  let best = null;
  for (const skeleton of skeletons ?? []) {
    const points = skeleton.points.map(([lat, lon]) => [lon * Math.cos(point[1] * radians), lat]);
    for (const [a, b] of lineSegments(points)) {
      const p = [point[0] * Math.cos(point[1] * radians), point[1]];
      const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
      if (length2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
      const distance2 = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (!best || distance2 < best.distance2) {
        const length = Math.sqrt(length2);
        best = { x: dx / length, y: dy / length, distance2, distance_m: Math.sqrt(distance2) * 111195, id: skeleton.id,
          flow_ref: skeleton.flow_ref ?? skeleton.id, anchor_x: a[0] + t * dx, anchor_y: a[1] + t * dy };
      }
    }
  }
  return best;
}
function riverDirection(from, to, flowSkeletons) {
  const mid = [(from.lon + to.lon) / 2, (from.lat + to.lat) / 2];
  const tangent = nearestTangent(mid, flowSkeletons);
  if (!tangent) throw new Error(`Water line ${from.id} -> ${to.id} has no flow-skeleton tangent`);
  const east = (to.lon - from.lon) * Math.cos(mid[1] * radians);
  const north = to.lat - from.lat;
  const along = east * tangent.x + north * tangent.y;
  const across = east * -tangent.y + north * tangent.x;
  if (Math.hypot(along, across) < 1e-12) return { direction: 'нулевая линия', basis: `каркас ${tangent.id}; нулевая проекция` };
  return {
    direction: Math.abs(across) > Math.abs(along) ? 'поперёк течения'
      : along > 0 ? 'вниз по течению' : 'вверх по течению',
    basis: `проекция на касательную каркаса ${tangent.id}`,
    along_projection: Math.round(along * 100000) / 100000,
    across_projection: Math.round(across * 100000) / 100000,
  };
}

function authoredBankCheck(place, footprint, candidate) {
  if (!['left', 'right'].includes(place.bank_side)) return null;
  const shore = place.shore_ref && (candidate.shoreline_skeletons ?? []).find(item => item.id === place.shore_ref);
  const flowRef = place.flow_ref ?? shore?.flow_ref;
  const flowSkeletons = candidate.flow_skeletons ?? [];
  const selected = flowRef
    ? flowSkeletons.filter(item => item.id === flowRef || item.flow_ref === flowRef)
    : flowSkeletons;
  if (flowRef && !selected.length) return `missing flow skeleton ${flowRef}`;
  const sides = [...footprint, centroid(footprint)].map(([lon, lat]) => {
    const tangent = nearestTangent([lon, lat], selected);
    if (!tangent) return null;
    const point = [lon * Math.cos(lat * radians), lat];
    const signed = tangent.x * (point[1] - tangent.anchor_y) - tangent.y * (point[0] - tangent.anchor_x);
    return { signed, flowId: tangent.id };
  });
  if (sides.some(side => !side)) return `нет касательной каркаса для bank_side=${place.bank_side}`;
  const epsilon = 1e-8;
  const sign = place.bank_side === 'left' ? 1 : -1;
  const wrongSide = sides.some(side => side.signed * sign < -epsilon);
  const straddles = sides.some(side => side.signed * sign > epsilon)
    && sides.some(side => side.signed * sign < -epsilon);
  if (straddles) return `footprint crosses flow ${flowRef ?? sides[0].flowId} while declared ${place.bank_side}`;
  if (wrongSide) {
    return `footprint lies on opposite side of flow ${flowRef ?? sides[0].flowId} (declared ${place.bank_side})`;
  }
  return null;
}

export function validateCandidate(candidate, g1Corners) {
  const issues = [];
  const g4 = candidate.g3_g4_places ?? [];
  const g5 = candidate.g5_places ?? [];
  const cellRing = g1Corners?.map(corner => [corner.longitude ?? corner[0], corner.latitude ?? corner[1]]);
  if (cellRing?.length && cellRing[0][0] === cellRing.at(-1)[0] && cellRing[0][1] === cellRing.at(-1)[1]) cellRing.pop();
  if (!cellRing?.length) throw new Error('validateCandidate requires G1 corners');
  const g4Rings = new Map();
  for (const place of g4) {
    try {
      const ring = ringOf(place.sector_polygon);
      g4Rings.set(place.id, ring);
      if (!polygonInside(ring, cellRing)) issues.push(`G4 ${place.id}: sector_polygon outside G1`);
      const bankIssue = authoredBankCheck(place, ring, candidate);
      if (bankIssue) issues.push(`G4 ${place.id}: ${bankIssue}`);
      if (place.bank_side && !['left', 'right', 'channel', 'not_applicable'].includes(place.bank_side)) {
        issues.push(`G4 ${place.id}: invalid bank_side ${place.bank_side}`);
      }
    } catch (error) { issues.push(`G4 ${place.id}: ${error.message}`); }
  }
  const g4Rows = [...g4Rings];
  for (let i = 0; i < g4Rows.length; i += 1) for (let j = i + 1; j < g4Rows.length; j += 1) {
    if (ringsOverlap(g4Rows[i][1], g4Rows[j][1])) issues.push(`G4 ${g4Rows[i][0]} overlaps ${g4Rows[j][0]}`);
  }
  const g5Rings = new Map();
  const parentById = new Map(g4.map(place => [place.id, place]));
  for (const place of g5) {
    try {
      const footprint = ringOf(place.footprint);
      g5Rings.set(place.id, footprint);
      const parentRing = g4Rings.get(place.parent_id);
      if (!parentById.has(place.parent_id) || !parentRing) issues.push(`G5 ${place.id}: missing parent polygon ${place.parent_id}`);
      else if (!polygonInside(footprint, parentRing)) issues.push(`G5 ${place.id}: footprint outside parent ${place.parent_id}`);
      if (!pointInRing([place.lon, place.lat], footprint)) issues.push(`G5 ${place.id}: point outside own footprint`);
      const bankIssue = authoredBankCheck(place, footprint, candidate);
      if (bankIssue) issues.push(`G5 ${place.id}: ${bankIssue}`);
      if (place.bank_side && !['left', 'right', 'channel', 'not_applicable'].includes(place.bank_side)) {
        issues.push(`G5 ${place.id}: invalid bank_side ${place.bank_side}`);
      }
      if (place.shore_ref) {
        const shore = (candidate.shoreline_skeletons ?? []).find(item => item.id === place.shore_ref);
        if (!shore) issues.push(`G5 ${place.id}: missing shore_ref ${place.shore_ref}`);
        else if (shore.bank_side !== place.bank_side) issues.push(`G5 ${place.id}: shore_ref ${place.shore_ref} bank_side mismatch`);
      }
    } catch (error) { issues.push(`G5 ${place.id}: ${error.message}`); }
  }
  const g5Rows = [...g5Rings];
  for (let i = 0; i < g5Rows.length; i += 1) for (let j = i + 1; j < g5Rows.length; j += 1) {
    if (ringsOverlap(g5Rows[i][1], g5Rows[j][1])) issues.push(`G5 ${g5Rows[i][0]} overlaps ${g5Rows[j][0]}`);
  }
  if (g4.length !== 32) issues.push(`Expected 32 G4 sectors, found ${g4.length}`);
  if (g5.length !== 195) issues.push(`Expected 195 G5 footprints, found ${g5.length}`);
  if (issues.length) throw new Error(`Candidate geometry invalid:\n${issues.map(issue => `- ${issue}`).join('\n')}`);
  return { g4_sectors: g4.length, g5_footprints: g5.length, status: 'valid' };
}

function speedBand(method, movementClass, riverDirection) {
  const kind = String(movementClass ?? '').toLowerCase();
  if (kind === 'open_water') return 'boat_open_water';
  if (method === 'movement.small_river_craft' || kind.includes('river') || kind === 'open_water') {
    return riverDirection === 'вверх по течению' ? 'boat_upstream'
      : riverDirection === 'поперёк течения' ? 'boat_across' : 'boat_downstream';
  }
  if (method === 'movement.shore_transfer' || /shore|yard|street|door|gate|bridge|ferry|ford/.test(kind)) return 'shore_yard';
  if (/forest/.test(kind)) return 'forest';
  if (/wetland|bog|offroad/.test(kind)) return 'bog_offroad';
  if (/path|road|foot/.test(kind) || method === 'movement.foot') return 'path';
  return null;
}

function travelBand(method, movementClass, riverDirection) {
  const kind = String(movementClass ?? '').toLowerCase();
  if (kind === 'open_water') return 'boat_open_water';
  if (method === 'movement.small_river_craft' || kind.includes('river')) {
    return riverDirection === 'вверх по течению' ? 'boat_upstream'
      : riverDirection === 'поперёк течения' ? 'boat_across' : 'boat_downstream';
  }
  if (method === 'movement.shore_transfer' || /shore|yard|street|door|gate|bridge|ferry|ford/.test(kind)) return 'shore';
  if (/forest/.test(kind)) return 'forest';
  if (/wetland|bog|offroad/.test(kind)) return 'bog';
  if (/path|road|foot/.test(kind) || method === 'movement.foot') return 'path';
  return null;
}

export function deriveTravel(distanceM, method, movementClass, riverDirection, calibration = travelCalibration) {
  const band = travelBand(method, movementClass, riverDirection);
  const mode = band && calibration?.modes?.[band];
  if (!mode || !Number.isFinite(distanceM) || distanceM < 0) {
    return {
      proposed_minutes: null, travel_band: band, distance_route_m: null,
      sinuosity_factor: null, route_distance_km: null, base_speed_kmh: null,
      current_bias_kmh: null, effective_speed_kmh: null, calculation_status: 'неоценимо',
    };
  }
  let baseSpeedKmh = mode.speed_kmh;
  let currentBiasKmh = 0;
  if (band === 'boat_downstream' || band === 'boat_upstream') {
    baseSpeedKmh = mode.still_water_speed_kmh;
    const bias = calibration.current?.value_kmh ?? 0;
    currentBiasKmh = band === 'boat_downstream' ? bias : -bias;
  }
  const effectiveSpeedKmh = baseSpeedKmh + currentBiasKmh;
  if (!(effectiveSpeedKmh > 0) || !(mode.sinuosity_factor > 0)) {
    throw new Error(`Invalid travel calibration for ${band}`);
  }
  const routeDistanceM = distanceM * mode.sinuosity_factor;
  const proposedMinutes = distanceM === 0 ? 0
    : Math.max(1, Math.round(routeDistanceM / 1000 / effectiveSpeedKmh * 60));
  return {
    proposed_minutes: proposedMinutes,
    travel_band: band,
    distance_route_m: Math.round(routeDistanceM),
    sinuosity_factor: mode.sinuosity_factor,
    route_distance_km: Math.round(routeDistanceM / 10) / 100,
    base_speed_kmh: Math.round(baseSpeedKmh * 100) / 100,
    current_bias_kmh: Math.round(currentBiasKmh * 100) / 100,
    effective_speed_kmh: Math.round(effectiveSpeedKmh * 100) / 100,
    calculation_status: 'расчётная редакционная калибровка',
  };
}
function speedAssessment(distanceM, minutes, band) {
  const speed = distanceM >= 1 && Number.isFinite(minutes) && minutes > 0
    ? distanceM / 1000 / (minutes / 60) : null;
  if (speed === null || !band || !speedBandsKmh[band]) return { speed, status: 'неоценимо', band, expected_kmh: speedBandsKmh[band] ?? null };
  const [low, high] = speedBandsKmh[band];
  const allowed = [low * (1 - tolerance), high * (1 + tolerance)];
  return {
    speed,
    status: speed < allowed[0] ? 'ниже диапазона' : speed > allowed[1] ? 'выше диапазона' : 'в пределах допуска',
    band,
    expected_kmh: [low, high],
    tolerance_percent: tolerance * 100,
    tolerated_kmh: allowed,
  };
}
function nameFindings(row, lineName, qualifier) {
  if (!lineName) return [];
  const name = [lineName.name_ru, qualifier].filter(Boolean).join(' ').toLowerCase();
  const findings = [];
  const riverMatch = name.match(/(?:^|\s)(вверх|вниз)\s+по\s+(течени\w*|водотоку|руслу|реке)/);
  if (riverMatch && row.river_direction !== (riverMatch[1] === 'вверх' ? 'вверх по течению' : 'вниз по течению')) {
    findings.push({ type: 'flow_name_conflict', expected: riverMatch[1], actual: row.river_direction });
  }
  if (/берегом/.test(name)) {
    const shore = row.shoreline_alignment;
    if (!shore || shore.alignment < Math.cos(45 * radians) || shore.distance_m > 500) findings.push({
      type: 'shoreline_name_conflict', alignment: shore?.alignment ?? null, distance_m: shore?.distance_m ?? null,
      threshold_deg: 45, maximum_distance_m: 500,
    });
  }
  return findings;
}

export function deriveConnection(kind, id, from, to, minutes, method, options = {}) {
  if (!from || !to) throw new Error(`Missing endpoint in ${kind} ${id}`);
  const { direction_candidate: direction, ...measure } = geometry(from, to);
  const uncertaintyM = (from.precision_m ?? 0) + (to.precision_m ?? 0);
  const isWater = options.isWater ?? method === 'movement.small_river_craft';
  const river = isWater ? riverDirection(from, to, options.flowSkeletons ?? [])
    : { direction: 'не применяется', basis: 'неречная линия' };
  const band = speedBand(method, options.movementClass, river.direction);
  const assessment = speedAssessment(measure.distance_m, minutes, band);
  const travel = deriveTravel(measure.distance_m, method, options.movementClass, river.direction, options.travelCalibration ?? travelCalibration);
  const longTransitionThreshold = Number.isFinite(travelCalibration.editorial_policy.long_transition_threshold_minutes)
    ? travelCalibration.editorial_policy.long_transition_threshold_minutes : 30;
  const suggestedSegmentCount = Number.isFinite(travel.proposed_minutes)
    ? Math.max(1, Math.ceil(travel.proposed_minutes / longTransitionThreshold)) : null;
  const mid = [(from.lon + to.lon) / 2, (from.lat + to.lat) / 2];
  const shoreRefs = [options.shoreRef, from.shore_ref, to.shore_ref].filter(Boolean);
  const commonShoreRef = shoreRefs.length && shoreRefs.every(ref => ref === shoreRefs[0]) ? shoreRefs[0] : null;
  const shoreCandidates = commonShoreRef
    ? (options.shorelineSkeletons ?? []).filter(skeleton => skeleton.id === commonShoreRef)
    : options.shorelineSkeletons ?? [];
  const shoreTangent = nearestTangent(mid, shoreCandidates);
  const bearing = measure.azimuth_deg * radians;
  const shorelineAlignment = shoreTangent ? {
    skeleton_id: shoreTangent.id,
    alignment: Math.abs(Math.sin(bearing) * shoreTangent.x + Math.cos(bearing) * shoreTangent.y),
    distance_m: Math.round(shoreTangent.distance_m),
  } : null;
  const speedKmh = assessment.speed;
  return {
    kind, id, from_id: from.id, to_id: to.id, ...measure,
    direction,
    direction_reliability: direction === null ? 'нулевая длина линии'
      : 'авторская игровая карта; не историческая точность',
    endpoint_uncertainty_m: uncertaintyM,
    river_direction: river.direction,
    river_direction_basis: river.basis,
    river_projection: river.along_projection === undefined ? null
      : { along: river.along_projection, across: river.across_projection },
    base_minutes: minutes ?? null,
    proposed_minutes: travel.proposed_minutes,
    minutes_delta: Number.isFinite(minutes) && Number.isFinite(travel.proposed_minutes)
      ? travel.proposed_minutes - minutes : null,
    minutes_change_flag_over_30: Number.isFinite(minutes) && Number.isFinite(travel.proposed_minutes)
      ? Math.abs(travel.proposed_minutes - minutes) > longTransitionThreshold : false,
    minutes_change_threshold_minutes: longTransitionThreshold,
    proposed_over_30_minutes: Number.isFinite(travel.proposed_minutes) && travel.proposed_minutes > longTransitionThreshold,
    long_transition_threshold_minutes: longTransitionThreshold,
    suggested_segment_count: suggestedSegmentCount,
    ...travel,
    minutes_source: options.minutesSource ?? 'active_profile_no_minutes',
    movement_method_id: method ?? null,
    movement_class: options.movementClass ?? null,
    movement_method_source: options.methodSource ?? null,
    speed_kmh: speedKmh === null ? null : Math.round(speedKmh * 100) / 100,
    speed_band: assessment.band,
    expected_speed_kmh: assessment.expected_kmh,
    tolerated_speed_kmh: assessment.tolerated_kmh ?? null,
    speed_tolerance_percent: assessment.tolerance_percent ?? tolerance * 100,
    speed_status: assessment.status,
    shoreline_alignment: shorelineAlignment,
  };
}

async function json(url) { return JSON.parse(await readFile(url, 'utf8')); }
const movementClassForRoute = segment => segment.transition_environment_profile_id ?? segment.baseline_movement_method_id;

export async function buildReport(candidate, sources = datasets, lineNameCandidate = null) {
  const g1Dossier = await json(dossierUrl);
  const geometryValidation = validateCandidate(candidate, g1Dossier.coordinates.technical_bounds.corners_wgs84);
  const [bindings, profiles, routes, segments, endpoints] = await Promise.all([
    json(new URL('spatial_v3_canonical_g5_connection_bindings.json', sources)),
    json(new URL('spatial_v3_canonical_g5_connection_profiles.json', sources)),
    json(new URL('spatial_v3_world_routes.json', sources)),
    json(new URL('spatial_v3_world_route_segments.json', sources)),
    json(new URL('spatial_v3_world_route_endpoint_bindings.json', sources)),
  ]);
  const positions = new Map(candidate.g5_places.map(place => [place.id, place]));
  if (positions.size !== candidate.g5_places.length) throw new Error('Duplicate G5 ID');
  const profileById = new Map(profiles.map(profile => [profile.id, profile]));
  const localPairById = new Map((lineNameCandidate?.local_pairs ?? []).map(pair => [pair.source_pair_id, pair]));
  const routePairById = new Map();
  for (const pair of [...(lineNameCandidate?.route_pairs ?? []), ...(lineNameCandidate?.world_routes ?? [])]) {
    for (const routeId of pair.world_route_ids ?? [pair.world_route_id ?? pair.id]) routePairById.set(routeId, pair);
  }
  const segmentByRoute = new Map(segments.map(segment => [segment.world_route_id, segment]));
  const endpointsByRoute = new Map();
  for (const endpoint of endpoints) {
    const pair = endpointsByRoute.get(endpoint.world_route_id) ?? {};
    pair[endpoint.endpoint_role] = endpoint.canonical_g5_id;
    endpointsByRoute.set(endpoint.world_route_id, pair);
  }
  const flowSkeletons = candidate.flow_skeletons ?? [];
  const shorelineSkeletons = candidate.shoreline_skeletons ?? [];
  const lines = bindings.map(binding => {
    const profile = profileById.get(binding.connection_profile_id);
    if (!profile) throw new Error(`Missing connection profile ${binding.connection_profile_id}`);
    const line = localPairById.get(binding.source_pair_id);
    const localWater = line?.travel_method === 'boat'
      || ['river', 'river_channel', 'side_channel', 'open_water'].includes(line?.line_kind);
    const method = localWater ? 'movement.small_river_craft'
      : line?.line_kind === 'shore' ? 'movement.shore_transfer'
        : line ? 'movement.foot' : null;
    const from = positions.get(binding.from_canonical_g5_id);
    const to = positions.get(binding.to_canonical_g5_id);
    const derived = deriveConnection('g5_connection', binding.id, from, to,
      line?.base_minutes ?? null, method, {
        isWater: localWater,
        movementClass: line?.line_kind ?? null, shoreRef: line?.shore_ref ?? null,
        methodSource: line ? 'line_names_candidate' : null,
        minutesSource: line ? 'line_names_candidate_unapproved' : 'active_profile_no_minutes',
        flowSkeletons, shorelineSkeletons,
      });
    const qualifier = from.id === line?.from_g5_id ? line.qualifier?.from_to : line?.qualifier?.to_from;
    return { ...derived, source_pair_id: binding.source_pair_id, line_name: line?.name_ru ?? null,
      line_qualifier: qualifier ?? null, name_findings: nameFindings(derived, line, qualifier) };
  });
  const routeLines = routes.map(route => {
    const pair = endpointsByRoute.get(route.id);
    const segment = segmentByRoute.get(route.id);
    if (!pair?.from || !pair?.to || !segment) throw new Error(`Incomplete route ${route.id}`);
    const line = routePairById.get(route.id);
    const from = positions.get(pair.from); const to = positions.get(pair.to);
    const isWater = segment.baseline_movement_method_id === 'movement.small_river_craft';
    const derived = deriveConnection('world_route', route.id, from, to, segment.base_minutes,
      segment.baseline_movement_method_id, {
        isWater, movementClass: line?.line_kind ?? movementClassForRoute(segment),
        minutesSource: 'active_route_segment', methodSource: 'active_route_segment', flowSkeletons, shorelineSkeletons,
      });
    const qualifier = from.id === line?.from_g5_id ? line.qualifier?.from_to : line?.qualifier?.to_from;
    return { ...derived, line_name: line?.name_ru ?? null,
      line_qualifier: qualifier ?? null, name_findings: nameFindings(derived, line, qualifier) };
  });
  const all = [...lines, ...routeLines];
  if (lines.length !== 454 || routeLines.length !== 86 || all.length !== 540) {
    throw new Error(`Expected 454 G5 bindings + 86 world routes = 540 directed lines; got ${lines.length} + ${routeLines.length}`);
  }
  if (new Set(all.map(row => `${row.kind}:${row.id}`)).size !== 540) throw new Error('Duplicate directed line IDs');
  const tally = key => Object.fromEntries([...new Set(all.map(row => row[key]))].sort()
    .map(value => [value, all.filter(row => row[key] === value).length]));
  const nameMismatches = all.flatMap(row => row.name_findings.map(finding => ({ id: row.id, kind: row.kind, ...finding })));
  const speedMismatches = all.filter(row => ['ниже диапазона', 'выше диапазона'].includes(row.speed_status))
    .map(row => ({ id: row.id, kind: row.kind, speed_kmh: row.speed_kmh, band: row.speed_band,
      expected_speed_kmh: row.expected_speed_kmh, tolerated_speed_kmh: row.tolerated_speed_kmh,
      minutes_source: row.minutes_source }));
  const proposed = all.filter(row => Number.isFinite(row.proposed_minutes));
  const buckets = { '1-5': [1, 5], '6-15': [6, 15], '16-30': [16, 30], '31-60': [31, 60], '61-120': [61, 120], '121+': [121, Infinity] };
  const byBand = Object.fromEntries([...new Set(proposed.map(row => row.travel_band))].sort().map(band => {
    const rows = proposed.filter(row => row.travel_band === band);
    return [band, {
      count: rows.length,
      duration_buckets: Object.fromEntries(Object.entries(buckets).map(([label, [min, max]]) => [
        label, rows.filter(row => row.proposed_minutes >= min && row.proposed_minutes <= max).length,
      ])),
      minimum_minutes: Math.min(...rows.map(row => row.proposed_minutes)),
      maximum_minutes: Math.max(...rows.map(row => row.proposed_minutes)),
    }];
  }));
  const extremaRow = row => ({ kind: row.kind, id: row.id, from_id: row.from_id, to_id: row.to_id,
    base_minutes: row.base_minutes, proposed_minutes: row.proposed_minutes, travel_band: row.travel_band });
  const ascending = [...proposed].sort((a, b) => a.proposed_minutes - b.proposed_minutes || a.id.localeCompare(b.id));
  const longest = [...ascending].reverse();
  const longTransitions = proposed.filter(row => row.proposed_over_30_minutes)
    .sort((a, b) => b.proposed_minutes - a.proposed_minutes || a.id.localeCompare(b.id))
    .map(row => ({ ...extremaRow(row), suggested_segment_count: row.suggested_segment_count }));
  const minuteChangesOver30 = all.filter(row => row.minutes_change_flag_over_30);
  const travelCalibrationMetadata = {
    schema_version: travelCalibration.schema_version,
    status: travelCalibration.status,
    distance_model: travelCalibration.distance_model,
    evidence: travelCalibration.evidence,
    current: travelCalibration.current,
    modes: travelCalibration.modes,
    editorial_policy: travelCalibration.editorial_policy,
  };
  return {
    schema_version: 'rus.m2c_place_coordinate_derivation.v2',
    status: 'candidate_not_approved', source_candidate: 'candidate.json',
    local_minutes_input: lineNameCandidate ? 'line_names_candidate_unapproved' : 'none',
    geometry_validation: geometryValidation,
    line_names_candidate: lineNameCandidate ? {
      candidate_id: lineNameCandidate.candidate_id ?? null, version: lineNameCandidate.version ?? null,
      status: lineNameCandidate.status ?? null, approved: lineNameCandidate.approved ?? null,
    } : null,
    methods: {
      distance: 'WGS84 great-circle straight-line distance; not route length',
      direction: '8 compass sectors from authored game-map points; only zero-length line has no sector; historical uncertainty is separate',
      river_direction: 'projection onto nearest authored flow-skeleton tangent; independent of compass direction',
      shoreline_name: 'line containing берегом must align within 45 degrees and 500 m of shoreline skeleton; pair shore_ref preferred when shared',
      speed: 'LEGACY REVIEW ONLY: straight-line distance / existing minutes; compare with method band using ±20% tolerance. This measures old-source minutes and is not the proposed calibration.',
      proposed_minutes: 'WGS84 straight-line distance × mode sinuosity factor / calibrated effective speed; rounded to nearest whole minute with a one-minute minimum for positive distances.',
      speed_bands_kmh: speedBandsKmh, speed_tolerance_percent: tolerance * 100,
    },
    travel_calibration: travelCalibrationMetadata,
    summary: {
      g5_connections: lines.length, world_routes: routeLines.length, total_directed_lines: all.length,
      directions: tally('direction'), river_directions: tally('river_direction'), speed_statuses: tally('speed_status'),
      name_mismatch_count: nameMismatches.length,
      speed_mismatch_count: speedMismatches.length,
      legacy_current_minutes_review: {
        description: 'These existing-minute flags assess source/current candidate minutes only; they do not apply to proposed_minutes.',
        speed_statuses: tally('speed_status'), speed_mismatch_count: speedMismatches.length,
      },
      proposed_minute_distribution: {
        total_with_proposal: proposed.length,
        no_proposal_count: all.length - proposed.length,
        by_band: byBand,
        duration_buckets: Object.fromEntries(Object.entries(buckets).map(([label, [min, max]]) => [
          label, proposed.filter(row => row.proposed_minutes >= min && row.proposed_minutes <= max).length,
        ])),
      },
      minutes_change_over_30_count: minuteChangesOver30.length,
      long_transition_count: longTransitions.length,
      proposed_minutes_extremes: {
        shortest: ascending.slice(0, 5).map(extremaRow),
        longest: longest.slice(0, 5).map(extremaRow),
      },
    },
    name_mismatches: nameMismatches,
    speed_mismatches: speedMismatches,
    long_transitions: longTransitions,
    lines: all,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const candidate = await json(new URL('./candidate.json', here));
  const lineNames = process.argv[2] ? await json(pathToFileURL(process.argv[2])) : null;
  process.stdout.write(JSON.stringify(await buildReport(candidate, datasets, lineNames), null, 2) + '\n');
}
