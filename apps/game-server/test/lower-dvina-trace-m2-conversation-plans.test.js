import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyEremeyPlan } from
  '../src/runtime/lower-dvina-trace-m2-conversation-plans.js';

const routeRef = 'route:camp-to-shed';
const knowledgeScopeRef = 'knowledge:local-fisher';

test('Eremey identity knowledge is not mistaken for route disclosure', () => {
  const plan = speechPlan({ claims: [{
    claim_id: 'claim:self', content_summary: 'Я Еремей, рыбак.',
    form: 'assertion', speaker_posture: 'believed_true',
    source_knowledge_refs: [{
      entity_kind: 'knowledge_scope', entity_id: knowledgeScopeRef
    }],
    mentioned_entity_refs: [{ entity_kind: 'npc', entity_id: 'npc:eremey' }]
  }] });

  assert.deepEqual(classifyEremeyPlan(plan, {
    routeRef, knowledgeScopeRef
  }), { kind: 'speech', statementRef: null });
});

test('Eremey route reference still requires its exact operation', () => {
  const plan = speechPlan({ topic_refs: [routeRef] });

  assert.throws(() => classifyEremeyPlan(plan, {
    routeRef, knowledgeScopeRef
  }), { code: 'TRACE_M2_ROUTE_DISCLOSURE_UNBACKED' });
});

function speechPlan({ claims = [], topic_refs = [] } = {}) {
  return {
    contribution_kind: 'speech',
    activity: { duration_class: 'domain_owned' },
    supporting_operations: [],
    speech: {
      dominant_act: 'answer', interaction_tags: [], topic_refs, claims
    }
  };
}
