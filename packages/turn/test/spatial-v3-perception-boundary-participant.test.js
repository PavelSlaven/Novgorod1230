import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpatialV3PerceptionBoundaryParticipant
} from '../src/spatial-v3-perception-boundary-participant.js';

const at = (whole_minutes = '10') => ({
  whole_minutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: 'v1'
});

function candidate() {
  return {
    boundary_id: 'perception-boundary',
    boundary_kind: 'perception_follow_up',
    scheduled_at: at(),
    source_ref: ref('action_contract', 'event-1'),
    primary_subject_ref: ref('npc', 'npc-1'),
    subject_refs: [],
    scope_ref: ref('party', 'party-1'),
    rule_ref: versioned('action_contract', 'perception-rule'),
    policy_ref: versioned('activity_contract', 'perception-policy'),
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'propagation_background',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', 'visibility-1'),
    idempotency_key: 'perception-boundary',
    causal_parent_refs: []
  };
}

function resolve({ result = 'perceived_clear' } = {}) {
  return {
    ok: true,
    status: 'completed',
    decision_mode: null,
    perception_result: {
      perception_id: 'perception-1',
      result
    },
    perception_replay_evidence: { perception_id: 'perception-1' },
    knowledge_merge_result: { proposal_id: 'knowledge-1' },
    reaction_option_proposal: null,
    reaction_proposal: null
  };
}

function context(work) {
  return {
    clock_before: at(),
    request: { party_id: 'party-1' },
    projection: { perception_boundary_work_items: [work] }
  };
}

function work(candidateValue, extras = {}) {
  return {
    kind: 'perception_only',
    boundary_id: candidateValue.boundary_id,
    cycle_input: {
      perception_request: {
        perceiver_ref: candidateValue.primary_subject_ref,
        event_ref: candidateValue.source_ref,
        perceived_at: candidateValue.scheduled_at
      }
    },
    write_context: {
      party_id: 'party-1',
      change_set_id: 'change-1',
      idempotency_record_id: 'idem-1'
    },
    ...extras
  };
}

function participant(outcome) {
  return createSpatialV3PerceptionBoundaryParticipant({
    resolvePerceptionKnowledge: () => outcome,
    buildInitialWriteSet: () => ({
      ok: true,
      write_set: { appends: [], inserts: [], updates: [] },
      expected_state_versions: [],
      physical_keys: []
    })
  });
}

test('perceived factual event emits one perception-bound decision signal', () => {
  const boundary = candidate();
  const item = work(boundary, {
    decision_signal_descriptor: {
      category: 'communication',
      significance: 'material',
      scope_refs: [boundary.scope_ref],
      perceived_change_summary: 'Игрок громко позвал стражу.'
    }
  });
  const result = participant(resolve()).resolve(boundary, context(item));

  assert.equal(result.disposition, 'execute');
  assert.equal(result.proposals[0].write_target,
    'perception-knowledge:perception-1');
  assert.deepEqual(
    result.state_projection.npc_decision_signal_descriptors,
    [{
      occurred_at: at(),
      category: 'communication',
      significance: 'material',
      source_event_ref: boundary.source_ref,
      subject_ref: boundary.primary_subject_ref,
      scope_refs: [boundary.scope_ref],
      perception_required: true,
      source_perception_ref: ref('perception_result', 'perception-1'),
      causal_parent_refs: [],
      perceived_change_summary: 'Игрок громко позвал стражу.'
    }]
  );
});

test('not-perceived event persists without creating an NPC signal', () => {
  const boundary = candidate();
  const item = work(boundary);
  const result = participant(resolve({ result: 'not_perceived' }))
    .resolve(boundary, context(item));

  assert.equal(result.disposition, 'execute');
  assert.equal(result.state_projection.npc_decision_signal_descriptors,
    undefined);
});

test('invalid perceived signal descriptor hard-blocks the boundary', () => {
  const boundary = candidate();
  const item = work(boundary, {
    decision_signal_descriptor: {
      category: 'invented',
      significance: 'material',
      perceived_change_summary: 'Событие замечено.'
    }
  });
  const result = participant(resolve()).resolve(boundary, context(item));

  assert.deepEqual(result, {
    disposition: 'hard_block',
    code: 'npc_decision_policy_gap'
  });
});
