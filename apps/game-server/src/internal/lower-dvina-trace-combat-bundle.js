import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import {
  TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST,
  TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST
} from './lower-dvina-trace-phase-1b-identities.js';

const SCENARIO_ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const ROOT = `${SCENARIO_ROOT}/phase-m4-content`;

export async function loadLowerDvinaTraceRevision16CombatBundle({ rootDir,
  historicalBundle,
  fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze,
  validateDefinitionPins = () => {}
} = {}) {
  const [manifest, definition, combat, steps, turn10, autonomous, movement,
    phase1a, bindings] =
    await Promise.all([
    read(rootDir, 'manifest.json'), read(rootDir, 'definition.json'),
    read(rootDir, 'combat-semantic-bindings.json'),
      read(rootDir, 'turn-step-bindings.json'),
      read(rootDir, 'turn-10-companion-bindings.json'),
      read(rootDir, 'autonomous-semantic-bindings.json'),
      read(rootDir, 'movement-bindings.json'),
      readPath(rootDir, `${SCENARIO_ROOT}/phase-1a-v12/manifest.json`),
      readPath(rootDir,
        `${SCENARIO_ROOT}/phase-1a-v12/materialization-bindings.json`)
    ]);
  if (!validRevision16Pins({ historicalBundle, manifest, definition, combat,
    steps, turn10, autonomous, movement, phase1a, bindings })
      || combat.value?.phase_4?.execution_profiles?.length !== 4
      || combat.value?.phase_8?.execution_profiles?.length !== 5
      || combat.value?.exchange_timing_profile?.status !== 'approved'
      || combat.value.exchange_timing_profile.duration_minutes !== 2
      || steps.value?.domain_bindings?.length !== 13
      || bindings.value?.initial_autonomous_materialization
        ?.weapon_placement?.item_template_ref
          !== 'trace_ld_v1_item_zhdanko_axe'
      || bindings.value.initial_autonomous_materialization.weapon_placement
        .holder_ref !== 'zhdanko_storehouse_controller'
      || !steps.value.domain_bindings.some((binding) => binding.binding_id === 'trace_ld_v1_step_combat_response')) {
    return fail('TRACE_REVISION_16_COMBAT_CONTENT_INVALID');
  }
  const materializationBindings = {
    ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(bindings.value),
    sealed_selection_inventory: applySealedSelectionInventoryOverrides(
      historicalBundle.materialization_bindings.sealed_selection_inventory,
      bindings.value.sealed_selection_inventory_overrides
    )
  };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 16,
    manifest_digest: phase1a.digest,
    phase_1a_manifest: phase1a.value,
    m4_content_manifest_digest: manifest.digest,
    definition: definition.value, combat_semantic_bindings: combat.value,
    turn_step_bindings: steps.value,
    materialization_bindings: materializationBindings,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, loaded, path, value] of [
    ['phase_1a_manifest', phase1a,
      `${SCENARIO_ROOT}/phase-1a-v12/manifest.json`, phase1a.value],
    ['materialization_bindings', bindings,
      `${SCENARIO_ROOT}/phase-1a-v12/materialization-bindings.json`,
      materializationBindings],
    ['definition', definition, `${ROOT}/definition.json`, definition.value],
    ['combat_semantic_bindings', combat,
      `${ROOT}/combat-semantic-bindings.json`, combat.value],
    ['turn_step_bindings', steps, `${ROOT}/turn-step-bindings.json`, steps.value]
  ]) {
    bundle.artifact_pins[key] = {
      key,
      path,
      digest: loaded.digest,
      canonical_digest: canonicalDigest(value),
      schema: value.schema,
      revision: value.revision
    };
  }
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
async function read(rootDir, file) { const raw = await readFile(resolve(rootDir, ROOT, file)); return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
async function readPath(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return {
    value: JSON.parse(raw),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}

function validRevision16Pins(input) {
  return Object.values(revision16PinChecks(input)).every(Boolean);
}

function revision16PinChecks(input) {
  const { historicalBundle: historical, manifest, definition, combat, steps,
    turn10, autonomous, movement, phase1a, bindings } = input;
  const content = manifest.value;
  const files = { 'autonomous-semantic-bindings.json': autonomous.digest,
    'combat-semantic-bindings.json': combat.digest,
    'definition.json': definition.digest,
    'movement-bindings.json': movement.digest,
    'turn-10-companion-bindings.json': turn10.digest,
    'turn-step-bindings.json': steps.digest };
  const refs = [
    ['definition', definition, 'definition.json', 'lower_dvina_trace_v1', 16],
    ['combat_semantic_bindings', combat, 'combat-semantic-bindings.json',
      'lower_dvina_trace_combat_semantic_bindings_v1', 1],
    ['turn_step_bindings', steps, 'turn-step-bindings.json',
      'lower_dvina_trace_turn_step_bindings_v3', 3],
    ['turn_10_companion_bindings', turn10,
      'turn-10-companion-bindings.json',
      'lower_dvina_trace_turn_10_companion_bindings_v1', 1],
    ['autonomous_semantic_bindings', autonomous,
      'autonomous-semantic-bindings.json',
      'lower_dvina_trace_autonomous_semantic_bindings_v1', 1],
    ['movement_bindings', movement, 'movement-bindings.json',
      'trace_ld_v1_movement_bindings', 3]
  ];
  const resolved = definition.value?.resolved_policy_refs;
  return {
    lineage: historical?.definition_revision === 15
      && content.superseded_package_ref?.digest
        === historical.m3_content_manifest_digest
      && content.superseded_definition_ref?.digest
        === historical.artifact_pins.definition.digest,
    manifest: content?.schema === 'rus.lower_dvina_trace_m4_content_manifest.v1'
    && content.package_id === 'lower_dvina_trace_m4_content_v1'
    && content.revision === 1
    && content.scenario_definition_revision === 16
    && content.status === 'approved'
    && content.fallback_policy === 'forbidden'
    && content.normalization_policy === 'forbidden'
    && content.alias_policy === 'forbidden',
    file_map: exactRecord(content.files, files),
    digest_algorithm: content.content_digest_algorithm
      === 'sha256_sorted_filename_colon_digest_lf_v1',
    content_digest: content.content_digest === digestFileMap(files),
    content_refs: refs.every(([key, loaded, path, id, revision]) =>
      exactContentRef(content.content_refs?.[key], loaded, path, id, revision)),
    definition: definition.value?.schema === 'rus.trace_scenario_definition.v1'
      && definition.digest === TRACE_PHASE_1B_APPROVED_DEFINITION_DIGEST
      && definition.value.scenario_id === 'lower_dvina_trace_v1'
      && definition.value.revision === 16
      && definition.value.supersedes_definition_ref?.digest
      === historical.artifact_pins.definition.digest
      && resolved?.combat_semantic_bindings?.digest === combat.digest
      && resolved?.turn_step_bindings?.digest === steps.digest
      && resolved?.turn_10_companion_bindings?.digest === turn10.digest
      && resolved?.autonomous_semantic_bindings?.digest === autonomous.digest
      && resolved?.movement_bindings?.digest === movement.digest,
    phase1a: phase1a.value?.package_id === 'lower_dvina_trace_phase_1a_v12'
      && phase1a.digest === TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST
      && phase1a.value.revision === 12
      && phase1a.value.scenario_definition_revision === 16
      && phase1a.value.status === 'approved'
      && phase1a.value.fallback_policy === 'forbidden'
      && phase1a.value.superseded_package_ref?.digest
      === historical.artifact_pins.phase_1a_manifest.digest
      && phase1a.value.base_definition_ref?.digest === manifest.digest
      && exactContentRef(phase1a.value.content_refs?.materialization_bindings,
      bindings,
      `${SCENARIO_ROOT}/phase-1a-v12/materialization-bindings.json`,
      'lower_dvina_trace_phase_1a_materialization_bindings_v12', 12),
    bindings: bindings.value?.binding_set_id
      === 'lower_dvina_trace_phase_1a_materialization_bindings_v12'
      && bindings.value.revision === 12
      && bindings.value.scenario_definition_revision === 16
      && bindings.value.status === 'approved'
      && bindings.value.fallback_policy === 'forbidden'
      && bindings.value.normalization_policy === 'forbidden'
      && bindings.value.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest
      && bindings.value.reused_immutable_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest
      && bindings.value.binding_resolution_policy
        === 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
  };
}

function exactContentRef(ref, loaded, path, id, revision) {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest;
}
function exactRecord(actual, expected) {
  return JSON.stringify(Object.keys(actual ?? {}).sort())
      === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
function digestFileMap(files) {
  const payload = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}

function applySealedSelectionInventoryOverrides(inventory, overrides) {
  const result = structuredClone(inventory);
  if (!result || !overrides?.source_artifact_digests
      || !overrides.required_groups) return null;
  Object.assign(result.source_artifact_digests,
    overrides.source_artifact_digests);
  for (const group of result.required_groups ?? []) {
    const override = overrides.required_groups[group.selection_kind];
    if (override) Object.assign(group, override);
  }
  return result;
}
