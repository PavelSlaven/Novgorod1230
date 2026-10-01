import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESENCE_E2E_MOVE_TEXT, bootstrapV17PresenceE2e, createPresenceProductionRoot,
  installPresenceProductionE2eFetch, publicStartScenario, submitObserveTurn } from './presence-rules-production-e2e-fixture.js';
import { createRouteWalker, peopleAt } from './route-people-helpers.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

/**
 * D49: the first generated place beyond Vikhtuy. Its people come from the G4 composition (1-2 for Vikhtuy locality since
 * people-d49, the G4 lower bound; other G4 keep 0-2), never from the place-family composition of the canonical places, and a restart
 * of the runtime neither adds nor changes them.
 */
test('first generated place beyond Vikhtuy: people come from the G4 composition only and stay across a restart',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const prefs = { exactMovement: true };
    const restoreFetch = installPresenceProductionE2eFetch({ movementPrefs: prefs });
    t.after(() => restoreFetch());
    let root = await createPresenceProductionRoot(env);
    t.after(() => root.runtime.close());
    const partyId = await publicStartScenario(root.runtime, 'novgorod_vikhtuy_work_storage_v1');
    await submitObserveTurn(root.runtime, partyId, TARGET_SMOKE_INPUT);
    const walker = createRouteWalker({ env, runtimeRef: () => root, partyId });
    await withCauseDiagnostic('walkTo water_access', () => walker.walkTo('water_access'));
    await withCauseDiagnostic('walkTo forest_path', () => walker.walkTo('forest_path'));
    prefs.exactMovement = false;
    let generated = null;
    for (let step = 0; step < 14 && generated == null; step += 1) {
      await withCauseDiagnostic(`generated movement ${step}`,
        () => root.runtime.submitTurn(partyId, { raw_text: PRESENCE_E2E_MOVE_TEXT, request_id: `gen-${partyId}-${step}` }));
      generated = (await env.partyPool.query(
        `SELECT id, parent_g4_id FROM party_runtime.party_g5_sites WHERE party_id=$1 AND origin='generated' LIMIT 1`, [partyId])).rows[0] ?? null;
    }
    assert.ok(generated, 'a generated place is reached within 14 movement turns');
    const people = async () => (await env.partyPool.query(
      `SELECT n.npc_id, n.semantic_state->'source_binding' AS source
         FROM party_runtime.entity_placements pl
         JOIN party_runtime.scene_position_nodes pos ON pos.party_id=pl.party_id AND pos.id=pl.position_node_id
         JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
         JOIN party_runtime.party_npcs n ON n.party_id=pl.party_id AND n.npc_id=pl.entity_id
        WHERE pl.party_id=$1 AND pl.entity_kind='npc' AND g6.host_id=$2 ORDER BY n.npc_id`, [partyId, generated.id])).rows;
    const first = await people();
    const run = (await env.partyPool.query(
      `SELECT trace->'first_entry' AS first_entry FROM party_runtime.party_materialization_runs
        WHERE party_id=$1 AND run_kind='expansion' AND created_refs @> $2::jsonb`,
      [partyId, JSON.stringify([{ table: 'party_g5_sites', id: generated.id }])])).rows[0];
    t.diagnostic(`generated place: people=${first.length} g4 composition count=${run.first_entry.selection.count}`);
    assert.ok(first.length <= 2, 'the G4 composition places at most two people');
    if (generated.parent_g4_id.endsWith('_vikhtuy_locality')) assert.ok(first.length >= 1, 'D49: a generated place of Vikhtuy locality is never empty');
    assert.equal(first.length, run.first_entry.selection.count, 'the people are the G4 composition draw');
    assert.equal(run.first_entry.people, undefined, 'the place-people mechanism is for canonical places only');
    for (const npc of first) {
      assert.ok(npc.source.npc_composition_ref, 'origin is the G4 npc composition');
      assert.equal(npc.source.place_population_composition_ref, undefined);
      assert.equal(npc.source.presence_rule_ref, undefined);
    }
    assert.equal((await peopleAt(env, partyId, generated.id)).trace, null);
    await root.runtime.close();
    root = await createPresenceProductionRoot(env);
    await root.runtime.getPartyScreen(partyId);
    assert.deepEqual(await people(), first, 'a restart neither adds nor changes the people of the place');
  });

async function withCauseDiagnostic(label, work) {
  try { return await work(); }
  catch (error) {
    const summary = safeCauseSummary(error?.details?.diagnostics?.cause);
    if (summary) throw new Error(`${label}: ${error.message}; generated expansion cause=${JSON.stringify(summary)}`, { cause: error });
    throw error;
  }
}

function safeCauseSummary(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth >= 8) return null;
  const summary = {};
  for (const key of ['code', 'reason']) {
    if (typeof value[key] === 'string') summary[key] = value[key];
  }
  const context = value.context;
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    const safeContext = Object.fromEntries(Object.entries(context).filter(([key, field]) =>
      typeof field === 'boolean' || Number.isSafeInteger(field)
      || (['source_position_id', 'actor_scene_position_id'].includes(key)
        && typeof field === 'string')));
    if (Object.keys(safeContext).length) summary.context = safeContext;
  }
  const nested = safeCauseSummary(value.cause, depth + 1);
  if (nested) summary.cause = nested;
  return Object.keys(summary).length ? summary : null;
}
