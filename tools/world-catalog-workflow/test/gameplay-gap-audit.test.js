import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGameplayGapBacklog, validateGameplayGapAudit,
  validateGameplayGapSaturation } from '../src/gameplay-gap-audit.js';

function trace(id = 'trace-1', accepted = true, campaign_id = 'campaign-1') {
  return { trace_ref: id, campaign_id, explorer_ref: 'explorer:one',
    producer_ref: 'producer:gameplay', accepted, retrieved_claim_refs: ['claim:water'],
    code_mechanics_refs: ['owner:body'], replay_of_gap_ids: [] };
}
function record(overrides = {}) {
  return { gap_id: 'gap-1', campaign_id: 'campaign-1', trace_ref: 'trace-1',
    scenario_summary: 'water and fire', required_factual_premise: 'water-cools',
    gap_class: 'RETRIEVAL_GAP', domain: 'physics', proposed_family: 'heat',
    consumer: 'turn_step_planner', severity: 'P1',
    why_current_WK_is_insufficient: 'claim was not supplied',
    retrieved_claim_refs: ['claim:water'], possible_existing_claim_refs: [],
    historical_or_universal: 'universal', code_owner_if_not_WK: '',
    research_status: 'new', resolution_status: 'open', regression_ref: '',
    premises: [{ premise_ref: 'water-cools', required: true, used_or_implied: true,
      classification: 'RETRIEVAL_GAP', world_knowledge_claim_refs: ['claim:water'],
      code_mechanics_refs: [] }], ...overrides };
}
function assessment(trace_ref, premise = { premise_ref: 'water-cools', required: true,
  used_or_implied: true, classification: 'COVERED_BY_WORLD_KNOWLEDGE',
  world_knowledge_claim_refs: ['claim:water'], code_mechanics_refs: [] }) {
  return { trace_ref, auditor_ref: 'independent:auditor', premises: [premise] };
}
function audit(records = [record()], assessments = [assessment('trace-1')]) {
  return { schema: 'world_knowledge_gameplay_gap_audit_v1', auditor_ref: 'independent:auditor',
    records, trace_assessments: assessments };
}

test('gap backlog accepts independent structured finding linked to actual trace', () => {
  const result = buildGameplayGapBacklog({ auditor_output: audit(), traces: [trace()] });
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.records, [record()]);
  assert.equal(Object.isFrozen(result), true);
});

test('development CLI writes backlog and rejects an unassessed campaign', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wk-gap-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const campaignPath = join(directory, 'campaign.json');
  const auditPath = join(directory, 'audit.json');
  await writeFile(campaignPath, JSON.stringify({
    schema: 'world_knowledge_gameplay_campaign_v1', turns: [trace()] }));
  await writeFile(auditPath, JSON.stringify(audit()));
  const run = () => spawnSync(process.execPath, [
    fileURLToPath(new URL('../src/cli.js', import.meta.url)),
    'build-gameplay-gap-backlog', '--campaign', campaignPath, '--audit', auditPath
  ], { encoding: 'utf8' });
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).records[0].gap_id, 'gap-1');
  await writeFile(auditPath, JSON.stringify(audit([], [])));
  const bad = run();
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).status, 'blocked');
});

test('used or implied unsupported premise cannot masquerade as covered', () => {
  const bad = record({ premises: [{ premise_ref: 'unsupported', required: true,
    used_or_implied: true, classification: 'COVERED_BY_WORLD_KNOWLEDGE',
    world_knowledge_claim_refs: [], code_mechanics_refs: [] }] });
  const errors = validateGameplayGapAudit({ auditor_output: audit([bad], [assessment('trace-1', {
    premise_ref: 'unsupported', required: false, used_or_implied: true,
    classification: 'COVERED_BY_WORLD_KNOWLEDGE', world_knowledge_claim_refs: [],
    code_mechanics_refs: [] })]), traces: [trace()] });
  assert.match(errors.join('\n'), /used\/implied unsupported premise/);
  assert.match(errors.join('\n'), /WK coverage lacks claim ref/);
});

test('auditor cannot omit a finding for a trace premise classified as a gap', () => {
  const errors = validateGameplayGapAudit({ auditor_output: audit([], [assessment('trace-1', {
    premise_ref: 'missing', required: true, used_or_implied: true,
    classification: 'CORPUS_GAP', world_knowledge_claim_refs: [], code_mechanics_refs: [] })]),
  traces: [trace()] });
  assert.match(errors.join('\n'), /lacks finding record/);
});

test('auditor cannot cite claim or mechanics owner absent from trace', () => {
  const bad = record({ retrieved_claim_refs: ['claim:invented'], premises: [{
    premise_ref: 'p', required: true, used_or_implied: true,
    classification: 'COVERED_BY_CODE_MECHANICS', world_knowledge_claim_refs: [],
    code_mechanics_refs: ['owner:invented'] }] });
  const errors = validateGameplayGapAudit({ auditor_output: audit([bad], [assessment('trace-1', {
    premise_ref: 'p', required: true, used_or_implied: true,
    classification: 'COVERED_BY_CODE_MECHANICS', world_knowledge_claim_refs: [],
    code_mechanics_refs: ['owner:invented'] })]), traces: [trace()] });
  assert.match(errors.join('\n'), /absent from trace/);
});

test('saturation needs three nonempty independent unseen campaigns after P0/P1 replay', () => {
  const replay = trace('replay', true, 'repair'); replay.replay_of_gap_ids = ['gap-1'];
  const closed = record({ campaign_id: 'repair', severity: 'P1', research_status: 'verified',
    trace_ref: 'replay', resolution_status: 'replayed', regression_ref: 'replay',
    replay_outcome: 'committed', replay_reason: 'The required premise is supplied to the committed replay.' });
  const campaigns = ['one', 'two', 'three'].map((campaign_id, index) => ({
    campaign_id, sequence: index + 1, independent_unseen: true,
    after_p0_p1_fix_ref: 'fix:1', trace_refs: [`trace-${index + 1}`],
    new_gap_ids: [], audited_gap_ids: [] }));
  const traces = [replay, ...campaigns.map((campaign, index) => trace(`trace-${index + 1}`, true, campaign.campaign_id))];
  const audited = audit([closed], traces.map((item) => assessment(item.trace_ref)));
  assert.equal(validateGameplayGapSaturation({ campaigns, records: [closed], traces,
    auditor_output: audited, last_p0_p1_fix_ref: 'fix:1' }).verdict, 'PASS');
  assert.equal(validateGameplayGapSaturation({ campaigns: campaigns.slice(1), records: [closed], traces,
    auditor_output: audited, last_p0_p1_fix_ref: 'fix:1' }).verdict, 'BLOCK');
});

test('saturation blocks accepted unsupported premise, empty campaign, and unresolved critical gap', () => {
  const badTrace = trace();
  const result = validateGameplayGapSaturation({ campaigns: [{ campaign_id: 'empty',
    sequence: 1, independent_unseen: true, after_p0_p1_fix_ref: 'fix:1', trace_refs: [], new_gap_ids: [], audited_gap_ids: [] },
  { campaign_id: 'two', sequence: 2, independent_unseen: true, after_p0_p1_fix_ref: 'fix:1',
    trace_refs: ['trace-1'], new_gap_ids: [], audited_gap_ids: [] }, { campaign_id: 'three',
    sequence: 3, independent_unseen: true, after_p0_p1_fix_ref: 'fix:1', trace_refs: ['trace-1'], new_gap_ids: [], audited_gap_ids: [] }],
  records: [record()], traces: [badTrace], auditor_output: audit([record()], [assessment('trace-1', {
    premise_ref: 'p', required: false, used_or_implied: true, classification: 'CORPUS_GAP',
    world_knowledge_claim_refs: [], code_mechanics_refs: [] })]), last_p0_p1_fix_ref: 'fix:1' });
  assert.equal(result.verdict, 'BLOCK');
  assert.match(result.errors.join('\n'), /empty campaign/);
  assert.match(result.errors.join('\n'), /unresolved P0\/P1/);
  assert.match(result.errors.join('\n'), /unsupported premise/);
});

test('saturation blocks repeated trace, omitted critical finding, and non-independent assessment', () => {
  const critical = record({ campaign_id: 'one', severity: 'P0' });
  const runs = ['one', 'two', 'three'].map((campaign_id, index) => ({ campaign_id,
    sequence: index + 1, independent_unseen: true, after_p0_p1_fix_ref: 'fix:1',
    trace_refs: ['trace-1'], new_gap_ids: [], audited_gap_ids: [] }));
  const independentFailure = audit([critical], [{ ...assessment('trace-1'), auditor_ref: 'explorer:one' }]);
  const result = validateGameplayGapSaturation({ campaigns: runs, records: [critical],
    traces: [trace()], auditor_output: independentFailure, last_p0_p1_fix_ref: 'fix:1' });
  assert.match(result.errors.join('\n'), /repeats/);
  assert.match(result.errors.join('\n'), /audited_gap_ids/);
  assert.match(result.errors.join('\n'), /critical finding/);
  assert.match(result.errors.join('\n'), /not independent/);
});

test('P2 can close only through replay or independently bounded disputed limit', () => {
  const limited = record({ severity: 'P2', gap_class: 'AMBIGUOUS_OR_DISPUTED_REAL_WORLD_KNOWLEDGE',
    resolution_status: 'bounded_limit', limit_reason: 'sources disagree',
    limit_auditor_ref: 'independent:limits' });
  const limitedAudit = audit([limited], [assessment('trace-1', { premise_ref: 'water-cools',
    required: true, used_or_implied: true,
    classification: 'AMBIGUOUS_OR_DISPUTED_REAL_WORLD_KNOWLEDGE',
    world_knowledge_claim_refs: [], code_mechanics_refs: [] })]);
  assert.deepEqual(validateGameplayGapAudit({ auditor_output: limitedAudit, traces: [trace()] }), []);
  const open = { ...limited, resolution_status: 'open' };
  const openAudit = audit([open], limitedAudit.trace_assessments);
  const backlog = buildGameplayGapBacklog({ auditor_output: openAudit, traces: [trace()] });
  assert.equal(backlog.status, 'ready');
  assert.deepEqual(backlog.records, [open]);
  assert.match(validateGameplayGapSaturation({ auditor_output: openAudit,
    records: [open], traces: [trace()], last_p0_p1_fix_ref: 'fix:1' }).errors.join('\n'),
  /unresolved P2/);
  limited.limit_auditor_ref = 'explorer:one';
  assert.match(validateGameplayGapAudit({ auditor_output: limitedAudit,
    traces: [trace()] }).join('\n'), /independently accepted bounded_limit/);
});

test('a corrective rejection can close a gap only with its observed error and independent reason', () => {
  const replay = trace('replay', false, 'repair');
  replay.replay_of_gap_ids = ['gap-1'];
  replay.events = [{ error: { code: 'TURN_ORDINARY_DISCOVERY_UNRESOLVED' } }];
  const closed = record({ resolution_status: 'replayed', regression_ref: 'replay',
    replay_outcome: 'rejected', replay_error_code: 'TURN_ORDINARY_DISCOVERY_UNRESOLVED',
    replay_reason: 'Unresolved prerequisite now rejects before commit instead of empty completion.' });
  const input = { traces: [trace(), replay],
    auditor_output: audit([closed], [assessment('trace-1'), assessment('replay')]) };
  assert.deepEqual(validateGameplayGapAudit(input), []);
  replay.events[0].error.code = 'UNRELATED_PROVIDER_FAILURE';
  assert.match(validateGameplayGapAudit(input).join('\n'), /known replay trace outcome/);
  replay.events[0].error.code = closed.replay_error_code;
  replay.accepted = true;
  assert.match(validateGameplayGapAudit(input).join('\n'), /known replay trace outcome/);
});

test('partial evidence for a used gap cannot count as supported saturation', () => {
  const runs = ['one', 'two', 'three'].map((campaign_id, index) => ({ campaign_id,
    sequence: index + 1, independent_unseen: true, after_p0_p1_fix_ref: 'fix:1',
    trace_refs: [`trace-${index + 1}`], new_gap_ids: [],
    audited_gap_ids: index === 0 ? ['gap-1'] : [] }));
  const traces = runs.map((run, index) => trace(`trace-${index + 1}`, true, run.campaign_id));
  const limited = record({ campaign_id: 'one', severity: 'P2', resolution_status: 'bounded_limit',
    limit_reason: 'Available claim supports only part of the asserted premise.',
    limit_auditor_ref: 'independent:limits' });
  const assessments = traces.map(item => assessment(item.trace_ref));
  assessments[0].premises[0].classification = 'RETRIEVAL_GAP';
  const result = validateGameplayGapSaturation({ campaigns: runs, records: [limited], traces,
    auditor_output: audit([limited], assessments), last_p0_p1_fix_ref: 'fix:1' });
  assert.equal(result.verdict, 'BLOCK');
  assert.match(result.errors.join('\n'), /unsupported premise/);
});
