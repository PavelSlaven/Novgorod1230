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
    output_id: 'turn:party-1:1',
    prose,
    action_options: [],
    used_references: [],
    self_check: { no_new_world_facts: true }
  };
}

function ports(overrides = {}) {
  return {
    writer: { async generate() { return output(); } },
    formatRepairer: { async repair() { return output(); } },
    ...overrides
  };
}

test('approves one generated prose output after deterministic visible-only validation', async () => {
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

test('uses one targeted repair then deterministic revalidation', async () => {
  let writerCalls = 0;
  let repairCalls = 0;
  const p = ports({
    writer: { async generate() { writerCalls += 1; return {}; } },
    formatRepairer: { async repair(input) {
      repairCalls += 1;
      assert.equal(input.validation_errors.length > 0, true);
      return output('У ворот всё так же стоит телега.');
    } }
  });
  const result = await runNarrationFlow(request(), p);
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'У ворот всё так же стоит телега.');
  assert.equal(writerCalls, 1);
  assert.equal(repairCalls, 1);
  assert.equal(result.audit_history.length, 0);
});

test('blocks after invalid repair without another LLM call', async () => {
  let repairCalls = 0;
  const p = ports({
    writer: { async generate() { return {}; } },
    formatRepairer: { async repair() { repairCalls += 1; return {}; } }
  });
  const result = await runNarrationFlow(request(), p);
  assert.equal(result.status, 'blocked');
  assert.equal(result.approved_output, null);
  assert.equal(repairCalls, 1);
});

test('repairs hidden-leak-shaped output before approval', async () => {
  let errors;
  const result = await runNarrationFlow(request(), ports({
    writer: { async generate() { return { ...output(), hidden_state: { secret: true } }; } },
    formatRepairer: { async repair(input) { errors = input.validation_errors; return output(); } }
  }));
  assert.equal(result.status, 'approved');
  assert.deepEqual(errors, ['forbidden field: hidden_state', 'hidden leak: hidden_state', 'hidden leak: hidden_state.secret']);
});

test('keeps valid writer prose', async () => {
  const result = await runNarrationFlow(request(), ports({
    writer: { async generate() { return output('Телега скрипит у ворот.'); } }
  }));
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'Телега скрипит у ворот.');
});

test('repairs non-empty unsupported action_options', async () => {
  let errors;
  const result = await runNarrationFlow(request(), ports({
    writer: { async generate() { return { ...output(), action_options: [{ label: 'Осмотреть телегу' }] }; } },
    formatRepairer: { async repair(input) { errors = input.validation_errors; return output(); } }
  }));
  assert.equal(result.status, 'approved');
  assert.deepEqual(errors, ['action_options must be empty until visible_context defines action candidates']);
});

test('blocks non-empty unsupported used_references after one repair', async () => {
  let repairCalls = 0;
  const nonEmptyReferences = { ...output(), used_references: ['scene:cart'] };
  const result = await runNarrationFlow(request(), ports({
    writer: { async generate() { return nonEmptyReferences; } },
    formatRepairer: { async repair() { repairCalls += 1; return nonEmptyReferences; } }
  }));
  assert.equal(result.status, 'blocked');
  assert.equal(repairCalls, 1);
  assert.deepEqual(result.diagnostics.errors, ['used_references must be empty until visible_context defines reference vocabulary']);
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
