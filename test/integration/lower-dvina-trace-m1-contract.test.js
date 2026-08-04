import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLowerDvinaTraceMaterializationBundle } from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { canonicalDigest } from '../../packages/materialization/src/core.js';
import { assertLowerDvinaTraceBundle } from '../../packages/materialization/src/lower-dvina-trace-contract.js';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

test('revision 13 admits the M1 wrapper while revision 12 keeps its exact contract', async () => {
  const phase6 = await loadPhase6Bundle();
  const m1 = toM1Bundle(phase6);
  assert.equal(assertLowerDvinaTraceBundle(phase6, inputFor(phase6)), phase6);
  assert.equal(assertLowerDvinaTraceBundle(m1, inputFor(m1)), m1);
});

test('revision 13 requires its turn-step artifact and exact revision 12 lineage', async () => {
  const bundle = toM1Bundle(await loadPhase6Bundle());
  const missingTurnSteps = structuredClone(bundle);
  delete missingTurnSteps.turn_step_bindings;
  assert.throws(
    () => assertLowerDvinaTraceBundle(missingTurnSteps, inputFor(missingTurnSteps)),
    (error) => error.code === 'TRACE_SCENARIO_ARTIFACT_INVALID'
  );

  const changedLineage = structuredClone(bundle);
  changedLineage.definition.supersedes_definition_ref.revision = 11;
  changedLineage.artifact_pins.definition.canonical_digest =
    canonicalDigest(changedLineage.definition);
  assert.throws(
    () => assertLowerDvinaTraceBundle(changedLineage, inputFor(changedLineage)),
    (error) => error.code === 'TRACE_M1_CUTOVER_IDENTITY_INVALID'
  );
});

function inputFor(bundle) {
  const spatial = bundle.location_topology_set.spatial_source_ref;
  return {
    scenario_id: bundle.scenario_id,
    scenario_definition_revision: bundle.definition_revision,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id: spatial.world_revision_id,
    world_catalog_digest: spatial.world_revision_catalog_digest
  };
}

function loadPhase6Bundle() {
  return loadLowerDvinaTraceMaterializationBundle({
    rootDir,
    scenarioDefinitionRevision: 12
  });
}

function toM1Bundle(phase6Bundle) {
  const bundle = structuredClone(phase6Bundle);
  const m1ContentDigest = '1'.repeat(64);
  const manifestDigest = '2'.repeat(64);
  const bindingsDigest = '3'.repeat(64);
  const definitionDigest = '4'.repeat(64);
  const turnStepsDigest = '5'.repeat(64);
  const ownerProfilesDigest = '6'.repeat(64);
  bundle.definition_revision = 13;
  bundle.manifest_digest = manifestDigest;
  bundle.m1_content_manifest_digest = m1ContentDigest;
  bundle.phase_1a_manifest = {
    schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
    package_id: 'lower_dvina_trace_phase_1a_v9',
    revision: 9,
    status: 'approved',
    scenario_id: bundle.scenario_id,
    scenario_definition_revision: 13,
    superseded_package_ref: {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8/manifest.json',
      id: 'lower_dvina_trace_phase_1a_v8',
      revision: 8,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
      digest: phase6Bundle.artifact_pins.phase_1a_manifest.digest
    },
    base_definition_ref: {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/manifest.json',
      package_id: 'lower_dvina_trace_m1_content_v1',
      revision: 1,
      schema: 'rus.lower_dvina_trace_m1_content_manifest.v1',
      digest: m1ContentDigest
    },
    content_refs: {
      materialization_bindings: {
        path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v9/materialization-bindings.json',
        id: 'lower_dvina_trace_phase_1a_materialization_bindings_v9',
        revision: 9,
        schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
        digest: bindingsDigest
      }
    },
    fallback_policy: 'forbidden'
  };
  const previousBindingRef = {
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8/materialization-bindings.json',
    id: 'lower_dvina_trace_phase_1a_materialization_bindings_v8',
    revision: 8,
    schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    digest: phase6Bundle.artifact_pins.materialization_bindings.digest
  };
  bundle.materialization_bindings = {
    ...bundle.materialization_bindings,
    binding_set_id: 'lower_dvina_trace_phase_1a_materialization_bindings_v9',
    revision: 9,
    scenario_definition_revision: 13,
    superseded_binding_ref: structuredClone(previousBindingRef),
    reused_immutable_binding_ref: structuredClone(previousBindingRef),
    sealed_selection_inventory_ref: {
      path: previousBindingRef.path,
      id: 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8',
      digest: previousBindingRef.digest
    }
  };
  bundle.turn_step_bindings = {
    schema: 'rus.lower_dvina_trace_turn_step_bindings.v1',
    binding_set_id: 'lower_dvina_trace_turn_step_bindings_v1',
    revision: 1,
    status: 'approved',
    scenario_id: bundle.scenario_id,
    scenario_definition_revision: 13,
    semantic_contract: 'turn_step_plan_v1',
    max_internal_steps: 8,
    exact_fast_path: 'preserved',
    legacy_bounded_fallback: 'forbidden',
    fallback_policy: 'forbidden',
    domain_bindings: [
      stepBinding('inspect_wreck',
        'lower_dvina_trace.inspect_wreck_in_detail', 'request_discovery'),
      stepBinding('follow_camp',
        'lower_dvina_trace.follow_path_to_fishing_camp', 'request_movement'),
      stepBinding('ask_eremey',
        'lower_dvina_trace.ask_eremey_about_wreck', 'emit_interaction'),
      stepBinding('show_clue',
        'lower_dvina_trace.show_clue_and_seek_eremey_cooperation',
        'emit_interaction'),
      stepBinding('follow_shed',
        'lower_dvina_trace.follow_known_route_to_drying_shed',
        'request_movement'),
      stepBinding('ratsha_surrender',
        'lower_dvina_trace.offer_conditional_protection_and_seek_surrender',
        'emit_interaction'),
      stepBinding('treat_onisim',
        'lower_dvina_trace.attempt_risky_first_aid_onisim',
        'request_activity'),
      stepBinding('carry_onisim',
        'lower_dvina_trace.make_stretcher_and_carry_onisim_to_camp',
        'request_activity')
    ]
  };
  bundle.turn_step_owner_profiles = {
    schema: 'rus.lower_dvina_trace_turn_step_owner_profiles.v1',
    profile_set_id: 'trace_ld_v1_turn_step_owner_profiles',
    revision: 1,
    status: 'approved',
    fallback_policy: 'forbidden'
  };
  bundle.definition = {
    ...bundle.definition,
    revision: 13,
    supersedes_definition_ref: {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-6-content/definition.json',
      id: bundle.scenario_id,
      revision: 12,
      digest: phase6Bundle.artifact_pins.definition.digest
    },
    resolved_policy_refs: {
      ...bundle.definition.resolved_policy_refs,
      turn_step_bindings: {
        owner: '@rus/turn',
        schema: 'rus.lower_dvina_trace_turn_step_bindings.v1',
        id: 'lower_dvina_trace_turn_step_bindings_v1',
        revision: 1,
        digest: turnStepsDigest
      },
      turn_step_owner_profiles: {
        owner: '@rus/turn',
        schema: 'rus.lower_dvina_trace_turn_step_owner_profiles.v1',
        id: 'trace_ld_v1_turn_step_owner_profiles',
        revision: 1,
        digest: ownerProfilesDigest
      }
    }
  };
  bundle.artifact_pins.phase_1a_manifest = artifactPin(
    'phase_1a_manifest', manifestDigest, bundle.phase_1a_manifest
  );
  bundle.artifact_pins.materialization_bindings = artifactPin(
    'materialization_bindings', bindingsDigest, bundle.materialization_bindings
  );
  bundle.artifact_pins.definition = artifactPin(
    'definition', definitionDigest, bundle.definition
  );
  bundle.artifact_pins.turn_step_bindings = artifactPin(
    'turn_step_bindings', turnStepsDigest, bundle.turn_step_bindings
  );
  bundle.artifact_pins.turn_step_owner_profiles = artifactPin(
    'turn_step_owner_profiles', ownerProfilesDigest,
    bundle.turn_step_owner_profiles
  );
  return bundle;
}

function artifactPin(key, digest, artifact) {
  return {
    key,
    digest,
    canonical_digest: canonicalDigest(artifact),
    schema: artifact.schema,
    revision: artifact.revision
  };
}

function stepBinding(bindingId, commandId, operation) {
  return {
    binding_id: `test_${bindingId}`,
    command_id: commandId,
    operation
  };
}
