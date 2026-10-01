import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal
} from '@rus/npc-runtime';
import { advanceTemporalNpcDecisionBoundary } from
  '../src/temporal-advance.js';
import { prepareNpcDecisionForActorStep } from
  '../src/temporal-npc-decision-plan.js';
import { aggregateTemporalNpcDecisionSignals } from
  '../src/temporal-npc-decision-signals.js';

const at = (wholeMinutes) => ({
  whole_minutes: String(wholeMinutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});

const npcRef = { entity_kind: 'npc', entity_id: 'npc-a' };

test('blocked NPC operation replaces the whole validated plan with wait',
  async () => {
    const queueId = 'needs_check.csv#TEST001';
    const plan = { schema: 'npc_step_plan_v1', npc_ref: 'npc-a',
      resolution: 'domain_request', operations: [
        { op: 'create_entity', semantic_type: 'tool', name: 'запрещённый предмет',
          facts: [{ text: 'стальной' }] },
        { op: 'request_discovery', discovery_kind: 'search',
          query: 'другая вещь', target_refs: ['storehouse'], actor_ref: 'npc-a' }
      ] };
    const proposal = { status: 'planned', plan, signal_ids_to_consume: ['signal-1'] };
    const autonomous = { proposal, request: { npc_ref: 'npc-a' },
      decision_records: [{ proposal }] };
    const diagnostics = [];
    const prepared = await prepareNpcDecisionForActorStep({ autonomous,
      committedState: { party_id: 'party-1' },
      async assertNeedsCheckAllowed({ candidate }) {
        assert.deepEqual(candidate, { semantic_type: 'tool',
          name: 'запрещённый предмет', facts: ['стальной'],
          path: 'NPC.create_entity' });
        throw Object.assign(new Error('blocked'), { code:
          'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED', details: {
            queue_id: queueId, queue_ids: [queueId]
          } });
      },
      recordNeedsCheckFilter: (record) => diagnostics.push(record)
    });

    assert.equal(prepared.proposal.plan.operations.length, 1);
    assert.deepEqual(prepared.proposal.plan.operations[0], {
      op: 'request_activity', actor_ref: 'npc-a', activity_kind: 'wait',
      target_refs: [], description: 'Ждать до следующей точки решения.'
    });
    assert.deepEqual(prepared.decision_records[0].proposal.plan,
      prepared.proposal.plan);
    assert.deepEqual(diagnostics, [{ path: 'NPC.create_entity',
      queue_ids: [queueId] }]);
    assert.equal(JSON.stringify(prepared).includes(queueId), false);
  });

test('blocked O1 query and independent A1 output select ordinary NPC wait',
  async () => {
    for (const [operation, path, candidateName] of [
      [{ op: 'request_discovery', actor_ref: 'npc-a',
        discovery_kind: 'search', target_refs: ['storehouse'],
        query: 'самопрялка' }, 'O1.request.query', 'самопрялка'],
      [{ op: 'request_discovery', actor_ref: 'npc-a',
        discovery_kind: 'inspect', target_refs: ['storehouse'],
        query: 'Колёсная прялка' }, 'O1.request.query', 'Колёсная прялка'],
      [{ op: 'request_item_use', actor_ref: 'npc-a', item_ref: 'bag',
        use_kind: 'other', target_refs: ['fire'], action_production: {
          identity_mode: 'independent_outputs', result_descriptor: {
            display_name: 'самопрялка', physical_description: 'деревянная',
            qualitative_facts: ['с ножным приводом'], inscription_text: null,
            source_fact_delta: null
          }
        } }, 'A1.preflight.result_descriptor', 'самопрялка']
    ]) {
      const autonomous = { request: { npc_ref: 'npc-a' }, proposal: {
        status: 'planned', signal_ids_to_consume: [], plan: {
          schema: 'npc_step_plan_v1', npc_ref: 'npc-a',
          resolution: 'domain_request', operations: [operation]
        }
      } };
      const diagnostics = [];
      const prepared = await prepareNpcDecisionForActorStep({ autonomous,
        committedState: {},
        async assertNeedsCheckAllowed({ candidate }) {
          assert.equal(candidate.name, candidateName);
          assert.equal(candidate.path, path);
          throw Object.assign(new Error('blocked'), { code:
            'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED', details: {
              queue_ids: ['needs_check.csv#TEST002']
            } });
        },
        recordNeedsCheckFilter: (record) => diagnostics.push(record)
      });
      assert.equal(prepared.proposal.plan.operations[0].activity_kind, 'wait');
      assert.deepEqual(diagnostics, [{ path,
        queue_ids: ['needs_check.csv#TEST002'] }]);
    }
  });

test('NPC inspects an exact-name committed visible item before query preflight',
  async () => {
    const autonomous = { request: { npc_ref: 'npc-a', npc: {
      available_resources: [{ resource_ref: 'wheel-1' }]
    }, perception: { visible_objects: [{ object_ref: 'wheel-1',
      source_perception_ref: 'sight:wheel-1', summary: 'Колёсная прялка' }] } },
    proposal: { status: 'planned', plan: { schema: 'npc_step_plan_v1',
      npc_ref: 'npc-a', resolution: 'domain_request', operations: [{
        op: 'request_discovery', actor_ref: 'npc-a',
        discovery_kind: 'inspect', target_refs: ['wheel-1'],
        query: 'Колёсная прялка'
      }] } } };
    const prepared = await prepareNpcDecisionForActorStep({ autonomous,
      committedState: { items: [{ item_id: 'wheel-1', name: 'Колёсная прялка',
        semantic_type: 'household_tool' }] },
      async assertNeedsCheckAllowed() {
        assert.fail('an existing committed identity is not new materialization');
      }
    });

    assert.equal(prepared, autonomous,
      'known existing item inspection preserves the validated NPC plan');
  });

test('A1 inherited source facts reach the needs-check candidate baseline',
  async () => {
    const inherited = 'самопрялка';
    const autonomous = { request: { npc_ref: 'npc-a',
      resource_snapshots: [{ item_id: 'item:source', category_id: 'wood',
        name: 'доска', state: { ordinary_metadata: {
          name: 'доска', semantic_type: 'wood',
          physical_description: 'обычная сосновая доска',
          semantic_facts: [{ text: inherited }],
          physical_inscriptions: [{ text: inherited }]
        } } }] }, proposal: { status: 'planned', plan: {
      schema: 'npc_step_plan_v1', npc_ref: 'npc-a', resolution: 'domain_request',
      operations: [{ op: 'request_item_use', actor_ref: 'npc-a',
        item_ref: 'item:source', use_kind: 'other', target_refs: [],
        action_production: { source_refs: ['item:source'],
          identity_mode: 'independent_outputs', result_descriptor: {
            display_name: 'обработанная доска',
            physical_description: 'свежий срез',
            qualitative_facts: ['свежий срез'], inscription_text: null,
            source_fact_delta: { physical_description: null,
              qualitative_facts: [inherited], removed_physical_fact_refs: [],
              physical_form: null }
          } }
      }]
    } } };
    let checkedCandidate;
    const prepared = await prepareNpcDecisionForActorStep({ autonomous,
      committedState: {},
      async assertNeedsCheckAllowed({ candidate }) {
        checkedCandidate = candidate;
        const baseline = candidate.source_fact_delta_baseline;
        assert.equal(candidate.path, 'A1.preflight.result_descriptor');
        assert.equal(candidate.source_fact_delta.qualitative_facts
          .includes(inherited), true);
        assert.equal(baseline.qualitative_facts.includes(inherited), true);
        assert.equal(baseline.inscription_text, inherited);
        assert.equal(baseline.name, 'доска');
        assert.equal(baseline.semantic_type, 'wood');
      }
    });
    assert.equal(prepared, autonomous,
      'an inherited delta fact already present on the source is not a new blocker hit');
    assert.ok(checkedCandidate);
  });

function signalDescriptor(entityId, parents = [], summary = `change:${entityId}`) {
  return {
    occurred_at: at(25),
    category: 'objective',
    significance: 'material',
    source_event_ref: {
      entity_kind: 'npc_activity_factual_transition',
      entity_id: entityId
    },
    subject_ref: npcRef,
    scope_refs: [],
    perception_required: false,
    source_perception_ref: null,
    causal_parent_refs: parents,
    perceived_change_summary: summary
  };
}

test('persisted same-time boundaries are replayed within their decision mode',
  () => {
    const descriptor = signalDescriptor('mode-specific-replay');
    const signal = buildNpcDecisionSignal(descriptor);
    const batchRef = {
      entity_kind: 'temporal_batch',
      entity_id: 'temporal-batch:party-mode:25:0/1:1'
    };
    const boundaryFor = (decisionMode) => {
      const generated = buildNpcDecisionBoundary({
        decision_mode: decisionMode,
        scheduled_at: at(25),
        npc_ref: npcRef,
        same_time_batch_ref: batchRef,
        significance: 'material',
        categories: ['objective'],
        signal_refs: [{
          entity_kind: 'npc_decision_signal',
          entity_id: signal.signal_id
        }],
        state_version: '1'
      });
      return {
        ...structuredClone(generated),
        boundary_id: 'npc-decision:temporal-batch:party-mode:25:0/1:1:npc-a',
        idempotency_key:
          'npc-decision:temporal-batch:party-mode:25:0/1:1:npc-a'
      };
    };
    const autonomous = boundaryFor('autonomous');
    const conversation = boundaryFor('conversation');

    const result = aggregateTemporalNpcDecisionSignals({
      temporal: {
        result: { clock_after: at(25) },
        projection: { npc_decision_signal_descriptors: [descriptor] }
      },
      factual_state: {
        party_id: 'party-mode',
        party_state: { state_version: 1 },
        npc_decision_signals: [{ signal }],
        consumed_npc_decision_signal_ids: [signal.signal_id],
        npc_semantic_decision_inputs: [
          { boundary_snapshot: conversation },
          { boundary_snapshot: autonomous }
        ]
      },
      npc_ref: npcRef,
      active_mode: 'autonomous',
      decision_capability: true
    });

    assert.equal(result.boundary.boundary_id, autonomous.boundary_id);
    assert.equal(result.persisted_decision_input.boundary_snapshot.decision_mode,
      'autonomous');
  });

test('NPC signal batch rejects a source without NPC-safe semantic summary',
  async () => {
    const descriptor = signalDescriptor('missing-summary');
    delete descriptor.perceived_change_summary;
    await assert.rejects(() => advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: { npc_decision_signal_descriptors: [descriptor] }
      }),
      decisionSignalState: {
        factual_state: {
          party_id: 'party-summary',
          party_state: { state_version: 1 },
          npc_decision_signals: [],
          consumed_npc_decision_signal_ids: [],
          npc_semantic_decision_inputs: []
        },
        npc_ref: npcRef,
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async () => assert.fail('must fail before decision'),
      executeActorStep: async () => assert.fail('must fail before actor step'),
      continueAdvance: async () => assert.fail('must fail before continuation')
    }), ({ code }) => code === 'temporal_change_set_conflict');
  });

test('NPC domain rejection terminates the boundary without temporal continuation',
  async () => {
    let continuationCalls = 0;
    const domainResult = {
      pass: false,
      errors: [{
        code: 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE',
        category: 'applicability',
        retryable: false
      }]
    };
    const result = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) }
      }),
      resolveDecision: async () => ({ boundary: { scheduled_at: at(25) } }),
      executeActorStep: async () => ({
        working_projection: { unchanged: true },
        domain_result: domainResult
      }),
      continueAdvance: async () => {
        continuationCalls += 1;
        throw new Error('domain rejection must not continue time');
      }
    });

    assert.equal(continuationCalls, 0);
    assert.deepEqual(result.actor_step.domain_result, domainResult);
    assert.equal(result.continuation, null);
  });

test('NPC actor-step starts at the paused timestamp before continuation',
  async () => {
    const calls = [];
    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => {
        calls.push('advance:25');
        return { result: { temporal_status: 'paused', clock_after: at(25) },
          projection: { phase: 'decision' } };
      },
      resolveDecision: async ({ temporal }) => {
        calls.push(`decision:${temporal.result.clock_after.whole_minutes}`);
        return { boundary: { scheduled_at: at(25) }, plan: { op: 'wait' } };
      },
      executeActorStep: async ({ temporal, decision }) => {
        calls.push(`actor:${decision.boundary.scheduled_at.whole_minutes}`);
        return { started_at: at(25), working_projection: {
          ...temporal.projection, active_operation: decision.plan.op
        } };
      },
      continueAdvance: async ({ actor_step: actorStep }) => {
        calls.push(`continue:${actorStep.working_projection.active_operation}`);
        return { result: { clock_before: at(25), clock_after: at(30) } };
      }
    });
    assert.deepEqual(calls,
      ['advance:25', 'decision:25', 'actor:25', 'continue:wait']);
    assert.equal(flow.actor_step.working_projection.active_operation, 'wait');
    assert.equal(Object.isFrozen(flow), true);
  });

test('same-time follow-up reaction reaches fixed point with distinct batch ids',
  async () => {
    const first = buildNpcDecisionSignal(signalDescriptor('cause-1'));
    const second = buildNpcDecisionSignal(signalDescriptor('cause-2', [{
      entity_kind: 'npc_decision_signal',
      entity_id: first.signal_id
    }]));
    const factualState = {
      party_id: 'party-1',
      party_state: { state_version: 3 },
      npc_decision_signals: [],
      consumed_npc_decision_signal_ids: [],
      npc_semantic_decision_inputs: []
    };
    let descriptors = [signalDescriptor('cause-1')];
    const batchRefs = [];
    const calls = [];

    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: { npc_decision_signal_descriptors: descriptors }
      }),
      decisionSignalState: {
        factual_state: factualState,
        npc_ref: npcRef,
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async ({ signal_batch: signalBatch }) => {
        batchRefs.push(structuredClone(signalBatch.same_time_batch_ref));
        calls.push(`decision:${signalBatch.same_time_batch_ordinal}`);
        return {
          boundary: signalBatch.boundary,
          autonomous: {
            consumed_signal_ids: signalBatch.ordered_signals.map(
              ({ signal_id: id }) => id
            )
          }
        };
      },
      executeActorStep: async ({ decision }) => {
        calls.push(`actor:${decision.boundary.boundary_id}`);
        if (descriptors.length === 1) {
          descriptors = [
            signalDescriptor('cause-1'),
            signalDescriptor('cause-2', [{
              entity_kind: 'npc_decision_signal',
              entity_id: first.signal_id
            }])
          ];
        }
        return {
          started_at: at(25),
          working_projection: {
            npc_decision_signal_descriptors: descriptors,
            last_boundary: decision.boundary.boundary_id
          }
        };
      },
      continueAdvance: async ({ actor_step: actorStep }) => {
        calls.push(`continue:${actorStep.working_projection.last_boundary}`);
        return { result: { clock_before: at(25), clock_after: at(30) } };
      }
    });

    assert.equal(flow.resolved_batches.length, 2);
    assert.notEqual(
      flow.resolved_batches[0].same_time_batch_ref.entity_id,
      flow.resolved_batches[1].same_time_batch_ref.entity_id
    );
    assert.match(batchRefs[0].entity_id, /:1$/u);
    assert.match(batchRefs[1].entity_id, /:2$/u);
    assert.deepEqual(calls, [
      'decision:1',
      `actor:${flow.resolved_batches[0].decision.boundary.boundary_id}`,
      'decision:2',
      `actor:${flow.resolved_batches[1].decision.boundary.boundary_id}`,
      `continue:${flow.resolved_batches[1].decision.boundary.boundary_id}`
    ]);
    assert.equal(second.signal_id.length > 0, true);
  });

test('multi-NPC same-time batch orders by npc_ref then boundary_id sequentially',
  async () => {
    const npcA = { entity_kind: 'npc', entity_id: 'npc-b' };
    const npcB = { entity_kind: 'npc', entity_id: 'npc-a' };
    const descriptorFor = (npc, entityId) => ({
      occurred_at: at(25),
      category: 'objective',
      significance: 'material',
      source_event_ref: {
        entity_kind: 'npc_activity_factual_transition',
        entity_id: entityId
      },
      subject_ref: npc,
      scope_refs: [],
      perception_required: false,
      source_perception_ref: null,
      causal_parent_refs: [],
      perceived_change_summary: `change:${entityId}`
    });
    const descriptors = [
      descriptorFor(npcA, 'cause-b'),
      descriptorFor(npcB, 'cause-a')
    ];
    const seenNpcRefs = [];
    const seenProjections = [];

    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: {
          npc_decision_signal_descriptors: descriptors,
          marker: 'initial'
        }
      }),
      decisionSignalState: {
        factual_state: {
          party_id: 'party-multi',
          party_state: { state_version: 2 },
          npc_decision_signals: [],
          consumed_npc_decision_signal_ids: [],
          npc_semantic_decision_inputs: []
        },
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async ({ signal_batch: signalBatch }) => ({
        boundary: signalBatch.boundary,
        autonomous: {
          consumed_signal_ids: []
        }
      }),
      executeActorStep: async ({ temporal, decision }) => {
        seenNpcRefs.push(decision.boundary.npc_ref.entity_id);
        seenProjections.push(temporal.projection.marker);
        return {
          started_at: at(25),
          working_projection: {
            npc_decision_signal_descriptors: descriptors,
            marker: `after:${decision.boundary.npc_ref.entity_id}`,
            last_boundary: decision.boundary.boundary_id
          }
        };
      },
      continueAdvance: async ({ actor_step: actorStep }) => ({
        result: {
          clock_before: at(25),
          clock_after: at(30),
          last: actorStep.working_projection.last_boundary
        }
      })
    });

    assert.deepEqual(seenNpcRefs, ['npc-a', 'npc-b']);
    assert.deepEqual(seenProjections, ['initial', 'after:npc-a']);
    assert.equal(flow.resolved_batches.length, 2);
    assert.equal(
      flow.resolved_batches[0].decision.boundary.npc_ref.entity_id,
      'npc-a'
    );
    assert.equal(
      flow.resolved_batches[1].decision.boundary.npc_ref.entity_id,
      'npc-b'
    );
    assert.equal(
      flow.resolved_batches[0].decision.boundary.boundary_id
        < flow.resolved_batches[1].decision.boundary.boundary_id
        || flow.resolved_batches[0].decision.boundary.npc_ref.entity_id
          < flow.resolved_batches[1].decision.boundary.npc_ref.entity_id,
      true
    );
  });

test('multi-NPC rejection keeps the timestamp paused after siblings resolve',
  async () => {
    const npcFirst = { entity_kind: 'npc', entity_id: 'npc-a' };
    const npcSecond = { entity_kind: 'npc', entity_id: 'npc-b' };
    const descriptorFor = (npc, entityId) => ({
      occurred_at: at(25),
      category: 'objective',
      significance: 'material',
      source_event_ref: {
        entity_kind: 'npc_activity_factual_transition',
        entity_id: entityId
      },
      subject_ref: npc,
      scope_refs: [],
      perception_required: false,
      source_perception_ref: null,
      causal_parent_refs: [],
      perceived_change_summary: `change:${entityId}`
    });
    const descriptors = [
      descriptorFor(npcFirst, 'cause-a'),
      descriptorFor(npcSecond, 'cause-b')
    ];
    const domainResult = {
      pass: false,
      errors: [{
        code: 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE',
        category: 'applicability',
        retryable: false
      }]
    };
    const calls = [];
    let continuationCalls = 0;

    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: {
          npc_decision_signal_descriptors: descriptors,
          marker: 'initial'
        }
      }),
      decisionSignalState: {
        factual_state: {
          party_id: 'party-reject-siblings',
          party_state: { state_version: 1 },
          npc_decision_signals: [],
          consumed_npc_decision_signal_ids: [],
          npc_semantic_decision_inputs: []
        },
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async ({ signal_batch: signalBatch }) => {
        calls.push(`decision:${signalBatch.boundary.npc_ref.entity_id}`);
        return {
          boundary: signalBatch.boundary,
          autonomous: { consumed_signal_ids: [] }
        };
      },
      executeActorStep: async ({ temporal, decision }) => {
        const npcId = decision.boundary.npc_ref.entity_id;
        calls.push(`actor:${npcId}`);
        if (npcId === 'npc-a') {
          return {
            working_projection: {
              npc_decision_signal_descriptors: descriptors,
              marker: 'after:npc-a-reject'
            },
            domain_result: domainResult
          };
        }
        return {
          started_at: at(25),
          working_projection: {
            npc_decision_signal_descriptors: descriptors,
            marker: `after:${npcId}`,
            last_boundary: decision.boundary.boundary_id,
            saw_prior: temporal.projection.marker
          }
        };
      },
      continueAdvance: async ({ actor_step: actorStep }) => {
        continuationCalls += 1;
        calls.push(`continue:${actorStep.working_projection.last_boundary}`);
        return { result: { clock_before: at(25), clock_after: at(30) } };
      }
    });

    assert.deepEqual(calls, [
      'decision:npc-a',
      'actor:npc-a',
      'decision:npc-b',
      'actor:npc-b'
    ]);
    assert.equal(continuationCalls, 0);
    assert.equal(flow.continuation, null);
    assert.equal(
      flow.unresolved_domain_rejection.decision.boundary.npc_ref.entity_id,
      'npc-a'
    );
    assert.equal(
      flow.unresolved_domain_rejection.actor_step.domain_result.pass,
      false
    );
    assert.equal(
      flow.unresolved_domain_rejection.unconsumed_signal_ids.length,
      1
    );
    assert.equal(flow.resolved_batches.length, 2);
    assert.equal(
      flow.resolved_batches[0].actor_step.domain_result.pass,
      false
    );
    assert.deepEqual(
      flow.resolved_batches[0].decision.autonomous.consumed_signal_ids,
      []
    );
    assert.equal(
      flow.resolved_batches[0].decision.boundary.npc_ref.entity_id,
      'npc-a'
    );
    assert.equal(
      flow.resolved_batches[1].decision.boundary.npc_ref.entity_id,
      'npc-b'
    );
    assert.equal(
      flow.resolved_batches[1].actor_step.working_projection.saw_prior,
      'after:npc-a-reject'
    );
  });

test('sole NPC decisionSignalState domain rejection blocks temporal continuation',
  async () => {
    const descriptor = signalDescriptor('cause-sole-reject');
    const domainResult = {
      pass: false,
      errors: [{
        code: 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE',
        category: 'applicability',
        retryable: false
      }]
    };
    let continuationCalls = 0;

    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: { npc_decision_signal_descriptors: [descriptor] }
      }),
      decisionSignalState: {
        factual_state: {
          party_id: 'party-sole-reject',
          party_state: { state_version: 1 },
          npc_decision_signals: [],
          consumed_npc_decision_signal_ids: [],
          npc_semantic_decision_inputs: []
        },
        npc_ref: npcRef,
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async ({ signal_batch: signalBatch }) => ({
        boundary: signalBatch.boundary,
        autonomous: { consumed_signal_ids: [] }
      }),
      executeActorStep: async () => ({
        working_projection: {
          npc_decision_signal_descriptors: [descriptor],
          marker: 'rejected'
        },
        domain_result: domainResult
      }),
      continueAdvance: async () => {
        continuationCalls += 1;
        throw new Error('domain rejection must not continue time');
      }
    });

    assert.equal(continuationCalls, 0);
    assert.equal(flow.continuation, null);
    assert.equal(flow.resolved_batches.length, 1);
    assert.equal(flow.resolved_batches[0].actor_step.domain_result.pass, false);
    assert.deepEqual(flow.actor_step.domain_result, domainResult);
  });

test('multi-NPC same-time batch blocks continuation when all NPCs domain-reject',
  async () => {
    const npcFirst = { entity_kind: 'npc', entity_id: 'npc-a' };
    const npcSecond = { entity_kind: 'npc', entity_id: 'npc-b' };
    const descriptorFor = (npc, entityId) => ({
      occurred_at: at(25),
      category: 'objective',
      significance: 'material',
      source_event_ref: {
        entity_kind: 'npc_activity_factual_transition',
        entity_id: entityId
      },
      subject_ref: npc,
      scope_refs: [],
      perception_required: false,
      source_perception_ref: null,
      causal_parent_refs: [],
      perceived_change_summary: `change:${entityId}`
    });
    const descriptors = [
      descriptorFor(npcFirst, 'cause-a'),
      descriptorFor(npcSecond, 'cause-b')
    ];
    const domainResult = {
      pass: false,
      errors: [{
        code: 'NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE',
        category: 'applicability',
        retryable: false
      }]
    };
    const calls = [];
    let continuationCalls = 0;

    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => ({
        result: { temporal_status: 'paused', clock_after: at(25) },
        projection: {
          npc_decision_signal_descriptors: descriptors,
          marker: 'initial'
        }
      }),
      decisionSignalState: {
        factual_state: {
          party_id: 'party-all-reject',
          party_state: { state_version: 1 },
          npc_decision_signals: [],
          consumed_npc_decision_signal_ids: [],
          npc_semantic_decision_inputs: []
        },
        active_mode: 'autonomous',
        current_intent: null,
        decision_capability: true
      },
      resolveDecision: async ({ signal_batch: signalBatch }) => {
        calls.push(`decision:${signalBatch.boundary.npc_ref.entity_id}`);
        return {
          boundary: signalBatch.boundary,
          autonomous: { consumed_signal_ids: [] }
        };
      },
      executeActorStep: async ({ decision }) => {
        const npcId = decision.boundary.npc_ref.entity_id;
        calls.push(`actor:${npcId}`);
        return {
          working_projection: {
            npc_decision_signal_descriptors: descriptors,
            marker: `after:${npcId}-reject`
          },
          domain_result: domainResult
        };
      },
      continueAdvance: async () => {
        continuationCalls += 1;
        throw new Error('all-reject batch must not continue time');
      }
    });

    assert.deepEqual(calls, [
      'decision:npc-a',
      'actor:npc-a',
      'decision:npc-b',
      'actor:npc-b'
    ]);
    assert.equal(continuationCalls, 0);
    assert.equal(flow.continuation, null);
    assert.equal(flow.resolved_batches.length, 2);
    assert.equal(flow.resolved_batches[0].actor_step.domain_result.pass, false);
    assert.equal(flow.resolved_batches[1].actor_step.domain_result.pass, false);
  });
