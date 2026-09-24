import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRuntimeCatalogLoader, loadApprovedActorProfileCatalog,
  loadApprovedProceduralActorTemporalBundle, loadApprovedCanonicalNaturalInitialRule } from '@rus/runtime-catalog';
import { canonicalDigest } from '@rus/materialization';
import { loadTargetAuthoredStartProfile, readPinnedArtifact } from '../../internal/live-world-authored-starts.js';
import { buildCalendarProjectionProfile } from '../../internal/lower-dvina-trace-phase-1a-bundle.js';
import { createSpatialV3WorldBaseReader } from './spatial-v3-world-base-reader.js';
import { serverError } from '../../errors.js';

/** Read existing approved owners only. Activation approval is checked by the release caller. */
export async function loadTargetAuthoredStartRuntimes(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(rootDir,
      'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [Object.freeze({ ...await loadTargetAuthoredStartRuntime(options), bindingRevision: 1 })];
    throw error;
  }
  if (manifest.schema !== 'rus.live_world_runtime.target_starts_manifest.v1'
    || manifest.version !== 1 || manifest.status !== 'approved'
    || !Array.isArray(manifest.starts) || manifest.starts.length === 0) {
    gap('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
  }
  const runtimes = [];
  if (new Set(manifest.starts.map(({ binding_revision }) => binding_revision)).size !== manifest.starts.length) {
    gap('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
  }
  for (const artifacts of manifest.starts) {
    if (!Number.isSafeInteger(artifacts.binding_revision) || artifacts.binding_revision < 1
      || !['start', 'transfer', 'basis', 'approval'].every((key) => artifacts?.[key])) {
      gap('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
    }
    runtimes.push(Object.freeze({ ...await loadTargetAuthoredStartRuntime({ ...options, artifacts }),
      bindingRevision: artifacts.binding_revision }));
  }
  if (new Set(runtimes.map(({ profile }) => profile.scenario_id)).size !== runtimes.length) {
    gap('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
  }
  return Object.freeze(runtimes);
}

export async function loadTargetAuthoredStartRuntime({ worldPool, itemPin, actorBinding,
  rootDir = process.cwd(), artifacts = null } = {}) {
  if (!worldPool?.query || !itemPin?.activation_event_id || !actorBinding?.pin?.activation_event_id) {
    gap('SPATIAL_V3_TARGET_RUNTIME_PIN_REQUIRED');
  }
  const start = JSON.parse(artifacts == null ? await readFile(resolve(rootDir,
    'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json'))
    : await readPinnedArtifact(rootDir, artifacts.start));
  const worldPin = start.world_pin; const place = start.initial_placement;
  const actorPin = actorBinding.pin;
  if (actorPin.catalog_revision_id !== start.new_game_stage_bindings.actor_catalog_revision_id
    || actorPin.compatible_world_revision_id !== worldPin.world_revision_id
    || actorPin.compatible_world_catalog_digest !== worldPin.world_catalog_digest) {
    gap('SPATIAL_V3_TARGET_RUNTIME_PIN_REQUIRED');
  }
  const reader = createSpatialV3WorldBaseReader({ query: worldPool.query.bind(worldPool) });
  const catalog = await createRuntimeCatalogLoader({ worldBaseReader: { read: worldPool.query.bind(worldPool) },
    supportedRuntimeContractDigests: [itemPin.runtime_contract_digest] }).loadApprovedItemCatalog({ pin: itemPin });
  const [canonicalResult, sceneResult, g4Result] = await Promise.all([
    reader.readPinnedCanonicalG5SceneBinding({ ...place.canonical_g5_ref, world_revision_id: worldPin.world_revision_id }),
    reader.readPinnedSceneTemplateClosure({ ...place.scene_template_ref, world_revision_id: worldPin.world_revision_id }),
    worldPool.query(`SELECT n.id,n.version,n.world_revision_id,n.canonical_digest,n.status
      FROM world_base.spatial_v3_nodes n JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind='spatial_node' AND av.entity_id=n.id AND av.version=n.version
        AND av.world_revision_id=n.world_revision_id AND av.canonical_digest=n.canonical_digest
      WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3
        AND n.spatial_level='G4' AND n.status='approved' AND av.status='approved'`,
    [place.g4_ref.id, place.g4_ref.version, worldPin.world_revision_id])
  ]);
  if (!canonicalResult.ok || !sceneResult.ok || g4Result.rows.length !== 1) {
    gap('SPATIAL_V3_TARGET_START_SCENE_REQUIRED');
  }
  const canonical = canonicalResult.value; const scene = sceneResult.value; const g4 = g4Result.rows[0];
  if (canonical.parent_id !== g4.id || canonical.parent_version !== g4.version
    || canonical.scene_template_id !== scene.header.id || canonical.scene_template_version !== scene.header.version
    || canonical.materialization_profile_id !== place.scene_materialization_profile_ref.id) {
    gap('SPATIAL_V3_TARGET_START_SCENE_REQUIRED');
  }
  const snapshot = { version: 1, schema: 'world_base_reference_snapshot',
    readonly_checksum: canonicalDigest({ canonical, scene, g4 }),
    allowed_region_ids: [], allowed_graph_node_ids: [], allowed_graph_edge_ids: [], allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [], allowed_item_profile_ids: [], allowed_container_profile_ids: [],
    allowed_property_rule_ids: [], allowed_source_ids: [], canonical_g5_scene_bindings: [canonical], scene_template_closures: [scene] };
  const profile = await loadTargetAuthoredStartProfile({ rootDir, worldBaseReferenceSnapshot: snapshot,
    domainCatalog: catalog, artifacts });
  const [npc, acoustic, actorProfiles, temporal] = await Promise.all([
    reader.readPinnedG4NpcCompositionClosure({ g4, canonical_g5: canonical }),
    reader.readPinnedCanonicalG5AcousticClosure({ canonical_g5: canonical, scene_template: scene.header,
      world_revision_id: worldPin.world_revision_id }),
    loadApprovedActorProfileCatalog({ worldBaseReader: { read: worldPool.query.bind(worldPool) },
      worldPin, regionId: profile.actor_catalog.region_id, effectiveDate: dateString(start.initial_environment_inputs.calendar_date) }),
    worldPool.query(`SELECT record_id,family_id,record_kind,record_version AS version,applicability,status,
      provenance_refs,normalized_reference_ids,source_history_refs,payload,canonical_digest
      FROM world_base.temporal_authoring_records WHERE status='approved' ORDER BY record_id`)
  ]);
  if (!npc.ok || !acoustic.ok || !acoustic.value.rows.length) gap('SPATIAL_V3_TARGET_START_OWNER_DATA_REQUIRED');
  const actorBundle = await loadApprovedProceduralActorTemporalBundle({ worldBaseReader: { read: worldPool.query.bind(worldPool) },
    worldPin, actorCatalog: profile.actor_catalog, actorProfileCatalog: actorProfiles, temporalRecords: temporal.rows });
  const initialRule = start.initial_perception_rule == null ? null
    : loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog: catalog, pin: itemPin,
      rule_ref: { id: start.initial_perception_rule.id, version: start.initial_perception_rule.version } });
  const calendar = temporal.rows.find((row) => row.record_id === start.initial_environment_inputs.calendar_record_ref.id);
  if (!calendar || Number(calendar.version) !== start.initial_environment_inputs.calendar_record_ref.version) {
    gap('SPATIAL_V3_TARGET_START_TEMPORAL_REQUIRED');
  }
  return Object.freeze({ profile, worldBaseReader: reader, initialRule, itemPin, actorBinding,
    materialization_inputs: Object.freeze({ scenario_bundle: profile, domain_catalog: catalog, domain_catalog_pin: itemPin,
      world_base_reference_snapshot: snapshot, approved_actor_temporal_bundle: actorBundle,
      canonical_npc_closure: npc.value, canonical_acoustic_rows: acoustic.value.rows,
      actor_base_attributes_runtime_profile: actorBinding.runtime_profile,
      actor_equipment_activation: { status: 'active', event_id: itemPin.activation_event_id },
      calendar_profile: buildCalendarProjectionProfile(calendar) }) });
}

function dateString(date) {
  if (![date?.year, date?.month, date?.day].every(Number.isSafeInteger)) gap('SPATIAL_V3_TARGET_START_TEMPORAL_REQUIRED');
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
function gap(code) { throw serverError(code, 'Exact imported target start owner data is required.', { status: 503 }); }
