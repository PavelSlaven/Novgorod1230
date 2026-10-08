import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRationalMinutes, subtractGameTimestamp } from '@rus/time-events-history';
import { loadTracePhase2TemporalSourceProof } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';
import { bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario, walkRouteUntil } from
  './presence-rules-production-e2e-fixture.js';

// Issue #597: real public turns and persisted evidence; the external provider is fixed.
test('issue #597: public v17 interrupted long wait commits exact fractional elapsed and replays once',
  { timeout: 1_780_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const restoreFetch = installPresenceProductionE2eFetch({
      turnStepPlanner: ({ request }) => {
        if (request.root_player_action !== 'Жду 1440 минут.') return null;
        return {
          interpretation: { player_goal: request.root_player_action,
            grounded_attempt: 'Ожидаю на месте.', adaptation: 'literal' },
          resolution: 'direct', goal_result: 'achieved',
          activity: { owner: 'semantic', duration_class: 'extended', effort: 'none',
            requested_duration_minutes: 1440 },
          operations: [], check: null, continuation: null, clarification: null,
          direct_result_kind: null, reason_code: 'explicit_wait',
          reason: 'Ожидание на месте в течение запрошенного времени.',
        };
      },
    });
    t.after(restoreFetch);
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_household_cluster_v1');
    const scheduledRows = async () => (await loadTracePhase2TemporalSourceProof(
      env.partyPool, partyId)).npc_schedule_runtime.filter((row) =>
      row.status === 'active' && row.causal_state_ref.routine_state.schedule_context);
    await walkRouteUntil({ runtime, partyPool: env.partyPool, partyId,
      observeText: TARGET_SMOKE_INPUT, maxSteps: 24,
      sitePredicate: async () => (await scheduledRows()).length > 0 });
    assert.ok((await scheduledRows())[0], 'same public entry materializes an active NPC routine');
    const readEvidence = async () => {
      const snapshot = (await env.partyPool.query(
        `SELECT party.state_version, snapshot.state_payload
           FROM party_runtime.parties party
           JOIN party_runtime.party_state_snapshots snapshot
             ON snapshot.party_id=party.party_id AND snapshot.state_version=party.state_version
          WHERE party.party_id=$1`, [partyId])).rows[0];
      const clock = (await env.partyPool.query(
        `SELECT whole_minutes::text, subminute_numerator::text, subminute_denominator::text
           FROM party_runtime.party_clocks WHERE party_id=$1`, [partyId])).rows[0];
      assert.ok(snapshot);
      assert.ok(clock);
      return { snapshot, clock };
    };
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      const input = { request_id: `wait-ledger-${ordinal}`,
        idempotency_key: `wait-ledger-${ordinal}`, raw_text: 'Жду 1440 минут.' };
      const before = await readEvidence();
      const result = await runtime.submitTurn(partyId, input);
      const after = await readEvidence();
      const saved = after.snapshot.state_payload.last_turn;
      const update = saved.turn_step_commit.time_update;
      const actual = update.exact_elapsed.exact_minutes;
      assert.equal(BigInt(after.snapshot.state_version), BigInt(before.snapshot.state_version) + 1n,
        'one public waiting request commits once');
      assert.deepEqual(update.clock_before, before.clock);
      assert.deepEqual(update.clock_after, after.clock);
      assert.deepEqual(actual, subtractGameTimestamp(after.clock, before.clock),
        'persisted elapsed equals the exact committed clock interval');
      assert.deepEqual(saved.consequence.prepared_effect_elapsed, update.exact_elapsed,
        'exact consequence binding survives the persisted JSON snapshot');
      assert.equal(saved.consequence.prepared_effect_ledger_digest,
        update.prepared_effect_ledger.ledger_digest);
      if (ordinal === 3) {
        assert.notEqual(actual.denominator, '1', 'the historical third wait reaches the fractional seam');
        assert.equal(compareRationalMinutes(actual, { numerator: '1440', denominator: '1' }), -1);
        const paused = update.semantic_activity_resolutions.find((resolution) =>
          resolution.execution.status === 'paused');
        assert.ok(paused, 'committed semantic execution is paused at the temporal boundary');
        assert.deepEqual(paused.attempt.actual_time, update.exact_elapsed);
        assert.deepEqual(paused.execution.ended_at, after.clock);
        assert.deepEqual(await runtime.submitTurn(partyId, input), result,
          'same-key retry returns the saved result');
        assert.deepEqual(await readEvidence(), after,
          'same-key retry repeats no clock, body or snapshot effect');
      }
      t.diagnostic(JSON.stringify({ ordinal, actual,
        state_version: after.snapshot.state_version,
        execution_status: update.semantic_activity_resolutions[0]?.execution.status }));
    }
  });
