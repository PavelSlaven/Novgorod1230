import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { normalizeNpcBoundaryBatch } from
  '../src/conversation-exchange-npc-batch.js';
import { resumePendingNpcExecution } from
  '../src/conversation-exchange-resume.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('one NPC and same-time batch cannot enter separate decision modes', () => {
  const common = {
    scheduled_at: at,
    npc_ref: ref('npc', 'guard'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '4'
  };
  const boundaries = ['conversation', 'autonomous'].map((decision_mode) =>
    buildNpcDecisionBoundary({ ...common, decision_mode }));

  assert.throws(() => normalizeNpcBoundaryBatch({
    boundaries,
    direct_addressee_refs: [ref('npc', 'guard')]
  }, new Set(), new Set()), {
    code: 'TURN_CONVERSATION_NPC_DECISION_DUPLICATE'
  });
});

test('resume remembers the pending NPC and batch across legacy boundary ids',
  async () => {
    const npcRef = ref('npc', 'guard');
    const batchRef = ref('temporal_batch', 'batch-1');
    const boundary = buildNpcDecisionBoundary({
      decision_mode: 'conversation',
      scheduled_at: at,
      npc_ref: npcRef,
      same_time_batch_ref: batchRef,
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-2')],
      state_version: '4'
    });
    const contribution = {
      schema: 'conversation_non_statement_contribution_v1',
      contribution_id: 'contribution-1'
    };
    const applied = {
      working_state: {},
      contribution_event: contribution,
      player_response_boundary: false,
      session_status: 'active',
      handoff: null
    };

    await assert.rejects(() => resumePendingNpcExecution({
      initialWorkingState: {},
      maxContributionsPerExchange: 8,
      pendingNpcExecution: {
        plan: { speaker_ref: npcRef },
        boundary_id: 'npc-decision:conversation:batch-1:guard',
        contribution_index: 2,
        remaining_minutes: 1,
        remaining_exchange_minutes: 2,
        remaining_responder_refs: [],
        same_time_batch_ref: batchRef,
        check_result: null,
        social_delivery_result: null,
        source_decision_trace_ref: ref('npc_decision_trace', 'trace-1')
      }
    }, {
      applyPendingNpcContribution: async () => applied,
      buildNpcResponseBoundaries: async () => ({
        boundaries: [boundary], direct_addressee_refs: [npcRef]
      })
    }, {
      callPort: (port, argument) => port(argument),
      fail(code, message) {
        const error = new Error(message);
        error.code = code;
        throw error;
      },
      immutableClone: structuredClone,
      normalizeApplyResult: (value) => value,
      progressAndProject: async ({ applied: value }) => ({
        applied: value,
        elapsedMinutes: 1,
        completed: true,
        interrupted: false,
        temporalBoundaryRefs: []
      }),
      stopAfterApply: () => null
    }), { code: 'TURN_CONVERSATION_NPC_DECISION_DUPLICATE' });
  });
