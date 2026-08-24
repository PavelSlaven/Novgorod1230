import { LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT, materializeLowerDvinaTracePartyInstance } from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { materializeInitialActorEquipment } from '@rus/new-game';
import { resolveLowerDvinaTraceStartTimestamp } from '../src/internal/lower-dvina-trace-phase-1a.js';
import { lowerDvinaTracePhase1ADomainPin } from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

export function phase1AInstance(partyId, scenarioBundle) {
  return materializeInitialActorEquipment(
    materializeLowerDvinaTracePartyInstance({
      party_id: partyId,
      scenario_id: 'lower_dvina_trace_v1',
      scenario_definition_revision: scenarioBundle.definition_revision,
      scenario_manifest_digest: scenarioBundle.manifest_digest,
      world_revision_id: scenarioBundle.location_topology_set.spatial_source_ref.world_revision_id,
      world_catalog_digest: scenarioBundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
      domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(scenarioBundle),
      materializer_version: MATERIALIZER_VERSION,
      rng_algorithm_id: RNG_VERSION,
      seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
      idempotency_key: `phase1a:${partyId}`,
      trigger: 'new_game',
      occurrence: 0,
      existing_party_state: { baseline_exists: false },
      scenario_bundle: scenarioBundle,
      resolve_timestamp: resolveLowerDvinaTraceStartTimestamp,
    }),
  );
}

export async function unexpectedPlayerConversationModel() {
  throw new Error('Unexpected player conversation model call');
}
export async function unexpectedNpcSemanticModel() {
  throw new Error('Unexpected NPC semantic model call');
}
export async function unexpectedNpcAutonomousModel() {
  throw new Error('Unexpected autonomous NPC model call');
}
export async function unexpectedNpcCombatModel() {
  throw new Error('Unexpected NPC combat model call');
}

export function replaceState(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

export function approvedNarration(requestId) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose: 'Ты внимательно осматриваешь повреждённую лодку и следы на берегу.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true },
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['Текст основан только на persisted visible context.'],
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {},
  };
}
