import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCombatDecisionSignals,
  buildCombatInitializationDecisionContexts,
  createCombatSession
} from '@rus/turn';
import { projectCombatDecisionState } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-decision-state.js';
import { appendNpcDecisionTraceWrites } from
  '../src/infrastructure/postgres/npc-semantic-conversation-decision-writes.js';
import { assertDecisions } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read-rows.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = { whole_minutes: '50', subminute_numerator: '0',
  subminute_denominator: '1' };

test('combat decision trace survives the normalized restart read', () => {
  const npc = ref('npc', 'zhdanko');
  const player = ref('player_character', 'mikula');
  const session = createCombatSession({ combat_id: 'combat-1', started_at: at,
    scope_ref: ref('location', 'storehouse'),
    participant_refs: [player, npc] });
  const [context] = buildCombatInitializationDecisionContexts({ session,
    same_time_batch_ref: ref('temporal_batch', 'combat-batch-1'),
    party_id: 'party-1', root_turn_id: 'turn-1', decided_at: at,
    signal_descriptors: [{ occurred_at: at, category: 'objective',
      significance: 'material', source_event_ref: ref('combat_event', 'event-1'),
      subject_ref: npc, perceived_change_summary: 'Жданко потерял оружие.' }],
    npc_contexts: [{ npc_ref: npc, state_version: '4', current_intent: null,
      npc_subjective_state: {}, perceived_combat_state: {}, relevant_memory: [],
      operation_contract: operationContract(player) }] });
  const plan = { schema: 'npc_combat_intent_plan_v1',
    request_id: context.request.request_id,
    boundary_id: context.request.boundary_id,
    state_version: context.request.state_version, combat_id: 'combat-1',
    npc_ref: npc, decision: { intent_summary: 'Stop the immediate threat.',
      grounded_goal: 'Keep the opponent from advancing.',
      adaptation: 'literal' }, operation: { op: 'set_combat_intent',
      intent_kind: 'surrender', target_refs: [], protected_refs: [],
      scope_ref: null, destination_ref: null, force_limit: 'avoid_harm',
      risk_posture: 'ordinary' }, combat_statement: null,
    reason: 'Сопротивление больше невозможно.' };
  const decision = { request: context.request, boundary: context.boundary,
    orderedSignals: context.ordered_signals,
    proposal: { status: 'planned', plan } };
  const payload = projectCombatDecisionState({ state: {},
    decisionRecords: [decision], changeSetId: 'change-1',
    rootTurnId: 'turn-1', workingRevision: 2 });
  const appends = [];
  appendNpcDecisionTraceWrites({ appends, decisionRecords: [decision],
    partyId: 'party-1', changeSetId: 'change-1', rootTurnId: 'turn-1',
    workingRevision: 2 });
  const read = assertDecisions(payload, [appends[0].record]);
  assert.equal(read.traces.length, 1);
  assert.equal(read.traces[0].plan.operation.intent_kind, 'surrender');
  assert.equal(payload.consumed_npc_decision_signal_ids.length, 1);
  assert.throws(() => assertDecisions({ ...payload,
    npc_semantic_decision_refs: [] }, [appends[0].record]));
});

test('terminal combat signal survives restart without a decision trace', () => {
  const npc = ref('npc', 'zhdanko');
  const [signal] = buildCombatDecisionSignals([{
    occurred_at: at, category: 'self', significance: 'critical',
    source_event_ref: ref('body_threshold_crossing', 'zhdanko:health-0'),
    subject_ref: npc, perceived_change_summary:
      'Жданко больше не способен продолжать сопротивление.'
  }]);
  const payload = projectCombatDecisionState({ state: {},
    signalRecords: [signal], sameTimeBatchKey: 'combat-batch:combat-1:1',
    decisionRecords: [], changeSetId: 'change-1', rootTurnId: 'turn-1',
    workingRevision: 2 });
  const read = assertDecisions(payload, []);
  assert.deepEqual(read.traces, []);
  assert.deepEqual(payload.consumed_npc_decision_signal_ids,
    [signal.signal_id]);
  assert.deepEqual(payload.npc_decision_terminal_outcomes, [{
    npc_ref: npc, outcome: 'npc_unavailable',
    same_time_batch_ref: ref('temporal_batch', 'combat-batch:combat-1:1'),
    signal_ids_to_consume: [signal.signal_id]
  }]);
  assert.throws(() => assertDecisions({ ...payload,
    npc_decision_terminal_outcomes: [] }, []));
});

function operationContract(player) {
  return { allowed_intent_kinds: ['surrender'], engageable_actor_refs: [player],
    controllable_actor_refs: [], protectable_refs: [], holdable_scope_refs: [],
    reachable_destination_refs: [], break_contact_destination_refs: [],
    allowed_force_limits: ['avoid_harm'], allowed_risk_postures: ['ordinary'],
    surrender_available: true, cease_hostility_available: false,
    combat_statement_available: false };
}
