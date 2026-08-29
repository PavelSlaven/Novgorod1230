import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnStepExecutionRegistry,
  runTurnStepLoop
} from '@rus/turn';
import {
  createLowerDvinaTraceTurnStepRuntimePorts
} from '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

test('prepared route rejects a zero-duration direct semantic activity before writes',
  async () => {
    const body = {
      health: 100,
      satiety: 100,
      energy: 100,
      active_conditions: [],
      body_parts: {}
    };
    const committedState = {
      party_id: 'party-prepared-zero-duration',
      party_state: { turn_number: 0 },
      body_state: body,
      clock: at(0),
      items: [],
      prepared_scenes: [{
        location_profile_ref: 'camp',
        node: { instance_id: 'camp-node' }
      }]
    };
    let temporalAdvanceCount = 0;
    const ports = createLowerDvinaTraceTurnStepRuntimePorts({
      committedState,
      semanticActivityOwner: activityOwner(body),
      temporalAdvance: async ({ clock_before: before, exact_elapsed: elapsed }) => {
        temporalAdvanceCount += 1;
        return {
          clock_before: structuredClone(before),
          clock_after: at(Number(before.whole_minutes)
            + Number(elapsed.exact_minutes.numerator)),
          exact_elapsed: structuredClone(elapsed),
          nearest_boundary: null,
          boundary_trace: {
            evaluated_candidate_count: 0,
            processed_boundary_ids: []
          }
        };
      },
      bodyEffect: {
        async apply() {
          return {
            owner: '@rus/body-state',
            applied: true,
            proposal: { execution_variant_id: 'test-route' },
            state_after: structuredClone(body)
          };
        }
      },
      workingProjectionAuthority:
        createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
    });
    const semanticActivity = ports.executionRegistry.semanticActivity();
    const executionRegistry = createTurnStepExecutionRegistry({
      domain: {
        request_movement: (execution) => ports.preparedDomainEffect.apply({
          ...execution,
          command_id: 'lower_dvina_trace.follow_path_to_fishing_camp',
          option_id: 'test-route',
          availability: { available: true },
          consequence: routeConsequence()
        })
      },
      applySemanticActivity: (execution) => semanticActivity(execution)
    });
    const successfulWrites = [];
    let commitCount = 0;

    async function submit() {
      const result = await runTurnStepLoop(loopInput(), {
        executionRegistry,
        preparedEffectContext: ports.preparedEffectContext,
        preparedEffectTimeOwner: ports.preparedEffectTimeOwner,
        preparedEffectBodyOwner: ports.preparedEffectBodyOwner,
        turnStepModel: async (request) => request.step_index === 1
          ? routePlan(request)
          : directPlan(request),
        projectPlayerSafeState: async ({ working_projection: projection }) =>
          projection,
        revalidateCommittedState: async () => true
      });
      successfulWrites.push(...result.write_fragments);
      commitCount += 1;
      return result;
    }

    await assert.rejects(submit, {
      code: 'TRACE_TURN_STEP_PREPARED_SEMANTIC_ACTIVITY_DURATION_INVALID'
    });
    assert.deepEqual(successfulWrites, []);
    assert.equal(commitCount, 0);
    assert.equal(temporalAdvanceCount, 1);
  });

function loopInput() {
  return {
    requestId: 'turn-step:prepared-zero-duration',
    rootTurnId: 'turn:prepared-zero-duration',
    committedStateVersion: 7,
    rootPlayerAction: 'дойти до стана и осмотреться',
    actor: { actor_id: 'mikula', body: {} },
    initialWorkingProjection: {
      actor_id: 'mikula',
      position: { location_ref: 'shore' },
      destination_refs: ['camp'],
      clock: at(0),
      clock_weather_light: { clock: at(0) },
      route_history: []
    },
    maxInternalSteps: 8
  };
}

function routePlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_movement',
      actor_ref: 'mikula',
      movement_kind: 'local',
      target_ref: 'camp'
    }],
    continuation: {
      remaining_intent: 'осмотреться у ворот',
      depends_on_refs: ['camp']
    },
    reason_code: 'delegate_existing_owner'
  });
}

function directPlan(request) {
  return plan(request, {
    reason_code: 'complete_at_destination'
  });
}

function plan(request, overrides) {
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
      owner: 'semantic',
      duration_class: 'moment',
      effort: 'none'
    },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'test',
    reason: 'prepared zero-duration regression',
    ...overrides
  };
}

function routeConsequence() {
  return {
    phase3_kind: 'movement',
    duration_minutes: 8,
    movement: {
      route_ref: 'shore-to-camp',
      source: { location_ref: 'shore' },
      destination: { location_ref: 'camp', g5_anchor_id: 'camp-anchor' }
    }
  };
}

function activityOwner(body) {
  return {
    async resolve({ activity }) {
      return {
        profile_ref: 'approved_activity:moment_none',
        profile_pin: {
          artifact_id: 'test',
          revision: 1,
          digest: '1'.repeat(64)
        },
        duration_class: activity.duration_class,
        effort: activity.effort,
        duration_minutes: 0,
        body_effect_ref: null,
        body_effect_profile_ref: 'approved_body_effect:activity',
        exact_deltas: { health: 0, satiety: 0, energy: 0 },
        body_state_after: structuredClone(body)
      };
    }
  };
}

function at(minutes) {
  return {
    whole_minutes: String(minutes),
    subminute_numerator: '0',
    subminute_denominator: '1'
  };
}
