import assert from 'node:assert/strict';
import test from 'node:test';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { createLowerDvinaTracePhase2PrecommitNarrationApprover } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('required precommit narration failures reject before factual commit',
  async () => {
    const f = fixture();
    const state = structuredClone(f.state);
    await f.runtime.submitTurn({ partyId: f.partyId, input: {
      request_id: 'precommit-narration-failure',
      idempotency_key: 'precommit-narration-failure',
      raw_text: 'Осмотреть лодку, верёвку и следы.'
    } });

    for (const stage of [
      'writer', 'initial auditor', 'semantic repair', 'final audit'
    ]) {
      let commits = 0;
      const narrationService = createLowerDvinaTraceNarrationService({
        roleRunner: failureRunner(stage)
      });
      const approver = createLowerDvinaTracePhase2PrecommitNarrationApprover({
        narrationService
      });
      await assert.rejects(() => commitLowerDvinaTracePhase2({
        ...f.lastCommitInput(),
        loadState: async () => structuredClone(state),
        committer: {
          approveNarration: (candidate) => approver.approveNarration(candidate),
          async commit() { commits += 1; return { ok: true }; }
        }
      }), { code: 'TRACE_PHASE_2_WRITE_PLAN_REJECTED' }, stage);
      assert.equal(commits, 0, stage);
    }
  });

function failureRunner(stage) {
  let audits = 0;
  return { async run({ role_id: roleId, messages }) {
    const input = JSON.parse(messages.at(-1).content);
    if (stage === 'writer' && roleId !== 'gameplay_narrator_auditor') {
      return { output: {} };
    }
    if (roleId === 'gameplay_narrator') return { output: narration(input) };
    if (roleId === 'gameplay_narrator_auditor') {
      audits += 1;
      if (stage === 'initial auditor') return { output: {} };
      if (stage === 'semantic repair' || audits === 1) {
        return { output: failedAudit() };
      }
      return { output: failedAudit() };
    }
    if (roleId === 'gameplay_narrator_semantic_repair') {
      return { output: stage === 'semantic repair' ? {} : {
        version: 1, schema: 'narration_semantic_repair',
        replacements: [{ segment_id: 's1', prose: 'Берег тих.' }]
      } };
    }
    return { output: narration(input.request) };
  } };
}

function narration(request) {
  return { version: 1, schema: 'narration_output',
    output_id: request.request_id, prose: 'Берег тих.', action_options: [],
    used_references: [], self_check: {} };
}

function failedAudit() {
  return { version: 1, schema: 'narration_audit', pass: false,
    concerns: [{ segment_id: 's1', kind: 'unsupported_fact', reason: 'Нет опоры.' }],
    evidence: ['Нет опоры.'] };
}
