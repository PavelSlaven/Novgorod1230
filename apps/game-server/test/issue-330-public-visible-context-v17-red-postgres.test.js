import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createHttpHandler } from '../src/http/handler.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const OBSERVE_TEXT = 'Осматриваюсь вокруг, оставаясь на месте.';

// Issue #330: expected red until the public boundary replaces internal entity refs.
test('v17 public turn and reloaded screen keep internal IDs private (ожидаемо красный, issue #330)',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ observeText: OBSERVE_TEXT });
    t.after(restoreFetch);
    const projections = [];
    const { runtime } = await createPresenceProductionRoot({
      ...env,
      extraConfig: {
        onCurrentSpatialContextProjection: ({ visible }) => projections.push(visible),
      },
    });
    t.after(() => runtime.close());
    const handler = createHttpHandler({ root: runtime });

    const opening = await invokeHttp(handler, 'POST', '/api/v1/new-games', {
      scenario_id: 'novgorod_vikhtuy_work_storage_v1',
      request_id: 'issue330-v17-start',
    });
    assert.equal(opening.status, 201, JSON.stringify(opening.body.error));
    assert.equal(opening.body.ok, true);
    assert.equal(opening.body.data.screen.schema, 'first_game_screen');
    const partyId = opening.body.data.party_id;
    const partyPath = `/api/v1/parties/${encodeURIComponent(partyId)}`;
    const ack = await invokeHttp(handler, 'POST', `${partyPath}/opening-ack`, {
      client_ack_id: 'issue330-v17-opening-ack',
    });
    assert.equal(ack.status, 200, JSON.stringify(ack.body.error));
    assert.equal(ack.body.ok, true);

    const turn = await invokeHttp(handler, 'POST', `${partyPath}/turns`, {
      raw_text: OBSERVE_TEXT, request_id: 'issue330-v17-observe',
    });
    assert.equal(turn.status, 200, JSON.stringify(turn.body.error));
    assert.equal(turn.body.ok, true);
    assert.equal(turn.body.data.turn_number, 1, 'observation must commit the first turn');
    const reloaded = await invokeHttp(handler, 'GET', `${partyPath}/screen`);
    assert.equal(reloaded.status, 200, JSON.stringify(reloaded.body.error));
    assert.equal(reloaded.body.ok, true);
    assert.equal(reloaded.body.data.turn_number, 1);
    assert.deepEqual(reloaded.body.data.screen, turn.body.data.screen,
      'GET must deliver the committed screen from the real repository');
    assert.ok(projections.length > 0, 'the v17 current spatial owner must execute');

    const internalIds = new Set(projections.flatMap((context) => [
      ...context.visible_objects, ...context.visible_npc,
    ]).map((entry) => entry.entity_ref?.entity_id).filter(Boolean));
    assert.ok(internalIds.size > 0, 'the internal projection must expose reference IDs to mechanics');

    const replies = [['turn', turn], ['reloaded-screen', reloaded]];
    for (const [name, reply] of replies) {
      const context = reply.body.data.screen.visible_context;
      assert.ok(context && Array.isArray(context.visible_objects), `${name}: visible context required`);
      assert.ok(Array.isArray(context.visible_npc), `${name}: NPC observations required`);
      assert.ok(context.visible_objects.length > 0, `${name}: visible objects must not be suppressed`);
      assert.ok(context.visible_objects.some((entry) => typeof entry.display_label === 'string'
        && entry.display_label.trim()), `${name}: player-facing labels must survive`);
    }
    t.diagnostic(`v17 start/ack/turn/reload succeeded; spatial projections=${projections.length}; internal refs=${internalIds.size}`);

    // Captures are opt-in; a normal CI run never writes into the checkout.
    if (process.env.ISSUE_330_CAPTURE_DIR) {
      await mkdir(process.env.ISSUE_330_CAPTURE_DIR, { recursive: true });
      for (const [name, reply] of replies) {
        await writeFile(join(process.env.ISSUE_330_CAPTURE_DIR, `${name}.json`), reply.raw);
      }
    }
    for (const [name, reply] of replies) {
      await t.test(`${name}: no internal IDs in serialized visible context (ожидаемо красный, issue #330)`, () => {
        const findings = internalIdPaths(reply.body.data.screen.visible_context, internalIds);
        t.diagnostic(`${name}: ${JSON.stringify(findings)}`);
        assert.deepEqual(findings, [],
          `issue #330: ${name} serialized visible context must not expose internal entity/instance IDs`);
      });
    }
  });

// Use the actual route, public envelope and serializer without a listening socket.
async function invokeHttp(handler, method, url, body) {
  const request = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(request, { method, url, headers: {
    host: 'issue330.invalid', 'x-request-id': 'issue330-http',
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
