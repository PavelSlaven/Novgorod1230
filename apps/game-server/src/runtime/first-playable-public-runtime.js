import { randomUUID } from 'node:crypto';

import { serverError } from '../errors.js';
import {
  createFirstPlayablePartyRepository
} from '../infrastructure/postgres/first-playable/repository.js';
import {
  buildFirstPlayableTurnPlan
} from '../infrastructure/postgres/first-playable/turn.js';
import {
  recognizeFirstPlayableSemanticCommand
} from './first-playable-semantic-recognizer.js';
import { applyCommand } from './first-playable/command.js';
import {
  initialState,
  openingScreen,
  resolveRuntimeActivityProfile,
  turnScreen,
  visibleEntityRefs
} from './first-playable/projection.js';
import {
  SCENARIO_ID,
  hash,
  json,
  resolvePlayerProfile
} from './first-playable/shared.js';
import {
  baselinePlayer,
  scenarioCatalog
} from './first-playable/setup.js';

export function createFirstPlayablePublicRuntime({
  partyPool,
  committer,
  release,
  runtimeCatalogPin,
  now = () => new Date().toISOString(),
  idFactory = randomUUID
} = {}) {
  if (!release?.release_id || !runtimeCatalogPin?.catalog_revision_id
      || typeof committer?.commit !== 'function') {
    throw new TypeError(
      'exact release, runtime catalog pin and P16 committer are required'
    );
  }
  const repository = createFirstPlayablePartyRepository({ partyPool });
  return Object.freeze({
    health: () => ({
      status: 'ok',
      service: '@rus/game-server',
      api_version: 1,
      release_id: release.release_id,
      world_revision_id: release.world_revision_id,
      production_activation: release.production_activation === true
    }),
    listScenarios: async () => scenarioCatalog(),
    startNewGame: (input) => startNewGame({
      input,
      release,
      runtimeCatalogPin,
      repository,
      now,
      idFactory
    }),
    acknowledgeOpening: (partyId, input) => acknowledgeOpening({
      partyId,
      input,
      repository,
      now
    }),
    getPartyScreen: async (partyId) => {
      const session = await repository.loadSession(partyId);
      return {
        party_id: partyId,
        turn_number: session.turn_number,
        screen: session.screen
      };
    },
    submitTurn: (partyId, input) => submitTurn({
      partyId,
      input,
      repository,
      committer,
      idFactory
    })
  });
}

async function startNewGame({
  input = {},
  release,
  runtimeCatalogPin,
  repository,
  now,
  idFactory
}) {
  const scenario = String(input.scenario_id ?? '').trim();
  const baseline = String(input.start_text ?? '').trim();
  if ((scenario === '') === (baseline === '')) {
    throw serverError(
      'NEW_GAME_INPUT_BRANCH_REQUIRED',
      'Exactly one of start_text or scenario_id is required.',
      { status: 400 }
    );
  }
  if (scenario && scenario !== SCENARIO_ID) {
    throw serverError(
      'SCENARIO_NOT_SUPPORTED',
      'Scenario is not supported.',
      { status: 409 }
    );
  }
  const requestId = String(input.request_id ?? `new-game:${idFactory()}`);
  const partyId = `party:${hash(requestId).slice(0, 24)}`;
  const player = scenario
    ? resolvePlayerProfile(requestId)
    : baselinePlayer(input.player_name);
  const state = initialState({
    partyId,
    requestId,
    player,
    scenario: Boolean(scenario),
    release,
    runtimeCatalogPin
  });
  const screen = openingScreen(state);
  await repository.createInitial({
    state,
    screen,
    release,
    runtimeCatalogPin,
    now: now()
  });
  const persisted = await repository.loadSession(partyId);
  return {
    request_id: requestId,
    party_id: partyId,
    screen: persisted.screen,
    delivery: {
      delivery_attempt_id: `delivery:${partyId}`,
      message_id: `opening:${partyId}`,
      screen_digest: hash(json(persisted.screen)),
      status: 'sent',
      awaiting_client_ack: true
    }
  };
}

async function acknowledgeOpening({
  partyId,
  input = {},
  repository,
  now
}) {
  const clientAckId = String(input.client_ack_id ?? '').trim();
  if (!clientAckId) {
    throw serverError(
      'CLIENT_ACK_ID_REQUIRED',
      'client_ack_id is required.',
      { status: 400 }
    );
  }
  const acknowledgedAt = now();
  await repository.acknowledgeOpening({
    partyId,
    clientAckId,
    acknowledgedAt
  });
  const session = await repository.loadSession(partyId);
  return {
    party_id: partyId,
    message_id: `opening:${partyId}`,
    screen_digest: hash(json(session.screen)),
    delivery_status: 'acknowledged',
    acknowledged_at: acknowledgedAt
  };
}

async function submitTurn({
  partyId,
  input = {},
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
    if (recognized.command.verb === 'cross_boundary') {
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
