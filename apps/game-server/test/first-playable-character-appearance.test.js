import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateActorBaseAppearance } from '@rus/actors';
import { insertBoatAndInventory } from
  '../src/infrastructure/postgres/first-playable/inventory.js';
import { landingMaterializationWrites } from
  '../src/infrastructure/postgres/first-playable/plan-materialization.js';
import {
  resolveLegacyNpcProfile,
  resolveNpcProfile,
  resolvePlayerProfile
} from '../src/runtime/first-playable/shared.js';
import { baselinePlayer } from '../src/runtime/first-playable/setup.js';

test('first-playable v2 completes new actors while the v1 resolver remains historical', () => {
  const player = resolvePlayerProfile('first-playable-player');
  const npc = resolveNpcProfile('first-playable-npc');
  const historical = resolveLegacyNpcProfile('first-playable-npc');
  assert.equal(player.catalog_version, 2);
  assert.equal(npc.catalog_version, 2);
  assert.equal(validateActorBaseAppearance(player.identity).ok, true);
  assert.equal(validateActorBaseAppearance(npc.identity).ok, true);
  assert.equal(historical.catalog_version, 1);
  assert.equal(historical.identity, null);
  assert.equal(npc.equipment_profile.initial_item_allocations
    .filter(({ equipment_slot_category_id: slot }) => slot != null).length, 2);
  const baseline = baselinePlayer('Путник', 'first-playable-baseline');
  assert.equal(validateActorBaseAppearance(baseline.identity).ok, true);
  assert.equal(baseline.appearance_profile_id,
    'first_playable_baseline_traveller_appearance_v1');
  const baselineIdentities = Array.from({ length: 32 }, (_, index) =>
    baselinePlayer('Путник', `first-playable-baseline:${index}`).identity);
  assert.equal(new Set(baselineIdentities.map(({ sex_category: sex }) => sex))
    .size > 1, true);
  assert.equal(new Set(baselineIdentities.map(({ age_category: age }) => age))
    .size > 1, true);
  assert.equal('clothing_template_refs' in baseline.equipment_profile, false);

  const historicalWrites = landingMaterializationWrites({
    previousState: { landing_materialized: false },
    state: {
      party_id: 'party:first-playable-v1',
      first_playable_catalog_version: 1,
      landing_materialized: true,
      npc: historical
    },
    changeSet: 'change:landing-v1'
  });
  assert.equal(historicalWrites.inserts.find(({ target_table: table }) =>
    table === 'party_npcs').record.identity_state.identity,
  'not_yet_enriched');
  assert.equal(historicalWrites.inserts.find(({ target_table: table }) =>
    table === 'party_items').record.item_id,
  'item:party:first-playable-v1:fishing-net');
});

test('first-playable persistence writes visual snapshots and normalized item placements', async () => {
  const player = resolvePlayerProfile('first-playable-persist-player');
  const npc = resolveNpcProfile('npc:party:first-playable:fisher');
  const playerTx = captureTx();
  await insertBoatAndInventory(playerTx, {
    state: {
      party_id: 'party:first-playable',
      player: { id: 'player:first-playable', equipment_profile: player.equipment_profile },
      boat: { id: 'boat:first-playable' }
    },
    changeSet: 'change:start',
    runId: 'run:start',
    landingPosition: 'position:landing'
  });
  assert.equal(playerTx.calls.filter(({ sql }) =>
    sql.includes('party_runtime.party_item_placements')).length,
  player.equipment_profile.initial_item_allocations.length);
  assert.equal(playerTx.calls.some(({ values }) => JSON.stringify(values)
    .includes('visual_profile_snapshot')), true);

  const npcWrites = landingMaterializationWrites({
    previousState: { landing_materialized: false },
    state: { party_id: 'party:first-playable', landing_materialized: true,
      npc: { ...npc, id: 'npc:party:first-playable:fisher' } },
    changeSet: 'change:landing'
  });
  assert.equal(npcWrites.inserts.filter(({ target_table: table }) =>
    table === 'party_item_placements').length,
  npc.equipment_profile.initial_item_allocations.length);
  const npcRow = npcWrites.inserts.find(({ target_table: table }) =>
    table === 'party_npcs').record;
  assert.equal(validateActorBaseAppearance(npcRow.identity_state).ok, true);
  assert.equal(npcWrites.inserts.filter(({ target_table: table, record }) =>
    table === 'party_items'
    && record.state.visual_profile_snapshot != null).length, 2);
  const basket = npcWrites.inserts.find(({ target_table: table }) =>
    table === 'party_containers').record;
  assert.equal(basket.holder_npc_id, 'npc:party:first-playable:fisher');
  assert.equal(basket.physical_position, 'external');
});

test('first-playable v2 landing blocks before P16 without canonical NPC appearance', () => {
  const npc = resolveNpcProfile('npc:party:first-playable:invalid-fisher');
  assert.throws(() => landingMaterializationWrites({
    previousState: { landing_materialized: false },
    state: {
      party_id: 'party:first-playable-invalid',
      first_playable_catalog_version: 2,
      landing_materialized: true,
      npc: { ...npc, identity: null }
    },
    changeSet: 'change:landing-invalid'
  }), (error) =>
    error?.code === 'FIRST_PLAYABLE_ACTOR_APPEARANCE_DATA_GAP');
});

test('production first-playable appearance path has no Math.random', async () => {
  const source = await readFile(new URL('../src/runtime/first-playable/shared.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random/u);
});

test('first-playable v2 source evidence pins the current canonical bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/first-playable-v2/manifest.json',
    import.meta.url
  ), 'utf8'));
  for (const source of manifest.source_evidence) {
    const bytes = await readFile(new URL(`../../../${source.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256,
      source.path);
  }
});

function captureTx() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: [] };
    }
  };
}
