import { randomUUID } from 'node:crypto';
import { serverError } from '../errors.js';
import {
  createFirstPlayablePartyRepository
} from '../infrastructure/postgres/first-playable/repository.js';
import {
  initialState,
  openingScreen
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
import {
  loadLowerDvinaTracePhase1BPublication
} from '../internal/lower-dvina-trace-phase-1b-publication.js';
import {
  buildLowerDvinaTraceOpeningScreen
} from './lower-dvina-trace-opening.js';
import {
  startLowerDvinaTrace
} from './lower-dvina-trace-public-start.js';
import {
  replayExistingLowerDvinaTraceStart
} from './lower-dvina-trace-start-replay.js';
import {
  isLowerDvinaTraceSession,
  TRACE_SCENARIO_ID,
  validateLowerDvinaTraceSessionRead
} from './lower-dvina-trace-session.js';
import {
  submitFirstPlayableTurn
} from './first-playable-turn-runtime.js';

export function createFirstPlayablePublicRuntime({
  partyPool,
  committer,
  release,
  runtimeCatalogPin,
  now = () => new Date().toISOString(),
  idFactory = randomUUID,
  traceStartAdapter = null,
  traceTurnRuntime = null,
  publicationLoader = loadLowerDvinaTracePhase1BPublication,
  traceOpeningProjector = buildLowerDvinaTraceOpeningScreen,
  partyRepository = null
} = {}) {
  if (!release?.release_id || !runtimeCatalogPin?.catalog_revision_id
      || typeof committer?.commit !== 'function') {
    throw new TypeError(
      'exact release, runtime catalog pin and P16 committer are required'
    );
  }
  const repository = partyRepository
    ?? createFirstPlayablePartyRepository({ partyPool });
  return Object.freeze({
    health: () => ({
      status: 'ok',
      service: '@rus/game-server',
      api_version: 1,
      release_id: release.release_id,
      world_revision_id: release.world_revision_id,
      production_activation: release.production_activation === true
    }),
    listScenarios: async () =>
      scenarioCatalog(await publicationLoader()),
    startNewGame: (input) => startNewGame({
      input,
      release,
      runtimeCatalogPin,
      repository,
      now,
      idFactory,
      traceStartAdapter,
      publicationLoader,
      traceOpeningProjector
    }),
    acknowledgeOpening: (partyId, input) => acknowledgeOpening({
      partyId,
      input,
      repository,
      now
    }),
    getPartyScreen: async (partyId) => {
      const session = await repository.loadSession(partyId);
      if (isLowerDvinaTraceSession(session)) {
        validateLowerDvinaTraceSessionRead({ partyId, session });
        if (Number(session.turn_number) > 0) {
          await traceTurnRuntime?.validateSessionRead?.({
            partyId,
            session
          });
        }
      }
      return {
        party_id: partyId,
        turn_number: session.turn_number,
        screen: session.screen
      };
    },
    submitTurn: async (partyId, input) => {
      const session = await repository.loadSession(partyId);
      if (isLowerDvinaTraceSession(session)) {
        validateLowerDvinaTraceSessionRead({ partyId, session });
        if (typeof traceTurnRuntime?.submitTurn !== 'function') {
          throw serverError(
            'TRACE_PHASE_2_DEPENDENCY_MISSING',
            'Игровой ход требует настроенный runtime фазы 2.',
            { status: 503 }
          );
        }
        if (Number(session.turn_number) > 0) {
          await traceTurnRuntime.validateSessionRead?.({
            partyId,
            session
          });
        }
        return traceTurnRuntime.submitTurn({ partyId, input, session });
      }
      return submitFirstPlayableTurn({
        partyId,
        input,
        release,
        repository,
        committer,
        idFactory
      });
    }
  });
}

async function startNewGame({
  input = {},
  release,
  runtimeCatalogPin,
  repository,
  now,
  idFactory,
  traceStartAdapter,
  publicationLoader,
  traceOpeningProjector
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
  if (scenario
    && scenario !== SCENARIO_ID
    && scenario !== TRACE_SCENARIO_ID) {
    throw serverError(
      'SCENARIO_NOT_SUPPORTED',
      'Scenario is not supported.',
      { status: 409 }
    );
  }
  const requestId = String(input.request_id ?? `new-game:${idFactory()}`);
  const partyId = `party:${hash(requestId).slice(0, 24)}`;
  const launchBranch = scenario ? 'scenario_id' : 'start_text';
  const effectivePlayerName = scenario
    ? null
    : String(input.player_name ?? '').trim() || 'Путник';
  const branchInputDigest = hash(json(scenario
    ? { launch_branch: launchBranch, scenario_id: scenario }
    : {
        launch_branch: launchBranch,
        start_text: baseline,
        player_name: effectivePlayerName
      }));
  const creationIdentity = Object.freeze({
    version: 1,
    schema: 'rus.first_playable_public_creation_identity.v1',
    party_id: partyId,
    request_id_digest: hash(requestId),
    launch_branch: launchBranch,
    scenario_id: scenario || null,
    effective_player_name: effectivePlayerName,
    branch_input_digest: branchInputDigest
  });
  await repository.assertNewGameCreationIdentity({
    partyId,
    creationIdentity
  });
  if (scenario === TRACE_SCENARIO_ID) {
    const replayed = await replayExistingLowerDvinaTraceStart({
      partyId,
      requestId,
      repository
    });
    if (replayed) return replayed;
    return startLowerDvinaTrace({
      requestId,
      partyId,
      creationIdentity,
      release,
      repository,
      traceStartAdapter,
      publicationLoader,
      traceOpeningProjector
    });
  }
  const player = scenario
    ? resolvePlayerProfile(requestId)
    : baselinePlayer(input.player_name);
  const state = initialState({
    partyId,
    requestId,
    player,
    scenario: Boolean(scenario),
    creationIdentity,
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
  release,
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
  const before = await repository.loadSession(partyId);
  if (isLowerDvinaTraceSession(before)) {
    validateLowerDvinaTraceSessionRead({ partyId, session: before });
  }
  const acknowledgement = await repository.acknowledgeOpening({
    partyId,
    clientAckId,
    acknowledgedAt: now()
  });
  const session = await repository.loadSession(partyId);
  if (isLowerDvinaTraceSession(session)) {
    validateLowerDvinaTraceSessionRead({ partyId, session });
  }
  return {
    party_id: partyId,
    message_id: `opening:${partyId}`,
    screen_digest:
      session.stage26_result?.scenario_id === TRACE_SCENARIO_ID
        ? session.delivery_attempt?.screen_digest
        : hash(json(session.screen)),
    delivery_status: 'acknowledged',
    acknowledged_at: acknowledgement.acknowledged_at
  };
}
