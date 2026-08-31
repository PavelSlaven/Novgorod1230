import { randomUUID } from 'node:crypto';
import { serverError } from '../errors.js';
import {
  createFirstPlayablePartyRepository
} from '../infrastructure/postgres/first-playable/repository.js';
import {
  hash,
  json
} from './first-playable/shared.js';
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
  TRACE_SCENARIO_ID,
  validateLowerDvinaTraceSessionRead
} from './lower-dvina-trace-session.js';

export function createLowerDvinaTracePublicRuntime({
  partyPool,
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
  if (!release?.release_id || !runtimeCatalogPin?.catalog_revision_id) {
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
    listScenarios: async () => {
      const publication = await publicationLoader();
      return {
        version: 1,
        schema: 'public_scenario_catalog',
        scenarios: [{
          scenario_id: publication.public_projection.scenario_id,
          ...structuredClone(publication.public_projection.public_metadata)
        }]
      };
    },
    startNewGame: (input) => startNewGame({
      input,
      release,
      repository,
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
      validateLowerDvinaTraceSessionRead({ partyId, session });
      if (Number(session.turn_number) > 0) {
        await traceTurnRuntime?.validateSessionRead?.({
          partyId,
          session
        });
      }
      return {
        party_id: partyId,
        turn_number: session.turn_number,
        screen: session.screen
      };
    },
    submitTurn: async (partyId, input) => {
      const requestId = String(input?.request_id ?? `turn:${idFactory()}`);
      const submit = async () => {
        const turnBudget = traceTurnRuntime?.llmTurnBudget
          ?? traceTurnRuntime?.llmDiagnostics?.turnBudget ?? null;
        const session = await repository.loadSession(partyId, { turnBudget });
        turnBudget?.assertWithinDeadline?.();
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
            session,
            turnBudget
          });
        }
        return traceTurnRuntime.submitTurn({
          partyId,
          input: {
            ...input,
            request_id: requestId,
            idempotency_key: String(input?.idempotency_key ?? requestId)
          },
          session
        });
      };
      return traceTurnRuntime?.llmDiagnostics?.runTurn
        ? traceTurnRuntime.llmDiagnostics.runTurn(
          { party_id: partyId, request_id: requestId }, submit)
        : submit();
    }
  });
}

async function startNewGame({
  input = {},
  release,
  repository,
  idFactory,
  traceStartAdapter,
  publicationLoader,
  traceOpeningProjector
}) {
  const scenario = String(input.scenario_id ?? '').trim();
  if (scenario !== TRACE_SCENARIO_ID || String(input.start_text ?? '').trim()) {
    throw serverError(
      'SCENARIO_NOT_SUPPORTED',
      'Scenario is not supported.',
      { status: 400 }
    );
  }
  const requestId = String(input.request_id ?? `new-game:${idFactory()}`);
  const partyId = `party:${hash(requestId).slice(0, 24)}`;
  const launchBranch = 'scenario_id';
  const effectivePlayerName = null;
  const branchInputDigest = hash(json({
    launch_branch: launchBranch,
    scenario_id: scenario
  }));
  const creationIdentity = Object.freeze({
    version: 1,
    schema: 'rus.first_playable_public_creation_identity.v1',
    party_id: partyId,
    request_id_digest: hash(requestId),
    launch_branch: launchBranch,
    scenario_id: scenario,
    effective_player_name: effectivePlayerName,
    branch_input_digest: branchInputDigest
  });
  await repository.assertNewGameCreationIdentity({
    partyId,
    creationIdentity
  });
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
  const before = await repository.loadSession(partyId);
  validateLowerDvinaTraceSessionRead({ partyId, session: before });
  const acknowledgement = await repository.acknowledgeOpening({
    partyId,
    clientAckId,
    acknowledgedAt: now()
  });
  const session = await repository.loadSession(partyId);
  validateLowerDvinaTraceSessionRead({ partyId, session });
  return {
    party_id: partyId,
    message_id: `opening:${partyId}`,
    screen_digest: session.delivery_attempt?.screen_digest,
    delivery_status: 'acknowledged',
    acknowledged_at: acknowledgement.acknowledged_at
  };
}
