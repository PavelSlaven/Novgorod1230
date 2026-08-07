import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal
} from '../src/decision-signals.js';
import {
  buildNpcActionDecisionRequestFromSnapshots,
  validateNpcActionDecisionRequest
} from '../src/semantic-decision-contracts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const occurredAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('NPC-safe projector allowlists persisted subjective snapshots', () => {
  const signal = buildNpcDecisionSignal({
    occurred_at: occurredAt,
    category: 'objective',
    significance: 'material',
    source_event_ref: ref('event', 'event-1'),
    subject_ref: ref('npc', 'speaker'),
    scope_refs: [],
    perception_required: false,
    source_perception_ref: null,
    causal_parent_refs: []
  });
  const boundary = buildNpcDecisionBoundary({
    npc_ref: ref('npc', 'speaker'),
    decision_mode: 'autonomous',
    scheduled_at: occurredAt,
    significance: 'material',
    categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', signal.signal_id)],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    state_version: '1'
  });
  const request = buildNpcActionDecisionRequestFromSnapshots({
    request_identity: {
      request_id: 'request-safe',
      root_turn_id: 'turn-safe',
      committed_state_version: 1,
      working_revision: 1,
      decision_index: 1
    },
    boundary,
    npc_snapshot: {
      instance_id: 'speaker',
      profile_level: 'scene',
      profile_id: 'speaker-profile',
      identity_state: { canonical_name: 'Страж', hidden_name: 'secret' },
      social_role: { role_ref: 'guard' },
      attributes: [],
      skills: [],
      machine_state: { location_ref: 'yard', spatial_zone_ref: 'gate' }
    },
    current_activity_snapshot: {
      activity_ref: null,
      summary: null,
      status: 'idle',
      can_continue_automatically: false,
      hidden_activity_state: 'secret'
    },
    body_snapshot: {
      summary: 'устал',
      conditions: [{ condition_ref: 'tired', hidden_cause: 'secret' }]
    },
    mood_snapshot: {
      state: 'спокоен',
      intensity: 'low',
      internal_reason: { hidden: 'secret' }
    },
    relationship_snapshots: [{
      actor_ref: 'actor-1',
      relation: 'знакомый',
      hidden_history: { hidden: 'secret' }
    }],
    resource_snapshots: [{
      resource_ref: 'resource-1',
      template_ref: 'wood',
      holder_npc_id: 'speaker',
      hidden_contents: { hidden: 'secret' }
    }],
    perception_snapshot: {
      visible_objects: [{
        object_ref: 'resource-1',
        summary: 'дрова',
        hidden_owner: { hidden: 'secret' }
      }]
    },
    knowledge_snapshot: {
      known_facts: ['secret primitive payload', {
        fact_ref: 'fact-1',
        summary: 'ворота закрыты',
        hidden_truth: { hidden: 'secret' }
      }]
    },
    memory_snapshot: {
      recent_events: [{
        event_ref: 'event-1',
        summary: 'смена началась',
        hidden_detail: { hidden: 'secret' }
      }]
    },
    resolved_signals: [signal],
    operation_contract: {}
  });
  assert.equal(validateNpcActionDecisionRequest(request), true);
  assert.equal(request.npc.relationships[0].relation, 'знакомый');
  assert.equal(request.npc.available_resources[0].resource_ref, 'resource-1');
  assert.equal(request.perception.visible_objects[0].summary, 'дрова');
  assert.equal(request.knowledge.known_facts[0].fact_ref, 'fact-1');
  assert.equal(request.memory.recent_events[0].event_ref, 'event-1');
  assert.equal(request.decision_reasons.perceived_changes[0],
    'event:event-1');
  assert.doesNotMatch(JSON.stringify(request), /hidden|secret/u);
});

test('NPC-safe projector includes accessible non-container resources', () => {
  const signal = buildNpcDecisionSignal({
    occurred_at: occurredAt,
    category: 'objective',
    significance: 'material',
    source_event_ref: ref('event', 'event-2'),
    subject_ref: ref('npc', 'speaker'),
    scope_refs: [],
    perception_required: false,
    source_perception_ref: null,
    causal_parent_refs: []
  });
  const boundary = buildNpcDecisionBoundary({
    npc_ref: ref('npc', 'speaker'),
    decision_mode: 'autonomous',
    scheduled_at: occurredAt,
    significance: 'material',
    categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', signal.signal_id)],
    same_time_batch_ref: ref('temporal_batch', 'batch-2'),
    state_version: '1'
  });
  const request = buildNpcActionDecisionRequestFromSnapshots({
    request_identity: {
      request_id: 'request-resources',
      root_turn_id: 'turn-resources',
      committed_state_version: 1,
      working_revision: 1,
      decision_index: 1
    },
    boundary,
    npc_snapshot: {
      instance_id: 'speaker',
      attributes: [],
      skills: [],
      machine_state: { location_ref: 'yard', spatial_zone_ref: 'gate' }
    },
    current_activity_snapshot: {
      activity_ref: null,
      summary: null,
      status: 'idle',
      can_continue_automatically: false
    },
    resource_snapshots: [{
      container_id: 'bag-1',
      template_id: 'bag',
      holder_npc_id: 'speaker',
      state: { location_ref: 'yard', zone_ref: 'gate' }
    }, {
      item_id: 'axe-1',
      template_id: 'axe',
      holder_npc_id: 'speaker',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        controller_npc_id: 'speaker'
      }
    }, {
      item_id: 'remote-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'shed',
        zone_ref: 'inside',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }],
    resolved_signals: [signal],
    operation_contract: {}
  });
  assert.equal(validateNpcActionDecisionRequest(request), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'bag-1'), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'axe-1'), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'remote-packet'), false);
});

test('NPC-safe projector prefers authored perceived change summaries', () => {
  const signal = buildNpcDecisionSignal({
    occurred_at: occurredAt,
    category: 'objective',
    significance: 'material',
    source_event_ref: ref('npc_activity_factual_transition', 'waiting-1'),
    subject_ref: ref('npc', 'speaker'),
    scope_refs: [],
    perception_required: false,
    source_perception_ref: null,
    causal_parent_refs: []
  });
  const boundary = buildNpcDecisionBoundary({
    npc_ref: ref('npc', 'speaker'),
    decision_mode: 'autonomous',
    scheduled_at: occurredAt,
    significance: 'material',
    categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', signal.signal_id)],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    state_version: '1'
  });
  const request = buildNpcActionDecisionRequestFromSnapshots({
    request_identity: {
      request_id: 'request-perceived',
      root_turn_id: 'turn-perceived',
      committed_state_version: 1,
      working_revision: 1,
      decision_index: 1
    },
    boundary,
    npc_snapshot: {
      instance_id: 'speaker',
      attributes: [],
      skills: [],
      machine_state: { location_ref: 'yard', spatial_zone_ref: 'gate' }
    },
    current_activity_snapshot: {
      activity_ref: 'wait-profile',
      summary: 'wait-profile: waiting→decision_required',
      status: 'decision_required',
      can_continue_automatically: false
    },
    perception_snapshot: {
      perceived_changes: [{
        source_event_ref: ref('npc_activity_factual_transition', 'waiting-1'),
        summary: 'wait-profile: waiting→decision_required; ratsha_presence_or_return:expected_return_boundary_crossed'
      }]
    },
    resolved_signals: [signal],
    operation_contract: {}
  });
  assert.equal(validateNpcActionDecisionRequest(request), true);
  assert.equal(request.decision_reasons.perceived_changes[0],
    'wait-profile: waiting→decision_required; ratsha_presence_or_return:expected_return_boundary_crossed');
});
