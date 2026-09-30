import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildReport, deriveConnection, deriveTravel, geometry, routeTraceSpikes, travelCalibration, validateCandidate,
  validateFlowContinuity, validateSpatialTopology } from './derive.mjs';
import { createLandRouter, endpointAccess } from './land-route-search.mjs';

const here = new URL('./', import.meta.url);
const staging = new URL('../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/', here);
const inventoryUrl = new URL('../spatial-v3/source-approval/p12_novgorod_source_approval_001/data/canonical-g5-inventory.json', here);
const lineNamesUrl = new URL('file:///srv/novgorod-work/worktrees/line-names/data/world-catalogs/novgorod/m2c-line-names/candidate.json');
const json = async url => JSON.parse(await readFile(url, 'utf8'));
const compass = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

test('dry A* routes are deterministic and do not cross a bank-to-bank water obstacle', () => {
  const corners = [
    { longitude: 40.6, latitude: 64.58 }, { longitude: 40.62, latitude: 64.58 },
    { longitude: 40.62, latitude: 64.6 }, { longitude: 40.6, latitude: 64.6 },
  ];
  const candidate = { flow_skeletons: [{ id: 'river', width_m: 80,
    points: [[64.58, 40.61], [64.6, 40.61]] }] };
  const router = createLandRouter(candidate, corners, 20);
  const west = { lat: 64.59, lon: 40.604 };
  const east = { lat: 64.59, lon: 40.606 };
  const acrossRiver = { lat: 64.59, lon: 40.616 };
  const first = router.findPath(west, east);
  const repeated = router.findPath(west, east);
  assert.equal(first.found, true);
  assert.deepEqual(first.points, repeated.points);
  assert.equal(router.findPath(west, acrossRiver).found, false);
});
const opposite = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };

async function inputs() {
  return Promise.all([
    json(new URL('candidate.json', here)),
    json(new URL('g3-places.json', staging)),
    json(inventoryUrl),
    json(new URL('g1-dossier.json', staging)),
  ]);
}

async function lineNamesInput() { return json(lineNamesUrl); }

function connectedLandComponents(candidate, corners, cellM = 20) {
  const scale = 111_195;
  const xScale = scale * Math.cos(64.58 * Math.PI / 180);
  const xy = ([lon, lat]) => [lon * xScale, lat * scale];
  const polygon = corners.map(point => xy([point.longitude, point.latitude]));
  const xs = polygon.map(point => point[0]); const ys = polygon.map(point => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.ceil((maxX - minX) / cellM); const height = Math.ceil((maxY - minY) / cellM);
  const count = width * height; const land = new Uint8Array(count); const components = new Int32Array(count);
  components.fill(-1);
  const queue = new Int32Array(count); const halfDiagonal = cellM * Math.SQRT2 / 2;
  const insideCell = (x, y) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const segmentDistance = (point, a, b) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
  };
  const flowSegments = candidate.flow_skeletons.flatMap(flow => flow.points.slice(1).map((point, index) => ({
    radius: flow.width_m / 2 + halfDiagonal,
    a: xy([flow.points[index][1], flow.points[index][0]]), b: xy([point[1], point[0]]),
  })));
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const point = [minX + (column + 0.5) * cellM, minY + (row + 0.5) * cellM];
    if (!insideCell(...point)) continue;
    if (flowSegments.some(segment => segmentDistance(point, segment.a, segment.b) <= segment.radius)) continue;
    land[row * width + column] = 1;
  }
  let component = 0;
  for (let index = 0; index < count; index += 1) {
    if (!land[index] || components[index] >= 0) continue;
    let head = 0; let tail = 0; queue[tail++] = index; components[index] = component;
    while (head < tail) {
      const cell = queue[head++]; const column = cell % width; const row = Math.floor(cell / width);
      for (const next of [column ? cell - 1 : -1, column + 1 < width ? cell + 1 : -1,
        row ? cell - width : -1, row + 1 < height ? cell + width : -1]) {
        if (next >= 0 && land[next] && components[next] < 0) {
          components[next] = component; queue[tail++] = next;
        }
      }
    }
    component += 1;
  }
  const componentAt = place => {
    const [x, y] = xy([place.lon, place.lat]);
    const column = Math.floor((x - minX) / cellM); const row = Math.floor((y - minY) / cellM);
    if (column < 0 || row < 0 || column >= width || row >= height) return -1;
    return components[row * width + column];
  };
  return { componentAt, count: component };
}

test('candidate covers exact G3/G4 and G5 IDs with authored and historical axes', async () => {
  const [candidate, g3, inventory, dossier] = await inputs();
  assert.equal(candidate.status, 'candidate_unapproved');
  assert.equal(candidate.g3_g4_places.length, 32);
  assert.equal(candidate.g5_places.length, 195);
  assert.deepEqual(new Set(candidate.g3_g4_places.map(p => p.g3_id)), new Set(g3.map(p => p.id)));
  assert.deepEqual(new Set(candidate.g5_places.map(p => p.id)), new Set(inventory.records.map(p => p.id)));
  const parents = new Set(candidate.g3_g4_places.map(p => p.id));
  const sourceParents = new Map(inventory.records.map(p => [p.id, p.parent_g4_id]));
  const precisionCounts = { anchored: 0, reconstructed: 0, schematic: 0 };
  for (const place of [...candidate.g3_g4_places, ...candidate.g5_places]) {
    assert.ok(['anchored', 'reconstructed', 'schematic'].includes(place.precision_class), place.id);
    assert.equal(place.basis, place.precision_class, place.id);
    precisionCounts[place.precision_class] += 1;
    assert.ok(Number.isFinite(place.coordinate_precision_m) && place.coordinate_precision_m > 0, place.id);
    if (place.precision_class === 'anchored') assert.ok(place.precision_m <= 500, place.id);
    if (place.precision_class === 'reconstructed') assert.ok(place.precision_m >= 1000 && place.precision_m <= 3000, place.id);
    if (place.precision_class === 'schematic') assert.equal(place.precision_m, null, place.id);
    assert.ok(['anchored_area', 'zone_description', 'schematic'].includes(place.historical_basis), place.id);
    assert.ok(place.historical_uncertainty, place.id);
    assert.ok(place.reasoning && place.evidence.length > 0, place.id);
    assert.ok(place.evidence.every(key => candidate.evidence_sources[key]), place.id);
    if (place.recognized_area) {
      assert.ok(['vikhtuy', 'zaostrovye'].includes(place.recognized_area.id), place.id);
      assert.equal(place.recognized_area.exact_site, false, place.id);
    }
  }
  assert.deepEqual(precisionCounts, { anchored: 0, reconstructed: 46, schematic: 181 });
  for (const place of candidate.g5_places) {
    assert.equal(place.parent_id, sourceParents.get(place.id));
    assert.ok(parents.has(place.parent_id));
  }
  assert.deepEqual(validateCandidate(candidate, dossier.coordinates.technical_bounds.corners_wgs84), {
    g4_sectors: 32, g5_footprints: 195, status: 'valid',
  });
});

test('authored water leaves all 18 dry G4 anchors on connected land', async () => {
  const [candidate, , , dossier] = await inputs();
  const dryAnchors = ['flooded_interior_basin', 'reed_backwater', 'old_channel_pool', 'floodplain_ridge_route',
    'sheltered_landing_terrace', 'vikhtuy_locality', 'vikhtuy_river_approach', 'vikhtuy_resource_edge',
    'zaostrovye_settlement_center', 'zaostrovye_burial_area', 'zaostrovye_landing', 'wet_conifer_tract',
    'dry_pine_ridge', 'tributary_mouth', 'forest_stream_route', 'large_island_head',
    'dry_island_ridge', 'channel_split_islet'];
  const land = connectedLandComponents(candidate, dossier.coordinates.technical_bounds.corners_wgs84);
  const g4 = new Map(candidate.g3_g4_places.map(place => [place.id.split('_r2_').at(-1), place]));
  const componentIds = dryAnchors.map(id => {
    const place = g4.get(id);
    assert.ok(place, `missing dry G4 anchor ${id}`);
    const component = land.componentAt(place);
    assert.ok(component >= 0, `G4 anchor ${id} falls in water or outside cell`);
    return component;
  });
  assert.equal(new Set(componentIds).size, 1, 'dry G4 anchors are split by authored water');
});

test('geometry rejects overlapping G5 footprints, including identical polygons', async () => {
  const [candidate, , , dossier] = await inputs();
  const first = candidate.g5_places[0];
  const sibling = candidate.g5_places.find(p => p.parent_id === first.parent_id && p.id !== first.id);
  const changed = { ...candidate, g5_places: candidate.g5_places.map(p => p.id === sibling.id
    ? { ...p, lat: first.lat, lon: first.lon, footprint: first.footprint } : p) };
  assert.throws(() => validateCandidate(changed, dossier.coordinates.technical_bounds.corners_wgs84), /overlaps/);
  const bankPlace = candidate.g5_places.find(p => p.bank_side === 'left' || p.bank_side === 'right');
  const oppositeBank = { ...candidate, g5_places: candidate.g5_places.map(p => p.id === bankPlace.id
    ? { ...p, bank_side: p.bank_side === 'left' ? 'right' : 'left' } : p) };
  assert.throws(() => validateCandidate(oppositeBank, dossier.coordinates.technical_bounds.corners_wgs84),
    /opposite side|crosses flow|bank_side mismatch/);
});

test('bearing and flow projection reverse; speed flags use authored map distance', () => {
  const west = { id: 'west', lat: 0, lon: 0, precision_m: 10 };
  const east = { id: 'east', lat: 0, lon: 0.001, precision_m: 10 };
  const flowSkeletons = [{ id: 'river', points: [[0, -0.01], [0, 0.01]] }];
  assert.equal(geometry(west, east).direction_candidate, 'E');
  assert.equal(geometry(east, west).direction_candidate, 'W');
  const forward = deriveConnection('test', 'forward', west, east, 5, 'movement.small_river_craft', {
    isWater: true, flowSkeleton: { ...flowSkeletons[0], waterbody_type: 'main', width_m: 100 },
  });
  const reverse = deriveConnection('test', 'reverse', east, west, 5, 'movement.small_river_craft', {
    isWater: true, flowSkeleton: { ...flowSkeletons[0], waterbody_type: 'main', width_m: 100 },
  });
  assert.equal(forward.direction, 'E');
  assert.equal(reverse.direction, 'W');
  assert.equal(forward.river_direction, 'вниз по течению');
  assert.equal(reverse.river_direction, 'вверх по течению');
  assert.equal(forward.speed_status, 'в пределах допуска');
  const tooFast = deriveConnection('test', 'fast', west, { ...east, lon: 0.1 }, 5, 'movement.foot');
  assert.equal(tooFast.speed_status, 'выше диапазона');
  const zero = deriveConnection('test', 'zero', west, west, null, null);
  assert.equal(zero.direction, null);
});

test('route traces derive segment flow and summed travel without adding graph edges', () => {
  const west = { id: 'west', lat: 0, lon: 0, precision_m: 1 };
  const east = { id: 'east', lat: 0, lon: 0.002, precision_m: 1 };
  const trace = {
    key: 'bent-river', from_id: 'west', to_id: 'east',
    points: [west, { lat: 0.001, lon: 0.001 }, east],
    segments: [
      { surface: 'water', waterbody_ref: 'river', crossing: false },
      { surface: 'water', waterbody_ref: 'river', crossing: false },
    ],
  };
  const flowSkeleton = { id: 'river', waterbody_type: 'main_channel', width_m: 1000,
    current_bias_kmh: 0.5, points: [[0, 0], [0.001, 0.001], [0, 0.002]] };
  const forward = deriveConnection('test', 'forward', west, east, 12, 'movement.small_river_craft', {
    isWater: true, movementClass: 'river', routeTrace: trace, flowSkeleton, flowSkeletons: [flowSkeleton],
  });
  const reverse = deriveConnection('test', 'reverse', east, west, 12, 'movement.small_river_craft', {
    isWater: true, movementClass: 'river', routeTrace: trace, flowSkeleton, flowSkeletons: [flowSkeleton],
  });
  assert.equal(forward.route_trace_key, 'bent-river');
  assert.equal(forward.route_trace_segments.length, 2);
  assert.ok(forward.distance_m < forward.distance_route_m);
  assert.equal(forward.river_direction, 'вниз по течению');
  assert.equal(reverse.river_direction, 'вверх по течению');
  assert.ok(forward.proposed_minutes > 0);
  assert.ok(forward.route_trace_segments[0].suggested_route_point);
  assert.equal(forward.route_trace_segments[1].suggested_route_point, false);

  const mixed = deriveConnection('test', 'water-to-shore', west,
    { id: 'shore', lat: 0.001, lon: 0.001, precision_m: 1 }, null, 'movement.small_river_craft', {
      isWater: true, movementClass: 'river', flowSkeleton,
      flowSkeletons: [flowSkeleton],
      routeTrace: { key: 'water-to-shore', from_id: 'west', to_id: 'shore',
        points: [west, east, { lat: 0.001, lon: 0.001 }],
        segments: [
          { surface: 'water', waterbody_ref: 'river', crossing: false },
          { surface: 'land', waterbody_ref: null, crossing: false, movement_method_id: 'movement.foot' },
        ] },
    });
  assert.equal(mixed.route_trace_segments[0].travel_band, 'boat_downstream');
  assert.equal(mixed.route_trace_segments[1].travel_band, 'path');
  assert.equal(mixed.route_trace_segments[1].river_direction, 'не применяется');

  const landOnly = deriveConnection('test', 'implicit-land-method', west, east, 12,
    'movement.small_river_craft', { isWater: false, movementClass: 'river',
      routeTrace: { key: 'implicit-land-method', from_id: 'west', to_id: 'east',
        points: [west, { lat: 0.001, lon: 0.001 }, east],
        segments: [{ surface: 'land' }, { surface: 'land' }] } });
  assert.equal(landOnly.route_trace_segments[0].movement_method_id, 'movement.foot');
  assert.equal(landOnly.route_trace_segments[0].travel_band, 'path');
});

test('dry trace segments inherit line movement class and chord traces use normal mode factors', () => {
  const from = { id: 'from', lat: 64.58, lon: 40.60, precision_m: 1 };
  const to = { id: 'to', lat: 64.58, lon: 40.62, precision_m: 1 };
  const mid = { lat: 64.581, lon: 40.61 };
  const multi = deriveConnection('test', 'dry-forest', from, to, 10, 'movement.foot', {
    movementClass: 'forest_track', isWater: false,
    routeTrace: { key: 'dry-forest', from_id: from.id, to_id: to.id, points: [from, mid, to],
      segments: [{ surface: 'land' }, { surface: 'land' }] },
  });
  assert.deepEqual(multi.route_trace_segments.map(row => row.travel_band), ['forest_track', 'forest_track']);
  assert.deepEqual(multi.route_trace_segments.map(row => row.base_speed_kmh), [2.75, 2.75]);

  const chord = deriveConnection('test', 'straight-trace', from, to, 10, 'movement.foot', {
    movementClass: 'path', isWater: false,
    routeTrace: { key: 'straight-trace', from_id: from.id, to_id: to.id, points: [from, to],
      segments: [{ surface: 'land' }] },
  });
  const untraced = deriveConnection('test', 'straight-no-trace', from, to, 10, 'movement.foot', {
    movementClass: 'path', isWater: false,
  });
  assert.equal(chord.route_trace_fallback, 'single_segment_matches_endpoint_chord');
  assert.equal(chord.proposed_minutes, untraced.proposed_minutes);
  assert.equal(chord.route_distance_km, untraced.route_distance_km);
});

test('river direction skips short cross entry, identifies bank crossing, and explains unassessable cases', () => {
  const flowSkeleton = { id: 'river', waterbody_type: 'main', width_m: 100, current_bias_kmh: 0.2,
    points: [[0, -0.01], [0, 0.01]] };
  const start = { id: 'start', lat: -0.0001, lon: 0, precision_m: 1 };
  const end = { id: 'end', lat: 0.0001, lon: 0.002, precision_m: 1 };
  const entered = deriveConnection('test', 'short-entry', start, end, 10, 'movement.small_river_craft', {
    isWater: true, movementClass: 'river', flowSkeleton, flowSkeletons: [flowSkeleton],
    routeTrace: { key: 'short-entry', from_id: start.id, to_id: end.id,
      points: [start, { lat: 0.0001, lon: 0 }, end],
      segments: [{ surface: 'water', waterbody_ref: 'river', crossing: false },
        { surface: 'water', waterbody_ref: 'river', crossing: false }] },
  });
  assert.equal(entered.river_direction, 'вниз по течению');
  assert.equal(entered.river_direction_segment_index, 1);

  const south = { id: 'south', lat: -0.0005, lon: 0, precision_m: 1 };
  const north = { id: 'north', lat: 0.0005, lon: 0, precision_m: 1 };
  const crossing = deriveConnection('test', 'bank-crossing', south, north, 10, 'movement.small_river_craft', {
    isWater: true, movementClass: 'river', flowSkeleton, crossing: false,
  });
  assert.equal(crossing.river_direction, 'поперёк течения');

  const farA = { id: 'far-a', lat: 0.001, lon: 0.03, precision_m: 1 };
  const farB = { id: 'far-b', lat: 0.002, lon: 0.03, precision_m: 1 };
  const unassessable = deriveConnection('test', 'unassessable', farA, farB, 10, 'movement.small_river_craft', {
    isWater: true, movementClass: 'river', flowSkeleton,
  });
  assert.equal(unassessable.river_direction, 'неоценимо');
  assert.match(unassessable.river_direction_reason, /берегов|поперечн/);
});

test('flow continuity requires connected endpoints and downstream cell directions', () => {
  const cellCorners = [
    { name: 'southwest', longitude: 40.3, latitude: 64.5 },
    { name: 'southeast', longitude: 40.7, latitude: 64.5 },
    { name: 'northeast', longitude: 40.7, latitude: 64.7 },
    { name: 'northwest', longitude: 40.3, latitude: 64.7 },
  ];
  const candidate = { flow_skeletons: [
    { id: 'main', width_m: 100, current_bias_kmh: 1, points: [[64.5, 40.5], [64.7, 40.4]] },
    { id: 'west', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.3]] },
    { id: 'east', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.7]] },
  ] };
  assert.equal(validateFlowContinuity(candidate, cellCorners).status, 'valid');
  const isolated = { ...candidate, flow_skeletons: [...candidate.flow_skeletons,
    { id: 'isolated', width_m: 50, current_bias_kmh: 0.2, points: [[64.6, 40.55], [64.61, 40.56]] }] };
  assert.ok(validateFlowContinuity(isolated, cellCorners).isolated_endpoint_count > 0);
  const reversedMain = { ...candidate, flow_skeletons: candidate.flow_skeletons.map(item => item.id === 'main'
    ? { ...item, points: [...item.points].reverse() } : item) };
  assert.ok(validateFlowContinuity(reversedMain, cellCorners).issues.some(issue => /main must enter/.test(issue)));
});

test('dry corridor intrusion permits only assigned water-end access within half-width plus 50m', () => {
  const skeleton = { id: 'river', waterbody_type: 'main', width_m: 100, current_bias_kmh: 0,
    points: [[64.58, 40.6], [64.58, 40.62]] };
  const water = { id: 'water', lat: 64.58036, lon: 40.605, waterbody_ref: 'river' };
  const nearbyDry = { id: 'near-dry', lat: 64.58036, lon: 40.606 };
  const line = (to, id) => ({ id, kind: 'test', from_id: water.id, to_id: to.id,
    is_water: false, waterbody_ref: null, waterbody_crossing: null, movement_method_id: 'movement.shore_transfer' });
  const candidate = { flow_skeletons: [skeleton], g5_places: [water, nearbyDry], g3_g4_places: [],
    line_waterbody_bindings: [] };
  const allowed = validateSpatialTopology(candidate, [line(nearbyDry, 'near')]);
  assert.equal(allowed.nonwater_corridor_intrusion_count, 0);

  const deepDry = { ...nearbyDry, id: 'deep-dry', lon: 40.6075 };
  const blocked = validateSpatialTopology({ ...candidate, g5_places: [water, deepDry] }, [line(deepDry, 'deep')]);
  assert.equal(blocked.nonwater_corridor_intrusion_count, 1);
  assert.equal(blocked.status, 'invalid');
});

test('land trace may touch its assigned river axis only at a short water endpoint', () => {
  const skeleton = { id: 'river', waterbody_type: 'main', width_m: 20, current_bias_kmh: 0,
    points: [[64.58, 40.6], [64.58, 40.62]] };
  const water = { id: 'water', lat: 64.58, lon: 40.61, waterbody_ref: 'river' };
  const shore = { id: 'shore', lat: 64.58036, lon: 40.61 };
  const line = { id: 'water-access', from_id: water.id, to_id: shore.id, is_water: false,
    waterbody_ref: null, waterbody_crossing: null, movement_method_id: 'movement.shore_transfer',
    route_trace_key: 'water-access', route_trace_segments: [{ from: water, to: shore, surface: 'land' }] };
  const candidate = { flow_skeletons: [skeleton], g5_places: [water, shore], g3_g4_places: [], line_waterbody_bindings: [] };
  const allowed = validateSpatialTopology(candidate, [line]);
  assert.equal(allowed.nonwater_flow_intersections, 0);
  assert.equal(allowed.nonwater_corridor_intrusion_count, 0);

  const deepShore = { ...shore, id: 'deep-shore', lat: 64.58108 };
  const tooLong = { ...line, to_id: deepShore.id,
    route_trace_segments: [{ from: water, to: deepShore, surface: 'land' }] };
  const blocked = validateSpatialTopology({ ...candidate, g5_places: [water, deepShore] }, [tooLong]);
  assert.equal(blocked.nonwater_flow_intersections, 1);
});

test('every route trace needs geometry_status', () => {
  const result = validateSpatialTopology({ route_traces: [{ key: 'missing-status' }] }, []);
  assert.equal(result.missing_trace_geometry_status, 1);
  assert.equal(result.status, 'invalid');
});

test('all 540 directed lines have compass direction; water/land and reverse links are consistent', async () => {
  const [candidate] = await inputs();
  const report = await buildReport(candidate, undefined, await lineNamesInput());
  assert.equal(report.summary.g5_connections, 454);
  assert.equal(report.summary.world_routes, 86);
  assert.equal(report.lines.length, 540);
  assert.equal(new Set(report.lines.map(line => line.id)).size, 540);
  assert.ok(report.lines.every(line => compass.has(line.direction)), 'nonzero line without compass direction');
  const rows = new Map(report.lines.map(line => [line.id, line]));
  for (const line of report.lines) {
    if (line.kind === 'world_route') {
      assert.ok(line.base_minutes > 0);
      if (line.movement_method_id === 'movement.small_river_craft') {
        assert.notEqual(line.river_direction, 'не применяется');
      } else assert.equal(line.river_direction, 'не применяется');
    } else {
      assert.ok(line.base_minutes > 0);
      assert.equal(line.minutes_source, 'line_names_candidate_unapproved');
    }
    const reverse = report.lines.find(row => row.kind === line.kind
      && row.from_id === line.to_id && row.to_id === line.from_id);
    if (reverse) {
      assert.equal(reverse.direction, opposite[line.direction], line.id);
      const oppositeRiver = { 'вверх по течению': 'вниз по течению',
        'вниз по течению': 'вверх по течению', 'поперёк течения': 'поперёк течения',
        'без течения': 'без течения', 'не применяется': 'не применяется', 'неоценимо': 'неоценимо' };
      if (line.route_trace_segments && reverse.route_trace_segments) {
        assert.equal(reverse.river_direction,
          reverse.route_trace_segments.find(segment => segment.index === reverse.river_direction_segment_index)?.river_direction,
          line.id);
        assert.equal(reverse.route_trace_segments.length, line.route_trace_segments.length, line.id);
        for (let index = 0; index < line.route_trace_segments.length; index += 1) {
          const forwardLeg = line.route_trace_segments[index];
          const reverseLeg = reverse.route_trace_segments.at(-1 - index);
          assert.equal(reverseLeg.river_direction, oppositeRiver[forwardLeg.river_direction], `${line.id}:${index}`);
          assert.equal(reverseLeg.waterbody_ref, forwardLeg.waterbody_ref, `${line.id}:${index}`);
        }
      } else assert.equal(reverse.river_direction, oppositeRiver[line.river_direction], line.id);
    }
  }
  assert.equal(rows.size, 540);
});

test('topology validates every authored water route and land trace', async () => {
  const [candidate, , , dossier] = await inputs();
  const report = await buildReport(candidate, undefined, await lineNamesInput());
  assert.equal(report.lines.length, 540);

  const topology = validateSpatialTopology(candidate, report.lines, dossier.coordinates.technical_bounds.corners_wgs84);
  assert.equal(topology.status, 'valid');
  assert.equal(topology.topology_exception_count, 0);
  assert.equal(topology.exception_line_count, 0);
  assert.equal(topology.invalid_topology_exceptions, 0);
  assert.equal(topology.route_trace_spikes, 0);
  assert.deepEqual(topology.issues, []);
  assert.equal(topology.water_line_corridor_violations, 0);
  assert.equal(topology.missing_route_traces, 0);
  for (const key of [
    'nonwater_flow_intersections',
    'water_lines_missing_assignment',
    'nonwater_lines_with_assignment',
    'invalid_waterbody_assignments',
    'crossing_flag_direction_mismatches',
    'dry_g5_in_water_corridor',
    'water_g5_outside_own_corridor',
    'invalid_g5_waterbody_assignment',
    'dry_g4_in_water_corridor',
    'water_g4_outside_own_corridor',
    'invalid_g4_waterbody_assignment',
    'missing_trace_geometry_status',
    'flow_continuity_failures',
    'nonwater_corridor_intrusion_count',
  ]) assert.equal(topology[key], 0, `${key}: ${topology[key]}`);
  assert.equal(topology.flow_continuity.status, 'valid');

  const waterLines = report.lines.filter(line => line.is_water);
  const landLines = report.lines.filter(line => !line.is_water);
  const landLineById = new Map(landLines.map(line => [line.id, line]));
  for (const exception of candidate.topology_exceptions) {
    assert.equal(exception.reason, 'ends on different banks', exception.route_key);
    assert.ok(candidate.flow_skeletons.some(flow => flow.id === exception.waterbody_ref), exception.route_key);
    assert.ok(Number.isFinite(exception.intersection_point?.lat) && Number.isFinite(exception.intersection_point?.lon), exception.route_key);
    assert.ok(exception.line_ids.length > 0 && exception.line_ids.every(id => landLineById.has(id)
      && !landLineById.get(id).route_trace_key), exception.route_key);
    assert.deepEqual(exception.required_crossing_kind, ['ford', 'footbridge', 'ferry']);
  }
  const skeletonById = new Map(candidate.flow_skeletons.map(skeleton => [skeleton.id, skeleton]));
  assert.ok(waterLines.length > 0);
  assert.ok(landLines.length > 0);
  assert.ok(waterLines.every(line => typeof line.waterbody_ref === 'string'), 'water line lacks assigned water body');
  assert.ok(waterLines.every(line => line.flow_skeleton_id
    && skeletonById.has(line.flow_skeleton_id)), 'flow direction uses an unknown skeleton');
  assert.ok(waterLines.filter(line => line.route_trace_key).every(line => line.route_trace_segments?.length
    && line.route_trace_segments.every(segment => segment.surface === 'water' && skeletonById.has(segment.waterbody_ref))),
  'authored water trace has an unbound segment');
  assert.deepEqual(waterLines.filter(line => !line.route_trace_key).map(line => line.id.match(/cross_g4_\d+/)?.[0])
    .filter((id, index, all) => id && all.indexOf(id) === index).sort(), []);
  assert.ok(waterLines.every(line => line.river_direction_basis.includes(line.flow_skeleton_id)),
    'river direction basis does not name the first segment skeleton');
  assert.ok(waterLines.filter(line => line.river_direction === 'неоценимо')
    .every(line => line.river_direction_reason), 'unassessable water direction lacks a reason');
  const traceRows = Array.isArray(candidate.route_traces) ? candidate.route_traces : Object.values(candidate.route_traces);
  assert.ok(traceRows.every(trace => typeof trace.geometry_status === 'string' && trace.geometry_status.trim()),
    'route trace lacks geometry_status');
  assert.ok(landLines.every(line => line.waterbody_ref == null), 'land line has water-body assignment');

  for (const line of waterLines.filter(line => line.route_trace_key)) {
    const firstSegment = line.route_trace_segments[0];
    assert.equal(Boolean(line.waterbody_crossing), Boolean(firstSegment.crossing), line.id);
    if (['old_channel_pool', 'reed_backwater'].includes(skeletonById.get(firstSegment.waterbody_ref)?.waterbody_type)) {
      assert.equal(line.river_direction, 'без течения', line.id);
      assert.equal(firstSegment.effective_speed_kmh, 4, line.id);
      assert.equal(firstSegment.travel_band, 'boat_still_water', line.id);
    }
  }
  for (const type of ['old_channel_pool', 'reed_backwater']) {
    assert.ok(waterLines.some(line => skeletonById.get(line.waterbody_ref)?.waterbody_type === type),
      `no directed line uses ${type}`);
  }
});

test('travel calibration derives rounded proposals, with asymmetric boat current and open water', () => {
  const calibration = {
    schema_version: 'test',
    source_policy: 'test fixture',
    current: { value_kmh: 1, status: 'test calibration', evidence: ['fixture'] },
    modes: {
      path: { speed_kmh: 4, sinuosity_factor: 1.5 },
      forest: { speed_kmh: 3, sinuosity_factor: 1.4 },
      bog: { speed_kmh: 2, sinuosity_factor: 1.3 },
      shore: { speed_kmh: 2, sinuosity_factor: 1.2 },
      boat_downstream: { still_water_speed_kmh: 4, sinuosity_factor: 1 },
      boat_upstream: { still_water_speed_kmh: 4, sinuosity_factor: 1 },
      boat_across: { speed_kmh: 4, sinuosity_factor: 1 },
      boat_open_water: { speed_kmh: 7, sinuosity_factor: 1.1 },
    },
  };
  const foot = deriveTravel(1000, 'movement.foot', 'path', 'не применяется', calibration);
  assert.equal(foot.route_distance_km, 1.5);
  assert.equal(foot.effective_speed_kmh, 4);
  assert.equal(foot.proposed_minutes, 23, '22.5 min rounds to 23');
  assert.equal(foot.calculation_status, 'расчётная редакционная калибровка');

  const downstream = deriveTravel(1000, 'movement.small_river_craft', 'river', 'вниз по течению', calibration);
  const upstream = deriveTravel(1000, 'movement.small_river_craft', 'river', 'вверх по течению', calibration);
  const openWater = deriveTravel(1000, 'movement.small_river_craft', 'open_water', 'вниз по течению', calibration);
  assert.equal(downstream.travel_band, 'boat_downstream');
  assert.equal(downstream.current_bias_kmh, 1);
  assert.equal(downstream.effective_speed_kmh, 5);
  assert.equal(downstream.proposed_minutes, 12);
  assert.equal(upstream.travel_band, 'boat_upstream');
  assert.equal(upstream.current_bias_kmh, -1);
  assert.equal(upstream.effective_speed_kmh, 3);
  assert.equal(upstream.proposed_minutes, 20);
  assert.equal(openWater.travel_band, 'boat_open_water');
  assert.equal(openWater.current_bias_kmh, 0);
  assert.equal(openWater.effective_speed_kmh, 7);
  assert.equal(openWater.proposed_minutes, 9);

  const long = deriveTravel(10000, 'movement.foot', 'path', 'не применяется', calibration);
  assert.ok(long.proposed_minutes > 30);
});

test('REVIEW-place-geo-2: forest, wetland, offroad, and still-water modes use their own calibration', () => {
  const forestTrack = deriveTravel(1000, 'movement.foot', 'forest_track', 'не применяется', travelCalibration);
  assert.equal(forestTrack.travel_band, 'forest_track');
  assert.equal(forestTrack.base_speed_kmh, 2.75);
  assert.equal(forestTrack.sinuosity_factor, 1.3);

  const wetlandPath = deriveTravel(1000, 'movement.foot', 'wetland_path', 'не применяется', travelCalibration);
  assert.equal(wetlandPath.travel_band, 'wetland_path');
  assert.equal(wetlandPath.base_speed_kmh, 1.5);
  assert.equal(wetlandPath.sinuosity_factor, 1.3);

  const offroad = deriveTravel(1000, 'movement.foot', 'offroad', 'не применяется', travelCalibration);
  assert.equal(offroad.travel_band, 'offroad');
  assert.equal(offroad.base_speed_kmh, 3);
  assert.equal(offroad.sinuosity_factor, 1, 'direct movement has no detour multiplier');

  for (const waterbodyType of ['old_channel_pool', 'reed_backwater']) {
    const stillWater = deriveTravel(1000, 'movement.small_river_craft', 'river', 'без течения', travelCalibration,
      { waterbodyType, currentBiasKmh: 0 });
    assert.equal(stillWater.travel_band, 'boat_still_water', waterbodyType);
    assert.equal(stillWater.current_bias_kmh, 0, waterbodyType);
    assert.equal(stillWater.effective_speed_kmh, 4, waterbodyType);
  }
});

test('all 540 report rows include old-to-proposed minutes, deltas, long flags, and calibration metadata', async () => {
  const [candidate] = await inputs();
  const report = await buildReport(candidate, undefined, await lineNamesInput());
  const calibration = await json(new URL('travel-calibration.json', here));
  assert.deepEqual(report.travel_calibration, calibration);
  assert.equal(report.lines.length, 540);
  assert.equal(report.lines.filter(row => row.kind === 'g5_connection').length, 454);
  assert.equal(report.lines.filter(row => row.kind === 'world_route').length, 86);
  for (const row of report.lines) {
    assert.ok(Number.isFinite(row.base_minutes) && row.base_minutes > 0, row.id);
    assert.ok(Number.isInteger(row.proposed_minutes) && row.proposed_minutes >= 1, row.id);
    assert.equal(row.minutes_delta, row.proposed_minutes - row.base_minutes, row.id);
    assert.equal(row.minutes_change_flag_over_30, Math.abs(row.minutes_delta) > 30, row.id);
    assert.ok(Number.isFinite(row.distance_route_m) && row.distance_route_m >= row.distance_m, row.id);
    if (row.route_trace_segments) {
      assert.ok(row.route_trace_segments.length > 0, row.id);
      assert.ok(row.route_trace_segments.every(segment => Number.isFinite(segment.sinuosity_factor)
        && segment.sinuosity_factor >= 1), row.id);
      assert.equal(row.sinuosity_factor, null, row.id);
    } else assert.ok(Number.isFinite(row.sinuosity_factor) && row.sinuosity_factor >= 1, row.id);
    assert.ok(Math.abs(row.route_distance_km - row.distance_route_m / 1000) <= 0.0051, row.id);
  }
  assert.ok(report.lines.some(row => row.proposed_over_30_minutes === true), 'expected long transitions');
  assert.equal(report.summary.total_directed_lines, 540);
  assert.equal(report.summary.long_transition_count, report.lines.filter(row => row.proposed_over_30_minutes).length);
  assert.equal(report.long_transitions.length, report.summary.long_transition_count);
  assert.ok(report.summary.proposed_minutes_extremes.shortest[0].proposed_minutes >= 1);
  assert.ok(report.summary.proposed_minutes_extremes.longest[0].proposed_minutes > 30);
});

test('line-names input supplies local river minutes and reports contrary current name', async () => {
  const [candidate] = await inputs();
  const candidateNames = await lineNamesInput();
  const waterPair = candidateNames.local_pairs.find(pair => pair.travel_method === 'boat'
    && candidate.line_waterbody_bindings?.some(binding => binding.source_pair_id === pair.source_pair_id));
  assert.ok(waterPair, 'no local water pair has an assigned water body');
  const pairId = waterPair.source_pair_id;
  const neutral = { local_pairs: [{ ...waterPair, base_minutes: 5 }] };
  const report = await buildReport(candidate, undefined, neutral);
  const lines = report.lines.filter(line => line.source_pair_id === pairId);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => line.movement_method_id === 'movement.small_river_craft'
    && line.base_minutes === 5 && line.minutes_source === 'line_names_candidate_unapproved'));
  assert.ok(lines.every(line => line.river_direction !== 'не применяется'));
  const contrary = lines[0].river_direction === 'вверх по течению' ? 'вниз по течению' : 'вверх по течению';
  const named = await buildReport(candidate, undefined, {
    local_pairs: [{ ...waterPair, base_minutes: 5, name_ru: 'речной ход',
      qualifier: lines[0].from_id === waterPair.from_g5_id
        ? { from_to: contrary, to_from: null } : { from_to: null, to_from: contrary } }],
  });
  assert.ok(named.name_mismatches.some(item => item.id === lines[0].id && item.type === 'flow_name_conflict'));
});

const boxCorners = [
  { longitude: 40.6, latitude: 64.58 }, { longitude: 40.62, latitude: 64.58 },
  { longitude: 40.62, latitude: 64.6 }, { longitude: 40.6, latitude: 64.6 },
];

test('PLAN-8: one end-access rule — largest half-width + 50 m of every corridor containing a water end; a dry end has none', () => {
  const skeletons = [
    { id: 'wide', width_m: 400, points: [[64.59, 40.6], [64.59, 40.62]] },
    { id: 'narrow', width_m: 60, points: [[64.5905, 40.61], [64.6, 40.61]] },
    { id: 'far', width_m: 60, points: [[64.581, 40.6], [64.581, 40.62]] },
  ];
  const inBoth = { lat: 64.5906, lon: 40.61, waterbody_ref: 'narrow' };
  const access = endpointAccess(inBoth, skeletons);
  assert.deepEqual([...access.flowIds].sort(), ['narrow', 'wide']);
  assert.equal(access.maxDistanceM, 250, 'wide: 200 + 50 beats narrow: 30 + 50');
  assert.equal(endpointAccess({ lat: 64.5906, lon: 40.61 }, skeletons, 28).maxDistanceM, 28);
  assert.equal(endpointAccess({ lat: 64.5906, lon: 40.61 }, skeletons, 28).flowIds.size, 0);

  const router = createLandRouter({ flow_skeletons: skeletons }, boxCorners, 20);
  const dry = { lat: 64.5965, lon: 40.605 };
  assert.equal(router.findPath(inBoth, dry).found, true, 'an end inside a foreign corridor is not discarded');
  const behindFar = { lat: 64.5806, lon: 40.61, waterbody_ref: 'far' };
  const blocked = router.findPath({ lat: 64.5906, lon: 40.61, waterbody_ref: 'wide' }, behindFar);
  assert.equal(blocked.found, false);
});

test('PLAN-8: a topology exception needs disjoint dry-mask components of both ends; other failed searches are blockers', () => {
  const skeleton = { id: 'river', waterbody_type: 'main_channel', width_m: 100, current_bias_kmh: 1,
    points: [[64.58, 40.61], [64.6, 40.61]] };
  const router = createLandRouter({ flow_skeletons: [skeleton] }, boxCorners, 20);
  const west = { lat: 64.59, lon: 40.604 };
  const east = { lat: 64.59, lon: 40.616 };
  const split = router.findPath(west, east);
  assert.equal(split.found, false);
  assert.equal(split.failure_kind, 'different_components');
  assert.equal(split.barrier.waterbody_ref, 'river');
  assert.equal(split.start_components.length > 0 && split.end_components.length > 0, true);
  assert.equal(split.start_components.some(id => split.end_components.includes(id)), false);
  const insideWater = router.findPath({ lat: 64.59, lon: 40.61 }, west);
  assert.equal(insideWater.found, false);
  assert.equal(insideWater.failure_kind, 'blocker', 'a dry end inside the corridor is a blocker, not a bank split');

  const places = [{ id: 'a', lat: 64.59, lon: 40.604 }, { id: 'b', lat: 64.59, lon: 40.616 }];
  const line = { id: 'ab', kind: 'test', from_id: 'a', to_id: 'b', is_water: false, waterbody_ref: null,
    waterbody_crossing: null, movement_method_id: 'movement.foot' };
  const exception = components => ({ route_key: 'ab', line_ids: ['ab'], waterbody_ref: 'river', reason: 'ends on different banks',
    intersection_point: { lat: 64.59, lon: 40.61 }, required_crossing_kind: ['ford', 'footbridge', 'ferry'],
    endpoint_components: components });
  const check = components => validateSpatialTopology({ flow_skeletons: [skeleton], g5_places: places, g3_g4_places: [],
    line_waterbody_bindings: [], topology_exceptions: [exception(components)] }, [line]);
  assert.equal(check({ start: [1], end: [2] }).invalid_topology_exceptions, 0);
  for (const bad of [undefined, { start: [], end: [2] }, { start: [1], end: [] }, { start: [1, 2], end: [2] }]) {
    assert.equal(check(bad).invalid_topology_exceptions, 1, JSON.stringify(bad));
  }
});

test('PLAN-8: a flowing arm must drain to the cell boundary or sea; a dead end needs current 0', () => {
  const cellCorners = [
    { name: 'southwest', longitude: 40.3, latitude: 64.5 }, { name: 'southeast', longitude: 40.7, latitude: 64.5 },
    { name: 'northeast', longitude: 40.7, latitude: 64.7 }, { name: 'northwest', longitude: 40.3, latitude: 64.7 },
  ];
  const network = [
    { id: 'main', width_m: 100, current_bias_kmh: 1, points: [[64.5, 40.5], [64.7, 40.4]] },
    { id: 'west', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.3]] },
    { id: 'east', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.7]] },
  ];
  // a pair of arms that only close on each other (the central_head_branch / large_island_channels shape)
  const arm = current => [
    { id: 'arm_a', width_m: 100, current_bias_kmh: current, points: [[64.6, 40.45], [64.57, 40.5]] },
    { id: 'arm_b', width_m: 60, current_bias_kmh: current, points: [[64.585, 40.475], [64.57, 40.5]] },
  ];
  const withCurrent = validateFlowContinuity({ flow_skeletons: [...network, ...arm(0.8)] }, cellCorners);
  assert.equal(withCurrent.status, 'invalid');
  assert.ok(withCurrent.issues.some(issue => /arm_a flows nowhere/.test(issue)));
  assert.ok(withCurrent.issues.some(issue => /arm_b flows nowhere/.test(issue)));
  assert.equal(validateFlowContinuity({ flow_skeletons: [...network, ...arm(0)] }, cellCorners).status, 'valid');
  const drains = [...network, { id: 'arm_a', width_m: 100, current_bias_kmh: 0.8, points: [[64.6, 40.45], [64.55, 40.45]] },
    { id: 'arm_c', width_m: 60, current_bias_kmh: 0.8, points: [[64.55, 40.45], [64.5, 40.5]] }];
  assert.equal(validateFlowContinuity({ flow_skeletons: drains }, cellCorners).status, 'valid', 'chain reaching the boundary is an exit');
});

test('PLAN-8: a trace that runs out and turns back on one water body is a blocking spike', () => {
  const trace = (...lats) => ({ key: 't', points: lats.map(lat => ({ lat, lon: 40.6 })),
    segments: lats.slice(1).map(() => ({ surface: 'water', waterbody_ref: 'main' })) });
  assert.equal(routeTraceSpikes(trace(64.5, 64.51, 64.52)).length, 0);
  const spiked = routeTraceSpikes(trace(64.5, 64.51, 64.5));
  assert.equal(spiked.length, 1);
  assert.equal(spiked[0].point_index, 1);
  const otherBody = trace(64.5, 64.51, 64.5); otherBody.segments[1].waterbody_ref = 'west';
  assert.equal(routeTraceSpikes(otherBody).length, 0, 'a turn from one body into another is not a spike');
  const shortTurn = { key: 't', points: [{ lat: 64.5, lon: 40.6 }, { lat: 64.5005, lon: 40.6 }, { lat: 64.5, lon: 40.6 }],
    segments: [{ surface: 'water', waterbody_ref: 'main' }, { surface: 'water', waterbody_ref: 'main' }] };
  assert.equal(routeTraceSpikes(shortTurn).length, 0, 'legs of 100 m or less are not spikes');

  const skeleton = { id: 'main', waterbody_type: 'main_channel', width_m: 500, current_bias_kmh: 1,
    points: [[64.5, 40.6], [64.6, 40.6]] };
  const a = { id: 'a', lat: 64.51, lon: 40.6, waterbody_ref: 'main' };
  const b = { id: 'b', lat: 64.52, lon: 40.6, waterbody_ref: 'main' };
  const line = { id: 'ab', kind: 'test', from_id: 'a', to_id: 'b', is_water: true, waterbody_ref: 'main', waterbody_crossing: false,
    flow_skeleton_id: 'main', movement_method_id: 'movement.small_river_craft', route_trace_key: 'ab',
    route_trace_segments: [{ from: a, to: b, surface: 'water', waterbody_ref: 'main', crossing: false }] };
  const candidate = spikedTrace => ({ flow_skeletons: [skeleton], g5_places: [a, b], g3_g4_places: [], line_waterbody_bindings: [],
    route_traces: { ab: { key: 'ab', geometry_status: 'test', ...spikedTrace } } });
  const points = [{ lat: 64.51, lon: 40.6 }, { lat: 64.53, lon: 40.6 }, { lat: 64.52, lon: 40.6 }];
  const result = validateSpatialTopology(candidate({ points, segments: [{ surface: 'water', waterbody_ref: 'main' }, { surface: 'water', waterbody_ref: 'main' }] }), [line]);
  assert.equal(result.route_trace_spikes, 1);
  assert.equal(result.status, 'invalid');
});

test('PLAN-8: the candidate has no exceptions, dead-end arms have current 0, and every trace is spike-free', async () => {
  const [candidate] = await inputs();
  assert.deepEqual(candidate.topology_exceptions, []);
  const flowById = new Map(candidate.flow_skeletons.map(flow => [flow.id, flow]));
  for (const id of ['central_head_branch', 'large_island_channels']) assert.equal(flowById.get(id).current_bias_kmh, 0, id);
  for (const [key, trace] of Object.entries(candidate.route_traces)) assert.deepEqual(routeTraceSpikes(trace, key), [], key);
  const report = await buildReport(candidate, undefined, await lineNamesInput());
  assert.equal(report.summary.river_directions['неоценимо'] ?? 0, 0);
  assert.equal(report.summary.name_mismatch_count, 0);
  for (const row of report.lines.filter(line => line.shore_to_water_link)) assert.ok(row.distance_m <= 150, row.id);
});

test('PLAN-8: shoreline skeletons sit at the corridor edge of their flow axis (offset = half-width)', async () => {
  const [candidate] = await inputs();
  const scale = { x: 111195 * Math.cos(64.58 * Math.PI / 180), y: 111195 };
  const xy = ([lat, lon]) => [lon * scale.x, lat * scale.y];
  const distance = (p, a, b) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const flowById = new Map(candidate.flow_skeletons.map(flow => [flow.id, flow]));
  const rebuilt = candidate.shoreline_skeletons.filter(shore => shore.flow_ref);
  assert.equal(rebuilt.length, 30);
  for (const shore of rebuilt) {
    const flow = flowById.get(shore.flow_ref); const half = flow.width_m / 2;
    assert.equal(shore.offset_from_flow_skeleton_m, half, shore.id);
    const axis = flow.points.map(xy);
    for (const point of shore.points.map(xy)) {
      const nearest = Math.min(...axis.slice(1).map((end, index) => distance(point, axis[index], end)));
      assert.ok(nearest >= half - 1 && nearest <= half * 2 + 1, `${shore.id}: ${Math.round(nearest)} m from axis, half-width ${half}`);
    }
  }
});

test('A-place-geo-09: a still pool is not a sink for flowing water; a mouth into it has current 0', async () => {
  const cellCorners = [
    { name: 'southwest', longitude: 40.3, latitude: 64.5 }, { name: 'southeast', longitude: 40.7, latitude: 64.5 },
    { name: 'northeast', longitude: 40.7, latitude: 64.7 }, { name: 'northwest', longitude: 40.3, latitude: 64.7 },
  ];
  const network = [
    { id: 'main', width_m: 100, current_bias_kmh: 1, points: [[64.5, 40.5], [64.7, 40.4]] },
    { id: 'west', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.3]] },
    { id: 'east', width_m: 100, current_bias_kmh: 1, points: [[64.6, 40.45], [64.65, 40.7]] },
    { id: 'pool', waterbody_type: 'reed_backwater', width_m: 100, current_bias_kmh: 0, points: [[64.56, 40.42], [64.55, 40.4]] },
  ];
  const mouth = current => ({ id: 'mouth', waterbody_type: 'backwater_mouth', width_m: 80, current_bias_kmh: current,
    points: [[64.6, 40.45], [64.56, 40.42]] });
  const flowing = validateFlowContinuity({ flow_skeletons: [...network, mouth(0.25)] }, cellCorners);
  assert.equal(flowing.status, 'invalid');
  assert.ok(flowing.issues.some(issue => /mouth flows nowhere/.test(issue)));
  assert.equal(validateFlowContinuity({ flow_skeletons: [...network, mouth(0)] }, cellCorners).status, 'valid');
  const [candidate] = await inputs();
  assert.equal(candidate.flow_skeletons.find(flow => flow.id === 'backwater_mouth').current_bias_kmh, 0);
});
