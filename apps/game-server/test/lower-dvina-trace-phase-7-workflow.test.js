import assert from 'node:assert/strict';
import test from 'node:test';
import { createPartyStore } from '@rus/party-store';
import {
  createTurnCommandRegistry,
  createTurnStepExecutionRegistry,
  runTurnWorkflow
} from '@rus/turn';
import {
  approvedPhase7Contracts,
  phase7AutonomousPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';
const ESCORT_CLAUSE = 'Попросить Еремея и рыбака пойти со мной к Жданко.';

test('compound Turn 10 keeps escort clauses on the semantic multi-step path',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    state.policy_pins = [structuredClone(contracts.activityPin)];
    const productionCommand = phase7Command({
      state,
      contracts,
      model: async () => {
        throw new Error('exact Phase 7 path must not run for compound Turn 10');
      }
    });
    assert.equal(productionCommand.matches({ raw_text: COMPOUND_TURN_10 }),
      false);

    const plannerRequests = [];
    const commits = [];
    const command = Object.freeze({
      ...productionCommand,
      matches(context) {
        return productionCommand.matches(context);
      },
      semantic_binding: {
        binding_id: 'phase7-rest-semantic',
        operation: 'request_activity',
        matches: () => false
      },
      async consequence() {
        return {
          version: 1,
          schema: 'turn_consequence_package',
          status: 'resolved',
          duration_minutes: 0,
          visible_seed: { observation: 'rest then escort planned' },
          hidden_update: { compound_turn_10_kept: true },
          state_changes: [],
          suggested_actions: []
        };
      },
      writeTargets(input) {
        return [
          { target: 'party_state', value: { turn_number: 1 } },
          {
            target: 'party_visible_context_package',
            value: input.visibleContext
          }
        ];
      }
    });
    const visible = {
      version: 1,
      schema: 'visible_context_package',
      visible_scene: 'У костра.',
      visible_changes: [],
      sensory_details: [],
      visible_npc: [],
      visible_objects: [],
      known_context: [],
      uncertainties: [],
      allowed_tensions: [],
      do_not_imply: []
    };
    const services = {
      commandRegistry: createTurnCommandRegistry([command]),
      stateReader: {
        async read() {
          return structuredClone(state);
        }
      },
      semanticResolver: async () => {
        throw new Error('revision 15 must use turn_step_plan_v1');
      },
      decisionSecret: 'phase-7-compound-test',
      decisionExpiresAt: '2026-08-08T01:00:00.000Z',
      playerSafeStateProjector: async () => ({
        actor: { actor_ref: state.actor_id },
        player_safe_state: {
          visible_entities: [
            { entity_ref: contracts.campLocationRef },
            { entity_ref: 'npc:yeremei' },
            { entity_ref: 'npc:fisherman' }
          ]
        }
      }),
      turnStepExecutionRegistry: createTurnStepExecutionRegistry({
        direct: {
          change_entity_facts: async ({
            working_projection: projection,
            operation
          }) => {
            const escort = operation.add_facts?.some(
              ({ text }) => text?.includes('Еремея')
            ) === true;
            return {
              working_projection: {
                ...projection,
                ...(escort
                  ? {
                      escort_requested: true,
                      known_path_to_klet: true
                    }
                  : { fire_rest_started: true })
              },
              summary: escort
                ? 'escort and known path recorded'
                : 'rest step drafted',
              write_fragments: [{
                target: 'party_hidden_state',
                value: escort
                  ? {
                      companions_assigned: true,
                      known_path_to_klet: true
                    }
                  : { fire_rest_started: true }
              }]
            };
          }
        },
        applySemanticActivity: async ({ working_projection: projection }) => ({
          working_projection: projection,
          summary: 'activity drafted',
          write_fragments: []
        })
      }),
      turnStepModel: async (request) => {
        plannerRequests.push({
          root: request.root_player_action,
          remaining: request.remaining_intent,
          step: request.step_index
        });
        if (request.step_index === 1) {
          assert.equal(request.root_player_action, COMPOUND_TURN_10);
          assert.equal(request.remaining_intent, COMPOUND_TURN_10);
          return {
            schema: 'turn_step_plan_v1',
            request_id: request.request_id,
            committed_state_version: request.committed_state_version,
            working_revision: request.working_revision,
            step_index: request.step_index,
            interpretation: {
              player_goal: COMPOUND_TURN_10,
              grounded_attempt: 'отдохнуть у огня',
              adaptation: 'literal'
            },
            resolution: 'direct',
            goal_result: 'pending',
            activity: {
              owner: 'semantic', duration_class: 'moment', effort: 'light'
            },
            operations: [{
              op: 'change_entity_facts',
              entity_ref: state.actor_id,
              remove_fact_refs: [],
              add_facts: []
            }],
            check: null,
            continuation: {
              remaining_intent: ESCORT_CLAUSE,
              depends_on_refs: [contracts.campLocationRef]
            },
            clarification: null,
            reason_code: 'rest_then_escort',
            reason: 'compound Turn 10 first step'
          };
        }
        assert.equal(request.root_player_action, COMPOUND_TURN_10);
        assert.equal(request.remaining_intent, ESCORT_CLAUSE);
        assert.match(request.remaining_intent, /Еремея/);
        assert.match(request.remaining_intent, /рыбака/);
        assert.match(request.remaining_intent, /Жданко/);
        return {
          schema: 'turn_step_plan_v1',
          request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision,
          step_index: request.step_index,
          interpretation: {
            player_goal: COMPOUND_TURN_10,
            grounded_attempt: ESCORT_CLAUSE,
            adaptation: 'literal'
          },
          resolution: 'direct',
          goal_result: 'achieved',
          activity: {
            owner: 'semantic', duration_class: 'moment', effort: 'light'
          },
          operations: [{
            op: 'change_entity_facts',
            entity_ref: state.actor_id,
            remove_fact_refs: [],
            add_facts: [{
              temp_ref: 'escort_to_zhdanko',
              text: 'Попросить Еремея и рыбака пойти со мной к Жданко.'
            }]
          }],
          check: null,
          continuation: null,
          clarification: null,
          reason_code: 'escort_consent',
          reason: 'compound Turn 10 escort clauses preserved'
        };
      },
      visibleProjector: {
        async project() {
          return structuredClone(visible);
        }
      },
      persistedVisibleReader: {
        async read() {
          return structuredClone(visible);
        }
      },
      narrator: {
        async run(request) {
          return {
            version: 1,
            schema: 'narration_flow_result',
            request_id: request.request_id,
            surface: 'turn',
            status: 'approved',
            pass: true,
            approved_output: {
              version: 1,
              schema: 'narration_output',
              output_id: `narration:${request.request_id}`,
              prose: 'Эскорт сохранён.',
              action_options: [],
              used_references: [],
              self_check: { no_new_world_facts: true }
            },
            final_audit: {
              version: 1,
              schema: 'narration_audit',
              pass: true,
              concerns: [],
              evidence: ['ok']
            },
            repair_request: null,
            generation_history: [],
            audit_history: [],
            repair_history: [],
            diagnostics: {}
          };
        }
      },
      partyStore: createPartyStore({
        transact: async (plan) => {
          commits.push(structuredClone(plan));
          return { committed: true, write_count: plan.write_targets.length };
        }
      })
    };

    const result = await runTurnWorkflow({
      ...phase7PlayerInput(state, 'compound-turn-10'),
      turn_number: state.party_state.turn_number + 1,
      raw_text: COMPOUND_TURN_10,
      received_at: '2026-08-08T00:00:00.000Z',
      routing_context: {
        actor_id: state.actor_id,
        state_version: state.party_state.state_version,
        policy_pins: structuredClone(state.policy_pins)
      }
    }, services);

    assert.equal(result.status, 'resolved');
    assert.equal(plannerRequests.length, 2);
    assert.equal(plannerRequests[0].root, COMPOUND_TURN_10);
    assert.equal(plannerRequests[0].remaining, COMPOUND_TURN_10);
    assert.equal(plannerRequests[1].remaining, ESCORT_CLAUSE);
    assert.equal(commits.length, 1);
    assert.equal(commits[0].command_trace.decision_protocol,
      'turn_step_plan_v1');
    assert.equal(commits[0].command_trace.step_count, 2);
    assert.equal(
      JSON.stringify(commits[0]).includes('companions_assigned'),
      true
    );
    assert.equal(
      JSON.stringify(commits[0]).includes('known_path_to_klet'),
      true
    );
  });

test('Phase 7 applicability rejection stops the production workflow',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    state.policy_pins = [structuredClone(contracts.activityPin)];
    const stateBefore = structuredClone(state);
    const persistedProjection = structuredClone(state);
    const calls = {
      model: 0,
      time: 0,
      body: 0,
      hidden: 0,
      persistence: 0,
      commit: 0
    };
    const productionCommand = phase7Command({
      state,
      contracts,
      model: async (request) => {
        calls.model += 1;
        const plan = phase7AutonomousPlan(request, 'move_bag');
        plan.operations[0].target_refs = [contracts.roadBag.item_ref];
        return plan;
      }
    });
    const instrumentedCommand = Object.freeze({
      ...productionCommand,
      hiddenUpdate() {
        calls.hidden += 1;
        throw new Error('hidden update must not run');
      },
      writeTargets(input) {
        calls.persistence += 1;
        return productionCommand.writeTargets(input);
      }
    });
    const services = {
      commandRegistry: createTurnCommandRegistry([instrumentedCommand]),
      stateReader: {
        async read() {
          return structuredClone(persistedProjection);
        }
      },
      semanticResolver: async () => {
        throw new Error('exact Phase 7 command must win');
      },
      decisionSecret: 'phase-7-workflow-test',
      decisionExpiresAt: '2026-08-07T01:00:00.000Z',
      temporalAdvance: async () => {
        calls.time += 1;
        throw new Error('time update must not run');
      },
      bodyEffect: {
        apply() {
          calls.body += 1;
          throw new Error('body update must not run');
        }
      },
      visibleProjector: {
        async project() {
          throw new Error('visible projection must not run');
        }
      },
      persistedVisibleReader: {
        async read() {
          throw new Error('persisted projection must not run');
        }
      },
      narrator: {
        async run() {
          throw new Error('narration must not run');
        }
      },
      partyStore: {
        async commit() {
          calls.commit += 1;
          throw new Error('commit must not run');
        }
      }
    };
    const input = {
      ...phase7PlayerInput(state, 'workflow-invalid'),
      turn_number: state.party_state.turn_number + 1,
      received_at: '2026-08-07T00:00:00.000Z',
      routing_context: {
        actor_id: state.actor_id,
        state_version: state.party_state.state_version,
        policy_pins: structuredClone(state.policy_pins)
      }
    };

    await assert.rejects(
      () => runTurnWorkflow(input, services),
      (error) => error?.code === 'TURN_NPC_PLAN_INVALID'
    );
    assert.deepEqual(calls, {
      model: 2,
      time: 0,
      body: 0,
      hidden: 0,
      persistence: 0,
      commit: 0
    });
    assert.deepEqual(state, stateBefore);
    assert.deepEqual(persistedProjection, stateBefore);
  });
