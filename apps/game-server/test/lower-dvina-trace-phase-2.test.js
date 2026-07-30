import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
import {
  createLowerDvinaTracePhase2Runtime
} from '../src/runtime/lower-dvina-trace-phase-2.js';
import {
  loadLowerDvinaTraceMaterializationBundle,
  resolveLowerDvinaTraceStartTimestamp
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import {
  loadLowerDvinaTracePhase2Bundle
} from '../src/internal/lower-dvina-trace-phase-2-bundle.js';
import {
  loadTracePhase2TemporalSourceProof
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import {
  assertPhase2CurrentStateVersion
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit-admission.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../../../test/fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';

const bundle = await loadLowerDvinaTraceMaterializationBundle();

test('Phase 2 execution package is immutable, exact and excludes Phase 3', async () => {
  const phase2 = await loadLowerDvinaTracePhase2Bundle();
  assert.equal(phase2.manifest.scenario_definition_revision, 7);
  assert.equal(phase2.manifest.phase_3_content, 'forbidden');
  assert.deepEqual(
    phase2.binding.body_application_variants.map(
      ({ variant_id: id }) => id
    ),
    ['initial_cold_exposure', 'repeated_mild_shivering']
  );

  const rootDir = await mkdtemp(join(tmpdir(), 'trace-phase2-bundle-'));
  await cp(resolve('data'), join(rootDir, 'data'), { recursive: true });
  const bindingPath = join(
    rootDir,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-2',
    'wreck-inspection-execution-binding.json'
  );
  const mutated = JSON.parse(await readFile(bindingPath, 'utf8'));
  mutated.body_application_variants[1].exact_deltas.energy = -2;
  await writeFile(bindingPath, `${JSON.stringify(mutated, null, 2)}\n`);
  await assert.rejects(
    () => loadLowerDvinaTracePhase2Bundle({ rootDir }),
    { code: 'TRACE_PHASE_2_BUNDLE_ROOT_MISMATCH' }
  );
});

function phase1AInstance(partyId) {
  return materializeLowerDvinaTracePartyInstance({
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 7,
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
}

function fixture({
  semantic = 'resolved',
  narrationFails = false,
  scenarioBundle = bundle
} = {}) {
  const partyId = 'party:trace-phase-2';
  const instance = phase1AInstance(partyId);
  const state = {
    party_id: partyId,
    actor_id: instance.immediate.player.instance_id,
    party_state: {
      state_version: 1,
      turn_number: 0
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
    materialization_trace: structuredClone(instance.trace),
    sealed_selections: instance.sealed_selections,
    policy_pins: structuredClone(instance.policy_profile_pins),
    relevant_events: [],
    historical_events: [],
    items: instance.immediate.items.map((item) => ({
      item_id: item.instance_id,
      template_id: item.template_id
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
  };
  if (scenarioBundle !== bundle) {
    const bodyPin = state.policy_pins.find(
      (pin) => pin.key === 'body_environment_profiles'
    );
    bodyPin.canonical_digest = canonicalDigest(
      scenarioBundle.body_environment_profiles
    );
  }
  const replays = new Map();
  const events = [];
  let committedVisible = null;
  let lastWritePlan = null;
  let semanticInput = null;
  let rollCount = 0;
  let commitCount = 0;
  let narratorInput = null;
  const repository = {
    async loadPhase2State() {
      events.push('load_state');
      return structuredClone(state);
    },
    async loadPhase2Replay({ idempotencyKey }) {
      return structuredClone(replays.get(idempotencyKey) ?? null);
    },
    async commitPhase2Turn({ writePlan, inputDigest }) {
      events.push('commit');
      commitCount += 1;
      lastWritePlan = structuredClone(writePlan);
      const factual = writePlan.write_targets.find(
        ({ target }) => target === 'party_state'
      ).value;
      committedVisible = writePlan.write_targets.find(
        ({ target }) => target === 'party_visible_context_package'
      ).value;
      const clue = factual.consequence.clue_materialization;
      if (clue && !state.items.some(
        (item) => item.template_id === clue.template_id
      )) {
        state.items.push({
          item_id: clue.instance_id,
          template_id: clue.template_id,
          placement: clue.placement
        });
      }
      state.clock = factual.time_update.clock_after;
      state.clock_weather_light.clock = state.clock;
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
          result.checkpoint.stages.consequence.clue_materialization
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
    bundleLoader: async () => scenarioBundle,
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
    randomSourceFactory: () => {
      const source = createSeededRandomSource(
        'lower-dvina-trace-phase-2-acceptance'
      );
      return {
        next() {
          rollCount += 1;
          return source.next();
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
    commitCount: () => commitCount,
    events,
    narratorInput: () => narratorInput,
    lastWritePlan: () => lastWritePlan,
    partyId,
    repository,
    rollCount: () => rollCount,
    runtime,
    semanticInput: () => semanticInput,
    state
  };
}

test('ranges-only body effect fails closed before resolver, roll or commit', async () => {
  const invalidBundle = structuredClone(bundle);
  const effect = invalidBundle.body_environment_profiles.effect_profiles.find(
    ({ effect_profile_id: id }) =>
      id === 'trace_ld_v1_body_wreck_inspection_15m'
  );
  delete effect.exact_deltas;
  effect.delta_bounds = {
    health: [-2, 0],
    satiety: [-1, 0],
    energy: [-3, -1]
  };
  const f = fixture({ scenarioBundle: invalidBundle });
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-body-policy-gap',
        idempotency_key: 'phase2-body-policy-gap',
        raw_text:
          'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
      }
    }),
    { code: 'TRACE_PHASE_2_BODY_EFFECT_POLICY_GAP' }
  );
  assert.equal(f.semanticInput(), null);
  assert.equal(f.rollCount(), 0);
  assert.equal(f.commitCount(), 0);
});

test('committed RNG version mismatch fails before resolver, roll or commit', async () => {
  const f = fixture();
  f.state.materialization_trace.rng_version = 'invented_rng_v9';
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-rng-pin-gap',
        idempotency_key: 'phase2-rng-pin-gap',
        raw_text:
          'Хочу внимательно изучить повреждения судна и всё на берегу.'
      }
    }),
    { code: 'TRACE_PHASE_2_RNG_PIN_MISMATCH' }
  );
  assert.equal(f.semanticInput(), null);
  assert.equal(f.rollCount(), 0);
  assert.equal(f.commitCount(), 0);
});

test('exact fast path commits one canonical inspection, check, elapsed, body effect and clue', async () => {
  const f = fixture();
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-exact',
      idempotency_key: 'phase2-exact',
      raw_text:
        'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    }
  });
  assert.equal(result.option_id, 'inspect_wreck_in_detail');
  assert.equal(result.check.difficulty, 12);
  assert.equal(result.check.modifiers.attribute, 1);
  assert.equal(result.check.modifiers.skill, 2);
  assert.equal(result.check.modifiers.state, -1);
  assert.equal(result.check.outcome.success, true);
  assert.equal(result.time_update.clock_before.whole_minutes, '333060');
  assert.equal(result.time_update.clock_after.whole_minutes, '333075');
  assert.deepEqual(
    [
      result.body_update.state_after.health,
      result.body_update.state_after.satiety,
      result.body_update.state_after.energy
    ],
    [80, 60, 39]
  );
  assert.deepEqual(
    result.body_update.state_after.active_conditions.map(
      (condition) => condition.id
    ),
    [
      'wet',
      'mild_shivering',
      'headache',
      'shoulder_bruise'
    ]
  );
  assert.deepEqual(result.body_update.proposal.exact_deltas, {
    health: 0,
    satiety: 0,
    energy: -1
  });
  assert.equal(result.body_update.proposal.rng_consumption, 'forbidden');
  assert.equal(result.clue.template_id, 'trace_ld_v1_item_blue_wool_fragment');
  assert.equal(f.semanticInput(), null);
  assert.equal(f.rollCount(), 1);
  assert.equal(f.commitCount(), 1);
  assert.deepEqual(f.events, [
    'load_state',
    'load_state',
    'commit',
    'read_committed_visible',
    'persist_screen'
  ]);
});

test('free paraphrase resolves through a player-safe closed set to the same exact option', async () => {
  const f = fixture();
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-semantic',
      idempotency_key: 'phase2-semantic',
      raw_text:
        'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
    }
  });
  assert.equal(result.option_id, 'inspect_wreck_in_detail');
  assert.equal(f.semanticInput().action_set.length, 1);
  assert.equal(
    f.semanticInput().action_set[0].option_id,
    'inspect_wreck_in_detail'
  );
  assert.equal(
    JSON.stringify(f.semanticInput()).includes('must-not-reach-llm'),
    false
  );
  assert.equal(
    JSON.stringify(f.narratorInput()).includes('must-not-reach-llm'),
    false
  );
});

test('unknown intent creates no roll, elapsed, clue or factual commit', async () => {
  const f = fixture({ semantic: 'unknown' });
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-unknown',
        idempotency_key: 'phase2-unknown',
        raw_text: 'Спеть песню.'
      }
    }),
    { code: 'TURN_SEMANTIC_INTENT_UNKNOWN' }
  );
  assert.equal(f.rollCount(), 0);
  assert.equal(f.commitCount(), 0);
  assert.equal(f.state.party_state.state_version, 1);
  assert.equal(f.state.items.length, 1);
});

test('an earlier temporal boundary blocks the inspection before roll or mutation', async () => {
  const f = fixture();
  f.state.temporal_boundary_candidates = [
    temporalBoundary('phase2-external-boundary', '333070')
  ];
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-boundary',
        idempotency_key: 'phase2-boundary',
        raw_text:
          'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
      }
    }),
    { code: 'TURN_AVAILABLE_ACTION_SET_EMPTY' }
  );
  assert.equal(f.rollCount(), 0);
  assert.equal(f.commitCount(), 0);
});

test('pending temporal sources fail closed instead of being erased', async () => {
  await assert.rejects(
    () => loadTracePhase2TemporalSourceProof({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            pending_event_count: 1,
            active_schedule_count: 0
          }]
        };
      }
    }, 'party:trace-phase-2'),
    { code: 'TRACE_PHASE_2_TEMPORAL_BINDING_GAP' }
  );
  await assert.rejects(
    () => loadTracePhase2TemporalSourceProof({
      async query() {
        return {
          rowCount: 1,
          rows: [{
            pending_event_count: 0,
            active_schedule_count: 1
          }]
        };
      }
    }, 'party:trace-phase-2'),
    { code: 'TRACE_PHASE_2_TEMPORAL_BINDING_GAP' }
  );
});

test('commit admission requires exact plan and decision state versions', () => {
  const input = {
    writePlan: { base_state_version: 4 },
    factual: {
      mode_resolution: {
        decision_trace: { state_version: 4 }
      }
    },
    state: { party_state: { state_version: 4 } }
  };
  assert.doesNotThrow(() => assertPhase2CurrentStateVersion(input));
  assert.throws(
    () => assertPhase2CurrentStateVersion({
      ...input,
      writePlan: { base_state_version: 3 }
    }),
    { code: 'TRACE_PHASE_2_STALE_STATE' }
  );
  assert.throws(
    () => assertPhase2CurrentStateVersion({
      ...input,
      factual: {
        mode_resolution: {
          decision_trace: { state_version: 3 }
        }
      }
    }),
    { code: 'TRACE_PHASE_2_STALE_STATE' }
  );
  assert.throws(
    () => assertPhase2CurrentStateVersion({
      ...input,
      writePlan: { base_state_version: null }
    }),
    { code: 'TRACE_PHASE_2_STALE_STATE' }
  );
});

test('ambiguous intent creates no roll, elapsed, clue or factual commit', async () => {
  const f = fixture({ semantic: 'ambiguous' });
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-ambiguous',
        idempotency_key: 'phase2-ambiguous',
        raw_text: 'Сделать что-нибудь с этим местом.'
      }
    }),
    { code: 'TURN_SEMANTIC_INTENT_UNKNOWN' }
  );
  assert.equal(f.rollCount(), 0);
  assert.equal(f.commitCount(), 0);
  assert.equal(f.state.party_state.state_version, 1);
  assert.equal(f.state.items.length, 1);
});

test('exact replay does not rerun resolver, roll, time, body or clue materialization', async () => {
  const f = fixture();
  const input = {
    request_id: 'phase2-replay',
    idempotency_key: 'phase2-replay',
    raw_text:
      'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
  };
  const first = await f.runtime.submitTurn({ partyId: f.partyId, input });
  const replayed = await f.runtime.submitTurn({ partyId: f.partyId, input });
  assert.deepEqual(replayed, first);
  assert.equal(f.rollCount(), 1);
  assert.equal(f.commitCount(), 1);
  assert.equal(
    f.state.items.filter(
      (item) => item.template_id === 'trace_ld_v1_item_blue_wool_fragment'
    ).length,
    1
  );
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: { ...input, raw_text: 'Другой ввод.' }
    }),
    { code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT' }
  );
});

test('new repeated inspection follows the pinned retry policy without duplicating the clue', async () => {
  const f = fixture();
  const rawText =
    'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.';
  const first = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-repeat-1',
      idempotency_key: 'phase2-repeat-1',
      raw_text: rawText
    }
  });
  const repeated = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-repeat-2',
      idempotency_key: 'phase2-repeat-2',
      raw_text: rawText
    }
  });
  assert.equal(first.clue.template_id, 'trace_ld_v1_item_blue_wool_fragment');
  assert.equal(repeated.clue, null);
  assert.notEqual(
    first.body_update.proposal.activity_attempt_id,
    repeated.body_update.proposal.activity_attempt_id
  );
  assert.equal(
    first.body_update.proposal.execution_variant_id,
    'initial_cold_exposure'
  );
  assert.equal(
    repeated.body_update.proposal.execution_variant_id,
    'repeated_mild_shivering'
  );
  assert.deepEqual(repeated.body_update.proposal.exact_deltas, {
    health: 0,
    satiety: 0,
    energy: -1
  });
  assert.deepEqual(
    repeated.body_update.proposal.condition_transitions,
    [{
      condition_profile_ref: 'trace_ld_v1_condition_wet_clothing',
      from: 'wet',
      to: 'wet',
      outcome: 'persists'
    }, {
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: 'mild_shivering',
      to: 'mild_shivering',
      outcome: 'persists'
    }]
  );
  assert.equal(repeated.time_update.clock_after.whole_minutes, '333090');
  assert.equal(repeated.body_update.state_after.energy, 38);
  assert.equal(
    repeated.body_update.state_after.active_conditions.find(
      (condition) => condition.id === 'mild_shivering'
    ).id,
    'mild_shivering'
  );
  assert.deepEqual(repeated.observations, []);
  assert.deepEqual(repeated.evidence, []);
  assert.equal(
    f.lastWritePlan().write_targets.find(
      ({ target }) => target === 'party_state'
    ).value.availability.check_requests[0].retry_policy,
    'reuse_committed_roll_for_same_activity_attempt_id');
  assert.equal(f.rollCount(), 2);
  assert.equal(f.commitCount(), 2);
  assert.equal(f.state.body_effect_history.length, 2);
  assert.equal(
    f.state.items.filter(
      (item) => item.template_id === 'trace_ld_v1_item_blue_wool_fragment'
    ).length,
    1
  );
});

test('narration failure happens after factual commit and cannot roll it back', async () => {
  const f = fixture({ narrationFails: true });
  await assert.rejects(
    () => f.runtime.submitTurn({
      partyId: f.partyId,
      input: {
        request_id: 'phase2-narration-failure',
        idempotency_key: 'phase2-narration-failure',
        raw_text:
          'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
      }
    }),
    /narration_flow_result invalid/u
  );
  assert.equal(f.commitCount(), 1);
  assert.equal(f.rollCount(), 1);
  assert.equal(f.state.party_state.state_version, 2);
});

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

function temporalBoundary(id, wholeMinutes) {
  const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
  const versioned = (entity_kind, entity_id) => ({
    entity_ref: ref(entity_kind, entity_id),
    authoring_version: 'v1'
  });
  return {
    boundary_id: id,
    boundary_kind: 'exact_timer',
    scheduled_at: {
      whole_minutes: wholeMinutes,
      subminute_numerator: '0',
      subminute_denominator: '1'
    },
    source_ref: ref('party_event', id),
    primary_subject_ref: ref('actor', 'mikula'),
    subject_refs: [],
    scope_ref: ref('party', 'party:trace-phase-2'),
    rule_ref: versioned('action_contract', 'external-boundary'),
    policy_ref: versioned('activity_contract', 'external-boundary'),
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'execution_outcome',
    interrupt_effect: 'interaction',
    visibility_policy_ref:
      versioned('visibility_modifier', 'external-boundary'),
    idempotency_key: `boundary:${id}`,
    causal_parent_refs: []
  };
}
