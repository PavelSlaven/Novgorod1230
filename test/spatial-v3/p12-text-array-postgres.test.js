import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { sqlLiteral } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000 });
const name = `p12-text-array-${process.pid}`;

test('P12 TEXT[] sqlLiteral round-trips through PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  t.after(() => docker(['rm', '-fv', name]));
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=p12', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((done) => setTimeout(done, 350));
    if (docker(['exec', name, 'pg_isready', '-U', 'p12', '-d', 'p12']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true);
  const ddlParts = await Promise.all(Array.from({ length: 27 }, (_, i) => readFile(`infra/world-base/schema/${String(i + 1).padStart(2, '0')}.sql`, 'utf8')));
  const psql = (sql) => docker(['exec', '-i', name, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'p12', '-d', 'p12'], sql);
  assert.equal(psql(`${ddlParts.join('\n')}\nINSERT INTO world_base.source_records (id,status) VALUES ('p12-source','approved');`).status, 0);
  const seasons = sqlLiteral(['spring', 'a,b', 'c"d'], 'TEXT[]', 'presence_rules.allowed_seasons');
  const guards = sqlLiteral(['guard,one'], 'TEXT[]', 'presence_rules.guards');
  const insert = `
BEGIN;
INSERT INTO world_base.spatial_v3_world_revisions (id, catalog_digest, status, provenance_ref)
VALUES ('p12-revision', '${'a'.repeat(64)}', 'approved', 'p12-source');
INSERT INTO world_base.presence_rules (
  rule_id, rule_version, world_revision_id, scope_kind, scope_ref, region_id, subject_kind, subject_ref, category_id,
  variants, presence_probability_ppm, count_limit, allowed_seasons, allowed_times, guards,
  refresh_class, confidence, status, provenance_ref, authoring_payload
) VALUES (
  'pr_text_array', 1, 'p12-revision', 'place_family', 'pf_test', NULL, 'category', 'cat_test', 'cat_test',
  '[]'::jsonb, 1000, 1, ${seasons}, ARRAY[]::text[], ${guards},
  'none', 'low', 'approved', 'p12-source', '{}'::jsonb
);
SELECT allowed_seasons::text, guards::text FROM world_base.presence_rules WHERE rule_id = 'pr_text_array';
ROLLBACK;
`;
  const result = psql(insert);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /spring/u);
  assert.match(result.stdout, /guard,one/u);
});
