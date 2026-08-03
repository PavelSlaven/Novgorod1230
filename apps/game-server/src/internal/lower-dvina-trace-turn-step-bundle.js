import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT_ROOT = `${ROOT}/phase-m1-content`;

export async function loadLowerDvinaTraceRevision13Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const [manifest, definition, turnBindings, ownerProfiles, phase1a,
    bindings, reused] =
    await Promise.all([
      readJson(rootDir, `${CONTENT_ROOT}/manifest.json`),
      readJson(rootDir, `${CONTENT_ROOT}/definition.json`),
      readJson(rootDir, `${CONTENT_ROOT}/turn-step-bindings.json`),
      readJson(rootDir, `${CONTENT_ROOT}/turn-step-owner-profiles.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v9/manifest.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v9/materialization-bindings.json`),
      readJson(rootDir, `${ROOT}/phase-1a-v8/materialization-bindings.json`)
    ]);
  assertRevision13Package({
    historical: historicalBundle,
    manifest,
    definition,
    turnBindings,
    ownerProfiles,
    phase1a,
    bindings,
    reused,
    fail
  });

  const historical = structuredClone(historicalBundle);
  const materializationBindings = {
    ...structuredClone(historical.materialization_bindings),
    schema: bindings.value.schema,
    binding_set_id: bindings.value.binding_set_id,
    revision: bindings.value.revision,
    status: bindings.value.status,
    scenario_id: bindings.value.scenario_id,
    scenario_definition_revision:
      bindings.value.scenario_definition_revision,
    superseded_binding_ref:
      structuredClone(bindings.value.superseded_binding_ref),
    reused_immutable_binding_ref:
      structuredClone(bindings.value.reused_immutable_binding_ref),
    binding_resolution_policy: bindings.value.binding_resolution_policy,
    fallback_policy: bindings.value.fallback_policy,
    normalization_policy: bindings.value.normalization_policy,
    sealed_selection_inventory_ref:
      structuredClone(bindings.value.sealed_selection_inventory_ref)
  };
  historical.definition_revision = 13;
  historical.manifest_digest = phase1a.digest;
  historical.m1_content_manifest_digest = manifest.digest;
  historical.phase_1a_manifest = phase1a.value;
  historical.definition = definition.value;
  historical.turn_step_bindings = turnBindings.value;
  historical.turn_step_owner_profiles = ownerProfiles.value;
  historical.materialization_bindings = materializationBindings;
  for (const [key, loaded, path, value] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v9/manifest.json`,
      phase1a.value],
    ['materialization_bindings', bindings,
      `${ROOT}/phase-1a-v9/materialization-bindings.json`,
      materializationBindings],
    ['definition', definition, `${CONTENT_ROOT}/definition.json`,
      definition.value],
    ['turn_step_bindings', turnBindings,
      `${CONTENT_ROOT}/turn-step-bindings.json`, turnBindings.value],
    ['turn_step_owner_profiles', ownerProfiles,
      `${CONTENT_ROOT}/turn-step-owner-profiles.json`, ownerProfiles.value]
  ]) {
    historical.artifact_pins[key] = {
      key,
      path,
      digest: loaded.digest,
      canonical_digest: canonicalDigest(value),
      schema: value.schema,
      revision: value.revision
    };
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

function assertRevision13Package({ historical, manifest, definition,
  turnBindings, ownerProfiles, phase1a, bindings, reused, fail }) {
  const manifestValue = manifest.value;
  const phase1aValue = phase1a.value;
  const bindingValue = bindings.value;
  if (manifestValue?.schema
      !== 'rus.lower_dvina_trace_m1_content_manifest.v1'
    || manifestValue.package_id !== 'lower_dvina_trace_m1_content_v1'
    || manifestValue.revision !== 1
    || manifestValue.scenario_definition_revision !== 13
    || manifestValue.status !== 'approved'
    || manifestValue.fallback_policy !== 'forbidden'
    || manifestValue.superseded_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || manifestValue.files?.['definition.json'] !== definition.digest
    || manifestValue.files?.['turn-step-bindings.json'] !== turnBindings.digest
    || manifestValue.files?.['turn-step-owner-profiles.json']
      !== ownerProfiles.digest
    || manifestValue.content_refs?.definition?.digest !== definition.digest
    || manifestValue.content_refs?.turn_step_bindings?.digest
      !== turnBindings.digest
    || manifestValue.content_refs?.turn_step_owner_profiles?.digest
      !== ownerProfiles.digest
    || definition.value?.revision !== 13
    || definition.value.supersedes_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || definition.value.resolved_policy_refs?.turn_step_bindings?.digest
      !== turnBindings.digest
    || definition.value.resolved_policy_refs?.turn_step_owner_profiles?.digest
      !== ownerProfiles.digest
    || turnBindings.value?.schema
      !== 'rus.lower_dvina_trace_turn_step_bindings.v1'
    || turnBindings.value.binding_set_id
      !== 'lower_dvina_trace_turn_step_bindings_v1'
    || turnBindings.value.revision !== 1
    || turnBindings.value.scenario_definition_revision !== 13
    || turnBindings.value.max_internal_steps !== 8
    || turnBindings.value.exact_fast_path !== 'preserved'
    || turnBindings.value.legacy_bounded_fallback !== 'forbidden'
    || turnBindings.value.fallback_policy !== 'forbidden'
    || turnBindings.value.domain_bindings?.length !== 8
    || ownerProfiles.value?.schema
      !== 'rus.lower_dvina_trace_turn_step_owner_profiles.v1'
    || ownerProfiles.value.profile_set_id
      !== 'trace_ld_v1_turn_step_owner_profiles'
    || ownerProfiles.value.revision !== 1
    || ownerProfiles.value.status !== 'approved'
    || ownerProfiles.value.fallback_policy !== 'forbidden'
    || phase1aValue?.package_id !== 'lower_dvina_trace_phase_1a_v9'
    || phase1aValue.revision !== 9
    || phase1aValue.scenario_definition_revision !== 13
    || phase1aValue.superseded_package_ref?.digest
      !== historical.artifact_pins.phase_1a_manifest.digest
    || phase1aValue.base_definition_ref?.digest !== manifest.digest
    || phase1aValue.content_refs?.materialization_bindings?.digest
      !== bindings.digest
    || bindingValue?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v9'
    || bindingValue.revision !== 9
    || bindingValue.scenario_definition_revision !== 13
    || bindingValue.superseded_binding_ref?.digest !== reused.digest
    || bindingValue.reused_immutable_binding_ref?.digest !== reused.digest
    || bindingValue.sealed_selection_inventory_ref?.digest !== reused.digest
    || bindingValue.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || bindingValue.fallback_policy !== 'forbidden'
    || bindingValue.normalization_policy !== 'forbidden'
    || reused.digest !== historical.artifact_pins.materialization_bindings.digest
    || reused.value?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v8') {
    fail('TRACE_M1_CONTENT_INVALID',
      'Exact approved M1 semantic-step content and cutover are required.');
  }
  const expectedBindings = new Map([
    ['lower_dvina_trace.inspect_wreck_in_detail',
      ['trace_ld_v1_step_inspect_wreck', 'request_discovery']],
    ['lower_dvina_trace.follow_path_to_fishing_camp',
      ['trace_ld_v1_step_follow_path_to_camp', 'request_movement']],
    ['lower_dvina_trace.ask_eremey_about_wreck',
      ['trace_ld_v1_step_ask_eremey', 'emit_interaction']],
    ['lower_dvina_trace.show_clue_and_seek_eremey_cooperation',
      ['trace_ld_v1_step_show_clue_to_eremey', 'emit_interaction']],
    ['lower_dvina_trace.follow_known_route_to_drying_shed',
      ['trace_ld_v1_step_follow_route_to_shed', 'request_movement']],
    ['lower_dvina_trace.offer_conditional_protection_and_seek_surrender',
      ['trace_ld_v1_step_negotiate_ratsha_surrender', 'emit_interaction']],
    ['lower_dvina_trace.attempt_risky_first_aid_onisim',
      ['trace_ld_v1_step_treat_onisim', 'request_activity']],
    ['lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp',
      ['trace_ld_v1_step_carry_onisim', 'request_activity']]
  ]);
  const actualBindings = turnBindings.value.domain_bindings;
  const actualCommands = new Set(actualBindings.map(
    ({ command_id: id }) => id
  ));
  const actualIds = new Set(actualBindings.map(
    ({ binding_id: id }) => id
  ));
  if (actualCommands.size !== expectedBindings.size
      || actualIds.size !== expectedBindings.size
      || actualBindings.some((binding) => {
        const expected = expectedBindings.get(binding.command_id);
        return expected == null
          || binding.binding_id !== expected[0]
          || binding.operation !== expected[1];
      })) {
    fail('TRACE_M1_CONTENT_INVALID',
      'M1 domain bindings must name the exact existing mechanics owners.');
  }
}

async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}
