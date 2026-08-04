
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildConversationSession,
  buildConversationStatementEvent,
  buildNpcConversationResponseRequest,
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import {
  assertLowerDvinaTraceSemanticConversationRows
} from '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import {
  assertPhase4NormalizedRows
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-read.js';

const PARTY_ID = 'party-semantic-persistence';
const CHANGE_SET_ID = 'change:' + PARTY_ID + ':semantic';
const ROOT_TURN_ID = 'turn:' + PARTY_ID + ':semantic';
const AT = Object.freeze({
  whole_minutes: '120',
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });


export function promiseFixture(changeSetId) {
  return {
    obligation_id: 'obligation-ratsha-protection',
    policy_ref: { id: 'ratsha-protection-policy' },
    policy_version: 1,
    promisor_actor_id: 'player',
    beneficiary_actor_id: 'ratsha',
    witness_actor_ids: ['eremey', 'fisher'],
    scope_snapshot: { obligation: 'protect Ratsha', conditions: [] },
    current_state: 'not_offered',
    current_state_fact: 'promise_current_not_offered',
    state_version: 1,
    created_change_set_id: changeSetId,
    last_change_set_id: changeSetId
  };
}

export function obligationRow(promise) {
  return {
    obligation_id: promise.obligation_id,
    policy_ref: promise.policy_ref,
    policy_version: promise.policy_version,
    promisor_ref: ref('player_character', promise.promisor_actor_id),
    beneficiary_ref: ref('npc', promise.beneficiary_actor_id),
    witness_refs: promise.witness_actor_ids.map((id) => ref('npc', id)),
    scope_snapshot: promise.scope_snapshot,
    current_state: promise.current_state,
    current_state_fact: promise.current_state_fact,
    state_version: promise.state_version,
    created_change_set_id: promise.created_change_set_id,
    last_change_set_id: promise.last_change_set_id
  };
}

export function ratshaArrival({ partyId, turn }) {
  const perceptionId =
    'perception:' + partyId + ':trace-phase4:' + turn + ':ratsha-group';
  return {
    perception_id: perceptionId,
    event_ref: ref(
      'temporal_event',
      'event:' + partyId + ':trace-phase4:' + turn + ':arrival'
    ),
    observer_ref: ref('npc', 'ratsha'),
    subject_ref: ref('party', partyId),
    source_event_ref: ref(
      'temporal_event',
      'event:' + partyId + ':trace-phase4:' + turn + ':arrival'
    ),
    observation_ref: 'ratsha-group-observation',
    result_kind: 'recognized',
    occurred_at: AT,
    perceived_actor_refs: [ref('actor', 'player')],
    signal_ref: ref(
      'npc_decision_signal',
      'decision-signal:temporal_event:event:' + partyId
        + ':trace-phase4:' + turn + ':arrival:ratsha:others'
    )
  };
}

export function knifeObserver({ partyId, turn, observerId }) {
  return {
    perception_id:
      'perception:' + partyId + ':trace-phase4:' + turn
        + ':knife-loss:' + observerId,
    observer_ref: ref('npc', observerId),
    subject_ref: ref('npc', 'ratsha'),
    source_event_ref: ref(
      'item_property_transition',
      'ratsha-knife-surrender-transition'
    ),
    causal_parent_refs: [ref(
      'committed_fact',
      'ratsha_surrender_without_further_harm_committed'
    )],
    observation_ref: 'ratsha-knife-observer-mapping',
    result_kind: 'recognized',
    occurred_at: AT
  };
}

export function phase4PerceptionRow({
  snapshot,
  partyId,
  turn,
  changeSetId,
  executionId
}) {
  const legacy = snapshot.perception_id.endsWith(':arrival');
  const knife = snapshot.perception_id.includes(':knife-loss:');
  const eventId = legacy || snapshot.perception_id.endsWith(':ratsha-group')
    ? 'event:' + partyId + ':trace-phase4:' + turn + ':arrival'
    : 'event:' + partyId + ':trace-phase4:' + turn + ':knife-loss';
  const signalRef = knife
    ? ref(
        'npc_decision_signal',
        'decision-signal:' + snapshot.source_event_ref.entity_kind + ':'
          + snapshot.source_event_ref.entity_id + ':'
          + snapshot.observer_ref.entity_id + ':others'
      )
    : snapshot.signal_ref;
  const exactPayload = legacy
    ? null
    : knife
      ? {
          schema:
            'rus.lower_dvina_trace_phase_4_knife_loss_perception.v1',
          perception_id: snapshot.perception_id,
          event_ref: ref('temporal_event', eventId),
          source_event_ref: snapshot.source_event_ref,
          causal_parent_refs: snapshot.causal_parent_refs,
          observer_ref: snapshot.observer_ref,
          subject_ref: snapshot.subject_ref,
          observation_ref: snapshot.observation_ref,
          result_kind: snapshot.result_kind,
          occurred_at: snapshot.occurred_at,
          signal_ref: signalRef
        }
      : snapshot;
  const observer = legacy
    ? ref('player_character', 'player')
    : snapshot.observer_ref;
  return {
    perception_id: snapshot.perception_id,
    event_id: eventId,
    perceiver_kind: observer.entity_kind,
    perceiver_id: observer.entity_id,
    result_kind: 'recognized',
    perceived_at_whole_minutes: AT.whole_minutes,
    perceived_at_subminute_numerator: AT.subminute_numerator,
    perceived_at_subminute_denominator: AT.subminute_denominator,
    recognition_policy_ref: ref('recognition_policy', 'recognized'),
    visibility_policy_ref: ref('visibility_policy', 'visible'),
    knowledge_update_refs: legacy
      ? [ref('knowledge_fact', 'onisim_found_alive')]
      : [],
    signal_refs: legacy ? [] : [signalRef],
    canonical_digest: legacy
      ? 'legacy-arrival-perception-digest'
      : canonicalDigest(exactPayload),
    change_set_id: changeSetId,
    idempotency_record_id: 'idempotency:' + snapshot.perception_id,
    rule_ref: legacy
      ? { route_execution_id: executionId }
      : snapshot.source_event_ref,
    policy_ref: ref('visibility_policy', 'visible'),
    event_kind: knife
      ? 'item_property_transition_observed'
      : 'committed_scene_observation',
    status: 'resolved',
    event_change_set_id: changeSetId,
    terminal_change_set_id: changeSetId,
    event_version: '2'
  };
}
