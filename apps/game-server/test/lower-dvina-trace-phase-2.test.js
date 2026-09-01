import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
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
  buildPhase2Snapshot
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-state.js';
import {
  bundle,
  bundle9,
  fixture
} from './lower-dvina-trace-phase-2-fixture.js';

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

test('inspection preserves turn-step snapshot schema after an F1 turn', () => {
  const state = inspectionSnapshotState('rus.lower_dvina_trace_turn_snapshot.v2');
  assert.equal(buildPhase2Snapshot(inspectionSnapshotInput(state)).schema,
    'rus.lower_dvina_trace_turn_snapshot.v2');
  assert.equal(buildPhase2Snapshot(inspectionSnapshotInput(
    inspectionSnapshotState('rus.lower_dvina_trace_phase_2_snapshot.v1')
  )).schema, 'rus.lower_dvina_trace_phase_2_snapshot.v1');
});

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
  const f = fixture({
    scenarioBundle: invalidBundle,
    materializationBundle: bundle
  });
  f.state.policy_pins.find(
    ({ key }) => key === 'body_environment_profiles'
  ).canonical_digest = canonicalDigest(
    invalidBundle.body_environment_profiles
  );
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
  assert.equal(f.bundleRequests[0].scenarioDefinitionRevision, 7);
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
  const visible = f.narratorInput().visible_context;
  assert.deepEqual(visible.visible_changes, [
    'На берегу лежат обломки разбитой лодки.',
    'В мокром песке видны босые следы.',
    'Рядом заметен отдельный след сапога.',
    'Слои обломков и следов различимы.',
    'Кожаная застёжка разрезана.',
    'На борту лодки заметна вмятина сбоку.',
    'Среди обломков есть следы ещё одной небольшой лодки.',
    'На ветке у места крушения найден клочок синей шерсти.',
    'От берега к рыбацкому стану ведёт заметная тропа.'
  ]);
  assert.equal(/trace_ld_v1_|visible:/u.test(visible.known_context.join(' ')), false);
  assert.equal(/след сапога|безопасн|виновник|мотив|Жданко/u.test(visible.known_context.join(' ')), false);
  assert.equal(JSON.stringify(visible.visible_changes)
    .includes('trace_ld_v1_'), false);
  assert.equal(JSON.stringify(visible.visible_changes).includes('visible:'), false);
  assert.equal(/виновник|мотив|Жданко|безопасн(?:ый|ая) путь/u
    .test(visible.visible_changes.join(' ')), false);
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

test('revision 9 success atomically picks up blue wool with exact owner-preserving inventory state', async () => {
  const f = fixture({ scenarioBundle: bundle9, rollValue: 0.99 });
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-revision9-pickup',
      idempotency_key: 'phase2-revision9-pickup',
      raw_text:
        'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    }
  });
  const clue = result.clue;
  assert.equal(clue.property_state.owner_ref, 'ratsha_storehouse_helper');
  assert.equal(clue.property_state.holder_ref, f.state.actor_id);
  assert.equal(clue.property_state.controller_ref, f.state.actor_id);
  assert.deepEqual(clue.placement, {
    holder_character_id: f.state.actor_id,
    physical_position: 'hands'
  });
  assert.equal(clue.inventory_profile.mass_grams, 10);
  assert.equal(clue.inventory_profile.carry_form, 'compact');
  assert.equal(clue.inventory_profile.external_hand_cost, 0);
  assert.deepEqual(clue.inventory_effect, {
    mass_delta_grams: 10,
    hands_used_delta: 0
  });
  assert.deepEqual(clue.pickup_transition.inventory_before, {
    total_mass_grams: 400,
    hands_used: 0,
    hands_free: 2,
    load_category: 'light'
  });
  assert.deepEqual(clue.pickup_transition.inventory_after, {
    total_mass_grams: 410,
    hands_used: 0,
    hands_free: 2,
    load_category: 'light'
  });
  assert.equal(
    clue.pickup_transition.plan_trace.previous_placement.item_id,
    clue.instance_id
  );
  assert.equal(
    clue.pickup_transition.source_placement_ref,
    'trace_ld_v1_slot_wreck_willow_branch'
  );
  assert.equal(clue.pickup_transition.clock_write, 'forbidden');
  assert.equal(
    f.state.items.filter((item) =>
      item.template_id === 'trace_ld_v1_item_blue_wool_fragment').length,
    1
  );
});

test('revision 9 failed inspection commits time and body but no blue-wool item', async () => {
  const f = fixture({ scenarioBundle: bundle9, rollValue: 0 });
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-revision9-failure',
      idempotency_key: 'phase2-revision9-failure',
      raw_text: 'Осмотреть место крушения подробно.'
    }
  });
  assert.equal(result.check.outcome.success, false);
  assert.equal(result.clue, null);
  assert.deepEqual(result.time_update.exact_elapsed.exact_minutes, {
    numerator: '15',
    denominator: '1'
  });
  assert.equal(result.body_update.proposal.exact_deltas.energy, -1);
  assert.equal(
    f.state.items.some((item) =>
      item.template_id === 'trace_ld_v1_item_blue_wool_fragment'),
    false
  );
});

test('wreck inspection does not reveal a missing road bag without prior knowledge',
  async (t) => {
    for (const current of [{ name: 'success', rollValue: 0.99 },
      { name: 'failure', rollValue: 0 }]) {
      await t.test(current.name, async () => {
        const f = fixture({ rollValue: current.rollValue });
        const result = await f.runtime.submitTurn({
          partyId: f.partyId,
          input: {
            request_id: `phase2-road-bag-${current.name}`,
            idempotency_key: `phase2-road-bag-${current.name}`,
            raw_text: 'Осмотреть место крушения подробно.'
          }
        });
        const persisted = {
          state: f.state,
          write_plan: f.lastWritePlan(),
          public_result: result,
          narrator_input: f.narratorInput()
        };
        assert.equal(
          JSON.stringify(persisted).includes('visible:road_bag_missing'),
          false
        );
      });
    }
  });

test('authored prior bag knowledge admits the missing-road-bag observation',
  async (t) => {
    for (const factId of [
      'trace_ld_v1_statement_eremey_disclosure',
      'trace_ld_v1_statement_ratsha_confession',
      'trace_ld_v1_evidence_bag_at_zhdanko'
    ]) {
      await t.test(factId, async () => {
        const f = fixture({ rollValue: 0 });
        f.state.knowledge.push({
          fact_id: factId,
          knowledge_state: 'known_from_committed_source',
          evidence_refs: []
        });
        const result = await f.runtime.submitTurn({
          partyId: f.partyId,
          input: {
            request_id: `phase2-road-bag-known-${factId}`,
            idempotency_key: `phase2-road-bag-known-${factId}`,
            raw_text: 'Осмотреть место крушения подробно.'
          }
        });
        assert.equal(result.observations.some(
          ({ fact_id: observed }) => observed === 'visible:road_bag_missing'),
        true);
        const visibleChanges = f.narratorInput().visible_context.visible_changes;
        assert.equal(visibleChanges.includes(
          'Дорожной сумки, о которой было известно, здесь нет.'), true);
        assert.equal(JSON.stringify(visibleChanges).includes(
          'visible:road_bag_missing'), false);
      });
    }
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

test('narration failure after factual commit returns its pending public result', async () => {
  const f = fixture({ narrationFails: true });
  const result = await f.runtime.submitTurn({
    partyId: f.partyId,
    input: {
      request_id: 'phase2-narration-failure',
      idempotency_key: 'phase2-narration-failure',
      raw_text:
        'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    }
  });
  assert.equal(result.turn_number, 1);
  assert.equal(result.state_version, 2);
  assert.equal(result.screen.screen_status, 'committed_presentation_pending');
  assert.equal(f.commitCount(), 1);
  assert.equal(f.rollCount(), 1);
  assert.equal(f.state.party_state.state_version, 2);
});

function inspectionSnapshotState(schema) {
  return {
    schema,
    party_id: 'party:inspection',
    party_state: {
      state_version: 2, session_state_version: 2, body_state_version: 2,
      clock_state_version: 2, turn_number: 2
    },
    body_state: { active_conditions: [] },
    body_effect_history: [],
    clock: { whole_minutes: '10', subminute_numerator: '0',
      subminute_denominator: '1' },
    clock_weather_light: {}, items: [], knowledge: []
  };
}

function inspectionSnapshotInput(state) {
  const clock = { whole_minutes: '25', subminute_numerator: '0',
    subminute_denominator: '1' };
  return {
    state, nextVersion: 3, turnNumber: 3, nextItems: [], nextKnowledge: [],
    nextBodyState: { active_conditions: [] }, changeSetId: 'change:inspection',
    inputDigest: 'input', visibleEnvelope: {
      package_id: 'visible:inspection', package_digest: 'digest'
    }, factual: {
      player_input: { request_id: 'request:inspection',
        idempotency_key: 'idem:inspection', raw_text: 'Осмотреть крушение.',
        received_at: '1230-01-01T00:00:00Z' },
      mode_resolution: { option_id: 'inspect_wreck_in_detail',
        decision_trace: { action_set_digest: 'actions' } },
      availability: { check_requests: [{}] },
      consequence: { check_result: null }, time_update: { clock_after: clock },
      body_update: { proposal: { execution_variant_id: 'inspection' } }
    }
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
