import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const container = `actor-equipment-${randomUUID().slice(0, 12)}`;
const docker = (args, input, timeout = 60_000) => spawnSync('docker', args, { input, encoding: 'utf8', timeout });

test('party migration 020 preserves rows and permits equipped NPC or player holders', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  t.after(() => docker(['rm', '-f', container]));
  assert.equal(docker([
    'run', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=equipment', '-e', 'POSTGRES_USER=equipment',
    '-e', 'POSTGRES_DB=party', 'postgres:16-alpine'
  ]).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    ready = docker([
      'exec', container, 'psql', '-qAt', '-U', 'equipment', '-d', 'party',
      '-c', 'SELECT 1'
    ]).status === 0;
    if (ready) break;
  }
  assert.equal(ready, true);
  const psql = (sql) => docker([
    'exec', '-i', container, 'psql', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-U', 'equipment', '-d', 'party'
  ], sql);
  const setup = psql(`
    CREATE SCHEMA party_runtime;
    CREATE TABLE party_runtime.party_item_placements (
      party_id text NOT NULL,
      item_id text NOT NULL,
      holder_npc_id text,
      holder_character_id text,
      physical_position text,
      equipment_slot_category_id text,
      PRIMARY KEY (party_id,item_id),
      CHECK ((holder_npc_id IS NULL) <> (holder_character_id IS NULL)),
      CHECK ((physical_position IS NOT NULL) =
        (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)),
      CHECK (equipment_slot_category_id IS NULL OR
        (holder_character_id IS NOT NULL AND physical_position = 'equipped')),
      CHECK (physical_position <> 'equipped' OR equipment_slot_category_id IS NOT NULL)
    );
    INSERT INTO party_runtime.party_item_placements VALUES
      ('party','existing-player-item',NULL,'player','equipped','outer_garment'),
      ('party','historical-npc-item','historical-npc',NULL,'hands',NULL);
    CREATE TABLE party_runtime.party_containers (
      party_id text NOT NULL,
      container_id text NOT NULL,
      holder_npc_id text,
      holder_character_id text,
      physical_position text,
      equipment_slot_category_id text,
      PRIMARY KEY (party_id,container_id),
      CHECK ((holder_npc_id IS NULL) <> (holder_character_id IS NULL)),
      CHECK (physical_position IS NULL OR holder_character_id IS NOT NULL),
      CHECK (holder_character_id IS NULL OR physical_position IS NOT NULL),
      CHECK (equipment_slot_category_id IS NULL OR
        (holder_character_id IS NOT NULL AND physical_position = 'equipped')),
      CHECK (physical_position <> 'equipped' OR
        equipment_slot_category_id IS NOT NULL)
    );
    INSERT INTO party_runtime.party_containers VALUES
      ('party','historical-npc-container','historical-npc',NULL,NULL,NULL);
  `);
  assert.equal(setup.status, 0, setup.stderr);
  const migrated = psql(await readFile('schemas/party-db/020_party_runtime_actor_equipment.sql', 'utf8'));
  assert.equal(migrated.status, 0, migrated.stderr);
  const inserted = psql(`
    INSERT INTO party_runtime.party_item_placements VALUES
      ('party','npc-item','npc',NULL,'equipped','base_garment');
    INSERT INTO party_runtime.party_containers VALUES
      ('party','npc-container','npc',NULL,'worn_quick',NULL);
    SELECT item_id,holder_npc_id,holder_character_id,physical_position,equipment_slot_category_id
    FROM party_runtime.party_item_placements ORDER BY item_id;
  `);
  assert.equal(inserted.status, 0, inserted.stderr);
  assert.match(inserted.stdout, /existing-player-item\|\|player\|equipped\|outer_garment/u);
  assert.match(inserted.stdout, /historical-npc-item\|historical-npc\|\|hands\|/u);
  assert.match(inserted.stdout, /npc-item\|npc\|\|equipped\|base_garment/u);
  const containers = psql(`SELECT container_id,holder_npc_id,
    holder_character_id,physical_position,equipment_slot_category_id
    FROM party_runtime.party_containers ORDER BY container_id;`);
  assert.equal(containers.status, 0, containers.stderr);
  assert.match(containers.stdout,
    /historical-npc-container\|historical-npc\|\|\|/u);
  assert.match(containers.stdout,
    /npc-container\|npc\|\|worn_quick\|/u);
  const missingSlot = psql(`INSERT INTO party_runtime.party_item_placements VALUES
    ('party','invalid-no-slot','npc',NULL,'equipped',NULL);`);
  assert.notEqual(missingSlot.status, 0);
  const wrongPosition = psql(`INSERT INTO party_runtime.party_item_placements VALUES
    ('party','invalid-hands-slot','npc',NULL,'hands','base_garment');`);
  assert.notEqual(wrongPosition.status, 0);
  const missingPosition = psql(`INSERT INTO party_runtime.party_item_placements VALUES
    ('party','invalid-no-position','npc',NULL,NULL,NULL);`);
  assert.notEqual(missingPosition.status, 0);
  const containerMissingPosition = psql(`INSERT INTO party_runtime.party_containers VALUES
    ('party','invalid-container-no-position','npc',NULL,NULL,NULL);`);
  assert.notEqual(containerMissingPosition.status, 0);
});
