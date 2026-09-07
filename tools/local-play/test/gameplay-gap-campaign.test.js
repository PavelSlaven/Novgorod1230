import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameplayGapExplorer, runGameplayGapCampaign } from '../gameplay-gap-campaign.mjs';

test('development explorer makes a separate generative call from current safe context', async () => {
  const next = createGameplayGapExplorer({ focus: 'weather and materials', excludedIntents: ['prior'],
    roleRunner: { async run(input) {
      assert.match(input.request_identity, /^development-explorer:/u);
      assert.match(input.messages[0].content, /not the game resolver/u);
      const data = JSON.parse(input.messages[1].content);
      assert.deepEqual(data.screen, { visible: 'rain' });
      assert.deepEqual(data.excluded_intents, ['prior']);
      return { output: { raw_text: 'Осматриваю мокрую ткань.', probe_family: 'wet fibres' } };
    } } });
  assert.equal((await next({ campaign_id: 'fresh', turn_index: 0, screen: { visible: 'rain' } })).probe_family, 'wet fibres');
});

test('campaign drives HTTP, separates explorer context, and retains actual private boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gameplay-gap-test-'));
  const inputs = []; let stopped = false, turnRequests = 0;
  const report = await runGameplayGapCampaign({ outputDirectory: directory,
    campaignId: 'unseen-test', explorerRef: 'independent-explorer', turns: 1,
    replayGapIdsByTurn: [['gap:observed']],
    snapshot: () => ({ head: 'a'.repeat(40), dirty: false }),
    start: async ({ env }) => {
      assert.equal(env.RUS_DEVELOPER_MODE, 'true');
      return { url: 'http://127.0.0.1:1234', child: { kill() { stopped = true; } } };
    },
    nextIntent: async context => {
      assert.deepEqual(Object.keys(context).sort(), ['campaign_id', 'previous_intents', 'screen', 'turn_index']);
      assert.equal(context.screen.visible, 'bank');
      return { raw_text: 'Examine a different ordinary object.', probe_family: 'material observation' };
    },
    fetchImpl: async (url, request) => {
      inputs.push({ url, request });
      if (url.endsWith('/turns') && ++turnRequests === 1) {
        return { status: 500, json: async () => ({ ok: false,
          error: { code: 'TEMPORARY_ACTION_UNAVAILABLE' } }) };
      }
      const data = url.endsWith('/new-games') ? { party_id: 'party:test' }
        : url.endsWith('/screen') ? { visible: 'bank' }
          : { screen: { screen_status: 'ready' } };
      return { status: url.endsWith('/new-games') ? 201 : 200,
        json: async () => ({ ok: true, data }) };
    },
    readTrace: async ({ requestId, attempts }) => {
      assert.equal(attempts, 2);
      return [{ event: 'turn.failed', error: { code: 'TEMPORARY_PROVIDER_FAILURE' },
        llm: { gameplay_traces: [], calls: [] } },
      { event: 'turn.completed', input: { request_id: requestId },
      llm: { gameplay_traces: [{ event: 'turn_context', authoritative_context: { hidden: 'private' } },
        { event: 'world_knowledge_resolved', consumer_request: { world_knowledge: {
          facts: [{ claim_ref: 'claim:actual' }], hard_constraints: [] } } },
        { event: 'owner_commit_completed', result: { committed: true } }],
      calls: [{ role_id: 'turn_step_planner', request: { messages: [] },
        response: { parsed_json: { result: 'inspect' }, reasoning_content: 'must-not-forward' } }] } }];
    }
  });
  assert.equal(stopped, true);
  assert.equal(report.status, 'captured');
  assert.equal(report.exploration_kind, 'regression');
  assert.deepEqual(report.turns[0].replay_of_gap_ids, ['gap:observed']);
  assert.equal(report.turns[0].accepted, true);
  assert.equal(report.turns[0].commit_status, 'committed');
  assert.equal(report.turns[0].presentation_status, 'completed');
  assert.deepEqual(report.turns[0].retrieved_claim_refs, ['claim:actual']);
  assert.ok(inputs.some(({ url, request }) => url.endsWith('/turns') && request.method === 'POST'));
  const attempts = inputs.filter(({ url }) => url.endsWith('/turns'));
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].request.body, attempts[1].request.body);
  const saved = await readFile(join(directory, 'campaign.json'), 'utf8');
  assert.equal(saved.includes('must-not-forward'), false);
  assert.equal(saved.includes('private'), true);
});

test('acceptance rejects dirty checkout before starting production', async () => {
  await assert.rejects(runGameplayGapCampaign({ outputDirectory: 'unused',
    explorerRef: 'explorer', nextIntent: async () => {}, acceptance: true,
    snapshot: () => ({ head: 'a'.repeat(40), dirty: true }),
    start: async () => assert.fail('must not start') }), /clean candidate/u);
});

test('startup failure is retained without claiming a captured campaign', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gameplay-gap-test-'));
  await assert.rejects(runGameplayGapCampaign({ outputDirectory: directory,
    explorerRef: 'explorer', nextIntent: async () => {},
    snapshot: () => ({ head: 'a'.repeat(40), dirty: true }),
    start: async () => { throw new Error('provider unavailable'); } }), /provider unavailable/u);
  const report = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
  assert.equal(report.status, 'failed');
  assert.equal(report.turns.length, 0);
});

test('campaign never overwrites existing trace evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gameplay-gap-test-'));
  await writeFile(join(directory, 'campaign.json'), 'prior evidence');
  await assert.rejects(runGameplayGapCampaign({ outputDirectory: directory,
    explorerRef: 'explorer', nextIntent: async () => {},
    snapshot: () => ({ head: 'a'.repeat(40), dirty: true }),
    start: async () => assert.fail('must not start') }), { code: 'EEXIST' });
  assert.equal(await readFile(join(directory, 'campaign.json'), 'utf8'), 'prior evidence');
});

test('typed owner rejection is retained as code evidence without an accepted commit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gameplay-gap-test-'));
  const requestedUrls = [];
  const report = await runGameplayGapCampaign({ outputDirectory: directory,
    explorerRef: 'explorer', turns: 1,
    resumePartyId: 'party:existing', replayGapIdsByTurn: [['gap:budget']],
    snapshot: () => ({ head: 'a'.repeat(40), dirty: false }),
    start: async () => ({ url: 'http://localhost', child: { kill() {} } }),
    nextIntent: async () => ({ raw_text: 'Осмотреть предмет.', probe_family: 'discovery' }),
    fetchImpl: async url => { requestedUrls.push(url); return { status: url.endsWith('/turns') ? 409 : 200,
      json: async () => url.endsWith('/turns')
        ? { ok: false, error: { code: 'TEMPORARY_ACTION_UNAVAILABLE' } }
        : { ok: true, data: { party_id: 'party:existing' } } }; },
    readTrace: async () => [{ event: 'turn.failed',
      error: { code: 'TURN_ORDINARY_DISCOVERY_UNRESOLVED', details: { reason: 'budget_or_cap_exhausted' } },
      llm: { gameplay_traces: [], calls: [] } }]
  });
  assert.equal(report.status, 'captured');
  assert.equal(report.resumed_party_id, 'party:existing');
  assert.equal(requestedUrls.some(url => /new-games|opening-ack/u.test(url)), false);
  assert.equal(requestedUrls.filter(url => url.endsWith('/turns')).length, 1);
  assert.equal(report.turns[0].accepted, false);
  assert.deepEqual(report.turns[0].code_mechanics_refs,
    [`${report.turns[0].trace_ref}#/events/0/error`]);
  assert.equal(report.turns[0].events[0].error.details.reason, 'budget_or_cap_exhausted');
});
