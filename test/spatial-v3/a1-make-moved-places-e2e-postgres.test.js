import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
  submitObserveTurn,
} from './presence-rules-production-e2e-fixture.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
const passage = (from, to) => {
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to));
  assert.ok(binding, `approved line missing: ${from} -> ${to}`);
  return binding.line_discriminator ? `${binding.line_name} · ${binding.line_discriminator}` : binding.line_name;
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
    await submitObserveTurn(runtime, partyId, TARGET_SMOKE_INPUT);
    let step = 0;
    const turn = (raw_text) => runtime.submitTurn(partyId, { raw_text, request_id: `make-${partyId}-${step++}` });
    const madeSql = `SELECT item_id, state_version FROM party_runtime.party_items
      WHERE party_id=$1 AND state::text LIKE '%action_production%' ORDER BY item_id`;
    const made = async () => (await env.partyPool.query(madeSql, [partyId])).rows;

    async function walkTo(to) {
      const from = (await whereIs(env.partyPool, partyId)).name;
      const named = passage(from, to);
      await turn(named);
      assert.equal((await whereIs(env.partyPool, partyId)).name, to);
    }

    /** Each make tears one more strip: one new a1-result item on the actor's scene position, the shirt changed in place. */
    let shirtVersion = 1;
    async function makeHere(place, { anchored }) {
      const before = await made();
      assert.equal((await whereIs(env.partyPool, partyId)).name, place);
      await turn(MAKE);
      const after = await made();
      const known = new Set(before.map(({ item_id: id }) => id));
      const fresh = after.filter(({ item_id: id }) => !known.has(id) && id.startsWith('a1-result:'));
      assert.equal(fresh.length, 1, `${place}: exactly one new a1-result strip`);
      shirtVersion += 1;
      const shirt = after.find(({ item_id: id, state_version: v }) => !id.startsWith('a1-result:') && Number(v) === shirtVersion);
      assert.ok(shirt, `${place}: the source shirt is at state_version ${shirtVersion}`);
      const actorScene = (await env.partyPool.query(
        `SELECT scene_position_id FROM party_runtime.party_journey_locations
          WHERE party_id=$1 AND owner_kind='actor'`, [partyId])).rows[0].scene_position_id;
      const strip = (await env.partyPool.query(
        `SELECT p.anchor_id, p.scene_position_id, e.position_node_id
           FROM party_runtime.party_item_placements p
           JOIN party_runtime.entity_placements e ON e.party_id=p.party_id AND e.entity_kind='item' AND e.entity_id=p.item_id
          WHERE p.party_id=$1 AND p.item_id=$2`, [partyId, fresh[0].item_id])).rows[0];
      assert.equal(strip.position_node_id, actorScene, `${place}: the strip lies on the actor's scene position`);
      if (anchored) {
        assert.ok(strip.anchor_id, `${place}: legacy start keeps the anchor placement`);
        assert.equal(strip.scene_position_id, null);
      } else {
        assert.equal(strip.anchor_id, null, `${place}: no anchor after walking`);
        assert.equal(strip.scene_position_id, actorScene, `${place}: item placement carries the scene position`);
      }
    }

    await makeHere('work_storage', { anchored: true });
    await walkTo('water_access');
    await makeHere('water_access', { anchored: false });
    await walkTo('forest_path');
    await walkTo('meeting_area');
    await makeHere('meeting_area', { anchored: false });
    assert.equal(seen.makeSteps, 3);
  });
