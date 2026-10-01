import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepExecutionRegistry } from '@rus/turn';
import { executeTracePhase7SchedulePlan } from
  '../src/runtime/lower-dvina-trace-phase-7-schedule-execution.js';

test('needs-check rejects only the NPC actor operation through domain rejection',
  async () => {
    let npcOperationWrites = 0;
    const registry = createTurnStepExecutionRegistry({ domain: {
      request_container_access: async () => {
        npcOperationWrites += 1;
        throw Object.assign(new Error('blocked proposal'), {
          code: 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
          details: { path: 'NPC.result_descriptor',
            queue_id: 'needs_check.csv#HNT0024',
            queue_ids: ['needs_check.csv#HNT0024'] }
        });
      }
    } });
    const projection = { clock: { whole_minutes: '100',
      subminute_numerator: '0', subminute_denominator: '1' }, writes: [] };
    const temporal = { projection,
      result: { clock_after: projection.clock } };
    const plan = { resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain' }, operations: [{
        op: 'request_container_access', actor_ref: 'npc-1',
        container_ref: 'chest', access_kind: 'open_and_view'
      }], continuation: null };
    const result = await executeTracePhase7SchedulePlan({
      state: { party_id: 'party', party_state: { turn_number: 4 },
        npcs: [{ instance_id: 'npc-1', machine_state: {}, inventory: {} }] },
      contracts: { zhdanko: { instance_id: 'npc-1', machine_state: {},
        inventory: {} } },
      temporal,
      autonomous: { request: { decision_index: 1, root_turn_id: 'turn:party:5' },
        proposal: { status: 'accepted', plan } },
      actorStepRuntime: { registry, ports: {},
        registeredOwnerOutput: () => { throw new Error('no NPC operation output'); } }
    });
    assert.deepEqual(result.working_projection, projection);
    assert.deepEqual(result.domain_result, { pass: false, errors: [{
      code: 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED',
      category: 'applicability', retryable: false,
      path: 'NPC.result_descriptor',
      queue_id: 'needs_check.csv#HNT0024',
      queue_ids: ['needs_check.csv#HNT0024']
    }] });
    assert.equal(npcOperationWrites, 1);
    assert.equal(Object.hasOwn(result, 'owner_outputs'), false);
    assert.equal(Object.hasOwn(result, 'result'), false);
  });
