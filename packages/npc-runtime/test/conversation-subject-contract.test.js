import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateNpcConversationResponseRequest,
  validateNpcConversationResponseSubject
} from '../src/conversation-contracts.js';
import {
  projectNpcConversationSubject
} from '../src/semantic-decision-contracts.js';
import { validateNpc } from '../src/npc-safe-subject-contract.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = (whole_minutes = '10') => ({
  whole_minutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const copy = (value) => structuredClone(value);

function npcBlock() {
  return {
    profile_level: 'key',
    identity: { name_or_label: 'Ратша', age_range: 'adult', origin: 'Новгород' },
    social_role: { role_ref: 'reeve', status: 'старшина', authority: [],
      dependencies: [] },
    attributes: [{ attribute_ref: 'influence', label: 'Влияние', value: 4 }],
    skills: [{ skill_ref: 'communication', label: 'Красноречие', value: 3 }],
    body_state: { summary: 'устал', conditions: [] },
    mood: { state: 'спокоен', intensity: 'low' },
    temperament: [],
    values: [],
    goals: [],
    fears: [],
    obligations: [],
    relationships: [],
    current_activity: { activity_ref: 'watch-gate', summary: 'стоит на страже',
      status: 'running', can_continue_automatically: true },
    available_resources: [{ resource_ref: 'resource-1', template_ref: 'wood' }]
  };
}

function subjectBlocks() {
  const npc = npcBlock();
  return {
    npc,
    knowledge: {
      known_facts: [{ fact_ref: ref('known_fact', 'fact-1'),
        source_event_ref: ref('event', 'event-1'), resource_ref: 'resource-1',
        process_ref: null, summary: 'ворота закрыты', state: 'known',
        confidence: 'high' }],
      beliefs: [{ belief_ref: ref('belief', 'belief-1'), source_event_ref: null,
        summary: 'сосед честен', state: 'held', confidence: 'medium' }],
      hypotheses: [{ hypothesis_ref: ref('hypothesis', 'hypothesis-1'),
        source_event_ref: 'event-2', summary: 'лодка у пристани', state: 'open',
        confidence: 'low' }]
    },
    memory: {
      recent_events: [{ event_ref: ref('memory_event', 'recent-1'),
        source_event_ref: ref('event', 'event-1'), summary: 'смена началась',
        occurred_at: at('9') }],
      relevant_long_term_events: [{ event_ref: ref('memory_event', 'old-1'),
        source_event_ref: null, summary: 'прошлогодний набег',
        occurred_at: at('1') }],
      previous_decisions: [{ request_ref: 'request-0', boundary_ref: 'boundary-0' }],
      current_observations: [{ observation_ref: ref('perception_result',
        'observation-1'), source_type: 'direct_perception', observed_at: at('10'),
      fact_text: 'Я вижу, что ворота закрыты.' }],
      received_messages: [{ message_id: 'message-1', utterance_text: 'Где лодка?' }]
    },
    available_resources: copy(npc.available_resources)
  };
}

const KNOWLEDGE_REFS = [
  ref('belief', 'belief-1'),
  ref('hypothesis', 'hypothesis-1'),
  ref('known_fact', 'fact-1'),
  ref('memory_event', 'old-1'),
  ref('memory_event', 'recent-1'),
  ref('npc_identity', 'speaker'),
  ref('perception_result', 'observation-1')
];

function request(blocks = subjectBlocks(), knowledgeRefs = KNOWLEDGE_REFS) {
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-2',
    boundary_id: 'boundary-2',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: at(),
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'critical',
      categories: ['self', 'communication'],
      signal_refs: [
        ref('npc_decision_signal', 'signal-a'),
        ref('npc_decision_signal', 'signal-z')
      ],
      perceived_changes: ['Услышан прямой вопрос.']
    },
    npc: blocks.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: blocks.knowledge,
    memory: blocks.memory,
    social_context: {},
    available_resources: blocks.available_resources,
    allowed_references: {
      actor_refs: [
        ref('npc', 'listener'),
        ref('npc', 'speaker'),
        ref('player_character', 'player')
      ],
      entity_refs: [],
      knowledge_refs: copy(knowledgeRefs),
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['communication'],
      allowed_check_profile_refs: ['risky'],
      allowed_duration_classes: ['brief'],
      operation_contract: { emit_interaction: {} }
    }
  };
}

const mutate = (change) => {
  const value = request();
  change(value);
  return value;
};

test('a well-formed subject passes the strict validator and the old one', () => {
  const value = request();
  assert.equal(validateNpcConversationResponseRequest(value), true);
  assert.equal(validateNpcConversationResponseSubject(value), true);
});

test('optional projection fields may be absent', () => {
  const value = mutate((draft) => {
    draft.knowledge.known_facts = [{ fact_ref: ref('known_fact', 'fact-1') }];
    draft.knowledge.beliefs = [];
    draft.knowledge.hypotheses = [];
    draft.memory.recent_events = [{ event_ref: ref('memory_event', 'recent-1') }];
    draft.memory.relevant_long_term_events = [];
    draft.memory.previous_decisions = [{}];
    draft.memory.received_messages = [];
  });
  assert.equal(validateNpcConversationResponseSubject(value), true);
});

test('the request validator applies the strict subject validator', async (t) => {
  const loose = {
    'an empty npc block': (draft) => { draft.npc = {}; },
    'an empty knowledge block': (draft) => { draft.knowledge = {}; },
    'an empty memory block': (draft) => { draft.memory = {}; },
    'all three empty': (draft) => {
      draft.npc = {};
      draft.knowledge = {};
      draft.memory = {};
    }
  };
  for (const [name, change] of Object.entries(loose)) {
    await t.test(name, () => {
      const value = mutate(change);
      assert.equal(validateNpcConversationResponseSubject(value), false);
      assert.equal(validateNpcConversationResponseRequest(value), false);
    });
  }
});

test('a request that is not a record is rejected', () => {
  for (const value of [null, undefined, 'request', 7, []]) {
    assert.equal(validateNpcConversationResponseSubject(value), false);
  }
});

const REJECTED = {
  'npc without a key': (draft) => { delete draft.npc.skills; },
  'npc with an extra key': (draft) => { draft.npc.hidden_state = 'secret'; },
  'npc with an unknown profile level': (draft) => {
    draft.npc.profile_level = 'epic';
  },
  'npc mood intensity that is not an id': (draft) => {
    draft.npc.mood.intensity = 3;
  },
  'npc rated entry without a label': (draft) => { delete draft.npc.skills[0].label; },
  'npc activity with an empty status': (draft) => {
    draft.npc.current_activity.status = '';
  },
  'knowledge without a key': (draft) => { delete draft.knowledge.hypotheses; },
  'knowledge with an extra key': (draft) => { draft.knowledge.rumours = []; },
  'knowledge group that is not an array': (draft) => {
    draft.knowledge.beliefs = {};
  },
  'knowledge entry that is a string': (draft) => {
    draft.knowledge.known_facts.push('ворота закрыты');
  },
  'known fact with an unknown field': (draft) => {
    draft.knowledge.known_facts[0].hidden_truth = 'secret';
  },
  'known fact without its own ref': (draft) => {
    delete draft.knowledge.known_facts[0].fact_ref;
  },
  'known fact ref of a wrong kind': (draft) => {
    draft.knowledge.known_facts[0].fact_ref = ref('belief', 'fact-1');
  },
  'known fact ref that is a string': (draft) => {
    draft.knowledge.known_facts[0].fact_ref = 'fact-1';
  },
  'known fact with an empty summary': (draft) => {
    draft.knowledge.known_facts[0].summary = '';
  },
  'known fact with a numeric state': (draft) => {
    draft.knowledge.known_facts[0].state = 1;
  },
  'known fact with a numeric confidence': (draft) => {
    draft.knowledge.known_facts[0].confidence = 0.9;
  },
  'known fact source event that is a number': (draft) => {
    draft.knowledge.known_facts[0].source_event_ref = 5;
  },
  'known fact resource that is a partial ref': (draft) => {
    draft.knowledge.known_facts[0].resource_ref = { entity_kind: 'item' };
  },
  'known fact process that is an empty string': (draft) => {
    draft.knowledge.known_facts[0].process_ref = '';
  },
  'belief ref of a wrong kind': (draft) => {
    draft.knowledge.beliefs[0].belief_ref = ref('hypothesis', 'belief-1');
  },
  'belief with a resource field': (draft) => {
    draft.knowledge.beliefs[0].resource_ref = 'resource-1';
  },
  'hypothesis without its own ref': (draft) => {
    delete draft.knowledge.hypotheses[0].hypothesis_ref;
  },
  'hypothesis with a process field': (draft) => {
    draft.knowledge.hypotheses[0].process_ref = 'process-1';
  },
  'memory without a key': (draft) => { delete draft.memory.received_messages; },
  'memory with an extra key': (draft) => { draft.memory.dreams = []; },
  'memory event with an unknown field': (draft) => {
    draft.memory.recent_events[0].hidden_detail = 'secret';
  },
  'memory event without its ref': (draft) => {
    delete draft.memory.recent_events[0].event_ref;
  },
  'memory event ref of a wrong kind': (draft) => {
    draft.memory.recent_events[0].event_ref = ref('event', 'recent-1');
  },
  'memory event time that is not a timestamp': (draft) => {
    draft.memory.recent_events[0].occurred_at = { whole_minutes: 'x' };
  },
  'long-term event with an empty summary': (draft) => {
    draft.memory.relevant_long_term_events[0].summary = '';
  },
  'previous decision with an unknown field': (draft) => {
    draft.memory.previous_decisions[0].hidden_choice = 'secret';
  },
  'observation with an extra key': (draft) => {
    draft.memory.current_observations[0].hidden = 'secret';
  },
  'observation without fact text': (draft) => {
    delete draft.memory.current_observations[0].fact_text;
  },
  'observation with blank fact text': (draft) => {
    draft.memory.current_observations[0].fact_text = '   ';
  },
  'observation ref of a wrong kind': (draft) => {
    draft.memory.current_observations[0].observation_ref =
      ref('known_fact', 'observation-1');
  },
  'observation that is not direct perception': (draft) => {
    draft.memory.current_observations[0].source_type = 'hearsay';
  },
  'observation time that is not a timestamp': (draft) => {
    draft.memory.current_observations[0].observed_at = 'вчера';
  },
  'received message that is a string': (draft) => {
    draft.memory.received_messages.push('Где лодка?');
  },
  'received messages that are not an array': (draft) => {
    draft.memory.received_messages = {};
  },
  'available resources that differ from the npc ones': (draft) => {
    draft.available_resources.push({ resource_ref: 'resource-2' });
  },
  'available resources that are empty while the npc has some': (draft) => {
    draft.available_resources = [];
  }
};

test('every malformed subject is rejected',
  async (t) => {
    for (const [name, change] of Object.entries(REJECTED)) {
      await t.test(name, () => {
        assert.equal(validateNpcConversationResponseSubject(mutate(change)), false);
      });
    }
  });

const REF_PATHS = {
  'the npc identity': ref('npc_identity', 'speaker'),
  'a known fact': ref('known_fact', 'fact-1'),
  'a belief': ref('belief', 'belief-1'),
  'a hypothesis': ref('hypothesis', 'hypothesis-1'),
  'a recent event': ref('memory_event', 'recent-1'),
  'a long-term event': ref('memory_event', 'old-1'),
  'an observation': ref('perception_result', 'observation-1')
};

test('every subject ref must be an allowed knowledge ref', async (t) => {
  for (const [name, missing] of Object.entries(REF_PATHS)) {
    await t.test(name, () => {
      const knowledgeRefs = KNOWLEDGE_REFS.filter((reference) =>
        reference.entity_kind !== missing.entity_kind
        || reference.entity_id !== missing.entity_id);
      assert.equal(knowledgeRefs.length, KNOWLEDGE_REFS.length - 1);
      const value = request(subjectBlocks(), knowledgeRefs);
      assert.equal(validateNpcConversationResponseSubject(value), false);
    });
  }
  const extra = request(subjectBlocks(),
    [...KNOWLEDGE_REFS, ref('route', 'zzz')]);
  assert.equal(validateNpcConversationResponseSubject(extra), true);
});

test('the leaf module validates the npc block and has no cyclic import', () => {
  assert.equal(validateNpc(npcBlock()), true);
  assert.equal(validateNpc({ ...npcBlock(), extra: 1 }), false);
  assert.equal(validateNpc({ ...npcBlock(), profile_level: 'epic' }), false);
  const source = readFileSync(
    new URL('../src/npc-safe-subject-contract.js', import.meta.url), 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/gu)]
    .map((match) => match[1]);
  assert.deepEqual(specifiers, ['./internal.js']);
});

test('the request contract module keeps every helper export', async () => {
  const contract = await import('../src/semantic-decision-request-contract.js');
  for (const name of ['enumValue', 'finiteInteger', 'jsonSafe', 'nullableStableId',
    'nullableText', 'text', 'validateNpcActionDecisionRequest',
    'buildNpcActionDecisionRequest']) {
    assert.equal(typeof contract[name], 'function', name);
  }
  for (const name of ['ADAPTATIONS', 'DIRECT_OPERATIONS', 'DIFFICULTIES',
    'DOMAIN_OPERATIONS', 'DURATION_CLASSES', 'EFFORTS', 'GOAL_RESULTS',
    'OUTCOME_KEYS', 'PLAN_KEYS', 'RESOLUTIONS', 'SUPPORTED_OPERATIONS',
    'TRACE_KEYS']) {
    assert.notEqual(contract[name], undefined, name);
  }
});

test('the strict validator is exported from the package index', async () => {
  const index = await import('../src/index.js');
  assert.equal(index.validateNpcConversationResponseSubject,
    validateNpcConversationResponseSubject);
});

test('a subject built by the shared projector passes the strict validator', () => {
  const occurredAt = at('10');
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'speaker'),
    npc_snapshot: {
      instance_id: 'speaker',
      profile_level: 'key',
      role_ref: { id: 'reeve' },
      identity_state: { canonical_name: 'Ратша', age_range: 'adult',
        origin: 'Новгород' },
      social_role: { status: 'старшина' },
      attributes: [{ attribute_ref: 'influence', label: 'Влияние', value: 4 }],
      skills: [{ skill_ref: 'communication', label: 'Красноречие', value: 3 }],
      machine_state: { location_ref: 'yard' }
    },
    current_activity_snapshot: { activity_ref: 'watch-gate',
      summary: 'стоит на страже', status: 'running',
      can_continue_automatically: true },
    mood_snapshot: { state: 'спокоен', intensity: 'low' },
    resource_snapshots: [{ resource_ref: 'resource-1', template_ref: 'wood',
      holder_npc_id: 'speaker' }],
    knowledge_snapshot: {
      known_facts: [{ fact_ref: ref('known_fact', 'fact-1'),
        source_event_ref: ref('event', 'event-1'), summary: 'ворота закрыты',
        state: 'known', confidence: 'high' }],
      beliefs: [{ belief_ref: ref('belief', 'belief-1'), summary: 'сосед честен',
        state: 'held', confidence: 'medium' }],
      hypotheses: [{ hypothesis_ref: ref('hypothesis', 'hypothesis-1'),
        summary: 'лодка у пристани', state: 'open', confidence: 'low' }]
    },
    memory_snapshot: {
      recent_events: [{ event_ref: ref('memory_event', 'recent-1'),
        summary: 'смена началась', occurred_at: occurredAt }],
      relevant_long_term_events: [{ event_ref: ref('memory_event', 'old-1'),
        summary: 'прошлогодний набег', occurred_at: at('1') }],
      previous_decisions: [{ request_ref: 'request-0', boundary_ref: 'boundary-0' }]
    },
    current_observations: [{ observation_ref: ref('perception_result',
      'observation-1'), source_type: 'direct_perception', observed_at: occurredAt,
    fact_text: 'Я вижу, что ворота закрыты.' }],
    received_messages: [{ message_id: 'message-1', utterance_text: 'Где лодка?' }]
  });
  const value = request(subject, subject.knowledge_refs);
  assert.equal(validateNpcConversationResponseRequest(value), true);
  assert.equal(validateNpcConversationResponseSubject(value), true);
  assert.equal(subject.knowledge_refs.length, KNOWLEDGE_REFS.length);
  const wrongNpc = request(subject, subject.knowledge_refs);
  wrongNpc.npc_ref = ref('npc', 'listener');
  assert.equal(validateNpcConversationResponseSubject(wrongNpc), false);
});
