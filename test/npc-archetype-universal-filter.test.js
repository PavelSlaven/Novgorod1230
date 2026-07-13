import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PATH = resolve('tools/rus13-novgorod-regional-templates/novgorod_npc_archetypes_v1.json');

test('each NPC archetype has 4-field allow-list schema', async () => {
  const data = JSON.parse(await readFile(PATH, 'utf8'));
  const required = [
    'allowed_social_position_archetypes',
    'allowed_regional_roles',
    'allowed_occupation_archetypes',
    'allowed_regional_occupations'
  ];
  for (const key of [
    'background_npc_archetypes',
    'scene_npc_archetypes',
    'key_npc_archetypes',
    'historical_key_npc_archetypes'
  ]) {
    for (const archetype of data[key] ?? []) {
      for (const field of required) {
        assert.ok(field in archetype, `${archetype.archetype_id} missing ${field}`);
      }
      const hasUniversal = Array.isArray(archetype.allowed_social_position_archetypes)
        && archetype.allowed_social_position_archetypes.length > 0;
      const unsupported = archetype.unsupported === true;
      assert.ok(hasUniversal || unsupported, `${archetype.archetype_id} needs universal allow-list or unsupported flag`);
    }
  }
});
