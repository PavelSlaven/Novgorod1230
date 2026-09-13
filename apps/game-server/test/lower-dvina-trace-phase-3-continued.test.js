import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  materializeLowerDvinaTracePartyInstance
} from '@rus/materialization/internal/lower-dvina-trace-phase-1a';
import {
  canonicalDigest,
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import { createSeededRandomSource } from '@rus/checks-rng';
import { WorldKnowledgeError } from '@rus/world-knowledge';
import {
  createLowerDvinaTracePhase2Runtime
} from '../src/runtime/lower-dvina-trace-phase-2.js';
import {
  assertPhase3ReadRows
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-3-read-validation.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

const bundle = await loadLowerDvinaTraceMaterializationBundle({
  scenarioDefinitionRevision: 9
});

test('successful evidence conversation commits bounded disclosure and route knowledge without moving the player', async () => {
  const f = fixture({
    atCamp: true,
    blueWool: true,
    resolverOption: 'show_clue_and_seek_eremey_cooperation',
    rollValue: 0.99
  });
  const positionBefore = structuredClone(f.state.position);
  const result = await f.submit({
    key: 'phase3-evidence-success',
    raw: 'Вот синяя шерсть с места крушения — расскажи всё, что видел.'
  });
  const conversation = result.conversation;

  assert.equal(result.check.outcome.success, true);
  assert.equal(result.time_update.exact_elapsed.exact_minutes.numerator, '10');
  assert.equal(conversation.decision.trace.option_id, 'bounded_disclosure');
  assert.equal(conversation.statement_ref,
    'trace_ld_v1_statement_eremey_disclosure');
  assert.equal(conversation.testimonial_evidence_ref,
    'trace_ld_v1_evidence_eremey_words');
  assert.equal(conversation.route_knowledge_ref,
    'trace_ld_v1_route_camp_to_shed');
  assert.deepEqual(f.state.position, positionBefore);
  assert.deepEqual(f.state.route_knowledge,
    ['trace_ld_v1_route_camp_to_shed']);
  const playerFacing = JSON.stringify({
    scene: result.screen.visible_context.visible_scene,
    known: result.screen.visible_context.known_context
  });
  assert.equal(playerFacing.includes('blue_wool_matches_ratsha_caftan'), false);
  assert.equal(playerFacing.includes('conclusion:principal_zhdanko'), false);

  await assert.rejects(
    () => f.submit({
      key: 'phase3-post-disclosure-talk',
      raw: 'Снова спросить Еремея о крушении.'
    }),
    { code: 'TURN_AVAILABLE_ACTION_SET_EMPTY' }
  );
  await assert.rejects(
    () => f.submit({
      key: 'phase3-post-disclosure-evidence',
      raw: 'Снова показать Еремею синюю шерсть.'
    }),
    { code: 'TURN_AVAILABLE_ACTION_SET_EMPTY' }
  );
  assert.equal(f.rollCount(), 1);
  assert.equal(f.commitCount(), 1);
});

test('failed evidence conversation remains guarded, persists ten minutes and does not disclose the route', async () => {
  const f = fixture({
    atCamp: true,
    blueWool: true,
    resolverOption: 'show_clue_and_seek_eremey_cooperation',
    rollValue: 0
  });
  const result = await f.submit({
    key: 'phase3-evidence-failure',
    raw: 'Показываю Еремею клочок шерсти и прошу помочь.'
  });

  assert.equal(result.check.outcome.success, false);
  assert.equal(result.conversation.consequence_ref,
    'trace_ld_v1_consequence_eremey_remains_guarded');
  assert.equal(result.conversation.decision.trace.option_id,
    'evade_and_withhold');
  assert.equal(result.conversation.route_knowledge_ref, null);
  assert.equal(result.time_update.exact_elapsed.exact_minutes.numerator, '10');
  assert.deepEqual(f.state.route_knowledge, []);
  assert.equal(JSON.stringify(result).includes('relationship_delta'), false);
});

test('Phase 3 exact replay restores the same result and conflicting payload fails closed', async () => {
  const f = fixture({ atCamp: true });
  const first = await f.submit({
    key: 'phase3-replay',
    raw: 'Поговорить с Еремеем о крушении.'
  });
  const replay = await f.submit({
    key: 'phase3-replay',
    raw: 'Поговорить с Еремеем о крушении.'
  });
  assert.deepEqual(replay, first);
  assert.equal(f.commitCount(), 1);
  assert.equal(f.state.interactions.length, 1);
  await assert.rejects(
    () => f.submit({
      key: 'phase3-replay',
      raw: 'Спросить Еремея иначе.'
    }),
    { code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT' }
  );
  assert.equal(f.commitCount(), 1);
});

function fixture({
  atCamp = false,
  blueWool = false,
  resolverOption = null,
  rollValue = 0.99,
  failWorldKnowledgeOnce = false,
  contractBundle = bundle
} = {}) {
  const partyId = 'party:trace-phase-3-unit';
  const instance = materializeLowerDvinaTracePartyInstance({
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: bundle.definition_revision,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id:
      bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest:
      bundle.location_topology_set.spatial_source_ref
        .world_revision_catalog_digest,
    domain_catalog_pin: lowerDvinaTracePhase1ADomainPin(bundle),
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
    idempotency_key: `phase1a:${partyId}`,
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false },
    scenario_bundle: bundle,
    resolve_timestamp: resolveLowerDvinaTraceStartTimestamp
  });
  const state = initialState({ partyId, instance, atCamp, blueWool });
  const replays = new Map();
  const semanticRequests = [];
  const narratorRequests = [];
  const bundleRequests = [];
  let visible = null;
  let commits = 0;
  let rolls = 0;
  let worldKnowledgeFailures = 0;
  const repository = {
    async loadPhase2State() {
      return structuredClone(state);
    },
    async loadPhase2Replay({ idempotencyKey }) {
      return structuredClone(replays.get(idempotencyKey) ?? null);
    },
    async commitPhase2Turn({ writePlan, inputDigest }) {
      commits += 1;
      const factual = writePlan.write_targets.find(
        ({ target }) => target === 'party_state'
      ).value;
      visible = writePlan.write_targets.find(
        ({ target }) => target === 'party_visible_context_package'
      ).value;
      applyFactual(state, factual);
      const commit = {
        committed: true,
        state_version: state.party_state.state_version,
        turn_number: state.party_state.turn_number,
        package_id: `visible:${state.party_state.turn_number}`,
        package_digest: 'b'.repeat(64)
      };
      replays.set(factual.player_input.idempotency_key, {
        input_digest: inputDigest,
        public_result: null
      });
      return commit;
    },
    async loadPhase2VisibleContext() {
      return structuredClone(visible);
    },
    async persistPhase2Screen({ inputDigest, result }) {
      const consequence = result.checkpoint.stages.consequence;
      const publicResult = {
        party_id: partyId,
        turn_number: state.party_state.turn_number,
        state_version: state.party_state.state_version,
        option_id: result.checkpoint.stages.resolve_mode.option_id,
        screen: result.screen,
        check: result.checkpoint.stages.checks.results[0] ?? null,
        time_update: result.checkpoint.stages.time_update,
        movement: consequence.movement ?? null,
        conversation: consequence.conversation ?? null
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
      return contractBundle;
    },
    semanticResolver: async (input) => {
      semanticRequests.push(structuredClone(input));
      if (failWorldKnowledgeOnce && worldKnowledgeFailures++ === 0) {
        throw new WorldKnowledgeError('WORLD_KNOWLEDGE_UNAVAILABLE',
          'Production World Knowledge retrieval is unavailable.', {
            cause_code: 'WK_EMBEDDING_WORKER_EXIT'
          });
      }
      return {
        option_id: resolverOption
          ?? chooseOption(input.raw_text, input.action_set)
      };
    },
    narrator: {
      async run(input) {
        narratorRequests.push(structuredClone(input));
        return approvedNarration(input.request_id);
      }
    },
    randomSourceFactory: () => {
      const source = createSeededRandomSource('phase-3-unit');
      return {
        next() {
          rolls += 1;
          return rollValue;
        },
        snapshot: () => source.snapshot()
      };
    },
    decisionSecret: 'phase-3-unit-decision-secret',
    now: () => '2026-07-30T08:00:00.000Z'
  });
  return {
    state,
    bundleRequests,
    semanticRequests,
    narratorRequests,
    submit: ({ key, raw }) => runtime.submitTurn({
      partyId,
      input: {
        request_id: key,
        idempotency_key: key,
        raw_text: raw
      }
    }),
    commitCount: () => commits,
    rollCount: () => rolls
  };
}

function initialState({ partyId, instance, atCamp, blueWool }) {
  const camp = instance.immediate.prepared_scenes.find(
    ({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_fishing_camp'
  );
  const actorId = instance.immediate.player.instance_id;
  return {
    party_id: partyId,
    actor_id: actorId,
    party_state: { state_version: 1, turn_number: 0 },
    player_profile: instance.immediate.player.dossier,
    body_state: {
      ...instance.immediate.body.values,
      active_conditions:
        instance.immediate.body.condition_bindings.map((condition) => ({
          id: condition.state,
          condition_profile_ref: structuredClone(condition),
          status: 'active',
          state_version: 1
        }))
    },
    body_effect_history: [],
    position: atCamp ? {
      ...instance.immediate.spatial.position,
      location_ref: 'trace_ld_v1_loc_fishing_camp',
      g5_node_id: camp.node.instance_id,
      g5_anchor_id: camp.anchor.instance_id
    } : {
      ...instance.immediate.spatial.position,
      location_ref: 'trace_ld_v1_loc_wreck_shore'
    },
    clock: structuredClone(instance.immediate.timestamp),
    clock_weather_light: {
      clock: structuredClone(instance.immediate.timestamp),
      weather: {},
      light: {}
    },
    environment_snapshot: instance.immediate.environment_snapshot,
    materialization_trace: structuredClone(instance.trace),
    prepared_scenes: structuredClone(instance.immediate.prepared_scenes),
    npcs: structuredClone(instance.immediate.npcs),
    interactions: [],
    route_history: [],
    route_knowledge: [],
    sealed_selections: structuredClone(instance.sealed_selections),
    policy_pins: structuredClone(instance.policy_profile_pins),
    relevant_events: [],
    historical_events: [],
    temporal_boundary_candidates: [],
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
    },
    items: [
      ...instance.immediate.items.map((item) => ({
        item_id: item.instance_id,
        template_id: item.template_id,
        profile_id: item.profile_id,
        quantity: item.quantity,
        placement: {
          anchor_id: item.anchor_id ?? null,
          container_id: item.container_id ?? null,
          holder_character_id: item.holder_character_id,
          physical_position: item.physical_position
        },
        ownership: {
          owner_character_id: item.owner_character_id,
          controller_character_id: item.controller_character_id,
          claim_state: item.claim_state
        },
        state: structuredClone(item.state)
      })),
      ...(blueWool ? [blueWoolItem(actorId)] : [])
    ],
    knowledge: blueWool ? [{
      fact_id: 'trace_ld_v1_evidence_blue_wool',
      knowledge_state: 'known_from_committed_source',
      evidence_refs: ['trace_ld_v1_evidence_blue_wool']
    }] : [],
    opening_identity: { opening_screen_digest: 'a'.repeat(64) },
    relevant_hidden_state: {
      culprit: 'must-not-reach-llm',
      motive: 'must-not-reach-llm'
    }
  };
}

function blueWoolItem(actorId) {
  return {
    item_id: 'item:phase3:blue-wool',
    template_id: 'trace_ld_v1_item_blue_wool_fragment',
    profile_id: 'trace_ld_v1_item_blue_wool_fragment',
    quantity: 1,
    placement: {
      holder_character_id: actorId,
      physical_position: 'hands'
    },
    state: {
      evidence_ref: 'trace_ld_v1_evidence_blue_wool',
      property_state: {
        owner_ref: 'ratsha_storehouse_helper',
        holder_ref: actorId,
        controller_ref: actorId
      },
      inventory_profile_snapshot: {
        mass_grams: 10,
        carry_form: 'compact',
        external_hand_cost: 0
      },
      pickup_transition: {
        transition_template_ref:
          'trace_ld_v1_transition_blue_wool_pickup',
        source_placement_ref: 'trace_ld_v1_slot_wreck_willow_branch'
      }
    }
  };
}

function applyFactual(state, factual) {
  const consequence = factual.consequence;
  state.clock = structuredClone(factual.time_update.clock_after);
  state.clock_weather_light.clock = structuredClone(state.clock);
  if (consequence.phase3_kind === 'movement') {
    state.position = {
      ...state.position,
      location_ref: consequence.movement.destination.location_ref,
      g5_anchor_id: consequence.movement.destination.g5_anchor_id,
      g5_node_id: state.prepared_scenes.find(
        ({ location_profile_ref: ref }) =>
          ref === consequence.movement.destination.location_ref
      ).node.instance_id
    };
    state.route_history.push({
      route_ref: consequence.movement.route_ref
    });
    state.route_knowledge.push('trace_ld_v1_route_camp_to_wreck');
  } else {
    const conversation = consequence.conversation;
    state.interactions.push({
      activity_ref: conversation.activity_ref,
      npc_id: conversation.npc_id,
      statement_ref: conversation.statement_ref,
      memory_ref: conversation.memory_ref,
      journal_ref: conversation.journal_ref,
      consequence_ref: conversation.consequence_ref,
      decision_trace: structuredClone(conversation.decision.trace)
    });
    if (conversation.route_knowledge_ref) {
      state.route_knowledge.push(conversation.route_knowledge_ref);
      state.knowledge.push({
        fact_id: conversation.route_knowledge_ref,
        knowledge_state: 'known_from_committed_source',
        evidence_refs: [conversation.statement_ref]
      });
    }
  }
  state.party_state.state_version += 1;
  state.party_state.turn_number += 1;
}

function chooseOption(rawText, actionSet) {
  const normalized = rawText.toLowerCase();
  const requested = normalized.includes('троп')
    ? 'follow_path_to_fishing_camp'
    : normalized.includes('шерст') || normalized.includes('ули')
      ? 'show_clue_and_seek_eremey_cooperation'
      : 'ask_eremey_about_wreck';
  return actionSet.find(({ option_id: id }) => id === requested)?.option_id
    ?? requested;
}

function campAnchor(state) {
  return state.prepared_scenes.find(
    ({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_fishing_camp'
  ).anchor.instance_id;
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
      prose: 'Видимое состояние хода передано без новых фактов.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit', artistic_verdict: 'pass', technical_verdict: 'pass', coverage: { visible_changes: [], uncertainties: [] },
      pass: true,
      concerns: [],
      evidence: ['Только persisted visible context.']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}
