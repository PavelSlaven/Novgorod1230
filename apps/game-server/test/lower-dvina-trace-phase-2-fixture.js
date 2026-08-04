import {
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import { createSeededRandomSource } from '@rus/checks-rng';
import {
  createLowerDvinaTracePhase2Runtime
} from '../src/runtime/lower-dvina-trace-phase-2.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { nextState as nextPhase3State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-state.js';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { nextPhase5State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-5-state.js';
import { nextPhase6State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-6-state.js';

export const bundle = await loadLowerDvinaTraceMaterializationBundle();
export const bundle9 = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 9
});
export const loadScenarioBundle = (scenarioDefinitionRevision) =>
  loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision });

function phase1AInstance(partyId, scenarioBundle = bundle) {
  return materializeLowerDvinaTracePartyInstance({
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: scenarioBundle.definition_revision,
    scenario_manifest_digest: scenarioBundle.manifest_digest,
    world_revision_id:
      scenarioBundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest:
      scenarioBundle.location_topology_set.spatial_source_ref
        .world_revision_catalog_digest,
    domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(scenarioBundle),
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
    idempotency_key: `phase1a:${partyId}`,
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: scenarioBundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
  });
}

export function fixture({
  semantic = 'resolved',
  narrationFails = false,
  scenarioBundle = bundle,
  materializationBundle = scenarioBundle,
  rollValue = null,
  turnStepModel = null,
  committedState = null,
  npcOption = 'surrender_and_confess',
  playerSafeStateProjector = null,
  temporalAdvanceOwner = null
} = {}) {
  const partyId = 'party:trace-phase-2';
  const instance = phase1AInstance(partyId, materializationBundle);
  const state = committedState == null ? {
    party_id: partyId,
    actor_id: instance.immediate.player.instance_id,
    party_state: {
      state_version: 1,
      turn_number: 0,
      session_state_version: 1,
      clock_state_version: 1,
      body_state_version: 1
    },
    player_profile: instance.immediate.player.dossier,
    body_state: {
      ...instance.immediate.body.values,
      active_conditions:
        instance.immediate.body.condition_bindings.map((condition, ordinal) => ({
          id: condition.state,
          storage_condition_id: `condition-phase2-${ordinal}`,
          condition_profile_ref: structuredClone(condition),
          status: 'active',
          state_version: 1
        }))
    },
    body_effect_history: [],
    position: {
      ...instance.immediate.spatial.position,
      location_ref: 'trace_ld_v1_loc_wreck_shore'
    },
    clock: instance.immediate.timestamp,
    clock_weather_light: {
      clock: instance.immediate.timestamp,
      weather: {},
      light: {}
    },
    environment_snapshot: instance.immediate.environment_snapshot,
    world_identity: {
      world_revision_id:
        materializationBundle.location_topology_set.spatial_source_ref
          .world_revision_id,
      world_catalog_digest:
        materializationBundle.location_topology_set.spatial_source_ref
          .world_revision_catalog_digest
    },
    materialization_trace: structuredClone(instance.trace),
    prepared_scenes:
      structuredClone(instance.immediate.prepared_scenes ?? []),
    npcs: structuredClone(instance.immediate.npcs ?? []),
    promise_instances:
      structuredClone(instance.immediate.promise_instances ?? []),
    interactions: [],
    route_history: [],
    route_knowledge: [],
    sealed_selections: instance.sealed_selections,
    policy_pins: structuredClone(instance.policy_profile_pins),
    relevant_events: [],
    historical_events: [],
    temporal_boundary_candidates: [],
    items: instance.immediate.items.map((item) => ({
      item_id: item.instance_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      claim_state: item.claim_state,
      placement: {
        anchor_id: item.anchor_id ?? null,
        container_id: item.container_id ?? null,
        holder_character_id: item.holder_character_id,
        holder_npc_id: item.holder_npc_id,
        physical_position: item.physical_position
      },
      ownership: {
        owner_character_id: item.owner_character_id,
        controller_character_id: item.controller_character_id,
        owner_npc_id: item.owner_npc_id,
        controller_npc_id: item.controller_npc_id,
        claim_state: item.claim_state
      },
      state: structuredClone(item.state)
    })),
    knowledge: [],
    opening_identity: {
      opening_screen_digest: 'a'.repeat(64)
    },
    relevant_hidden_state: {
      culprit: 'must-not-reach-llm',
      motive: 'must-not-reach-llm'
    },
    temporal_source_proof: {
      version: 1,
      schema: 'lower_dvina_trace_phase_2_temporal_source_proof',
      owner: '@rus/time-events-history/temporal-boundaries',
      same_time_cascade_owner:
        '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
      admission_policy:
        'fail_closed_before_activity_when_unbound_candidate_exists',
      pending_event_count: 0,
      active_schedule_count: 0,
      candidate_count: 0
    }
  } : structuredClone(committedState);
  const replays = new Map();
  const events = [];
  let committedVisible = null;
  let lastWritePlan = null;
  let lastCommitInput = null;
  let semanticInput = null;
  let turnStepInput = null;
  let turnStepCount = 0;
  let rollCount = 0;
  let commitCount = 0;
  let timeUpdateCount = 0;
  let bodyUpdateCount = 0;
  let itemCreationCount = 0;
  let narratorInput = null;
  const bundleRequests = [];
  const repository = {
    async loadPhase2State() {
      events.push('load_state');
      return structuredClone(state);
    },
    async loadPhase2Replay({ idempotencyKey }) {
      return structuredClone(replays.get(idempotencyKey) ?? null);
    },
    async commitPhase2Turn(commitInput) {
      const { writePlan, inputDigest, phase3Contracts,
        phase4Contracts, phase5Contracts, phase6Contracts } = commitInput;
      events.push('commit');
      commitCount += 1;
      lastCommitInput = commitInput;
      lastWritePlan = structuredClone(writePlan);
      const factual = writePlan.write_targets.find(
        ({ target }) => target === 'party_state'
      ).value;
      committedVisible = writePlan.write_targets.find(
        ({ target }) => target === 'party_visible_context_package'
      ).value;
      const clue = factual.consequence.clue_materialization;
      const nextVersion = state.party_state.state_version + 1;
      const turnNumber = state.party_state.turn_number + 1;
      const changeSetId = `change:${partyId}:${turnNumber}`;
      if (factual.consequence.phase6_kind != null) {
        replaceState(state, nextPhase6State({
          state,
          factual,
          nextVersion,
          turnNumber,
          changeSetId,
          inputDigest
        }));
      } else if (factual.consequence.phase5_kind != null) {
        replaceState(state, nextPhase5State({
          state,
          factual,
          nextVersion,
          turnNumber,
          inputDigest,
          changeSetId,
          contracts: phase5Contracts
        }));
      } else if (factual.consequence.phase4_kind != null) {
        replaceState(state, nextPhase4State({
          state,
          factual,
          nextVersion,
          turnNumber,
          inputDigest,
          changeSetId,
          contracts: phase4Contracts
        }));
      } else if (factual.consequence.phase3_kind != null) {
        replaceState(state, nextPhase3State({
          state,
          factual,
          nextVersion,
          turnNumber,
          inputDigest,
          changeSetId,
          contracts: phase3Contracts
        }));
      } else {
        if (clue && !state.items.some(
          (item) => item.template_id === clue.template_id
        )) {
          itemCreationCount += 1;
          state.items.push({
            item_id: clue.instance_id,
            template_id: clue.template_id,
            profile_id: clue.profile_id,
            quantity: clue.quantity,
            placement: structuredClone(clue.placement),
            state: {
              evidence_ref: 'trace_ld_v1_evidence_blue_wool',
              property_state: structuredClone(clue.property_state),
              inventory_profile_snapshot:
                structuredClone(clue.inventory_profile),
              inventory_effect: structuredClone(clue.inventory_effect),
              pickup_transition: structuredClone(clue.pickup_transition)
            }
          });
        }
        timeUpdateCount += 1;
        state.clock = factual.time_update.clock_after;
        state.clock_weather_light.clock = state.clock;
        bodyUpdateCount += 1;
        state.body_state = factual.body_update.state_after;
        state.body_effect_history.push({
          history_id:
            `body-history:${partyId}:trace-phase2:${state.party_state.turn_number + 1}`,
          effect_ref: factual.consequence.body_effect_ref,
          activity_attempt_id: factual.consequence.activity_attempt_id,
          execution_variant_id:
            factual.body_update.proposal.execution_variant_id,
          occurred_at: structuredClone(factual.time_update.clock_after)
        });
        state.knowledge.push(
          ...factual.consequence.knowledge_records.map(
            (entry) => structuredClone(entry)
          )
        );
        state.party_state.state_version += 1;
        state.party_state.turn_number += 1;
        state.party_state.session_state_version += 1;
        state.party_state.clock_state_version += 1;
        state.party_state.body_state_version += 1;
      }
      const commit = {
        committed: true,
        state_version: state.party_state.state_version,
        visible_package_digest: committedVisible.canonical_digest ?? null
      };
      replays.set(factual.player_input.idempotency_key, {
        input_digest: inputDigest,
        factual,
        public_result: null
      });
      return commit;
    },
    async loadPhase2VisibleContext() {
      events.push('read_committed_visible');
      return structuredClone(committedVisible);
    },
    async persistPhase2Screen({ inputDigest, result }) {
      events.push('persist_screen');
      const publicResult = {
        party_id: partyId,
        turn_number: state.party_state.turn_number,
        state_version: state.party_state.state_version,
        option_id: result.checkpoint.stages.resolve_mode.option_id,
        screen: result.screen,
        check: result.checkpoint.stages.checks.results[0],
        time_update: result.checkpoint.stages.time_update,
        body_update: result.checkpoint.stages.body_update,
        observations:
          result.checkpoint.stages.consequence.observations,
        evidence:
          result.checkpoint.stages.consequence.evidence_relations,
        clue:
          result.checkpoint.stages.consequence.clue_materialization,
        movement: result.checkpoint.stages.consequence.movement ?? null,
        conversation:
          result.checkpoint.stages.consequence.conversation ?? null,
        negotiation:
          result.checkpoint.stages.consequence.negotiation ?? null,
        treatment: result.checkpoint.stages.consequence.treatment ?? null,
        carry: result.checkpoint.stages.consequence.carry ?? null
      };
      const replay = [...replays.values()].find(
        (entry) => entry.input_digest === inputDigest
      );
      replay.public_result = structuredClone(publicResult);
      return publicResult;
    }
  };
  const runtime = createLowerDvinaTracePhase2Runtime({
    repository,
    bundleLoader: async (request) => {
      bundleRequests.push(structuredClone(request));
      return scenarioBundle;
    },
    decisionSecret: 'phase-2-decision-secret',
    now: () => '2026-07-30T08:00:00.000Z',
    semanticResolver: async (input) => {
      semanticInput = structuredClone(input);
      if (semantic === 'unknown' || semantic === 'ambiguous') {
        return {
          status: 'unknown',
          reason_code: semantic === 'ambiguous'
            ? 'ambiguous_intent'
            : 'unknown_intent'
        };
      }
      return { option_id: input.action_set[0].option_id };
    },
    ...(turnStepModel ? {
      turnStepModel: async (input, repairContext) => {
        turnStepCount += 1;
        turnStepInput = structuredClone(input);
        return turnStepModel(input, repairContext);
      }
    } : {}),
    ...(playerSafeStateProjector ? { playerSafeStateProjector } : {}),
    ...(temporalAdvanceOwner ? { temporalAdvanceOwner } : {}),
    npcDecisionSelector: async (request) => {
      const selected = request.options.find(
        ({ option_id: optionId }) => optionId === npcOption
      ) ?? request.options[0];
      return {
        request_id: request.request_id,
        state_version: request.state_version,
        option_id: selected.option_id,
        command_token: selected.command_token
      };
    },
    randomSourceFactory: () => {
      const source = createSeededRandomSource(
        'lower-dvina-trace-phase-2-acceptance'
      );
      return {
        next() {
          rollCount += 1;
          return rollValue == null ? source.next() : rollValue;
        },
        snapshot: () => source.snapshot()
      };
    },
    narrator: {
      async run(input) {
        narratorInput = structuredClone(input);
        if (narrationFails) {
          return {
            version: 1,
            schema: 'narration_flow_result',
            request_id: input.request_id,
            surface: 'turn',
            status: 'blocked',
            pass: false,
            approved_output: null,
            final_audit: null
          };
        }
        return approvedNarration(input.request_id);
      }
    }
  });
  return {
    bodyUpdateCount: () => bodyUpdateCount,
    bundleRequests,
    commitCount: () => commitCount,
    events,
    narratorInput: () => narratorInput,
    lastCommitInput: () => lastCommitInput,
    lastWritePlan: () => lastWritePlan,
    itemCreationCount: () => itemCreationCount,
    partyId,
    repository,
    rollCount: () => rollCount,
    runtime,
    semanticInput: () => semanticInput,
    timeUpdateCount: () => timeUpdateCount,
    turnStepCount: () => turnStepCount,
    turnStepInput: () => turnStepInput,
    state
  };
}

function replaceState(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, structuredClone(source));
}

function approvedNarration(requestId) {
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
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['Текст основан только на persisted visible context.']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}
