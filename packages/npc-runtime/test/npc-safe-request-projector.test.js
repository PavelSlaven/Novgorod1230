import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal
} from '../src/decision-signals.js';
import {
  buildNpcActionDecisionRequestFromSnapshots,
  npcSafeSnapshotHasEntityEvidence,
  projectNpcConversationSubject,
  projectNpcSafeResourceSnapshots,
  projectNpcSafeSubject,
  validateNpcActionDecisionRequest
} from '../src/semantic-decision-contracts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const occurredAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('NPC-safe entity evidence requires a source-backed exact entity ref', () => {
  assert.equal(npcSafeSnapshotHasEntityEvidence({ entity_ref: 'fire:1',
    perception_snapshot: { visible_objects: [{ process_ref: 'fire:1',
      summary: 'огонь' }] } }), false);
  assert.equal(npcSafeSnapshotHasEntityEvidence({ entity_ref: 'fire:1',
    perception_snapshot: { visible_objects: [{ process_ref: 'fire:1',
      source_event_ref: ref('actor_step', 'start-fire'),
      summary: 'разожжённый огонь' }] } }), true);
});

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
      perceived_changes: [{
        source_event_ref: ref('event', 'event-1'),
        summary: 'Смена началась.'
      }],
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
  assert.equal(Object.hasOwn(request.npc, 'profile_ref'), false);
  assert.equal(Object.hasOwn(request.npc, 'current_location'), false);
  assert.equal(request.npc.relationships[0].relation, 'знакомый');
  assert.equal(request.npc.available_resources[0].resource_ref, 'resource-1');
  assert.equal(request.perception.visible_objects[0].summary, 'дрова');
  assert.equal(request.knowledge.known_facts[0].fact_ref, 'fact-1');
  assert.equal(request.memory.recent_events[0].event_ref, 'event-1');
  assert.equal(request.decision_reasons.perceived_changes[0],
    'Смена началась.');
  assert.doesNotMatch(JSON.stringify(request), /hidden|secret/u);
});

test('NPC-safe projector rejects a decision source without NPC-safe summary',
  () => {
    const signal = buildNpcDecisionSignal({
      occurred_at: occurredAt,
      category: 'objective',
      significance: 'material',
      source_event_ref: ref('event', 'missing-summary'),
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
      same_time_batch_ref: ref('temporal_batch', 'missing-summary-batch'),
      state_version: '1'
    });
    assert.throws(() => buildNpcActionDecisionRequestFromSnapshots({
      request_identity: {
        request_id: 'request-missing-summary',
        root_turn_id: 'turn-missing-summary',
        committed_state_version: 1,
        working_revision: 1,
        decision_index: 1
      },
      boundary,
      npc_snapshot: {
        instance_id: 'speaker', attributes: [], skills: [], machine_state: {}
      },
      current_activity_snapshot: {
        activity_ref: null, summary: null, status: 'idle',
        can_continue_automatically: false
      },
      resolved_signals: [signal],
      operation_contract: {}
    }), {
      name: 'TypeError',
      message:
        'NPC-safe perceived change summary is required for event:missing-summary'
    });
  });

test('NPC-safe projector excludes accessible foreign resources without subjective evidence', () => {
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
    perception_snapshot: {
      perceived_changes: [{
        source_event_ref: ref('event', 'event-2'),
        summary: 'Рядом появился доступный предмет.'
      }],
      visible_objects: [{
        resource_ref: 'unknown-packet',
        summary: 'неподтверждённая проекция свёртка'
      }, {
        resource_ref: 'perceived-packet',
        source_event_ref: ref('perception_event', 'packet-seen'),
        summary: 'замеченный свёрток'
      }],
      uncertainties: [{
        resource_ref: 'uncertain-packet',
        source_event_ref: ref('perception_event', 'packet-uncertain'),
        summary: 'возможно, рядом есть ещё один свёрток'
      }]
    },
    knowledge_snapshot: {
      known_facts: [{
        fact_ref: 'known-packet-fact',
        resource_ref: 'known-packet',
        source_event_ref: ref('knowledge_event', 'packet-known'),
        summary: 'известный свёрток лежит рядом'
      }, ...['private', 'hidden', 'locked'].map((state) => ({
        fact_ref: `known-${state}-controlled-fact`,
        resource_ref: `known-${state}-controlled`,
        source_event_ref: ref('knowledge_event', `${state}-packet-known`),
        summary: 'свой закрытый свёрток'
      })), ...['known-no-access-packet', 'known-unavailable-packet'].map(
        (resource_ref) => ({
          fact_ref: `${resource_ref}-fact`,
          resource_ref,
          source_event_ref: ref('knowledge_event', `${resource_ref}-known`),
          summary: 'известный свёрток лежит рядом'
        }))
      ],
      beliefs: [{
        resource_ref: 'believed-packet',
        source_event_ref: ref('rumor_event', 'packet-believed'),
        summary: 'Жданко думает, что свёрток может быть рядом'
      }],
      hypotheses: [{
        resource_ref: 'hypothetical-packet',
        source_event_ref: ref('inference_event', 'packet-hypothesis'),
        summary: 'Жданко допускает существование ещё одного свёртка'
      }]
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
    }, ...['concealed', 'private', 'blocked'].map((state) => ({
      item_id: `${state}-controlled`,
      template_id: 'packet',
      holder_npc_id: 'speaker',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        ...(state === 'blocked'
          ? { access_state: state }
          : { visibility_state: state })
      }
    })), ...['private', 'hidden', 'locked'].map((state) => ({
      item_id: `known-${state}-controlled`,
      template_id: 'packet',
      holder_npc_id: 'speaker',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        ...(state === 'locked'
          ? { access_state: state }
          : { visibility_state: state })
      }
    })), {
      item_id: 'unknown-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }, {
      item_id: 'perceived-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }, {
      item_id: 'known-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        access_state: 'available',
        visibility_state: 'visible'
      }
    }, {
      item_id: 'known-no-access-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        visibility_state: 'visible'
      }
    }, {
      item_id: 'known-unavailable-packet',
      template_id: 'packet',
      holder_npc_id: 'other',
      state: {
        location_ref: 'yard',
        zone_ref: 'gate',
        access_state: 'unavailable',
        visibility_state: 'visible'
      }
    }, ...['uncertain-packet', 'believed-packet', 'hypothetical-packet'].map(
      (item_id) => ({
        item_id,
        template_id: 'packet',
        holder_npc_id: 'other',
        state: {
          location_ref: 'yard',
          zone_ref: 'gate',
          access_state: 'available',
          visibility_state: 'visible'
        }
      }))],
    resolved_signals: [signal],
    operation_contract: {}
  });
  assert.equal(validateNpcActionDecisionRequest(request), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'bag-1'), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'axe-1'), true);
  for (const resourceRef of [
    'concealed-controlled', 'private-controlled', 'blocked-controlled'
  ]) {
    assert.equal(request.npc.available_resources.some(
      ({ resource_ref: value }) => value === resourceRef), false);
  }
  for (const resourceRef of [
    'known-private-controlled', 'known-hidden-controlled', 'known-locked-controlled'
  ]) {
    assert.equal(request.npc.available_resources.some(
      ({ resource_ref: value }) => value === resourceRef), false);
  }
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'unknown-packet'), false);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'perceived-packet'), true);
  assert.equal(request.npc.available_resources.some(
    ({ resource_ref: resourceRef }) => resourceRef === 'known-packet'), true);
  for (const resourceRef of [
    'known-no-access-packet', 'known-unavailable-packet', 'uncertain-packet',
    'believed-packet', 'hypothetical-packet'
  ]) {
    assert.equal(request.npc.available_resources.some(
      ({ resource_ref: value }) => value === resourceRef), false);
  }
});

test('NPC-safe resources require physical availability and evidence beyond held items', () => {
  const input = {
    npc_snapshot: {
      instance_id: 'speaker',
      machine_state: { location_ref: 'yard', spatial_zone_ref: 'gate' }
    },
    resource_snapshots: [{
      item_id: 'controlled-remote',
      ownership: { controller_npc_id: 'speaker' },
      state: { location_ref: 'storehouse', zone_ref: 'loft',
        access_state: 'accessible' }
    }, {
      item_id: 'controlled-inaccessible',
      ownership: { controller_npc_id: 'speaker' },
      state: { location_ref: 'yard', zone_ref: 'gate',
        access_state: 'unavailable' }
    }, {
      item_id: 'held',
      placement: { holder_npc_id: 'speaker' },
      state: { location_ref: 'yard', zone_ref: 'gate' }
    }, {
      item_id: 'held-at-inconsistent-place',
      placement: { holder_npc_id: 'speaker' },
      state: { location_ref: 'storehouse', zone_ref: 'loft' }
    }, {
      item_id: 'controlled-accessible',
      ownership: { controller_npc_id: 'speaker' },
      state: { location_ref: 'yard', zone_ref: 'gate',
        access_state: 'accessible' }
    }]
  };
  const projected = projectNpcSafeResourceSnapshots(input);

  assert.deepEqual(projected.map(({ resource_ref: resourceRef }) => resourceRef),
    ['held']);

  const perceived = projectNpcSafeResourceSnapshots({ ...input,
    knowledge_snapshot: { known_facts: [{
      fact_ref: 'controlled-accessible-fact',
      resource_ref: 'controlled-accessible',
      source_perception_ref: ref('perception_result', 'controlled-accessible-seen'),
      summary: 'доступный контролируемый предмет'
    }] }
  });
  assert.deepEqual(perceived.map(({ resource_ref: resourceRef }) => resourceRef),
    ['held', 'controlled-accessible']);

  const unknownNpcPlacement = projectNpcSafeResourceSnapshots({
    npc_snapshot: { instance_id: 'speaker', machine_state: {} },
    resource_snapshots: [{ item_id: 'held-somewhere',
      placement: { holder_npc_id: 'speaker' },
      state: { location_ref: 'storehouse' } }]
  });
  assert.deepEqual(unknownNpcPlacement, []);
});

test('NPC-safe controlled contents require an open container chain', () => {
  const projected = projectNpcSafeResourceSnapshots({
    npc_snapshot: { instance_id: 'speaker', machine_state: {
      location_ref: 'yard', spatial_zone_ref: 'gate' } },
    resource_snapshots: [{
      container_id: 'closed-bag', placement: { holder_npc_id: 'speaker' },
      open_state: 'closed'
    }, {
      item_id: 'closed-child', placement: { container_id: 'closed-bag' },
      ownership: { controller_npc_id: 'speaker' }, state: {
        location_ref: 'yard', zone_ref: 'gate', access_state: 'accessible' }
    }, {
      container_id: 'open-bag', placement: { holder_npc_id: 'speaker' },
      open_state: 'open'
    }, {
      item_id: 'open-child', placement: { container_id: 'open-bag' },
      ownership: { controller_npc_id: 'speaker' }, state: {
        location_ref: 'yard', zone_ref: 'gate', access_state: 'accessible' }
    }],
    knowledge_snapshot: { known_facts: [{
      fact_ref: 'open-child-fact', resource_ref: 'open-child',
      source_perception_ref: ref('perception_result', 'open-bag-inspected'),
      summary: 'предмет в открытой сумке'
    }] }
  });
  const refs = projected.map(({ resource_ref: resourceRef }) => resourceRef);
  assert.equal(refs.includes('closed-child'), false);
  assert.equal(refs.includes('open-child'), true);
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

const speaker = ref('npc', 'speaker');

function richSnapshots() {
  return {
    npc_snapshot: {
      instance_id: 'speaker',
      profile_level: 'key',
      role_ref: { id: 'reeve' },
      identity_state: {
        canonical_name: 'Ратша', age_range: 'adult', origin: 'Новгород',
        hidden_name: 'secret'
      },
      social_role: {
        status: 'старшина',
        authority: [{ actor_ref: ref('npc', 'villager'), role_ref: 'elder',
          scope_ref: 'village', status: 'active', hidden_grant: 'secret' }],
        dependencies: [{ actor_ref: ref('npc', 'prince'), role_ref: 'lord',
          scope_ref: 'land', status: 'sworn' }]
      },
      attributes: [{ attribute_ref: 'influence', label: 'Влияние', value: 4 }],
      skills: [{ skill_ref: 'communication', label: 'Красноречие', value: 3 }],
      temperament: [{ temperament_ref: 'calm', summary: 'сдержан', state: 'stable',
        intensity: 'low', hidden_trait: 'secret' }],
      values: [{ value_ref: 'honour', summary: 'держит слово', state: 'held',
        intensity: 'high' }],
      goals: [{ goal_ref: 'harvest', summary: 'собрать урожай', state: 'active',
        priority: 'high' }],
      fears: [{ fear_ref: 'raid', summary: 'набег', state: 'latent',
        intensity: 'medium' }],
      obligations: [{ obligation_ref: 'tribute', actor_ref: ref('npc', 'prince'),
        summary: 'дань князю', status: 'pending' }],
      machine_state: { location_ref: 'yard', spatial_zone_ref: 'gate' }
    },
    current_activity_snapshot: {
      activity_ref: 'watch-gate', summary: 'стоит на страже', status: 'running',
      can_continue_automatically: true, hidden_activity_state: 'secret'
    },
    body_snapshot: {
      summary: 'устал',
      conditions: [{ condition_ref: 'tired', hidden_cause: 'secret' }]
    },
    mood_snapshot: { state: 'спокоен', intensity: 'low', internal_reason: 'secret' },
    relationship_snapshots: [{ relationship_ref: 'rel-1', actor_ref: 'actor-1',
      relation: 'знакомый', status: 'known', trust: 'high', hidden_history: 'secret' }],
    resource_snapshots: [{ resource_ref: 'resource-1', template_ref: 'wood',
      holder_npc_id: 'speaker', hidden_contents: { hidden: 'secret' } }],
    perception_snapshot: {
      perceived_changes: [{ source_event_ref: ref('event', 'event-1'),
        summary: 'Смена началась.' }],
      visible_objects: [{ object_ref: 'resource-1', summary: 'дрова',
        hidden_owner: 'secret' }]
    },
    knowledge_snapshot: {
      known_facts: ['primitive payload', {
        fact_ref: ref('known_fact', 'fact-1'), source_event_ref: ref('event', 'event-1'),
        resource_ref: 'resource-1', process_ref: null, summary: 'ворота закрыты',
        state: 'known', confidence: 'high', hidden_truth: 'secret'
      }],
      beliefs: [{ belief_ref: ref('belief', 'belief-1'), source_event_ref: null,
        summary: 'сосед честен', state: 'held', confidence: 'medium' }],
      hypotheses: [{ hypothesis_ref: ref('hypothesis', 'hypothesis-1'),
        summary: 'лодка у пристани', state: 'open', confidence: 'low' }]
    },
    memory_snapshot: {
      recent_events: [{ event_ref: ref('memory_event', 'recent-1'),
        source_event_ref: ref('event', 'event-1'), summary: 'смена началась',
        occurred_at: occurredAt, hidden_detail: 'secret' }],
      relevant_long_term_events: [{ event_ref: ref('memory_event', 'old-1'),
        summary: 'прошлогодний набег', occurred_at: { ...occurredAt,
          whole_minutes: '1' } }],
      previous_decisions: [{ request_ref: 'request-0', boundary_ref: 'boundary-0',
        hidden_choice: 'secret' }]
    }
  };
}

function richAutoRequest(snapshots) {
  const signal = buildNpcDecisionSignal({
    occurred_at: occurredAt, category: 'objective', significance: 'material',
    source_event_ref: ref('event', 'event-1'), subject_ref: speaker, scope_refs: [],
    perception_required: false, source_perception_ref: null, causal_parent_refs: []
  });
  const boundary = buildNpcDecisionBoundary({
    npc_ref: speaker, decision_mode: 'autonomous', scheduled_at: occurredAt,
    significance: 'material', categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', signal.signal_id)],
    same_time_batch_ref: ref('temporal_batch', 'batch-1'), state_version: '1'
  });
  return buildNpcActionDecisionRequestFromSnapshots({
    request_identity: { request_id: 'request-rich', root_turn_id: 'turn-rich',
      committed_state_version: 1, working_revision: 1, decision_index: 1 },
    boundary, ...snapshots, resolved_signals: [signal], operation_contract: {}
  });
}

test('the AUTO request carries exactly the shared safe subject projection', () => {
  const snapshots = richSnapshots();
  const request = richAutoRequest(snapshots);
  const subject = projectNpcSafeSubject(snapshots);
  assert.deepEqual(Object.keys(subject), ['npc', 'knowledge', 'memory']);
  assert.equal(validateNpcActionDecisionRequest(request), true);
  for (const key of ['npc', 'knowledge', 'memory']) {
    assert.deepEqual(request[key], subject[key]);
    assert.equal(JSON.stringify(request[key]), JSON.stringify(subject[key]));
  }
  assert.equal(subject.npc.temperament.length, 1);
  assert.equal(subject.npc.obligations.length, 1);
  assert.equal(subject.npc.available_resources.length, 1);
  assert.equal(subject.knowledge.known_facts.length, 1);
  assert.equal(subject.knowledge.hypotheses.length, 1);
  assert.equal(subject.memory.relevant_long_term_events.length, 1);
  assert.equal(subject.memory.previous_decisions.length, 1);
  assert.doesNotMatch(JSON.stringify(subject), /hidden|secret|primitive/u);
});

test('the safe subject projection tolerates absent optional snapshots', () => {
  const subject = projectNpcSafeSubject({
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
  assert.deepEqual(subject.knowledge,
    { known_facts: [], beliefs: [], hypotheses: [] });
  assert.deepEqual(subject.memory,
    { recent_events: [], relevant_long_term_events: [], previous_decisions: [] });
  assert.equal(subject.npc.mood, null);
});

const observation = {
  observation_ref: ref('perception_result', 'observation-1'),
  source_type: 'direct_perception',
  observed_at: occurredAt,
  fact_text: 'Я вижу, что ворота закрыты.'
};

test('the conversation subject adds observations, messages and canonical refs', () => {
  const snapshots = richSnapshots();
  const safe = projectNpcSafeSubject(snapshots);
  const received = [{ message_id: 'message-1', utterance_text: 'Где лодка?' }];
  const input = {
    npc_ref: speaker,
    ...snapshots,
    current_observations: [observation],
    received_messages: received,
    additional_knowledge_refs: [
      ref('item_part', 'a-first'), ref('item', 'z-last'),
      ref('known_fact', 'fact-1'), ref('location', 'yard')
    ]
  };
  const subject = projectNpcConversationSubject(input);
  assert.deepEqual(Object.keys(subject),
    ['npc', 'knowledge', 'memory', 'available_resources', 'knowledge_refs']);
  assert.deepEqual(subject.npc, safe.npc);
  assert.deepEqual(subject.knowledge, safe.knowledge);
  const { current_observations: observations, received_messages: messages,
    ...memory } = subject.memory;
  assert.deepEqual(memory, safe.memory);
  assert.deepEqual(observations, [observation]);
  assert.deepEqual(messages, received);
  assert.notEqual(observations, input.current_observations);
  assert.notEqual(observations[0], observation);
  assert.notEqual(messages[0], received[0]);
  assert.deepEqual(subject.available_resources, safe.npc.available_resources);
  assert.notEqual(subject.available_resources, subject.npc.available_resources);
  assert.equal(subject.available_resources.length, 1);
  assert.deepEqual(subject.knowledge_refs, [
    ref('belief', 'belief-1'),
    ref('hypothesis', 'hypothesis-1'),
    ref('item', 'z-last'),
    ref('item_part', 'a-first'),
    ref('known_fact', 'fact-1'),
    ref('location', 'yard'),
    ref('memory_event', 'old-1'),
    ref('memory_event', 'recent-1'),
    ref('npc_identity', 'speaker'),
    ref('perception_result', 'observation-1')
  ]);
});

test('the conversation subject defaults to no observations and no messages', () => {
  const subject = projectNpcConversationSubject({
    npc_ref: speaker,
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
  assert.deepEqual(subject.memory, { recent_events: [], relevant_long_term_events: [],
    previous_decisions: [], current_observations: [], received_messages: [] });
  assert.deepEqual(subject.available_resources, []);
  assert.deepEqual(subject.knowledge_refs, [ref('npc_identity', 'speaker')]);
});

test('the conversation subject rejects every ref that is not an entity ref', () => {
  const broken = (change) => {
    const snapshots = richSnapshots();
    change(snapshots);
    return () => projectNpcConversationSubject({ npc_ref: speaker, ...snapshots,
      current_observations: [observation] });
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((snapshots) => {
    snapshots.knowledge_snapshot.known_facts[1].fact_ref = 'fact-1';
  }), TypeError);
  assert.throws(broken((snapshots) => {
    delete snapshots.knowledge_snapshot.beliefs[0].belief_ref;
  }), TypeError);
  assert.throws(broken((snapshots) => {
    snapshots.knowledge_snapshot.hypotheses[0].hypothesis_ref = 7;
  }), TypeError);
  assert.throws(broken((snapshots) => {
    snapshots.memory_snapshot.recent_events[0].event_ref = 'recent-1';
  }), TypeError);
  assert.throws(broken((snapshots) => {
    snapshots.memory_snapshot.relevant_long_term_events[0].event_ref = null;
  }), TypeError);
  const base = {
    npc_ref: speaker,
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  };
  assert.throws(() => projectNpcConversationSubject({ ...base,
    current_observations: [{ ...observation, observation_ref: 'observation-1' }] }),
  TypeError);
  assert.throws(() => projectNpcConversationSubject({ ...base,
    additional_knowledge_refs: ['location:yard'] }), TypeError);
  assert.throws(() => projectNpcConversationSubject({ ...base,
    additional_knowledge_refs: [{ entity_kind: 'location' }] }), TypeError);
  assert.throws(() => projectNpcConversationSubject({ ...base,
    npc_ref: 'speaker' }), TypeError);
});

test('the shared subject projections are exported from the package index', async () => {
  const index = await import('../src/index.js');
  assert.equal(index.projectNpcSafeSubject, projectNpcSafeSubject);
  assert.equal(index.projectNpcConversationSubject, projectNpcConversationSubject);
});
