import { serverError } from '../errors.js';
import {
  buildFirstPlayableTurnPlan
} from '../infrastructure/postgres/first-playable/turn.js';
import {
  recognizeFirstPlayableSemanticCommand
} from './first-playable-semantic-recognizer.js';
import { applyCommand } from './first-playable/command.js';
import {
  resolveRuntimeActivityProfile,
  turnScreen,
  visibleEntityRefs
} from './first-playable/projection.js';
import { hash, json } from './first-playable/shared.js';

export async function submitFirstPlayableTurn({
  partyId,
  input = {},
  release,
  repository,
  committer,
  idFactory
}) {
  const {
    statePayload,
    stateVersion,
    turnNumber: previousTurnNumber,
    versions
  } = await repository.loadTurnSnapshot(partyId);
  const requestId = String(input.request_id ?? `turn:${idFactory()}`);
  const idempotencyKey = String(input.idempotency_key ?? requestId);
  const sourceDigest = hash(json({
    raw_text: input.raw_text ?? null,
    selected_action_option_id: input.selected_action_option_id ?? null
  }));
  const previous = statePayload.idempotency?.[idempotencyKey];
  if (previous) {
    if (previous.source_digest !== sourceDigest) {
      throw serverError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key has different input.',
        { status: 409 }
      );
    }
    return previous.result;
  }
  const recognized = recognizeFirstPlayableSemanticCommand({
    partyId,
    actorId: statePayload.player.id,
    rawText: input.raw_text,
    selectedActionOptionId: input.selected_action_option_id,
    visibleEntityRefs: visibleEntityRefs(statePayload),
    currentLocation: statePayload.location,
    currentBoundaryDirection:
      statePayload.boundary_dispatch_direction,
    baseStateVersion: stateVersion,
    requestId,
    idempotencyKey,
    dependencyPins: statePayload.exact_pins
  });
  if (!recognized.ok) {
    throw serverError(
      recognized.code,
      'Действие сейчас недоступно.',
      { status: 409 }
    );
  }
  if (recognized.command.verb === 'cross_boundary'
      && release.boundary_crossing_capability
        !== 'ready_for_runtime_acceptance') {
    throw serverError(
      'BOUNDARY_CAPABILITY_BLOCKED',
      'Переход не утверждён: отсутствуют обязательные segment policies.',
      { status: 409 }
    );
  }
  const activityProfile = resolveRuntimeActivityProfile(
    recognized.command,
    statePayload
  );
  const turnNumber = previousTurnNumber + 1;
  const previousState = structuredClone(statePayload);
  const next = applyCommand(statePayload, recognized.command, {
    turnNumber,
    requestId,
    idempotencyKey,
    activityProfile
  });
  const screen = turnScreen(next.state, {
    turnNumber,
    turnId: `turn:${partyId}:${turnNumber}`,
    prose: next.prose
  });
  const publicResult = {
    party_id: partyId,
    screen,
    turn: {
      turn_id: screen.turn_id,
      turn_number: turnNumber,
      status: 'resolved',
      mode: next.mode,
      summary: { outcome: next.summary.outcome }
    }
  };
  next.state.idempotency[idempotencyKey] = {
    source_digest: sourceDigest,
    result: publicResult
  };
  const plan = await buildFirstPlayableTurnPlan({
    partyId,
    previousState,
    state: next.state,
    screen,
    turnNumber,
    nextVersion: stateVersion + 1,
    stateVersion,
    command: recognized.command,
    result: next,
    requestId,
    idempotencyKey,
    versions
  });
  const committed = await committer.commit({
    plan,
    created_at_turn: turnNumber
  });
  if (!committed?.ok) {
    throw serverError(
      String(committed?.error?.code ?? 'P16_COMMIT_FAILED')
        .toUpperCase(),
      'Действие не было зафиксировано.',
      { status: 409, details: committed?.error }
    );
  }
  return publicResult;
}
