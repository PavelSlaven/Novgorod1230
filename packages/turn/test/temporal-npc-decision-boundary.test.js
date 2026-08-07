import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNpcDecisionSignal
} from '@rus/npc-runtime';
import { advanceTemporalNpcDecisionBoundary } from
  '../src/temporal-advance.js';

const at = (wholeMinutes) => ({
  whole_minutes: String(wholeMinutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});

const npcRef = { entity_kind: 'npc', entity_id: 'npc-a' };

function signalDescriptor(entityId, parents = []) {
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
    causal_parent_refs: parents
  };
}

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
