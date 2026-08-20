import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT = `${ROOT}/phase-m7-content`;

export async function loadLowerDvinaTraceRevision19Bundle({
  rootDir,
  historicalBundle,
  fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze,
  validateDefinitionPins = () => {}
} = {}) {
  const paths = {
    manifest: `${CONTENT}/manifest.json`,
    definition: `${CONTENT}/definition.json`,
    player_profile: `${CONTENT}/player-profile.json`,
    player_profile_set: `${CONTENT}/player-profile-set.json`,
    participant_profile_set: `${CONTENT}/participant-profile-set.json`,
    ordinary_materialization_profile: `${CONTENT}/ordinary-materialization-profile.json`,
    item_container_set: `${CONTENT}/item-container-set-overlay.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v15/manifest.json`,
    materialization_bindings: `${ROOT}/phase-1a-v15/materialization-bindings.json`
  };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await read(rootDir, path)])));
  if (!valid({ historicalBundle, loaded, paths })) {
    return fail('TRACE_REVISION_19_CONTENT_INVALID', 'Revision 19 appearance content is stale or incomplete.');
  }

  const itemContainerSet = mergeItemContainerSet(
    historicalBundle.item_container_set,
    loaded.item_container_set.value,
    fail
  );
  const materializationBindings = {
    ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value),
    start_spatial_binding: structuredClone(historicalBundle.materialization_bindings.start_spatial_binding),
    participant_materialization_depths: structuredClone(historicalBundle.materialization_bindings.participant_materialization_depths),
    player_dossier_projection: structuredClone(historicalBundle.materialization_bindings.player_dossier_projection),
    sealed_selection_inventory: structuredClone(historicalBundle.materialization_bindings.sealed_selection_inventory),
    initial_autonomous_materialization: structuredClone(historicalBundle.materialization_bindings.initial_autonomous_materialization)
  };
  materializationBindings.sealed_selection_inventory = structuredClone(
    loaded.materialization_bindings.value.sealed_selection_inventory
  );
  const bundle = {
    ...structuredClone(historicalBundle),
    definition_revision: 19,
    manifest_digest: loaded.phase_1a_manifest.digest,
    phase_1a_manifest: loaded.phase_1a_manifest.value,
    m7_content_manifest_digest: loaded.manifest.digest,
    definition: loaded.definition.value,
    player_profile: loaded.player_profile.value,
    player_profile_set: loaded.player_profile_set.value,
    participant_profile_set: loaded.participant_profile_set.value,
    ordinary_materialization_profile: loaded.ordinary_materialization_profile.value,
    item_container_set: itemContainerSet,
    materialization_bindings: materializationBindings,
    artifact_pins: { ...historicalBundle.artifact_pins }
  };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', materializationBindings, paths.materialization_bindings],
    ['definition', bundle.definition, paths.definition],
    ['player_profile', bundle.player_profile, paths.player_profile],
    ['player_profile_set', bundle.player_profile_set, paths.player_profile_set],
    ['participant_profile_set', bundle.participant_profile_set, paths.participant_profile_set],
    ['ordinary_materialization_profile', bundle.ordinary_materialization_profile,
      paths.ordinary_materialization_profile],
    ['item_container_set', itemContainerSet, paths.item_container_set]
  ]) {
    const file = loaded[key];
    bundle.artifact_pins[key] = {
      key,
      path,
      digest: file.digest,
      canonical_digest: canonicalDigest(artifact),
      schema: artifact.schema,
      revision: artifact.revision
    };
  }
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function mergeItemContainerSet(historical, overlay, fail) {
  const merged = structuredClone(historical);
  const byId = new Map(merged.item_templates.map((template) => [template.item_template_id, template]));
  for (const template of overlay.item_template_additions) {
    if (byId.has(template.item_template_id)) return fail('TRACE_M7_ITEM_TEMPLATE_DUPLICATE');
    const next = structuredClone(template);
    merged.item_templates.push(next);
    byId.set(next.item_template_id, next);
  }
  for (const patch of overlay.item_template_overrides) {
    const current = byId.get(patch.item_template_id);
    if (!current) return fail('TRACE_M7_ITEM_TEMPLATE_MISSING');
    Object.assign(current, structuredClone(patch));
  }
  const profiles = new Map((merged.item_inventory_profiles ?? [])
    .map((profile) => [profile.inventory_profile_id, profile]));
  for (const profile of overlay.item_inventory_profiles) {
    if (profiles.has(profile.inventory_profile_id)) return fail('TRACE_M7_ITEM_PROFILE_DUPLICATE');
    merged.item_inventory_profiles ??= [];
    merged.item_inventory_profiles.push(structuredClone(profile));
    profiles.set(profile.inventory_profile_id, profile);
  }
  merged.item_visual_profiles = structuredClone(
    overlay.item_visual_profiles ?? []
  );
  merged.revision = 5;
  merged.initial_equipment_candidates = structuredClone(
    overlay.initial_equipment_candidates
  );
  return merged;
}

function valid({ historicalBundle: historical, loaded: l, paths }) {
  const files = {
    'definition.json': l.definition.digest,
    'item-container-set-overlay.json': l.item_container_set.digest,
    'participant-profile-set.json': l.participant_profile_set.digest,
    'player-profile-set.json': l.player_profile_set.digest,
    'player-profile.json': l.player_profile.digest,
    'ordinary-materialization-profile.json': l.ordinary_materialization_profile.digest
  };
  const manifest = l.manifest.value;
  const phase1a = l.phase_1a_manifest.value;
  const bindings = l.materialization_bindings.value;
  return historical?.definition_revision === 18
    && manifest?.schema === 'rus.lower_dvina_trace_m7_content_manifest.v1'
    && manifest.scenario_definition_revision === 19
    && manifest.superseded_package_ref?.digest === historical.m6_content_manifest_digest
    && exact(manifest.files, files)
    && manifest.content_digest === digestFileMap(files)
    && exactRef(manifest.content_refs?.definition, l.definition, 'definition.json', 'lower_dvina_trace_v1', 19)
    && exactRef(manifest.content_refs?.player_profile, l.player_profile, 'player-profile.json', 'lower_dvina_trace_player_profile_mikula_v1', 2)
    && exactRef(manifest.content_refs?.player_profile_set, l.player_profile_set, 'player-profile-set.json', 'lower_dvina_trace_player_profile_set_v2', 2)
    && exactRef(manifest.content_refs?.participant_profile_set, l.participant_profile_set, 'participant-profile-set.json', 'trace_ld_v1_participant_profile_set', 2)
    && exactRef(manifest.content_refs?.ordinary_materialization_profile,
      l.ordinary_materialization_profile, 'ordinary-materialization-profile.json',
      'lower_dvina_trace_o1_first_entry_profile_v1', 1)
    && exactRef(manifest.content_refs?.item_container_set, l.item_container_set, 'item-container-set-overlay.json', 'trace_ld_v1_item_container_set', 5)
    && l.definition.value?.revision === 19
    && l.definition.value.supersedes_definition_ref?.digest === historical.artifact_pins.definition.digest
    && l.player_profile.value?.revision === 2
    && l.player_profile_set.value?.profile_candidates?.[0]?.digest === l.player_profile.digest
    && l.participant_profile_set.value?.revision === 2
    && l.item_container_set.value?.revision === 5
    && l.ordinary_materialization_profile.value?.schema
      === 'rus.lower_dvina_trace_ordinary_materialization_profile.v1'
    && l.item_container_set.value.supersedes_ref?.digest === historical.artifact_pins.item_container_set.digest
    && phase1a?.package_id === 'lower_dvina_trace_phase_1a_v15'
    && phase1a.scenario_definition_revision === 19
    && phase1a.superseded_package_ref?.digest === historical.artifact_pins.phase_1a_manifest.digest
    && phase1a.base_definition_ref?.digest === l.manifest.digest
    && exactRef(phase1a.content_refs?.materialization_bindings, l.materialization_bindings,
      paths.materialization_bindings, 'lower_dvina_trace_phase_1a_materialization_bindings_v15', 15)
    && bindings?.scenario_definition_revision === 19
    && bindings.superseded_binding_ref?.digest === historical.artifact_pins.materialization_bindings.digest
    && bindings.actor_appearance_materialization?.runtime_llm === 'forbidden';
}

async function read(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') };
}
function exactRef(ref, loaded, path, id, revision) {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest;
}
function exact(actual, expected) {
  return JSON.stringify(Object.keys(actual ?? {}).sort()) === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
function digestFileMap(files) {
  const payload = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, digest]) => `${name}:${digest}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
