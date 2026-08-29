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

test('precommit narration writer receives player action, while audit receives only visible context',
  async () => {
    const requests = {};
    const approver = createLowerDvinaTracePhase2PrecommitNarrationApprover({
      narrationService: createLowerDvinaTraceNarrationService({
        roleRunner: { async run({ role_id: roleId, messages }) {
          const request = JSON.parse(messages.at(-1).content);
          requests[roleId] = request;
          if (roleId === 'gameplay_narrator') return { output: narration(request) };
          return { output: { version: 1, schema: 'narration_audit',
            pass: true, concerns: [], evidence: ['Берег.'] } };
        } }
      })
    });
    await approver.approveNarration({
      visible_package_envelope: visibleEnvelope(),
      semantic_command_snapshot: {
        raw_text: 'Осмотреть лодку.', selected_option_id: 'inspect_boat'
      }
    });
    assert.deepEqual(requests.gameplay_narrator.context, {
      player_input: { party_id: 'party-1', raw_text: 'Осмотреть лодку.' },
      mode_resolution: { option_id: 'inspect_boat' }
    });
    assert.equal('context' in requests.gameplay_narrator_auditor, false);
    assert.equal(requests.gameplay_narrator_auditor.visible_context.visible_scene,
      'Берег.');
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

function visibleEnvelope() {
  return {
    party_id: 'party-1', package_id: 'package-1', package_digest: 'digest-1',
    turn_id: 'turn-1', visible_payload: {
      perceived_scene: 'Берег.', perceived_changes: [], sensory_details: [],
      visible_npcs: [], visible_objects: [], known_context: [], uncertainties: []
    }
  };
}
