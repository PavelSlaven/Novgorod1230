import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveInventoryProfile } from '@rus/items-property';
import { loadCommonCatalogLookupRecords } from '@rus/runtime-catalog/common-lookups';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT_ROOT = `${ROOT}/phase-6-content`;

export async function loadLowerDvinaTracePhase6Content({
  rootDir,
  historical,
  fail
}) {
  const [manifest, definition, activity, body, movement, items, phase1a,
    bindings, reused, lookupRecords] =
    await Promise.all([
      readJson(rootDir, `${CONTENT_ROOT}/manifest.json`),
      readJson(rootDir, `${CONTENT_ROOT}/definition.json`),
      readJson(rootDir,
        `${CONTENT_ROOT}/activity-check-consequence-profiles.json`),
      readJson(rootDir, `${CONTENT_ROOT}/body-environment-profiles.json`),
      readJson(rootDir, `${CONTENT_ROOT}/movement-bindings.json`),
      readJson(rootDir, `${CONTENT_ROOT}/item-container-set-overlay.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v8/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v8/materialization-bindings.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v7/materialization-bindings.json`),
      loadCommonCatalogLookupRecords({ rootDir })
    ]);
  assertPhase6Package({
    manifest,
    definition,
    activity,
    body,
    movement,
    items,
    phase1a,
    bindings,
    reused,
    historical,
    fail
  });
  return {
    manifest,
    definition,
    activity,
    body,
    movement,
    items,
    phase1a,
    bindings,
    reused,
    lookupRecords
  };
}

export function mergeLowerDvinaTracePhase6Content({
  historical,
  content,
  fail
}) {
  const { activity, body, movement, items, bindings, reused, lookupRecords } = content;
  return {
    itemContainerSet: mergeItemContainerOverlay({
      base: historical.item_container_set,
      overlay: items.value,
      archetypes: lookupRecords.inventory_archetypes,
      fail
    }),
    activityProfiles: mergeActivityOverlay(
      historical.activity_check_consequence_profiles,
      activity.value
    ),
    bodyProfiles: mergeRecordOverlay({
      base: historical.body_environment_profiles,
      overlay: body.value,
      collection: 'effect_profiles',
      key: 'effect_profile_id'
    }),
    movementBindings: mergeRecordOverlay({
      base: historical.movement_bindings,
      overlay: movement.value,
      collection: 'route_bindings',
      key: 'route_id'
    }),
    materializationBindings: resolveReusedBindings(bindings.value, reused.value)
  };
}

function assertPhase6Package(input) {
  const {
    manifest, definition, activity, body, movement, items, phase1a, bindings,
    reused, historical, fail
  } = input;
  const contentRefs = manifest.value?.content_refs;
  const bindingRef = phase1a.value?.content_refs?.materialization_bindings;
  if (manifest.value?.package_id !== 'lower_dvina_trace_phase_6_content_v1'
    || manifest.value.scenario_definition_revision !== 12
    || manifest.value.superseded_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || manifest.value.files?.['definition.json'] !== definition.digest
    || manifest.value.files?.['activity-check-consequence-profiles.json']
      !== activity.digest
    || manifest.value.files?.['body-environment-profiles.json'] !== body.digest
    || manifest.value.files?.['movement-bindings.json'] !== movement.digest
    || manifest.value.files?.['item-container-set-overlay.json'] !== items.digest
    || contentRefs?.definition?.digest !== definition.digest
    || contentRefs?.activity_check_consequence_profiles?.digest
      !== activity.digest
    || contentRefs?.body_environment_profiles?.digest !== body.digest
    || contentRefs?.movement_bindings?.digest !== movement.digest
    || contentRefs?.item_container_set_overlay?.digest !== items.digest
    || definition.value?.revision !== 12
    || definition.value.supersedes_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || activity.value?.revision !== 4
    || activity.value.supersedes_ref?.digest
      !== historical.artifact_pins.activity_check_consequence_profiles?.digest
    || body.value?.revision !== 6
    || movement.value?.revision !== 2
    || items.value?.schema !== 'rus.trace_item_container_set_overlay.v1'
    || items.value.revision !== 4
    || items.value.supersedes_ref?.digest
      !== historical.artifact_pins.item_container_set?.digest
    || phase1a.value?.package_id !== 'lower_dvina_trace_phase_1a_v8'
    || phase1a.value.revision !== 8
    || phase1a.value.scenario_definition_revision !== 12
    || phase1a.value.superseded_package_ref?.digest
      !== historical.artifact_pins.phase_1a_manifest.digest
    || phase1a.value.base_definition_ref?.digest !== manifest.digest
    || bindingRef?.digest !== bindings.digest
    || bindings.value?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v8'
    || bindings.value.revision !== 8
    || bindings.value.scenario_definition_revision !== 12
    || bindings.value.superseded_binding_ref?.digest
      !== historical.artifact_pins.materialization_bindings.digest
    || bindings.value.reused_immutable_binding_ref?.digest !== reused.digest
    || reused.digest !== historical.artifact_pins.materialization_bindings.digest
    || bindings.value.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed') {
    fail('TRACE_PHASE_6_CONTENT_INVALID',
      'Exact approved Phase 6 content and cutover are required.');
  }
}

function mergeActivityOverlay(base, overlay) {
  const replacement = overlay.activity_profiles?.[0];
  return {
    ...structuredClone(base),
    schema: overlay.schema,
    set_id: overlay.set_id,
    revision: overlay.revision,
    publication_status: overlay.publication_status,
    supersedes_ref: structuredClone(overlay.supersedes_ref),
    activity_profiles: (base.activity_profiles ?? []).map((profile) =>
      profile.profile_id === replacement.profile_id
        ? structuredClone(replacement)
        : structuredClone(profile)
    )
  };
}

function mergeRecordOverlay({ base, overlay, collection, key }) {
  const replacements = new Map(
    (overlay[collection] ?? []).map((record) => [record[key], record])
  );
  const merged = (base[collection] ?? []).map((record) =>
    structuredClone(replacements.get(record[key]) ?? record)
  );
  for (const record of replacements.values()) {
    if (!merged.some((candidate) => candidate[key] === record[key])) {
      merged.push(structuredClone(record));
    }
  }
  return {
    ...structuredClone(base),
    schema: overlay.schema,
    set_id: overlay.set_id,
    revision: overlay.revision,
    publication_status: overlay.publication_status,
    supersedes_ref: structuredClone(overlay.supersedes_ref),
    [collection]: merged
  };
}

function mergeItemContainerOverlay({ base, overlay, archetypes, fail }) {
  const templates = new Map(
    (overlay.item_template_overrides ?? []).map((record) => [
      record.item_template_id, record
    ])
  );
  let profiles;
  try {
    profiles = (overlay.item_inventory_profiles ?? []).map((profile) =>
      resolveInventoryProfile({ profile, archetypes }));
  } catch {
    fail('TRACE_PHASE_6_INVENTORY_PROFILE_INVALID',
      'Phase 6 inventory profiles must resolve exactly.');
  }
  const mergedTemplates = (base.item_templates ?? []).map((record) => {
    const override = templates.get(record.item_template_id);
    return override ? { ...structuredClone(record), ...structuredClone(override) }
      : structuredClone(record);
  });
  if (templates.size !== overlay.item_template_overrides?.length
    || templates.size !== 2
    || [...templates.keys()].some((id) =>
      !mergedTemplates.some((record) => record.item_template_id === id))) {
    fail('TRACE_PHASE_6_INVENTORY_PROFILE_INVALID',
      'Phase 6 item-template overrides must resolve exactly.');
  }
  return {
    ...structuredClone(base),
    revision: overlay.revision,
    publication_status: overlay.publication_status,
    supersedes_ref: structuredClone(overlay.supersedes_ref),
    item_templates: mergedTemplates,
    item_inventory_profiles: [
      ...structuredClone(base.item_inventory_profiles ?? []),
      ...structuredClone(profiles)
    ]
  };
}

function resolveReusedBindings(wrapper, reused) {
  return {
    ...mergeBindingOverrides(reused, wrapper.binding_overrides),
    schema: wrapper.schema,
    binding_set_id: wrapper.binding_set_id,
    revision: wrapper.revision,
    status: wrapper.status,
    scenario_id: wrapper.scenario_id,
    scenario_definition_revision: wrapper.scenario_definition_revision,
    superseded_binding_ref: structuredClone(wrapper.superseded_binding_ref),
    reused_immutable_binding_ref: structuredClone(
      wrapper.reused_immutable_binding_ref
    ),
    binding_resolution_policy: wrapper.binding_resolution_policy,
    fallback_policy: wrapper.fallback_policy,
    normalization_policy: wrapper.normalization_policy,
    binding_overrides: structuredClone(wrapper.binding_overrides),
    sealed_selection_inventory: structuredClone(
      wrapper.sealed_selection_inventory
    )
  };
}

function mergeBindingOverrides(reused, overrides) {
  const result = structuredClone(reused);
  for (const [section, sectionOverride] of Object.entries(overrides ?? {})) {
    result[section] = deepMerge(result[section], sectionOverride);
  }
  return result;
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return structuredClone(override);
  }
  const result = structuredClone(base ?? {});
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(result[key], value)
      : structuredClone(value);
  }
  return result;
}

async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}
