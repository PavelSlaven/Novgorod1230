import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-fire-visible.js';
import { reviewedNarration, compatNarrationWire } from './narration-audit-fixture.js';

const goal = 'поздороваться с человеком';
const diagnosticReason = 'Диагностика: цель вне досягаемости.';
const diagnosticReasonCode = 'target_out_of_reach';

function currentState({ visibleNpc = [] } = {}) {
  return {
    actor_id: 'player',
    position: { location_ref: 'yard', g5_anchor_id: 'yard-anchor' },
    items: [],
    npcs: [],
    current_spatial_context: {
      visible_scene: 'Двор', sensory_details: [], visible_objects: [],
      visible_npc: structuredClone(visibleNpc), known_context: []
    },
    current_spatial_context_is_fresh: true,
    current_spatial_context_filters_entities: true,
    location_profiles: [{ location_profile_id: 'yard', display_name: 'Двор' }]
  };
}

function observedPerson() {
  return { entity_ref: { entity_kind: 'npc', entity_id: 'person-1' },
    display_label: 'человек', recognition: 'unrecognized' };
}

async function runWriter({ requestId, applied = true, goalResult = 'not_achieved',
  visibleNpc = [], reason, reasonCode, inspectWriter }) {
  const plan = { resolution: 'direct', goal_result: goalResult,
    operations: [], check: null, interpretation: { player_goal: goal },
    ...(reason == null ? {} : { reason }),
    ...(reasonCode == null ? {} : { reason_code: reasonCode }) };
  const visibleContext = await createLowerDvinaTraceTurnStepVisibleProjector({
    fallback: { async project() { throw new Error('Unexpected fallback projection'); } }
  }).project({
    retrieved_state: currentState({ visibleNpc }),
    consequence: { status: 'resolved', visible_seed: { completed_steps: [] } },
    mode_resolution: { decision_trace: { remaining_intent: null,
      step_traces: [{ step_index: 1, applied, approved_plan: plan }] } }
  });

  const calls = [];
  const captureDir = process.env.ISSUE_573_CAPTURE_DIR;
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: { async run(call) {
    calls.push(call.role_id);
    const wire = compatNarrationWire(JSON.parse(call.messages[1].content));
    if (captureDir) {
      await mkdir(captureDir, { recursive: true });
      const fileName = `${requestId}-${call.role_id}`.replace(/[^a-zA-Z0-9_-]/gu, '_');
      await writeFile(join(captureDir, `${fileName}.json`), JSON.stringify({
        role_id: call.role_id, messages: call.messages, overrides: call.overrides
      }, null, 2));
    }
    if (call.role_id === 'gameplay_narrator') {
      inspectWriter(wire);
      return { output: { prose: 'Вы оглядываетесь на двор.',
        action_options: [], used_references: [] } };
    }
    const refs = [...wire.required_current_beat.changes,
      ...wire.required_current_beat.uncertainties];
    return { output: reviewedNarration(wire.segments,
      Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']]))) };
  } } });

  const result = await narrator.run({ version: 1, schema: 'narration_request',
    request_id: requestId, surface: 'turn', visible_context: visibleContext, context: {} });
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls, ['gameplay_narrator', 'gameplay_narrator_auditor']);
  return visibleContext;
}

test('ожидаемо красный, issue #573: applied failed greeting reaches writer without unsupported status or cause',
  async (t) => {
    let writerWire;
    await runWriter({ requestId: 'issue-573-empty-visible-npc', inspectWriter(wire) {
      writerWire = wire;
    } });
    const changes = writerWire.required_current_beat.changes.map(({ text }) => text);

    await t.test('writer gets a cause grounded in the empty visible-NPC projection', () => {
      assert.ok(changes.some((text) => /(?:не видно|не виден|не видна|не видны|никого нет|нет видимого)/iu.test(text)
        && /(?:никого|человек|людей|адресат)/iu.test(text)),
      `No perceived absence-of-recipient fact in: ${JSON.stringify(changes)}`);
    });
    await t.test('writer gets neither status wording nor raw player intent', () => {
      const writerText = JSON.stringify(writerWire);
      assert.doesNotMatch(writerText, /Цель .* не достигнута/u);
      assert.equal(changes.includes(goal), false);
    });
  });

test('unapplied failed goal does not become a writer fact', async () => {
  await runWriter({ requestId: 'issue-573-unapplied', applied: false,
    inspectWriter(wire) {
      const writerText = JSON.stringify(wire);
      assert.doesNotMatch(writerText, /Цель .* не достигнута/u);
      assert.equal(writerText.includes(goal), false);
      assert.deepEqual(wire.required_current_beat.changes, []);
    } });
});

test('achieved goal does not acquire a failed-result cause', async () => {
  await runWriter({ requestId: 'issue-573-achieved', goalResult: 'achieved',
    inspectWriter(wire) {
      const writerText = JSON.stringify(wire);
      assert.doesNotMatch(writerText, /Цель .* не достигнута/u);
      assert.equal(writerText.includes(goal), false);
      assert.deepEqual(wire.required_current_beat.changes, []);
    } });
});

test('diagnostic reason and reason_code are not writer evidence', async () => {
  await runWriter({ requestId: 'issue-573-diagnostic-reason',
    visibleNpc: [observedPerson()], reason: diagnosticReason,
    reasonCode: diagnosticReasonCode, inspectWriter(wire) {
      const writerText = JSON.stringify(wire);
      assert.equal(writerText.includes(diagnosticReason), false);
      assert.equal(writerText.includes(diagnosticReasonCode), false);
      assert.doesNotMatch(writerText, /вне досягаемости|слишком далеко/u);
    } });
});
