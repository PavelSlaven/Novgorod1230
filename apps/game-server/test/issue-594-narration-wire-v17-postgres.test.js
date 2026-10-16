import { compatNarrationWire } from './narration-audit-fixture.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const BASE_HEAD = 'a00226785c9ef7a4f1866eeed1918a1ed609102d';
const BASE_SHA = 'bbb9232e2dfae1544705feb0d1e7b0946942d874e5f0867607116ba227c2acba';
const OWNER_URL = new URL('../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js', import.meta.url);
const BASE_URL = new URL('../../../test/spatial-v3/fixtures/issue-594-base-visibility-inputs.txt', import.meta.url);
const SCENARIO_ID = 'novgorod_pine_ridge_approach_v1';
const START_REQUEST_ID = 'issue-594-pine-ridge-clear-sight-seed-000024';
const OBSERVE = 'Осмотреться';
const ARM = process.env.RUS_ISSUE_594_WIRE_ARM;
const MARKER = '[issue-594-wire] ';
const CHECK_MARKER = '[issue-594-wire-check] ';
const FIXED_WRITER_PROSE = 'Вы стоите на месте, о котором говорят переданные сведения.';
const FIXED_REPAIR_PROSE = 'Вы осматриваетесь вокруг, опираясь на переданные сведения.';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const reply = (output) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(output) } }],
}), { status: 200 });

function openingResponse(role, auditorStep) {
  if (role === 'writer') return { prose: FIXED_WRITER_PROSE };
  if (role === 'repair') return { prose: FIXED_REPAIR_PROSE };
  if (auditorStep === 1) return { pass: true };
  if (auditorStep === 2) return { pass: false,
    failed_checks: ['new_fact_check'], concerns: [{
      code: 'NARRATOR_PROSE_ADDED_FACT', severity: 'repairable',
      message: 'Есть утверждение без опоры в переданных сведениях.',
    }], evidence: ['Проверяемое утверждение не подтверждено фактами.'] };
  return { pass: true, failed_checks: [], concerns: [],
    evidence: ['Проверено по переданным сведениям вступления.'] };
}

function narrationRole(input) {
  if (typeof input?.сцена?.граница === 'string') {
    if (Object.hasOwn(input, 'отклонённая_проза')) return 'repair';
    if (Object.hasOwn(input, 'проверяемая_проза')) return 'auditor';
    return 'writer';
  }
  if (input?.required_current_beat) {
    if (Array.isArray(input.concerns)) return 'repair';
    if (Array.isArray(input.segments)) return 'auditor';
    return 'writer';
  }
  return null;
}

function recordsFrom(stdout, marker = MARKER) {
  return stdout.split('\n').flatMap((line) => {
    const index = line.indexOf(marker);
    return index < 0 ? [] : [JSON.parse(line.slice(index + marker.length))];
  });
}

function stringLeaves(value, path = 'user') {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((row, index) =>
    stringLeaves(row, `${path}[${index}]`));
  if (value && typeof value === 'object') return Object.entries(value)
    .flatMap(([key, row]) => stringLeaves(row, `${path}.${key}`));
  return [];
}

function containsWords(text, value) {
  const tokens = (input) => input.normalize('NFC').toLocaleLowerCase('ru')
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
  const words = tokens(text);
  const target = tokens(value);
  return target.length > 0 && words.some((_, index) =>
    target.every((word, offset) => words[index + offset] === word));
}

function wireChecks(captures, privateNpcs) {
  const ids = privateNpcs.map(({ npc_id }) => npc_id);
  const names = privateNpcs.flatMap(({ identity_state: identity }) =>
    stringLeaves({ name: identity?.name, canonical_name: identity?.canonical_name,
      display_name: identity?.display_name, aliases: identity?.aliases }).map(({ text }) => text));
  const appearanceCodes = [...new Set(privateNpcs.flatMap(({ identity_state: identity }) =>
    stringLeaves({ appearance: identity?.appearance, sex_category: identity?.sex_category,
      age_category: identity?.age_category }).map(({ text }) => text)))];
  return { arm: ARM, committed_npc_count: privateNpcs.length,
    private_identity_name_count: names.length,
    roles: captures.map(({ stage, role, phase, request }) => {
      const input = JSON.parse(request.messages.find(({ role }) => role === 'user').content);
      const allStrings = stringLeaves(input);
      const people = input.сцена?.персонажи ?? [];
      const npcStrings = stage === 'opening'
        ? stringLeaves(people, 'user.сцена.персонажи').filter(({ path }) => !path.endsWith('.ключ'))
        : allStrings.filter(({ path, text }) => /visible_npc|npc_details/u.test(path)
          || /[\p{Script=Cyrillic}]/u.test(text));
      const idPaths = allStrings.filter(({ text }) => ids.some((id) => text.includes(id)))
        .map(({ path }) => path);
      const namePaths = (stage === 'opening' ? npcStrings : allStrings)
        .filter(({ text }) => names.some((name) => containsWords(text, name)))
        .map(({ path }) => path);
      const codePaths = npcStrings.filter(({ text }) => appearanceCodes.some((code) =>
        /[A-Za-z]/u.test(code) && containsWords(text, code))).map(({ path }) => path);
      const russianNpcFacts = npcStrings.length > 0 && npcStrings.every(({ text }) =>
        /[\p{Script=Cyrillic}]/u.test(text));
      return { stage, role, phase,
        ...(stage === 'opening' ? { projected_npc_count: people.length,
          russian_npc_facts: russianNpcFacts } : {}),
        instance_id_free: idPaths.length === 0, unknown_name_free: namePaths.length === 0,
        npc_machine_reference_paths: [...new Set([...idPaths, ...codePaths])],
        private_name_occurrence_paths: namePaths };
    }) };
}

async function publishRecords(records) {
  for (const record of records) console.log(`${MARKER}${JSON.stringify(record)}`);
  const output = process.env.RUS_ISSUE_594_WIRE_OUT_DIR?.trim();
  if (output) {
    await mkdir(resolve(output), { recursive: true });
    await writeFile(resolve(output, 'issue-594-actual-wire.jsonl'),
      records.map((record) => JSON.stringify(record)).join('\n') + '\n', { mode: 0o600 });
  }
}

test('issue #594 D81: actual v17 opening and look provider bodies before/after visibility fix',
  { timeout: 1_500_000 }, async (t) => {
    const baseBytes = readFileSync(BASE_URL);
    assert.equal(sha256(baseBytes), BASE_SHA, 'baseline is the exact source at the pinned base HEAD');
    if (!ARM) {
      const records = [];
      const checks = [];
      const deadline = Date.now() + 1_470_000;
      for (const arm of ['before', 'after']) {
        // Separate module caches; the only baseline override is the exact committed owner source.
        const childEnv = { ...process.env, RUS_ISSUE_594_WIRE_ARM: arm,
          CUDA_VISIBLE_DEVICES: '' };
        delete childEnv.RUS_ISSUE_594_WIRE_OUT_DIR;
        delete childEnv.NODE_TEST_CONTEXT;
        const child = spawnSync(process.execPath, ['--test',
          '--test-reporter=spec', fileURLToPath(import.meta.url)], {
          encoding: 'utf8', env: childEnv,
          timeout: Math.max(1, Math.min(735_000, deadline - Date.now())),
          maxBuffer: 32 * 1024 * 1024,
        });
        const captured = recordsFrom(child.stdout ?? '');
        checks.push(...recordsFrom(child.stdout ?? '', CHECK_MARKER));
        records.push(...captured);
        // Preserve any captured evidence even when the child fails later in the runtime path.
        if (child.status !== 0 || child.error) {
          await publishRecords(records);
          assert.fail(`${arm} capture failed: status=${child.status}; signal=${child.signal};`
            + ` error=${child.error?.code ?? 'none'}\n${child.stdout ?? ''}\n${child.stderr ?? ''}`);
        }
        assert.equal(captured.filter((row) => row.stage === 'opening').length, 5);
        assert.ok(captured.some((row) => row.stage === 'look' && row.role === 'writer'));
        assert.ok(captured.some((row) => row.stage === 'look' && row.role === 'auditor'));
      }
      await publishRecords(records);
      for (const check of checks) console.log(`${CHECK_MARKER}${JSON.stringify(check)}`);
      console.log(`[issue-594-wire-meta] ${JSON.stringify({ base_head: BASE_HEAD,
        baseline_sha256: BASE_SHA, scenario_id: SCENARIO_ID, request_id: START_REQUEST_ID,
        role_counts: records.reduce((counts, { arm, stage, role }) => {
          const key = `${arm}:${stage}:${role}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}) })}`);
      return;
    }
    assert.ok(['before', 'after'].includes(ARM), 'only explicit before/after arms are permitted');
    let baselineLoads = 0;
    if (ARM === 'before') {
      // Hook installed before dynamic imports of any fixture or production composition module.
      const hooks = registerHooks({
        load(url, context, nextLoad) {
          if (url !== OWNER_URL.href) return nextLoad(url, context);
          baselineLoads += 1;
          return { format: 'module', source: baseBytes.toString('utf8'), shortCircuit: true };
        },
      });
      t.after(() => hooks.deregister());
    }
    const { bootstrapV17PresenceE2e, createPresenceProductionRoot,
      installPresenceProductionE2eFetch } = await import(
      '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js');
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFixture = installPresenceProductionE2eFetch({ observeText: OBSERVE });
    const fixtureFetch = globalThis.fetch;
    let stage = 'opening';
    let auditorStep = 0;
    const captures = [];
    globalThis.fetch = async (url, init) => {
      // No actual transport, model, or credential is used. Never publish headers or endpoint.
      assert.equal(String(url), 'https://target-acceptance.invalid/chat/completions');
      const request = JSON.parse(init.body);
      const input = JSON.parse(request.messages.find(({ role }) => role === 'user').content);
      const role = narrationRole(input);
      if (role) {
        let phase = 'initial';
        if (stage === 'opening' && role === 'auditor') {
          phase = ['initial', 'format_feedback', 'after_repair'][auditorStep++];
          assert.ok(phase, 'opening auditor call count must remain bounded');
        }
        const record = { arm: ARM, stage, role, phase,
          request, serialized_body: init.body };
        captures.push(record);
        console.log(`${MARKER}${JSON.stringify(record)}`);
        if (stage === 'opening') {
          return reply(openingResponse(role, auditorStep));
        }
      }
      return fixtureFetch(url, init);
    };
    t.after(() => { globalThis.fetch = fixtureFetch; restoreFixture(); });
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const opening = await runtime.startNewGame({ scenario_id: SCENARIO_ID,
      request_id: START_REQUEST_ID });
    assert.equal(opening.screen.schema, 'first_game_screen');
    // Identity is used only as a private oracle; never publish names, aliases, or appearance DTOs.
    const privateNpcs = (await env.partyPool.query(
      'SELECT npc_id,identity_state FROM party_runtime.party_npcs WHERE party_id=$1',
      [opening.party_id])).rows;
    assert.ok(privateNpcs.length > 0, 'the committed start must contain NPC identities');
    assert.deepEqual(captures.filter(({ stage }) => stage === 'opening')
      .map(({ role, phase }) => `${role}:${phase}`), [
      'writer:initial', 'auditor:initial', 'auditor:format_feedback',
      'repair:initial', 'auditor:after_repair',
    ]);
    await runtime.acknowledgeOpening(opening.party_id,
      { client_ack_id: 'issue-594-pine-ridge-ack' });
    stage = 'look';
    await runtime.submitTurn(opening.party_id,
      { raw_text: OBSERVE, request_id: 'issue-594-pine-ridge-first-look' });
    await runtime.getPartyScreen(opening.party_id);
    assert.ok(captures.some((row) => row.stage === 'look' && row.role === 'writer'));
    assert.ok(captures.some((row) => row.stage === 'look' && row.role === 'auditor'));
    const check = wireChecks(captures, privateNpcs);
    console.log(`${CHECK_MARKER}${JSON.stringify(check)}`);
    for (const row of check.roles.filter(({ stage }) => stage === 'opening')) {
      assert.ok(row.instance_id_free, 'opening NPC facts must omit committed instance IDs');
      assert.ok(row.unknown_name_free, 'opening unknown NPCs must omit committed names and aliases');
      assert.ok(row.russian_npc_facts, 'opening NPC fact text must be Russian');
      assert.deepEqual(row.npc_machine_reference_paths, [], 'opening NPC facts must omit appearance codes');
    }
    if (ARM === 'before') assert.equal(baselineLoads, 1, 'the exact baseline owner was loaded');
  });
