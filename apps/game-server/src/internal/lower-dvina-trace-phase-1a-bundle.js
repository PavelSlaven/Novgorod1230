import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest, MaterializationError } from '@rus/materialization';
import { resolveGameTimestampFromCalendarDate } from '@rus/time-events-history/calendar';
import { assertExactContentRef } from './lower-dvina-trace-phase-1a-ref-validation.js';
import {
  assertVersionedRawPin,
  loadLowerDvinaTracePhase1ACutover
} from './lower-dvina-trace-phase-1a-cutover.js';
import { loadLowerDvinaTraceRevisionBundle } from './lower-dvina-trace-phase-1a-revision-bundle.js';
import {
  validateLowerDvinaTracePlayerDossier as validatePlayerDossier
} from './lower-dvina-trace-player-validation.js';
export { assertExactContentRef } from './lower-dvina-trace-phase-1a-ref-validation.js';

const SCENARIO_ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const FILES = Object.freeze({
  materialization_bindings: 'phase-1a-v3/materialization-bindings.json',
  definition: 'phase-0d-v4/definition.json',
  player_profile: 'player-profile.json',
  player_profile_definition: 'definition.json',
  player_profile_set: 'player-profile-set.json',
  approved_policy: 'approved-policy.json',
  participant_profile_set: 'phase-0b/participant-profile-set.json',
  location_topology_set: 'phase-0b/location-topology-set.json',
  item_container_set: 'phase-0c/item-container-set.json',
  hidden_truth_candidate_set: 'phase-0c/hidden-truth-candidate-set.json',
  clue_evidence_graph_set: 'phase-0c/clue-evidence-graph-set.json',
  knowledge_lie_memory_rules: 'phase-0c/knowledge-lie-memory-rules.json',
  activity_check_consequence_profiles: 'phase-0d/activity-check-consequence-profiles.json',
  npc_decision_schedule_policies: 'phase-0d/npc-decision-schedule-policies.json',
  movement_bindings: 'phase-0d/movement-bindings.json',
  location_access_policies: 'phase-0d/location-access-policies.json',
  location_capacity_contracts: 'phase-0d/location-capacity-contracts.json',
  body_environment_profiles: 'phase-0d-v4/body-environment-profiles.json',
  promise_policy: 'phase-0d/promise-policy.json',
  completion_rules: 'phase-0d/completion-rules.json',
  epilogue_rules: 'phase-0d/epilogue-rules.json'
});

export async function loadLowerDvinaTraceMaterializationBundle({
  rootDir = process.cwd(),
  scenarioDefinitionRevision = 7
} = {}) {
  if (scenarioDefinitionRevision === 7) {
    return loadRevision7Bundle({ rootDir });
  }
  if ([8, 9, 10].includes(scenarioDefinitionRevision)) {
    return loadLowerDvinaTraceRevisionBundle({
      scenarioDefinitionRevision,
      rootDir,
      loadRevision7Bundle,
      fail,
      freezeDeep,
      validateDefinitionPins
    });
  }
  fail(
    'TRACE_SCENARIO_REVISION_UNSUPPORTED',
    `Unsupported Lower Dvina trace definition revision ${String(scenarioDefinitionRevision)}.`
  );
}

async function loadRevision7Bundle({ rootDir }) {
  const {
    phase1AManifestFile,
    correctionManifestFile,
    supersededBindingsFile
  } = await loadLowerDvinaTracePhase1ACutover({
    rootDir,
    scenarioRoot: SCENARIO_ROOT,
    readJson
  });
  const phase0aManifest = await readJson(rootDir, `${SCENARIO_ROOT}/manifest.json`);
  const phase0bManifest = await readJson(rootDir, `${SCENARIO_ROOT}/phase-0b/manifest.json`);
  const phase0cManifest = await readJson(rootDir, `${SCENARIO_ROOT}/phase-0c/manifest.json`);
  const correction = correctionManifestFile.value;
  const phase1AManifest = phase1AManifestFile.value;

  const artifactPins = {};
  const bundle = {
    version: 1,
    schema: 'rus.lower_dvina_trace_materialization_bundle.v1',
    scenario_id: 'lower_dvina_trace_v1',
    definition_revision: 7,
    manifest_digest: phase1AManifestFile.digest,
    phase_1a_manifest: phase1AManifest,
    artifact_pins: artifactPins
  };
  artifactPins.phase_1a_manifest = {
    key: 'phase_1a_manifest',
    path: `${SCENARIO_ROOT}/phase-1a-v3/manifest.json`,
    digest: phase1AManifestFile.digest,
    canonical_digest: canonicalDigest(phase1AManifest),
    schema: phase1AManifest.schema,
    revision: phase1AManifest.revision
  };
  for (const [key, relativePath] of Object.entries(FILES)) {
    const loaded = await readJson(rootDir, `${SCENARIO_ROOT}/${relativePath}`);
    bundle[key] = loaded.value;
    artifactPins[key] = {
      key,
      path: `${SCENARIO_ROOT}/${relativePath}`,
      digest: loaded.digest,
      canonical_digest: canonicalDigest(loaded.value),
      schema: loaded.value.schema,
      revision: loaded.value.revision
    };
  }
  const itemInventorySource = bundle.item_container_set.canonical_item_catalog_source_ref?.datasets?.item_inventory_profiles;
  const itemInventoryProfiles = await readJson(rootDir, itemInventorySource?.path);
  if (itemInventoryProfiles.digest !== itemInventorySource?.sha256 || !Array.isArray(itemInventoryProfiles.value)) {
    fail('TRACE_ITEM_CATALOG_DIGEST_MISMATCH', 'Pinned starter-item inventory profiles are stale or incompatible.');
  }
  bundle.item_inventory_profiles = itemInventoryProfiles.value;
  artifactPins.item_inventory_profiles = {
    key: 'item_inventory_profiles',
    path: itemInventorySource.path,
    digest: itemInventoryProfiles.digest,
    canonical_digest: canonicalDigest(itemInventoryProfiles.value),
    schema: itemInventorySource.schema_version,
    revision: 1
  };
  const spatialSource = bundle.location_topology_set.spatial_source_ref;
  const spatialManifest = await readJson(rootDir, spatialSource.manifest_path);
  if (spatialManifest.digest !== spatialSource.manifest_digest
    || spatialManifest.value.schema_version !== spatialSource.manifest_schema_version
    || spatialManifest.value.bundle_id !== spatialSource.bundle_id) {
    fail('TRACE_SPATIAL_MANIFEST_MISMATCH', 'Pinned Spatial v3 manifest is stale or incompatible.');
  }
  bundle.spatial_manifest = spatialManifest.value;
  artifactPins.spatial_manifest = {
    key: 'spatial_manifest',
    path: spatialSource.manifest_path,
    digest: spatialManifest.digest,
    canonical_digest: canonicalDigest(spatialManifest.value),
    schema: spatialManifest.value.schema_version,
    revision: 1
  };

  assertManifestFile(phase0aManifest.value, 'player-profile.json', artifactPins.player_profile);
  assertManifestFile(phase0aManifest.value, 'definition.json', artifactPins.player_profile_definition);
  assertManifestFile(phase0aManifest.value, 'player-profile-set.json', artifactPins.player_profile_set);
  assertManifestFile(phase0aManifest.value, 'approved-policy.json', artifactPins.approved_policy);
  assertExactContentRef(
    phase1AManifest.content_refs?.materialization_bindings,
    artifactPins.materialization_bindings,
    {
      path: artifactPins.materialization_bindings.path,
      id: bundle.materialization_bindings.binding_set_id,
      revision: bundle.materialization_bindings.revision,
      schema: bundle.materialization_bindings.schema
    }
  );
  assertVersionedRawPin(
    bundle.materialization_bindings.superseded_binding_ref,
    supersededBindingsFile,
    {
      path: `${SCENARIO_ROOT}/phase-1a-v2/materialization-bindings.json`,
      id: 'lower_dvina_trace_phase_1a_materialization_bindings_v2',
      revision: 2,
      schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
      idField: 'binding_set_id'
    }
  );
  assertManifestFile(phase0bManifest.value, 'participant-profile-set.json', artifactPins.participant_profile_set);
  assertManifestFile(phase0bManifest.value, 'location-topology-set.json', artifactPins.location_topology_set);
  for (const [key, manifestKey] of [
    ['item_container_set', 'item_container_set'],
    ['hidden_truth_candidate_set', 'hidden_truth_candidate_set'],
    ['clue_evidence_graph_set', 'clue_evidence_graph_set'],
    ['knowledge_lie_memory_rules', 'knowledge_lie_memory_rules']
  ]) assertContentRef(phase0cManifest.value.content_refs?.[manifestKey], artifactPins[key]);
  assertContentRef(correction.content_refs?.definition, artifactPins.definition);
  assertContentRef(correction.content_refs?.body_environment_profiles, artifactPins.body_environment_profiles);
  for (const key of [
    'activity_check_consequence_profiles',
    'npc_decision_schedule_policies',
    'movement_bindings',
    'location_access_policies',
    'location_capacity_contracts',
    'promise_policy',
    'completion_rules',
    'epilogue_rules'
  ]) assertContentRef(correction.reused_content_refs?.[key], artifactPins[key]);

  const calendarDatasetRef = correction.temporal_source_refs?.dataset;
  const calendarDataset = await readJson(rootDir, calendarDatasetRef?.path);
  if (calendarDataset.digest !== calendarDatasetRef?.digest) fail('TRACE_CALENDAR_DIGEST_MISMATCH', 'Pinned calendar dataset digest mismatch.');
  const calendarRecord = calendarDataset.value.find((record) => record.record_id === calendarDatasetRef.id && record.status === 'approved');
  if (!calendarRecord) fail('TRACE_CALENDAR_RECORD_MISSING', 'Approved pinned calendar record is missing.');
  bundle.calendar_profile = buildCalendarProjectionProfile(calendarRecord);
  artifactPins.calendar_profile = {
    key: 'calendar_profile',
    path: calendarDatasetRef.path,
    digest: calendarDataset.digest,
    canonical_digest: canonicalDigest(bundle.calendar_profile),
    schema: 'rus.time.calendar_projection_profile.v1',
    revision: 2
  };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

export function resolveLowerDvinaTraceStartTimestamp({ specification, calendar_profile }) {
  const contract = specification?.calendar_date_contract;
  if (contract?.calendar_system !== 'Julian' || contract?.selection_policy !== 'fixed_approved_date'
    || contract?.rng_consumption !== 'forbidden' || specification.exact_local_minute_of_day !== 420) {
    fail('TRACE_START_TIMESTAMP_SPEC_INVALID', 'Approved exact start timestamp specification is required.');
  }
  return resolveGameTimestampFromCalendarDate({
    calendar_system: contract.calendar_system,
    year: contract.exact_date.year,
    month: contract.exact_date.month,
    day: contract.exact_date.day,
    local_minute_of_day: String(specification.exact_local_minute_of_day),
    subminute_numerator: specification.subminute_at_start.numerator,
    subminute_denominator: specification.subminute_at_start.denominator
  }, calendar_profile);
}

export function validateLowerDvinaTracePlayerDossier(result, bundle) {
  return validatePlayerDossier(result, bundle, fail);
}
async function readJson(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) fail('TRACE_SCENARIO_ARTIFACT_PATH_INVALID', 'Pinned artifact path is required.');
  const raw = await readFile(resolve(rootDir, relativePath));
  return { value: JSON.parse(raw.toString('utf8')), digest: createHash('sha256').update(raw).digest('hex') };
}
function assertManifestFile(manifest, name, pin) { if (manifest?.files?.[name] !== pin.digest) fail('TRACE_SCENARIO_ARTIFACT_DIGEST_MISMATCH', `Manifest digest mismatch for ${name}.`); }
function assertContentRef(ref, pin) { if (!ref || ref.digest !== pin.digest || (ref.schema && ref.schema !== pin.schema)) fail('TRACE_SCENARIO_ARTIFACT_DIGEST_MISMATCH', `Content ref mismatch for ${pin.key}.`); }
function validateDefinitionPins(bundle) {
  for (const [definitionKey, artifactKey] of Object.entries({
    player_profile_set: 'player_profile_set',
    participant_profile_set: 'participant_profile_set',
    location_topology_set: 'location_topology_set',
    item_container_set: 'item_container_set',
    hidden_truth_candidate_set: 'hidden_truth_candidate_set',
    clue_evidence_graph_set: 'clue_evidence_graph_set',
    knowledge_lie_memory_rules: 'knowledge_lie_memory_rules'
  })) {
    if (bundle.definition.immutable_content_refs?.[definitionKey]?.digest !== bundle.artifact_pins[artifactKey].digest) fail('TRACE_DEFINITION_PIN_MISMATCH', `Definition pin ${definitionKey} is stale.`);
  }
  for (const key of Object.keys(bundle.definition.resolved_policy_refs ?? {})) {
    if (bundle.definition.resolved_policy_refs[key].digest !== bundle.artifact_pins[key]?.digest) fail('TRACE_DEFINITION_PIN_MISMATCH', `Policy pin ${key} is stale.`);
  }
}
function buildCalendarProjectionProfile(record) {
  const payload = record.payload;
  const epoch = payload.epoch_reference;
  return {
    profile_id: payload.calendar_profile_id,
    version: payload.calendar_version,
    status: record.status,
    provenance: { source_id: record.record_id, source_version: record.version },
    epoch: {
      game_timestamp: epoch.game_timestamp_zero,
      year: epoch.calendar_date_at_zero.year,
      month: epoch.calendar_date_at_zero.month,
      day: epoch.calendar_date_at_zero.day
    },
    calendar_system: payload.calendar_system,
    month_rules: { month_lengths: payload.day_month_leap_rules.month_lengths_common },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['0'], leap_month: '2', leap_days: '1' },
    day_start_rule: { local_minute: '0' },
    local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'approved_date_projection', start_minute: '0', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'approved_date_projection', start_day: '1', end_day: '366' }] },
    daylight_rule: { ranges: [{ id: 'approved_date_projection', start_day: '1', end_day: '366' }] }
  };
}
function fail(code, message, details = {}) { throw new MaterializationError(code, message, details); }
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
