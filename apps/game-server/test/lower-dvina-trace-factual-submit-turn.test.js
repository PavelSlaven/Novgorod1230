import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { spatialResult } from '@rus/turn';
import { validateTerminalNarrationPolicyRejection } from '@rus/narration';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { bundle, fixture, fixtureOpeningCurrentVisibleContext } from
  './lower-dvina-trace-phase-2-fixture.js';
import { reviewedNarration } from './narration-audit-fixture.js';

test('submitTurn uses durable factual delivery after narrator rejection with a starting NPC', async () => {
  const f = fixture({ llmDiagnostics: createLlmDiagnostics(), narrationFails: true });
  const start = f.state.position;
  f.state.npcs.push({ instance_id: 'npc-at-start',
    location_ref: start.location_ref, anchor_id: start.g5_anchor_id,
    zone_ref: start.zone_ref, profile_level: 'background',
    identity_state: { public_role_label: 'человек', appearance: null },
    machine_state: { current_activity: { summary: 'стоит у берега' } } });
  f.state.current_visible_context = fixtureOpeningCurrentVisibleContext({
    state: f.state, materializationBundle: bundle
  });

  let envelope = null;
  let writerRequest = null;
  let rejectionFlow = null;
  const roleCalls = [];
  const productionNarrationService = createLowerDvinaTraceNarrationService({
    roleRunner: { async run(call) {
      roleCalls.push(structuredClone(call));
      const wire = JSON.parse(call.messages[1].content);
      if (call.role_id === 'gameplay_narrator') return { output: {
        prose: 'Вы осмотрели берег и увидели стоящего рядом человека.',
        action_options: [], used_references: []
      } };
      if (call.role_id === 'gameplay_narrator_auditor') return { output: {
        ...reviewedNarration(wire.segments),
        unsupported: [{ segment_choice: 's1', kind: 'unsupported_fact',
          reason: 'Контрольный отказ fixture payload capture.' }], evidence: []
      } };
      if (call.role_id === 'gameplay_narrator_semantic_repair') return { output: {
        replacements: [{ prose: 'У берега стоит человек; вы осматриваете следы.' }]
      } };
      throw new Error(`unexpected narration role ${call.role_id}`);
    } }
  });
  let durableError = null;
  let claimCalls = 0;
  const finalized = [];
  const durableNarrator = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: { async query() { return { rows: [envelope] }; } },
    narrationService: { async run(request, options) {
      writerRequest = structuredClone(request);
      rejectionFlow = await productionNarrationService.run(request, options);
      return rejectionFlow;
    } },
    recordDiagnosticFailure(error) { durableError = error; },
    presentationStore: {
      async claimPresentationAttempt() {
        claimCalls += 1;
        return { ok: true, disposition: 'claimed', attempt_id: 'attempt-1',
          claim_token: 'claim-1' };
      },
      async finalizeFactualPresentationAttempt(input) {
        finalized.push(input);
        return { ok: true, presentation_status: 'factual_delivered' };
      },
      async finalizePresentationAttempt(input) {
        throw new Error(`unexpected non-factual presentation finalization: ${input.presentation_status}`);
      }
    }
  });

  let replayAttempts = 0;
  f.repository.replayPhase2Turn = async ({ replay }) => {
    replayAttempts += 1;
    const committedState = await f.repository.loadPhase2State(f.partyId);
    const visibleContext = committedState.current_visible_context;
    const visiblePayload = visiblePayloadFrom(visibleContext);
    const packageId = `package:${replay.factual.mode_resolution.turn_id}`;
    const packageDigest = computeSpatialV3CanonicalDigest(visiblePayload);
    const snapshotPayload = structuredClone(committedState);
    snapshotPayload.scenario_id ??= 'lower_dvina_trace_v1';
    snapshotPayload.items = [];
    snapshotPayload.containers = [];
    snapshotPayload.container_profiles = [];
    snapshotPayload.container_placements = [];
    snapshotPayload.last_turn = {
      request_id: replay.factual.player_input.request_id,
      idempotency_key: replay.factual.player_input.idempotency_key,
      raw_text: replay.factual.player_input.raw_text,
      received_at: replay.factual.player_input.received_at,
      option_id: replay.factual.mode_resolution.option_id,
      consequence: structuredClone(replay.factual.consequence),
      check_result: structuredClone(replay.factual.consequence.check_result ?? null),
      time_update: structuredClone(replay.factual.time_update),
      body_update: structuredClone(replay.factual.body_update),
      visible_package: { package_id: packageId, package_digest: packageDigest }
    };
    envelope = { party_id: f.partyId, turn_id: replay.factual.mode_resolution.turn_id,
      package_id: packageId,
      committed_state_version: snapshotPayload.party_state.state_version,
      package_digest: packageDigest, visible_payload: visiblePayload,
      snapshot_payload: snapshotPayload,
      state_digest: canonicalDigest(snapshotPayload), dependency_pins: {} };

    const request = { version: 1, schema: 'narration_request', party_id: f.partyId,
      request_id: envelope.turn_id,
      delivery_turn_number: snapshotPayload.party_state.turn_number,
      surface: 'turn', visible_context: visibleContext,
      context: { attempt: { text: replay.factual.player_input.raw_text },
        outcome: spatialResult({ consequence: replay.factual.consequence }) },
      style_policy: { preserve_uncertainty: true, no_new_world_facts: true },
      max_repairs: 1 };
    let narration;
    try { narration = await durableNarrator.run(request); }
    catch (error) { durableError = error; throw error; }
    assert.ok(narration.factual_delivery,
      'the real durable narrator should return its built factual screen');
    return { party_id: f.partyId, turn_number: snapshotPayload.party_state.turn_number,
      state_version: snapshotPayload.party_state.state_version,
      screen: narration.factual_delivery };
  };

  const result = await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'phase2-factual-npc-start',
    idempotency_key: 'phase2-factual-npc-start',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } });

  assert.equal(f.commitCount(), 1);
  assert.equal(replayAttempts, 1);
  assert.ok(writerRequest, `narration service not called; claimCalls=${claimCalls}`);
  assert.ok(writerRequest.visible_context.visible_npc.some(({ entity_ref }) =>
    entity_ref.entity_id === 'npc-at-start'),
  'the production narration request must contain the visible starting NPC');
  assert.deepEqual(roleCalls.map(({ role_id }) => role_id), [
    'gameplay_narrator', 'gameplay_narrator_auditor',
    'gameplay_narrator_semantic_repair', 'gameplay_narrator_auditor'
  ]);
  const writerWire = JSON.parse(roleCalls[0].messages[1].content);
  const auditWire = JSON.parse(roleCalls[1].messages[1].content);
  assert.equal(JSON.stringify(writerWire.required_current_beat).includes('npc-at-start'), false,
    'the static NPC is not a required current beat');
  assert.equal(JSON.stringify(writerWire.optional_support).includes('npc-at-start'), true,
    'the fixture shows the static NPC only as optional support');
  assert.equal(JSON.stringify(auditWire.optional_support).includes('npc-at-start'), true,
    'the auditor receives the same optional NPC support as the writer');
  assert.deepEqual(validateTerminalNarrationPolicyRejection(rejectionFlow,
    writerRequest), { ok: true, errors: [] });
  assert.equal(claimCalls, 1);
  assert.equal(finalized.length, 1, `durableError=${durableError?.code ?? durableError?.message ?? 'none'}`);
  assert.equal(finalized[0].factual_screen.schema, 'factual_turn_delivery_screen');
  assert.ok(finalized[0].factual_screen.visible_context.visible_npc.some(
    ({ entity_ref }) => entity_ref.entity_id === 'npc-at-start'),
  'the factual player-safe payload must preserve that NPC');
  assert.equal(result.screen.schema, 'factual_turn_delivery_screen');
  assert.ok(result.screen.visible_context.visible_scene.trim().length > 0,
    'the factual delivery must contain player-visible text');
  assert.equal(result.screen.visible_context.visible_scene,
    writerRequest.visible_context.visible_scene);
});

function visiblePayloadFrom(context) {
  return { schema: 'temporal_visible_package.v1',
    perceived_scene: context.visible_scene,
    perceived_changes: structuredClone(context.visible_changes),
    sensory_details: structuredClone(context.sensory_details),
    visible_npcs: structuredClone(context.visible_npc),
    visible_objects: structuredClone(context.visible_objects),
    known_context: structuredClone(context.known_context),
    uncertainties: structuredClone(context.uncertainties),
    hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
}
