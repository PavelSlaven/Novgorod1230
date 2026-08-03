
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


import {
  knifeObserver,
  obligationRow,
  phase4PerceptionRow,
  promiseFixture,
  ratshaArrival
} from './lower-dvina-trace-semantic-persistence-phase4-rows.js';
import { phase4Pool } from './lower-dvina-trace-semantic-persistence-pool.js';

export function phase4ReadFixture({ revision, semantic }) {
  const partyId = 'party-phase4-read-' + revision;
  const turn = 1;
  const changeSetId =
    'change:' + partyId + ':trace-phase4:' + turn;
  const executionId =
    'route-execution:' + partyId + ':trace-phase4:' + turn;
  const routeRef = 'trace-route-to-shed';
  const reverseRouteRef = 'trace-route-to-camp';
  const movement = {
    route_ref: routeRef,
    reverse_route_ref: reverseRouteRef,
    traversal: {
      ids: {
        plan_id: 'route-plan:' + partyId + ':trace-phase4:' + turn,
        execution_id: executionId,
        travel_state_id:
          'travel-state:' + partyId + ':trace-phase4:' + turn,
        interval_id:
          'route-interval:' + partyId + ':trace-phase4:' + turn
      },
      planning_state_version: 1,
      interval_result: {
        actual_time_numerator: '12',
        actual_time_denominator: '1'
      }
    }
  };
  const arrivalId =
    'perception:' + partyId + ':trace-phase4:' + turn + ':arrival';
  const perceptions = [{
    perception_id: arrivalId,
    observation_ref: 'arrival-observation',
    fact_id: 'onisim_found_alive',
    causal_route_execution_id: executionId
  }];
  if (semantic) {
    perceptions.push(
      ratshaArrival({ partyId, turn }),
      knifeObserver({ partyId, turn, observerId: 'eremey' }),
      knifeObserver({ partyId, turn, observerId: 'fisher' })
    );
  }
  perceptions.sort((left, right) =>
    left.perception_id.localeCompare(right.perception_id));
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Сушильня',
    perceived_changes: [],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const packageId =
    'visible:' + partyId + ':trace-phase4:' + turn;
  const promise = promiseFixture(changeSetId);
  const payload = {
    party_id: partyId,
    actor_id: 'player',
    materialization_trace: {
      seed_context: { scenario_definition_revision: revision }
    },
    party_state: { state_version: 2 },
    phase4_history: [{
      turn_number: turn,
      change_set_id: changeSetId,
      request_id: 'request-phase4',
      option_id: 'move-to-shed',
      phase4_kind: 'movement',
      consequence: { phase4_kind: 'movement', movement }
    }],
    perceptions,
    promise_instances: [promise],
    ratsha_surrendered: false,
    items: [],
    npcs: [],
    last_turn: {
      change_set_id: changeSetId,
      visible_package: {
        package_id: packageId,
        package_digest: computeSpatialV3CanonicalDigest(visiblePayload)
      }
    }
  };
  const perceptionRows = perceptions.map((snapshot) =>
    phase4PerceptionRow({
      snapshot,
      partyId,
      turn,
      changeSetId,
      executionId
    }));
  const witnessRows = perceptionRows.map((row) => ({
    perception_id: row.perception_id,
    witness_kind: row.perceiver_kind,
    witness_id: row.perceiver_id
  }));
  const replayRows = perceptionRows.map((row) => {
    const replay = {
      perception_id: row.perception_id,
      canonical_input_digest: 'input:' + row.perception_id,
      perception_digest: row.canonical_digest,
      expected_state_versions_digest: 'versions:' + row.perception_id,
      dependency_pins_digest: 'dependencies:' + row.perception_id,
      policy_versions_digest: 'policies:' + row.perception_id,
      idempotency_key: 'idempotency:' + row.perception_id,
      change_set_id: changeSetId
    };
    return {
      ...replay,
      party_id: partyId,
      canonical_digest: canonicalDigest(replay)
    };
  });
  const queryRows = {
    traversal: [{
      plan_id: movement.traversal.ids.plan_id,
      execution_id: executionId,
      travel_state_id: movement.traversal.ids.travel_state_id,
      interval_id: movement.traversal.ids.interval_id,
      option_id: routeRef,
      planning_state_version: '1',
      status: 'completed',
      travel_status: 'closed',
      closed_result: 'completed',
      result_kind: 'segment_completed',
      actual_time_numerator: '12',
      actual_time_denominator: '1'
    }],
    obligation: [obligationRow(promise)],
    visible: [{
      package_id: packageId,
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload,
      presentation_status: 'pending',
      committed_state_version: '2',
      change_set_id: changeSetId
    }],
    perceptions: perceptionRows,
    witnesses: witnessRows,
    replay: replayRows,
    knowledge: [{
      fact_id: reverseRouteRef,
      knowledge_state: 'known_from_committed_traversal',
      evidence: [executionId]
    }]
  };
  return {
    payload,
    replayRows,
    pool: phase4Pool(queryRows),
    head: {
      screen: {
        screen_status: 'ready',
        current_projection_anchor: { package_id: packageId }
      }
    }
  };
}
