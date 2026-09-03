import assert from 'node:assert/strict';
import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedTimeUpdate,
  requireTurnStepCommitEnvelope
} from '@rus/turn';
import {
  fixture,
  loadScenarioBundle
} from './lower-dvina-trace-phase-2-fixture.js';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import {
  buildLowerDvinaTracePreparedRouteWorkingProjection
} from '../src/runtime/lower-dvina-trace-turn-step-prepared-effects.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';

const bundle13 = await loadScenarioBundle(13);

export async function routeDirectScenario({ firstEntryOnly = false,
  plannerPortrait = false, plannerPresentationOverlay = false } = {}) {
  const bootstrap = fixture({ scenarioBundle: bundle13,
    materializationBundle: bundle13, rollValue: 0 });
  await submit(bootstrap, turn('route-direct-bootstrap',
    'Осмотреть место крушения подробно.'));
  const before = stateWithCommittedBlueWool(bootstrap.state);
  if (firstEntryOnly) {
    const camp = before.prepared_scenes.find(({ location_profile_ref: ref }) =>
      ref === 'trace_ld_v1_loc_fishing_camp')
      ?? before.first_entry_preparation?.scene;
    before.prepared_scenes = before.prepared_scenes.filter(
      ({ location_profile_ref: ref }) => ref !== camp.location_profile_ref);
    before.first_entry_preparation = {
      ...(before.first_entry_preparation ?? {}),
      spatial_v3: {
        ...(before.first_entry_preparation?.spatial_v3 ?? {}),
        target: {
          ...(before.first_entry_preparation?.spatial_v3?.target ?? {}),
          status: 'prepared'
        }
      },
      scene: structuredClone(camp)
    };
  }
  const semantic = fixture({
    scenarioBundle: bundle13,
    materializationBundle: bundle13,
    committedState: before,
    rollValue: 0.99,
    ...(plannerPortrait || plannerPresentationOverlay
      ? { playerSafeStateProjector: (input) => {
      const projected = projectLowerDvinaTracePlayerSafeState(input);
      return { ...projected, player_safe_state: {
        ...projected.player_safe_state,
        ...(plannerPresentationOverlay ? { current_visible_context: {
          ...projected.player_safe_state.current_visible_context,
          known_context: [
            ...(projected.player_safe_state.current_visible_context
              ?.known_context ?? []),
            'runtime-only presentation overlay'
          ]
        } } : {}),
        ...(plannerPortrait ? { active_interlocutor: {
          entity_ref: { entity_kind: 'npc', entity_id: 'npc:visible' },
          display_label: 'Visible interlocutor',
          portrait_spec_v1: { schema: 'portrait_spec_v1' }
        } } : {})
      } };
    } } : {}),
    turnStepModel(request) {
      if (request.step_index === 1) {
        return domainPlan(request, {
          op: 'request_movement', actor_ref: request.actor.actor_id,
          movement_kind: 'local',
          target_ref: 'trace_ld_v1_loc_fishing_camp'
        }, { continuation: { remaining_intent: 'осмотреться у ворот',
          depends_on_refs: ['trace_ld_v1_loc_fishing_camp'] } });
      }
      assert.equal(request.player_safe_state.position.location_ref,
        'trace_ld_v1_loc_fishing_camp');
      return directPlan(request);
    }
  });
  const input = turn('route-direct-root',
    'Иду по тропе к рыбакам и, добравшись до стана, коротко осматриваюсь у ворот.');
  const first = await submit(semantic, input);
  const writePlan = semantic.lastWritePlan();
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state').value;
  return { semantic, input, first, before, writePlan, factual };
}

export async function routeBoundaryScenario(resolution) {
  const bootstrap = fixture({ scenarioBundle: bundle13,
    materializationBundle: bundle13, rollValue: 0 });
  await submit(bootstrap, turn(`route-boundary-${resolution}-bootstrap`,
    'Осмотреть место крушения подробно.'));
  const before = stateWithCommittedBlueWool(bootstrap.state);
  const semantic = fixture({
    scenarioBundle: bundle13,
    materializationBundle: bundle13,
    committedState: before,
    rollValue: 0.99,
    turnStepModel(request) {
      if (request.step_index === 1) {
        return domainPlan(request, {
          op: 'request_movement', actor_ref: request.actor.actor_id,
          movement_kind: 'local',
          target_ref: 'trace_ld_v1_loc_fishing_camp'
        }, { continuation: { remaining_intent: 'продолжить после перехода',
          depends_on_refs: ['trace_ld_v1_loc_fishing_camp'] } });
      }
      assert.equal(request.player_safe_state.position.location_ref,
        'trace_ld_v1_loc_fishing_camp');
      return resolution === 'domain_request'
        ? domainPlan(request, {
            op: 'request_activity', actor_ref: request.actor.actor_id,
            activity_kind: 'wait', target_refs: [], description: 'ждать'
          })
        : genericPlan(request);
    }
  });
  const input = turn(`route-boundary-${resolution}`,
    'Дойти до рыбацкого стана и продолжить другое действие.');
  await submit(semantic, input);
  const writePlan = semantic.lastWritePlan();
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state').value;
  return { semantic, input, before, writePlan, factual };
}

export function rebindAggregates(source, ledger) {
  const writePlan = structuredClone(source);
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state').value;
  const envelope = writePlan.turn_step_commit;
  const time = { ...buildTurnStepPreparedTimeUpdate(ledger) };
  for (const key of [
    'semantic_activity_elapsed', 'semantic_activity_resolutions'
  ]) {
    if (Object.hasOwn(envelope.time_update, key)) {
      time[key] = structuredClone(envelope.time_update[key]);
    }
  }
  const body = buildTurnStepPreparedBodyUpdate(ledger);
  const consequence = {
    ...structuredClone(envelope.consequence),
    prepared_effect_ledger_digest: ledger.ledger_digest
  };
  Object.assign(envelope, { consequence, time_update: time,
    body_update: body });
  Object.assign(factual, { consequence: structuredClone(consequence),
    time_update: structuredClone(time), body_update: structuredClone(body) });
  return writePlan;
}

export function bindStepTraceCopies(writePlan, traces) {
  writePlan.turn_step_commit.loop_trace.step_traces = structuredClone(traces);
  writePlan.turn_step_commit.mode_resolution.decision_trace.step_traces =
    structuredClone(traces);
  writePlan.command_trace = structuredClone(
    writePlan.turn_step_commit.mode_resolution.decision_trace);
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state').value;
  factual.mode_resolution = structuredClone(
    writePlan.turn_step_commit.mode_resolution);
}

export function assertPublicCommitEnvelope(writePlan) {
  requireTurnStepCommitEnvelope(writePlan.turn_step_commit, {
    party_id: writePlan.party_id,
    turn_id: writePlan.turn_id,
    base_state_version: writePlan.base_state_version,
    command_trace: writePlan.command_trace,
    write_targets: writePlan.write_targets
  });
}

export function changeSemanticDurationClass(value, durationClass) {
  if (Array.isArray(value)) {
    value.forEach((entry) => changeSemanticDurationClass(entry,
      durationClass));
    return;
  }
  if (value == null || typeof value !== 'object') return;
  if (value.kind === 'semantic_activity'
      || value.body_effect_context?.kind === 'semantic_activity') {
    if (Object.hasOwn(value, 'duration_class')) {
      value.duration_class = durationClass;
    }
    if (value.body_effect_context?.kind === 'semantic_activity') {
      value.body_effect_context.duration_class = durationClass;
    }
  }
  Object.values(value).forEach((entry) =>
    changeSemanticDurationClass(entry, durationClass));
}

export function rawEffect(slice, {
  stepIndex = slice.step_index,
  bodyStateBefore,
  bodyUpdate = slice.body_update,
  timeUpdate = slice.time_update,
  projectionBefore,
  projectionAfter
}) {
  return {
    effect: {
      step_index: stepIndex,
      effect_kind: slice.effect_kind,
      owner_ref: slice.owner_ref,
      operation_ref: slice.operation_ref,
      availability: structuredClone(slice.availability),
      consequence: structuredClone(slice.consequence),
      time_update: structuredClone(timeUpdate),
      body_update: structuredClone(bodyUpdate),
      body_state_before: structuredClone(bodyStateBefore)
    },
    working_projection_before: structuredClone(projectionBefore),
    working_projection_after: structuredClone(projectionAfter)
  };
}

export function movedTime(source, before, after) {
  return { ...structuredClone(source), clock_before: at(before),
    clock_after: at(after) };
}

export function preparedProjections(scenario, routeSlice) {
  const before = routeBeforeProjection(scenario);
  const afterRoute = buildLowerDvinaTracePreparedRouteWorkingProjection({
    projection: before,
    movement: routeSlice.consequence.movement,
    committedState: scenario.before,
    clockAfter: routeSlice.time_update.clock_after
  });
  const direct = scenario.factual.time_update.prepared_effect_ledger.slices[1];
  return {
    before,
    afterRoute,
    afterDirect: direct == null ? null : advanceProjectionClock(
      afterRoute, direct.time_update.clock_after)
  };
}

export function routeBeforeProjection(scenario) {
  return structuredClone(
    scenario.writePlan.turn_step_commit.loop_trace.step_traces[0]
      .plan_request.player_safe_state);
}

export function mutateCommittedConsequence(writePlan, mutate) {
  mutate(writePlan.turn_step_commit.consequence);
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state').value;
  factual.consequence = structuredClone(writePlan.turn_step_commit.consequence);
}

export function shiftedClock(clock, minutes) {
  return { ...structuredClone(clock),
    whole_minutes: String(Number(clock.whole_minutes) + minutes) };
}

function advanceProjectionClock(projection, clock) {
  return {
    ...structuredClone(projection),
    clock: structuredClone(clock),
    clock_weather_light: {
      ...structuredClone(projection.clock_weather_light ?? {}),
      clock: structuredClone(clock)
    }
  };
}

export async function commit(writePlan, scenario, plans = []) {
  return commitLowerDvinaTracePhase2({
    ...scenario.semantic.lastCommitInput(),
    writePlan,
    loadState: async (_partyId, options) => {
      scenario.commitLoadOptions = structuredClone(options);
      return structuredClone(scenario.before);
    },
    committer: { async commit({ plan }) {
      plans.push(plan);
      return { ok: true, replay: false, change_set_id: plan.change_set_id };
    } }
  });
}

export function assertBodyCommitted(actual, proposed) {
  assert.deepEqual(['health', 'satiety', 'energy'].map(
    (metric) => actual[metric]), ['health', 'satiety', 'energy'].map(
    (metric) => proposed[metric]));
  const proposedById = new Map(proposed.active_conditions.map(
    (condition) => [condition.storage_condition_id, condition]));
  for (const condition of actual.active_conditions) {
    const expected = proposedById.get(condition.storage_condition_id);
    assert.deepEqual({ id: condition.id, outcome: condition.condition_outcome,
      profile: condition.condition_profile_ref },
    { id: expected.id, outcome: expected.condition_outcome,
      profile: expected.condition_profile_ref });
    assert.equal(condition.state_version,
      expected.state_version + (expected.condition_outcome ? 1 : 0));
  }
}

function domainPlan(request, operation, overrides = {}) {
  return plan(request, {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], reason_code: 'delegate_existing_owner',
    ...overrides
  });
}

function directPlan(request) {
  return plan(request, { reason_code: 'complete_at_destination' });
}

function genericPlan(request) {
  const outcome = {
    goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null
  };
  return plan(request, {
    resolution: 'generic_check',
    goal_result: 'pending',
    check: {
      purpose: 'проверить местность',
      attribute_ref: request.actor.actor_id,
      skill_ref: null,
      difficulty_id: 'ordinary',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, outcome]))
    }
  });
}

function plan(request, overrides) {
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'test', reason: 'production regression', ...overrides
  };
}

function stateWithCommittedBlueWool(source) {
  const state = structuredClone(source);
  const actorId = state.actor_id;
  state.items.push({
    item_id: 'item:m1-route-direct:blue-wool',
    template_id: 'trace_ld_v1_item_blue_wool_fragment',
    profile_id: 'trace_ld_v1_item_blue_wool_fragment', quantity: 1,
    placement: { anchor_id: null, container_id: null,
      holder_character_id: actorId, physical_position: 'hands' },
    ownership: { owner_character_id: null,
      controller_character_id: actorId,
      claim_state: 'owner_preserved_evidence_held' },
    state: { evidence_ref: 'trace_ld_v1_evidence_blue_wool',
      property_state: { owner_ref: 'ratsha_storehouse_helper',
        holder_ref: actorId, controller_ref: actorId },
      inventory_profile_snapshot: { mass_grams: 10,
        carry_form: 'compact', external_hand_cost: 0 },
      pickup_transition: { transition_template_ref:
          'trace_ld_v1_transition_blue_wool_pickup',
        source_placement_ref: 'trace_ld_v1_slot_wreck_willow_branch' } }
  });
  state.knowledge.push({ fact_id: 'trace_ld_v1_evidence_blue_wool',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: ['trace_ld_v1_evidence_blue_wool'] });
  return state;
}

export function submit(f, input) {
  return f.runtime.submitTurn({ partyId: f.partyId, input });
}

function turn(key, rawText) {
  return { request_id: key, idempotency_key: key, raw_text: rawText };
}

function at(minutes) {
  return { whole_minutes: String(minutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}

export function minutesBetween(before, after) {
  return Number(after.whole_minutes) - Number(before.whole_minutes);
}
