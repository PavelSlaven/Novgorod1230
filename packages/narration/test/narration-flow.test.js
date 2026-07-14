import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptApprovedOpeningNarration,
  createNarrationService,
  runNarrationFlow,
  validateNarrationFlowResult
} from '../src/index.js';

function request(overrides = {}) {
  return {
    version: 1,
    schema: 'narration_request',
    request_id: 'turn:party-1:1',
    surface: 'turn',
    visible_context: {
      version: 1,
      schema: 'visible_context_package',
      visible_scene: 'У ворот стоит телега.',
      visible_changes: [],
      sensory_details: [],
      visible_npc: [],
      visible_objects: [],
      known_context: [],
      uncertainties: [],
      allowed_tensions: [],
      do_not_imply: []
    },
    context: { mode: 'attention' },
    style_policy: { no_new_world_facts: true },
    max_repairs: 1,
    ...overrides
  };
}

function output(prose = 'У ворот неподвижно стоит телега.') {
  return {
    version: 1,
    schema: 'narration_output',
    output_id: 'narration-1',
    prose,
    action_options: [],
    used_references: [],
    self_check: { no_new_world_facts: true }
  };
}

function audit(pass, concerns = []) {
  return {
    version: 1,
    schema: 'narration_audit',
    pass,
    concerns,
    evidence: ['Compared with visible context.']
  };
}

function ports(overrides = {}) {
  return {
    writer: { async generate() { return output(); } },
    auditor: { async audit() { return audit(true); } },
    formatRepairer: { async repair() { return output(); } },
    seniorWriter: { async repair() { return output('У ворот всё так же стоит телега.'); } },
    seniorAuditor: { async audit() { return audit(true); } },
    router: { async route() { return { version: 1, schema: 'narration_repair_route', route: 'semantic_rewrite', reason: 'UNSUPPORTED_DETAIL' }; } },
    ...overrides
  };
}

test('approves generated prose after visible-only audit', async () => {
  const result = await runNarrationFlow(request(), ports());
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот неподвижно стоит телега.');
  assert.equal(validateNarrationFlowResult(result).ok, true);
});

test('rejects hidden data before writer execution', async () => {
  let called = false;
  const p = ports({ writer: { async generate() { called = true; return output(); } } });
  await assert.rejects(
    () => runNarrationFlow(request({ visible_context: { hidden_state: { secret: true } } }), p),
    (error) => error.code === 'NARRATION_HIDDEN_LEAK'
  );
  assert.equal(called, false);
});

test('routes failed audit to senior rewrite and re-audit', async () => {
  let audits = 0;
  const p = ports({
    auditor: { async audit() { audits += 1; return audit(false, [{ code: 'UNSUPPORTED_DETAIL', message: 'Unsupported detail.' }]); } },
    seniorAuditor: { async audit() { audits += 1; return audit(true); } }
  });
  const result = await runNarrationFlow(request(), p);
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот всё так же стоит телега.');
  assert.equal(result.repair_history.some((entry) => entry.role === 'semantic_rewrite'), true);
  assert.equal(audits, 2);
});

test('returns typed upstream repair request without approved prose', async () => {
  const p = ports({
    auditor: { async audit() { return audit(false, [{ code: 'VISIBLE_CONTEXT_INSUFFICIENT', message: 'Context is insufficient.' }]); } },
    router: { async route() { return { version: 1, schema: 'narration_repair_route', route: 'upstream_repair', reason: 'VISIBLE_CONTEXT_INSUFFICIENT', return_to: 'visible_projection' }; } }
  });
  const result = await runNarrationFlow(request(), p);
  assert.equal(result.status, 'repair_required');
  assert.equal(result.approved_output, null);
  assert.equal(result.repair_request.return_to, 'visible_projection');
});


test('adapts approved new-game Stage 22 and Stage 23 outputs', () => {
  const result = adaptApprovedOpeningNarration({
    stage22Result: {
      version: 1,
      schema: 'stage22_narrator_prose_result',
      request_id: 'opening-1',
      pass: true,
      visible_context_package_digest: 'sha256:visible',
      narrator_starting_prose: {
        version: 1,
        schema: 'narrator_starting_prose',
        prose_status: 'drafted',
        prose: 'Перед воротами начинается дорога.',
        action_options: [],
        used_visible_context_refs: [],
        self_constraints_check: { no_new_world_facts: true }
      },
      generation_history: []
    },
    stage23Result: {
      version: 1,
      schema: 'stage23_narrator_prose_audit_result',
      request_id: 'opening-1',
      pass: true,
      narrator_starting_prose_digest: 'sha256:prose',
      narrator_prose_audit: { pass: true, evidence: ['Approved.'] },
      audit_history: [],
      commit_permission: { can_show_to_player: true, can_write_player_visible_message: true }
    }
  });
  assert.equal(result.surface, 'first_game');
  assert.equal(result.approved_output.prose, 'Перед воротами начинается дорога.');
});

test('service wrapper preserves explicit ports and defaults', async () => {
  const service = createNarrationService(ports(), { request: { style_policy: { register: 'literary' } } });
  const result = await service.run(request({ style_policy: undefined }));
  assert.equal(result.status, 'approved');
});
