import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { actorRef, expected, row } from './plan-shared.js';
import {
  appendCheck, endpoint
} from './plan-traversal-evidence.js';
import {
  buildLocalTraversalWriteSet
} from '../local-traversal-write-set.js';

export function traversalWrites({
  previousState,
  state,
  changeSet,
  turnNumber,
  command,
  result,
  versions
}) {
  if (command.verb !== 'move') return null;
  const partyId = state.party_id;
  const traversal = result.summary.traversal;
  const suffix = hash(command.canonical_digest).slice(0, 24);
  const planId = `route-plan:${partyId}:${suffix}`;
  const executionId = `route-execution:${partyId}:${suffix}`;
  const travelStateId = `travel-state:${partyId}:${suffix}`;
  const intervalId = `traversal-interval:${partyId}:${suffix}`;
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const fromHigh =
    command.destination_ref.entity_id === 'landing_edge';
  const sourceEndpoint = endpoint(partyId, fromHigh ? 'high' : 'landing');
  const targetEndpoint = endpoint(partyId, fromHigh ? 'landing' : 'high');
  const owner = actorRef(state);
  const staticContract = {
    snapshot_kind: 'timed_traversal',
    route_binding_ref: traversal.route_binding_ref,
    connection_profile_ref: ref(
      'canonical_g5_connection_profile',
      'cprofv3__site_connection__local_passage',
      2
    ),
    cost_kind: 'action',
    action_units: 1,
    base_minutes: null,
    risk_profile_ref: traversal.risk_profile_ref
  };
  const actualProgress = traversal.success ? 1_000_000 : 0;
  const actualElapsed = traversal.elapsed_minutes;
  const worldPin =
    state.exact_pins.pins.find(({ kind }) => kind === 'release');
  const dynamicSnapshot = {
    schema: 'local_traversal_dynamic_snapshot.v1',
    risk_profile_ref: traversal.risk_profile_ref,
    roll: traversal.roll,
    exact_dependency_pins: state.exact_pins
  };
  const set = buildLocalTraversalWriteSet({
    partyId,
    ids: { planId, executionId, travelStateId, intervalId },
    owner,
    sourceEndpoint,
    targetEndpoint,
    route: {
      route_binding_ref: traversal.route_binding_ref,
      duration_minutes: actualElapsed,
      movement_method: 'walk',
      risk_profile_ref: traversal.risk_profile_ref,
      hazard_resolution: traversal.roll,
      outcome_composition_policy_version:
        traversal.risk_profile_ref?.entity_id
          ?? 'risk.local_cross_link@1'
    },
    dependencyPins: state.exact_pins,
    worldPin,
    planningRequestId: command.request_id,
    planningStateVersion: command.base_state_version,
    turnNumber,
    changeSetId: changeSet,
    idempotencyRecordId: idemId,
    dynamicSnapshot,
    success: traversal.success,
    resultCode: 'local_passage_completed',
    failureResultCode: 'landing_edge_slip',
    staticContract,
    pathQueryDigest:
      hash(JSON.stringify({ sourceEndpoint, targetEndpoint })),
    canonicalSerializationDigest: hash(JSON.stringify({
      party_id: partyId,
      command_digest: command.canonical_digest,
      source_endpoint: sourceEndpoint,
      target_endpoint: targetEndpoint,
      static_contract: staticContract
    })),
    outcomeCompositionTraceDigest: hash(JSON.stringify({
      interval_id: intervalId,
      result_kind: traversal.success
        ? 'segment_completed'
        : 'blocked_before_progress',
      actual_progress: actualProgress,
      actual_elapsed: actualElapsed,
      dynamic_snapshot: dynamicSnapshot
    })),
    plannedTimeMinutes: 0,
    actualElapsedMinutes: actualElapsed
  });
  if (traversal.roll) appendCheck(set, {
    partyId,
    intervalId,
    traversal,
    changeSet
  });
  if (traversal.success && !state.boat?.boarded) {
    set.updates.push(row(
      'party_journey_locations',
      `location:${partyId}:player`,
      {
        id: `location:${partyId}:player`,
        party_id: partyId,
        owner_kind: 'actor',
        owner_id: state.player.id,
        location_kind: 'scene',
        scene_position_id:
          `position:${partyId}:${fromHigh ? 'landing' : 'high'}`,
        updated_change_set_id: changeSet
      }
    ));
    set.expected.push(expected(
      'party_journey_locations',
      `location:${partyId}:player`,
      versions.actorLocation
    ));
  }
  if (!traversal.success
      && !previousState.player.conditions.includes('wet')) {
    set.inserts.push(row(
      'party_actor_active_conditions',
      `player_character:${state.player.id}:wet`,
      {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.player.id,
        condition_id: 'wet',
        condition_profile_ref: ref('condition_profile', 'wet', 1),
        status: 'active',
        state_version: 1,
        created_change_set_id: changeSet
      }
    ));
  }
  return set;
}
