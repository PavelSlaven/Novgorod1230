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

test('only code-projected observed evidence receives the bounded owner', () => {
  const validate = preflight();
  const request = { player_safe_state: {
    knowledge: [{ fact_id: 'fact:raw-observation',
      knowledge_state: 'observed' }],
    observed_evidence_inspection: { semantic_grounding_available: true,
      candidates: [
        { fact_ref: 'fact:charred-post-mark', text: 'На столбе видна отметина.' },
        { fact_ref: 'fact:worn-rope-mark', text: 'На канате заметен износ.' }
      ] }
  } };
  assert.doesNotThrow(() => validate({ plan: {
    resolution: 'domain_request', operations: [
      { ...operation('fact:charred-post-mark'),
        target_refs: ['fact:charred-post-mark', 'fact:worn-rope-mark'] }
    ], check: null
  }, request, prepared_chain_context: null }));
  for (const targetRef of ['fact:unobserved-mark', 'fact:raw-observation']) {
    assert.throws(() => validate({ plan: {
      resolution: 'domain_request', operations: [operation(targetRef)],
      check: null
    }, request, prepared_chain_context: null }), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
  }
  assert.throws(() => validate({ plan: {
    resolution: 'domain_request', operations: [operation('fact:malformed')],
    check: null
  }, request: { player_safe_state: { observed_evidence_inspection: {
    semantic_grounding_available: true,
    candidates: [{ fact_ref: 'fact:malformed', text: '' }]
  } } }, prepared_chain_context: null }), {
    code: 'TURN_STEP_PLAN_INVALID'
  });
  assert.equal(resolveObservedEvidenceInspection({
    working_projection: {}, operation: operation('fact:worn-rope-mark')
  }).consequence_fragment.visible_seed.observed_evidence_inspection_seed.resolution,
  'no_new_supported_conclusion');
});

test('observed evidence preserves the actual question without turning it into object discovery', () => {
  for (const query of ['Какие следы перекрывают другие?', 'Есть ли связь между отметиной и износом каната?']) {
    const projection = { known: ['видимые следы'] };
    const result = resolveObservedEvidenceInspection({ working_projection: projection,
      operation: { ...operation('fact:worn-rope-mark'), query } });
    assert.deepEqual(result.working_projection, projection);
    assert.deepEqual(result.write_fragments, []);
    assert.deepEqual(result.consequence_fragment.visible_seed, {
      observed_evidence_inspection_seed: { kind: 'observed_evidence_inspection_seed',
        resolution: 'no_new_supported_conclusion', query }
    });
  }
});

test('evidence limitation reaches normal turn presentation', async () => {
  const log = [];
  const { commits, services } = createServices(log, {
    command: { matches: () => false, semantic_binding: {
      binding_id: 'inspect-evidence', operation: 'request_discovery',
      matches: () => false
    } },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' }, player_safe_state: {
        observed_evidence_inspection: { semantic_grounding_available: true,
          candidates: [{ fact_ref: 'fact:worn-rope-mark',
            text: 'На канате заметен износ.' }] }
      }
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
