import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  routeMovementLabels,
} from './presence-rules-production-e2e-fixture.js';

// D49 / rt-ux: the first screen shows the canonical-connection passages that the visibility owner
// discloses (`readCurrentConnectionDisclosure`, the same owner as a turn; local edges and exits are
// not on the first screen). The start seed follows the request id, so several seeds are tried per start.
// Spatial 4.7.0 §7.1.1: visibility is not availability, so the passages are listed under `poor`
// visibility (dense fog) too (rt-lines phase 0, LW-097).
const STARTS = ['novgorod_vikhtuy_work_storage_v1', 'novgorod_vikhtuy_household_cluster_v1'];
const SEEDS = 6;

test('v17 production start: the first screen route panel lists the visible passages of the start place',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const repository = createLowerDvinaTracePhase1ARepository({ query: env.partyPool.query.bind(env.partyPool) });
    for (const scenarioId of STARTS) {
      await t.test(scenarioId, async () => {
        let fog = 0;
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const opening = await runtime.startNewGame({
            scenario_id: scenarioId, request_id: `opening-route-${scenarioId}-${seed}` });
          const labels = routeMovementLabels(opening.screen);
          const weather = (await repository.loadInternal(opening.party_id)).environment_snapshot.weather_state;
          if (weather.visibility === 'poor') fog += 1;
          assert.ok(labels.length > 0, `${scenarioId} seed ${seed} (${weather.weather_state_id}): no passages`);
          assert.ok(labels.every((label) => typeof label === 'string' && label.trim()), labels.join(' | '));
          assert.equal(new Set(labels).size, labels.length, `labels are unique: ${labels.join(' | ')}`);
          await runtime.acknowledgeOpening(opening.party_id, { client_ack_id: `opening-route-ack-${scenarioId}-${seed}` });
          assert.deepEqual(routeMovementLabels((await runtime.getPartyScreen(opening.party_id)).screen), labels,
            'the stored screen equals the opening screen');
        }
        console.error(`${scenarioId}: ${fog} of ${SEEDS} seeds under poor visibility, all listed passages`);
      });
    }
  });
