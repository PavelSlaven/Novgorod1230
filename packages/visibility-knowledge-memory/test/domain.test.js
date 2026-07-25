import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerSafeVisiblePackageEnvelope,
  buildSafeNarratorPackage,
  detectHiddenLeaks,
  mergeFormalKnowledgeMemory,
  mergeKnowledgeFacts,
  mergeValidatedKnowledgeMemory,
  stripHiddenForNarrator,
  validateMemoryFact,
  validateVisibleContext
} from '../src/index.js';
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
