import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const labels = read('../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json').labels;
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const passage = (from, to) => {
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to));
  return labels.find((row) => row.binding_ref.id === binding.id).display_label;
};

const PLANNER = 'Return only one JSON object containing the semantic choice for one turn step.';
const MAKE = 'Оторву полосу от подола рубахи.';

/** The plan the live Qwen returns for "tear a strip from the hem" once its result_class is right. */
function makePlan(request) {
  const actor = request.actor.actor_id ?? request.actor.actor_ref;
  const shirt = request.player_safe_state.items.find(({ name, placement }) =>
    name === 'нижняя рубаха' && placement?.holder_character_id === actor);
  assert.ok(shirt, 'own shirt must be a planner-visible item');
  return { interpretation: { player_goal: MAKE, grounded_attempt: MAKE, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    direct_result_kind: null, operation_choice: null,
    operations: [{ op: 'request_item_use', actor_ref: actor, item_ref: shirt.item_id,
      use_kind: 'other', target_refs: [], action_production: { source_refs: [shirt.item_id],
        tool_refs: [], requested_output_count: null, identity_mode: 'independent_outputs',
        origin: 'direct_partition', result_class: 'partial_transformation',
        material_extent: 'minor', output_class: 'ordinary_mundane',
        result_descriptor: { display_name: 'полоса ткани',
          physical_description: 'отрезанная полоса льняной ткани',
          qualitative_facts: ['отделена от подола'], removed_physical_fact_refs: [],
          inscription_text: null, physical_form: 'long',
          source_fact_delta: { physical_description: 'рубаха с укороченным подолом',
            qualitative_facts: ['подол укорочен'], removed_physical_fact_refs: [],
            physical_form: 'regular' } } } }],
    check: null, continuation: null, clarification: null, reason_code: 'action_production',
    reason: 'Игрок отрывает полосу от рубахи.' };
}

/** Walking and narration come from the shared fixture; only the make turn is scripted here. */
function installMakeFetch(seen) {
  const restoreBase = installPresenceProductionE2eFetch({ movementPrefs: { exactMovement: true } });
  const base = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const user = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const respond = (output) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
    if (system.startsWith(PLANNER) && (user.request ?? user).root_player_action === MAKE) {
      seen.makeSteps += 1;
      return respond(makePlan(user.request ?? user));
    }
    if (system.startsWith('Return only {"pass":true,"concerns":[]}')) {
      seen.auditorCalls += 1;
      return respond({ pass: true, concerns: [] });
    }
    return base(url, init);
  };
  return () => { globalThis.fetch = base; restoreBase(); };
}

async function whereIs(partyPool, partyId) {
  const row = (await partyPool.query(
    `SELECT COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id') AS g5,
            pos.template_slot_key AS slot
       FROM party_runtime.party_journey_locations loc
       JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
       JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
      WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId])).rows[0];
  return { ...row, name: row.g5.replace(g5(''), '') };
}

test('A1 "tear a strip from the own shirt" works at the start and at places reached by walking',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const seen = { makeSteps: 0, auditorCalls: 0 };
    const restoreFetch = installMakeFetch(seen);
    t.after(() => restoreFetch());
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    const partyId = await publicStartScenario(runtime, 'novgorod_vikhtuy_work_storage_v1');
    let step = 0;
    const turn = (raw_text) => runtime.submitTurn(partyId, { raw_text, request_id: `make-${partyId}-${step++}` });
    const madeSql = `SELECT item_id, state_version FROM party_runtime.party_items
      WHERE party_id=$1 AND state::text LIKE '%action_production%' ORDER BY item_id`;
    const made = async () => (await env.partyPool.query(madeSql, [partyId])).rows;

    async function walkTo(to) {
      const from = (await whereIs(env.partyPool, partyId)).name;
      const named = passage(from, to);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const at = await whereIs(env.partyPool, partyId);
        if (at.name !== from) break;
        await turn(at.slot === 'departure' ? named : `${named} — подход`);
      }
      assert.equal((await whereIs(env.partyPool, partyId)).name, to);
    }

    /** Each make tears one more strip: one new a1-result item and the shirt changed in place. */
    async function makeHere(place) {
      const before = await made();
      assert.equal((await whereIs(env.partyPool, partyId)).name, place);
      await turn(MAKE);
      const after = await made();
      assert.equal(after.length, before.length + (before.length === 0 ? 2 : 1),
        `${place}: a new strip appears (and the shirt is first touched)`);
      assert.equal(after.filter(({ item_id: id }) => id.startsWith('a1-result:')).length,
        before.filter(({ item_id: id }) => id.startsWith('a1-result:')).length + 1, `${place}: new a1-result item`);
      const strip = (await env.partyPool.query(
        `SELECT p.scene_position_id, p.holder_character_id, e.position_node_id
           FROM party_runtime.party_item_placements p
           JOIN party_runtime.entity_placements e ON e.party_id=p.party_id AND e.entity_kind='item' AND e.entity_id=p.item_id
          WHERE p.party_id=$1 AND p.item_id LIKE 'a1-result:%' ORDER BY p.item_id DESC LIMIT 1`, [partyId])).rows[0];
      assert.ok(strip?.position_node_id, `${place}: the strip lies on a scene position`);
    }

    await makeHere('work_storage');
    await walkTo('water_access');
    await makeHere('water_access');
    await walkTo('forest_path');
    await walkTo('meeting_area');
    await makeHere('meeting_area');
    assert.equal(seen.makeSteps, 3);
  });
