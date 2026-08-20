import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerSafeVisiblePackageEnvelope,
  buildSafeNarratorPackage,
  detectHiddenLeaks,
  mergeFormalKnowledgeMemory,
  mergeKnowledgeFacts,
  mergeValidatedKnowledgeMemory,
  resolveAuthoredStatementEvidence,
  resolveEvidenceConclusions,
  stripHiddenForNarrator,
  validateMemoryFact,
  validateVisibleContext
} from '../src/index.js';
import {
  createDisabledOrdinaryResolutionCapability,
  projectPlayerSafeOrdinaryResolutionCapability
} from '../src/ordinary-resolution-capability.js';

test('ordinary resolution marker has one immutable player-safe capability owner', () => {
  const marker = createDisabledOrdinaryResolutionCapability();
  assert.deepEqual(marker, {
    ordinary_resolution: {
      discovery_available: false,
      container_resolution_available: false
    }
  });
  assert.ok(Object.isFrozen(marker));
  assert.ok(Object.isFrozen(marker.ordinary_resolution));
  const adversarial = {
    ordinary_resolution: {
      discovery_available: false,
      container_resolution_available: false,
      identity_budget: 99,
      background_groups: ['hidden'],
      supporting_basis_allowlist: ['basis'],
      context_bound_permissions: ['permission'],
      objective_concealed_contents: ['contents'],
      negative_ledger: ['absent'],
      property_economic_evidence: ['value'],
      aggregate_history: ['history'],
      candidate_name: 'secret spoon'
    }
  };
  assert.throws(() => projectPlayerSafeOrdinaryResolutionCapability(adversarial),
    /ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE/);
  const enabled = projectPlayerSafeOrdinaryResolutionCapability({
    ordinary_resolution: {
      discovery_available: true,
      container_resolution_available: false
    }
  });
  assert.deepEqual(enabled, { ordinary_resolution: {
    discovery_available: true, container_resolution_available: false
  } });
  assert.ok(Object.isFrozen(enabled.ordinary_resolution));
  let reads = 0;
  const topAccessor = {};
  Object.defineProperty(topAccessor, 'ordinary_resolution', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not run'); }
  });
  assert.throws(() => projectPlayerSafeOrdinaryResolutionCapability(topAccessor),
    /ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE/);
  const nestedAccessor = { ordinary_resolution: {} };
  Object.defineProperty(nestedAccessor.ordinary_resolution, 'discovery_available', {
    enumerable: true,
    get() { reads += 1; throw new Error('must not run'); }
  });
  Object.defineProperty(nestedAccessor.ordinary_resolution, 'container_resolution_available', {
    enumerable: true,
    value: false
  });
  assert.throws(() => projectPlayerSafeOrdinaryResolutionCapability(nestedAccessor),
    /ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE/);
  assert.equal(reads, 0);
  const inheritedMarker = Object.assign(Object.create({ inherited: true }), marker);
  assert.throws(() => projectPlayerSafeOrdinaryResolutionCapability(inheritedMarker),
    /ORDINARY_RESOLUTION_CAPABILITY_NOT_AVAILABLE/);
  const safe = projectPlayerSafeOrdinaryResolutionCapability(marker);
  assert.notStrictEqual(safe, marker);
  assert.deepEqual(safe, marker);
  assert.deepEqual(Object.keys(safe.ordinary_resolution), [
    'discovery_available', 'container_resolution_available'
  ]);
  assert.equal(projectPlayerSafeOrdinaryResolutionCapability(), undefined);
});
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

test('visibility boundary strips hidden data and rejects leaks', () => {
  const unsafe = { version:1, schema:'visible_context_package', visible_scene:'Двор', visible_changes:[], sensory_details:[], visible_npc:[], visible_objects:[], known_context:[], uncertainties:[], allowed_tensions:[], do_not_imply:[], hidden_state:{ secret:true } };
  assert.ok(detectHiddenLeaks(unsafe).length > 0);
  const safe = stripHiddenForNarrator(unsafe);
  assert.equal(safe.hidden_state, undefined);
  assert.equal(validateVisibleContext(safe).ok, true);
  assert.equal(buildSafeNarratorPackage(safe).ok, true);
  assert.equal(mergeKnowledgeFacts([{ id:'x', summary:'old' }], [{ id:'x', summary:'new' }])[0].summary, 'new');
  assert.equal(validateMemoryFact({ id:'m', type:'event', summary:'видел', knowledge_status:'observation' }).ok, true);
});

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: 'v1'
});
const at = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};
const perception = (result) => {
  const payload = {
    perception_id: 'perception-1',
    perceiver_ref: ref('npc', 'npc-1'),
    event_ref: ref('action_contract', 'event-1'),
    perceived_at: at,
    result,
    recognition_policy_ref: vr('action_contract', 'recognition'),
    visibility_policy_ref: vr('action_contract', 'visibility'),
    signal_refs: [ref('sound_event', 'signal-1')],
    knowledge_update_refs: [ref('knowledge_fact', 'memory-1')]
  };
  return { ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) };
};
const memory = (id, knowledge_status = 'observation') => ({
  id,
  type: 'event',
  summary: `memory ${id}`,
  knowledge_status
});

test('knowledge owner merges deterministic facts only from perception/message and keeps misinterpretation as hypothesis', () => {
  const observed = mergeValidatedKnowledgeMemory({
    current_facts: [memory('z')],
    proposal: {
      source_perception_id: 'perception-1',
      facts: [memory('a')],
      hypotheses: []
    },
    source_perception: perception('recognized')
  });
  assert.equal(observed.ok, true);
  assert.deepEqual(observed.state.facts.map(({ id }) => id), ['a', 'z']);

  const hypothesis = mergeValidatedKnowledgeMemory({
    proposal: {
      source_perception_id: 'perception-1',
      facts: [],
      hypotheses: [memory('h', 'belief')]
    },
    source_perception: perception('misinterpreted')
  });
  assert.equal(hypothesis.ok, true);
  assert.deepEqual(hypothesis.state.facts, []);
  assert.deepEqual(hypothesis.state.hypotheses.map(({ id }) => id), ['h']);

  assert.equal(mergeValidatedKnowledgeMemory({
    proposal: {
      source_perception_id: 'perception-1',
      facts: [memory('invented')],
      hypotheses: []
    }
  }).ok, false);
  assert.equal(mergeValidatedKnowledgeMemory({
    proposal: {
      source_perception_id: 'perception-1',
      facts: [memory('invented')],
      hypotheses: []
    },
    source_perception: perception('not_perceived')
  }).ok, false);
  assert.equal(mergeValidatedKnowledgeMemory({
    proposal: {
      source_perception_id: 'perception-1',
      facts: [memory('wrong')],
      hypotheses: []
    },
    source_perception: perception('misinterpreted')
  }).ok, false);
});

test('formal knowledge owner returns the exact causal union and advances state once', () => {
  const ownerRef = ref('npc', 'npc-1');
  const sourcePerception = perception('recognized');
  const expectedStateVersions = {
    entries: [{ entity_ref: ownerRef, state_version: 4 }],
    canonical_digest: computeSpatialV3CanonicalDigest({
      entries: [{ entity_ref: ownerRef, state_version: 4 }]
    })
  };
  const dependencyPins = {
    pins: [{
      dependency_role: 'profile',
      entity_ref: ref('action_contract', 'knowledge-policy'),
      version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
    }],
    canonical_digest: computeSpatialV3CanonicalDigest({
      pins: [{
        dependency_role: 'profile',
        entity_ref: ref('action_contract', 'knowledge-policy'),
        version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
      }]
    })
  };
  const deltaInput = {
    proposal_id: 'knowledge-delta-1',
    owner_ref: ownerRef,
    source_kind: 'perception',
    source_ref: ref('perception_result', sourcePerception.perception_id),
    source_perception: sourcePerception,
    expected_state_versions: expectedStateVersions,
    dependency_pins: dependencyPins,
    fact_refs: [ref('knowledge_fact', 'memory-1')],
    hypothesis_refs: []
  };
  const proposal = {
    ...deltaInput,
    canonical_digest: computeSpatialV3CanonicalDigest(deltaInput)
  };
  assert.deepEqual(validateSpatialV3Contract('knowledge_memory_delta_proposal', proposal), []);

  const merged = mergeFormalKnowledgeMemory({
    proposal,
    state_before_fact_refs: [ref('knowledge_fact', 'memory-0')],
    state_before_hypothesis_refs: [],
    state_version_before: 4
  });
  assert.equal(merged.ok, true, JSON.stringify(merged));
  assert.deepEqual(
    validateSpatialV3Contract('knowledge_memory_merge_result', merged.result),
    []
  );
  assert.deepEqual(
    merged.result.accepted_fact_refs,
    [ref('knowledge_fact', 'memory-0'), ref('knowledge_fact', 'memory-1')]
  );
  assert.equal(merged.result.state_changed, true);
  assert.equal(merged.result.state_version_after, 5);

  const unchanged = mergeFormalKnowledgeMemory({
    proposal,
    state_before_fact_refs: [ref('knowledge_fact', 'memory-1')],
    state_before_hypothesis_refs: [],
    state_version_before: 4
  });
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.result.state_changed, false);
  assert.equal(unchanged.result.state_version_after, 4);

  const stale = mergeFormalKnowledgeMemory({
    proposal,
    state_before_fact_refs: [],
    state_before_hypothesis_refs: [],
    state_version_before: 5
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error_code, 'activity_precondition_stale');
});

test('knowledge owner builds a validated player-safe envelope and rejects hidden fields', () => {
  const pinValues = [{
    dependency_role: 'profile',
    entity_ref: ref('visibility_modifier', 'projection-policy'),
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: 'v1'
    }
  }];
  const dependencyPins = {
    pins: pinValues,
    canonical_digest:
      computeSpatialV3CanonicalDigest(pinValues).replace('sha256:', '')
  };
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'У ворот слышен оклик.',
    perceived_changes: ['Страж повернулся к источнику звука.'],
    sensory_details: ['Короткий металлический звон.'],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const built = buildPlayerSafeVisiblePackageEnvelope({
    package_id: 'visible-1',
    party_id: 'party-1',
    turn_id: 'turn-1',
    committed_state_version: '5',
    change_set_id: 'change-1',
    visible_payload: visiblePayload,
    projection_policy_ref: vr(
      'visibility_modifier',
      'projection-policy'
    ),
    dependency_pins: dependencyPins,
    idempotency_record_id: 'idempotency-1'
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  assert.equal(
    built.envelope.package_digest,
    computeSpatialV3CanonicalDigest(visiblePayload)
  );
  const leaked = buildPlayerSafeVisiblePackageEnvelope({
    ...built.envelope,
    visible_payload: {
      ...visiblePayload,
      hidden_state: { npc_options: ['flee'] }
    }
  });
  assert.equal(leaked.ok, false);
  assert.equal(leaked.error_code, 'hidden_information_leak');
});

const evidenceGraph = {
  schema: 'rus.trace_clue_evidence_graph_set.v1',
  clue_evidence_graph_set_id: 'graph-1',
  revision: 1,
  owner: '@rus/visibility-knowledge-memory',
  fallback_policy: 'forbidden',
  normalization_policy: 'forbidden',
  alias_policy: 'forbidden',
  evidence_records: [
    { evidence_id: 'evidence:a' },
    { evidence_id: 'evidence:b' },
    { evidence_id: 'evidence:statement' }
  ],
  evidence_chains: [
    {
      chain_id: 'chain:physical',
      independence_class: 'physical',
      leaf_evidence_refs: ['evidence:a', 'evidence:b'],
      inference_nodes: [
        { node_ref: 'conclusion:a', operator: 'all_of',
          input_refs: ['evidence:a'] },
        { node_ref: 'conclusion:physical', operator: 'min_count', min_count: 2,
          input_refs: ['conclusion:a', 'evidence:b'] }
      ],
      terminal_conclusion: 'conclusion:physical'
    },
    {
      chain_id: 'chain:testimony',
      independence_class: 'testimonial',
      leaf_evidence_refs: ['evidence:statement'],
      inference_nodes: [
        { node_ref: 'conclusion:testimony', operator: 'all_of',
          input_refs: ['evidence:statement'] }
      ],
      terminal_conclusion: 'conclusion:testimony'
    }
  ],
  terminal_evidence_slots: [],
  identity_binding_evidence_slots: [],
  principal_inference_policy: {
    conclusion: 'conclusion:principal',
    minimum_independent_chain_count: 2,
    cross_chain_inference: {
      operator: 'approved_combinations',
      requires_distinct_independence_classes: true,
      input_chain_terminal_refs: [
        { chain_ref: 'chain:physical',
          terminal_conclusion: 'conclusion:physical',
          independence_class: 'physical' },
        { chain_ref: 'chain:testimony',
          terminal_conclusion: 'conclusion:testimony',
          independence_class: 'testimonial' }
      ],
      approved_combinations: [{
        combination_id: 'combination:principal',
        chain_refs: ['chain:physical', 'chain:testimony'],
        outcome_kind: 'corroborated',
        outcome_ref: 'conclusion:principal',
        requires_disjoint_leaf_evidence: true
      }]
    }
  }
};

test('evidence owner resolves only authored conclusions from committed evidence', () => {
  const result = resolveEvidenceConclusions(evidenceGraph,
    ['evidence:statement', 'evidence:b', 'evidence:a']);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.committed_evidence_refs,
    ['evidence:a', 'evidence:b', 'evidence:statement']);
  assert.deepEqual(result.supported_conclusion_refs, [
    'conclusion:a', 'conclusion:physical', 'conclusion:principal',
    'conclusion:testimony'
  ]);
  assert.deepEqual(result.applied_combination_ids, ['combination:principal']);
  assert.equal(result.completion, undefined);
});

test('evidence owner treats absence as unknown and statements as evidence, not truth', () => {
  const statementOnly = resolveEvidenceConclusions(evidenceGraph,
    ['evidence:statement']);
  assert.equal(statementOnly.ok, true);
  assert.deepEqual(statementOnly.supported_conclusion_refs,
    ['conclusion:testimony']);
  assert.equal(statementOnly.supported_conclusion_refs
    .includes('conclusion:principal'), false);
  assert.deepEqual(statementOnly.rejected_or_absent_refs, []);
});

test('evidence owner fails closed for unknown, duplicate and malformed inputs', () => {
  assert.equal(resolveEvidenceConclusions(evidenceGraph,
    ['evidence:unknown']).ok, false);
  assert.equal(resolveEvidenceConclusions(evidenceGraph,
    ['evidence:a', 'evidence:a']).ok, false);
  assert.equal(resolveEvidenceConclusions({ ...evidenceGraph,
    evidence_chains: [{ ...evidenceGraph.evidence_chains[0],
      inference_nodes: [{ node_ref: 'conclusion:a', operator: 'not',
        input_refs: ['evidence:a'] }] }] }, ['evidence:a']).ok, false);
});

test('statement evidence requires the authored assertion and source lineage',
  () => {
    const speaker = { instance_id: 'onisim-1',
      participant_slot_ref: 'onisim_boatman',
      knowledge_profile_snapshot: {
        profile_id: 'trace_ld_v1_knowledge_scope_hired_boatman_v1' } };
    const template = { statement_template_id: 'onisim-testimony',
      speaker_ref: 'onisim_boatman', truth_classification: 'truthful',
      statement_ref: 'statement_template:onisim-testimony',
      source_knowledge_refs: [
        'knowledge_scope:trace_ld_v1_knowledge_scope_hired_boatman_v1#memory'],
      source_perception_template_refs: ['heard-command'],
      assertion: { assertion_id: 'onisim-assertion' },
      application_status: 'template_only' };
    const effect = { statement_template_ref: 'onisim-testimony',
      source_rule: 'speaker_committed_memory_only',
      write_targets: ['statement_record', 'speaker_memory_report'],
      forbidden_write_targets: ['objective_truth'] };
    const authoredClaim = {
      schema: 'authored_statement_claim_contract_v1',
      statement_template_ref: 'onisim-testimony',
      claim_id: 'onisim-assertion',
      utterance_text: 'Я слышал приказ и видел действия Ратши.',
      claim: { claim_id: 'onisim-assertion',
        content_summary: 'Онисим слышал приказ и видел действия Ратши.',
        form: 'assertion', speaker_posture: 'believed_true',
        source_knowledge_refs: [{ entity_kind: 'knowledge_scope',
          entity_id: 'trace_ld_v1_knowledge_scope_hired_boatman_v1' }],
        mentioned_entity_refs: [] } };
    const base = { schema: 'conversation_statement_event_v1',
      statement_id: 'statement-1', speaker_ref: {
        entity_kind: 'npc', entity_id: 'onisim-1' },
      utterance_text: authoredClaim.utterance_text };
    const ordinary = resolveAuthoredStatementEvidence({ statement: {
      ...base, claims: [] }, speaker, statement_template: template,
    statement_effect: effect,
    authored_claim: authoredClaim,
    knowledge_scope_ref:
      'trace_ld_v1_knowledge_scope_hired_boatman_v1',
    evidence_ref: 'onisim-evidence' });
    assert.equal(ordinary.committed, false);
    const equivalentUtterance = resolveAuthoredStatementEvidence({ statement: {
      ...base, utterance_text: 'Я узнал голос Жданко, слышал удар по лодке '
        + 'и помню, как Ратша спас меня после крушения.',
      claims: [structuredClone(authoredClaim.claim)] },
    speaker, statement_template: template, statement_effect: effect,
    authored_claim: authoredClaim,
    knowledge_scope_ref:
      'trace_ld_v1_knowledge_scope_hired_boatman_v1',
    evidence_ref: 'onisim-evidence' });
    assert.equal(equivalentUtterance.committed, true);
    const outsideKnowledge = structuredClone(authoredClaim.claim);
    outsideKnowledge.source_knowledge_refs = [{ entity_kind: 'knowledge_scope',
      entity_id: 'trace_ld_v1_knowledge_scope_hidden_zhdanko_truth' }];
    const unsupported = resolveAuthoredStatementEvidence({ statement: {
      ...base, claims: [outsideKnowledge] }, speaker,
    statement_template: template, statement_effect: effect,
    authored_claim: authoredClaim,
    knowledge_scope_ref:
      'trace_ld_v1_knowledge_scope_hired_boatman_v1',
    evidence_ref: 'onisim-evidence' });
    assert.equal(unsupported.committed, false);
    const testimony = resolveAuthoredStatementEvidence({ statement: {
      ...base, claims: [structuredClone(authoredClaim.claim)] },
    speaker, statement_template: template, statement_effect: effect,
    authored_claim: authoredClaim,
    knowledge_scope_ref:
      'trace_ld_v1_knowledge_scope_hired_boatman_v1',
    evidence_ref: 'onisim-evidence' });
    assert.equal(testimony.committed, true);
    assert.equal(testimony.evidence_ref, 'onisim-evidence');
    assert.equal(testimony.lineage_refs.includes(
      'perception_template:heard-command'), true);
  });
