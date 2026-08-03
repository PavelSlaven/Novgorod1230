import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop } from '@rus/turn';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

test('body state evolves across direct events and the following activity',
  async () => {
    const seen = [];
    const body = initialBody();
    const ports = createLowerDvinaTraceTurnStepRuntimePorts({
      workingProjectionAuthority:
        createLowerDvinaTracePlayerSafeWorkingProjectionAuthority(),
      bodyEventOwner: {
        resolve({ event, actor }) {
          const before = actor.body.health;
          seen.push(`body:${before}`);
          return bodyResult(event, before - 5);
        }
      },
      semanticActivityOwner: {
        resolve({ activity, actor }) {
          seen.push(`activity:${actor.body.health}`);
          return {
            profile_ref: 'approved_activity:moment_none',
            profile_pin: pin(), duration_minutes: 1,
            duration_class: activity.duration_class, effort: activity.effort,
            body_effect_ref: null,
            body_effect_profile_ref: 'approved_body_effect:none',
            exact_deltas: { health: 0, satiety: 0, energy: 0 },
            body_state_after: structuredClone(actor.body)
          };
        }
      }
    });
    const first = event('impact', 'первый удар');
    const second = event('strain', 'второе происшествие');
    const result = await runTurnStepLoop({
      requestId: 'request:evolving-body',
      rootTurnId: 'turn:party:1',
      committedStateVersion: 7,
      rootPlayerAction: 'пережить два удара',
      actor: { actor_id: 'mikula', body },
      initialWorkingProjection: initialWorkingProjection()
    }, {
      executionRegistry: ports.executionRegistry,
      preparedEffectContext: {
        current_clock: clock(0),
        current_body_state: body
      },
      turnStepModel: async (request) => plan(request, [first, second]),
      projectPlayerSafeState: async ({ working_projection: projection }) =>
        projection,
      revalidateCommittedState: async () => true
    });
    assert.deepEqual(seen, ['body:100', 'body:95', 'activity:90']);
    assert.equal(result.step_traces[0].player_response_boundary, true);
    assert.equal(result.stop_reason, 'player_response',
      'positive duration stops replan on stale temporal state');
  });

function plan(request, operations) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'achieved',
    activity: {
      owner: 'semantic', duration_class: 'moment', effort: 'none'
    },
    operations,
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'direct_step',
    reason: 'test evolving body state'
  };
}

function bodyResult(eventValue, health) {
  return {
    body_effect_ref: `approved_body_effect:${eventValue.mechanism}_minor`,
    composite_body_effect_ref: 'approved_body_effect:composite',
    payload: {
      body_effect_ref: `approved_body_effect:${eventValue.mechanism}_minor`,
      profile_pin: pin(),
      selected_context: { kind: 'direct_body_event',
        mechanism: eventValue.mechanism, severity: eventValue.severity,
        body_part_ref: eventValue.body_part_ref },
      exact_deltas: { health: -5, satiety: 0, energy: 0 },
      state_after: { health, satiety: 100, energy: 100,
        active_conditions: [], body_parts: {} }
    }
  };
}
function event(mechanism, description) {
  return { op: 'apply_body_event', actor_ref: 'mikula', mechanism,
    severity: 'minor', body_part_ref: 'left_arm', description };
}
function initialBody() {
  return {
    health: 100, satiety: 100, energy: 100, active_conditions: [],
    body_parts: { left_arm: { id: 'left_arm' } }
  };
}
function initialWorkingProjection() {
  return {
    actor_id: 'mikula',
    position: { location_ref: 'shore' },
    inventory: { items: [], total_weight: { grams: 0 },
      load_category: 'light', occupied_hands: 0 },
    items: [],
    knowledge: []
  };
}
function clock(minutes) {
  return {
    whole_minutes: String(minutes),
    subminute_numerator: '0',
    subminute_denominator: '1'
  };
}
function pin() {
  return { artifact_id: 'test', revision: 1, digest: '1'.repeat(64) };
}
