import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildReport, deriveConnection, deriveTravel, geometry, travelCalibration, validateCandidate } from './derive.mjs';

const here = new URL('./', import.meta.url);
const staging = new URL('../staging/cells/gn_nov_g1_xp017_yp026/content_revision_002/', here);
const inventoryUrl = new URL('../spatial-v3/source-approval/p12_novgorod_source_approval_001/data/canonical-g5-inventory.json', here);
const json = async url => JSON.parse(await readFile(url, 'utf8'));
const compass = new Set(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
const opposite = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };

async function inputs() {
  return Promise.all([
    json(new URL('candidate.json', here)),
    json(new URL('g3-places.json', staging)),
    json(inventoryUrl),
    json(new URL('g1-dossier.json', staging)),
  ]);
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
  for (const place of [...candidate.g3_g4_places, ...candidate.g5_places]) {
    assert.equal(place.precision_class, 'authored_reconstruction', place.id);
    assert.ok(Number.isFinite(place.precision_m) && place.precision_m > 0, place.id);
    assert.ok(['anchored_area', 'zone_description', 'schematic'].includes(place.historical_basis), place.id);
    assert.ok(place.historical_uncertainty, place.id);
    assert.ok(place.reasoning && place.evidence.length > 0, place.id);
    assert.ok(place.evidence.every(key => candidate.evidence_sources[key]), place.id);
    if (place.recognized_area) {
      assert.ok(['vikhtuy', 'zaostrovye'].includes(place.recognized_area.id), place.id);
      assert.equal(place.recognized_area.exact_site, false, place.id);
    }
  }
  for (const place of candidate.g5_places) {
    assert.equal(place.parent_id, sourceParents.get(place.id));
    assert.ok(parents.has(place.parent_id));
  }
  assert.deepEqual(validateCandidate(candidate, dossier.coordinates.technical_bounds.corners_wgs84), {
    g4_sectors: 32, g5_footprints: 195, status: 'valid',
  });
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
    isWater: true, flowSkeletons,
  });
  const reverse = deriveConnection('test', 'reverse', east, west, 5, 'movement.small_river_craft', {
    isWater: true, flowSkeletons,
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

test('all 540 directed lines have compass direction; water/land and reverse links are consistent', async () => {
  const [candidate] = await inputs();
  const report = await buildReport(candidate);
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
      assert.equal(line.base_minutes, null);
      assert.equal(line.minutes_source, 'active_profile_no_minutes');
    }
    const reverse = report.lines.find(row => row.kind === line.kind
      && row.from_id === line.to_id && row.to_id === line.from_id);
    if (reverse) {
      assert.equal(reverse.direction, opposite[line.direction], line.id);
      const oppositeRiver = { 'вверх по течению': 'вниз по течению',
        'вниз по течению': 'вверх по течению', 'поперёк течения': 'поперёк течения',
        'не применяется': 'не применяется' };
      assert.equal(reverse.river_direction, oppositeRiver[line.river_direction], line.id);
    }
  }
  assert.equal(rows.size, 540);
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

test('all 540 report rows include old-to-proposed minutes, deltas, long flags, and calibration metadata', async () => {
  const [candidate] = await inputs();
  const bindings = await json(new URL('../spatial-v3/datasets/spatial_v3_canonical_g5_connection_bindings.json', here));
  const localPairs = [...new Set(bindings.map(binding => binding.source_pair_id))].map(source_pair_id => ({
    source_pair_id, line_kind: 'path', travel_method: 'foot', base_minutes: 5,
  }));
  const report = await buildReport(candidate, undefined, { local_pairs: localPairs });
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
    assert.ok(Number.isFinite(row.sinuosity_factor) && row.sinuosity_factor >= 1, row.id);
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
  const bindings = await json(new URL('../spatial-v3/datasets/spatial_v3_canonical_g5_connection_bindings.json', here));
  const pairId = bindings[0].source_pair_id;
  const neutral = { local_pairs: [{ source_pair_id: pairId, line_kind: 'river', base_minutes: 5 }] };
  const report = await buildReport(candidate, undefined, neutral);
  const lines = report.lines.filter(line => line.source_pair_id === pairId);
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => line.movement_method_id === 'movement.small_river_craft'
    && line.base_minutes === 5 && line.minutes_source === 'line_names_candidate_unapproved'));
  assert.ok(lines.every(line => line.river_direction !== 'не применяется'));
  const contrary = lines[0].river_direction === 'вверх по течению' ? 'вниз по течению' : 'вверх по течению';
  const named = await buildReport(candidate, undefined, {
    local_pairs: [{ source_pair_id: pairId, from_g5_id: lines[0].from_id, to_g5_id: lines[0].to_id,
      line_kind: 'river', base_minutes: 5, name_ru: 'речной ход',
      qualifier: { from_to: contrary, to_from: null } }],
  });
  assert.ok(named.name_mismatches.some(item => item.id === lines[0].id && item.type === 'flow_name_conflict'));
});
