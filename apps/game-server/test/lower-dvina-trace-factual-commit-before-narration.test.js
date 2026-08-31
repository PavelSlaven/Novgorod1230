import assert from 'node:assert/strict';
import test from 'node:test';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('P16 factual commit does not call or wait for narration approval',
  async () => {
    const f = fixture();
    const state = structuredClone(f.state);
    await f.runtime.submitTurn({ partyId: f.partyId, input: {
      request_id: 'factual-commit-before-narration',
      idempotency_key: 'factual-commit-before-narration',
      raw_text: 'Осмотреть лодку, верёвку и следы.'
    } });
    let approvalCalls = 0;
    let committedPlan = null;
    const result = await commitLowerDvinaTracePhase2({
      ...f.lastCommitInput(),
      loadState: async () => structuredClone(state),
      committer: {
        async approveNarration() {
          approvalCalls += 1;
          throw Object.assign(new Error('presentation rejected'), {
            code: 'TRACE_PHASE_2_NARRATION_REJECTED'
          });
        },
        async commit({ plan }) {
          committedPlan = plan;
          return { ok: true };
        }
      }
    });
    const narrationJob = committedPlan.inserts.find(
      ({ target_table: table }) => table === 'party_narration_jobs'
    );
    assert.equal(result.state_version, state.party_state.state_version + 1);
    assert.equal(approvalCalls, 0);
    assert.equal(narrationJob.record.status, 'pending');
    assert.equal(narrationJob.record.narration_output, undefined);
  });
