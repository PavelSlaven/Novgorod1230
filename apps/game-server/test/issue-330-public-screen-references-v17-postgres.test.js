import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createHttpHandler } from '../src/http/handler.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const OBSERVE_TEXT = 'Осматриваюсь вокруг, оставаясь на месте.';

// Expected red until issue #330 public reference projection is implemented.
test('issue #330 v17 commit, idempotent replay, reload and reconstructed root keep refs stable',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: OBSERVE_TEXT });
    t.after(restoreFetch);
    const projections = [];
    const roots = [];
    t.after(async () => {
      await Promise.allSettled(roots.map(({ runtime }) => runtime.close()));
    });
    const createRoot = async (seen) => {
      const root = await createPresenceProductionRoot({
        ...env,
        extraConfig: {
          onCurrentSpatialContextProjection: ({ visible }) => seen.push(visible),
        },
      });
      roots.push(root);
      return root;
    };

    const firstRoot = await createRoot(projections);
    const firstHandler = createHttpHandler({ root: firstRoot.runtime });
    const opening = await invokeHttp(firstHandler, 'POST', '/api/v1/new-games', {
      scenario_id: 'novgorod_vikhtuy_work_storage_v1',
      request_id: 'issue330-public-refs-start',
    });
    assert.equal(opening.status, 201, JSON.stringify(opening.body.error));
    assert.equal(opening.body.ok, true);
    const partyId = opening.body.data.party_id;
    const partyPath = `/api/v1/parties/${encodeURIComponent(partyId)}`;
    const ack = await invokeHttp(firstHandler, 'POST', `${partyPath}/opening-ack`, {
      client_ack_id: 'issue330-public-refs-opening-ack',
    });
    assert.equal(ack.status, 200, JSON.stringify(ack.body.error));
    assert.equal(ack.body.ok, true);

    const request = { raw_text: OBSERVE_TEXT, request_id: 'issue330-public-refs-observe' };
    const turn = await invokeHttp(firstHandler, 'POST', `${partyPath}/turns`, request);
    assert.equal(turn.status, 200, JSON.stringify(turn.body.error));
    assert.equal(turn.body.ok, true);
    assert.equal(turn.body.data.turn_number, 1);

    const replay = await invokeHttp(firstHandler, 'POST', `${partyPath}/turns`, request);
    assert.equal(replay.status, 200, JSON.stringify(replay.body.error));
    assert.equal(replay.body.ok, true);
    assert.equal(replay.body.data.turn_number, 1,
      'same request_id replay must not commit a second turn');
    assert.deepEqual(replay.body.data.screen, turn.body.data.screen,
      'idempotent replay must return the committed screen with the same keys');

    const reloaded = await invokeHttp(firstHandler, 'GET', `${partyPath}/screen`);
    assert.equal(reloaded.status, 200, JSON.stringify(reloaded.body.error));
    assert.equal(reloaded.body.ok, true);
    assert.deepEqual(reloaded.body.data.screen, turn.body.data.screen,
      'GET must return the committed screen with the same keys');
    assert.ok(projections.length > 0, 'v17 current spatial projection must execute');

    const internalIds = new Set(projections.flatMap((context) => [
      ...context.visible_objects, ...context.visible_npc,
    ]).map(({ entity_ref }) => entity_ref?.entity_id).filter(Boolean));
    assert.ok(internalIds.size > 0, 'internal v17 projection must contain mechanics refs');
    for (const [name, reply] of [['turn', turn], ['replay', replay], ['reload', reloaded]]) {
      assertPublicScreenReferences(reply.body.data.screen, name);
      const findings = internalIdPaths(reply.body.data.screen.visible_context, internalIds);
      assert.deepEqual(findings, [], `${name}: public visible context contains internal IDs`);
    }

    const saved = await firstRoot.runtime.getPartyScreen(partyId);
    const moduleUrl = new URL('../src/public-boundary.js', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval',
      `import { readFileSync } from 'node:fs';
       import { projectPublicPayload } from ${JSON.stringify(moduleUrl)};
       process.stdout.write(JSON.stringify(projectPublicPayload(
         JSON.parse(readFileSync(0, 'utf8')))));`], {
      input: JSON.stringify(saved), encoding: 'utf8', timeout: 60_000
    });
    assert.equal(child.error, undefined, 'fresh process must launch outside the Codex sandbox');
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout).screen, turn.body.data.screen,
      'a fresh OS process must produce the same keys from the saved internal screen');

    await firstRoot.runtime.close();
    roots.splice(roots.indexOf(firstRoot), 1);
    const reconstructedProjections = [];
    const reconstructedRoot = await createRoot(reconstructedProjections);
    const reconstructedHandler = createHttpHandler({ root: reconstructedRoot.runtime });
    const reconstructed = await invokeHttp(reconstructedHandler, 'GET', `${partyPath}/screen`);
    assert.equal(reconstructed.status, 200, JSON.stringify(reconstructed.body.error));
    assert.equal(reconstructed.body.ok, true);
    assert.deepEqual(reconstructed.body.data.screen, turn.body.data.screen,
      'a fresh production root must reconstruct the committed screen and its keys from saved state');
    assertPublicScreenReferences(reconstructed.body.data.screen, 'fresh-root reload');
    assert.deepEqual(internalIdPaths(reconstructed.body.data.screen.visible_context, internalIds), [],
      'fresh root must not reveal saved internal references');

    t.diagnostic(`v17 commit/replay/reload/fresh-process/fresh-root succeeded; current projections=${projections.length}; internal refs=${internalIds.size}`);
    if (process.env.ISSUE_330_CAPTURE_DIR) {
      await mkdir(process.env.ISSUE_330_CAPTURE_DIR, { recursive: true });
      for (const [name, reply] of [['turn', turn], ['replay', replay],
        ['reloaded-screen', reloaded], ['fresh-root-screen', reconstructed]]) {
        await writeFile(join(process.env.ISSUE_330_CAPTURE_DIR, `${name}.json`), reply.raw);
      }
    }
  });

function assertPublicScreenReferences(screen, name) {
  const context = screen?.visible_context;
  assert.ok(context && Array.isArray(context.visible_objects), `${name}: visible context required`);
  assert.ok(Array.isArray(context.visible_npc), `${name}: NPC observations required`);
  assert.ok(context.visible_objects.length > 0, `${name}: visible objects must survive projection`);
  const rows = [...context.visible_npc, ...context.visible_objects];
  assert.ok(rows.some(({ display_label }) => typeof display_label === 'string'
    && display_label.trim()), `${name}: player-facing labels must survive`);
  for (const row of rows) {
    if (!row.entity_ref) continue;
    assert.deepEqual(Object.keys(row.entity_ref).sort(), ['entity_kind', 'public_key'],
      `${name}: visible ref must contain only public key and kind`);
    assert.match(row.entity_ref.public_key, /^e[1-9]\d*$/u,
      `${name}: public key must be a deterministic screen reference`);
  }
  const serialized = JSON.stringify(context);
  assert.equal(/"(?:entity_id|instance_id)"/u.test(serialized), false,
    `${name}: visible context must not contain internal ID fields`);
}

function internalIdPaths(value, ids, path = '$.data.screen.visible_context') {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'string' && ids.has(value) ? [path] : [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    if (['entity_id', 'instance_id'].includes(key)) return [childPath];
    return internalIdPaths(child, ids, childPath);
  });
}

async function invokeHttp(handler, method, url, body) {
  const request = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { method, url, headers: {
    host: 'issue330.invalid', 'x-request-id': 'issue330-public-refs-http',
  } });
  let status;
  let raw;
  await handler(request, {
    writeHead(value) { status = value; },
    end(value) { raw = String(value); },
  });
  assert.equal(typeof raw, 'string', 'HTTP serializer must produce a response');
  return { status, raw, body: JSON.parse(raw) };
}
