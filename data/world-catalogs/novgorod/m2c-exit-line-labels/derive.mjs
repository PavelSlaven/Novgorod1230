import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const readBytes = (relative) => readFileSync(new URL(relative, import.meta.url));
const readJson = (relative) => JSON.parse(readBytes(relative));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const lineNamesPath = 'data/world-catalogs/novgorod/m2c-line-names/candidate.json';
const lineNamesApprovalPath = 'data/world-catalogs/novgorod/m2c-line-names/approval-attestation.json';
const exitLabelsPath = 'data/world-catalogs/novgorod/m2c-exit-labels/candidate.json';
const exitLabelsApprovalPath = 'data/world-catalogs/novgorod/m2c-exit-labels/approval-attestation.json';
const spatialManifestPath = 'data/world-catalogs/novgorod/spatial-v3/manifest.json';
const expansionManifestPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const datasetPaths = Object.freeze({
  routes: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_routes.json',
  segments: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_route_segments.json',
  endpoints: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_route_endpoint_bindings.json',
  exits: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_g4_directional_exits.json',
  directionContexts: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_topological_direction_contexts.json'
});
const datasetPinNames = Object.freeze({
  routes: 'world_routes',
  segments: 'world_route_segments',
  endpoints: 'world_route_endpoint_bindings',
  exits: 'g4_directional_exits',
  directionContexts: 'topological_direction_contexts'
});

function require(condition, reason) {
  if (!condition) throw new Error(`EXIT_LINE_LABEL_SOURCE_INVALID:${reason}`);
}

function uniqueBy(rows, keyOf, reason) {
  const result = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    require(!result.has(key), `${reason}:${key}`);
    result.set(key, row);
  }
  return result;
}

function versionedKey(id, version) { return `${id}@${version}`; }

const DIRECTION_WORDS = Object.freeze({ north: 'на север', northeast: 'на северо-восток',
  east: 'на восток', southeast: 'на юго-восток', south: 'на юг',
  southwest: 'на юго-запад', west: 'на запад', northwest: 'на северо-запад',
  upstream: 'вверх по течению', downstream: 'вниз по течению',
  uphill: 'в гору', downhill: 'под гору', landward: 'к суше', waterward: 'к воде' });

export function composeExitLineLabel({ line_name, line_discriminator, line_direction_id }) {
  require(typeof line_name === 'string' && line_name.trim(), 'line_name_required');
  if (line_discriminator != null) require(typeof line_discriminator === 'string'
    && line_discriminator.trim(), 'line_discriminator_invalid');
  const direction = line_direction_id == null ? null : DIRECTION_WORDS[line_direction_id];
  require(line_direction_id == null || direction != null, 'line_direction_unsupported');
  return [line_name, line_discriminator, direction].filter(Boolean).join(' ');
}

function assertApprovedDatasetManifest(manifest, paths, worldRevisionId, label) {
  require(manifest.status === 'approved' && manifest.world_revision_id === worldRevisionId,
    `${label}_manifest_not_approved`);
  for (const [kind, file] of Object.entries(paths)) {
    const datasetPath = file.slice(file.indexOf('/spatial-v3/') + '/spatial-v3/'.length);
    const record = manifest.datasets.find((row) => row.file === datasetPath);
    require(record?.status === 'approved', `${label}_${kind}_not_approved`);
    require(record.sha256 === sha256(readBytes(`../spatial-v3/${datasetPath}`)),
      `${label}_${kind}_hash_mismatch`);
  }
}

function checkedSources() {
  const lineNamesBytes = readBytes('../m2c-line-names/candidate.json');
  const lineNamesApprovalBytes = readBytes('../m2c-line-names/approval-attestation.json');
  const lineNames = JSON.parse(lineNamesBytes);
  const lineNamesApproval = JSON.parse(lineNamesApprovalBytes);
  require(lineNames.status === 'candidate' && lineNames.approved === false
    && lineNames.activation_authorized === false, 'line_names_candidate_status');
  require(lineNamesApproval.decision === 'APPROVE_WITH_LIMITS'
    && lineNamesApproval.candidate_ref === lineNamesPath
    && lineNamesApproval.candidate_sha256 === sha256(lineNamesBytes)
    && lineNamesApproval.scope.includes('43 G4 world-route pairs')
    && lineNamesApproval.import_authorized === false
    && lineNamesApproval.activation_authorized === false, 'line_names_approval_mismatch');

  const exitLabelsBytes = readBytes('../m2c-exit-labels/candidate.json');
  const exitLabelsApprovalBytes = readBytes('../m2c-exit-labels/approval-attestation.json');
  const exitLabels = JSON.parse(exitLabelsBytes);
  const exitLabelsApproval = JSON.parse(exitLabelsApprovalBytes);
  require(exitLabelsApproval.decision === 'APPROVE_DATA_ONLY'
    && exitLabelsApproval.candidate_ref === `${exitLabels.candidate_id}@${exitLabels.version}`
    && exitLabelsApproval.candidate_sha256 === sha256(exitLabelsBytes), 'exit_label_template_approval_mismatch');
  require(exitLabels.status === 'candidate_approval_pending' && exitLabels.approved === false
    && exitLabels.import_authorized === false && exitLabels.activation_authorized === false,
  'exit_label_template_status');

  const worldRevisionId = exitLabels.world_revision_id;
  require(typeof worldRevisionId === 'string' && worldRevisionId
    && lineNames.scope.includes('43 physical G4 world-route pairs in the v17 start cell'),
  'line_names_world_revision_mismatch');

  const files = Object.fromEntries(Object.entries(datasetPaths).map(([key, file]) => [
    key, readJson(`../spatial-v3/${file.slice(file.indexOf('/spatial-v3/') + '/spatial-v3/'.length)}`)
  ]));
  const spatialManifest = readJson('../spatial-v3/manifest.json');
  const expansionManifest = readJson('../spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json');
  assertApprovedDatasetManifest(spatialManifest, datasetPaths, worldRevisionId, 'spatial_v3');
  assertApprovedDatasetManifest(expansionManifest, datasetPaths, worldRevisionId, 'm2c_g4_expansion');

  return { lineNames, exitLabels, files, worldRevisionId, sourcePins: {
    line_names_candidate_sha256: sha256(lineNamesBytes),
    line_names_approval_sha256: sha256(lineNamesApprovalBytes),
    exit_labels_template_candidate_sha256: sha256(exitLabelsBytes),
    exit_labels_template_approval_sha256: sha256(exitLabelsApprovalBytes),
    spatial_v3_manifest_sha256: sha256(readBytes('../spatial-v3/manifest.json')),
    m2c_g4_expansion_manifest_sha256: sha256(readBytes('../spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json')),
    ...Object.fromEntries(Object.entries(datasetPaths).map(([key, file]) => [
      `${datasetPinNames[key]}_sha256`, sha256(readBytes(`../spatial-v3/${file.slice(file.indexOf('/spatial-v3/') + '/spatial-v3/'.length)}`))
    ]))
  } };
}

export function deriveExitLineLabels({ lineNames, exitLabels, routes, segments,
  endpoints, exits, directionContexts, worldRevisionId }) {
  const routesById = uniqueBy(routes, (row) => row.id, 'duplicate_route_id');
  const exitsByKey = uniqueBy(exits, (row) => versionedKey(row.id, row.version), 'duplicate_exit_ref');
  const contextsByKey = uniqueBy(directionContexts,
    (row) => versionedKey(row.id, row.version), 'duplicate_direction_context_ref');
  const labelsByExit = uniqueBy(exitLabels.labels,
    (row) => versionedKey(row.directional_exit_ref?.id, row.directional_exit_ref?.version),
    'duplicate_exit_label_ref');
  const endpointsByRoute = new Map();
  for (const row of endpoints) {
    const key = versionedKey(row.world_route_id, row.world_route_version);
    endpointsByRoute.set(key, [...(endpointsByRoute.get(key) ?? []), row]);
  }
  const segmentsByRoute = new Map();
  for (const row of segments) {
    const key = versionedKey(row.world_route_id, row.world_route_version);
    segmentsByRoute.set(key, [...(segmentsByRoute.get(key) ?? []), row]);
  }

  const routeNameById = new Map();
  const routePairById = new Map();
  for (const pair of lineNames.world_routes ?? []) {
    require(typeof pair.route_pair_id === 'string' && pair.route_pair_id
      && typeof pair.name_ru === 'string' && pair.name_ru.trim()
      && pair.qualifier && Object.hasOwn(pair.qualifier, 'from_to')
      && Object.hasOwn(pair.qualifier, 'to_from'),
    `invalid_line_name:${pair.route_pair_id ?? 'unknown'}`);
    require(Array.isArray(pair.world_route_ids) && pair.world_route_ids.length === 2
      && pair.world_route_ids[0] !== pair.world_route_ids[1],
    `invalid_route_pair:${pair.route_pair_id}`);
    for (const routeId of pair.world_route_ids) {
      require(!routeNameById.has(routeId), `duplicate_named_route:${routeId}`);
      routeNameById.set(routeId, pair);
      routePairById.set(routeId, pair.route_pair_id);
    }
  }

  const exitRouteByKey = new Map();
  for (const [routeId, pair] of routeNameById) {
    const route = routesById.get(routeId);
    require(route?.status === 'approved' && route.world_revision_id === worldRevisionId,
      `route_not_approved:${routeId}`);
    const reverseId = route.reverse_route_id;
    require(reverseId && routeNameById.get(reverseId) === pair,
      `reverse_route_name_missing:${routeId}`);
    const reverse = routesById.get(reverseId);
    require(reverse?.status === 'approved' && reverse.reverse_route_id === route.id
      && reverse.reverse_route_version === route.version && route.reverse_route_version === reverse.version,
    `reverse_route_mismatch:${routeId}`);

    const routeKey = versionedKey(route.id, route.version);
    const reverseKey = versionedKey(reverse.id, reverse.version);
    const firstSegmentByRoute = new Map();
    for (const key of [routeKey, reverseKey]) {
      const routeSegments = segmentsByRoute.get(key) ?? [];
      require(routeSegments.length === 1 && routeSegments[0].status === 'approved'
        && routeSegments[0].ordinal === 0, `route_first_segment_missing_or_ambiguous:${key}`);
      firstSegmentByRoute.set(key, routeSegments[0]);
    }
    const routeEndpoints = endpointsByRoute.get(routeKey) ?? [];
    require(routeEndpoints.length === 2 && routeEndpoints.every((row) =>
      row.status === 'approved' && row.world_revision_id === worldRevisionId)
      && routeEndpoints.filter((row) => row.endpoint_role === 'from').length === 1
      && routeEndpoints.filter((row) => row.endpoint_role === 'to').length === 1,
    `route_endpoint_binding_invalid:${routeKey}`);
    const from = routeEndpoints.find((row) => row.endpoint_role === 'from');
    const to = routeEndpoints.find((row) => row.endpoint_role === 'to');
    const fromTo = from.canonical_g5_id === pair.from_g5_id
      && to.canonical_g5_id === pair.to_g5_id;
    const toFrom = from.canonical_g5_id === pair.to_g5_id
      && to.canonical_g5_id === pair.from_g5_id;
    require(fromTo !== toFrom, `route_pair_endpoint_mismatch:${routeKey}`);
    const qualifier = pair.qualifier[fromTo ? 'from_to' : 'to_from'];
    require(qualifier == null || typeof qualifier === 'string' && qualifier.trim(),
      `invalid_line_discriminator:${routeKey}`);
    const firstSegment = firstSegmentByRoute.get(routeKey);
    const lineDirection = Object.hasOwn(firstSegment, 'line_direction_id')
      ? firstSegment.line_direction_id : null;
    require(lineDirection == null || Object.hasOwn(DIRECTION_WORDS, lineDirection),
      `line_direction_unsupported:${routeKey}`);
    const exitKey = versionedKey(from.directional_exit_id, from.directional_exit_version);
    const exit = exitsByKey.get(exitKey);
    require(exit?.status === 'approved' && exit.exit_kind === 'world_route_exit'
      && exit.world_revision_id === worldRevisionId
      && exit.exit_canonical_g5_id === from.canonical_g5_id
      && exit.exit_canonical_g5_version === from.canonical_g5_version,
    `route_exit_binding_mismatch:${routeKey}`);
    const context = contextsByKey.get(versionedKey(exit.direction_context_id,
      directionContexts.find((row) => row.id === exit.direction_context_id)?.version));
    require(context?.status === 'approved'
      && context.from_canonical_g5_id === from.canonical_g5_id
      && context.from_canonical_g5_version === from.canonical_g5_version,
    `exit_direction_context_mismatch:${exitKey}`);
    require(!exitRouteByKey.has(exitKey), `exit_has_multiple_named_routes:${exitKey}`);
    exitRouteByKey.set(exitKey, { pair, route, from, exit, context,
      lineDiscriminator: qualifier, lineDirection });
  }

  require(routeNameById.size === 86 && exitRouteByKey.size === 86,
    `route_exit_coverage:${routeNameById.size}/${exitRouteByKey.size}`);
  require((lineNames.world_routes ?? []).length === 43, 'line_name_pair_coverage');
  require(labelsByExit.size === exitRouteByKey.size, `exit_label_coverage:${labelsByExit.size}`);
  const labels = [...labelsByExit.values()].map((template) => {
    const exitKey = versionedKey(template.directional_exit_ref.id,
      template.directional_exit_ref.version);
    const linked = exitRouteByKey.get(exitKey);
    require(linked, `named_route_for_exit_missing:${exitKey}`);
    require(template.world_revision_id === worldRevisionId
      && template.g4_ref.id === linked.exit.g4_id
      && template.g4_ref.version === linked.exit.g4_version
      && template.directional_exit_ref.canonical_digest === linked.exit.canonical_digest
      && template.direction_context_ref.id === linked.exit.direction_context_id
      && template.direction_context_ref.id === linked.context.id
      && template.direction_context_ref.version === linked.context.version,
    `exit_label_template_mismatch:${exitKey}`);
    const sourceRef = `data/world-catalogs/novgorod/m2c-line-names/candidate.json#world_routes[${linked.pair.route_pair_id}]:line_kind,name_ru,qualifier`;
    const routeRef = `data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_routes.json#${linked.route.id}@${linked.route.version}`;
    const endpointRef = `data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_route_endpoint_bindings.json#${linked.from.id}@${linked.from.version}`;
    const exitRef = `data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_g4_directional_exits.json#${linked.exit.id}@${linked.exit.version}`;
    const contextRef = `data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_topological_direction_contexts.json#${linked.context.id}@${linked.context.version}`;
    const lineName = linked.pair.name_ru;
    const displayLabel = composeExitLineLabel({ line_name: lineName,
      line_discriminator: linked.lineDiscriminator,
      line_direction_id: linked.lineDirection });
    return { ...structuredClone(template),
      world_route_ref: { id: linked.route.id, version: linked.route.version },
      from_endpoint_binding_ref: { id: linked.from.id, version: linked.from.version },
      route_pair_id: linked.pair.route_pair_id,
      line_name: lineName,
      line_discriminator: linked.lineDiscriminator,
      line_direction_id: linked.lineDirection,
      display_label: displayLabel,
      provenance: { directness: 'approved_line_name', confidence: 'medium',
        source_refs: [sourceRef,
          'data/world-catalogs/novgorod/m2c-line-names/approval-attestation.json#scope',
          routeRef, endpointRef, exitRef, contextRef],
        limits: 'Candidate only. The label is an authored game line name, not a historical toponym. It asserts no destination name, compass bearing, distance, safety, visibility, knowledge or movement capability. The existing editorial ordinal remains metadata and must not be rendered. Exact current exit disclosure remains mandatory.' } };
  }).sort((a, b) => a.directional_exit_ref.id.localeCompare(b.directional_exit_ref.id));

  const labelsBySource = new Map();
  for (const label of labels) {
    const key = `${label.g4_ref.id}|${label.directional_exit_ref.id}`;
    require(!labelsBySource.has(key), `duplicate_derived_exit_label:${key}`);
    labelsBySource.set(key, [label.line_name, label.line_discriminator,
      label.line_direction_id].join('|'));
    require(!/[0-9]/u.test(label.display_label)
      && !/—\s*выход\s+\d+/iu.test(label.display_label),
    `ordinal_in_display_label:${label.directional_exit_ref.id}`);
  }
  return labels;
}

export function buildCandidate() {
  const sources = checkedSources();
  const labels = deriveExitLineLabels({ lineNames: sources.lineNames,
    exitLabels: sources.exitLabels, ...sources.files,
    worldRevisionId: sources.worldRevisionId });
  const exitsByKey = uniqueBy(sources.files.exits,
    (row) => versionedKey(row.id, row.version), 'duplicate_exit_ref');
  const labelsByPlace = new Map();
  for (const label of labels) {
    const exit = exitsByKey.get(versionedKey(label.directional_exit_ref.id,
      label.directional_exit_ref.version));
    const placeId = exit?.exit_canonical_g5_id;
    require(typeof placeId === 'string' && placeId,
      `exit_source_place_missing:${label.directional_exit_ref.id}`);
    const tally = labelsByPlace.get(placeId) ?? { place_id: placeId,
      exit_count: 0, composed_label_count: 0 };
    tally.exit_count += 1;
    tally.composed_label_count += 1;
    labelsByPlace.set(placeId, tally);
  }
  const v17Coverage = [...labelsByPlace.values()].sort((a, b) =>
    a.place_id.localeCompare(b.place_id)).map((row) => ({ ...row,
    hidden_exit_count: row.exit_count - row.composed_label_count }));
  return { artifact_type: 'directional_exit_line_label_authoring_candidate',
    candidate_id: 'novgorod_m2c_exit_line_labels_v1', version: 1,
    status: 'candidate_approval_pending', approved: false,
    import_authorized: false, activation_authorized: false,
    world_revision_id: sources.worldRevisionId,
    authoring_policy: 'Each exit label composes the approved m2c-line-names name_ru and direction-specific qualifier with line_direction_id from the exact first segment of the world route whose approved from endpoint binds that exact exit. A null optional discriminator or direction is proposed only where the approved source permits absence; separate approval covers these structured values. Candidate is offline authoring data; current exit admission remains owned by Spatial visibility.',
    approval_boundary: { required: 'separate_data_approval_for_this_candidate_hash_and_all_86_labels',
      approval_does_not_authorize: ['world_base_import', 'general_rt_lines_cutover'],
      runtime_activation: 'The exact-hash approved-label reader may use these rows only after the independent approval attestation exists.',
      label_scope: 'composed Spatial 4.7.0 §14.4 label: line_name + optional line_discriminator + direction word for optional line_direction_id; approve exact nullable fields and every label' },
    source_pins: sources.sourcePins,
    v17_coverage_by_place: { place_count: v17Coverage.length,
      exit_count: v17Coverage.reduce((sum, row) => sum + row.exit_count, 0),
      hidden_exit_count: v17Coverage.reduce((sum, row) => sum + row.hidden_exit_count, 0),
      places: v17Coverage },
    labels };
}

if (process.argv[2] === '--write') {
  const outputPath = path.join(here, 'candidate.json');
  writeFileSync(outputPath, `${JSON.stringify(buildCandidate(), null, 2)}\n`);
}
