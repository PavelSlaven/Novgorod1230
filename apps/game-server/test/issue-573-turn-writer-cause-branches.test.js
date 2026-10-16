import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { projectPerceivedPeopleAbsence, projectDirectSeedChanges } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';

const absenceFact = 'В поле зрения никого нет.';
const goal = 'поздороваться с человеком';
const groundedAttempt = 'Здороваюсь с человеком.';
const reason = 'Недоказанная диагностическая причина.';
const reasonCode = 'unverified_target_reason';

test('a completed activity with a discovery authority gap does not confirm a finding result', async () => {
  const { visible, gaps } = await project({ scene: state({ visibleNpc: [{
    entity_ref: { entity_kind: 'npc', entity_id: 'person-1' },
    display_label: 'человек', recognition: 'unrecognized'
  }] }), seeds: { turn_step_1: { kind: 'semantic_activity', duration_minutes: 1,
    discovery_kind: 'search', discovery_result: {
      resolution: 'authority_required', query: 'Найти верёвку.' } } },
  timeUpdate: { semantic_activity_resolutions: [{ execution: { status: 'completed' } }] } });
  assert.deepEqual(visible.visible_changes, []);
  assert.deepEqual(gaps, [gap()]);
});

function visibleContext({ visibleNpc = [] } = {}) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Двор',
    visible_changes: [],
    sensory_details: [],
    visible_npc: structuredClone(visibleNpc),
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
}

function state({ visibleNpc = [], fresh = true, filtersEntities = true,
  missingSpatialContext = false, visibleChanges = [], partyStateVersion = 1 } = {}) {
  const context = visibleContext({ visibleNpc });
  context.visible_changes = [...visibleChanges];
  return {
    actor_id: 'player',
    position: { location_ref: 'yard', g5_anchor_id: 'yard-anchor' },
    items: [],
    npcs: [],
    current_visible_context: structuredClone(context),
    ...(missingSpatialContext ? {} : {
      current_spatial_context: structuredClone(context)
    }),
    current_spatial_context_is_fresh: fresh,
    current_spatial_context_filters_entities: filtersEntities,
    party_state: { state_version: partyStateVersion },
    location_profiles: [{ location_profile_id: 'yard', display_name: 'Двор' }]
  };
}

function plan({ adaptation = 'literal', goalResult = 'not_achieved',
  directResultKind = null, operations = [], playerGoal = goal,
  attempted = groundedAttempt } = {}) {
  return {
    resolution: 'direct',
    goal_result: goalResult,
    operations,
    check: null,
    direct_result_kind: directResultKind,
    interpretation: {
      player_goal: playerGoal,
      grounded_attempt: attempted,
      adaptation
    },
    ...(directResultKind === 'player_utterance' ? {
      utterance: { utterance_text: 'Здороваюсь с человеком.' }
    } : {}),
    reason,
    reason_code: reasonCode
  };
}

function step(approvedPlan, { applied = true, stepIndex = 1 } = {}) {
  return { step_index: stepIndex, applied, approved_plan: approvedPlan };
}

function projector(recordProjectionGap) {
  return createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { project: async (input) =>
      structuredClone(input.retrieved_state.current_visible_context) },
    recordProjectionGap
  });
}

async function project({ scene = state(), traces = [step(plan())], seeds = {},
  timeUpdate = {}, recordGap = null } = {}) {
  const gaps = [];
  const visible = await projector(recordGap ?? ((event) => gaps.push(event))).project({
    retrieved_state: scene,
    consequence: { status: 'resolved', visible_seed: seeds },
    time_update: timeUpdate,
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: traces } }
  });
  return { visible, gaps };
}

function gap(stepIndex = 1) {
  return {
    event: 'turn_step_not_achieved_projection_gap',
    code: 'failure_cause_not_grounded',
    step_index: stepIndex,
    source: 'turn_step_visible_projection'
  };
}

test('absence fact requires a complete, fresh, filtered perception with no visible people', () => {
  const complete = visibleContext();
  assert.equal(projectPerceivedPeopleAbsence({
    currentVisibleContext: complete,
    currentSpatialContextIsFresh: true,
    currentSpatialContextFiltersEntities: true
  }), absenceFact);

  for (const invalid of [
    { currentVisibleContext: null, currentSpatialContextIsFresh: true,
      currentSpatialContextFiltersEntities: true },
    { currentVisibleContext: { ...complete, visible_npc: undefined },
      currentSpatialContextIsFresh: true,
      currentSpatialContextFiltersEntities: true },
    { currentVisibleContext: { ...complete, sensory_details: undefined },
      currentSpatialContextIsFresh: true,
      currentSpatialContextFiltersEntities: true },
    { currentVisibleContext: complete, currentSpatialContextIsFresh: false,
      currentSpatialContextFiltersEntities: true },
    { currentVisibleContext: complete, currentSpatialContextIsFresh: true,
      currentSpatialContextFiltersEntities: false },
    { currentVisibleContext: visibleContext({ visibleNpc: [{
      entity_ref: { entity_kind: 'npc', entity_id: 'person-1' },
      display_label: 'человек', recognition: 'unrecognized'
    }] }), currentSpatialContextIsFresh: true,
    currentSpatialContextFiltersEntities: true }
  ]) {
    assert.equal(projectPerceivedPeopleAbsence(invalid), null);
  }
});

test('applied literal failure projects local absence and records only a private typed gap', async () => {
  const { visible, gaps } = await project();

  assert.ok(visible.visible_changes.includes(absenceFact));
  assert.deepEqual(gaps, [gap()]);
  const writerInput = JSON.stringify(visible);
  assert.doesNotMatch(writerInput, /Цель .* не достигнута/u);
  assert.doesNotMatch(writerInput, /Здороваюсь с человеком\.|поздороваться с человеком/u);
  assert.doesNotMatch(writerInput, new RegExp(`${reason}|${reasonCode}`, 'u'));
  assert.doesNotMatch(writerInput, /turn_step_not_achieved_projection_gap|failure_cause_not_grounded/u);
});

test('stale, missing, unfiltered, or nonempty perception yields no absence fact and a gap', async () => {
  const cases = [
    ['stale', state({ fresh: false })],
    ['missing', state({ fresh: true, missingSpatialContext: true })],
    ['unfiltered', state({ filtersEntities: false })],
    ['visible person', state({ visibleNpc: [{
      entity_ref: { entity_kind: 'npc', entity_id: 'person-1' },
      display_label: 'человек', recognition: 'unrecognized'
    }] })]
  ];

  for (const [name, scene] of cases) {
    const { visible, gaps } = await project({ scene });
    assert.equal(visible.visible_changes.includes(absenceFact), false, name);
    assert.deepEqual(gaps, [gap()], name);
    assert.doesNotMatch(JSON.stringify(visible), /Цель .* не достигнута/u, name);
  }
});

test('reality-limited, make-believe and canonicalized failures do not turn metadata into causes', async () => {
  for (const [name, adaptation, code] of [
    ['reality-limited', 'reality_limited', 'reality_limited_achieved_noop'],
    ['make-believe', 'make_believe', 'imaginary_target_absent'],
    ['canonicalized', 'reality_limited', 'reality_limited_achieved_noop']
  ]) {
    const { visible, gaps } = await project({ traces: [step({
      ...plan({ adaptation }), reason_code: code
    })] });
    assert.ok(visible.visible_changes.includes(absenceFact), name);
    assert.deepEqual(gaps, [gap()], name);
    const writerInput = JSON.stringify(visible);
    assert.doesNotMatch(writerInput, /Цель .* не достигнута/u, name);
    assert.doesNotMatch(writerInput, new RegExp(`${reason}|${code}`, 'u'), name);
  }
});

test('unapplied and achieved direct plans produce neither failed facts nor projection gaps', async () => {
  for (const trace of [
    step(plan(), { applied: false }),
    step(plan({ goalResult: 'achieved' }))
  ]) {
    const { visible, gaps } = await project({ traces: [trace] });
    assert.deepEqual(visible.visible_changes, []);
    assert.deepEqual(gaps, []);
    assert.doesNotMatch(JSON.stringify(visible), /Цель .* не достигнута|Здороваюсь с человеком/u);
  }
});

test('confirmed movement limits and preceding speech survive without an invented cause', async () => {
  for (const [blockedReason, expectedFact] of [
    ['hands_full', 'Герой не смог взять кусок верёвки: руки заняты.'],
    ['load_limit', 'Герой не смог взять кусок верёвки: ноша слишком тяжела.']
  ]) {
    const seed = {
      turn_step_speech: { kind: 'semantic_activity', duration_minutes: 1 },
      turn_step_move: { change: 'move_blocked', reason: blockedReason,
        entity_ref: 'item:rope', display_label: 'кусок верёвки' }
    };
    const { visible, gaps } = await project({ seeds: seed, traces: [
      step(plan({ goalResult: 'achieved', directResultKind: 'player_utterance' }),
        { stepIndex: 1 }),
      step(plan({ playerGoal: 'взять верёвку', attempted: 'Тянусь за верёвкой.' }),
        { stepIndex: 2 })
    ], timeUpdate: { prepared_effect_ledger: { slices: [
      { step_index: 1, consequence: { visible_seed: {
        turn_step_speech: seed.turn_step_speech
      } } },
      { step_index: 2, consequence: { visible_seed: {
        turn_step_move: seed.turn_step_move
      } } }
    ] } } });

    assert.ok(visible.visible_changes.includes('Герой произнёс: «Здороваюсь с человеком.»'),
      blockedReason);
    assert.ok(visible.visible_changes.includes(expectedFact), blockedReason);
    assert.deepEqual(gaps, [], blockedReason);
    const writerInput = JSON.stringify(visible);
    assert.doesNotMatch(writerInput, /Цель .* не достигнута|Тянусь за верёвкой/u,
      blockedReason);
  }
});

test('a failing private gap sink cannot alter projected perception facts', async () => {
  const { visible, gaps } = await project({ recordGap() {
    throw new Error('private diagnostic sink failed');
  } });

  assert.ok(visible.visible_changes.includes(absenceFact));
  assert.deepEqual(gaps, []);
  assert.doesNotMatch(JSON.stringify(visible), /Цель .* не достигнута/u);
});

test('failed semantic activity keeps completed owner facts and drops an unconfirmed generic search', async () => {
  const completedSearch = 'Поиск завершён.';
  const semanticSeed = { kind: 'semantic_activity', duration_minutes: 15,
    discovery_kind: 'search' };
  const timeUpdate = { semantic_activity_resolutions: [{
    execution: { status: 'completed' }
  }] };
  const failedTrace = [step(plan({ attempted: 'Ищу нужную вещь.' }))];
  const complete = await project({
    scene: state({ visibleChanges: [completedSearch], partyStateVersion: 0 }),
    traces: failedTrace,
    seeds: { completed_steps: [], turn_step_1: semanticSeed },
    timeUpdate
  });
  assert.ok(complete.visible.visible_changes.includes(completedSearch));
  assert.ok(complete.visible.visible_changes.includes(absenceFact));
  assert.deepEqual(complete.gaps, [gap()]);

  const ownerFact = 'Доска треснула.';
  const stale = await project({
    scene: state({ fresh: false, visibleChanges: [completedSearch],
      partyStateVersion: 0 }),
    traces: failedTrace,
    seeds: { completed_steps: [], turn_step_1: semanticSeed,
      turn_step_2: { change: 'physical_change',
        physical_description: ownerFact } },
    timeUpdate
  });
  assert.ok(stale.visible.visible_changes.includes(completedSearch));
  assert.equal(stale.visible.visible_changes.includes(absenceFact), false);
  assert.ok(stale.visible.visible_changes.includes(ownerFact));
  assert.deepEqual(stale.gaps, [gap()]);

  const unconfirmed = await project({
    scene: state({ visibleChanges: [completedSearch], partyStateVersion: 0 }),
    traces: failedTrace,
    seeds: { completed_steps: [], turn_step_1: semanticSeed }
  });
  assert.equal(unconfirmed.visible.visible_changes.includes(completedSearch), false);
  assert.ok(unconfirmed.visible.visible_changes.includes(absenceFact));
  assert.deepEqual(unconfirmed.gaps, [gap()]);
  assert.doesNotMatch(JSON.stringify(unconfirmed.visible), /Ищу нужную вещь\./u);
});

test('failed semantic activity does not project grounded_attempt as a confirmed fact', () => {
  const changes = projectDirectSeedChanges({
    input: {
      consequence: { visible_seed: { turn_step_1: {
        kind: 'semantic_activity', duration_minutes: 1
      } } },
      time_update: { semantic_activity_resolutions: [{
        execution: { status: 'completed' }
      }] }
    },
    directSeedKeys: ['turn_step_1'],
    appliedPlan: plan()
  });

  assert.deepEqual(changes, []);
  assert.equal(JSON.stringify(changes).includes(groundedAttempt), false);
});
