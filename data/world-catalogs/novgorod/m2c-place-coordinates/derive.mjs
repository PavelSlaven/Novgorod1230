import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const here = new URL('./', import.meta.url);
const datasets = new URL('../spatial-v3/datasets/', here);
const dossierUrl = new URL('../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/g1-dossier.json', here);
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const travelCalibration = JSON.parse(readFileSync(new URL('./travel-calibration.json', import.meta.url), 'utf8'));
const speedBandsKmh = {
  path: [1.2, 6], forest_track: [2.5, 3], wetland_path: [1.2, 1.8], offroad: [1.5, 5], shore_yard: [0.2, 5],
  boat_downstream: [1.5, 12], boat_upstream: [0.4, 6], boat_across: [0.4, 8], boat_open_water: [0.5, 8], boat_still_water: [2, 6],
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
const mapScale = { x: 111195 * Math.cos(64.58 * radians), y: 111195 };
function mapPoint(place) { return [place.lon * mapScale.x, place.lat * mapScale.y]; }
function flowPoints(skeleton) { return (skeleton.points ?? []).map(([lat, lon]) => [lon * mapScale.x, lat * mapScale.y]); }
function pointSegmentDistance(point, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
}
function pointFlowDistance(point, skeleton) {
  return Math.min(...lineSegments(flowPoints(skeleton)).map(([a, b]) => pointSegmentDistance(point, a, b)));
}
function segmentIntersects(a, b, c, d) {
  const orient = (p, q, r) => cross(p, q, r);
  const o1 = orient(a, b, c); const o2 = orient(a, b, d);
  const o3 = orient(c, d, a); const o4 = orient(c, d, b);
  const epsilon = 1e-7;
  if (((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon))
    && ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))) return true;
  return (Math.abs(o1) <= epsilon && onSegment(a, b, c, epsilon))
    || (Math.abs(o2) <= epsilon && onSegment(a, b, d, epsilon))
    || (Math.abs(o3) <= epsilon && onSegment(c, d, a, epsilon))
    || (Math.abs(o4) <= epsilon && onSegment(c, d, b, epsilon));
}
function sampledInsideCorridor(points, skeleton, marginDirection) {
  const flow = flowPoints(skeleton); const radius = skeleton.width_m / 2;
  if (flow.length < 2 || !Number.isFinite(radius) || radius <= 0) return false;
  for (const [a, b] of lineSegments(points)) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const step = Math.min(5, Math.max(1, radius / 20));
    const intervals = Math.max(1, Math.ceil(length / step));
    const bound = length / intervals / 2;
    for (let i = 0; i <= intervals; i += 1) {
      const t = i / intervals;
      const distance = pointFlowDistance([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], skeleton);
      if (marginDirection === 'inside' ? distance + bound > radius : distance - bound <= radius) return false;
    }
  }
  return true;
}
function lineFlowIntersections(from, to, skeletons) {
  const a = mapPoint(from); const b = mapPoint(to);
  return skeletons.filter(skeleton => lineSegments(flowPoints(skeleton))
    .some(([c, d]) => segmentIntersects(a, b, c, d))).map(skeleton => skeleton.id);
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
function riverDirection(from, to, flowSkeleton, crossing = false) {
  if (!flowSkeleton) return { direction: 'неоценимо', basis: 'нет назначенного водоёма для водной линии' };
  const mid = [(from.lon + to.lon) / 2, (from.lat + to.lat) / 2];
  const tangent = nearestTangent(mid, flowSkeleton ? [flowSkeleton] : []);
  if (!tangent) throw new Error(`Water line ${from.id} -> ${to.id} has no flow-skeleton tangent`);
  const east = (to.lon - from.lon) * Math.cos(mid[1] * radians);
  const north = to.lat - from.lat;
  const along = east * tangent.x + north * tangent.y;
  const across = east * -tangent.y + north * tangent.x;
  if (flowSkeleton.waterbody_type === 'old_channel_pool' || flowSkeleton.waterbody_type === 'reed_backwater') {
    return { direction: 'без течения', basis: `стоячая вода ${flowSkeleton.waterbody_type}; каркас ${tangent.id}`,
      along_projection: Math.round(along * 100000) / 100000,
      across_projection: Math.round(across * 100000) / 100000 };
  }
  if (Math.hypot(along, across) < 1e-12) return { direction: 'нулевая линия', basis: `каркас ${tangent.id}; нулевая проекция` };
  const nearPerpendicular = Math.abs(along) <= Math.hypot(along, across) * 0.05;
  return {
    direction: crossing ? 'поперёк течения' : nearPerpendicular ? 'неоценимо'
      : along > 0 ? 'вниз по течению' : 'вверх по течению',
    basis: `проекция на касательную каркаса ${tangent.id}${nearPerpendicular && !crossing ? '; поперечная геометрия без явной переправы' : ''}`,
    along_projection: Math.round(along * 100000) / 100000,
    across_projection: Math.round(across * 100000) / 100000,
    crossing_geometry_valid: !crossing || (Math.abs(across) > Math.abs(along)
      && geometry(from, to).distance_m <= flowSkeleton.width_m * 1.5),
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

function waterbodyBindingMap(candidate) {
  const entries = candidate.line_waterbody_bindings ?? [];
  if (!Array.isArray(entries)) throw new Error('line_waterbody_bindings must be an array');
  const byKey = new Map(); const issues = [];
  for (const binding of entries) {
    const key = binding.source_pair_id ?? binding.world_route_id;
    if (!key || byKey.has(key)) issues.push(`invalid or duplicate line waterbody binding key ${key ?? '(missing)'}`);
    else byKey.set(key, binding);
  }
  return { byKey, issues, entries };
}

function corridorContainsPoint(point, skeleton) {
  const radius = skeleton.width_m / 2;
  return pointFlowDistance(mapPoint(point), skeleton) <= radius;
}

function dryFootprintTouchesCorridor(place, ring, skeleton) {
  const boundary = ring.map(([lon, lat]) => [lon * mapScale.x, lat * mapScale.y]);
  if (!sampledInsideCorridor([...boundary, boundary[0]], skeleton, 'outside')) return true;
  const flow = flowPoints(skeleton);
  for (const [a, b] of lineSegments(flow)) {
    if (pointInRing([a[0] / mapScale.x, a[1] / mapScale.y], ring)
      || pointInRing([b[0] / mapScale.x, b[1] / mapScale.y], ring)) return true;
    if (boundary.some((c, index) => segmentIntersects(a, b, c, boundary[(index + 1) % boundary.length]))) return true;
  }
  return false;
}

export function validateSpatialTopology(candidate, lines) {
  const skeletons = candidate.flow_skeletons ?? [];
  const skeletonById = new Map(skeletons.map(skeleton => [skeleton.id, skeleton]));
  const bindingState = waterbodyBindingMap(candidate);
  const points = new Map((candidate.g5_places ?? []).map(place => [place.id, place]));
  const counts = {
    nonwater_flow_intersections: 0,
    water_line_corridor_violations: 0,
    water_lines_missing_assignment: 0,
    nonwater_lines_with_assignment: 0,
    invalid_waterbody_assignments: 0,
    crossing_flag_direction_mismatches: 0,
    dry_g5_in_water_corridor: 0,
    water_g5_outside_own_corridor: 0,
    invalid_g5_waterbody_assignment: 0,
    water_g4_outside_own_corridor: 0,
    invalid_g4_waterbody_assignment: 0,
    dry_g4_in_water_corridor: 0,
    missing_route_traces: 0,
    nonwater_corridor_intrusion_count: 0,
  };
  const issues = [...bindingState.issues];
  const nonwaterCorridorIntrusions = [];
  counts.invalid_waterbody_assignments += bindingState.issues.length;
  for (const skeleton of skeletons) {
    const invalid = !skeleton.id || !skeleton.waterbody_type || !Number.isFinite(skeleton.width_m) || skeleton.width_m <= 0
      || !Number.isFinite(skeleton.current_bias_kmh) || !Array.isArray(skeleton.points) || skeleton.points.length < 2;
    if (invalid) {
      counts.invalid_waterbody_assignments += 1;
      issues.push(`invalid flow skeleton metadata ${skeleton.id ?? '(missing id)'}`);
    }
    if (['old_channel_pool', 'reed_backwater'].includes(skeleton.waterbody_type) && skeleton.current_bias_kmh !== 0) {
      counts.invalid_waterbody_assignments += 1;
      issues.push(`still-water skeleton ${skeleton.id} must have current_bias_kmh=0`);
    }
  }
  for (const line of lines) {
    const from = points.get(line.from_id); const to = points.get(line.to_id);
    const assigned = line.waterbody_ref ? skeletonById.get(line.waterbody_ref) : null;
    const segments = line.route_trace_segments?.length ? line.route_trace_segments.map(segment => ({
      a: mapPoint(segment.from), b: mapPoint(segment.to), surface: segment.surface,
      waterbody_ref: segment.waterbody_ref, crossing: segment.crossing,
    })) : from && to ? [{ a: mapPoint(from), b: mapPoint(to), surface: line.is_water ? 'water' : 'land',
      waterbody_ref: line.waterbody_ref, crossing: line.waterbody_crossing }] : [];
    if (line.is_water) {
      if (!line.waterbody_ref || !assigned) {
        counts.water_lines_missing_assignment += 1;
        issues.push(`water line ${line.id} missing/unknown waterbody_ref ${line.waterbody_ref ?? ''}`);
        continue;
      }
      const resolvedFlowId = line.route_trace_key
        ? line.route_trace_segments?.[0]?.waterbody_ref : assigned.id;
      if (line.flow_skeleton_id !== resolvedFlowId || typeof line.waterbody_crossing !== 'boolean') {
        counts.invalid_waterbody_assignments += 1;
        issues.push(`water line ${line.id} has invalid resolved assignment metadata`);
      }
      for (const [index, segment] of segments.entries()) {
        if (segment.surface === 'land') {
          if (segment.waterbody_ref || segment.crossing) {
            counts.water_line_corridor_violations += 1;
            issues.push(`water line ${line.id} land segment ${index} has waterbody/crossing metadata`);
          }
          const crossed = skeletons.filter(skeleton => lineSegments(flowPoints(skeleton))
            .some(([a, b]) => segmentIntersects(segment.a, segment.b, a, b)));
          if (crossed.length) {
            counts.water_line_corridor_violations += 1;
            issues.push(`water line ${line.id} land segment ${index} crosses water axes ${crossed.map(body => body.id).join(', ')}`);
          }
          continue;
        }
        const body = segment.waterbody_ref ? skeletonById.get(segment.waterbody_ref) : null;
        if (segment.surface !== 'water' || !body || !Number.isFinite(body.width_m) || body.width_m <= 0
          || !sampledInsideCorridor([segment.a, segment.b], body, 'inside')) {
          counts.water_line_corridor_violations += 1;
          issues.push(`water line ${line.id} segment ${index} leaves its assigned waterbody corridor`);
        }
        if (segment.crossing && !['ford', 'ferry', 'bridge', 'footbridge'].includes(line.movement_class)) {
          counts.crossing_flag_direction_mismatches += 1;
          issues.push(`water line ${line.id} segment ${index} crossing requires ford/ferry/bridge/footbridge`);
        }
        if (segment.crossing && (!segment.crossing_geometry_valid || segment.river_direction !== 'поперёк течения')) {
          counts.crossing_flag_direction_mismatches += 1;
          issues.push(`water line ${line.id} segment ${index} is not a valid transverse crossing`);
        }
        if (segment.crossing && ['old_channel_pool', 'reed_backwater'].includes(body?.waterbody_type)) {
          counts.crossing_flag_direction_mismatches += 1;
          issues.push(`still-water segment ${line.id}:${index} cannot be marked crossing`);
        }
      }
      if (!line.route_trace_key && (line.kind === 'world_route' && line.distance_m > 2000
        || segments.some(segment => segment.surface !== 'water' || !skeletonById.has(segment.waterbody_ref)
          || !sampledInsideCorridor([segment.a, segment.b], skeletonById.get(segment.waterbody_ref), 'inside')))) {
        counts.missing_route_traces += 1;
        issues.push(`water line ${line.id} requires route_trace`);
      }
      if (line.waterbody_crossing && (!line.crossing_geometry_valid || line.river_direction !== 'поперёк течения')) {
        counts.crossing_flag_direction_mismatches += 1;
        issues.push(`water line ${line.id} is marked crossing but geometry is not a transverse crossing`);
      }
      if (line.waterbody_crossing && assigned.waterbody_type && ['old_channel_pool', 'reed_backwater'].includes(assigned.waterbody_type)) {
        counts.crossing_flag_direction_mismatches += 1;
        issues.push(`still-water line ${line.id} cannot be marked crossing`);
      }
    } else {
      if (line.waterbody_ref || line.waterbody_crossing !== null) {
        counts.nonwater_lines_with_assignment += 1;
        issues.push(`nonwater line ${line.id} has waterbody assignment`);
      }
      if (from && to) {
        const crossed = segments.flatMap(segment => segment.surface === 'land'
          ? skeletons.filter(skeleton => lineSegments(flowPoints(skeleton))
            .some(([a, b]) => segmentIntersects(segment.a, segment.b, a, b))).map(skeleton => skeleton.id) : []);
        if (crossed.length) {
          counts.nonwater_flow_intersections += 1;
          issues.push(`nonwater line ${line.id} intersects flow skeletons ${[...new Set(crossed)].join(', ')}`);
          if (!line.route_trace_key) {
            counts.missing_route_traces += 1;
            issues.push(`nonwater line ${line.id} requires route_trace`);
          }
        }
        if (segments.some(segment => segment.surface !== 'land')) {
          counts.nonwater_flow_intersections += 1;
          issues.push(`nonwater line ${line.id} has a non-land trace segment`);
        }
        const totalLength = segments.reduce((sum, segment) => sum + Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]), 0);
        const accessAllowance = line.movement_method_id === 'movement.shore_transfer' ? 150 : 0;
        let intrusion = false;
        let traversed = 0;
        for (const segment of segments) {
          const length = Math.hypot(segment.b[0] - segment.a[0], segment.b[1] - segment.a[1]);
          const intervals = Math.max(1, Math.ceil(length / 20));
          if (segment.surface === 'land') for (let i = 0; i <= intervals; i += 1) {
            const along = traversed + length * i / intervals;
            if (along < accessAllowance || totalLength - along < accessAllowance) continue;
            const p = [segment.a[0] + (segment.b[0] - segment.a[0]) * i / intervals,
              segment.a[1] + (segment.b[1] - segment.a[1]) * i / intervals];
            if (skeletons.some(skeleton => Number.isFinite(skeleton.width_m) && skeleton.width_m > 0
              && pointFlowDistance(p, skeleton) <= skeleton.width_m / 2)) { intrusion = true; break; }
          }
          traversed += length;
          if (intrusion) break;
        }
        if (intrusion) {
          counts.nonwater_corridor_intrusion_count += 1;
          nonwaterCorridorIntrusions.push(line.id);
        }
      }
    }
  }
  const usedBindingKeys = new Set(lines.flatMap(line => [line.source_pair_id, line.world_route_id].filter(Boolean)));
  for (const entry of bindingState.entries) {
    if (!skeletonById.has(entry.skeleton_id) || typeof entry.crossing !== 'boolean') {
      counts.invalid_waterbody_assignments += 1;
      issues.push(`invalid line waterbody binding ${entry.source_pair_id ?? entry.world_route_id ?? '(missing key)'}`);
    }
    const key = entry.source_pair_id ?? entry.world_route_id;
    if (!usedBindingKeys.has(key)) {
      counts.invalid_waterbody_assignments += 1;
      issues.push(`unmatched line waterbody binding ${key ?? '(missing key)'}`);
    }
  }
  for (const place of candidate.g5_places ?? []) {
    const ring = (() => { try { return ringOf(place.footprint); } catch { return null; } })();
    if (!ring) continue;
    if (place.waterbody_ref) {
      const assigned = skeletonById.get(place.waterbody_ref);
      if (!assigned || !Number.isFinite(assigned.width_m) || assigned.width_m <= 0) {
        counts.invalid_g5_waterbody_assignment += 1;
        issues.push(`G5 ${place.id} has invalid waterbody_ref ${place.waterbody_ref}`);
      } else if (!corridorContainsPoint(place, assigned)) {
        counts.water_g5_outside_own_corridor += 1;
        issues.push(`G5 ${place.id} point outside ${assigned.id} corridor (${assigned.width_m} m)`);
      }
    } else {
      for (const skeleton of skeletons) {
        if (!Number.isFinite(skeleton.width_m) || skeleton.width_m <= 0) continue;
        if (dryFootprintTouchesCorridor(place, ring, skeleton)) {
          counts.dry_g5_in_water_corridor += 1;
          issues.push(`dry G5 ${place.id} footprint enters ${skeleton.id} corridor (${skeleton.width_m} m)`);
          break;
        }
      }
    }
  }
  for (const place of candidate.g3_g4_places ?? []) {
    const ring = (() => { try { return ringOf(place.sector_polygon); } catch { return null; } })();
    if (!ring) continue;
    if (place.waterbody_ref) {
      const assigned = skeletonById.get(place.waterbody_ref);
      if (!assigned || !Number.isFinite(assigned.width_m) || assigned.width_m <= 0) {
        counts.invalid_g4_waterbody_assignment += 1;
        issues.push(`G4 ${place.id} has invalid waterbody_ref ${place.waterbody_ref}`);
      } else if (!corridorContainsPoint(place, assigned)) {
        counts.water_g4_outside_own_corridor += 1;
        issues.push(`G4 ${place.id} point outside ${assigned.id} corridor (${assigned.width_m} m)`);
      }
    } else {
      for (const skeleton of skeletons) {
        if (!Number.isFinite(skeleton.width_m) || skeleton.width_m <= 0) continue;
        if (corridorContainsPoint(place, skeleton)) {
          counts.dry_g4_in_water_corridor += 1;
          issues.push(`dry G4 ${place.id} point enters ${skeleton.id} corridor (${skeleton.width_m} m)`);
          break;
        }
      }
    }
  }
  const blockingCounts = Object.entries(counts).filter(([key]) => key !== 'nonwater_corridor_intrusion_count').map(([, count]) => count);
  return { ...counts, nonwater_corridor_intrusions: nonwaterCorridorIntrusions,
    issues, status: blockingCounts.every(count => count === 0) ? 'valid' : 'invalid' };
}

function speedBand(method, movementClass, riverDirection, waterbodyType = null) {
  const kind = String(movementClass ?? '').toLowerCase();
  if (waterbodyType === 'unassigned') return null;
  if (['old_channel_pool', 'reed_backwater'].includes(waterbodyType)) return 'boat_still_water';
  if (kind === 'open_water') return 'boat_open_water';
  if (method === 'movement.small_river_craft' || kind.includes('river') || kind === 'open_water') {
    return riverDirection === 'вверх по течению' ? 'boat_upstream'
      : riverDirection === 'поперёк течения' ? 'boat_across' : 'boat_downstream';
  }
  if (method === 'movement.shore_transfer' || /shore|yard|street|door|gate|bridge|ferry|ford/.test(kind)) return 'shore_yard';
  if (/forest/.test(kind)) return 'forest_track';
  if (kind === 'offroad') return 'offroad';
  if (/wetland|bog/.test(kind)) return 'wetland_path';
  if (/path|road|foot/.test(kind) || method === 'movement.foot') return 'path';
  return null;
}

function travelBand(method, movementClass, riverDirection, waterbodyType = null) {
  const kind = String(movementClass ?? '').toLowerCase();
  if (waterbodyType === 'unassigned') return null;
  if (['old_channel_pool', 'reed_backwater'].includes(waterbodyType)) return 'boat_still_water';
  if (kind === 'open_water') return 'boat_open_water';
  if (method === 'movement.small_river_craft' || kind.includes('river')) {
    return riverDirection === 'вверх по течению' ? 'boat_upstream'
      : riverDirection === 'поперёк течения' ? 'boat_across' : 'boat_downstream';
  }
  if (method === 'movement.shore_transfer' || /shore|yard|street|door|gate|bridge|ferry|ford/.test(kind)) return 'shore';
  if (kind === 'offroad') return 'offroad';
  if (/forest/.test(kind)) return 'forest_track';
  if (/wetland|bog/.test(kind)) return 'wetland_path';
  if (/path|road|foot/.test(kind) || method === 'movement.foot') return 'path';
  return null;
}

export function deriveTravel(distanceM, method, movementClass, riverDirection, calibration = travelCalibration, waterbody = {}) {
  const band = travelBand(method, movementClass, riverDirection, waterbody.waterbodyType);
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
  if (band === 'boat_downstream' || band === 'boat_upstream' || band === 'boat_still_water') {
    baseSpeedKmh = mode.still_water_speed_kmh;
    if (band !== 'boat_still_water') {
      const typeBias = calibration.current?.water_body_type_overrides_kmh?.[waterbody.waterbodyType];
      const bias = Number.isFinite(waterbody.currentBiasKmh) ? waterbody.currentBiasKmh
        : Number.isFinite(typeBias) ? typeBias : calibration.current?.value_kmh ?? 0;
      currentBiasKmh = band === 'boat_downstream' ? bias : -bias;
    }
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

function orderedTrace(trace, from, to) {
  if (!trace) return null;
  if (!Array.isArray(trace.points) || trace.points.length < 2
    || !Array.isArray(trace.segments) || trace.segments.length !== trace.points.length - 1) {
    throw new Error(`route_trace ${trace.key} needs N points and N-1 segments`);
  }
  if (trace.points.some(point => !Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)
    || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180)) {
    throw new Error(`route_trace ${trace.key} has invalid WGS84 point`);
  }
  let ordered;
  if (trace.from_id === from.id && trace.to_id === to.id) ordered = trace;
  else if (trace.from_id === to.id && trace.to_id === from.id) {
    ordered = { ...trace, points: [...trace.points].reverse(), segments: [...trace.segments].reverse() };
  } else throw new Error(`route_trace ${trace.key} endpoints do not match ${from.id} -> ${to.id}`);
  if (geometry(ordered.points[0], from).distance_m > 1
    || geometry(ordered.points.at(-1), to).distance_m > 1) {
    throw new Error(`route_trace ${trace.key} endpoints do not match authored place coordinates`);
  }
  return ordered;
}

function traceMetrics(trace, method, movementClass, options) {
  if (!trace) return null;
  if (!Array.isArray(trace.points) || trace.points.length < 2
    || !Array.isArray(trace.segments) || trace.segments.length !== trace.points.length - 1) {
    throw new Error(`route_trace ${trace.key} needs N points and N-1 segments`);
  }
  const skeletonById = new Map((options.flowSkeletons ?? []).map(item => [item.id, item]));
  const overallWater = options.isWater ?? method === 'movement.small_river_craft';
  let distanceM = 0; let durationMinutes = 0; const segmentRows = [];
  for (let index = 0; index < trace.segments.length; index += 1) {
    const segment = trace.segments[index];
    const from = trace.points[index]; const to = trace.points[index + 1];
    const geometryRow = geometry(from, to); const length = geometryRow.distance_m;
    if (length < 1) throw new Error(`route_trace ${trace.key} has zero-length segment ${index}`);
    distanceM += length;
    const isWater = segment.surface === 'water';
    if (!isWater && segment.surface !== 'land') throw new Error(`route_trace ${trace.key} segment ${index} has invalid surface`);
    if (!isWater && (segment.waterbody_ref != null || segment.crossing === true)) {
      throw new Error(`route_trace ${trace.key} land segment ${index} cannot name/cross a waterbody`);
    }
    if (isWater !== overallWater && !segment.movement_method_id) {
      throw new Error(`route_trace ${trace.key} segment ${index} needs movement_method_id when surface changes`);
    }
    const legMethod = segment.movement_method_id ?? method;
    const skeleton = isWater ? skeletonById.get(segment.waterbody_ref) : null;
    if (isWater && !skeleton) throw new Error(`route_trace ${trace.key} segment ${index} references unknown waterbody ${segment.waterbody_ref}`);
    if (isWater && typeof segment.crossing !== 'boolean') {
      throw new Error(`route_trace ${trace.key} segment ${index} requires crossing boolean`);
    }
    const river = isWater ? riverDirection(from, to, skeleton, segment.crossing)
      : { direction: 'не применяется', basis: 'сухопутный сегмент трассы' };
    const movement = segment.movement_class ?? (isWater ? movementClass : 'path');
    const calibration = options.travelCalibration ?? travelCalibration;
    const band = travelBand(legMethod, movement, river.direction, skeleton?.waterbody_type ?? null);
    const routeFactor = calibration.editorial_policy.route_trace_residual_factor?.[segment.surface]
      ?? (isWater ? 1.05 : 1.10);
    const segmentCalibration = band && calibration.modes?.[band]
      ? { ...calibration, modes: { ...calibration.modes,
        [band]: { ...calibration.modes[band], sinuosity_factor: routeFactor } } } : calibration;
    const travel = deriveTravel(length, legMethod, movement, river.direction,
      segmentCalibration, {
        waterbodyType: skeleton?.waterbody_type ?? null,
        currentBiasKmh: skeleton?.current_bias_kmh,
      });
    if (!Number.isFinite(travel.proposed_minutes)) {
      throw new Error(`route_trace ${trace.key} segment ${index} has no travel calibration`);
    }
    const segmentDuration = travel.distance_route_m / 1000 / travel.effective_speed_kmh * 60;
    durationMinutes += segmentDuration;
    segmentRows.push({ index, surface: segment.surface, from: { lat: from.lat, lon: from.lon },
      to: { lat: to.lat, lon: to.lon }, distance_m: length, waterbody_ref: skeleton?.id ?? null,
      crossing: isWater ? segment.crossing : false, river_direction: river.direction,
      river_direction_basis: river.basis, crossing_geometry_valid: river.crossing_geometry_valid ?? null,
      river_projection: river.along_projection === undefined ? null
        : { along: river.along_projection, across: river.across_projection },
      movement_method_id: legMethod, movement_class: movement,
      travel_band: travel.travel_band, sinuosity_factor: routeFactor,
      base_speed_kmh: travel.base_speed_kmh, current_bias_kmh: travel.current_bias_kmh,
      effective_speed_kmh: travel.effective_speed_kmh,
      duration_minutes_unrounded: Math.round(segmentDuration * 1000) / 1000,
      suggested_route_point: index < trace.points.length - 2 });
  }
  const first = segmentRows[0];
  const classes = Object.fromEntries(['вниз по течению', 'вверх по течению', 'поперёк течения', 'неоценимо']
    .map(key => [key, segmentRows.filter(row => row.river_direction === key)
      .reduce((sum, row) => sum + row.distance_m, 0) / distanceM]));
  return { distanceM, durationMinutes, proposedMinutes: Math.max(1, Math.round(durationMinutes)), segments: segmentRows, first,
    flow_length_shares: Object.fromEntries(Object.entries(classes).map(([key, value]) => [key, Math.round(value * 10000) / 10000])) };
}

export function deriveConnection(kind, id, from, to, minutes, method, options = {}) {
  if (!from || !to) throw new Error(`Missing endpoint in ${kind} ${id}`);
  const { direction_candidate: direction, ...measure } = geometry(from, to);
  const trace = orderedTrace(options.routeTrace, from, to);
  const traceResult = traceMetrics(trace, method, options.movementClass, options);
  const uncertaintyM = Number.isFinite(from.precision_m) && Number.isFinite(to.precision_m)
    ? from.precision_m + to.precision_m : null;
  const isWater = options.isWater ?? method === 'movement.small_river_craft';
  const river = traceResult
    ? { direction: traceResult.first.river_direction, basis: traceResult.first.river_direction_basis,
      crossing_geometry_valid: traceResult.first.crossing_geometry_valid,
      along_projection: traceResult.first.river_projection?.along,
      across_projection: traceResult.first.river_projection?.across }
    : isWater ? riverDirection(from, to, options.flowSkeleton ?? null, options.crossing ?? false)
    : { direction: 'не применяется', basis: 'неречная линия' };
  const band = speedBand(method, options.movementClass, river.direction, options.flowSkeleton?.waterbody_type);
  const assessment = speedAssessment(traceResult?.distanceM ?? measure.distance_m, minutes, band);
  const travel = deriveTravel(measure.distance_m, method, options.movementClass, river.direction,
    options.travelCalibration ?? travelCalibration, {
      waterbodyType: options.flowSkeleton?.waterbody_type ?? (isWater ? 'unassigned' : null),
      currentBiasKmh: options.flowSkeleton?.current_bias_kmh,
    });
  const longTransitionThreshold = Number.isFinite(travelCalibration.editorial_policy.long_transition_threshold_minutes)
    ? travelCalibration.editorial_policy.long_transition_threshold_minutes : 30;
  const proposedMinutes = traceResult?.proposedMinutes ?? travel.proposed_minutes;
  const suggestedSegmentCount = Number.isFinite(proposedMinutes)
    ? Math.max(1, Math.ceil(proposedMinutes / longTransitionThreshold)) : null;
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
    crossing_geometry_valid: river.crossing_geometry_valid ?? null,
    river_projection: river.along_projection === undefined ? null
      : { along: river.along_projection, across: river.across_projection },
    base_minutes: minutes ?? null,
    minutes_delta: Number.isFinite(minutes) && Number.isFinite(proposedMinutes)
      ? proposedMinutes - minutes : null,
    minutes_change_flag_over_30: Number.isFinite(minutes) && Number.isFinite(proposedMinutes)
      ? Math.abs(proposedMinutes - minutes) > longTransitionThreshold : false,
    minutes_change_threshold_minutes: longTransitionThreshold,
    proposed_over_30_minutes: Number.isFinite(proposedMinutes) && proposedMinutes > longTransitionThreshold,
    long_transition_threshold_minutes: longTransitionThreshold,
    suggested_segment_count: suggestedSegmentCount,
    ...travel,
    proposed_minutes: proposedMinutes,
    distance_route_m: traceResult?.distanceM ?? travel.distance_route_m,
    route_distance_km: traceResult ? Math.round(traceResult.distanceM / 10) / 100 : travel.route_distance_km,
    sinuosity_factor: traceResult ? null : travel.sinuosity_factor,
    effective_speed_kmh: traceResult && traceResult.durationMinutes > 0
      ? Math.round((traceResult.segments.reduce((sum, row) => sum + row.sinuosity_factor * row.distance_m, 0)
        / 1000 / traceResult.durationMinutes * 60) * 100) / 100
      : travel.effective_speed_kmh,
    travel_band: traceResult?.first.travel_band ?? travel.travel_band,
    base_speed_kmh: traceResult?.first.base_speed_kmh ?? travel.base_speed_kmh,
    current_bias_kmh: traceResult?.first.current_bias_kmh ?? travel.current_bias_kmh,
    route_trace_key: trace?.key ?? null,
    route_trace_segments: traceResult?.segments ?? null,
    flow_length_shares: traceResult?.flow_length_shares ?? null,
    is_water: isWater,
    waterbody_ref: options.flowSkeleton?.id ?? null,
    waterbody_crossing: isWater ? Boolean(traceResult?.first.crossing ?? options.crossing) : null,
    flow_skeleton_id: traceResult?.first.waterbody_ref ?? options.flowSkeleton?.id ?? null,
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
    if (pair.route_pair_id) routePairById.set(pair.route_pair_id, pair);
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
  const waterbodyBindings = waterbodyBindingMap(candidate).byKey;
  const rawRouteTraces = candidate.route_traces ?? [];
  const routeTraceEntries = Array.isArray(rawRouteTraces) ? rawRouteTraces
    : Object.entries(rawRouteTraces).map(([key, trace]) => ({ ...trace, key }));
  const routeTraceByKey = new Map(routeTraceEntries.map(trace => [trace.key, trace]));
  if (routeTraceByKey.size !== routeTraceEntries.length) throw new Error('Duplicate route_trace key');
  const lines = bindings.map(binding => {
    const profile = profileById.get(binding.connection_profile_id);
    if (!profile) throw new Error(`Missing connection profile ${binding.connection_profile_id}`);
    const line = localPairById.get(binding.source_pair_id);
    const waterbodyBinding = waterbodyBindings.get(binding.source_pair_id);
    const localWater = line ? line.travel_method === 'boat'
      || ['river', 'river_channel', 'side_channel', 'open_water'].includes(line.line_kind)
      : Boolean(waterbodyBinding);
    const method = localWater ? 'movement.small_river_craft'
      : line?.line_kind === 'shore' ? 'movement.shore_transfer'
        : line ? 'movement.foot' : null;
    const from = positions.get(binding.from_canonical_g5_id);
    const to = positions.get(binding.to_canonical_g5_id);
    const flowSkeleton = flowSkeletons.find(item => item.id === waterbodyBinding?.skeleton_id) ?? null;
    const routeTrace = routeTraceByKey.get(binding.source_pair_id) ?? null;
    const derived = deriveConnection('g5_connection', binding.id, from, to,
      line?.base_minutes ?? null, method, {
        isWater: localWater,
        movementClass: line?.line_kind ?? null, shoreRef: line?.shore_ref ?? null,
        methodSource: line ? 'line_names_candidate' : null,
        minutesSource: line ? 'line_names_candidate_unapproved' : 'active_profile_no_minutes',
        flowSkeleton, flowSkeletons, crossing: waterbodyBinding?.crossing ?? false,
        routeTrace, shorelineSkeletons,
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
    const routeSuffix = route.id.match(/cross_g4_\d+/)?.[0];
    const waterbodyBinding = [route.id, pair.world_route_id, line?.world_route_id, line?.route_pair_id, line?.id, routeSuffix]
      .filter(Boolean).map(key => waterbodyBindings.get(key)).find(Boolean);
    const flowSkeleton = flowSkeletons.find(item => item.id === waterbodyBinding?.skeleton_id) ?? null;
    const routeTrace = routeTraceByKey.get(route.id) ?? routeTraceByKey.get(routeSuffix)
      ?? routeTraceByKey.get(line?.route_pair_id)
      ?? routeTraceEntries.find(trace => (trace.from_id === pair.from && trace.to_id === pair.to)
        || (trace.from_id === pair.to && trace.to_id === pair.from)) ?? null;
    const derived = deriveConnection('world_route', route.id, from, to, segment.base_minutes,
      segment.baseline_movement_method_id, {
        isWater, movementClass: line?.line_kind ?? movementClassForRoute(segment),
        minutesSource: 'active_route_segment', methodSource: 'active_route_segment', flowSkeleton,
        crossing: waterbodyBinding?.crossing ?? false, routeTrace, flowSkeletons, shorelineSkeletons,
      });
    const qualifier = from.id === line?.from_g5_id ? line.qualifier?.from_to : line?.qualifier?.to_from;
    return { ...derived, world_route_id: line?.route_pair_id ?? routeSuffix ?? route.id, line_name: line?.name_ru ?? null,
      line_qualifier: qualifier ?? null, name_findings: nameFindings(derived, line, qualifier) };
  });
  const all = [...lines, ...routeLines];
  if (lines.length !== 454 || routeLines.length !== 86 || all.length !== 540) {
    throw new Error(`Expected 454 G5 bindings + 86 world routes = 540 directed lines; got ${lines.length} + ${routeLines.length}`);
  }
  const usedTraceKeys = new Set(all.map(row => row.route_trace_key).filter(Boolean));
  const unusedTraceKeys = routeTraceEntries.map(trace => trace.key).filter(key => !usedTraceKeys.has(key));
  if (unusedTraceKeys.length) throw new Error(`Unmatched route_traces: ${unusedTraceKeys.join(', ')}`);
  if (new Set(all.map(row => `${row.kind}:${row.id}`)).size !== 540) throw new Error('Duplicate directed line IDs');
  const spatialTopologyValidation = validateSpatialTopology(candidate, all);
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
  const authoredPlaces = [...(candidate.g3_g4_places ?? []), ...(candidate.g5_places ?? [])];
  const historicalBasisCounts = Object.fromEntries([...new Set(authoredPlaces.map(place => place.historical_basis))]
    .sort().map(basis => [basis, authoredPlaces.filter(place => place.historical_basis === basis).length]));
  const basisCounts = Object.fromEntries(['anchored', 'reconstructed', 'schematic']
    .map(basis => [basis, authoredPlaces.filter(place => place.basis === basis).length]));
  const recognizedAreas = Object.fromEntries(['vikhtuy', 'zaostrovye'].map(id => [id,
    authoredPlaces.filter(place => place.recognized_area?.id === id).map(place => place.id)]));
  return {
    schema_version: 'rus.m2c_place_coordinate_derivation.v2',
    status: 'candidate_not_approved', source_candidate: 'candidate.json',
    local_minutes_input: lineNameCandidate ? 'line_names_candidate_unapproved' : 'none',
    geometry_validation: geometryValidation,
    spatial_topology_validation: spatialTopologyValidation,
    place_authoring_summary: {
      total_places: authoredPlaces.length,
      basis_counts: basisCounts,
      historical_basis_counts: historicalBasisCounts,
      recognized_areas: recognizedAreas,
      precision_class_counts: Object.fromEntries([...new Set(authoredPlaces.map(place => place.precision_class))]
        .sort().map(value => [value, authoredPlaces.filter(place => place.precision_class === value).length])),
    },
    line_names_candidate: lineNameCandidate ? {
      candidate_id: lineNameCandidate.candidate_id ?? null, version: lineNameCandidate.version ?? null,
      status: lineNameCandidate.status ?? null, approved: lineNameCandidate.approved ?? null,
    } : null,
    methods: {
      distance: 'WGS84 great-circle straight-line distance; not route length',
      direction: '8 compass sectors from authored game-map points; only zero-length line has no sector; historical uncertainty is separate',
      river_direction: 'projection onto tangent of the assigned typed waterbody skeleton; only candidate crossings are transverse; independent of compass direction',
      shoreline_name: 'line containing берегом must align within 45 degrees and 500 m of shoreline skeleton; pair shore_ref preferred when shared',
      speed: 'LEGACY REVIEW ONLY: straight-line distance / existing minutes; compare with method band using ±20% tolerance. This measures old-source minutes and is not the proposed calibration.',
      route_trace: 'When present, authored WGS84 legs provide segment waterbody/land assignment; reversed graph direction reverses same trace. Compass uses endpoints; river direction is per trace leg; proposed minutes sum unrounded per-leg durations with residual factor 1.05 water / 1.10 land, rounded once.',
      proposed_minutes: 'Without a trace: WGS84 straight-line distance × mode sinuosity factor / calibrated effective speed; rounded to nearest whole minute with a one-minute minimum for positive distances.',
      speed_bands_kmh: speedBandsKmh, speed_tolerance_percent: tolerance * 100,
    },
    travel_calibration: travelCalibrationMetadata,
    summary: {
      g5_connections: lines.length, world_routes: routeLines.length, total_directed_lines: all.length,
      route_trace_count: routeTraceEntries.length,
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
