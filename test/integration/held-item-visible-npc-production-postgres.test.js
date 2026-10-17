import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createSpatialV3CurrentVisibilityProvider } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { createTargetCurrentFactualContext } from
  '../../apps/game-server/src/infrastructure/postgres/target-current-factual-context.js';
import { readCurrentNaturalSourceState } from
  '../../apps/game-server/src/infrastructure/postgres/g4-current-natural-source-state.js';
import { readCommittedEntityExterior, readCurrentTargetConditions,
  readPlayerKnowledge } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';
import { loadSpatialV3TargetProductionRelease } from
  '../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { createTargetAuthoredStartCatalog } from
  '../../apps/game-server/src/internal/target-authored-start-catalog.js';
import { loadTargetBodyNeedsProfile } from
  '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { deriveTrustedBodyNeedsBindingPin } from
  '../../apps/game-server/src/runtime/body-needs-temporal.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from '../spatial-v3/presence-rules-production-e2e-fixture.js';

const SCENARIO_ID = 'novgorod_vikhtuy_work_storage_v1';
const START_REQUEST_ID = 'issue-594-pine-ridge-clear-sight-seed-000024';
const OBSERVE = 'Осматриваюсь вокруг.';
const FISHING_NET_TEMPLATE = 'item_tpl_nov_fishing_net_v1';
const FISHING_NET_LABEL = 'рыболовная сеть';

async function createProductionVisibility(env) {
  const context = await loadSpatialV3TargetProductionRelease({
    worldPool: env.worldPool,
    itemApproval: env.approvals.itemApproval,
    actorApproval: env.approvals.actorApproval,
    rootDir: env.rootDir,
  });
  const authoredStartCatalog = createTargetAuthoredStartCatalog({
    runtime: context.runtime,
    release: context.release,
  });
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({
    rootDir: env.rootDir,
    worldRevisionId: context.release.world_revision_id,
  });
  const factualContext = createTargetCurrentFactualContext({
    partyPool: env.partyPool,
    runtime: context.runtime,
    committer: { async commit() { assert.fail('read-only visibility probe must not commit'); } },
    authoredRuntimeBindingResolver: authoredStartCatalog.resolveRuntimeBinding,
    trustedBodyNeedsBindingPin: deriveTrustedBodyNeedsBindingPin(bodyNeedsProfile),
    trustedBodyNeedsProfile: bodyNeedsProfile,
  });
  const readCurrentEnvironment = factualContext.readCurrentEnvironment;
  const readCurrentSourceState = (args) => readCurrentNaturalSourceState({
    ...args,
    readCurrentEnvironment,
  });
  return createSpatialV3CurrentVisibilityProvider({
    pool: env.partyPool,
    verifiedCatalog: context.runtime.materialization_inputs.domain_catalog,
    pin: context.runtime.itemPin,
    worldBaseReader: context.runtime.worldBaseReader,
    readCurrentEnvironment,
    readCurrentSourceState,
    readTargetConditions: readCurrentTargetConditions,
    readEntityExterior: readCommittedEntityExterior,
    readPlayerKnowledge,
  });
}

function isTurnNarratorWriter(input) {
  return Array.isArray(input?.['Обязательные положения текущего эпизода'])
    && !Object.hasOwn(input, 'Отклонённая проза')
    && !Array.isArray(input['Отрывки прозы']);
}

test('fresh production Vikhtuy start exposes NPC-held fishing net to safe context and writer',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const requestLog = [];
    const capturePath = resolve(process.env.D49_HELD_ITEM_WIRE_CAPTURE_PATH
      ?? join(tmpdir(), 'd49-held-item-wire-capture.ndjson'));
    let captureWritten = false;
    const writeWireCapture = async () => {
      const bytes = requestLog.map(({ raw_body }) => raw_body).join('\n')
        + (requestLog.length ? '\n' : '');
      await mkdir(dirname(capturePath), { recursive: true });
      await writeFile(capturePath, bytes, { encoding: 'utf8' });
      captureWritten = true;
      console.info(`Held-item wire capture: ${capturePath} (${requestLog.length} raw requests)`);
    };
    t.after(async () => {
      if (!captureWritten) await writeWireCapture();
    });
    const restoreFetch = installPresenceProductionE2eFetch({
      observeText: OBSERVE,
      requestLog,
    });
    t.after(restoreFetch);

    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const visibilityProvider = await createProductionVisibility(env);

    const opening = await runtime.startNewGame({
      scenario_id: SCENARIO_ID,
      request_id: START_REQUEST_ID,
    });
    await runtime.acknowledgeOpening(opening.party_id, {
      client_ack_id: `${START_REQUEST_ID}-ack`,
    });
    await runtime.submitTurn(opening.party_id, {
      raw_text: OBSERVE,
      request_id: `${START_REQUEST_ID}-look`,
    });
    await writeWireCapture();

    assert.equal(opening.screen.schema, 'first_game_screen');
    const client = await env.partyPool.connect();
    let heldNets;
    let holderObservations;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const committed = (await client.query(`SELECT snapshot.state_payload
        FROM party_runtime.parties party
        JOIN party_runtime.party_state_snapshots snapshot
          ON snapshot.party_id=party.party_id AND snapshot.state_version=party.state_version
        WHERE party.party_id=$1`, [opening.party_id])).rows[0]?.state_payload;
      assert.ok(committed, 'precondition: production start has a committed party snapshot');
      const actorId = committed.actor_id;
      const positionId = committed.position.position_id;
      heldNets = (await client.query(`SELECT item.item_id, placement.holder_npc_id,
          placement.physical_position
        FROM party_runtime.party_items item
        JOIN party_runtime.party_item_placements placement
          ON placement.party_id=item.party_id AND placement.item_id=item.item_id
        WHERE item.party_id=$1 AND item.template_id=$2
          AND placement.physical_position='hands'
          AND placement.holder_npc_id IS NOT NULL`,
      [opening.party_id, FISHING_NET_TEMPLATE])).rows;
      holderObservations = await visibilityProvider.readEntityObservations({
        transaction: client,
        partyId: opening.party_id,
        actorId,
        observedPositionId: positionId,
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    assert.ok(heldNets.length > 0,
      'precondition: production materialization committed fishing net in an NPC hands');

    const heldNet = heldNets.find(({ holder_npc_id }) => holderObservations.some((row) =>
      row.entity_kind === 'npc' && row.entity_id === holder_npc_id
      && row.visibility === 'clear'));
    assert.ok(heldNet,
      'precondition: committed holder is admitted with clear visibility by the production provider');

    const screen = (await runtime.getPartyScreen(opening.party_id)).screen;
    const visibleNpcs = screen.visible_context?.visible_npc ?? [];
    const holder = visibleNpcs.find(({ entity_ref }) =>
      entity_ref?.entity_id === heldNet.holder_npc_id);
    assert.ok(holder,
      'precondition: safe context projects the holder selected as clear by the visibility provider');
    const heldItems = holder.observable_cues?.held_items ?? [];
    const safeCuePresent = heldItems.some((cue) =>
      cue.display_label === FISHING_NET_LABEL
      && cue.entity_ref?.entity_kind === 'item'
      && cue.entity_ref?.entity_id === heldNet.item_id);

    const turnWriters = requestLog
      .filter(({ user }) => isTurnNarratorWriter(user))
      .map(({ user }) => user);
    assert.equal(turnWriters.length, 1,
      'the observed turn must use exactly one fake production narrator writer');
    const writerHasItemFact = JSON.stringify(turnWriters[0]).includes(
      `В руках — ${FISHING_NET_LABEL}.`);

    assert.deepEqual({ safeCuePresent, writerHasItemFact }, {
      safeCuePresent: true,
      writerHasItemFact: true,
    }, 'the admitted clear NPC held-item cue and Russian writer fact must include the net');
  });
