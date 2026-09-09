import test from 'node:test';
import assert from 'node:assert/strict';

import { runTurnWorkflow } from '../src/index.js';
import { createTurnStepDomainOwnerPreflight } from
  '../src/turn-step-admission.js';
import { resolveObservedEvidenceInspection } from
  '../src/turn-step-observed-evidence.js';
import { createServices, input, turnStepPlan } from './turn-workflow-fixture.js';

function operation(targetRef) {
  return { op: 'request_discovery', actor_ref: 'party-1',
    discovery_kind: 'inspect', target_refs: [targetRef],
    query: 'сопоставить отметину с другими следами' };
}

function preflight() {
  return createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: {},
    committedState: {}, services: {} });
}

test('only player-observed evidence receives the bounded owner', () => {
  const validate = preflight();
  const request = { player_safe_state: { knowledge: [{
    fact_id: 'fact:charred-post-mark', knowledge_state: 'observed'
  }] } };
  assert.doesNotThrow(() => validate({ plan: {
    resolution: 'domain_request', operations: [
      operation('fact:charred-post-mark')], check: null
  }, request, prepared_chain_context: null }));
  assert.throws(() => validate({ plan: {
    resolution: 'domain_request', operations: [
      operation('fact:unobserved-mark')], check: null
  }, request, prepared_chain_context: null }), {
    code: 'TURN_STEP_PLAN_INVALID'
  });
  assert.equal(resolveObservedEvidenceInspection({
    working_projection: {}
  }).consequence_fragment.visible_seed.ordinary_presence_seed.resolution,
  'authority_required');
});

test('evidence limitation reaches normal turn presentation', async () => {
  const log = [];
  const { commits, services } = createServices(log, {
    command: { matches: () => false, semantic_binding: {
      binding_id: 'inspect-evidence', operation: 'request_discovery',
      matches: () => false
    } },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' }, player_safe_state: { knowledge: [{
        fact_id: 'fact:worn-rope-mark', knowledge_state: 'observed'
      }] }
    }),
    turnStepModel: async (request) => turnStepPlan(request, {
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [operation('fact:worn-rope-mark')]
    })
  });
  await runTurnWorkflow({ ...input(),
    raw_text: 'Сопоставляю след с известными верёвками.' }, services);
  assert.equal(log.includes('narration'), true);
  assert.equal(commits.length, 1);
});
