import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { socialRoleGenerationGateSql } from '../src/world/social-generation-gate.js';

test('generation gate SQL does not filter on role_group', () => {
  const sql = socialRoleGenerationGateSql('rsr');
  assert.doesNotMatch(sql, /role_group/iu);
  assert.match(sql, /social_position_archetype_id/iu);
  assert.match(sql, /mapping_review_status/iu);
});

test('regional-context retriever selects role_group for display only', async () => {
  const source = await readFile(
    resolve('src/world/new-game-pipeline/retrievers/regional-context.js'),
    'utf8'
  );
  const whereBlock = source.slice(source.indexOf('FROM world_base.region_social_roles'));
  assert.doesNotMatch(whereBlock, /role_group\s*=/iu);
  assert.doesNotMatch(whereBlock, /role_group\s+IN/iu);
  assert.match(source, /rsr\.role_group/iu);
});

test('world-base-db social role query does not filter on role_group', async () => {
  const source = await readFile(resolve('src/world/world-base-db.js'), 'utf8');
  const gateIdx = source.indexOf('socialRoleGenerationGateSql');
  assert.ok(gateIdx >= 0);
  const snippet = source.slice(gateIdx, gateIdx + 600);
  assert.doesNotMatch(snippet, /role_group/iu);
});
