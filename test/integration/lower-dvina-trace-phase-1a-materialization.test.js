import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATERIALIZER_VERSION,
  canonicalDigest,
  RNG_VERSION
} from '@rus/materialization';
import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import {
  assertLowerDvinaTraceSelectionClosure,
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp,
  validateLowerDvinaTracePlayerDossier
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  assertExactContentRef
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

const bundle = await loadLowerDvinaTraceMaterializationBundle();
const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);

function request(overrides = {}) {
  return {
    party_id: 'trace-phase-1a-unit-party',
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 7,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id: bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest: bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    domain_catalog_pin: domainCatalogPin,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
    idempotency_key: 'trace-phase-1a-unit-idempotency',
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    ...overrides
  };
}

test('canonical seed deterministically resolves the complete internal Phase 1A instance', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Math.random is forbidden'); };
  try {
    const left = materializeLowerDvinaTracePartyInstance(request());
    const right = materializeLowerDvinaTracePartyInstance(request());
    assert.deepEqual(left, right);
    assert.equal(left.trace.result_digest, computeMaterializationEnvelopeDigest(left));
    const changedEnvelope = structuredClone(left);
    changedEnvelope.immediate.body.values.health += 1;
    assert.notEqual(changedEnvelope.trace.result_digest, computeMaterializationEnvelopeDigest(changedEnvelope));
    assert.equal(left.immediate.player.dossier.identity.name, 'Микула');
    assert.deepEqual(left.immediate.timestamp, { whole_minutes: '333060', subminute_numerator: '0', subminute_denominator: '1' });
    assert.equal(left.hidden_truth.culprit_ref, 'zhdanko_storehouse_controller');
    assert.equal(left.hidden_truth.motive.motive_id, 'conceal_entrusted_goods_shortage');
    assert.equal(left.hidden_truth.sequence.hidden_sequence_candidate_id, 'trace_ld_v1_hidden_sequence_canonical_v1');
    assert.equal(left.immediate.items.length, 1);
    assert.equal(left.immediate.items[0].template_id, 'trace_ld_v1_item_mikula_knife');
    assert.equal(left.immediate.containers.length, 0);
    assert.equal(left.immediate.body.profile_id, 'trace_ld_v1_body_start_after_crash');
    assert.deepEqual(left.immediate.body.conditions, [
      'wet',
      'cold_with_possible_shivering',
      'headache',
      'shoulder_bruise'
    ]);
    assert.deepEqual(
      left.immediate.player.dossier.body.active_states.map(({ state }) => state),
      left.immediate.body.conditions
    );
    assert.equal(left.immediate.environment_snapshot.environment_profile_id, 'trace_ld_v1_env_cold_wet_shore');
    assert.equal('participants' in left.immediate, false);
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'participants').records.length, 6);
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'locations').records.length, 3);
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'items').records.length, 20);
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'clue_placements').records.length, 5);
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'body').records[0].selected_id, 'trace_ld_v1_body_start_after_crash');
    assert.equal(left.sealed_selections.find((item) => item.selection_kind === 'environment').records[0].selected_id, 'trace_ld_v1_env_cold_wet_shore');
    for (const evidence of left.sealed_selections.find((item) => item.selection_kind === 'evidence').records) {
      assert.equal(typeof evidence.discovery_slot_ref, 'string');
      assert.ok(evidence.causal_binding.location_refs.length > 0);
    }
    assert.equal(left.policy_profile_pins.length, 25);
    assert.ok(left.policy_profile_pins.some((pin) => pin.key === 'phase_1a_manifest'));
    assert.ok(left.policy_profile_pins.some((pin) => pin.key === 'materialization_bindings'));
    assert.equal(
      left.immediate.spatial.anchor.template_id,
      bundle.materialization_bindings.start_spatial_binding.anchor_template.template_id
    );
    assert.deepEqual(
      {
        npc_capacity: left.immediate.spatial.anchor.npc_capacity,
        item_capacity: left.immediate.spatial.anchor.item_capacity,
        container_capacity: left.immediate.spatial.anchor.container_capacity
      },
      {
        npc_capacity: 7,
        item_capacity: 0,
        container_capacity: 0
      }
    );
    assert.deepEqual(
      left.immediate.player.dossier.goals,
      bundle.materialization_bindings.player_dossier_projection.goals
    );
    assert.deepEqual(
      left.immediate.player.dossier.start_place_connection,
      bundle.materialization_bindings.player_dossier_projection.start_place_connection
    );
    assert.deepEqual(
      left.immediate.player.dossier.inventory.items[0].risk,
      bundle.materialization_bindings.player_dossier_projection
        .inventory_item_projections.trace_ld_v1_item_mikula_knife.risk
    );
    assert.deepEqual(left.immediate.player.dossier.inventory.total_weight, { grams: 400 });
    assert.equal(left.immediate.player.dossier.inventory.occupied_hands, 0);
    assert.equal(validateLowerDvinaTracePlayerDossier(left, bundle).pass, true);
  } finally {
    Math.random = originalRandom;
  }
});

test('profile contains six attributes, twelve approved skills and exact biography bases', () => {
  const result = materializeLowerDvinaTracePartyInstance(request());
  const dossier = result.immediate.player.dossier;
  assert.equal(Object.keys(dossier.attributes).length, 6);
  assert.equal(Object.keys(dossier.skills).length, 12);
  for (const [skillId, skill] of Object.entries(bundle.player_profile.skills)) {
    assert.deepEqual(dossier.skills[skillId], skill);
    assert.equal(Number.isInteger(skill.bonus), true);
    assert.equal(typeof (skill.basis ?? skill.absence_basis), 'string');
  }
  assert.equal(dossier.social_status.social_role_id, 'nov_role_merchant_clerk');
  assert.equal(dossier.social_status.occupation_id, 'nov_occ_merchant_clerk');
});

test('Phase 1A manifest binding ref is exact for path, id, revision, schema and raw digest', () => {
  const pin = bundle.artifact_pins.materialization_bindings;
  const expected = {
    path: pin.path,
    id: bundle.materialization_bindings.binding_set_id,
    revision: bundle.materialization_bindings.revision,
    schema: bundle.materialization_bindings.schema
  };
  const exact = { ...expected, digest: pin.digest };
  assert.doesNotThrow(() => assertExactContentRef(exact, pin, expected));
  for (const [key, value] of [
    ['path', 'unknown/materialization-bindings.json'],
    ['id', 'unknown_binding_set'],
    ['revision', 999],
    ['schema', 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v999'],
    ['digest', '0'.repeat(64)]
  ]) {
    assert.throws(
      () => assertExactContentRef({ ...exact, [key]: value }, pin, expected),
      { code: 'TRACE_SCENARIO_ARTIFACT_REF_MISMATCH' },
      `${key} mutation must fail closed`
    );
  }
});

test('Phase 1A revision 7 exact-supersedes every immutable revision 6 dependency', () => {
  assert.equal(bundle.definition_revision, 7);
  assert.equal(bundle.phase_1a_manifest.revision, 3);
  assert.equal(bundle.materialization_bindings.revision, 3);
  assert.equal(bundle.body_environment_profiles.revision, 4);
  for (const [artifactKey, mutate] of [
    [
      'phase_1a_manifest',
      (artifact) => {
        artifact.superseded_package_ref.digest = '0'.repeat(64);
      }
    ],
    [
      'materialization_bindings',
      (artifact) => {
        artifact.superseded_binding_ref.id = 'unknown_binding';
      }
    ],
    [
      'definition',
      (artifact) => {
        artifact.supersedes_definition_ref.revision = 4;
      }
    ],
    [
      'body_environment_profiles',
      (artifact) => {
        artifact.supersedes_ref.path = 'unknown/body-profiles.json';
      }
    ]
  ]) {
    const changed = structuredClone(bundle);
    mutate(changed[artifactKey]);
    changed.artifact_pins[artifactKey].canonical_digest =
      canonicalDigest(changed[artifactKey]);
    assert.throws(
      () => materializeLowerDvinaTracePartyInstance(request({
        scenario_bundle: changed
      })),
      { code: 'TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID' },
      artifactKey
    );
  }
});

test('candidate order does not affect selected IDs and every choice closes over its candidate set', () => {
  const reordered = structuredClone(bundle);
  reordered.player_profile_set.name_candidates.reverse();
  reordered.participant_profile_set.candidate_sets.reverse();
  for (const set of reordered.participant_profile_set.candidate_sets) set.candidates.reverse();
  reordered.location_topology_set.location_profiles.reverse();
  for (const location of reordered.location_topology_set.location_profiles) location.spatial_candidate_set.candidates.reverse();
  for (const [key, value] of Object.entries(reordered)) {
    if (reordered.artifact_pins?.[key]) reordered.artifact_pins[key].canonical_digest = canonicalDigest(value);
  }
  const left = materializeLowerDvinaTracePartyInstance(request());
  const right = materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: reordered }));
  assert.deepEqual(left.trace.choices.map((choice) => choice.selected_id), right.trace.choices.map((choice) => choice.selected_id));
  for (const choice of left.trace.choices) {
    assert.ok(choice.candidate_ids.includes(choice.selected_id));
    assert.equal(choice.candidate_digest, canonicalDigest(choice.candidate_ids));
  }
  for (const group of left.sealed_selections) {
    assert.match(group.source_pin.digest, /^[a-f0-9]{64}$/);
    for (const record of group.records) assert.match(record.record_digest, /^[a-f0-9]{64}$/);
  }
  const placementIds = left.sealed_selections.find((item) => item.selection_kind === 'clue_placements').records.map((record) => record.selected_id);
  assert.deepEqual(placementIds.sort(), bundle.item_container_set.placement_slots.map((record) => record.placement_slot_id).sort());
});

test('sealed selections match the exact approved group and record inventory', () => {
  const result = materializeLowerDvinaTracePartyInstance(request());
  const inventory = bundle.materialization_bindings.sealed_selection_inventory;
  assert.doesNotThrow(() => assertLowerDvinaTraceSelectionClosure(result.sealed_selections, inventory));

  for (const specification of inventory.required_groups) {
    const missingGroup = structuredClone(bundle);
    missingGroup.materialization_bindings.sealed_selection_inventory.required_groups =
      missingGroup.materialization_bindings.sealed_selection_inventory.required_groups
        .filter((value) => value.selection_kind !== specification.selection_kind);
    missingGroup.artifact_pins.materialization_bindings.canonical_digest =
      canonicalDigest(missingGroup.materialization_bindings);
    assert.throws(
      () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missingGroup })),
      { code: 'LATE_SELECTIONS_INCOMPLETE' },
      `missing ${specification.selection_kind} group must fail before Stage 24`
    );
  }

  const missingRecord = structuredClone(bundle);
  missingRecord.activity_check_consequence_profiles.activity_profiles.pop();
  missingRecord.artifact_pins.activity_check_consequence_profiles.canonical_digest =
    canonicalDigest(missingRecord.activity_check_consequence_profiles);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missingRecord })),
    { code: 'LATE_SELECTIONS_INCOMPLETE' }
  );

  for (const mutate of [
    (groups) => groups.push(structuredClone(groups[0])),
    (groups) => { groups[0].selection_kind = 'unexpected_group'; },
    (groups) => { groups[0].records = []; },
    (groups) => { groups[0].source_pin.digest = '0'.repeat(64); },
    (groups) => { groups.find((value) => value.selection_kind === 'body').records[0].record_digest = '0'.repeat(64); },
    (groups) => { groups.find((value) => value.selection_kind === 'environment').records[0].record_digest = '0'.repeat(64); }
  ]) {
    const invalidGroups = structuredClone(result.sealed_selections);
    mutate(invalidGroups);
    assert.throws(
      () => assertLowerDvinaTraceSelectionClosure(invalidGroups, inventory),
      { code: 'LATE_SELECTIONS_INCOMPLETE' }
    );
  }
});

test('tampered digest, missing mandatory record and damaged profile fail closed before write planning', () => {
  const badDigest = structuredClone(bundle);
  badDigest.artifact_pins.player_profile.canonical_digest = '0'.repeat(64);
  assert.throws(() => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: badDigest })), { code: 'TRACE_SCENARIO_ARTIFACT_INVALID' });

  const missing = structuredClone(bundle);
  missing.hidden_truth_candidate_set.motive_candidates = [];
  missing.artifact_pins.hidden_truth_candidate_set.canonical_digest = canonicalDigest(missing.hidden_truth_candidate_set);
  assert.throws(() => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missing })), { code: 'REQUIRED_CANDIDATE_SET_EMPTY' });

  const damaged = structuredClone(bundle);
  delete damaged.player_profile.skills.healing.absence_basis;
  damaged.artifact_pins.player_profile.canonical_digest = canonicalDigest(damaged.player_profile);
  const result = materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: damaged }));
  assert.throws(() => validateLowerDvinaTracePlayerDossier(result, damaged), { code: 'TRACE_PLAYER_PROFILE_SEMANTIC_VALIDATION_FAILED' });

  for (const artifactKey of Object.keys(bundle.artifact_pins)) {
    const incomplete = structuredClone(bundle);
    delete incomplete[artifactKey];
    assert.throws(
      () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: incomplete })),
      { code: 'TRACE_SCENARIO_ARTIFACT_INVALID' },
      `missing ${artifactKey} must fail closed`
    );
  }

  const unsupportedSchema = structuredClone(bundle);
  unsupportedSchema.definition.schema = 'rus.trace_scenario_definition.v2';
  unsupportedSchema.artifact_pins.definition.canonical_digest = canonicalDigest(unsupportedSchema.definition);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: unsupportedSchema })),
    { code: 'TRACE_SCENARIO_ARTIFACT_CONTRACT_UNSUPPORTED' }
  );

  const unknownParticipant = structuredClone(bundle);
  unknownParticipant.participant_profile_set.candidate_sets[1].candidates[0].profile_id = 'unknown_profile';
  unknownParticipant.artifact_pins.participant_profile_set.canonical_digest = canonicalDigest(unknownParticipant.participant_profile_set);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: unknownParticipant })),
    { code: 'PARTICIPANT_PROFILE_REF_INVALID' }
  );

  const missingParticipantDepth = structuredClone(bundle);
  delete missingParticipantDepth.participant_profile_set.profiles[0].initial_materialization_depth;
  missingParticipantDepth.artifact_pins.participant_profile_set.canonical_digest =
    canonicalDigest(missingParticipantDepth.participant_profile_set);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missingParticipantDepth })),
    { code: 'PARTICIPANT_MATERIALIZATION_DEPTH_MISSING' }
  );

  const missingCausalBasis = structuredClone(bundle);
  delete missingCausalBasis.participant_profile_set.profiles[0].causal_basis;
  missingCausalBasis.artifact_pins.participant_profile_set.canonical_digest =
    canonicalDigest(missingCausalBasis.participant_profile_set);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missingCausalBasis })),
    { code: 'MANDATORY_RECORD_INVALID' }
  );

  const missingPromiseId = structuredClone(bundle);
  delete missingPromiseId.promise_policy.policy_id;
  missingPromiseId.promise_policy.promise_policy_id = 'forbidden_alias';
  missingPromiseId.artifact_pins.promise_policy.canonical_digest =
    canonicalDigest(missingPromiseId.promise_policy);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: missingPromiseId })),
    { code: 'MANDATORY_RECORD_INVALID' }
  );

  const disconnectedEvidence = structuredClone(bundle);
  disconnectedEvidence.clue_evidence_graph_set.evidence_records[0].allowed_location_refs = ['unknown_location'];
  disconnectedEvidence.artifact_pins.clue_evidence_graph_set.canonical_digest = canonicalDigest(disconnectedEvidence.clue_evidence_graph_set);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: disconnectedEvidence })),
    { code: 'TRACE_SEMANTIC_REF_INVALID' }
  );

  const nonCausalSequence = structuredClone(bundle);
  nonCausalSequence.hidden_truth_candidate_set.sequence_candidates[0].event_templates[0].predecessor_refs = [
    'trace_ld_v1_hidden_event_14_player_wakes'
  ];
  nonCausalSequence.artifact_pins.hidden_truth_candidate_set.canonical_digest = canonicalDigest(nonCausalSequence.hidden_truth_candidate_set);
  assert.throws(
    () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: nonCausalSequence })),
    { code: 'HIDDEN_SEQUENCE_INVALID' }
  );

  for (const mutate of [
    (value) => { delete value.start_spatial_binding.anchor_template.template_id; },
    (value) => { delete value.start_spatial_binding.anchor_template.item_capacity; },
    (value) => { delete value.player_dossier_projection.goals.immediate_need; },
    (value) => { delete value.player_dossier_projection.start_place_connection.reason; },
    (value) => {
      delete value.player_dossier_projection
        .inventory_item_projections.trace_ld_v1_item_mikula_knife.use;
    },
    (value) => {
      value.player_dossier_projection
        .inventory_item_projections.trace_ld_v1_item_mikula_knife.risk.push('invented_risk');
    },
    (value) => { value.player_dossier_projection.property_and_access.rules.push('invented_rule'); },
    (value) => { value.player_dossier_projection.relations.push('invented_relation'); },
    (value) => { value.player_dossier_projection.approved_empty_collections[0] = 'unknown.path'; }
  ]) {
    const incompleteBinding = structuredClone(bundle);
    mutate(incompleteBinding.materialization_bindings);
    incompleteBinding.artifact_pins.materialization_bindings.canonical_digest =
      canonicalDigest(incompleteBinding.materialization_bindings);
    assert.throws(
      () => materializeLowerDvinaTracePartyInstance(request({ scenario_bundle: incompleteBinding })),
      { code: /TRACE_(?:START_SPATIAL|PLAYER_DOSSIER)_BINDING_INCOMPLETE/u }
    );
  }
});
