import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildCandidate, composeExitLineLabel, deriveExitLineLabels } from './derive.mjs';
import { approvedExitLineLabelsFromAttestation, loadApprovedExitLineLabels } from './approved-labels.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
const readRepo = (relative) => JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
const candidate = read('./candidate.json');
const lineNames = read('../m2c-line-names/candidate.json');
const source = {
  routes: read('../spatial-v3/datasets/spatial_v3_world_routes.json'),
  segments: read('../spatial-v3/datasets/spatial_v3_world_route_segments.json'),
  endpoints: read('../spatial-v3/datasets/spatial_v3_world_route_endpoint_bindings.json'),
  exits: read('../spatial-v3/datasets/spatial_v3_g4_directional_exits.json'),
  directionContexts: read('../spatial-v3/datasets/spatial_v3_topological_direction_contexts.json')
};
const exitLabels = read('../m2c-exit-labels/candidate.json');
const exitLabelsById = new Map(exitLabels.labels.map((row) => [row.directional_exit_ref.id, row]));
const approval = read('./approval-attestation.json');

test('reader activates exactly the 70 rows approved by the limited Opus attestation', () => {
  const candidateBytes = readFileSync(new URL('./candidate.json', import.meta.url));
  const loaded = loadApprovedExitLineLabels();
  assert.equal(approval.decision, 'APPROVE_WITH_LIMITS');
  assert.equal(loaded.size, 70);
  const versionByExit = new Map(candidate.labels.map((row) =>
    [row.directional_exit_ref.id, row.directional_exit_ref.version]));
  assert.deepEqual([...loaded.keys()].sort(), approval.approved_rows.map((row) =>
    `${row.directional_exit_id}@${versionByExit.get(row.directional_exit_id)}`).sort());
  for (const row of approval.withheld_rows.rows) {
    assert.equal(loaded.has(`${row.directional_exit_id}@${versionByExit.get(row.directional_exit_id)}`), false);
  }
  assert.equal(approvedExitLineLabelsFromAttestation(candidateBytes,
    { ...approval, candidate_sha256: '0'.repeat(64) }), null);
});

test('candidate remains pending and pins approved inputs', () => {
  assert.equal(candidate.status, 'candidate_approval_pending');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.approval_boundary.required,
    'separate_data_approval_for_this_candidate_hash_and_all_86_labels');
  assert.deepEqual(candidate.approval_boundary.approval_does_not_authorize,
    ['world_base_import', 'general_rt_lines_cutover']);
  assert.match(candidate.approval_boundary.runtime_activation, /only after.*approval attestation exists/u);
  assert.match(candidate.approval_boundary.label_scope, /optional line_discriminator.*optional line_direction_id/u);
  assert.equal(candidate.source_pins.line_names_candidate_sha256,
    createHash('sha256').update(readFileSync(new URL('../m2c-line-names/candidate.json', import.meta.url))).digest('hex'));
  assert.equal(candidate.labels.length, 86);
  assert.equal(candidate.v17_coverage_by_place.exit_count, 86);
  assert.equal(candidate.v17_coverage_by_place.hidden_exit_count, 0);
  assert.equal(candidate.v17_coverage_by_place.places.length, 46);
  assert.ok(candidate.v17_coverage_by_place.places.every((row) => row.hidden_exit_count === 0));
});

test('every approved route maps through its exact from binding to one approved exit and line name', () => {
  const routes = new Map(source.routes.map((row) => [row.id, row]));
  const endpoints = new Map(source.endpoints.filter((row) => row.endpoint_role === 'from')
    .map((row) => [`${row.world_route_id}@${row.world_route_version}`, row]));
  const labelsByExit = new Map(candidate.labels.map((row) => [row.directional_exit_ref.id, row]));
  assert.equal(labelsByExit.size, 86);
  for (const pair of lineNames.world_routes) {
    assert.equal(pair.world_route_ids.length, 2);
    for (const routeId of pair.world_route_ids) {
      const route = routes.get(routeId);
      const from = endpoints.get(`${route.id}@${route.version}`);
      const exit = source.exits.find((row) => row.id === from.directional_exit_id
        && row.version === from.directional_exit_version);
      const label = labelsByExit.get(exit.id);
      assert.equal(route.status, 'approved');
      assert.equal(from.status, 'approved');
      assert.equal(exit.status, 'approved');
      assert.equal(exit.exit_kind, 'world_route_exit');
      assert.equal(exit.exit_canonical_g5_id, from.canonical_g5_id);
      assert.equal(label.line_name, pair.name_ru);
      assert.equal(label.line_discriminator, null);
      assert.equal(label.line_direction_id, null);
      assert.equal(label.display_label,
        composeExitLineLabel({ line_name: pair.name_ru,
          line_discriminator: label.line_discriminator,
          line_direction_id: label.line_direction_id }));
      assert.deepEqual(label.world_route_ref, { id: route.id, version: route.version });
      assert.deepEqual(label.from_endpoint_binding_ref, { id: from.id, version: from.version });
      assert.equal(label.route_pair_id, pair.route_pair_id);
      assert.doesNotMatch(label.display_label, /[0-9]|—\s*выход\s+\d+/iu);
    }
  }
});

test('route pair reversals swap canonical endpoints and share approved name', () => {
  const routes = new Map(source.routes.map((row) => [row.id, row]));
  const endpoints = new Map(source.endpoints.map((row) =>
    [`${row.world_route_id}@${row.world_route_version}:${row.endpoint_role}`, row]));
  for (const pair of lineNames.world_routes) {
    const [forwardId, reverseId] = pair.world_route_ids;
    const forward = routes.get(forwardId);
    const reverse = routes.get(reverseId);
    assert.equal(forward.reverse_route_id, reverse.id);
    assert.equal(reverse.reverse_route_id, forward.id);
    assert.equal(endpoints.get(`${forwardId}@${forward.version}:from`).canonical_g5_id,
      endpoints.get(`${reverseId}@${reverse.version}:to`).canonical_g5_id);
    assert.equal(endpoints.get(`${forwardId}@${forward.version}:to`).canonical_g5_id,
      endpoints.get(`${reverseId}@${reverse.version}:from`).canonical_g5_id);
    assert.equal(candidate.labels.find((row) => row.world_route_ref.id === forwardId).display_label,
      candidate.labels.find((row) => row.world_route_ref.id === reverseId).display_label);
  }
});

test('all named routes have one approved first segment; derived labels remain unique at each source G5', () => {
  const labelNamesBySource = new Map();
  for (const row of candidate.labels) {
    const routeSegments = source.segments.filter((segment) =>
      segment.world_route_id === row.world_route_ref.id
      && segment.world_route_version === row.world_route_ref.version);
    assert.equal(routeSegments.length, 1);
    assert.equal(routeSegments[0].status, 'approved');
    const original = exitLabelsById.get(row.directional_exit_ref.id);
    const exit = source.exits.find((item) => item.id === row.directional_exit_ref.id
      && item.version === row.directional_exit_ref.version);
    const key = `${exit.exit_canonical_g5_id}|${row.display_label}`;
    assert.equal(labelNamesBySource.has(key), false, key);
    labelNamesBySource.set(key, row.directional_exit_ref.id);
    assert.equal(row.editorial_choice_ordinal, original.editorial_choice_ordinal);
    assert.equal(row.visibility_rule, original.visibility_rule);
  }
});

test('candidate exactly matches deterministic derivation and current data pins', () => {
  assert.deepEqual(candidate, buildCandidate());
  assert.equal(candidate.labels.length, exitLabels.labels.length);
  assert.deepEqual(new Set(candidate.labels.map((row) => row.directional_exit_ref.id)),
    new Set(exitLabels.labels.map((row) => row.directional_exit_ref.id)));
  const hashes = candidate.source_pins;
  assert.equal(hashes.world_route_endpoint_bindings_sha256,
    createHash('sha256').update(readFileSync(new URL('../spatial-v3/datasets/spatial_v3_world_route_endpoint_bindings.json', import.meta.url))).digest('hex'));
  assert.equal(hashes.g4_directional_exits_sha256,
    createHash('sha256').update(readFileSync(new URL('../spatial-v3/datasets/spatial_v3_g4_directional_exits.json', import.meta.url))).digest('hex'));
});

test('line-label composition uses only supplied components and explicit directions', () => {
  assert.equal(composeExitLineLabel({ line_name: 'по глинистой тропе',
    line_discriminator: 'к броду', line_direction_id: 'north' }),
  'по глинистой тропе к броду на север');
  assert.equal(composeExitLineLabel({ line_name: 'по реке',
    line_discriminator: null, line_direction_id: null }), 'по реке');
  assert.throws(() => composeExitLineLabel({ line_name: 'по реке',
    line_discriminator: null, line_direction_id: 'left' }), /line_direction_unsupported/u);
});

test('derivation selects the route-side qualifier and only an explicit first-segment direction', () => {
  const input = { lineNames: structuredClone(lineNames), exitLabels,
    ...structuredClone(source), worldRevisionId: candidate.world_revision_id };
  const pair = input.lineNames.world_routes[0];
  pair.qualifier = { from_to: 'к броду', to_from: 'от брода' };
  const route = input.routes.find((row) => row.id === pair.world_route_ids[0]);
  const from = input.endpoints.find((row) => row.world_route_id === route.id
    && row.world_route_version === route.version && row.endpoint_role === 'from');
  const side = from.canonical_g5_id === pair.from_g5_id ? 'from_to' : 'to_from';
  const segment = input.segments.find((row) => row.world_route_id === route.id
    && row.world_route_version === route.version && row.ordinal === 0);
  segment.line_direction_id = 'north';
  const label = deriveExitLineLabels(input).find((row) => row.world_route_ref.id === route.id);
  assert.equal(label.line_discriminator, pair.qualifier[side]);
  assert.equal(label.line_direction_id, 'north');
  assert.equal(label.display_label.endsWith('на север'), true);
});

test('derivation fails closed on ambiguous exit bindings', () => {
  const input = { lineNames, exitLabels, ...structuredClone(source),
    worldRevisionId: candidate.world_revision_id };
  input.endpoints.push({ ...input.endpoints.find((row) => row.endpoint_role === 'from'), id: 'duplicate' });
  assert.throws(() => deriveExitLineLabels(input), /route_endpoint_binding_invalid/u);
});

test('derivation fails closed when route and line name use different reverse pairs', () => {
  const input = { lineNames: structuredClone(lineNames), exitLabels, ...structuredClone(source),
    worldRevisionId: candidate.world_revision_id };
  input.lineNames.world_routes[0].world_route_ids[1] = 'missing_reverse_route';
  assert.throws(() => deriveExitLineLabels(input), /reverse_route_name_missing/u);
});
