import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30_000 });
const name = `p09-ddl-${process.pid}`;

test('P09 applies fresh, reapplies part 12, and rejects invalid deferred spatial-core mutations', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker is required for isolated PostgreSQL P09 DDL test');
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=p09_local_only', '-e', 'POSTGRES_USER=p09', '-e', 'POSTGRES_DB=p09', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'p09', '-d', 'p09']).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (docker(['exec', name, 'pg_isready', '-U', 'p09', '-d', 'p09']).status === 0) { ready = true; break; }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  const ddl = (await Promise.all(Array.from({ length: 12 }, (_, index) => readFile(`infra/world-base/schema/${String(index + 1).padStart(2, '0')}.sql`, 'utf8')))).join('\n');
  const psql = (sql) => docker(['exec', '-i', name, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'p09', '-d', 'p09'], sql);
  const freshApply = psql(ddl);
  assert.equal(freshApply.status, 0, freshApply.stderr);
  const reapply = psql(await readFile('infra/world-base/schema/12.sql', 'utf8'));
  assert.equal(reapply.status, 0, reapply.stderr);
  const setup = `
    INSERT INTO world_base.source_records (id, status) VALUES ('src', 'approved');
    INSERT INTO world_base.universal_categories (id, domain, stable_code, facet, preferred_label, definition, scope_note, inclusion_rules, exclusion_rules, title, status) VALUES ('cat','spatial','cat','class','class','d','s','i','e','t','approved');
    INSERT INTO world_base.spatial_v3_world_revisions (id,catalog_digest,status,provenance_ref) VALUES ('rev',repeat('a',64),'approved','src');
    INSERT INTO world_base.spatial_v3_authoring_versions VALUES ('spatial_node','g0',1,'rev',repeat('b',64),'approved','src',now(),NULL), ('spatial_node','g0b',1,'rev',repeat('c',64),'approved','src',now(),NULL), ('spatial_node','g1',1,'rev',repeat('d',64),'approved','src',now(),NULL);
    BEGIN;
    INSERT INTO world_base.spatial_v3_nodes (id,version,world_revision_id,spatial_level,primary_class_id,evidence_status,status,provenance_ref,canonical_digest) VALUES ('g0',1,'rev','G0','cat','reviewed','approved','src',repeat('e',64)), ('g0b',1,'rev','G0','cat','reviewed','approved','src',repeat('f',64)), ('g1',1,'rev','G1','cat','reviewed','approved','src',repeat('0',64));
    INSERT INTO world_base.spatial_v3_node_classes VALUES ('g0',1,'cat',0), ('g0b',1,'cat',0), ('g1',1,'cat',0);
    INSERT INTO world_base.spatial_v3_node_parents VALUES ('g1',1,'g0',1,'rev');
    INSERT INTO world_base.spatial_v3_g1_grid_cells VALUES ('g1',1,'rev','g0',1,'grid_east_north_v1',0,0,'A1');
    COMMIT;`;
  assert.equal(psql(setup).status, 0, 'valid G0/G1 aggregate commits');
  const legacyShape = psql(`
    ALTER TABLE world_base.spatial_v3_g1_grid_cells DROP CONSTRAINT spatial_v3_g1_grid_cells_convention_canonical;
    UPDATE world_base.spatial_v3_g1_grid_cells SET grid_convention = 'novgorod_g1_cardinal_grid_v1' WHERE node_id = 'g1';
    ALTER TABLE world_base.spatial_v3_g1_grid_cells ADD CONSTRAINT captured_old_grid_convention CHECK (grid_convention = 'novgorod_g1_cardinal_grid_v1');`);
  assert.equal(legacyShape.status, 0, legacyShape.stderr);
  const upgrade = psql(await readFile('infra/world-base/schema/12.sql', 'utf8'));
  assert.equal(upgrade.status, 0, upgrade.stderr);
  const upgraded = psql("SELECT grid_convention FROM world_base.spatial_v3_g1_grid_cells WHERE node_id = 'g1';");
  assert.match(upgraded.stdout, /grid_east_north_v1/u);
  const unknownShape = psql(`
    ALTER TABLE world_base.spatial_v3_g1_grid_cells DROP CONSTRAINT spatial_v3_g1_grid_cells_convention_canonical;
    ALTER TABLE world_base.spatial_v3_g1_grid_cells ADD CONSTRAINT captured_permissive_grid_convention CHECK (grid_convention IN ('grid_east_north_v1', 'unknown_grid'));
    UPDATE world_base.spatial_v3_g1_grid_cells SET grid_convention = 'unknown_grid' WHERE node_id = 'g1';`);
  assert.equal(unknownShape.status, 0, unknownShape.stderr);
  const blockedUpgrade = psql(await readFile('infra/world-base/schema/12.sql', 'utf8'));
  assert.notEqual(blockedUpgrade.status, 0, 'unknown legacy convention must fail closed before conversion');
  assert.match(blockedUpgrade.stderr, /unknown legacy value/u);
  const retainedUnknown = psql("SELECT grid_convention FROM world_base.spatial_v3_g1_grid_cells WHERE node_id = 'g1';");
  assert.match(retainedUnknown.stdout, /unknown_grid/u, 'failed preflight must not silently convert or delete data');
  const classCollision = psql(`
    ALTER TABLE world_base.spatial_v3_g1_grid_cells DROP CONSTRAINT captured_permissive_grid_convention;
    UPDATE world_base.spatial_v3_g1_grid_cells SET grid_convention = 'grid_east_north_v1' WHERE node_id = 'g1';
    ALTER TABLE world_base.spatial_v3_g1_grid_cells ADD CONSTRAINT spatial_v3_g1_grid_cells_convention_canonical CHECK (grid_convention = 'grid_east_north_v1');
    INSERT INTO world_base.universal_categories (id, domain, stable_code, facet, preferred_label, definition, scope_note, inclusion_rules, exclusion_rules, title, status) VALUES ('cat2','spatial','cat2','class','class2','d','s','i','e','t2','approved');
    DO $$ DECLARE constraint_row RECORD; BEGIN
      FOR constraint_row IN SELECT conname FROM pg_constraint WHERE conrelid = 'world_base.spatial_v3_node_classes'::regclass AND contype = 'u'
      LOOP EXECUTE format('ALTER TABLE world_base.spatial_v3_node_classes DROP CONSTRAINT %I', constraint_row.conname); END LOOP;
    END $$;
    INSERT INTO world_base.spatial_v3_node_classes VALUES ('g1',1,'cat2',1);`);
  assert.equal(classCollision.status, 0, classCollision.stderr);
  const blockedClassUpgrade = psql(await readFile('infra/world-base/schema/12.sql', 'utf8'));
  assert.notEqual(blockedClassUpgrade.status, 0, 'multiple legacy primary classes must block upgrade');
  assert.match(blockedClassUpgrade.stderr, /multiple legacy classes/u);
  const retainedClasses = psql("SELECT count(*) FROM world_base.spatial_v3_node_classes WHERE node_id = 'g1';");
  assert.match(retainedClasses.stdout, /2/u, 'failed collision preflight must retain both legacy rows');
  for (const statement of [
    "INSERT INTO world_base.spatial_v3_authoring_dependency_edges VALUES ('spatial_node','missing',1,'rev','uses','spatial_node','g0',1,0,'src');",
    "INSERT INTO world_base.spatial_v3_controlled_vocabulary_bindings VALUES ('controlled_entity_kind','registry','path','1',repeat('a',64),'rev','approved','src'); INSERT INTO world_base.spatial_v3_controlled_vocabulary_bindings VALUES ('controlled_entity_kind','registry2','path','1',repeat('b',64),'rev','approved','src');"
  ]) {
    const result = psql(statement);
    assert.notEqual(result.status, 0, `invalid FK/UNIQUE mutation must fail: ${statement}`);
    if (statement.includes("'missing'")) assert.match(result.stderr, /foreign key/u);
  }
  for (const mutation of ['DELETE FROM world_base.spatial_v3_node_parents WHERE child_id = \'g1\';', 'DELETE FROM world_base.spatial_v3_node_classes WHERE node_id = \'g1\';', 'DELETE FROM world_base.spatial_v3_g1_grid_cells WHERE node_id = \'g1\';', "UPDATE world_base.spatial_v3_node_parents SET parent_id = 'g0b' WHERE child_id = 'g1';"]) {
    const result = psql(`BEGIN; ${mutation} COMMIT;`);
    assert.notEqual(result.status, 0, `invalid deferred mutation must fail: ${mutation}`);
  }
});
