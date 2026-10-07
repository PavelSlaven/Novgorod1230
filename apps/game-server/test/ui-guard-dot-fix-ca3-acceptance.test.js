import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { createLowerDvinaTracePhase2ServiceFlow } from
  '../src/runtime/lower-dvina-trace-phase-2-service-flow.js';
import { narrationWire, assembleNarrationRoleOutput } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { narrationSources } from
  '../src/runtime/lower-dvina-trace-narration-audit-values.js';
import { errorEnvelope } from '../src/http/contracts.js';
import { serverError } from '../src/errors.js';
import { reviewedNarration } from './narration-audit-fixture.js';

// D102: authored on 07bac6ad before the CA3 production fixes; pin this file.
const summary = 'Прерывает работу для короткого отдыха.';
const npcIds = ['npc:ca3-fisher-1', 'npc:ca3-fisher-2'];
const utterance = 'Где здесь стан?';
const knownContext = 'Тропа к мельнице теперь известна.';
const scene = (extra = {}) => ({
  version: 1, schema: 'visible_context_package',
  visible_scene: 'Площадка у мельницы.', visible_changes: [],
  sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
  uncertainties: [], allowed_tensions: [], do_not_imply: [], ...extra
});
const narratorRequest = (visible_context) => ({
  version: 1, schema: 'narration_request', request_id: 'ca3',
  surface: 'turn', visible_context, context: {}
});
const npcCues = (changes) => changes.filter((value) => value.includes(summary));

function transition(npc_id, minute) {
  return { npc_routine_transition: {
    npc_id, occurred_at: { whole_minutes: String(minute),
      subminute_numerator: '0', subminute_denominator: '1' },
    proposal: { factual_transition: { summary } },
    after: { npc_id, causal_state_ref: { routine_state: { status: 'inactive' } },
      npc_snapshot: { machine_state: { current_activity: { summary } } } }
  } };
}

async function project(mode, proposals) {
  const actors = npcIds.map((instance_id) => ({ instance_id }));
  const serviceFlow = createLowerDvinaTracePhase2ServiceFlow({
    contracts: { actors, ids: {}, calendarProfile: null,
      activity: { nearest_temporal_boundary_rule: 'split_before_earliest_boundary' } },
    phase3Contracts: { actors, ids: {} }
  });
  const current = scene({
    visible_npc: npcIds.map((entity_id) => ({
      entity_ref: { entity_kind: 'npc', entity_id },
      display_label: 'рыбак', recognition: 'recognized'
    })), known_context: [knownContext]
  });
  assert.equal(validateVisibleContext(current).ok, true);
  // Real service-flow fallback chain, without substituting a helper/projector.
  const projected = await serviceFlow.createVisibleProjector().project({
    consequence: mode === 'overlay' ? {
      phase3_kind: 'conversation',
      conversation: { journal_ref: 'turn:conversation:ca3' }
    } : {
      status: 'resolved', phase3_kind: 'movement',
      position_transition: { owner: '@rus/movement-routes' }, visible_seed: {}
    },
    retrieved_state: {
      current_visible_context: current,
      npcs: npcIds.map((instance_id) => ({ instance_id,
        machine_state: { current_activity: { summary: 'Чинит сети.' } } }))
    },
    time_update: {
      temporal_results: [{ combined_change_set: { proposals } }],
      prepared_effect_ledger: { slices: [] }
    },
    mode_resolution: { decision_trace: mode === 'overlay' ? {
      remaining_intent: 'затем осматриваю берег',
      step_traces: [{ applied: true, step_index: 1, approved_plan: {
        resolution: 'direct', direct_result_kind: 'player_utterance',
        goal_result: 'pending', utterance: { utterance_text: utterance },
        operations: []
      } }]
    } : { remaining_intent: null, step_traces: [] } }
  });
  assert.equal(validateVisibleContext(projected).ok, true);
  if (mode === 'overlay') {
    assert.ok(projected.visible_changes.some((value) => value.includes(utterance)));
    assert.ok(projected.do_not_imply.includes('uncompleted_remaining_intent'));
  } else {
    assert.ok(projected.known_context.includes(knownContext));
    assert.equal(projected.visible_changes.includes(knownContext), false);
  }
  return projected;
}

for (const mode of ['overlay', 'arrival']) {
  test(`CA3 F1: ${mode} preserves equal NPC facts at separate boundaries`, async (t) => {
    const projected = await project(mode, [
      transition(npcIds[0], 1), transition(npcIds[0], 1),
      transition(npcIds[1], 2)
    ]);
    const request = narratorRequest(projected);

    await t.test('production projection retains two equal one-person cues', () => {
      const cues = npcCues(projected.visible_changes);
      assert.equal(cues.length, 2);
      assert.equal(cues[0], cues[1]);
      for (const cue of cues) {
        assert.match(cue, /^1 человек(?:\s|$)/u);
        assert.ok(cue.includes('рыбак'));
      }
    });

    await t.test('writer retains two texts with separate mandatory refs', () => {
      const changes = narrationWire(request).required_current_beat.changes
        .filter(({ text }) => text.includes(summary));
      assert.equal(changes.length, 2);
      assert.equal(changes[0].text, changes[1].text);
      assert.notEqual(changes[0].ref, changes[1].ref);
    });

    await t.test('auditor requires independent coverage of both facts', () => {
      const sources = narrationSources(request);
      const cues = sources.filter(({ text }) => text.includes(summary));
      assert.equal(cues.length, 2);
      assert.equal(cues[0].text, cues[1].text);
      assert.notEqual(cues[0].key, cues[1].key);
      assert.notEqual(cues[0].source_index, cues[1].source_index);
      assert.ok(cues.every(({ field }) => field === 'visible_changes'));
      const segments = [{ segment_id: 's1' }];
      const auditRequest = { ...request, segments };
      const coverage = Object.fromEntries(sources.map(({ key }) => [key, ['s1']]));
      assert.equal(assembleNarrationRoleOutput('gameplay_narrator_auditor',
        reviewedNarration(segments, coverage), auditRequest).pass, true);
      const omitted = assembleNarrationRoleOutput('gameplay_narrator_auditor',
        reviewedNarration(segments, { ...coverage, [cues[1].key]: [] }), auditRequest);
      assert.equal(omitted.pass, false);
      assert.ok(omitted.concerns.some(({ kind }) => kind === 'missing_visible_change'));
      assert.deepEqual(omitted.coverage.visible_changes.find(({ source_index }) =>
        source_index === cues[1].source_index), {
        source_index: cues[1].source_index, segment_ids: []
      });
    });

    await t.test('writer receives neither NPC instance IDs nor boundary metadata', () => {
      assert.doesNotMatch(JSON.stringify(narrationWire(request)),
        /npc:ca3|occurred_at|whole_minutes|subminute_numerator|subminute_denominator/u);
    });
  });

  test(`CA3 F1: ${mode} keeps same-boundary duplicate suppression at the cue owner`, async () => {
    for (const [proposals, count] of [
      [[transition(npcIds[0], 1), transition(npcIds[0], 1)], '1 человек'],
      [[transition(npcIds[0], 1), transition(npcIds[0], 1),
        transition(npcIds[1], 1)], '2 человека']
    ]) {
      const projected = await project(mode, proposals);
      const cues = npcCues(projected.visible_changes);
      assert.equal(cues.length, 1);
      assert.ok(cues[0].startsWith(`${count} `));
      const request = narratorRequest(projected);
      assert.equal(narrationWire(request).required_current_beat.changes
        .filter(({ text }) => text.includes(summary)).length, 1);
      assert.equal(narrationSources(request)
        .filter(({ text }) => text.includes(summary)).length, 1);
    }
  });
}

for (const [code, message, details] of [
  ['LLM_SETTINGS_NARRATION_QUALIFICATION_FAILED',
    'Custom LLM settings failed narration-auditor qualification.', null],
  ['LLM_SETTINGS_ORDINARY_STAGE_B_QUALIFICATION_FAILED',
    'Custom LLM settings failed ordinary-materialization qualification.',
    { failed_case_ids: ['private-qualification-case'] }]
]) {
  test(`CA3 F2: ${code} stays internal at errorEnvelope`, async (t) => {
    // Actual producer messages: a synthetic "CODE: ..." would mask the defect.
    const result = errorEnvelope(serverError(code, message, { status: 422, details }),
      { requestId: 'ca3-envelope' });
    await t.test('qualification code becomes the temporary public code', () => {
      assert.equal(result.body.error.code, 'TEMPORARY_ACTION_UNAVAILABLE');
    });
    await t.test('qualification process names become the temporary Russian message', () => {
      assert.equal(result.body.error.message,
        'Действие временно недоступно. Попробуйте ещё раз.');
    });
    await t.test('status, envelope and omission of private details are unchanged', () => {
      assert.equal(result.status, 422);
      assert.equal(result.body.request_id, 'ca3-envelope');
      assert.equal(result.body.schema, 'rus_api_error');
      assert.equal(result.body.ok, false);
      assert.deepEqual(Object.keys(result.body.error).sort(), ['code', 'message']);
      assert.doesNotMatch(JSON.stringify(result), /private-qualification-case|failed_case_ids/u);
    });
  });
}

for (const [code, status, message, expectedStatus, expectedMessage] of [
  ['OPENING_ACK_REQUIRED', 409,
    'Opening screen must be acknowledged before the first turn.', 409, 'Некорректный запрос.'],
  ['PARTY_ID_REQUIRED', 400, 'party_id is required.', 400, 'Некорректный запрос.'],
  ['SCENARIO_NOT_SUPPORTED', 409,
    'Scenario is not supported or is not ready.', 400, 'Такой старт недоступен.'],
  ['LLM_SETTINGS_APPLY_STALE', 409,
    'LLM settings apply was superseded.', 409, 'LLM settings apply was superseded.']
]) {
  test(`CA3 F2: accepted public code ${code} retains its existing envelope`, () => {
    assert.deepEqual(errorEnvelope(serverError(code, message, { status }),
      { requestId: 'ca3-control' }), {
      status: expectedStatus,
      body: { version: 1, schema: 'rus_api_error', ok: false,
        request_id: 'ca3-control', error: { code, message: expectedMessage } }
    });
  });
}
