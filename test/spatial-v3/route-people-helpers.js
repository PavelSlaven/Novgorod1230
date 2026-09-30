import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Shared by the route-people PG tests: walking the canonical places of Vikhtuy by the approved passage labels
// and reading who stands at a place and what the first-arrival trace says about the people.
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bindings = read('../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json');
const labels = read('../../data/world-catalogs/novgorod/m2c-canonical-connection-labels/candidate.json').labels;
export const g5 = (name) => `cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_${name}`;
export const passage = (from, to) => {
  const binding = bindings.find((row) => row.from_canonical_g5_id === g5(from) && row.to_canonical_g5_id === g5(to));
  return labels.find((row) => row.binding_ref.id === binding.id).display_label;
};

export function createRouteWalker({ env, runtimeRef, partyId }) {
  let step = 0;
  const turn = (raw_text) => runtimeRef().runtime.submitTurn(partyId, { raw_text, request_id: `route-${partyId}-${step++}` });
  const where = async () => {
    const row = (await env.partyPool.query(
      `SELECT COALESCE(site.canonical_g5_ref->>'entity_id', site.canonical_g5_ref->>'id') AS g5, site.id AS site_id,
              pos.template_slot_key AS slot
         FROM party_runtime.party_journey_locations loc
         JOIN party_runtime.scene_position_nodes pos ON pos.party_id=loc.party_id AND pos.id=loc.scene_position_id
         JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
         JOIN party_runtime.party_scene_baselines base ON base.party_id=g6.party_id AND base.id=g6.scene_baseline_id
         JOIN party_runtime.party_g5_sites site ON site.party_id=base.party_id AND site.id=base.host_id
        WHERE loc.party_id=$1 AND loc.owner_kind='actor'`, [partyId])).rows[0];
    return { ...row, name: row.g5.replace(g5(''), '') };
  };
  /** Walk to the departure position of the current place, then take the named passage. */
  async function walkTo(to) {
    const from = (await where()).name;
    const named = passage(from, to);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const at = await where();
      if (at.name !== from) break;
      await turn(at.slot === 'departure' ? named : `${named} — подход`);
    }
    const arrived = await where();
    assert.equal(arrived.name, to, `${from} -> ${to} via "${named}"`);
    return arrived;
  }
  return { where, walkTo };
}

/** People standing at a site (the NPC placements of its G6 scenes) and the people part of its first-arrival trace. */
export async function peopleAt(env, partyId, siteId) {
  const npcs = (await env.partyPool.query(
    `SELECT n.npc_id, n.run_id, b.role_ref->>'id' AS role, b.occupation_ref->>'id' AS occupation,
            pos.template_slot_key AS slot
       FROM party_runtime.entity_placements pl
       JOIN party_runtime.scene_position_nodes pos ON pos.party_id=pl.party_id AND pos.id=pl.position_node_id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=pos.party_id AND g6.id=pos.g6_instance_id
       JOIN party_runtime.party_npcs n ON n.party_id=pl.party_id AND n.npc_id=pl.entity_id
       LEFT JOIN party_runtime.party_actor_profile_bindings b
         ON b.party_id=n.party_id AND b.actor_id=n.npc_id AND b.actor_kind='npc'
      WHERE pl.party_id=$1 AND pl.entity_kind='npc' AND g6.host_id=$2
      ORDER BY n.npc_id`, [partyId, siteId])).rows;
  const run = (await env.partyPool.query(
    `SELECT trace->'first_entry'->'people' AS people FROM party_runtime.party_materialization_runs
      WHERE party_id=$1 AND run_kind='expansion'
        AND created_refs @> $2::jsonb`, [partyId, JSON.stringify([{ table: 'party_g5_sites', id: siteId }])])).rows[0];
  return { npcs, trace: run?.people ?? null };
}
