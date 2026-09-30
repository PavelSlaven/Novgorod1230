#!/usr/bin/env node
// m2c-lines-v1 generator (rt-lines phase a1, PLAN-OK-rt-lines-a): Spatial 4.7.0 line fields for the active local
// G5-G5 connection bindings. Reads the active binding@2, the approved place-geo minutes and the line-names
// candidate; writes candidates/m2c-lines-v1/{datasets,generator-report.json}. Imports nothing, edits no existing dataset.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { computeSpatialV3CanonicalDigest } from '../../packages/contracts/src/spatial-v3/registry.js';

const root = resolve(import.meta.dirname, '../..');
const CATALOG = 'data/world-catalogs/novgorod';
export const LINE_WAVE_DIR = `${CATALOG}/spatial-v3/candidates/m2c-lines-v1`;
export const LINE_NAMES_PATH = `${CATALOG}/m2c-line-names/candidate.json`;
const BASE_DIR = `${CATALOG}/spatial-v3/candidates/m2c-g4-expansion-v1`;
const BASE = `${BASE_DIR}/datasets`;
export const LINES_MANIFEST_PATH = `${CATALOG}/m2c-lines-v1-import-manifest.json`;
const DERIVED_PATH = `${CATALOG}/m2c-place-coordinates/derived-report.json`;
const VERSION = 3;
// D56: one rule for the world, not a profile field: a line longer than this has a recheck policy that slices it at this step.
const DEFAULT_SLICE_STEP_MINUTES = 30;
const MAX_SLICE_STEP_MINUTES = 30;
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
/** The slice step: an integer of 1..30 minutes (null, NaN, strings, 0, 31 and more are not steps). */
const sliceStepProblem = (step) => (integerIn(step, 1, MAX_SLICE_STEP_MINUTES) ? null : `slice step must be an integer of 1..${MAX_SLICE_STEP_MINUTES} minutes, got ${String(step)}`);
/** Why a recheck policy cannot slice a line, or null. The two slicing kinds exclude each other, as in DDL 13.sql (interval_minutes / progress_slice_ppm). */
function policyProblem(policy) {
  if (policy?.policy_kind === 'fixed_time_interval') {
    if (!integerIn(policy.interval_minutes, 1, Number.MAX_SAFE_INTEGER)) return `fixed_time_interval needs interval_minutes as an integer >= 1, got ${String(policy.interval_minutes)}`;
    return policy.progress_slice_ppm == null ? null : `fixed_time_interval forbids progress_slice_ppm, got ${String(policy.progress_slice_ppm)}`;
  }
  if (policy?.policy_kind === 'fixed_progress_slices') {
    if (!integerIn(policy.progress_slice_ppm, 1, 1_000_000)) return `fixed_progress_slices needs progress_slice_ppm as an integer of 1..1000000, got ${String(policy.progress_slice_ppm)}`;
    return policy.interval_minutes == null ? null : `fixed_progress_slices forbids interval_minutes, got ${String(policy.interval_minutes)}`;
  }
  return `${policy?.policy_kind ?? 'no policy'} does not slice a line`;
}
/** Number of slices the recheck policy cuts a line of `minutes` into, or null when the policy does not slice. */
export function policySlices(minutes, policy) {
  if (policyProblem(policy) != null) return null;
  return policy.policy_kind === 'fixed_time_interval' ? Math.ceil(minutes / policy.interval_minutes) : Math.ceil(1_000_000 / policy.progress_slice_ppm);
}
const PROVENANCE = 'm2c_lines_v1_candidate';
const T = Object.freeze({
  profiles: 'spatial_v3_line_kind_profiles', alternatives: 'spatial_v3_line_kind_alternative_methods',
  costProfiles: 'spatial_v3_movement_method_cost_profiles', costOptions: 'spatial_v3_movement_method_cost_options',
  environments: 'spatial_v3_transition_environment_profiles', bindings: 'spatial_v3_canonical_g5_connection_bindings',
  versions: 'spatial_v3_authoring_versions', edges: 'spatial_v3_authoring_dependency_edges', sources: 'source_records' });
// Ordinal words (no approved stop-list exists in the repository yet: §4.7.2 names it, this is the generator's own: first..tenth, №).
// Nouns such as "проход" are not ordinals; the numbering itself ("Проход N") is caught by the digit rule.
const ORDINAL = /(^|[^а-яё])(перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|девят|десят)(ый|ой|ий|ая|ья|ое|ье|ые|ьи|ого|ьего|ому|ьему|ым|ьим|ом|ьем|ую|ью|ых|ьих|ыми|ьими|ьей|ей)($|[^а-яё])|№/iu;
const digest = (row) => { const { canonical_digest: _omit, ...rest } = row; return computeSpatialV3CanonicalDigest(rest).slice(7); };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Near-duplicate names at one place (limit of the line-names approval): the same set of content words.
const FUNCTION_WORDS = new Set(['по', 'над', 'у', 'в', 'во', 'на', 'и', 'а', 'вдоль', 'под', 'между', 'из', 'к', 'ко', 'с', 'со', 'от', 'до', 'за', 'при', 'через']);
const contentStems = (name) => new Set(String(name).toLowerCase().normalize('NFC').split(/[^а-яё]+/u)
  .filter((word) => word && !FUNCTION_WORDS.has(word)).map((word) => word.slice(0, 4)));
const sameSet = (a, b) => a.size > 0 && a.size === b.size && [...a].every((item) => b.has(item));
const jaccard = (a, b) => [...a].filter((item) => b.has(item)).length / new Set([...a, ...b]).size;
function similarNamesPerPlace(rows) {
  const byPlace = new Map();
  for (const row of rows) byPlace.set(row.from_canonical_g5_id, [...(byPlace.get(row.from_canonical_g5_id) ?? []), row]);
  const identical = []; let similar = 0;
  for (const [place, list] of byPlace) for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    if (list[i].line_name === list[j].line_name) continue;
    const a = contentStems(list[i].line_name); const b = contentStems(list[j].line_name);
    if (sameSet(a, b)) identical.push(`${place}: "${list[i].line_name}" / "${list[j].line_name}"`);
    else if (jaccard(a, b) >= 0.34) similar += 1;
  }
  return { identical, similar };
}
const sealed = (row) => ({ ...row, canonical_digest: digest(row) });
const version = (entity_kind, row, worldRevisionId) => ({ entity_kind, entity_id: row.id, version: row.version ?? VERSION,
  world_revision_id: worldRevisionId, canonical_digest: row.canonical_digest ?? digest(row), status: 'approved', provenance_ref: PROVENANCE });

/** Pure: inputs -> { datasets, report }. D56: there is no length ceiling and no profile field for it; `sliceStepMinutes` is the validator's slice step. */
export function buildLineWave({ bindings, derivedLines, lineNames, spec, worldRevisionId, provenanceRef = PROVENANCE, existing = {} },
  { sliceStepMinutes = DEFAULT_SLICE_STEP_MINUTES } = {}) {
  const stepProblem = sliceStepProblem(sliceStepMinutes);
  if (stepProblem) throw new Error(stepProblem);
  const minutes = new Map(derivedLines.map((line) => [line.id, line.proposed_minutes]));
  const names = new Map(lineNames.local_pairs.map((pair) => [pair.source_pair_id, pair]));
  const byPair = new Map();
  for (const row of bindings) byPair.set(row.source_pair_id, [...(byPair.get(row.source_pair_id) ?? []), row]);
  const included = []; const slotCounts = { forward_kept: 0, reverse_swapped: 0 };
  for (const [pairId, pair] of [...byPair].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (pair.length !== 2) throw new Error(`${pairId}: a pair needs two bindings`);
    const [forward, reverse] = [...pair].sort((a, b) => (a.id < b.id ? -1 : 1));
    const name = names.get(pairId);
    if (!name) throw new Error(`${pairId}: no line-names record`);
    if (!spec.kinds[name.line_kind]) throw new Error(`${pairId}: line kind ${name.line_kind} has no profile spec`);
    for (const row of [forward, reverse]) if (!minutes.has(row.id)) throw new Error(`${row.id}: no place-geo minutes`);
    included.push({ forward, reverse, name });
  }
  const datasets = Object.fromEntries(Object.values(T).map((table) => [table, []]));
  const usedKinds = [...new Set(included.map(({ name }) => name.line_kind))];
  // The profile set covers every kind of the spec: a kind without a line today still has its profile (one approved profile per kind).
  const kinds = Object.keys(spec.kinds).sort();
  const unresolved = [];
  const need = (set, id, what) => { if (set && !set.has(id)) unresolved.push(`${what} ${id}`); };
  for (const kind of kinds) {
    const k = spec.kinds[kind];
    const cost = { id: `cost.line_${kind}`, version: 1, world_revision_id: worldRevisionId, baseline_movement_method_id: k.method,
      base_minutes: null, dynamic_modifiers_required: existing.costProfiles?.get(k.cost_template)?.dynamic_modifiers_required ?? null,
      calibration_kind: 'minutes_on_line', distance_derived: null, measured_historical_duration: false,
      definition: `${kind}: method and options of the line kind; minutes live on the line (binding base_minutes)`,
      status: 'approved', provenance_ref: provenanceRef };
    datasets[T.costProfiles].push(sealed(cost));
    datasets[T.costOptions].push({ profile_id: cost.id, profile_version: 1, movement_method_id: k.method, cost_mode: 'baseline',
      factor_numerator: null, factor_denominator: null });
    if (k.new_environment_from) {
      const template = existing.environments?.get(k.new_environment_from);
      datasets[T.environments].push(sealed({ ...(template ?? {}), id: k.environment, version: 1, world_revision_id: worldRevisionId,
        definition: `${kind}: authored for m2c-lines-v1 as a copy of ${k.new_environment_from} (assumption, no open-water record exists)`,
        status: 'approved', provenance_ref: provenanceRef }));
    } else need(existing.environments && new Set(existing.environments.keys()), k.environment, 'environment');
    need(existing.orientations, k.orientation, 'orientation'); need(existing.rechecks, k.recheck, 'recheck policy');
    if (!existing.externalDependencies?.has(k.route_kind)) throw new Error(`no external dependency pin for route kind ${k.route_kind}`);
    const profile = sealed({ id: `lkp__${kind}`, version: 1, world_revision_id: worldRevisionId, line_kind_id: kind,
      transition_environment_profile_id: k.environment, transition_environment_profile_version: 1,
      topological_orientation_profile_id: k.orientation, topological_orientation_profile_version: 1,
      baseline_movement_method_id: k.method, movement_method_cost_profile_id: cost.id, movement_method_cost_profile_version: 1,
      dynamic_recheck_policy_id: k.recheck, dynamic_recheck_policy_version: 1, route_kind_id: k.route_kind,
      status: 'approved', provenance_ref: provenanceRef });
    datasets[T.profiles].push(profile);
    for (const alt of k.alternatives) {
      datasets[T.alternatives].push({ profile_id: profile.id, profile_version: 1, movement_method_id: alt.method,
        risk_class: alt.risk_class, hazard_rule_ref: alt.hazard_rule_ref });
      datasets[T.costOptions].push({ profile_id: cost.id, profile_version: 1, movement_method_id: alt.method,
        cost_mode: 'rational_factor', factor_numerator: alt.factor[0], factor_denominator: alt.factor[1] });
    }
  }
  const ends = { forward: { from: 'departure', to: 'arrival' }, reverse: { from: 'arrival', to: 'departure' } };
  for (const { forward, reverse, name } of included) {
    for (const [side, row] of [['forward', forward], ['reverse', reverse]]) {
      const other = side === 'forward' ? reverse : forward;
      slotCounts[side === 'forward' ? 'forward_kept' : 'reverse_swapped'] += 1;
      datasets[T.bindings].push({ id: row.id, version: VERSION, parent_g4_id: row.parent_g4_id, parent_g4_version: row.parent_g4_version,
        from_canonical_g5_id: row.from_canonical_g5_id, from_canonical_g5_version: row.from_canonical_g5_version,
        to_canonical_g5_id: row.to_canonical_g5_id, to_canonical_g5_version: row.to_canonical_g5_version,
        line_kind_profile_id: `lkp__${name.line_kind}`, line_kind_profile_version: 1, line_name: name.name_ru,
        base_minutes: minutes.get(row.id), capacity_semantics_ref: spec.binding_defaults.capacity_semantics_ref,
        risk_profile_ref: spec.kinds[name.line_kind].risk,
        availability_condition_set_ref: spec.binding_defaults.availability_condition_set_ref,
        from_scene_endpoint_slot_key: ends[side].from, to_scene_endpoint_slot_key: ends[side].to,
        reverse_binding_id: other.id, reverse_binding_version: VERSION, source_pair_id: row.source_pair_id,
        source_pair_version: row.source_pair_version, status: 'approved', provenance_ref: provenanceRef });
    }
  }
  const rows = datasets[T.bindings];
  datasets[T.versions].push(...rows.map((row) => version('canonical_g5_connection_binding', row, worldRevisionId)),
    ...datasets[T.profiles].map((row) => version('line_kind_profile', row, worldRevisionId)),
    ...datasets[T.costProfiles].map((row) => version('movement_method_cost_profile', row, worldRevisionId)),
    ...datasets[T.environments].map((row) => version('transition_environment_profile', row, worldRevisionId)));
  const pinOf = (target) => {
    if (target.kind !== 'external_dependency') return {};
    const pin = existing.externalDependencies.get(target.id);
    return { target_registry_type: pin.registry_type, target_registry_id: pin.registry_id, target_registry_version: pin.registry_version,
      target_registry_digest: pin.registry_digest, target_dependency_digest: pin.dependency_digest };
  };
  const edge = (source, role, target) => ({ source_entity_kind: source.kind, source_entity_id: source.id, source_version: source.version,
    world_revision_id: worldRevisionId, dependency_role: role, target_entity_kind: target.kind, target_entity_id: target.id,
    target_version: target.version, canonical_ordinal: 0, provenance_ref: provenanceRef, ...pinOf(target) });
  for (const row of rows) {
    const source = { kind: 'canonical_g5_connection_binding', id: row.id, version: VERSION };
    datasets[T.edges].push(edge(source, 'from_canonical_g5', { kind: 'spatial_node', id: row.from_canonical_g5_id, version: row.from_canonical_g5_version }),
      edge(source, 'parent_g4', { kind: 'spatial_node', id: row.parent_g4_id, version: row.parent_g4_version }),
      edge(source, 'to_canonical_g5', { kind: 'spatial_node', id: row.to_canonical_g5_id, version: row.to_canonical_g5_version }));
  }
  for (const row of datasets[T.profiles]) {
    const source = { kind: 'line_kind_profile', id: row.id, version: 1 };
    datasets[T.edges].push(edge(source, 'transition_environment', { kind: 'transition_environment_profile', id: row.transition_environment_profile_id, version: 1 }),
      edge(source, 'movement_method_cost', { kind: 'movement_method_cost_profile', id: row.movement_method_cost_profile_id, version: 1 }),
      edge(source, 'dynamic_recheck', { kind: 'dynamic_recheck_policy', id: row.dynamic_recheck_policy_id, version: 1 }),
      edge(source, 'route_kind', { kind: 'external_dependency', id: row.route_kind_id, version: 1 }));
  }
  datasets[T.sources].push({ id: provenanceRef, title: 'M2c lines v1 candidate (local G5-G5 lines of the start cell)', source_type: 'project_note',
    file_reference: `${LINE_WAVE_DIR}/generator-report.json`, page_or_section: 'inputs: see generator-report.json#inputs',
    summary: 'Line fields of the local canonical connections: place-geo proposed minutes, line-names names and kinds, registry v5 methods.',
    limitations: 'Candidate: not approved, not imported; minutes are an authored game map, not a measurement of 1230; long lines are sliced by the recheck policy of their kind (D56).',
    status: 'approved', confidence: 'medium', checked_by: 'pending_opus_data_approval' });
  const report = reportOf({ bindings, included, slotCounts, minutes, spec, derivedLines, unresolved,
    sliceStepMinutes, usedKinds, datasets, lineNames, existing });
  return { datasets, report };
}

function reportOf({ bindings, included, slotCounts, minutes, spec, derivedLines, unresolved, sliceStepMinutes, usedKinds, datasets, lineNames, existing }) {
  const nodes = new Set(bindings.flatMap((row) => [row.from_canonical_g5_id, row.to_canonical_g5_id]));
  const components = (rows) => {
    const adjacent = new Map([...nodes].map((node) => [node, new Set()]));
    for (const row of rows) { adjacent.get(row.from_canonical_g5_id).add(row.to_canonical_g5_id); adjacent.get(row.to_canonical_g5_id).add(row.from_canonical_g5_id); }
    const seen = new Set(); let count = 0;
    for (const node of nodes) {
      if (seen.has(node)) continue;
      count += 1; const stack = [node]; seen.add(node);
      while (stack.length) for (const next of adjacent.get(stack.pop())) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    return { count, without: [...nodes].filter((node) => adjacent.get(node).size === 0).sort() };
  };
  const kept = datasets.spatial_v3_canonical_g5_connection_bindings;
  const before = components(bindings); const after = components(kept);
  const pairOf = new Map(included.map((item) => [item.name.source_pair_id, item]));
  const moved = lineNames.local_pairs.filter((pair) => pairOf.has(pair.source_pair_id))
    .map((pair) => ({ a: minutes.get(pairOf.get(pair.source_pair_id).forward.id), b: pair.base_minutes }));
  const kindOfDerived = new Map(derivedLines.map((line) => [line.id, line.movement_class]));
  const kindMismatch = included.filter((item) => kindOfDerived.get(item.forward.id) !== item.name.line_kind).length;
  const alternatives = Object.entries(spec.kinds).flatMap(([kind, value]) => value.alternatives.map((alt) => ({ kind, method: alt.method,
    factor: alt.factor.join('/'), risk_class: alt.risk_class, hazard_rule_ref: alt.hazard_rule_ref, basis: alt.basis })));
  const kindOfRow = new Map(kept.map((row) => [row.id, row.line_kind_profile_id.replace(/^lkp__/, '')]));
  const longLines = kept.filter((row) => row.base_minutes > sliceStepMinutes).map((row) => {
    const policyId = spec.kinds[kindOfRow.get(row.id)].recheck;
    const policy = existing.rechecks?.get?.(policyId) ?? null;
    return { id: row.id, line_kind: kindOfRow.get(row.id), line_name: row.line_name, minutes: row.base_minutes, slice_step_minutes: sliceStepMinutes,
      recheck_policy_id: policyId, recheck_policy_kind: policy?.policy_kind ?? null, recheck_interval_minutes: policy?.interval_minutes ?? null,
      recheck_progress_slice_ppm: policy?.progress_slice_ppm ?? null, slices: policy ? policySlices(row.base_minutes, policy) : null };
  });
  const names = similarNamesPerPlace(kept);
  return { schema: 'rus.m2c_lines_v1_generator_report.v1', status: 'candidate_unapproved', import_authorized: false, activation_authorized: false,
    parameters: { slice_step_minutes: sliceStepMinutes },
    counts: { base_bindings: bindings.length, pairs: included.length, bindings_at_v3: kept.length, long_lines: longLines.length,
      line_kinds_with_profile: datasets.spatial_v3_line_kind_profiles.length, line_kinds_used: usedKinds.length,
      alternative_methods: datasets.spatial_v3_line_kind_alternative_methods.length,
      authoring_versions: datasets.spatial_v3_authoring_versions.length, dependency_edges: datasets.spatial_v3_authoring_dependency_edges.length },
    // D56: a line longer than the step is kept and sliced by the recheck policy of its kind (the existing policies are fixed_time_interval of 15/30 minutes).
    long_lines: longLines,
    connectivity: { components_before: before.count, components_after: after.count, places_without_local_line: after.without.filter((id) => !before.without.includes(id)) },
    matches: { minutes_from_place_geo: kept.length, slot_changes: slotCounts, line_kind_equals_place_geo_movement_class: included.length - kindMismatch,
      line_name_unique_per_place: 'checked by checkLineWaveData; 0 digits, 0 ordinal words, 0 duplicate (name, discriminator, direction) and 0 identical content-word sets per place',
      similar_but_distinct_names_at_one_place: names.similar },
    differences: { line_kind_differs_from_place_geo_movement_class: kindMismatch, forward_slots_departure_to_arrival_in_source: 'all 454 (both directions): the source violates the paired-slot rule (F :7371); binding@3 swaps the reverse side',
      line_names_minutes_vs_place_geo: { lines: moved.length, differ_at_least_2x: moved.filter(({ a, b }) => a >= 2 * b || b >= 2 * a).length, differ_10_minutes_or_more: moved.filter(({ a, b }) => Math.abs(a - b) >= 10).length,
        note: 'informational: D1 takes the place-geo minutes; line-names minutes are not approved (their attestation, D56)' } },
    unresolved_refs: unresolved.sort(),
    editorial_values_for_opus: alternatives,
    assumptions_for_opus: Object.entries(spec.kinds).filter(([, value]) => value.assumption).map(([kind, value]) => `${kind}: ${value.assumption}`),
    open_items: ['D3: availability_condition_set_ref is null on every binding; the norm (F binding block :7340) still says required, corrected by CORPUS_EDIT in the cutover',
      'D56: the ceiling of 30 minutes and the profile field max_segment_minutes are removed from the norm by CORPUS_EDIT before the DDL (PLAN-OK-rt-lines-a3); slicing is the recheck policy of the kind, the slice step (30) is one rule of the world',
      'D5: method ids are registry v5 values; movement_method_map in line-kind-spec.json is the table movement.* -> movement_method.* for Opus',
      'D6: hazard_rule_ref values are references without records; the external pin needs a registry version (owner question, no record exists)',
      'rows carry status approved (the importer requires it); approval is the a2 data attestation, none exists yet',
      'new tables and columns (line_kind_profile, alternatives, binding line fields) do not exist in world_base DDL yet (phase a3); no import manifest is produced in a1',
      'risk_profile_ref: refs of the route-segment profiles by kind; yard and open_water are assumptions',
      'line-names attestation limits: the loader needs the near-duplicate check (done in checkLineWaveData); line_kind of large_island_head_1/_2/_cycle (river_channel) vs _5 (side_channel) on one still body is inconsistent (place-geo limit 7); names depend on the place-geo geometry of 86977f99 (owner_findings.spatial)'] };
}

/** Independent rules of Appendix F (binding block :7340, line_kind_profile :7291, §4.7.2) over generated datasets. */
export function checkLineWaveData(datasets, { spec, recheckPolicies = null, sliceStepMinutes = DEFAULT_SLICE_STEP_MINUTES } = {}) {
  const problems = [];
  const stepProblem = sliceStepProblem(sliceStepMinutes);
  if (stepProblem) return [stepProblem];
  const rows = datasets[T.bindings]; const byId = new Map(rows.map((row) => [row.id, row]));
  const profiles = new Map(datasets[T.profiles].map((row) => [row.id, row]));
  const kinds = datasets[T.profiles].map((row) => row.line_kind_id);
  if (new Set(kinds).size !== kinds.length) problems.push('line_kind_profile: one approved profile per line kind');
  for (const profile of datasets[T.profiles]) {
    if (!datasets[T.costProfiles].some((cost) => cost.id === profile.movement_method_cost_profile_id)) problems.push(`${profile.id}: cost profile missing`);
    const k = spec.kinds[profile.line_kind_id];
    const alternatives = datasets[T.alternatives].filter((alt) => alt.profile_id === profile.id);
    if (alternatives.length !== k.alternatives.length) problems.push(`${profile.id}: alternatives differ from the spec`);
    if (['river_channel', 'side_channel', 'open_water', 'ford', 'ferry'].includes(profile.line_kind_id) && !alternatives.some((alt) => ['movement_method.swim', 'movement_method.wade'].includes(alt.movement_method_id))) problems.push(`${profile.id}: a water kind needs an alternative without transport`);
    for (const alt of alternatives) {
      if (alt.movement_method_id === profile.baseline_movement_method_id) problems.push(`${profile.id}: alternative equals the baseline`);
      if (!datasets[T.costOptions].some((option) => option.profile_id === profile.movement_method_cost_profile_id && option.movement_method_id === alt.movement_method_id && option.cost_mode === 'rational_factor')) problems.push(`${profile.id}: alternative ${alt.movement_method_id} is not a rational_factor option`);
    }
  }
  const outgoing = new Map();
  for (const row of rows) {
    const profile = profiles.get(row.line_kind_profile_id);
    if (!profile) problems.push(`${row.id}: line_kind_profile ${row.line_kind_profile_id} missing`);
    if (row.version !== VERSION) problems.push(`${row.id}: version ${row.version}`);
    const name = row.line_name;
    if (typeof name !== 'string' || name.trim() === '') problems.push(`${row.id}: line_label_invalid empty`);
    else {
      if (/\d/u.test(name)) problems.push(`${row.id}: line_label_invalid digit in "${name}"`);
      if (ORDINAL.test(name)) problems.push(`${row.id}: line_label_invalid ordinal word in "${name}"`);
    }
    if (!Number.isInteger(row.base_minutes) || row.base_minutes < 1) problems.push(`${row.id}: base_minutes ${row.base_minutes} is not a positive integer`);
    else if (profile && row.base_minutes > sliceStepMinutes) {
      // D56: no length ceiling; a line longer than the slice step needs a policy that slices it.
      const policy = recheckPolicies?.get(profile.dynamic_recheck_policy_id);
      const bad = policyProblem(policy);
      // The numbers are checked before they are compared: null <= 30 is true in JS.
      const sliced = bad == null && (policy.policy_kind === 'fixed_time_interval' ? policy.interval_minutes <= sliceStepMinutes
        : row.base_minutes * policy.progress_slice_ppm <= sliceStepMinutes * 1_000_000);
      if (!recheckPolicies) problems.push(`line_recheck_slicing_missing ${row.id}: ${row.base_minutes} min over the ${sliceStepMinutes}-minute step and no recheck policies supplied`);
      else if (!sliced) problems.push(`line_recheck_slicing_missing ${row.id}: ${row.base_minutes} min over the ${sliceStepMinutes}-minute step, recheck ${profile.dynamic_recheck_policy_id}: ${bad ?? `slices of more than ${sliceStepMinutes} minutes`}`);
    }
    if (row.availability_condition_set_ref !== null) problems.push(`${row.id}: availability_condition_set_ref must be null on a non-portal connection (D3)`);
    const key = [row.from_canonical_g5_id, row.line_name, row.line_discriminator ?? '', row.line_direction_id ?? ''].join('|');
    outgoing.set(key, (outgoing.get(key) ?? 0) + 1);
    const reverse = byId.get(row.reverse_binding_id);
    if (!reverse) { problems.push(`${row.id}: reverse binding ${row.reverse_binding_id} missing`); continue; }
    if (row.reverse_binding_version !== reverse.version || reverse.version !== VERSION) problems.push(`${row.id}: reverse_binding_version must be @3 (the reverse row)`);
    if (reverse.reverse_binding_id !== row.id) problems.push(`${row.id}: reverse is not reciprocal`);
    if (reverse.line_name !== row.line_name) problems.push(`${row.id}: reverse line_name differs`);
    if (reverse.line_kind_profile_id !== row.line_kind_profile_id) problems.push(`${row.id}: reverse line kind differs`);
    if (reverse.from_canonical_g5_id !== row.to_canonical_g5_id || reverse.to_canonical_g5_id !== row.from_canonical_g5_id) problems.push(`${row.id}: reverse does not swap the places`);
    if (reverse.from_scene_endpoint_slot_key !== row.to_scene_endpoint_slot_key || reverse.to_scene_endpoint_slot_key !== row.from_scene_endpoint_slot_key) problems.push(`${row.id}: paired-slot rule (reverse.from = forward.to) violated`);
    if (reverse.source_pair_id !== row.source_pair_id) problems.push(`${row.id}: reverse belongs to another pair`);
  }
  for (const [key, count] of outgoing) if (count > 1) problems.push(`line_label_duplicate ${key}`);
  for (const pair of similarNamesPerPlace(rows).identical) problems.push(`line_label_near_duplicate ${pair}`);
  const versions = new Map(datasets[T.versions].map((row) => [`${row.entity_kind}|${row.entity_id}|${row.version}`, row]));
  if (recheckPolicies) {
    for (const profile of datasets[T.profiles]) {
      const bad = policyProblem(recheckPolicies.get(profile.dynamic_recheck_policy_id));
      // a kind whose policy is a slicing kind must have valid numbers even when no line of the kind is long
      const policy = recheckPolicies.get(profile.dynamic_recheck_policy_id);
      if (bad && ['fixed_time_interval', 'fixed_progress_slices'].includes(policy?.policy_kind)) problems.push(`line_recheck_slicing_missing ${profile.id}: recheck ${profile.dynamic_recheck_policy_id}: ${bad}`);
    }
  }
  const covered = [['canonical_g5_connection_binding', rows], ['line_kind_profile', datasets[T.profiles]], ['movement_method_cost_profile', datasets[T.costProfiles]], ['transition_environment_profile', datasets[T.environments]]];
  for (const [kind, list] of covered) for (const row of list) {
    const entry = versions.get(`${kind}|${row.id}|${row.version}`);
    if (!entry) problems.push(`${kind} ${row.id}: no authoring version`);
    else if (entry.canonical_digest !== digest(row)) problems.push(`${kind} ${row.id}: digest mismatch`);
  }
  for (const edge of datasets[T.edges]) {
    if (edge.target_entity_kind !== 'external_dependency') continue;
    if (['target_registry_type', 'target_registry_id', 'target_registry_version', 'target_registry_digest', 'target_dependency_digest'].some((key) => !edge[key])) {
      problems.push(`${edge.source_entity_id}: external_dependency edge to ${edge.target_entity_id} lacks the registry pin`);
    }
  }
  for (const row of rows) {
    const roles = datasets[T.edges].filter((edge) => edge.source_entity_id === row.id && edge.source_version === VERSION).map((edge) => edge.dependency_role).sort().join();
    if (roles !== 'from_canonical_g5,parent_g4,to_canonical_g5') problems.push(`${row.id}: dependency edges ${roles}`);
  }
  return problems;
}

// The import bundle (PLAN-rt-lines-a3 a4): own datasets plus the two unchanged closure datasets the importer validates against
// (nodes: the G5/G4 targets of the edges; external dependency versions: the pins of the route-kind edges). Insert-only: rows of
// earlier versions stay in the database as they are. Status draft until the a2 data attestation exists.
const MANIFEST_TABLES = [
  ['source_records', 'own', []],
  ['spatial_v3_authoring_versions', 'own', ['source_records']],
  ['spatial_v3_nodes', 'closure', ['source_records', 'spatial_v3_authoring_versions']],
  ['spatial_v3_external_dependency_versions', 'closure', []],
  ['spatial_v3_transition_environment_profiles', 'own', ['spatial_v3_authoring_versions']],
  ['spatial_v3_movement_method_cost_profiles', 'own', ['spatial_v3_authoring_versions']],
  ['spatial_v3_movement_method_cost_options', 'own', ['spatial_v3_movement_method_cost_profiles']],
  ['spatial_v3_line_kind_profiles', 'own', ['spatial_v3_authoring_versions', 'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles']],
  ['spatial_v3_line_kind_alternative_methods', 'own', ['spatial_v3_line_kind_profiles']],
  ['spatial_v3_canonical_g5_connection_bindings', 'own', ['spatial_v3_line_kind_profiles', 'spatial_v3_nodes']],
  ['spatial_v3_authoring_dependency_edges', 'own', ['source_records', 'spatial_v3_authoring_versions', 'spatial_v3_external_dependency_versions']]
];

export function buildImportManifest({ ownBytes, baseManifest, baseBytes, worldRevisionId }) {
  const closure = new Map(baseManifest.datasets.map((entry) => [entry.table, entry]));
  return { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_kind: 'dependency_closure',
    bundle_id: 'novgorod_m2c_lines_v1_import', world_revision_id: worldRevisionId, status: 'draft',
    provenance_ref: `${LINE_WAVE_DIR}/generator-report.json`, delete_policy: 'forbid', data_gaps: [],
    datasets: MANIFEST_TABLES.map(([table, kind, dependsOn]) => {
      if (kind === 'own') {
        return { table, file: `${LINE_WAVE_DIR.slice(CATALOG.length + 1)}/datasets/${table}.json`, sha256: sha(ownBytes.get(table)),
          status: 'draft', provenance_ref: PROVENANCE, delete_policy: 'forbid', depends_on: dependsOn };
      }
      const entry = closure.get(table);
      if (!entry || sha(baseBytes.get(table)) !== entry.sha256) throw new Error(`${table}: the closure dataset differs from the active bundle manifest`);
      return { table, file: `${BASE_DIR.slice(CATALOG.length + 1)}/${entry.file}`, sha256: entry.sha256, status: entry.status,
        provenance_ref: entry.provenance_ref, delete_policy: 'forbid', depends_on: dependsOn };
    }) };
}

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const readBytes = (path) => readFileSync(resolve(root, path));

export function loadInputs({ lineNamesPath = LINE_NAMES_PATH } = {}) {
  const all = readJson(`${BASE}/spatial_v3_canonical_g5_connection_bindings.json`);
  const latest = new Map();
  for (const row of all) if ((latest.get(row.id)?.version ?? 0) < row.version) latest.set(row.id, row);
  const authoring = readJson(`${BASE}/spatial_v3_authoring_versions.json`);
  const worldRevisionId = authoring.find((row) => row.entity_kind === 'canonical_g5_connection_binding').world_revision_id;
  const table = (name) => readJson(`${BASE}/${name}.json`);
  const external = table('spatial_v3_external_dependency_versions');
  const inputs = {
    bindings: [...latest.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), worldRevisionId,
    derivedLines: readJson(DERIVED_PATH).lines.filter((line) => line.kind === 'g5_connection'),
    lineNames: readJson(lineNamesPath), spec: readJson(`${LINE_WAVE_DIR}/line-kind-spec.json`),
    existing: { environments: new Map(table('spatial_v3_transition_environment_profiles').map((row) => [row.id, row])),
      costProfiles: new Map(table('spatial_v3_movement_method_cost_profiles').map((row) => [row.id, row])),
      orientations: new Set(table('spatial_v3_topological_movement_orientation_profiles').map((row) => row.id)),
      rechecks: new Map(table('spatial_v3_dynamic_recheck_policies').map((row) => [row.id, row])),
      externalDependencies: new Map(external.map((row) => [row.dependency_id, row])) } };
  const hashes = { base_bindings: `${BASE}/spatial_v3_canonical_g5_connection_bindings.json`, place_geo_derived_report: DERIVED_PATH,
    line_names_candidate: lineNamesPath, line_kind_spec: `${LINE_WAVE_DIR}/line-kind-spec.json` };
  return { inputs, hashes: Object.fromEntries(Object.entries(hashes).map(([key, path]) => [key, sha(readBytes(path))])) };
}

/** Writes (or with check:true compares) datasets and report; the report names the inputs by sha256, not by path. */
export async function runLineWave({ check = false, lineNamesPath = LINE_NAMES_PATH, sliceStepMinutes } = {}) {
  const { inputs, hashes } = loadInputs({ lineNamesPath });
  const { datasets, report } = buildLineWave(inputs, sliceStepMinutes == null ? undefined : { sliceStepMinutes });
  const problems = checkLineWaveData(datasets, { spec: inputs.spec, recheckPolicies: inputs.existing.rechecks, sliceStepMinutes: report.parameters.slice_step_minutes });
  if (problems.length) throw new Error(`line wave violates its rules:\n${problems.slice(0, 20).join('\n')}`);
  const ownBytes = new Map(Object.entries(datasets).map(([name, rows]) => [name, Buffer.from(`${JSON.stringify(rows, null, 2)}\n`)]));
  const baseManifest = readJson(`${BASE_DIR}/import-manifest.json`);
  const baseBytes = new Map(baseManifest.datasets.filter((entry) => ['spatial_v3_nodes', 'spatial_v3_external_dependency_versions'].includes(entry.table))
    .map((entry) => [entry.table, readBytes(`${BASE_DIR}/${entry.file}`)]));
  const manifest = buildImportManifest({ ownBytes, baseManifest, baseBytes, worldRevisionId: inputs.worldRevisionId });
  const outputs = [...Object.entries(datasets).map(([name]) => [`${LINE_WAVE_DIR}/datasets/${name}.json`, ownBytes.get(name).toString('utf8')]),
    [`${LINE_WAVE_DIR}/generator-report.json`, `${JSON.stringify({ ...report, inputs: hashes }, null, 2)}\n`],
    [LINES_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`]];
  for (const [path, bytes] of outputs) {
    if (check) { if (readFileSync(resolve(root, path), 'utf8') !== bytes) throw new Error(`${path} is stale: rerun build-line-wave.mjs`); }
    else { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), bytes); }
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const arg = (flag) => { const at = process.argv.indexOf(flag); return at < 0 ? undefined : process.argv[at + 1]; };
  // A flag that is present must carry a valid value: no silent default for a mistyped step.
  const report = await runLineWave({ check: process.argv.includes('--check'), lineNamesPath: arg('--line-names') ?? LINE_NAMES_PATH,
    sliceStepMinutes: process.argv.includes('--slice-step-minutes') ? Number(arg('--slice-step-minutes')) : undefined });
  console.log(JSON.stringify({ counts: report.counts, connectivity: report.connectivity }));
}
