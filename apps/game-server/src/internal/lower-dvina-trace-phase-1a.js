import {
  canonicalDigest,
  MaterializationError
} from '@rus/materialization';
import {
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  buildLowerDvinaTracePhase1AWritePlan
} from '@rus/new-game/stages/stage-24/internal/lower-dvina-trace-phase-1a';
import {
  auditPartyDbWritePlanByCode,
  buildApprovedPipelineManifest,
  buildStage24Input,
  runStage24PartyDbWritePlan
} from '@rus/new-game/stages/stage-24';
import { buildStage25CommitInput, runStage25PartyCommit } from '@rus/new-game/stages/stage-25';
import { computeStage24ArtifactDigest } from '@rus/contracts';
export {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp,
  validateLowerDvinaTracePlayerDossier
} from './lower-dvina-trace-phase-1a-bundle.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp,
  validateLowerDvinaTracePlayerDossier
} from './lower-dvina-trace-phase-1a-bundle.js';
const inFlightParties = new Map();

export async function materializeLowerDvinaTraceParty({
  request,
  domainCatalogPinLoader,
  partyDatabaseSchema,
  worldBaseReferenceSnapshot,
  repository,
  stage25Ports,
  stage24Auditor = auditPartyDbWritePlanByCode,
  rootDir = process.cwd()
} = {}) {
  if (!request?.party_id || !repository || !stage25Ports) fail('TRACE_PHASE_1A_SERVICE_INPUT_INVALID', 'Request, repository and Stage 25 ports are required.');
  const existing = await repository.loadInternal(request.party_id);
  if (existing) return replayOrConflict(existing, request);
  const idempotency = await repository.loadIdempotency(request.idempotency_key);
  if (idempotency && idempotency.status === 'committed') {
    const committed = await repository.loadInternal(request.party_id);
    if (committed) return replayOrConflict(committed, request);
  }
  const current = inFlightParties.get(request.party_id);
  if (current) return current.then((outcome) => replayOrConflict(outcome.instance, request));
  const operation = materializeAndCommit({
    request,
    domainCatalogPinLoader,
    partyDatabaseSchema,
    worldBaseReferenceSnapshot,
    repository,
    stage25Ports,
    stage24Auditor,
    rootDir
  });
  inFlightParties.set(request.party_id, operation);
  try {
    return await operation;
  } finally {
    inFlightParties.delete(request.party_id);
  }
}

async function materializeAndCommit({ request, domainCatalogPinLoader, partyDatabaseSchema, worldBaseReferenceSnapshot, repository, stage25Ports, stage24Auditor, rootDir }) {
  if (typeof domainCatalogPinLoader !== 'function') {
    fail('TRACE_PHASE_1A_DOMAIN_CATALOG_PIN_MISSING', 'The active item/container domain catalog pin loader is required before materialization.');
  }
  const domainCatalogPin = await domainCatalogPinLoader({
    catalog_scope: 'item_container_materialization_v2',
    world_revision_id: request.world_revision_id,
    world_catalog_digest: request.world_catalog_digest
  });
  const bundle = await loadLowerDvinaTraceMaterializationBundle({ rootDir });
  const materialization = materializeLowerDvinaTracePartyInstance({
    ...request,
    domain_catalog_pin: domainCatalogPin,
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
  });
  const semantic = validateLowerDvinaTracePlayerDossier(materialization, bundle);
  const sealedSelectionClosure = {
    version: 1,
    schema: 'rus.lower_dvina_trace_sealed_selection_closure.v1',
    pass: true,
    party_id: materialization.party_id,
    materialization_result_digest: materialization.trace.result_digest,
    sealed_selections_digest: computeStage24ArtifactDigest(materialization.sealed_selections)
  };
  const approvedOutputs = {
    scenario_definition: bundle.definition,
    materialization_result: materialization,
    player_character_audit: {
      version: 1,
      schema: 'rus.lower_dvina_trace_player_semantic_audit.v1',
      ...semantic
    },
    sealed_selection_closure: sealedSelectionClosure
  };
  const partyContext = {
    party_id: request.party_id,
    player_character_id: materialization.immediate.player.instance_id,
    schema_version: 'party_runtime_v2',
    idempotency_key: request.idempotency_key,
    request_id: request.idempotency_key,
    commit_mode: 'internal_materialization',
    domain_catalog_pin: structuredClone(domainCatalogPin),
    version_pins: {
      world_revision_id: request.world_revision_id,
      world_catalog_digest: request.world_catalog_digest,
      materializer_version: request.materializer_version,
      rng_version: request.rng_algorithm_id,
      command_catalog_digest: request.scenario_manifest_digest,
      profile_bundle_digest: canonicalDigest(materialization.policy_profile_pins)
    }
  };
  const manifest = buildApprovedPipelineManifest({
    request_id: request.idempotency_key,
    artifacts: approvedOutputs,
    pipeline_profile: 'lower_dvina_trace_phase_1a_internal_materialization'
  });
  const stage24Input = buildStage24Input({
    request_id: request.idempotency_key,
    pipeline_profile: 'lower_dvina_trace_phase_1a_internal_materialization',
    party_creation_context: partyContext,
    approved_pipeline_outputs: approvedOutputs,
    approved_pipeline_manifest: manifest,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot,
  });
  const stage24 = await runStage24PartyDbWritePlan({
    input: stage24Input,
    builder: buildLowerDvinaTracePhase1AWritePlan,
    auditor: (auditRequest) => stage24Auditor({ ...auditRequest, stage24_input: stage24Input })
  });
  const stage25Input = buildStage25CommitInput({
    request_id: request.idempotency_key,
    party_creation_context: partyContext,
    stage24_result: stage24,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: worldBaseReferenceSnapshot,
    approved_pipeline_manifest: manifest
  });
  const committed = await runStage25PartyCommit({ input: stage25Input, ...stage25Ports });
  if (committed.pass !== true) {
    const recovered = await repository.loadInternal(request.party_id);
    if (recovered) {
      replayOrConflict(recovered, request);
      const recoveryRecord = {
        version: 1,
        schema: 'rus.lower_dvina_trace_phase_1a_commit_recovery.v1',
        status: 'committed_recovered',
        party_id: request.party_id,
        idempotency_key: request.idempotency_key,
        payload_hash: stage25Input.party_creation_context.payload_hash,
        physical_plan_digest: committed.transaction_result?.physical_write_plan_digest
      };
      if (typeof stage25Ports.recordCommittedResult === 'function') await stage25Ports.recordCommittedResult(recoveryRecord);
      return Object.freeze({ status: 'committed_recovered', stage24, stage25_recovery: recoveryRecord, instance: recovered });
    }
    const idempotency = await repository.loadIdempotency(request.idempotency_key);
    if (idempotency && (idempotency.payload_hash !== stage25Input.party_creation_context.payload_hash
      || idempotency.physical_plan_digest !== committed.transaction_result?.physical_write_plan_digest)) {
      fail('TRACE_PHASE_1A_IDEMPOTENCY_CONFLICT', 'Idempotency key is already bound to another materialization identity.');
    }
    if (committed.transaction_result?.commit_status === 'committed') {
      fail('TRACE_PHASE_1A_COMMIT_STATE_UNKNOWN', 'The transaction committed, but its complete state could not be rehydrated.', { committed });
    }
    fail('TRACE_PHASE_1A_COMMIT_FAILED', 'Stage 25 rejected or rolled back Phase 1A materialization.', { committed });
  }
  if (typeof stage25Ports.recordCommittedResult === 'function') await stage25Ports.recordCommittedResult(committed);
  const instance = await repository.loadInternal(request.party_id);
  if (!instance) fail('TRACE_PHASE_1A_POSTCOMMIT_MISSING', 'Committed party could not be rehydrated.');
  return Object.freeze({ status: 'committed', stage24, stage25: committed, instance });
}

export function createLowerDvinaTracePhase1APostcommitProjector({ repository } = {}) {
  if (!repository) throw new TypeError('repository is required.');
  return async ({ input }) => {
    const instance = await repository.loadInternal(input.party_id);
    const idempotency = await repository.loadIdempotency(input.party_creation_context.idempotency_key);
    if (!instance || !idempotency) fail('TRACE_PHASE_1A_POSTCOMMIT_MISSING', 'Internal postcommit readback is incomplete.');
    const visible = await repository.loadVisible(input.party_id);
    return {
      version: 1,
      schema: 'party_postcommit_state',
      request_id: input.request_id,
      party_id: input.party_id,
      transaction_id: input.transaction_id,
      physical_write_plan_digest: input.physical_write_plan_digest,
      party_state: { status: 'active', is_ready_for_player: false, current_phase: 'internal_materialized', current_turn_number: 0 },
      current_position: instance.position,
      current_clock: instance.timestamp,
      player_character: { character_id: instance.player.instance_id, profile: instance.player.dossier },
      player_output_ref: { narrator_output_id: null, player_visible_message_ready: false },
      idempotency_record: idempotency,
      party_public_state: visible,
      integrity: instance.integrity
    };
  };
}

function replayOrConflict(existing, request) {
  const stored = existing.request_identity;
  for (const key of [
    'party_id',
    'scenario_id',
    'scenario_definition_revision',
    'scenario_manifest_digest',
    'world_revision_id',
    'world_catalog_digest',
    'materializer_version',
    'rng_algorithm_id',
    'seed_context',
    'idempotency_key',
    'trigger',
    'occurrence'
  ]) {
    if (stored?.[key] !== request?.[key]) fail('TRACE_PHASE_1A_REPLAY_CONFLICT', `Existing party conflicts on ${key}.`);
  }
  if (canonicalDigest(stored?.world_compatibility ?? null)
    !== canonicalDigest(request?.world_compatibility ?? null)) {
    fail(
      'TRACE_PHASE_1A_REPLAY_CONFLICT',
      'Existing party conflicts on world_compatibility.'
    );
  }
  return Object.freeze({ status: 'replayed', instance: existing });
}

function fail(code, message, details = {}) {
  throw new MaterializationError(code, message, details);
}
