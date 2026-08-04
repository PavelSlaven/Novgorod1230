import test from 'node:test';
import assert from 'node:assert/strict';

import { createPartyStore } from '@rus/party-store';
import {
  createTurnCommandRegistry,
  createTurnStepExecutionRegistry,
  runTurnStepLoop,
  runTurnWorkflow
} from '../src/index.js';

const HIDDEN_SENTINEL = 'hidden-handler-sentinel';

test('handler summaries never enter a later player-safe step request', async () => {
  const requests = [];
  const executionRegistry = createTurnStepExecutionRegistry({
    direct: {
      change_entity_facts: async ({ working_projection: projection }) => ({
        working_projection: { ...projection, prepared: true },
        summary: HIDDEN_SENTINEL,
        write_fragments: []
      })
    },
    applySemanticActivity: async ({ working_projection: projection }) => ({
      working_projection: projection,
      summary: `${HIDDEN_SENTINEL}:activity`,
      write_fragments: []
    })
  });

  await runTurnStepLoop({
    requestId: 'summary-safety',
    rootTurnId: 'turn-summary-safety',
    rootPlayerAction: 'Подготавливаю предмет и завершаю действие.',
    committedStateVersion: 0,
    actor: { actor_ref: 'party-1' },
    initialWorkingProjection: {},
    maxInternalSteps: 8
  }, {
    executionRegistry,
    projectPlayerSafeState: async () => ({ visible_entities: [] }),
    revalidateCommittedState: async () => ({ state_version: 0 }),
    turnStepModel: async (request) => {
      requests.push(request);
      if (request.step_index === 2) {
        assert.equal(JSON.stringify(request).includes(HIDDEN_SENTINEL), false);
        assert.deepEqual(request.completed_steps, [{
          step_index: 1,
          summary: 'Подготовить доступный предмет.'
        }]);
      }
      return directPlan(request, {
        groundedAttempt: request.step_index === 1
          ? 'Подготовить доступный предмет.'
          : 'Завершить действие.',
        goalResult: request.step_index === 1 ? 'pending' : 'achieved',
        operations: request.step_index === 1 ? [{
          op: 'change_entity_facts',
          entity_ref: 'party-1',
          remove_fact_refs: [],
          add_facts: []
        }] : [],
        continuation: request.step_index === 1 ? {
          remaining_intent: 'завершить действие',
          depends_on_refs: ['party-1']
        } : null
      });
    }
  });

  assert.equal(requests.length, 2);
});

test('direct and domain hidden updates are preserved in one commit', async () => {
  const { commits, services } = semanticDomainServices({
    hiddenUpdate(context) {
      assert.equal(Object.isFrozen(context), true);
      assert.equal(Object.isFrozen(context.approved_update), true);
      return {
        approved_update: { direct_prepared: true, domain_final: true }
      };
    }
  });

  await runTurnWorkflow(turnInput(), services);

  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].write_targets, [{
    target: 'party_hidden_state',
    value: {
      direct_prepared: true,
      domain_base: true,
      domain_final: true
    }
  }]);
});

test('conflicting direct and domain hidden updates fail before commit', async () => {
  const { commits, services } = semanticDomainServices({
    hiddenUpdate() {
      return { approved_update: { direct_prepared: false } };
    }
  });

  await assert.rejects(
    () => runTurnWorkflow(turnInput(), services),
    { code: 'TURN_HIDDEN_UPDATE_CONFLICT' }
  );
  assert.equal(commits.length, 0);
});

function semanticDomainServices({ hiddenUpdate }) {
  const commits = [];
  const state = committedState();
  const partyStore = createPartyStore({
    transact: async (plan) => {
      commits.push(structuredClone(plan));
      return { committed: true, write_count: plan.write_targets.length };
    }
  });
  const commandRegistry = createTurnCommandRegistry([{
    command_id: 'inspect_gate',
    option_id: 'inspect_gate',
    target_id: 'place-gate',
    label: 'Осмотреть ворота',
    expected_cost: { kind: 'time', value: 0 },
    known_risks: [],
    reason_visible_to_actor: 'Ворота доступны.',
    semantic_binding: {
      binding_id: 'inspect-gate',
      operation: 'request_discovery',
      matches: ({ operation }) => operation.target_refs.includes('place-gate')
    },
    matches: () => false,
    mode: {
      selected_primary_mode: 'attention',
      secondary_modes: [],
      resolution_plan: {
        subsystems: ['visible_context_projection'],
        checks_to_run: [],
        expected_writes: ['party_hidden_state'],
        state_blocks_to_load: ['party_state', 'visible_context']
      }
    },
    availability: async () => ({
      version: 1,
      schema: 'turn_availability_decision',
      status: 'available',
      can_attempt: true,
      reasons: [],
      check_requests: []
    }),
    consequence: async () => ({
      version: 1,
      schema: 'turn_consequence_package',
      status: 'resolved',
      duration_minutes: 0,
      visible_seed: { observation: 'Ворота осмотрены.' },
      hidden_update: { domain_base: true },
      state_changes: [],
      suggested_actions: []
    }),
    hiddenUpdate,
    writeTargets: async ({ hiddenUpdate: update }) => [{
      target: 'party_hidden_state',
      value: structuredClone(update.approved_update)
    }]
  }]);
  const executionRegistry = createTurnStepExecutionRegistry({
    direct: {
      change_entity_facts: async ({ working_projection: projection }) => ({
        working_projection: { ...projection, prepared: true },
        summary: 'internal direct summary',
        write_fragments: [],
        consequence_fragment: {
          hidden_update: { direct_prepared: true }
        }
      })
    }
  });
  const services = {
    commandRegistry,
    stateReader: { read: async () => structuredClone(state) },
    playerSafeStateProjector: async () => ({
      actor: { actor_ref: 'party-1' },
      player_safe_state: {
        visible_entities: [{ entity_ref: 'place-gate' }]
      }
    }),
    turnStepExecutionRegistry: executionRegistry,
    turnStepModel: async (request) => domainPlan(request),
    visibleProjector: {
      project: async () => validVisibleContext()
    },
    persistedVisibleReader: {
      read: async () => validVisibleContext()
    },
    narrator: {
      run: async (request) => approvedNarration(request.request_id)
    },
    partyStore,
    semanticResolver: async () => ({ status: 'unknown' }),
    decisionSecret: 'turn-step-security-secret',
    decisionExpiresAt: '2027-08-02T00:00:00.000Z',
    decisionNow: () => '2026-08-02T00:00:00.000Z'
  };
  return { commits, services };
}

function directPlan(request, {
  groundedAttempt,
  goalResult,
  operations,
  continuation
}) {
  return plan(request, {
    groundedAttempt,
    resolution: 'direct',
    goalResult,
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations,
    continuation
  });
}

function domainPlan(request) {
  return plan(request, {
    groundedAttempt: 'Подготовить и осмотреть доступные ворота.',
    resolution: 'domain_request',
    goalResult: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'change_entity_facts',
      entity_ref: 'party-1',
      remove_fact_refs: [],
      add_facts: []
    }, {
      op: 'request_discovery',
      actor_ref: 'party-1',
      discovery_kind: 'inspect',
      target_refs: ['place-gate'],
      query: 'что видно на воротах'
    }],
    continuation: null
  });
}

function plan(request, {
  groundedAttempt,
  resolution,
  goalResult,
  activity,
  operations,
  continuation
}) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: groundedAttempt,
      adaptation: 'literal'
    },
    resolution,
    goal_result: goalResult,
    activity,
    operations,
    check: null,
    continuation,
    clarification: null,
    reason_code: 'test_step',
    reason: 'Проверка M1 security boundary.'
  };
}

function committedState() {
  return {
    party_state: { party_id: 'party-1', state_version: 0 },
    current_position: { region_id: 'region-novgorod', place_id: 'place-gate' },
    clock_weather_light: {
      clock: { day: 1, hour: 9, minute: 0 },
      weather: {},
      light: {}
    },
    visible_context: validVisibleContext(),
    character_knowledge_map: [],
    relevant_hidden_state: {},
    relevant_events: []
  };
}

function validVisibleContext() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Перед персонажем находятся ворота.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  };
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
      prose: 'Ворота осмотрены.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      pass: true,
      concerns: [],
      evidence: ['Approved against visible context.']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}

function turnInput() {
  return {
    party_id: 'party-1',
    turn_number: 1,
    request_id: 'turn-step-security-request',
    idempotency_key: 'turn-step-security-idempotency',
    raw_text: 'Подготавливаю ворота и осматриваю их.'
  };
}
