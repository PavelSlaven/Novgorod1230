import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '../../../packages/contracts/src/spatial-v3/registry.js';
import { createHash } from 'node:crypto';
import { buildLineWave, checkLineWaveData, LINES_MANIFEST_PATH, LINE_WAVE_DIR, policySlices, runLineWave } from '../build-line-wave.mjs';
import { validateAuthoringBundle } from '../p12-authoring-importer.mjs';
import { LINES_WAVE_MANIFEST } from '../../../scripts/bootstrap-live-world-v17.mjs';

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
const policies = new Map([['recheck.land_30m', { policy_kind: 'fixed_time_interval', interval_minutes: 30 }],
  ['recheck.water_15m', { policy_kind: 'fixed_time_interval', interval_minutes: 15 }],
  ['recheck.wetland_15m', { policy_kind: 'fixed_time_interval', interval_minutes: 15 }],
  ['recheck.shore_15m', { policy_kind: 'fixed_time_interval', interval_minutes: 15 }]]);
const rules = (extra = {}) => ({ spec, recheckPolicies: policies, ...extra });
// External pins of the route kinds (the real ones are read from the active bundle by the generator).
const externals = new Map(Object.values(spec.kinds).map((kind) => [kind.route_kind, { registry_type: 'spatial_materialization',
  registry_id: 'spatial_v3_external_dependencies', registry_version: '1', registry_digest: 'r'.repeat(64), dependency_id: kind.route_kind,
  dependency_version: 1, dependency_digest: kind.route_kind.length.toString(16).padStart(64, 'd'), status: 'approved' }]));
const lenient = (input) => ({ ...input, existing: { ids: null, costProfiles: new Map(), environments: new Map(), externalDependencies: externals, rechecks: policies } });
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
  assert.deepEqual(checkLineWaveData(wave.datasets, rules()), []);
});

test('D56: no length ceiling - a long line is in the wave and needs a recheck policy that slices it', () => {
  const wave = build();
  assert.deepEqual(rowOf(wave, 'cg5bindv3__g4dirv3f__p2').base_minutes, 40, 'a 40-minute line is kept');
  assert.equal(wave.report.counts.pairs, 2);
  assert.deepEqual(wave.report.long_lines.map((line) => [line.id.slice(-5), line.minutes, line.slice_step_minutes, line.recheck_policy_id, line.slices]),
    [['f__p2', 40, 30, 'recheck.water_15m', 3], ['r__p2', 40, 30, 'recheck.water_15m', 3]]);
  assert.ok(wave.datasets.spatial_v3_line_kind_profiles.every((row) => !('max_segment_minutes' in row)), 'PLAN-OK-rt-lines-a3: the slicing is the recheck policy of the kind, not a second field');
  assert.deepEqual(checkLineWaveData(wave.datasets, rules()), []);
  // the same rows without a slicing policy are a violation; progress slices are checked against the line's minutes
  const kinds = (policy) => rules({ recheckPolicies: new Map([...policies, ['recheck.water_15m', policy]]) });
  assert.match(checkLineWaveData(wave.datasets, kinds({ policy_kind: 'segment_once' })).join('|'), /line_recheck_slicing_missing.*segment_once/);
  assert.match(checkLineWaveData(wave.datasets, kinds({ policy_kind: 'fixed_time_interval', interval_minutes: 45 })).join('|'), /line_recheck_slicing_missing/);
  assert.match(checkLineWaveData(wave.datasets, kinds({ policy_kind: 'fixed_progress_slices', progress_slice_ppm: 800000 })).join('|'), /line_recheck_slicing_missing/, '40 x 0.8 = 32 > 30');
  assert.deepEqual(checkLineWaveData(wave.datasets, kinds({ policy_kind: 'fixed_progress_slices', progress_slice_ppm: 700000 })), [], '40 x 0.7 = 28 <= 30');
});

test('slices are counted by the recheck policy of the line, not by the step (A-rt-lines-07 P3-2)', () => {
  const time = (interval_minutes) => ({ policy_kind: 'fixed_time_interval', interval_minutes });
  assert.equal(policySlices(31, time(15)), 3);
  assert.equal(policySlices(48, time(15)), 4);
  assert.equal(policySlices(48, time(30)), 2);
  assert.equal(policySlices(30, time(30)), 1);
  assert.equal(policySlices(48, { policy_kind: 'fixed_progress_slices', progress_slice_ppm: 500000 }), 2);
  assert.equal(policySlices(48, { policy_kind: 'fixed_progress_slices', progress_slice_ppm: 300000 }), 4);
  assert.equal(policySlices(48, { policy_kind: 'segment_once' }), null, 'no slicing policy, no count');
  assert.equal(policySlices(48, time(null)), null);
  assert.deepEqual(build().report.long_lines.map((line) => [line.recheck_policy_kind, line.recheck_interval_minutes, line.slices]),
    [['fixed_time_interval', 15, 3], ['fixed_time_interval', 15, 3]]);
});

test('the validator checks the numbers before it compares them (A-rt-lines-07 P3-1)', () => {
  const wave = build();
  const problems = (policy, options = {}) => checkLineWaveData(wave.datasets, rules({
    recheckPolicies: new Map([...policies, ['recheck.water_15m', policy]]), ...options })).join('|');
  const time = (interval_minutes) => ({ policy_kind: 'fixed_time_interval', interval_minutes });
  const slices = (progress_slice_ppm) => ({ policy_kind: 'fixed_progress_slices', progress_slice_ppm });
  for (const bad of [null, undefined, 0, -1, 1.5, '15', '0', Number.NaN, Infinity]) {
    assert.match(problems(time(bad)), /line_recheck_slicing_missing.*interval_minutes/, `interval_minutes ${String(bad)}`);
  }
  for (const bad of [null, undefined, 0, -1, 1_000_001, 1.5, '700000', '0', Number.NaN]) {
    assert.match(problems(slices(bad)), /line_recheck_slicing_missing.*progress_slice_ppm/, `progress_slice_ppm ${String(bad)}`);
  }
  assert.deepEqual(problems(time(15)), '');
  assert.deepEqual(problems(slices(700000)), '');
  assert.deepEqual(problems(slices(1_000_000)).includes('line_recheck_slicing_missing'), true, 'one slice of 40 minutes is over the step');
  // a kind's policy is invalid even when no line of the kind is long: the two kinds exclude each other as in DDL 13.sql
  assert.match(problems({ ...time(15), progress_slice_ppm: 1 }), /line_recheck_slicing_missing.*progress_slice_ppm/);
  assert.match(problems({ ...slices(700000), interval_minutes: 15 }), /line_recheck_slicing_missing.*interval_minutes/);
  for (const step of [0, -1, 31, 1.5, '30', null, Number.NaN]) {
    assert.match(problems(time(15), { sliceStepMinutes: step }), /slice step/, `sliceStepMinutes ${String(step)}`);
    assert.throws(() => build({}, { sliceStepMinutes: step }), /slice step/);
  }
});

test('the CLI validates --slice-step-minutes before it generates anything (REVIEW rt-lines-2)', () => {
  for (const value of ['invalid', '0', '60', '-3', '1.5', '']) {
    const run = spawnSync(process.execPath, [resolve(root, 'tools/spatial-v3/build-line-wave.mjs'), '--check', '--slice-step-minutes', value], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, `--slice-step-minutes ${JSON.stringify(value)} must fail, stdout ${run.stdout}`);
    assert.match(run.stderr, /slice step/, `--slice-step-minutes ${JSON.stringify(value)}`);
  }
  assert.equal(spawnSync(process.execPath, [resolve(root, 'tools/spatial-v3/build-line-wave.mjs'), '--check', '--slice-step-minutes', '30'], { encoding: 'utf8' }).status, 0);
});

test('the slice step is one rule of the world, a parameter of the generator and the validator (default 30)', () => {
  const wave = build({}, { sliceStepMinutes: 20 });
  assert.deepEqual(build().report.parameters, { slice_step_minutes: 30 });
  assert.deepEqual(wave.report.long_lines.map((line) => line.minutes), [40, 40]);
  assert.deepEqual(checkLineWaveData(wave.datasets, rules({ sliceStepMinutes: 20 })), [], 'water rechecks every 15 minutes');
  const fine = build({}, { sliceStepMinutes: 10 });
  assert.deepEqual(fine.report.long_lines.map((line) => line.minutes), [12, 40, 40]);
  assert.match(checkLineWaveData(fine.datasets, rules({ sliceStepMinutes: 10 })).join('|'), /line_recheck_slicing_missing.*recheck.land_30m/, 'a 12-minute path under a 30-minute recheck and a 10-minute step');
});

test('profile rows use the columns of the DDL-to-be: topological orientation, no movement_orientation, no ceiling field', () => {
  for (const row of build().datasets.spatial_v3_line_kind_profiles) {
    assert.deepEqual(Object.keys(row).sort(), ['baseline_movement_method_id', 'canonical_digest', 'dynamic_recheck_policy_id', 'dynamic_recheck_policy_version',
      'id', 'line_kind_id', 'movement_method_cost_profile_id', 'movement_method_cost_profile_version', 'provenance_ref', 'route_kind_id', 'status',
      'topological_orientation_profile_id', 'topological_orientation_profile_version', 'transition_environment_profile_id',
      'transition_environment_profile_version', 'version', 'world_revision_id']);
  }
});

test('an edge to an external dependency carries the full registry pin of that dependency (trigger spatial_v3_dependency_edge_target_guard)', () => {
  const wave = build();
  const external = wave.datasets.spatial_v3_authoring_dependency_edges.filter((edge) => edge.target_entity_kind === 'external_dependency');
  assert.equal(external.length, 8, 'one route_kind edge per profile');
  for (const edge of external) {
    const pin = externals.get(edge.target_entity_id);
    assert.deepEqual([edge.target_registry_type, edge.target_registry_id, edge.target_registry_version, edge.target_registry_digest, edge.target_dependency_digest],
      [pin.registry_type, pin.registry_id, pin.registry_version, pin.registry_digest, pin.dependency_digest]);
  }
  const broken = build().datasets;
  delete broken.spatial_v3_authoring_dependency_edges.find((edge) => edge.target_entity_kind === 'external_dependency').target_dependency_digest;
  assert.match(checkLineWaveData(broken, rules()).join('|'), /external_dependency.*registry pin/);
  assert.throws(() => buildLineWave({ ...lenient(fixture()), existing: { ...lenient(fixture()).existing, externalDependencies: new Map() } }), /no external dependency pin/);
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
    return checkLineWaveData(wave.datasets, rules()).join(' | ');
  };
  assert.match(mutate((rows) => { rows[0].line_name = 'тропа 2'; }), /line_label_invalid.*digit/);
  assert.match(mutate((rows) => { rows[0].line_name = 'вторая тропа'; rows[1].line_name = 'вторая тропа'; }), /line_label_invalid.*ordinal/);
  assert.match(mutate((rows) => { rows[0].line_name = 'тропа №'; rows[1].line_name = 'тропа №'; }), /line_label_invalid.*ordinal/);
  assert.doesNotMatch(mutate((rows) => { rows[0].line_name = 'по глинистому проходу'; rows[1].line_name = 'по глинистому проходу'; }), /line_label_invalid/,
    '"проход" is a noun, not an ordinal; "пятнистой" is not "пятой"');
  assert.doesNotMatch(mutate((rows) => { rows[0].line_name = 'пятнистой тропой'; rows[1].line_name = 'пятнистой тропой'; }), /line_label_invalid/);
  assert.match(mutate((rows) => { rows[1].line_name = 'иным именем'; }), /reverse.*line_name/);
  assert.match(mutate((rows) => { rows[1].from_scene_endpoint_slot_key = 'departure'; rows[1].to_scene_endpoint_slot_key = 'arrival'; }), /paired-slot/);
  assert.doesNotMatch(mutate((rows) => { rows[0].base_minutes = 61; rows[0].line_name = rows[0].line_name; }), /route_segment_too_long/, 'D56: no ceiling');
  assert.match(mutate((rows) => { rows[1].base_minutes = 0; }), /base_minutes/);
  assert.match(mutate((rows) => { rows[0].reverse_binding_version = 2; }), /reverse.*@3/);
  assert.match(mutate((rows) => { rows[0].availability_condition_set_ref = 'availability.x@1'; }), /availability/);
  // near-duplicates at one place: the same set of content words (REVIEW limit of the line-names approval)
  assert.match(mutate((rows) => { rows.push({ ...rows[0], id: 'cg5bindv3__g4dirv3f__near', line_name: 'вдоль ручья тропой', to_canonical_g5_id: g5('z'), reverse_binding_id: 'nope' }); }), /line_label_near_duplicate/);
  assert.doesNotMatch(mutate((rows) => { rows.push({ ...rows[0], id: 'cg5bindv3__g4dirv3f__other', line_name: 'тропой через брод', to_canonical_g5_id: g5('z'), reverse_binding_id: 'nope' }); }), /near_duplicate/);
  // two outgoing lines of one place with the same (line_name, discriminator, direction)
  assert.match(mutate((rows) => { rows.push({ ...rows[0], id: 'cg5bindv3__g4dirv3f__extra', to_canonical_g5_id: g5('z'), reverse_binding_id: 'nope' }); }), /line_label_duplicate/);
});

// Data of the committed candidate, produced by the generator from the active binding@2, the approved place-geo minutes and the line-names candidate.
const datasetsDir = `${LINE_WAVE_DIR}/datasets`;
const table = (name) => read(`${datasetsDir}/${name}.json`);
const committedPolicies = () => new Map(read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_dynamic_recheck_policies.json').map((row) => [row.id, row]));
const committed = () => Object.fromEntries(['spatial_v3_line_kind_profiles', 'spatial_v3_line_kind_alternative_methods',
  'spatial_v3_movement_method_cost_profiles', 'spatial_v3_movement_method_cost_options', 'spatial_v3_transition_environment_profiles',
  'spatial_v3_canonical_g5_connection_bindings', 'spatial_v3_authoring_versions', 'spatial_v3_authoring_dependency_edges', 'source_records']
  .map((name) => [name, table(name)]));

test('committed candidate: all 454 lines of 227 pairs (D56), long lines are sliced, all rules hold', () => {
  const data = committed();
  const report = read(`${LINE_WAVE_DIR}/generator-report.json`);
  assert.equal(data.spatial_v3_canonical_g5_connection_bindings.length, 454);
  assert.deepEqual([report.counts.pairs, report.counts.base_bindings, report.counts.long_lines], [227, 454, 14]);
  assert.deepEqual([...new Set(report.long_lines.map((line) => line.id.replace(/^.*xp017_yp026_/, '').replace(/^.*g4route_gn_nov_g3_/, '')))].sort(), [
    'r2_flooded_interior_basin_3', 'r2_flooded_interior_basin_cycle', 'r2_forest_stream_route_cross', 'r2_vikhtuy_resource_edge_1',
    'r2_vikhtuy_resource_edge_cycle', 'r2_wet_conifer_tract_1', 'r2_wet_conifer_tract_cycle']);
  assert.ok(report.long_lines.every((line) => line.minutes > line.slice_step_minutes && line.recheck_policy_kind === 'fixed_time_interval'
    && line.slices === Math.ceil(line.minutes / line.recheck_interval_minutes)), 'slices follow the policy: 31/15 -> 3, 48/15 -> 4, 32/30 -> 2');
  assert.deepEqual(report.long_lines.filter((line) => line.minutes === 48).map((line) => line.slices), [4, 4]);
  assert.deepEqual([report.connectivity.components_before, report.connectivity.components_after, report.connectivity.places_without_local_line], [32, 32, []]);
  assert.deepEqual(checkLineWaveData(data, { spec, recheckPolicies: committedPolicies() }), []);
});

test('committed candidate: minutes are the place-geo proposed minutes, names are the line-names names, nothing is invented', () => {
  const data = committed();
  const derived = new Map(read('data/world-catalogs/novgorod/m2c-place-coordinates/derived-report.json').lines.map((line) => [line.id, line.proposed_minutes]));
  for (const row of data.spatial_v3_canonical_g5_connection_bindings) {
    assert.equal(row.base_minutes, derived.get(row.id), row.id);
    assert.ok(Number.isInteger(row.base_minutes) && row.base_minutes >= 1);
  }
  const base = read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json')
    .filter((row) => row.version === 2);
  const byId = new Map(base.map((row) => [row.id, row]));
  for (const row of data.spatial_v3_canonical_g5_connection_bindings) {
    const old = byId.get(row.id);
    for (const key of ['parent_g4_id', 'from_canonical_g5_id', 'to_canonical_g5_id', 'source_pair_id']) assert.equal(row[key], old[key], `${row.id} ${key}`);
  }
});

test('committed candidate: regenerating from the inputs in the tree gives the same bytes (--check)', async () => {
  await runLineWave({ check: true });
});

test('committed candidate: every external edge equals the pin of the active bundle', () => {
  const pins = new Map(read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_external_dependency_versions.json')
    .map((row) => [row.dependency_id, row]));
  const external = committed().spatial_v3_authoring_dependency_edges.filter((edge) => edge.target_entity_kind === 'external_dependency');
  assert.equal(external.length, 8);
  const baseVersions = new Set(read('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_authoring_versions.json')
    .map((row) => `${row.entity_kind}|${row.entity_id}|${row.version}`));
  for (const edge of external) {
    assert.ok(baseVersions.has(`external_dependency|${edge.target_entity_id}|${edge.target_version}`), `${edge.target_entity_id}: the edge FK needs an authoring version of the pin`);
    const pin = pins.get(edge.target_entity_id);
    assert.deepEqual([edge.target_registry_type, edge.target_registry_id, edge.target_registry_version, edge.target_registry_digest, edge.target_dependency_digest, edge.target_version],
      [pin.registry_type, pin.registry_id, pin.registry_version, pin.registry_digest, pin.dependency_digest, pin.dependency_version]);
  }
});

test('committed candidate: names are the approved line-names names; near-similar names at one place are reported, none identical', () => {
  const data = committed();
  const report = read(`${LINE_WAVE_DIR}/generator-report.json`);
  const names = new Map(read('data/world-catalogs/novgorod/m2c-line-names/candidate.json').local_pairs.map((pair) => [pair.source_pair_id, pair.name_ru]));
  for (const row of data.spatial_v3_canonical_g5_connection_bindings) assert.equal(row.line_name, names.get(row.source_pair_id), row.id);
  assert.ok(Number.isInteger(report.matches.similar_but_distinct_names_at_one_place));
});

// a4: the wave as an import bundle (dependency closure, insert-only), validated by the real importer.
const NOVGOROD = 'data/world-catalogs/novgorod';
const sha256 = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');

test('a4: the import manifest is a dependency closure that the importer validates without a single error', async () => {
  const manifest = read(LINES_MANIFEST_PATH);
  assert.deepEqual([manifest.bundle_kind, manifest.delete_policy, manifest.data_gaps ?? [], manifest.status],
    ['dependency_closure', 'forbid', [], 'draft']);
  const result = await validateAuthoringBundle({ manifestPath: LINES_MANIFEST_PATH });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.deepEqual(manifest.datasets.map((entry) => entry.table), ['source_records', 'spatial_v3_authoring_versions', 'spatial_v3_nodes',
    'spatial_v3_external_dependency_versions', 'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles',
    'spatial_v3_movement_method_cost_options', 'spatial_v3_line_kind_profiles', 'spatial_v3_line_kind_alternative_methods',
    'spatial_v3_canonical_g5_connection_bindings', 'spatial_v3_authoring_dependency_edges']);
  assert.deepEqual([result.dataset_counts.spatial_v3_canonical_g5_connection_bindings, result.dataset_counts.spatial_v3_line_kind_profiles,
    result.dataset_counts.spatial_v3_line_kind_alternative_methods, result.dataset_counts.spatial_v3_authoring_versions,
    result.dataset_counts.spatial_v3_authoring_dependency_edges], [454, 8, 3, 471, 1394]);
});

test('a4: own datasets are the candidate files, closure datasets are the unchanged files of the active bundle', () => {
  const manifest = read(LINES_MANIFEST_PATH);
  const base = read(`${NOVGOROD}/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json`);
  const baseSha = new Map(base.datasets.map((entry) => [entry.table, entry.sha256]));
  for (const entry of manifest.datasets) {
    assert.equal(entry.sha256, sha256(`${NOVGOROD}/${entry.file}`), `${entry.table}: sha256 is the file's`);
    assert.equal(entry.delete_policy, 'forbid');
    if (entry.file.includes('m2c-g4-expansion-v1')) {
      assert.equal(entry.sha256, baseSha.get(entry.table), `${entry.table}: closure dataset unchanged`);
      assert.equal(entry.status, 'approved', 'the closure keeps the status of the approved bundle');
    } else {
      assert.ok(entry.file.startsWith('spatial-v3/candidates/m2c-lines-v1/datasets/'), entry.file);
      assert.equal(entry.status, 'draft', 'no approval attestation for the wave yet (a2)');
      assert.equal(entry.provenance_ref, 'm2c_lines_v1_candidate');
    }
  }
  assert.deepEqual(manifest.datasets.filter((entry) => entry.file.includes('m2c-g4-expansion-v1')).map((entry) => entry.table), ['spatial_v3_nodes', 'spatial_v3_external_dependency_versions']);
});

test('a4: the bootstrap declares the wave manifest pin (b1 imports it) and does not import it yet', async () => {
  assert.equal(LINES_WAVE_MANIFEST.path, LINES_MANIFEST_PATH);
  assert.equal(LINES_WAVE_MANIFEST.sha256, sha256(LINES_MANIFEST_PATH), 'repin the constant in bootstrap-live-world-v17.mjs when the wave changes');
  const source = readFileSync(resolve(root, 'scripts/bootstrap-live-world-v17.mjs'), 'utf8');
  assert.equal(source.match(/LINES_WAVE_MANIFEST/g).length, 1, 'declared once, used by no import step before b1');
});
