import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const readBytes = (relative) => readFileSync(new URL(relative, import.meta.url));
const readJson = (relative) => JSON.parse(readBytes(relative));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const starts = Object.freeze([
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_pine_ridge_approach_v1.start.json',
    scenario_id: 'novgorod_pine_ridge_approach_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_dry_pine_ridge_south_approach',
    display_label: 'На подходе к лесной гряде' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_riverbank_approach_v1.start.json',
    scenario_id: 'novgorod_riverbank_approach_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach',
    display_label: 'У речного берега' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_reed_backwater_entrance_v1.start.json',
    scenario_id: 'novgorod_reed_backwater_entrance_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_reed_backwater_entrance',
    display_label: 'У заболоченной заводи' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_vikhtuy_resource_edge_approach_v1.start.json',
    scenario_id: 'novgorod_vikhtuy_resource_edge_approach_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_resource_edge_river_edge',
    display_label: 'На лесном берегу протока' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_zaostrovye_settlement_approach_v1.start.json',
    scenario_id: 'novgorod_zaostrovye_settlement_approach_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_zaostrovye_settlement_center_river_approach',
    display_label: 'На протоке у селения' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_vikhtuy_work_storage_v1.start.json',
    scenario_id: 'novgorod_vikhtuy_work_storage_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage',
    display_label: 'На хозяйственном дворе' },
  { file: '../live-world-runtime-v17/capacity-v2-start-successors/novgorod_vikhtuy_household_cluster_v1.start.json',
    scenario_id: 'novgorod_vikhtuy_household_cluster_v1',
    g5_id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster',
    display_label: 'Среди дворов' }
]);
const approvedNaturalInputs = './approved-natural-label-inputs.json';
const naturalPlacementSource = '../m2c-natural-placement/scene-template-v2-successor-candidate.json';
const approvedNaturalInputSha256 = '44388cec1ba8199d7cab07877d79cf4bfdd820964d0b744305a591ce85d648ad';

function require(condition, reason) {
  if (!condition) throw new Error(`PLACE_LABEL_SOURCE_INVALID:${reason}`);
}

export function derivePlaceLabels() {
  const labels = [];
  const sourcePins = {};
  const seenKeys = new Set();
  for (const source of starts) {
    const bytes = readBytes(source.file);
    const start = JSON.parse(bytes);
    require(start.scenario_id === source.scenario_id, `scenario_id:${source.scenario_id}`);
    const place = start.initial_placement ?? start.place;
    const g5 = place?.canonical_g5_ref;
    require(g5?.id === source.g5_id && g5.version === 1,
      `canonical_g5_ref:${source.scenario_id}`);
    const key = `${g5.id}@${g5.version}`;
    require(!seenKeys.has(key), `duplicate_g5:${key}`);
    seenKeys.add(key);
    sourcePins[`data/world-catalogs/novgorod/${source.file.slice(3)}`] = sha256(bytes);
    labels.push({ scenario_id: source.scenario_id,
      canonical_g5_ref: { id: g5.id, version: g5.version },
      display_label: source.display_label,
      decision_ref: 'D107',
      status: 'candidate_approval_pending' });
  }
  require(labels.length === 7, 'row_count');
  const inputBytes = readBytes(approvedNaturalInputs);
  const inputs = JSON.parse(inputBytes);
  require(inputs.schema === 'rus.approved_natural_place_label_inputs.v1', 'natural_input_schema');
  require(inputs.source_sha256 === approvedNaturalInputSha256, 'natural_input_source_hash');
  require(inputs.row_count === 320 && Array.isArray(inputs.rows)
    && inputs.rows.length === inputs.row_count, 'natural_input_row_count');
  const inputById = new Map();
  for (const row of inputs.rows) {
    require(typeof row.place_id === 'string' && row.place_id.trim()
      && typeof row.display_label === 'string' && row.display_label.trim(), 'natural_input_row');
    require(!inputById.has(row.place_id), `duplicate_natural_input:${row.place_id}`);
    inputById.set(row.place_id, row.display_label);
  }

  const placementBytes = readBytes(naturalPlacementSource);
  const placementCandidate = JSON.parse(placementBytes);
  require(Array.isArray(placementCandidate.placements), 'natural_placement_rows');
  const placementsById = new Map();
  for (const placement of placementCandidate.placements) {
    require(typeof placement.id === 'string' && placement.id.trim(), 'natural_placement_id');
    require(!placementsById.has(placement.id), `duplicate_natural_placement:${placement.id}`);
    placementsById.set(placement.id, placement);
  }
  require(placementsById.size === inputById.size, 'natural_placement_row_count');
  const naturalKeys = new Set();
  const naturalTemplateVersions = new Map([[1, 0], [2, 0]]);
  for (const [placeId, displayLabel] of inputById) {
    const placement = placementsById.get(placeId);
    require(placement, `natural_placement_missing:${placeId}`);
    const profileRef = placement.natural_profile_ref;
    const templateRef = placement.scene_template_ref;
    require(typeof profileRef?.id === 'string' && profileRef.id.trim()
      && Number.isSafeInteger(profileRef.version) && profileRef.version >= 1,
    `natural_profile_ref:${placeId}`);
    require(typeof templateRef?.id === 'string' && templateRef.id.trim()
      && Number.isSafeInteger(templateRef.version) && templateRef.version >= 1,
    `scene_template_ref:${placeId}`);
    const key = `${profileRef.id}@${profileRef.version}|${templateRef.id}@${templateRef.version}`;
    require(!naturalKeys.has(key), `duplicate_natural_key:${key}`);
    naturalKeys.add(key);
    require(naturalTemplateVersions.has(templateRef.version), `unsupported_scene_template_version:${placeId}`);
    naturalTemplateVersions.set(templateRef.version, naturalTemplateVersions.get(templateRef.version) + 1);
    labels.push({ natural_place_ref: {
      natural_profile_ref: structuredClone(profileRef),
      scene_template_ref: structuredClone(templateRef) },
    display_label: displayLabel, approval_basis: 'approved_natural_label_source',
    status: 'candidate_approval_pending' });
  }
  require(placementsById.size === inputById.size, 'natural_input_missing_placement');
  require([...placementsById.keys()].every((placeId) => inputById.has(placeId)),
    'natural_placement_extra');
  require(naturalKeys.size === 320, 'natural_key_count');
  require(naturalTemplateVersions.get(1) === 160 && naturalTemplateVersions.get(2) === 160,
    'natural_template_version_counts');
  sourcePins['data/world-catalogs/novgorod/m2c-place-labels/approved-natural-label-inputs.json'] = sha256(inputBytes);
  sourcePins[`data/world-catalogs/novgorod/${naturalPlacementSource.slice(3)}`] = sha256(placementBytes);
  return { artifact_type: 'current_place_editorial_label_authoring_candidate',
    candidate_id: 'novgorod_m2c_place_labels_v1', version: 1,
    status: 'candidate_approval_pending', approved: false,
    import_authorized: false, activation_authorized: false,
    authoring_policy: 'D107 labels use their exact current canonical G5 id and version. Approved natural labels use the exact natural profile and scene template references selected by the current placement row. Raw G4/G5 names and toponyms are not labels.',
    decision_reference: { id: 'D107', source: 'PavelSlaven/Novgorod1230#133, #236',
      approved_on: '2026-10-06' },
    decision_references: ['D107', 'D112', 'D118', 'A03'],
    natural_label_decision_references: ['D112', 'D118', 'A03'],
    natural_label_source: { source_file: inputs.source_file, source_sha256: inputs.source_sha256,
      input_snapshot: 'approved-natural-label-inputs.json', placement_source: naturalPlacementSource.slice(3) },
    approval_boundary: { required: 'exact_candidate_sha256_and_all_327_D107_and_approved_natural_rows',
      approval_does_not_authorize: ['world_base_import', 'start_data_mutation'],
      runtime_activation: 'The reader exposes only rows named by the matching approval attestation.' },
    source_pins: sourcePins,
    coverage: { start_count: starts.length, label_count: labels.length,
      g5_count: seenKeys.size, natural_label_count: naturalKeys.size,
      natural_scene_template_v1_count: naturalTemplateVersions.get(1),
      natural_scene_template_v2_count: naturalTemplateVersions.get(2) },
    labels };
}

if (process.argv[2] === '--write') {
  writeFileSync(path.join(here, 'candidate.json'), `${JSON.stringify(derivePlaceLabels(), null, 2)}\n`);
}
