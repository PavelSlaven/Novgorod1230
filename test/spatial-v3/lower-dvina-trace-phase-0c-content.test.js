import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SCENARIO_ID } from '../../apps/game-server/src/runtime/first-playable/shared.js';

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c');
const checker = resolve('tools/world-catalog-workflow/src/lower-dvina-trace-phase-0c-check.mjs');
const files = [
  'definition.json',
  'item-container-set.json',
  'hidden-truth-candidate-set.json',
  'clue-evidence-graph-set.json',
  'knowledge-lie-memory-rules.json'
];
const contentKeys = Object.freeze({
  'definition.json': 'definition',
  'item-container-set.json': 'item_container_set',
  'hidden-truth-candidate-set.json': 'hidden_truth_candidate_set',
  'clue-evidence-graph-set.json': 'clue_evidence_graph_set',
  'knowledge-lie-memory-rules.json': 'knowledge_lie_memory_rules'
});
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => {
  writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);
};
const runChecker = (directory = source, validationOnly = directory !== source) => spawnSync(
  process.execPath,
  [
    checker,
    ...(validationOnly ? ['--validation-only', '--directory', directory] : [])
  ],
  { encoding: 'utf8' }
);

const refreshDigests = (directory) => {
  const itemDigest = digest(resolve(directory, 'item-container-set.json'));
  const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
  hidden.item_container_set_ref.digest = itemDigest;
  writeJson(directory, 'hidden-truth-candidate-set.json', hidden);

  const hiddenDigest = digest(resolve(directory, 'hidden-truth-candidate-set.json'));
  const evidence = readJson(directory, 'clue-evidence-graph-set.json');
  evidence.item_container_set_ref.digest = itemDigest;
  evidence.hidden_truth_candidate_set_ref.digest = hiddenDigest;
  writeJson(directory, 'clue-evidence-graph-set.json', evidence);

  const evidenceDigest = digest(resolve(directory, 'clue-evidence-graph-set.json'));
  const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
  knowledge.hidden_truth_candidate_set_ref.digest = hiddenDigest;
  knowledge.clue_evidence_graph_set_ref.digest = evidenceDigest;
  writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);

  const knowledgeDigest = digest(resolve(directory, 'knowledge-lie-memory-rules.json'));
  const definition = readJson(directory, 'definition.json');
  definition.item_container_set_ref.digest = itemDigest;
  definition.hidden_truth_candidate_set_ref.digest = hiddenDigest;
  definition.clue_evidence_graph_set_ref.digest = evidenceDigest;
  definition.knowledge_lie_memory_rules_ref.digest = knowledgeDigest;
  writeJson(directory, 'definition.json', definition);

  const manifest = readJson(directory, 'manifest.json');
  for (const name of files) {
    const value = digest(resolve(directory, name));
    manifest.files[name] = value;
    manifest.content_refs[contentKeys[name]].digest = value;
  }
  writeJson(directory, 'manifest.json', manifest);
};

const deriveChain = (chain, availableEvidenceRefs) => {
  const derived = new Set(availableEvidenceRefs);
  let changed = true;
  while (changed) {
    changed = false;
    for (const inference of chain.inference_nodes) {
      if (derived.has(inference.node_ref)) continue;
      const matchingCount = inference.input_refs.filter((ref) => derived.has(ref)).length;
      const satisfied = inference.operator === 'all_of'
        ? matchingCount === inference.input_refs.length
        : inference.operator === 'any_of'
          ? matchingCount >= 1
          : matchingCount >= inference.min_count;
      if (satisfied) {
        derived.add(inference.node_ref);
        changed = true;
      }
    }
  }
  return derived;
};
const evaluatePrincipalOutcome = (evidence, availableEvidenceRefs) => {
  const byId = new Map(evidence.evidence_chains.map((chain) => [chain.chain_id, chain]));
  const policy = evidence.principal_inference_policy;
  const confirmedLines = new Set(policy.cross_chain_inference.input_chain_terminal_refs.filter(
    ({ chain_ref, terminal_conclusion }) =>
      deriveChain(byId.get(chain_ref), availableEvidenceRefs)
        .has(`conclusion:${terminal_conclusion}`)
  ).map(({ chain_ref }) => chain_ref));
  const admitted = policy.cross_chain_inference.approved_combinations.filter(
    ({ chain_refs }) => chain_refs.every((chainRef) => confirmedLines.has(chainRef))
  );
  return admitted.find(({ outcome_kind }) => outcome_kind === 'full_principal_established')
    ?? admitted.find(({ outcome_kind }) => outcome_kind === 'partial_principal_corroborated')
    ?? null;
};
const principalIsEstablished = (evidence, availableEvidenceRefs) =>
  evaluatePrincipalOutcome(evidence, availableEvidenceRefs)?.outcome_kind
    === 'full_principal_established';

const withFixture = (callback) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0c-'));
  cpSync(source, directory, { recursive: true });
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const expectSemanticFailure = (mutate, expectedMessage) => withFixture((directory) => {
  mutate(directory);
  refreshDigests(directory);
  const result = runChecker(directory);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, expectedMessage);
});

test('1. full phase 0C package passes its trusted checker', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    package_id: 'lower_dvina_trace_phase_0c_v1',
    revision: 3,
    content_digest: digest(resolve(source, 'manifest.json')),
    unresolved_0d_count: 9
  });
});

test('2. manifest file digests and checker output are reproducible', () => {
  const manifest = readJson(source, 'manifest.json');
  for (const name of files) {
    assert.equal(manifest.files[name], digest(resolve(source, name)));
  }
  assert.equal(runChecker().stdout, runChecker().stdout);
});

test('3. revision 3 exact-supersedes immutable revision 2', () => {
  const definition = readJson(source, 'definition.json');
  const revision2 = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/definition.json');
  assert.deepEqual(definition.supersedes_definition_ref, {
    id: 'lower_dvina_trace_v1',
    revision: 2,
    digest: digest(revision2)
  });
});

test('4. revision 3 preserves exact 0A and 0B refs', () => {
  const current = readJson(source, 'definition.json');
  const previous = readJson(
    resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b'),
    'definition.json'
  );
  for (const key of [
    'player_profile_set_ref',
    'social_catalog_source_ref',
    'spatial_source_ref',
    'participant_profile_set_ref',
    'location_topology_set_ref'
  ]) {
    assert.deepEqual(current[key], previous[key]);
  }
});

test('manifest immutable dependency and superseded-definition paths are exact', () => {
  expectSemanticFailure((directory) => {
    const manifest = readJson(directory, 'manifest.json');
    manifest.immutable_dependency_refs.phase_0b_participant_profile_set.path =
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/definition.json';
    writeJson(directory, 'manifest.json', manifest);
  }, /TRACE_0C_IMMUTABLE_DEPENDENCY/u);
  expectSemanticFailure((directory) => {
    const manifest = readJson(directory, 'manifest.json');
    manifest.superseded_definition_ref.path =
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/participant-profile-set.json';
    writeJson(directory, 'manifest.json', manifest);
  }, /TRACE_0C_SUPERSEDES/u);
});

test('5. exactly four phase 0C gaps are closed by exact content refs', () => {
  const definition = readJson(source, 'definition.json');
  const unresolved = definition.required_unresolved_refs.map(({ category }) => category);
  for (const category of [
    'item_container_set',
    'hidden_truth_candidate_set',
    'clue_evidence_graph_set',
    'knowledge_lie_memory_rules'
  ]) {
    assert.equal(unresolved.includes(category), false);
    assert.ok(definition[`${category}_ref`]);
  }
});

test('6. every phase 0D ref remains unresolved_required', () => {
  const definition = readJson(source, 'definition.json');
  assert.equal(definition.required_unresolved_refs.length, 9);
  assert.ok(definition.required_unresolved_refs.every((gap) =>
    gap.planned_phase === '0D'
      && gap.required_status === 'unresolved_required'
      && gap.resolution_status === 'unresolved'));
  const activityCheckGap = definition.required_unresolved_refs.find(
    ({ category }) => category === 'activity_check_consequence_profiles'
  );
  assert.deepEqual(activityCheckGap.required_contracts, [
    'check_outcome_to_admitted_evidence_bundle',
    'failed_check_bundle_to_approved_full_or_partial_outcome'
  ]);
  const completionRulesGap = definition.required_unresolved_refs.find(
    ({ category }) => category === 'completion_rules'
  );
  assert.deepEqual(completionRulesGap.required_contracts, [
    'evidence_resolution_outcome_to_completion_state'
  ]);
});

test('7. singleton approved hidden truth candidate is explicit and unselected', () => {
  const hidden = readJson(source, 'hidden-truth-candidate-set.json');
  assert.equal(hidden.selection_policy, 'singleton_approved_candidate');
  assert.equal(hidden.sequence_candidates.length, 1);
  assert.equal(hidden.sequence_candidates[0].event_templates.length, 15);
  assert.equal(Object.hasOwn(hidden, 'party_selection'), false);
  assert.equal(Object.hasOwn(hidden, 'party_id'), false);
  assert.equal(Object.hasOwn(hidden, 'seed'), false);
  assert.deepEqual(hidden.event_instances, []);
});

test('Onisim voice testimony has an approved hidden event and auditory perception source', () => {
  const hidden = readJson(source, 'hidden-truth-candidate-set.json');
  const knowledge = readJson(source, 'knowledge-lie-memory-rules.json');
  const evidence = readJson(source, 'clue-evidence-graph-set.json');
  const event = hidden.sequence_candidates[0].event_templates.find(
    ({ event_template_id }) =>
      event_template_id === 'trace_ld_v1_hidden_event_04_zhdanko_audible_command'
  );
  const perception = knowledge.perception_source_templates[0];
  const statement = knowledge.statement_templates.find(
    ({ statement_template_id }) =>
      statement_template_id === 'trace_ld_v1_statement_onisim_testimony'
  );
  const testimony = evidence.evidence_records.find(
    ({ evidence_id }) => evidence_id === 'trace_ld_v1_evidence_onisim_testimony'
  );
  assert.equal(event.audible_action_contract.speaker_ref, 'zhdanko_storehouse_controller');
  assert.deepEqual(event.audible_action_contract.audible_to_refs, ['onisim_boatman']);
  assert.equal(perception.source_hidden_event_ref, event.event_template_id);
  assert.equal(perception.perceiver_ref, 'onisim_boatman');
  assert.equal(perception.source_type, 'direct_perception');
  assert.deepEqual(statement.source_perception_template_refs, [perception.perception_template_id]);
  assert.deepEqual(testimony.source_fact_refs, [
    `hidden_event:${event.event_template_id}`,
    `perception_template:${perception.perception_template_id}`,
    'statement_slot:trace_ld_v1_statement_onisim_testimony'
  ]);
});

test('8. physical, testimonial, and documentary evidence chains exist independently', () => {
  const evidence = readJson(source, 'clue-evidence-graph-set.json');
  assert.deepEqual(
    evidence.evidence_chains.map(({ independence_class }) => independence_class),
    ['physical', 'testimonial', 'documentary']
  );
  assert.equal(evidence.evidence_records.length, 12);
  assert.equal(evidence.principal_inference_policy.minimum_independent_chain_count, 2);
  const chainsById = new Map(evidence.evidence_chains.map((chain) => [chain.chain_id, chain]));
  for (const combination of evidence.principal_inference_policy.cross_chain_inference
    .approved_combinations.filter(({ outcome_kind }) => outcome_kind === 'full_principal_established')) {
    const [left, right] = combination.chain_refs.map(
      (chainRef) => new Set(chainsById.get(chainRef).leaf_evidence_refs)
    );
    assert.deepEqual([...left].filter((evidenceRef) => right.has(evidenceRef)), []);
  }
  const weakEvidenceRefs = [
    'trace_ld_v1_evidence_cut_fastening',
    'trace_ld_v1_evidence_side_dent',
    'trace_ld_v1_evidence_second_boat_trace',
    'trace_ld_v1_evidence_blue_wool',
    'trace_ld_v1_evidence_bag_at_zhdanko',
    'trace_ld_v1_evidence_ratsha_confession'
  ];
  for (const evidenceRef of weakEvidenceRefs) {
    for (const chain of evidence.evidence_chains) {
      const derived = deriveChain(chain, [evidenceRef]);
      assert.equal(derived.has('conclusion:ratsha_participated'), false, evidenceRef);
      assert.equal(derived.has('conclusion:principal_zhdanko_physical_line'), false, evidenceRef);
      assert.equal(derived.has('conclusion:principal_zhdanko_testimonial_line'), false, evidenceRef);
    }
    assert.equal(principalIsEstablished(evidence, [evidenceRef]), false, evidenceRef);
  }
  const anonymousBlueWoolAttackSet = [
    'trace_ld_v1_evidence_blue_wool',
    'trace_ld_v1_evidence_cut_fastening',
    'trace_ld_v1_evidence_side_dent'
  ];
  const physicalChain = chainsById.get('trace_ld_v1_chain_physical_to_ratsha_to_bag');
  assert.equal(
    deriveChain(physicalChain, anonymousBlueWoolAttackSet).has('conclusion:ratsha_participated'),
    false
  );
  assert.equal(
    deriveChain(physicalChain, [
      ...anonymousBlueWoolAttackSet,
      'binding_slot:trace_ld_v1_binding_blue_wool_to_ratsha_caftan'
    ]).has('conclusion:ratsha_participated'),
    true
  );
  assert.equal(
    principalIsEstablished(evidence, [
      ...evidence.evidence_records.map(({ evidence_id }) => evidence_id),
      ...evidence.identity_binding_evidence_slots.map(
        ({ binding_slot_id }) => `binding_slot:${binding_slot_id}`
      )
    ]),
    true
  );
});

test('documentary motive requires an external committed reconciliation result', () => {
  const evidence = readJson(source, 'clue-evidence-graph-set.json');
  const documentary = evidence.evidence_chains.find(
    ({ chain_id }) => chain_id === 'trace_ld_v1_chain_document_reconciliation_motive'
  );
  const reconciliationRef = 'terminal_slot:trace_ld_v1_future_goods_reconciliation';
  const physicalInputs = [
    'trace_ld_v1_evidence_bag_at_zhdanko',
    'trace_ld_v1_evidence_intact_seal'
  ];
  const withoutReconciliation = deriveChain(documentary, physicalInputs);
  assert.equal(
    documentary.inference_nodes.some(({ node_ref }) => node_ref === reconciliationRef),
    false
  );
  assert.equal(withoutReconciliation.has(reconciliationRef), false);
  assert.equal(
    withoutReconciliation.has('conclusion:conceal_entrusted_goods_shortage'),
    false
  );
  assert.equal(
    deriveChain(documentary, [...physicalInputs, reconciliationRef])
      .has('conclusion:principal_zhdanko_documentary_line'),
    true
  );
  assert.deepEqual(documentary.admitted_terminal_slot_refs, [reconciliationRef]);
  assert.deepEqual(evidence.terminal_evidence_slots, [{
    terminal_slot_id: 'trace_ld_v1_future_goods_reconciliation',
    kind: 'future_goods_reconciliation',
    owner: '@rus/visibility-knowledge-memory',
    input_mode: 'external_committed_input_only',
    commitment_status_required: 'committed',
    may_be_inferred: false,
    required_prerequisite_refs: [
      'conclusion:stolen_bag_at_zhdanko',
      'conclusion:packet_seal_intact'
    ],
    absence_policy: 'fail_closed_no_motive_conclusion',
    runtime_status: 'not_implemented',
    planned_phase: 'later_completion_phase'
  }]);
});

test('declared evidence-record loss yields its scoped approved full or typed partial outcome', () => {
  const evidence = readJson(source, 'clue-evidence-graph-set.json');
  const allRefs = [
    ...evidence.evidence_records.map(({ evidence_id }) => evidence_id),
    ...evidence.identity_binding_evidence_slots.map(
      ({ binding_slot_id }) => `binding_slot:${binding_slot_id}`
    ),
    ...evidence.terminal_evidence_slots.map(
      ({ terminal_slot_id }) => `terminal_slot:${terminal_slot_id}`
    )
  ];
  for (const contract of evidence.scoped_evidence_loss_outcome_contracts) {
    const outcome = evaluatePrincipalOutcome(
      evidence,
      allRefs.filter((ref) => !contract.excluded_refs.includes(ref))
    );
    assert.equal(outcome?.combination_id, contract.required_combination_ref, contract.failure_case);
    assert.equal(outcome?.outcome_kind, contract.required_outcome_kind, contract.failure_case);
    if (contract.required_partial_outcome_ref === undefined) {
      assert.equal(outcome?.outcome_ref, 'conclusion:principal_zhdanko', contract.failure_case);
    } else {
      assert.equal(
        outcome?.outcome_ref,
        `partial_outcome:${contract.required_partial_outcome_ref}`,
        contract.failure_case
      );
    }
  }
  assert.deepEqual(evidence.principal_inference_policy.partial_outcomes, [{
    partial_outcome_id: 'trace_ld_v1_principal_without_direct_voice',
    resolution_status: 'partial_evidence_resolution',
    establishes: [
      'ratsha_participated',
      'stolen_bag_at_zhdanko',
      'conceal_entrusted_goods_shortage'
    ],
    does_not_establish: [
      'direct_zhdanko_voice_connection',
      'full_principal_zhdanko'
    ],
    resolution_scope: 'evidence_strength_only_no_completion_state'
  }]);
});

test('9. item property and weapon contracts separate owner, holder, and controller', () => {
  const items = readJson(source, 'item-container-set.json');
  const packet = items.item_templates.find(({ item_template_id }) =>
    item_template_id === 'trace_ld_v1_item_sealed_packet');
  assert.deepEqual(Object.keys(packet.property_state_template), [
    'owner_ref',
    'holder_ref',
    'controller_ref',
    'legal_status'
  ]);
  for (const weapon of items.item_templates.filter(({ weapon_contract }) => weapon_contract)) {
    assert.ok(weapon.weapon_contract.owner_ref);
    assert.ok(weapon.weapon_contract.holder_ref);
    assert.ok(weapon.weapon_contract.controller_ref);
    assert.ok(weapon.weapon_contract.accessibility);
  }
});

test('road bag selection is distinct from required debris containers', () => {
  const items = readJson(source, 'item-container-set.json');
  const candidateSets = new Map(
    items.container_candidate_sets.map((candidateSet) => [
      candidateSet.candidate_set_id,
      candidateSet
    ])
  );
  assert.deepEqual(candidateSets.get('trace_ld_v1_road_bag_candidates'), {
    candidate_set_id: 'trace_ld_v1_road_bag_candidates',
    required: true,
    selection_policy: 'singleton_approved',
    required_count: 1,
    slot_binding_ref: 'container_slot:trace_ld_v1_entrusted_road_bag',
    candidate_ids: ['trace_ld_v1_container_road_bag']
  });
  assert.deepEqual(candidateSets.get('trace_ld_v1_required_debris_container_templates'), {
    candidate_set_id: 'trace_ld_v1_required_debris_container_templates',
    required: true,
    selection_policy: 'all_approved_templates',
    materialization_semantics: 'required_template_set',
    candidate_ids: ['trace_ld_v1_container_empty_birch_bark']
  });
});

test('opening state moves the road bag and derives contained-item physical state', () => {
  const items = readJson(source, 'item-container-set.json');
  const opening = items.pre_game_opening_state_contract;
  assert.deepEqual(opening.container_opening_state, {
    owner_ref: 'trace_ld_v1_external_owner_savva_tverdich',
    holder_ref: 'zhdanko_storehouse_controller',
    controller_ref: 'zhdanko_storehouse_controller',
    placement_location_ref: 'trace_ld_v1_loc_zhdanko_storehouse'
  });
  assert.deepEqual(opening.exact_content_item_refs, [
    'trace_ld_v1_item_sealed_packet',
    'trace_ld_v1_item_wet_cloak',
    'trace_ld_v1_item_writing_tablet'
  ]);
  assert.equal(
    opening.content_physical_parent_contract.physical_placement_derivation,
    'inherit_parent_container_path'
  );
  assert.equal(opening.sealed_packet_opening_state.seal_state, 'intact');
});

test('Onisim binding rope is separate while Zhdanko rope remains at the storehouse', () => {
  const items = readJson(source, 'item-container-set.json');
  assert.deepEqual(items.pre_game_binding_rope_opening_state_contract, {
    contract_id: 'trace_ld_v1_opening_state_ratsha_binding_rope_onisim',
    derived_from_hidden_event_ref: 'trace_ld_v1_hidden_event_10_onisim_bound_and_moved',
    derived_from_transition_ref: 'trace_ld_v1_transition_ratsha_binding_rope_pre_game_use',
    item_ref: 'trace_ld_v1_item_ratsha_binding_rope',
    owner_ref: null,
    holder_ref: 'onisim_boatman',
    controller_ref: 'ratsha_storehouse_helper',
    placement_location_ref: 'trace_ld_v1_loc_old_drying_shed',
    use_state: 'binding_onisim',
    application_status: 'template_only'
  });
  assert.equal(
    items.late_scene_rope_availability_contract.placement_location_ref,
    'trace_ld_v1_loc_zhdanko_storehouse'
  );
  assert.equal(
    items.late_scene_rope_availability_contract.holder_ref,
    'zhdanko_storehouse_controller'
  );
  assert.equal(items.late_scene_rope_availability_contract.automatic_transport_from_onisim_scene, false);
  assert.equal(
    items.transition_templates.some(
      ({ item_template_ref }) => item_template_ref === 'trace_ld_v1_item_zhdanko_rope'
    ),
    false
  );
});

test('confession and denial bind required listeners plus one participating-fisher slot', () => {
  const knowledge = readJson(source, 'knowledge-lie-memory-rules.json');
  const statements = new Map(
    knowledge.statement_templates.map((statement) => [statement.statement_template_id, statement])
  );
  const slotRef = 'trace_ld_v1_audience_slot_participating_fisher';
  assert.deepEqual(
    statements.get('trace_ld_v1_statement_ratsha_confession').audience_candidate_slot_refs,
    [slotRef]
  );
  assert.deepEqual(
    statements.get('trace_ld_v1_statement_zhdanko_denial').required_audience_refs,
    ['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper']
  );
  assert.equal(
    knowledge.audience_candidate_slots[0].unselected_candidates_receive_statement_perception,
    false
  );
  assert.equal(knowledge.testimony_contract.absent_participants_receive_knowledge, false);
  assert.equal(
    knowledge.promise_memory_compatibility_slot.participating_fisher_witness_slot_ref,
    slotRef
  );
  assert.equal(
    Object.hasOwn(
      knowledge.promise_memory_compatibility_slot,
      'participating_fisher_witness_candidate_refs'
    ),
    false
  );
});

test('10. new scenario stays unpublished, non-materializable, and non-publishable', () => {
  const definition = readJson(source, 'definition.json');
  assert.equal(definition.publication_status, 'unpublished');
  assert.deepEqual(definition.readiness, {
    schema: 'rus.trace_scenario_readiness.v1',
    version: 1,
    phase_status: 'phase_0_incomplete',
    materialization_status: 'not_materializable',
    publication_status: 'not_publishable'
  });
});

test('11. existing boatman scenario ID remains unchanged', () => {
  assert.equal(SCENARIO_ID, 'lower_dvina_late_summer_open_water_v1');
});

test('12. empty required item candidate set is rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.item_candidate_sets[0].candidate_ids = [];
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_ITEM_SET_EMPTY/u);
});

test('unknown, extra, and duplicated item candidate sets are rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.item_candidate_sets.push({
      candidate_set_id: 'trace_ld_v1_unknown_item_set',
      required: true,
      selection_policy: 'all_approved_templates',
      candidate_ids: ['trace_ld_v1_item_sealed_packet']
    });
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_ITEM_CANDIDATE_SET/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.item_candidate_sets[0].candidate_ids[0] = 'trace_ld_v1_item_unknown';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_ITEM_CANDIDATE_SET/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.item_candidate_sets.push({
      ...items.item_candidate_sets[0],
      candidate_ids: [...items.item_candidate_sets[0].candidate_ids]
    });
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_ITEM_CANDIDATE_SET/u);
});

test('ambiguous road-bag and debris-container candidate sets are rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.container_candidate_sets.find(
      ({ candidate_set_id }) => candidate_set_id === 'trace_ld_v1_road_bag_candidates'
    ).candidate_ids.push('trace_ld_v1_container_empty_birch_bark');
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CONTAINER_CANDIDATE_SET/u);
});

test('13. unknown item ref is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].event_templates[0].item_refs = ['trace_ld_v1_item_unknown'];
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_UNKNOWN_ITEM/u);
});

test('14. unknown participant ref is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].actor_bindings.principal = 'unknown_participant';
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_HIDDEN_PRINCIPAL|TRACE_0C_PARTICIPANT_REF/u);
});

test('15. unknown location ref is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].event_templates[0].location_refs = ['unknown_location'];
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_LOCATION_REF/u);
});

test('16. manifest digest mismatch is rejected before semantic resolution', () => {
  withFixture((directory) => {
    appendFileSync(resolve(directory, 'item-container-set.json'), '\n');
    const result = runChecker(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TRACE_0C_DIGEST_MISMATCH/u);
  });
});

test('17. theft transition that changes owner is rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.transition_templates[0].owner_sequence[1] = 'ratsha_storehouse_helper';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_THEFT_OWNER_CHANGE/u);
});

test('contradictory bag or contained-item opening state is rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.pre_game_opening_state_contract.container_opening_state.holder_ref = 'player_clerk';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_OPENING_ITEM_STATE/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.pre_game_opening_state_contract
      .content_physical_parent_contract.physical_placement_derivation = 'independent_item_placement';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_OPENING_ITEM_STATE/u);
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    const delivery = hidden.sequence_candidates[0].event_templates.find(
      ({ event_template_id }) => event_template_id === 'trace_ld_v1_hidden_event_11_bag_delivered'
    );
    delivery.transfer.subject_ref = 'trace_ld_v1_item_sealed_packet';
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_OPENING_ITEM_STATE/u);
});

test('container relations must match the exact target container contracts', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.container_relation_templates.find(
      ({ item_template_ref }) => item_template_ref === 'trace_ld_v1_item_sealed_packet'
    ).container_template_ref = 'trace_ld_v1_container_empty_birch_bark';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CONTAINER_CONTRACT/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    delete items.item_templates.find(
      ({ item_template_id }) => item_template_id === 'trace_ld_v1_item_wet_cloak'
    ).container_contract;
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CONTAINER_CONTRACT/u);
});

test('Onisim binding cannot reuse or transport Zhdanko rope', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    const binding = hidden.sequence_candidates[0].event_templates.find(
      ({ event_template_id }) => event_template_id === 'trace_ld_v1_hidden_event_10_onisim_bound_and_moved'
    );
    binding.controlled_item_use.item_ref = 'trace_ld_v1_item_zhdanko_rope';
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_CONTROLLED_ITEM_USE/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.pre_game_binding_rope_opening_state_contract.holder_ref = 'zhdanko_storehouse_controller';
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CONTROLLED_ITEM_USE/u);
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    items.transition_templates.push({
      transition_template_id: 'trace_ld_v1_transition_forbidden_zhdanko_rope_transport',
      kind: 'controlled_item_recovery_transfer',
      item_template_ref: 'trace_ld_v1_item_zhdanko_rope',
      holder_sequence: ['zhdanko_storehouse_controller', 'player_clerk'],
      controller_sequence: ['zhdanko_storehouse_controller', 'player_clerk'],
      owner_sequence: ['zhdanko_storehouse_controller', 'zhdanko_storehouse_controller'],
      placement_location_sequence: [
        'trace_ld_v1_loc_zhdanko_storehouse',
        'trace_ld_v1_loc_old_drying_shed'
      ],
      application_status: 'template_only'
    });
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CONTROLLED_ITEM_USE/u);
});

test('Onisim voice evidence fails closed without the approved perception chain', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    const event = hidden.sequence_candidates[0].event_templates.find(
      ({ event_template_id }) =>
        event_template_id === 'trace_ld_v1_hidden_event_04_zhdanko_audible_command'
    );
    event.audible_action_contract.speaker_ref = 'ratsha_storehouse_helper';
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_ONISIM_VOICE_SOURCE/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    const statement = knowledge.statement_templates.find(
      ({ statement_template_id }) =>
        statement_template_id === 'trace_ld_v1_statement_onisim_testimony'
    );
    statement.source_perception_template_refs = [];
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_ONISIM_VOICE_SOURCE/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const testimony = evidence.evidence_records.find(
      ({ evidence_id }) => evidence_id === 'trace_ld_v1_evidence_onisim_testimony'
    );
    testimony.source_fact_refs = ['statement_slot:trace_ld_v1_statement_onisim_testimony'];
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_ONISIM_VOICE_SOURCE/u);
});

test('18. one item assigned to two container refs is rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    const packet = items.item_templates.find(({ item_template_id }) =>
      item_template_id === 'trace_ld_v1_item_sealed_packet');
    packet.initial_container_refs = [
      'trace_ld_v1_container_road_bag',
      'trace_ld_v1_container_second_bag'
    ];
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_MULTIPLE_CONTAINERS/u);
});

test('19. clue without a placement slot is rejected', () => {
  expectSemanticFailure((directory) => {
    const items = readJson(directory, 'item-container-set.json');
    delete items.item_templates.find(({ semantic_category }) =>
      semantic_category === 'blue_wool_clue').placement_slot_ref;
    writeJson(directory, 'item-container-set.json', items);
  }, /TRACE_0C_CLUE_PLACEMENT/u);
});

test('20. cyclic hidden sequence is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].event_templates[0].predecessor_refs = [
      'trace_ld_v1_hidden_event_14_player_wakes'
    ];
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_HIDDEN_CYCLE|TRACE_0C_HIDDEN_ORDER/u);
});

test('hidden event cannot depend on a noncyclic later-order event', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].event_templates.find(
      ({ event_template_id }) => event_template_id === 'trace_ld_v1_hidden_event_08_player_unconscious'
    ).predecessor_refs = ['trace_ld_v1_hidden_event_09_onisim_reaches_shore'];
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_HIDDEN_ORDER/u);
});

test('21. hidden event without causal basis is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    hidden.sequence_candidates[0].event_templates[5].causal_basis = '';
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_HIDDEN_CAUSAL_BASIS/u);
});

test('22. hidden sequence without principal is rejected', () => {
  expectSemanticFailure((directory) => {
    const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
    delete hidden.sequence_candidates[0].actor_bindings.principal;
    writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
  }, /TRACE_0C_HIDDEN_PRINCIPAL/u);
});

test('23. evidence graph with dangling item ref is rejected', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.evidence_records[0].allowed_item_refs = ['trace_ld_v1_item_unknown'];
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_DANGLING/u);
});

test('24. missing required evidence chain is rejected', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.evidence_chains.pop();
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_CHAIN/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.evidence_chains[0].edge_pairs = evidence.evidence_chains[0].edge_pairs.filter(
      ([, target]) => target !== 'conclusion:principal_zhdanko_physical_line'
    );
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_AGGREGATION/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.evidence_chains[0].terminal_conclusion = 'arbitrary_conclusion';
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_CHAIN/u);
});

test('25. single evidence directly establishing principal is rejected', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.evidence_records[0].supports.push('principal_zhdanko');
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_SINGLE_EVIDENCE_PRINCIPAL/u);
});

test('26. confession as sole principal evidence is rejected', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.principal_inference_policy.minimum_independent_chain_count = 1;
    evidence.principal_inference_policy.confession_sufficient_alone = true;
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_CONFESSION_ONLY/u);
});

test('declared scoped evidence-loss outcomes must be derivable from the graph', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const testimonial = evidence.evidence_chains.find(
      ({ chain_id }) => chain_id === 'trace_ld_v1_chain_witnesses_confession_voice'
    );
    testimonial.inference_nodes.find(
      ({ node_ref }) => node_ref === 'conclusion:ratsha_participated'
    ).min_count = 3;
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_SCOPED_EVIDENCE_LOSS/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const contract = evidence.scoped_evidence_loss_outcome_contracts.find(
      ({ failure_case }) => failure_case === 'blue_wool_or_binding_unavailable'
    );
    contract.required_combination_ref = 'trace_ld_v1_principal_physical_testimonial_full';
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_SCOPED_EVIDENCE_LOSS/u);
});

test('single weak evidence cannot bypass conjunctive identity or principal gates', () => {
  const shortcutMutations = [
    (evidence) => {
      const chain = evidence.evidence_chains[0];
      const inference = chain.inference_nodes.find(
        ({ node_ref }) => node_ref === 'conclusion:ratsha_participated'
      );
      inference.input_refs = ['conclusion:intentional_bag_removal'];
      chain.edge_pairs = chain.edge_pairs.filter(
        ([, target]) => target !== 'conclusion:ratsha_participated'
      );
      chain.edge_pairs.push([
        'conclusion:intentional_bag_removal',
        'conclusion:ratsha_participated'
      ]);
    },
    (evidence) => {
      const chain = evidence.evidence_chains[0];
      const inference = chain.inference_nodes.find(
        ({ node_ref }) => node_ref === 'conclusion:principal_zhdanko_physical_line'
      );
      inference.input_refs = ['conclusion:stolen_bag_at_zhdanko'];
      chain.edge_pairs = chain.edge_pairs.filter(
        ([, target]) => target !== 'conclusion:principal_zhdanko_physical_line'
      );
      chain.edge_pairs.push([
        'conclusion:stolen_bag_at_zhdanko',
        'conclusion:principal_zhdanko_physical_line'
      ]);
    },
    (evidence) => {
      const chain = evidence.evidence_chains[1];
      const inference = chain.inference_nodes.find(
        ({ node_ref }) => node_ref === 'conclusion:ratsha_participated'
      );
      inference.input_refs = ['trace_ld_v1_evidence_ratsha_confession'];
      chain.edge_pairs = chain.edge_pairs.filter(
        ([, target]) => target !== 'conclusion:ratsha_participated'
      );
      chain.edge_pairs.push([
        'trace_ld_v1_evidence_ratsha_confession',
        'conclusion:ratsha_participated'
      ]);
    }
  ];
  for (const mutate of shortcutMutations) {
    expectSemanticFailure((directory) => {
      const evidence = readJson(directory, 'clue-evidence-graph-set.json');
      mutate(evidence);
      writeJson(directory, 'clue-evidence-graph-set.json', evidence);
    }, /TRACE_0C_EVIDENCE_AGGREGATION|TRACE_0C_EVIDENCE_SHORTCUT/u);
  }
});

test('blue wool cannot identify Ratsha without the admitted comparison source', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const chain = evidence.evidence_chains[0];
    const comparison = chain.inference_nodes.find(
      ({ node_ref }) => node_ref === 'conclusion:blue_wool_matches_ratsha_caftan'
    );
    comparison.input_refs = ['conclusion:blue_wool_found_on_route'];
    chain.edge_pairs = chain.edge_pairs.filter(
      ([, target]) => target !== 'conclusion:blue_wool_matches_ratsha_caftan'
    );
    chain.edge_pairs.push([
      'conclusion:blue_wool_found_on_route',
      'conclusion:blue_wool_matches_ratsha_caftan'
    ]);
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_IDENTITY_BINDING/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const blueWool = evidence.evidence_records.find(
      ({ evidence_id }) => evidence_id === 'trace_ld_v1_evidence_blue_wool'
    );
    blueWool.supports = ['blue_wool_matches_ratsha_caftan'];
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_IDENTITY_BINDING/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.identity_binding_evidence_slots[0].comparison_item_ref =
      'trace_ld_v1_item_unapproved_ratsha_footwear';
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_IDENTITY_BINDING/u);
});

test('unapproved footwear identity conclusions are rejected', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.conclusions.push(
      'boot_track_matches_ratsha_footwear',
      'ratsha_participated_boot_track_route'
    );
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_CONCLUSION_SET/u);
});

test('checker rejects reconciliation represented as an inferred fact', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const chain = evidence.evidence_chains.find(
      ({ chain_id }) => chain_id === 'trace_ld_v1_chain_document_reconciliation_motive'
    );
    chain.inference_nodes.push({
      node_ref: 'terminal_slot:trace_ld_v1_future_goods_reconciliation',
      operator: 'all_of',
      input_refs: [
        'conclusion:stolen_bag_at_zhdanko',
        'conclusion:packet_seal_intact'
      ]
    });
    chain.edge_pairs.push(
      [
        'conclusion:stolen_bag_at_zhdanko',
        'terminal_slot:trace_ld_v1_future_goods_reconciliation'
      ],
      [
        'conclusion:packet_seal_intact',
        'terminal_slot:trace_ld_v1_future_goods_reconciliation'
      ]
    );
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_AGGREGATION/u);
});

test('principal lines cannot reuse the same evidence leaves under different class labels', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const physical = evidence.evidence_chains[0];
    const duplicated = structuredClone(physical);
    duplicated.chain_id = 'trace_ld_v1_chain_witnesses_confession_voice';
    duplicated.independence_class = 'testimonial';
    duplicated.terminal_conclusion = 'principal_zhdanko_testimonial_line';
    duplicated.node_refs = duplicated.node_refs.map((ref) =>
      ref === 'conclusion:principal_zhdanko_physical_line'
        ? 'conclusion:principal_zhdanko_testimonial_line'
        : ref);
    duplicated.inference_nodes = duplicated.inference_nodes.map((inference) => ({
      ...inference,
      node_ref: inference.node_ref === 'conclusion:principal_zhdanko_physical_line'
        ? 'conclusion:principal_zhdanko_testimonial_line'
        : inference.node_ref
    }));
    duplicated.edge_pairs = duplicated.edge_pairs.map(([sourceRef, targetRef]) => [
      sourceRef,
      targetRef === 'conclusion:principal_zhdanko_physical_line'
        ? 'conclusion:principal_zhdanko_testimonial_line'
        : targetRef
    ]);
    evidence.evidence_chains[1] = duplicated;
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_EVIDENCE_INDEPENDENCE/u);
});

test('27. hypothesis reclassified as fact is rejected', () => {
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.hypothesis_templates[0].record_type = 'fact';
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_HYPOTHESIS_AS_FACT/u);
});

test('28. false assertion allowed to mutate fact is rejected', () => {
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.statement_templates.find(({ classification }) =>
      classification === 'false_assertion').fact_mutation = 'allowed';
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_FALSE_ASSERTION/u);
});

test('29. player-facing rule that exposes hidden truth is rejected', () => {
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    const rule = knowledge.type_rules.find(({ record_type }) => record_type === 'player_facing_text');
    rule.forbidden_source_classes = rule.forbidden_source_classes.filter((value) => value !== 'hidden_truth');
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_KNOWLEDGE_BOUNDARY/u);
});

test('30. concrete party ID, instance, or seed is rejected', () => {
  for (const mutate of [
    (hidden) => { hidden.party_id = 'party-1'; },
    (hidden) => { hidden.seed = 'seed-1'; },
    (hidden) => { hidden.event_instances = [{ instance_id: 'event-1' }]; },
    (hidden) => { hidden.party_instance = { id: 'party-1' }; },
    (hidden) => { hidden.materialized_party = { id: 'party-1' }; }
  ]) {
    expectSemanticFailure((directory) => {
      const hidden = readJson(directory, 'hidden-truth-candidate-set.json');
      mutate(hidden);
      writeJson(directory, 'hidden-truth-candidate-set.json', hidden);
    }, /TRACE_0C_PARTY_SELECTION|TRACE_0C_CONCRETE_INSTANCE/u);
  }
});

test('31. any phase 0D ref marked resolved is rejected', () => {
  expectSemanticFailure((directory) => {
    const definition = readJson(directory, 'definition.json');
    definition.required_unresolved_refs[0].resolution_status = 'resolved';
    writeJson(directory, 'definition.json', definition);
  }, /TRACE_0C_REQUIRED_GAP_RESOLVED/u);
});

test('32. check-level resilience cannot be claimed before 0D defines evidence bundles', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.discovery_lifecycle_policy.single_failed_check_makes_graph_unsolvable = false;
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_CHECK_LEVEL_RESILIENCE_GAP/u);
  expectSemanticFailure((directory) => {
    const definition = readJson(directory, 'definition.json');
    const gap = definition.required_unresolved_refs.find(
      ({ category }) => category === 'activity_check_consequence_profiles'
    );
    gap.required_contracts = ['check_outcome_to_admitted_evidence_bundle'];
    writeJson(directory, 'definition.json', definition);
  }, /TRACE_0C_CHECK_LEVEL_RESILIENCE_GAP/u);
});

test('33. 0C evidence outcomes cannot declare a completion state', () => {
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    const outcome = evidence.principal_inference_policy.partial_outcomes[0];
    delete outcome.resolution_status;
    outcome.status = 'partial_completion';
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_COMPLETION_BOUNDARY/u);
  expectSemanticFailure((directory) => {
    const evidence = readJson(directory, 'clue-evidence-graph-set.json');
    evidence.principal_inference_policy.partial_outcomes[0].completion_scope =
      'investigation_completed_partially';
    writeJson(directory, 'clue-evidence-graph-set.json', evidence);
  }, /TRACE_0C_COMPLETION_BOUNDARY/u);
  expectSemanticFailure((directory) => {
    const definition = readJson(directory, 'definition.json');
    const gap = definition.required_unresolved_refs.find(
      ({ category }) => category === 'completion_rules'
    );
    gap.required_contracts = [];
    writeJson(directory, 'definition.json', definition);
  }, /TRACE_0C_COMPLETION_BOUNDARY/u);
});

test('34. alias, normalization, or semantic fallback is rejected', () => {
  for (const key of ['alias_policy', 'normalization_policy', 'fallback_policy']) {
    expectSemanticFailure((directory) => {
      const items = readJson(directory, 'item-container-set.json');
      items[key] = 'allowed';
      writeJson(directory, 'item-container-set.json', items);
    }, /TRACE_0C_SEMANTIC_FALLBACK/u);
  }
  for (const [key, value] of [
    ['aliases', ['legacy-item-id']],
    ['id_normalization', { legacy: 'canonical' }],
    ['semantic_fallback_map', { unknown: 'road_bag_container' }]
  ]) {
    expectSemanticFailure((directory) => {
      const items = readJson(directory, 'item-container-set.json');
      items.item_templates[0][key] = value;
      writeJson(directory, 'item-container-set.json', items);
    }, /TRACE_0C_SEMANTIC_FALLBACK/u);
  }
});

test('additional item invariant mutations fail closed', () => {
  const mutations = [
    [
      (items) => { items.item_templates[0].semantic_category = 'unknown_category'; },
      /TRACE_0C_SEMANTIC_CATEGORY/u
    ],
    [
      (items) => { items.item_templates[0].seal_contract.state_candidates = []; },
      /TRACE_0C_SEAL_STATE/u
    ],
    [
      (items) => { delete items.item_templates.find(({ weapon_contract }) => weapon_contract).weapon_contract.accessibility; },
      /TRACE_0C_WEAPON_CONTRACT/u
    ],
    [
      (items) => { items.container_relation_templates[0].container_template_ref = 'unknown_container'; },
      /TRACE_0C_CONTAINER_REF/u
    ]
  ];
  for (const [mutate, expected] of mutations) {
    expectSemanticFailure((directory) => {
      const items = readJson(directory, 'item-container-set.json');
      mutate(items);
      writeJson(directory, 'item-container-set.json', items);
    }, expected);
  }
});

test('statement templates fail closed without audience, source knowledge, or typed assertion', () => {
  for (const key of ['required_audience_refs', 'audience_candidate_slot_refs', 'source_knowledge_refs', 'assertion']) {
    expectSemanticFailure((directory) => {
      const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
      delete knowledge.statement_templates[0][key];
      writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
    }, /TRACE_0C_STATEMENT/u);
  }
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.statement_templates[0].source_knowledge_refs[0] =
      'knowledge_scope:trace_ld_v1_knowledge_scope_storehouse_controller_v1#incident_fact';
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_STATEMENT/u);
});

test('audience binding rejects missing witnesses and knowledge propagation to absent fishers', () => {
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    const confession = knowledge.statement_templates.find(
      ({ statement_template_id }) => statement_template_id === 'trace_ld_v1_statement_ratsha_confession'
    );
    confession.audience_candidate_slot_refs = [];
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_AUDIENCE_BINDING/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    const denial = knowledge.statement_templates.find(
      ({ statement_template_id }) => statement_template_id === 'trace_ld_v1_statement_zhdanko_denial'
    );
    denial.required_audience_refs = ['player_clerk'];
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_AUDIENCE_BINDING/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.audience_candidate_slots[0].unselected_candidates_receive_statement_perception = true;
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_AUDIENCE_BINDING/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.testimony_contract.absent_participants_receive_knowledge = true;
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_STATEMENT/u);
});

test('promise memory must reuse the selected participating-fisher audience slot', () => {
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.promise_memory_compatibility_slot.participating_fisher_witness_slot_ref =
      'trace_ld_v1_audience_slot_other_fisher';
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_PROMISE_SLOT/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.promise_memory_compatibility_slot.participating_fisher_witness_candidate_refs = [
      'background_fisher_1',
      'background_fisher_2'
    ];
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_PROMISE_SLOT/u);
  expectSemanticFailure((directory) => {
    const knowledge = readJson(directory, 'knowledge-lie-memory-rules.json');
    knowledge.promise_memory_compatibility_slot
      .witness_binding_inheritance.unselected_candidate_memory = 'allowed';
    writeJson(directory, 'knowledge-lie-memory-rules.json', knowledge);
  }, /TRACE_0C_PROMISE_SLOT/u);
});
