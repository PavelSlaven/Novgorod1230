import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePlayerSafeVisiblePayload } from '@rus/contracts/spatial-v3/registry';
import { buildLowerDvinaTraceTurnStepVisibleEnvelope } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-state.js';
import { phase2VisibleContextFromPayload } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { loadPhase2VisibleContext } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-visible-context.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { fixture } from './lower-dvina-trace-turn-step-commit-fixture.js';

function visibleContext(currentLightPhase) {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: 'Опушка', visible_changes: ['Вы рассмотрели деревья.'],
    sensory_details: ['Различимы очертания деревьев.'], visible_npc: [],
    visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: [],
    current_light_phase: currentLightPhase };
}

test('committed calendar phase survives player-safe package and retry readback', async () => {
  for (const phase of ['daylight', 'civil_dusk']) {
    const envelope = buildLowerDvinaTraceTurnStepVisibleEnvelope({
      partyId: 'party', turnNumber: 1, nextVersion: 1,
      changeSetId: 'change:1', idemId: 'idem:1', currentLightPhase: phase,
      envelope: { root_turn_id: 'turn:1', visible_context: visibleContext(phase),
        loop_trace: { clarification: null }, consequence: { state_changes: [] } }
    });
    assert.deepEqual(validatePlayerSafeVisiblePayload(envelope.visible_payload), []);
    assert.equal(phase2VisibleContextFromPayload(envelope.visible_payload)
      .current_light_phase, phase);
    assert.equal(typeof envelope.package_digest, 'string');
    const replay = await loadPhase2VisibleContext({ async query({ values }) {
      assert.deepEqual(values, [envelope.package_id, envelope.package_digest]);
      return { rowCount: 1, rows: [{ visible_payload: envelope.visible_payload,
        package_digest: envelope.package_digest }] };
    } }, { commit: envelope });
    assert.equal(replay.current_light_phase, phase);
  }
});

test('turn commit projects the post-turn clock through the pinned Temporal owner', async () => {
  const f = fixture({ direct: true });
  const clocks = [];
  await f.commit({ projectEnvironmentAtClock({ state, clock }) {
    assert.equal(state.actor_id, f.state.actor_id);
    clocks.push(clock);
    return { light_state: 'daylight' };
  } });
  assert.deepEqual(clocks, [f.envelope.time_update.clock_after]);
  const visible = f.plans[0].appends.find(({ target_table }) =>
    target_table === 'party_visible_packages').record;
  assert.equal(visible.visible_payload.current_light_phase, 'daylight');
});

test('narration repairs unsupported local dimness under daylight using persisted phase', async () => {
  const calls = [];
  const narration = createLowerDvinaTraceNarrationService({ roleRunner: {
    async run(call) {
      const request = JSON.parse(call.messages[1].content);
      calls.push([call.role_id, request.current_light_phase]);
      assert.equal(request.current_light_phase, 'daylight');
      assert.equal(request.optional_support?.current_light_phase, undefined);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: 'В полумраке вы различаете очертания деревьев.' } };
      if (call.role_id === 'gameplay_narrator_auditor') {
        const segment = request.segments[0].segment_id;
        const bad = request.output.prose.includes('полумраке');
        return { output: { reviewed_segments: [segment],
          source_reviews: [{ ref: 'visible_change_1', segment_choices: bad ? [] : [segment] }],
          unsupported: bad ? [{ segment_choice: segment,
            kind: 'unsupported_sensory', reason: 'No supplied local dimness.' }] : [],
          literary_failures: [], evidence: bad ? [] : ['Grounded prose.'] } };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        assert.match(call.messages[0].content, /current_light_phase.*calendar daylight phase/u);
        return { output: { replacements: [{ prose: 'Вы рассмотрели деревья и различили их очертания.' }] } };
      }
      throw new Error(`Unexpected role ${call.role_id}`);
    }
  } });
  const result = await narration.run({ version: 1, schema: 'narration_request',
    request_id: 'light:1', surface: 'turn', visible_context: visibleContext('daylight'),
    context: {} });
  assert.equal(result.status, 'approved');
  assert.equal(result.approved_output.prose, 'Вы рассмотрели деревья и различили их очертания.');
  assert.deepEqual(calls.map(([role]) => role), ['gameplay_narrator',
    'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair',
    'gameplay_narrator_auditor']);
});
