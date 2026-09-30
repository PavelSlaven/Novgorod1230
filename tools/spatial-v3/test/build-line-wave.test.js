import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../../packages/contracts/src/spatial-v3/registry.js';
import { buildLineWave, checkLineWaveData, LINE_WAVE_DIR, LINE_NAMES_PATH, runLineWave } from '../build-line-wave.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const spec = read(`${LINE_WAVE_DIR}/line-kind-spec.json`);
const digestOf = (row) => { const { canonical_digest: _omit, ...rest } = row; return computeSpatialV3CanonicalDigest(rest).slice(7); };

// Two pairs of places A-B (path) and C-D (river_channel); the reverse id sorts after the forward id.
const g5 = (name) => `cg5v3__g4_${name}`;
const binding = (pair, from, to, dir) => ({ id: `cg5bindv3__g4dirv3${dir}__${pair}`, version: 2,
  parent_g4_id: 'g4v3__x', parent_g4_version: 1, from_canonical_g5_id: g5(from), from_canonical_g5_version: 1,
  to_canonical_g5_id: g5(to), to_canonical_g5_version: 1, connection_profile_id: 'cprofv3__site_connection__local_passage',
  connection_profile_version: 2, from_scene_endpoint_slot_key: 'departure', to_scene_endpoint_slot_key: 'arrival',
  reverse_binding_id: `cg5bindv3__g4dirv3${dir === 'f' ? 'r' : 'f'}__${pair}`, reverse_binding_version: 2,
  source_pair_id: `pepv3__${pair}`, source_pair_version: 1, status: 'approved', provenance_ref: 'prov' });
const fixture = () => ({
  bindings: [binding('p1', 'a', 'b', 'f'), binding('p1', 'b', 'a', 'r'), binding('p2', 'c', 'd', 'f'), binding('p2', 'd', 'c', 'r')],
  derivedLines: [['p1', 'f', 10], ['p1', 'r', 12], ['p2', 'f', 40], ['p2', 'r', 40]].map(([pair, dir, minutes]) =>
    ({ id: `cg5bindv3__g4dirv3${dir}__${pair}`, proposed_minutes: minutes })),
  lineNames: { local_pairs: [{ source_pair_id: 'pepv3__p1', line_kind: 'path', name_ru: 'тропой вдоль ручья' },
    { source_pair_id: 'pepv3__p2', line_kind: 'river_channel', name_ru: 'руслом у острова' }] },
  spec, worldRevisionId: 'rev', provenanceRef: 'm2c_lines_v1_candidate',
  existing: { ids: new Set(), costProfiles: new Map(), environments: new Map() }
});
const lenient = (input) => ({ ...input, existing: { ids: null, costProfiles: new Map(), environments: new Map() } });
const build = (patch = {}, options = {}) => buildLineWave(lenient({ ...fixture(), ...patch }), options);
const rowOf = (wave, id) => wave.datasets.spatial_v3_canonical_g5_connection_bindings.find((row) => row.id === id);

test('a pair becomes binding@3: line fields from the owners, reverse slots swapped, reverse refs at @3', () => {
  const wave = build();
  const fwd = rowOf(wave, 'cg5bindv3__g4dirv3f__p1');
  const rev = rowOf(wave, 'cg5bindv3__g4dirv3r__p1');
  assert.equal(fwd.version, 3);
  assert.deepEqual([fwd.line_name, fwd.base_minutes, rev.base_minutes], ['тропой вдоль ручья', 10, 12]);
  assert.equal(rev.line_name, fwd.line_name, 'one name for both directions');
  assert.deepEqual([fwd.from_scene_endpoint_slot_key, fwd.to_scene_endpoint_slot_key], ['departure', 'arrival']);
  assert.deepEqual([rev.from_scene_endpoint_slot_key, rev.to_scene_endpoint_slot_key], ['arrival', 'departure'], 'paired-slot rule (§6.5)');
  assert.deepEqual([fwd.reverse_binding_id, fwd.reverse_binding_version], [rev.id, 3]);
  assert.equal(fwd.availability_condition_set_ref, null, 'D3: no availability on a non-portal connection');
  assert.equal(fwd.line_kind_profile_id, 'lkp__path');
  assert.equal('connection_profile_id' in fwd, false, 'the F block has no connection profile');
  assert.deepEqual(checkLineWaveData(wave.datasets, { spec }), []);
});

test('the segment limit is a parameter: a pair over it waits for D2 (both directions), not dropped silently', () => {
  const wave = build();
  assert.equal(rowOf(wave, 'cg5bindv3__g4dirv3f__p2'), undefined);
  assert.deepEqual(wave.report.excluded_pairs.map((pair) => [pair.source_pair_id, pair.status, pair.max_segment_minutes,
    pair.lines.map((line) => line.minutes)]), [['pepv3__p2', 'waits_for_D2', 30, [40, 40]]]);
  const raised = build({}, { maxSegmentMinutes: 60 });
  assert.equal(raised.report.excluded_pairs.length, 0);
  assert.equal(raised.datasets.spatial_v3_line_kind_profiles.find((row) => row.line_kind_id === 'river_channel').max_segment_minutes, 60);
  assert.equal(rowOf(raised, 'cg5bindv3__g4dirv3r__p2').base_minutes, 40);
  assert.deepEqual(checkLineWaveData(raised.datasets, { spec, maxSegmentMinutes: 60 }), []);
  assert.ok(checkLineWaveData(raised.datasets, { spec }).some((problem) => /route_segment_too_long/.test(problem)),
    'the same rows violate the default limit of 30');
});

test('a pair with one direction over the limit is excluded whole', () => {
  const input = fixture();
  input.derivedLines[1].proposed_minutes = 31;
  const wave = buildLineWave(lenient(input));
  assert.deepEqual(wave.report.excluded_pairs.map((pair) => pair.source_pair_id), ['pepv3__p1', 'pepv3__p2']);
  assert.equal(wave.datasets.spatial_v3_canonical_g5_connection_bindings.length, 0);
});

test('authoring versions carry the canonical digest of each row, three dependency edges per binding', () => {
  const wave = build();
  const versions = wave.datasets.spatial_v3_authoring_versions;
  const bindings = wave.datasets.spatial_v3_canonical_g5_connection_bindings;
  for (const row of bindings) {
    const entry = versions.find((item) => item.entity_kind === 'canonical_g5_connection_binding' && item.entity_id === row.id && item.version === 3);
    assert.equal(entry.canonical_digest, digestOf(row));
    const edges = wave.datasets.spatial_v3_authoring_dependency_edges.filter((edge) =>
      edge.source_entity_id === row.id && edge.source_version === 3);
    assert.deepEqual(edges.map((edge) => edge.dependency_role).sort(), ['from_canonical_g5', 'parent_g4', 'to_canonical_g5']);
  }
  for (const row of wave.datasets.spatial_v3_line_kind_profiles) {
    assert.equal(versions.find((item) => item.entity_kind === 'line_kind_profile' && item.entity_id === row.id).canonical_digest, digestOf(row));
  }
});

test('every water kind has an alternative that needs no transport, as a rational-factor option of its cost profile', () => {
  const { datasets } = build();
  const profiles = datasets.spatial_v3_line_kind_profiles;
  assert.deepEqual(profiles.map((row) => row.line_kind_id).sort(), Object.keys(spec.kinds).sort());
  for (const kind of ['river_channel', 'side_channel', 'open_water']) {
    const profile = profiles.find((row) => row.line_kind_id === kind);
    const alternatives = datasets.spatial_v3_line_kind_alternative_methods.filter((row) => row.profile_id === profile.id);
    assert.deepEqual(alternatives.map((row) => row.movement_method_id), ['movement_method.swim']);
    const options = datasets.spatial_v3_movement_method_cost_options.filter((row) => row.profile_id === profile.movement_method_cost_profile_id);
    assert.deepEqual(options.map((row) => [row.movement_method_id, row.cost_mode]), [['movement_method.boat_rowed', 'baseline'], ['movement_method.swim', 'rational_factor']]);
    assert.equal(datasets.spatial_v3_movement_method_cost_profiles.find((row) => row.id === profile.movement_method_cost_profile_id).base_minutes, null,
      'D8: minutes live on the binding, the cost profile carries method and options');
  }
});

test('the validator rejects each violated rule of Appendix F §4.7.2 / the binding block', () => {
  const mutate = (change) => {
    const wave = build();
    change(wave.datasets.spatial_v3_canonical_g5_connection_bindings);
    return checkLineWaveData(wave.datasets, { spec }).join(' | ');
  };
  assert.match(mutate((rows) => { rows[0].line_name = 'тропа 2'; }), /line_label_invalid.*digit/);
  assert.match(mutate((rows) => { rows[0].line_name = 'вторая тропа'; rows[1].line_name = 'вторая тропа'; }), /line_label_invalid.*ordinal/);
  assert.match(mutate((rows) => { rows[0].line_name = 'тропа №'; rows[1].line_name = 'тропа №'; }), /line_label_invalid.*ordinal/);
  assert.doesNotMatch(mutate((rows) => { rows[0].line_name = 'по глинистому проходу'; rows[1].line_name = 'по глинистому проходу'; }), /line_label_invalid/,
    '"проход" is a noun, not an ordinal; "пятнистой" is not "пятой"');
  assert.doesNotMatch(mutate((rows) => { rows[0].line_name = 'пятнистой тропой'; rows[1].line_name = 'пятнистой тропой'; }), /line_label_invalid/);
  assert.match(mutate((rows) => { rows[1].line_name = 'иным именем'; }), /reverse.*line_name/);
  assert.match(mutate((rows) => { rows[1].from_scene_endpoint_slot_key = 'departure'; rows[1].to_scene_endpoint_slot_key = 'arrival'; }), /paired-slot/);
  assert.match(mutate((rows) => { rows[0].base_minutes = 31; }), /route_segment_too_long/);
  assert.match(mutate((rows) => { rows[1].base_minutes = 0; }), /base_minutes/);
  assert.match(mutate((rows) => { rows[0].reverse_binding_version = 2; }), /reverse.*@3/);
  assert.match(mutate((rows) => { rows[0].availability_condition_set_ref = 'availability.x@1'; }), /availability/);
  // two outgoing lines of one place with the same (line_name, discriminator, direction)
  assert.match(mutate((rows) => { rows.push({ ...rows[0], id: 'cg5bindv3__g4dirv3f__extra', to_canonical_g5_id: g5('z'), reverse_binding_id: 'nope' }); }), /line_label_duplicate/);
});

// Data of the committed candidate, produced by the generator from the active binding@2, the approved place-geo minutes and the line-names candidate.
const datasetsDir = `${LINE_WAVE_DIR}/datasets`;
const table = (name) => read(`${datasetsDir}/${name}.json`);
const committed = () => Object.fromEntries(['spatial_v3_line_kind_profiles', 'spatial_v3_line_kind_alternative_methods',
  'spatial_v3_movement_method_cost_profiles', 'spatial_v3_movement_method_cost_options', 'spatial_v3_transition_environment_profiles',
  'spatial_v3_canonical_g5_connection_bindings', 'spatial_v3_authoring_versions', 'spatial_v3_authoring_dependency_edges', 'source_records']
  .map((name) => [name, table(name)]));

test('committed candidate: 440 lines of 220 pairs, the 7 pairs over 30 minutes wait for D2, all rules hold', () => {
  const data = committed();
  const report = read(`${LINE_WAVE_DIR}/generator-report.json`);
  assert.equal(data.spatial_v3_canonical_g5_connection_bindings.length, 440);
  assert.equal(report.counts.pairs, 220);
  assert.equal(report.counts.base_bindings, 454);
  assert.deepEqual(report.excluded_pairs.map((pair) => pair.source_pair_id.replace(/^.*xp017_yp026_/, '')).sort(), [
    'r2_flooded_interior_basin_3', 'r2_flooded_interior_basin_cycle', 'r2_forest_stream_route_cross', 'r2_vikhtuy_resource_edge_1',
    'r2_vikhtuy_resource_edge_cycle', 'r2_wet_conifer_tract_1', 'r2_wet_conifer_tract_cycle']);
  assert.ok(report.excluded_pairs.every((pair) => pair.status === 'waits_for_D2' && pair.max_segment_minutes === 30));
  assert.deepEqual(report.limit_sensitivity.map((row) => [row.max_segment_minutes, row.pairs_included]),
    [[30, 220], [35, 224], [40, 226], [48, 227], [60, 227]], 'D2: the limit is a parameter; what each value would admit');
  assert.equal(report.connectivity.components_before, 32);
  assert.equal(report.connectivity.components_after, 34);
  assert.deepEqual(report.connectivity.places_without_local_line.map((id) => id.replace(/^.*xp017_yp026_/, '')).sort(),
    ['r2_vikhtuy_resource_edge_river_edge', 'r2_wet_conifer_tract_river_edge']);
  assert.deepEqual(checkLineWaveData(data, { spec }), []);
});

test('committed candidate: minutes are the place-geo proposed minutes, names are the line-names names, nothing is invented', () => {
  const data = committed();
  const derived = new Map(read('data/world-catalogs/novgorod/m2c-place-coordinates/derived-report.json').lines.map((line) => [line.id, line.proposed_minutes]));
  for (const row of data.spatial_v3_canonical_g5_connection_bindings) {
    assert.equal(row.base_minutes, derived.get(row.id), row.id);
    assert.ok(row.base_minutes >= 1 && row.base_minutes <= 30);
  }
  const base = read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json')
    .filter((row) => row.version === 2);
  const byId = new Map(base.map((row) => [row.id, row]));
  for (const row of data.spatial_v3_canonical_g5_connection_bindings) {
    const old = byId.get(row.id);
    for (const key of ['parent_g4_id', 'from_canonical_g5_id', 'to_canonical_g5_id', 'source_pair_id']) assert.equal(row[key], old[key], `${row.id} ${key}`);
  }
});

const lineNamesPresent = existsSync(resolve(root, LINE_NAMES_PATH));
test('committed candidate: regenerating from the inputs gives the same bytes (--check)',
  { skip: lineNamesPresent ? false : `${LINE_NAMES_PATH} is not merged yet (fleet/line-names, PLAN-OK-rt-lines-a)` }, async () => {
    await runLineWave({ check: true });
  });
