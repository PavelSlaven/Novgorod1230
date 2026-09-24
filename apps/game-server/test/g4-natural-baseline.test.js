import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { G4_NATURAL_LAYERS, createRandomSource, deriveApprovedInitialEnvironment,
  selectG4NaturalMembers } from '@rus/materialization';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { prepareG4NaturalBaseline } from '../src/runtime/g4-natural-baseline.js';
import { buildG4NaturalCompiledRecords } from '../../../tools/runtime-catalog-activation/src/g4-natural-compiled-records.js';

function fixture() {
  const calendar = { record_id: 'calendar', version: '3', status: 'approved',
    family_id: 'calendar_daylight_light_profiles', payload: { calendar_profile_id: 'calendar-profile',
      daylight_profile_id: 'daylight-profile', daylight_boundary_rules: { year_daily_boundaries: {
        1230: { '08-20': { civil_dawn_minute_of_day: 250, sunrise_minute_of_day: 300,
          sunset_minute_of_day: 1100, civil_dusk_minute_of_day: 1150 } } } },
      season_rule: { summer_months: ['8'] } } };
  const weather = { record_id: 'weather', version: '2', status: 'approved',
    family_id: 'weather_transition_profiles_processes', payload: { weather_profile_id: 'weather-profile',
      region_season_applicability: { calendar_seasons: { summer: ['8'] } },
      transition_rules: { seasonal_candidates: { summer: [{ weather_state_id: 'clear', weight: 1,
        weather_state_ref: { id: 'clear', version: 1 } }] } },
      weather_states: [{ weather_state_id: 'clear', sky: 'clear' }] } };
  const current_environment = deriveApprovedInitialEnvironment({ calendar_record: calendar, weather_record: weather,
    calendar_date: { year: 1230, month: 8, day: 20 }, local_minute_of_day: 400,
    random: createRandomSource({ seed: 2 }) });
  const layers = Object.fromEntries(G4_NATURAL_LAYERS.map((key) => [key, {
    applicability: 'present', value: { class: `approved:${key}` }, source_refs: ['source'], limits: 'No stock or access implication.' }]));
  layers.tree_layer = { applicability: 'not_applicable', value: null, source_refs: ['source'], limits: 'Open water has no tree stratum.' };
  layers.seasonal_state.value = { calendar_profile_ref: 'calendar', calendar_profile_version: 3,
    weather_profile_ref: 'weather', weather_profile_version: 2, current_state_from_world_time: true };
  layers.light.value = { exposure: 'open', calendar_profile_ref: 'calendar', calendar_profile_version: 3, resolve_from_current_world_time: true };
  layers.weather.value = { weather_profile_ref: 'weather', weather_profile_version: 2, resolve_from_current_world_state: true };
  const g4_ref = { id: 'g4-exact', version: 9, world_revision_id: 'world' };
  const candidate = { artifact_type: 'natural_baseline_authoring_candidate',
    status: 'candidate_approval_pending', approved: false, import_authorized: false,
    target: { world_revision_id: 'world' }, natural_profiles: [{ profile_id: 'natural', profile_version: 2,
      g4_ref, natural_profile: { layer_applicability: layers }, exact_scene_features: {
        canonical_scene_template_refs: ['scene@5'] } }] };
  const rows = buildG4NaturalCompiledRecords({ candidate });
  const pin = { compatible_world_revision_id: 'world', compatible_world_catalog_digest: 'a'.repeat(64), catalog_digest: 'b'.repeat(64) };
  return { candidate, input: { pin, g4_ref, scene_template_ref: { id: 'scene', version: 5 },
    current_environment, verifiedCatalog: { schema: 'rus.verified_item_catalog.v2', verified: true,
      pin, records_by_table: { procedural_scene_compiled_records: rows.map((row) => ({ ...row, version: String(row.version) })) } },
    visibleContext: { version: 1, schema: 'visible_context_package', visible_scene: 'Берег',
      sensory_details: ['Видна вода.'], visible_changes: [], visible_npc: [], visible_objects: [],
      known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] } } };
}

test('exact activated G4 natural baseline resolves all layers without projecting perception', () => {
  const { input, candidate } = fixture();
  const before = structuredClone(input);
  const result = prepareG4NaturalBaseline(input);
  assert.equal(result.layers.length, 13);
  assert.equal(result.gameplay_materialization_llm_calls, 0);
  assert.equal(validateVisibleContext(input.visibleContext).ok, true);
  assert.deepEqual(input, before);
  const facts = result.layers;
  assert.equal(facts.length, 13);
  assert.equal(facts.find((row) => row.layer === 'tree_layer').value, null);
  assert.equal(facts.find((row) => row.layer === 'seasonal_state').value.current_season, 'summer');
  assert.equal(facts.find((row) => row.layer === 'light').value.current_light_state, 'daylight');
  assert.equal(facts.find((row) => row.layer === 'weather').value.current_weather_state.weather_state_id, 'clear');
  assert.equal(result.visibleContext, undefined);
  assert.equal(result.sensory_details, undefined);
  assert.equal(candidate.import_authorized, false, 'building rows does not authorize import');
  assert.deepEqual(prepareG4NaturalBaseline(input), result);
});

test('verified successor profile selects only source-admitted members and rejects unresolved rows', () => {
  const { input } = fixture();
  const row = input.verifiedCatalog.records_by_table.procedural_scene_compiled_records[0];
  row.payload.frequency_weight_policy = { version: 1, weights: { dominant: 8, common: 4 } };
  row.payload.natural_profile.season_matrix = { summer: { ground_cover: {
    applicability: 'present', mandatory_member_refs: ['baseline:ground_cover'],
    excluded_candidate_refs: [], incompatibility: { status: 'resolved', member_refs: [] },
    members: [
      { member_ref: 'baseline:ground_cover', eligibility: 'approved_broad_context' },
      { member_ref: 'reed', eligibility: 'conditional_current_state',
        frequency_category: 'dominant', editorial_weight: 8 }
    ] } } };
  row.payload_digest = createHash('sha256').update(canonicalStringify(row.payload)).digest('hex');
  input.member_selection = { party_id: 'party', g5_site_id: 'site',
    eligible_member_refs: ['reed'] };
  const selected = prepareG4NaturalBaseline(input).member_selection;
  assert.deepEqual(selected.layers[0].member_refs, ['baseline:ground_cover', 'reed']);
  assert.deepEqual(prepareG4NaturalBaseline(input).member_selection, selected);
  input.member_selection.eligible_member_refs = [];
  assert.deepEqual(prepareG4NaturalBaseline(input).member_selection.layers[0].member_refs,
    ['baseline:ground_cover']);
  delete input.member_selection;
  assert.throws(() => prepareG4NaturalBaseline(input), (error) =>
    error.details.reason === 'MEMBER_SELECTION_INPUT_INVALID');
  row.payload.natural_profile.season_matrix.summer.ground_cover.incompatibility.status = 'unresolved_source_gap';
  row.payload_digest = createHash('sha256').update(canonicalStringify(row.payload)).digest('hex');
  assert.throws(() => prepareG4NaturalBaseline({ ...input, member_selection: {
    party_id: 'party', g5_site_id: 'site', eligible_member_refs: ['reed'] } }), (error) =>
    error.details.reason === 'MEMBER_RULES_UNRESOLVED');
  row.payload.natural_profile.season_matrix.summer.fauna = {
    applicability: 'conditional', mandatory_member_refs: [], excluded_candidate_refs: [],
    incompatibility: { status: 'resolved', member_refs: [] }, members: [] };
  row.payload_digest = createHash('sha256').update(canonicalStringify(row.payload)).digest('hex');
  assert.throws(() => prepareG4NaturalBaseline({ ...input, member_selection: {
    party_id: 'party', g5_site_id: 'site', eligible_member_refs: [] } }), (error) =>
    error.details.reason === 'MEMBER_LAYER_UNSUPPORTED');
});

test('no family fallback, wrong version, partial layers, unactivated records or missing Temporal state', () => {
  for (const mutate of [
    (r) => { r.g4_ref = { ...r.g4_ref, id: 'same-family-but-other-g4' }; },
    (r) => { r.g4_ref = { ...r.g4_ref, version: 10 }; },
    (r) => { r.scene_template_ref.version = 6; },
    (r) => { r.verifiedCatalog.verified = false; },
    (r) => { r.current_environment = null; },
    (r) => { r.current_environment = { ...r.current_environment, calendar_record_ref: { id: 'other', version: '3' } }; },
    (r) => { delete r.verifiedCatalog.records_by_table.procedural_scene_compiled_records[0].payload.natural_profile.layer_applicability.relief; },
    (r) => { r.verifiedCatalog.records_by_table.procedural_scene_compiled_records[0].payload.g4_ref.version = 10; }
  ]) {
    const { input } = fixture(); mutate(input);
    assert.throws(() => prepareG4NaturalBaseline(input));
  }
});

test('legacy profile keeps exactly thirteen layers', () => {
  const { input } = fixture();
  input.verifiedCatalog.records_by_table.procedural_scene_compiled_records[0]
    .payload.natural_profile.layer_applicability.fauna = {
      applicability: 'conditional', value: { class: 'habitat_only' },
      source_refs: ['source'], limits: 'No current animal.' };
  assert.throws(() => prepareG4NaturalBaseline(input), (error) =>
    error.details.reason === 'PROFILE_INVALID');
});

test('review row builder rejects unresolved applicability and duplicate exact G4 profiles', () => {
  const { candidate } = fixture();
  candidate.natural_profiles.push(structuredClone(candidate.natural_profiles[0]));
  assert.throws(() => buildG4NaturalCompiledRecords({ candidate }), /unique exact G4/);
  candidate.natural_profiles.pop();
  candidate.natural_profiles[0].natural_profile.layer_applicability.water_body.applicability = 'conditional';
  assert.throws(() => buildG4NaturalCompiledRecords({ candidate }), { code: 'G4_NATURAL_BASELINE_DATA_GAP' });
});

test('the same Temporal record ID at another version is rejected for either owner', () => {
  for (const source of ['calendar_record_ref', 'weather_record_ref']) {
    const { input } = fixture();
    input.current_environment = { ...input.current_environment,
      [source]: { ...input.current_environment[source], version: '999' } };
    assert.throws(() => prepareG4NaturalBaseline(input), (error) =>
      error.code === 'G4_NATURAL_BASELINE_DATA_GAP'
      && error.details.reason === 'CURRENT_TEMPORAL_STATE_MISSING');
  }
  for (const [layer, field] of [['seasonal_state', 'calendar_profile_version'],
    ['seasonal_state', 'weather_profile_version'], ['light', 'calendar_profile_version'],
    ['weather', 'weather_profile_version']]) {
    const { candidate } = fixture();
    delete candidate.natural_profiles[0].natural_profile.layer_applicability[layer].value[field];
    assert.throws(() => buildG4NaturalCompiledRecords({ candidate }), (error) =>
      error.code === 'G4_NATURAL_BASELINE_DATA_GAP'
      && error.details.reason === 'TEMPORAL_PROFILE_REFS_MISSING');
  }
});

test('night and closed-portal contexts receive no natural sensory facts from baseline readiness', () => {
  const { input } = fixture();
  input.current_environment = { ...input.current_environment, light_state: 'night' };
  input.visibleContext.sensory_details = [];
  input.visibleContext.uncertainties = ['За закрытой дверью ничего не видно.'];
  const before = structuredClone(input.visibleContext);
  const baseline = prepareG4NaturalBaseline(input);
  assert.equal(baseline.layers.length, 13, 'machine baseline still exists');
  assert.equal(baseline.visibleContext, undefined);
  assert.equal(baseline.sensory_details, undefined);
  assert.deepEqual(input.visibleContext, before, 'perception context is never expanded by readiness');
});

test('approved successor selects derived members for each G4 and season, never typed gaps', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const path = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
  const candidateBytes = readFileSync(resolve(root, path), 'utf8');
  const approvedCandidateBytes = execFileSync('git', ['show', `ae212e78:${path}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 8_000_000 });
  const approval = JSON.parse(readFileSync(resolve(root,
    'data/world-catalogs/novgorod/m2c-natural/nature-successor-data-approval.json')));
  const records = buildG4NaturalCompiledRecords({ candidateBytes, approvedCandidateBytes, approval });
  assert.equal(records.length, 32);
  const { input } = fixture();
  const first = records[0];
  const rows = first.payload.natural_profile.layer_applicability;
  input.g4_ref = first.payload.g4_ref;
  const [id, version] = first.payload.exact_scene_features.canonical_scene_template_refs[0].split('@');
  input.scene_template_ref = { id, version: Number(version) };
  input.pin.compatible_world_revision_id = input.g4_ref.world_revision_id;
  input.verifiedCatalog.records_by_table.procedural_scene_compiled_records = [{ ...first,
    version: String(first.version) }];
  input.current_environment = { ...input.current_environment,
    calendar_record_ref: { id: rows.seasonal_state.value.calendar_profile_ref,
      version: String(rows.seasonal_state.value.calendar_profile_version) },
    weather_record_ref: { id: rows.weather.value.weather_profile_ref,
      version: String(rows.weather.value.weather_profile_version) } };
  input.member_selection = { party_id: 'party', g5_site_id: 'site' };
  const baseline = prepareG4NaturalBaseline(input);
  assert.equal(baseline.layers.length, 14);
  assert.equal(baseline.layers.find((layer) => layer.layer === 'fauna').applicability, 'conditional');
  assert.equal(baseline.member_selection.layers.some((layer) => layer.layer === 'fauna'), false);
  const tampered = structuredClone(first.payload);
  const [season, seasonRows] = Object.entries(tampered.natural_profile.season_matrix)[0];
  const row = Object.values(seasonRows)[0];
  row.evidence.season_window = 'other';
  assert.throws(() => selectG4NaturalMembers({ profile: tampered,
    frequency_weight_policy: tampered.natural_profile.frequency_weight_policy,
    party_id: 'party', g5_site_id: 'site', season, eligible_member_refs: [] }), (error) =>
    error.details.reason === 'MEMBER_RULES_UNRESOLVED');
  for (const { payload: profile } of records) {
    const { natural_profile } = profile;
    assert.equal(Object.keys(natural_profile.layer_applicability).length, 14);
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      const result = selectG4NaturalMembers({ profile,
        frequency_weight_policy: natural_profile.frequency_weight_policy,
        party_id: 'party', g5_site_id: 'site', season, eligible_member_refs: [] });
      assert.equal(result.layers.length, Object.keys(natural_profile.season_matrix[season]).length);
      for (const layer of result.layers) {
        const row = natural_profile.season_matrix[season][layer.layer];
        assert.equal(row.source_condition, 'derived_layer_season');
        assert.ok(layer.member_refs.every((ref) => row.members.some((member) => member.member_ref === ref
          && ['approved_broad_context', 'derived_layer_season'].includes(member.eligibility))));
      }
      assert.equal(result.layers.some((layer) => layer.layer === 'fauna'), false);
      assert.equal(result.layers.some((layer) => layer.layer === 'audible_context'
        && natural_profile.layer_applicability.audible_context.value.class.includes('water')), false);
    }
  }
});
