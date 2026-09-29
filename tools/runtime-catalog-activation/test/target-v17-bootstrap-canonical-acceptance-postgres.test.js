import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { assertTargetCatalogActivationReadiness, assertPartyReleaseReadiness } from
  '../../../apps/game-server/src/infrastructure/postgres/spatial-v3-production-readiness.js';
import { assertTargetCanonicalStartPostgres } from
  '../../../test/spatial-v3/target-canonical-start-postgres-acceptance.js';
import {
  assertBootstrapV17PartyProductionLedger,
  bootstrapV17PresenceE2e,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('v17 bootstrap on dual databases runs full assertTargetCanonicalStartPostgres (F2)',
  { timeout: 2_400_000 }, async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    const env = await bootstrapV17PresenceE2e(t, { postgresProfile: 'canonical-acceptance' });
    await assertBootstrapV17PartyProductionLedger(env.partyPool);
    const pin = env.approvals.itemApproval.request;
    const targetInputs = {
      worldPool: env.worldPool,
      itemApproval: env.approvals.itemApproval,
      actorApproval: env.approvals.actorApproval,
    };
    const candidate = {
      ...SPATIAL_V3_TARGET_PRODUCTION_RELEASE,
      compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest,
    };
    await assertPartyReleaseReadiness(env.partyPool, candidate);
    const targetReadback = await assertTargetCatalogActivationReadiness(env.worldPool, {
      ...targetInputs,
      release: candidate,
    });
    await assertTargetCanonicalStartPostgres({
      worldPool: env.worldPool,
      partyPool: env.partyPool,
      itemPin: targetReadback.item_pin,
      actorBinding: targetReadback.actor_binding,
      releaseInputs: targetInputs,
    });
    assert.ok(targetReadback.item_pin.catalog_revision_id);
  });
