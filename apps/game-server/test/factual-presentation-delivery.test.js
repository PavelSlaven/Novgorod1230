import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createFactualTurnDeliveryScreenReadModel } from '@rus/presentation';
import { buildFactualTurnDelivery, validFactualTurnDelivery } from
  '../src/infrastructure/postgres/factual-presentation-delivery.js';
import { createTemporalPresentationPostgresStore } from
  '../src/infrastructure/postgres/temporal-presentation-store.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';

const payload = { perceived_scene: 'Берег.', perceived_changes: ['Вода ушла.'],
  sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
  uncertainties: ['Даль скрыта туманом.'] };
const envelope = { party_id: 'party', package_id: 'package', turn_id: 'turn',
  committed_state_version: 39,
  package_digest: computeSpatialV3CanonicalDigest(payload), visible_payload: payload };
const visible = { version: 1, schema: 'visible_context_package',
  visible_scene: payload.perceived_scene, visible_changes: payload.perceived_changes,
  sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
  uncertainties: payload.uncertainties, allowed_tensions: [], do_not_imply: [] };
const request = { version: 1, schema: 'narration_request', party_id: 'party',
  request_id: 'turn', delivery_turn_number: 7, surface: 'turn', visible_context: visible };

function narrator({ flow, store, calls = { run: 0 } }) {
  const client = { async query() { return { rows: [envelope] }; }, release() {} };
  return { calls, service: createLowerDvinaTracePhase2DurableNarrator({
    partyPool: { query: client.query.bind(client), connect(callback) { callback(null, client, () => {}); } },
    narrationService: { async run() { calls.run += 1; return flow; } }, presentationStore: store
  }) };
}

const output = { version: 1, schema: 'narration_output', output_id: 'turn',
  prose: 'Берег.', action_options: [], used_references: [], self_check: {} };
const concern = { segment_id: 's1', kind: 'unsupported_fact', reason: 'Нет опоры.' };
const failedAudit = { version: 1, schema: 'narration_audit', pass: false,
  artistic_verdict: 'pass', technical_verdict: 'pass', concerns: [concern], evidence: [],
  coverage: { visible_changes: [{ source_index: 0, segment_ids: ['s1'] }],
    uncertainties: [{ source_index: 0, segment_ids: ['s1'] }] } };
const repair = { version: 1, schema: 'narration_semantic_repair',
  replacements: [{ segment_id: 's1', prose: output.prose }] };
const rejected = { version: 1, schema: 'narration_flow_result', request_id: 'turn',
  surface: 'turn', status: 'blocked', pass: false, approved_output: null, final_audit: null,
  generation_history: [{ role: 'writer', value: output },
    { role: 'semantic_repairer', value: repair }],
  repair_history: [{ role: 'semantic_repair', value: repair }],
  audit_history: [{ role: 'auditor', value: failedAudit }, { role: 'auditor', value: failedAudit }],
  diagnostics: { phase: 'final_audit_failed', errors: [concern], repairs_used: 1 } };

test('final audited policy rejection terminally delivers one factual screen', async () => {
  const finalized = [];
  const { service } = narrator({ flow: rejected, store: {
    async claimPresentationAttempt() { return { ok: true, disposition: 'claimed', attempt_id: 'a', claim_token: 'c' }; },
    async finalizeFactualPresentationAttempt(input) { finalized.push(input); return { ok: true, presentation_status: 'factual_delivered' }; }
  } });
  const result = await service.run(request);
  assert.equal(result.factual_delivery.schema, 'factual_turn_delivery_screen');
  assert.deepEqual(result.factual_delivery.visible_changes, payload.perceived_changes);
  assert.equal(finalized.length, 1);
  assert.equal(finalized[0].factual_screen.input_panel.input_contract, 'intent_not_fact');
});

test('factual terminal replay does not call the narrator and rejects leaks', async () => {
  const factual = createFactualTurnDeliveryScreenReadModel({ partyId: 'party', turnId: 'turn',
    turnNumber: 7, packageId: 'package', committedStateVersion: 39,
    visibleContext: visible, visibleChanges: payload.perceived_changes,
    uncertainties: payload.uncertainties, panels: {} });
  const calls = { run: 0 };
  const { service } = narrator({ calls, flow: rejected, store: {
    async claimPresentationAttempt() { return { ok: true, disposition: 'factual_delivered', factual_screen: factual }; }
  } });
  assert.deepEqual((await service.run(request)).factual_delivery, factual);
  assert.equal(calls.run, 0);
  const leaking = { ...factual, main_prose: 'forbidden' };
  const invalid = narrator({ flow: rejected, store: {
    async claimPresentationAttempt() { return { ok: true, disposition: 'factual_delivered', factual_screen: leaking }; }
  } });
  await assert.rejects(invalid.service.run(request), { code: 'TRACE_PHASE_2_PRESENTATION_INVALID' });
});

test('factual admission binds its package identity and full visible projection', () => {
  const factual = createFactualTurnDeliveryScreenReadModel({ partyId: 'party', turnId: 'turn',
    turnNumber: 7, packageId: 'package', committedStateVersion: 39,
    visibleContext: visible, visibleChanges: payload.perceived_changes,
    uncertainties: payload.uncertainties, panels: {} });
  assert.equal(validFactualTurnDelivery(factual, envelope), true);
  for (const changed of [
    { ...factual, party_id: 'other-party' },
    { ...factual, turn_id: 'other-turn' },
    { ...factual, package_id: 'other-package' },
    { ...factual, committed_state_version: '40' },
    { ...factual, visible_context: { ...visible, visible_scene: 'Другое место.' } },
    { ...factual, visible_changes: [] },
    { ...factual, uncertainties: [] }
  ]) assert.equal(validFactualTurnDelivery(changed, envelope), false);
});

test('factual builder refuses an envelope with a bad package digest', () => {
  assert.throws(() => buildFactualTurnDelivery({ envelope: {
    ...envelope, package_digest: 'bad-package-digest'
  }, visibleContext: visible, requestVisibleContext: visible, turnNumber: 7 }),
  { code: 'TRACE_PHASE_2_PRESENTATION_INVALID' });
});

test('store rejects a changed factual screen before its terminal update', async () => {
  const calls = [];
  const factual = createFactualTurnDeliveryScreenReadModel({ partyId: 'party', turnId: 'turn',
    turnNumber: 7, packageId: 'package', committedStateVersion: 39,
    visibleContext: visible, visibleChanges: payload.perceived_changes,
    uncertainties: payload.uncertainties, panels: {} });
  const client = { async query(sql) {
    calls.push(String(sql));
    if (String(sql).includes('party_visible_packages')) return { rowCount: 1, rows: [envelope] };
    if (String(sql).includes('party_narration_jobs')) return { rowCount: 1, rows: [{
      job_id: 'job', state_version: 1, next_attempt_ordinal: 2
    }] };
    return { rowCount: 1, rows: [] };
  }, release() {} };
  const store = createTemporalPresentationPostgresStore({ pool: {
    async query() {}, async connect() { return client; }
  } });
  await assert.rejects(store.finalizeFactualPresentationAttempt({ party_id: 'party',
    package_id: 'package', package_digest: envelope.package_digest,
    presentation_idempotency_key: 'presentation:package:' + envelope.package_digest,
    attempt_id: 'job:attempt:1', claim_token: 'claim:job:1',
    factual_screen: { ...factual, uncertainties: [] } }),
  /factual screen identity is invalid/);
  assert.equal(calls.some((sql) => sql.includes("SET status='delivered',delivery_mode='factual'")), false);
});

test('non-terminal and provider failures remain retryable', async () => {
  const attempts = [];
  const { service } = narrator({ flow: { ...rejected, audit_history: [{}] }, store: {
    async claimPresentationAttempt() { return { ok: true, disposition: 'claimed', attempt_id: 'a', claim_token: 'c' }; },
    async finalizePresentationAttempt(input) { attempts.push(input); return { ok: true }; }
  } });
  await assert.rejects(service.run(request), { code: 'TRACE_PHASE_2_NARRATION_REJECTED' });
  assert.equal(attempts[0].presentation_status, 'failed_retryable');
});
