#!/usr/bin/env node
/**
 * Rebuild live-world-runtime-v17 fresh-schema-request.json from current SQL bytes
 * and SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST. Test: rebuild === committed file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  SPATIAL_V3_TARGET_MIGRATION_FILES
} from '../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(
  ROOT,
  'data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json'
);
const ENTRY = 'infra/world-base/schema.sql';
const PART_COUNT = 27;
const EXPECTED_TABLES = 217;

function sha256File(rel) {
  const buf = readFileSync(resolve(ROOT, rel));
  return {
    path: rel.replaceAll('\\', '/'),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex')
  };
}

function sourceCommit() {
  const fromEnv = process.env.FRESH_SCHEMA_SOURCE_COMMIT?.trim();
  if (fromEnv) return fromEnv;
  const r = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8'
  });
  if (r.status !== 0) throw new Error(`git rev-parse failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function buildFreshSchemaRequest({
  source_commit = sourceCommit(),
  templatePath = OUT
} = {}) {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const ordered_parts = [];
  for (let i = 1; i <= PART_COUNT; i += 1) {
    const name = String(i).padStart(2, '0');
    ordered_parts.push(sha256File(`infra/world-base/schema/${name}.sql`));
  }
  const ordered_migrations = SPATIAL_V3_TARGET_MIGRATION_FILES.map((file) =>
    sha256File(`schemas/party-db/${file}`)
  );
  const owner = sha256File(
    'apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
  );
  return {
    ...template,
    status: 'pending_independent_high_review',
    source_commit,
    world_schema: {
      entrypoint: sha256File(ENTRY),
      ordered_parts,
      expected_world_base_tables: EXPECTED_TABLES
    },
    party_schema: {
      owner_migration_module: owner,
      ordered_migrations,
      chain_digest: SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
    },
    expected_readback: {
      ...template.expected_readback,
      world_base_table_count: EXPECTED_TABLES,
      party_migrations_applied: SPATIAL_V3_TARGET_MIGRATION_FILES.length
    }
  };
}

export function renderFreshSchemaRequest(request) {
  return `${JSON.stringify(request, null, 2)}\n`;
}

if (process.argv[1]?.includes('build-live-world-v17-fresh-schema-request.mjs')) {
  const request = buildFreshSchemaRequest();
  if (request.party_schema.chain_digest !== SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST) {
    throw new Error('chain_digest mismatch against SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST');
  }
  writeFileSync(OUT, renderFreshSchemaRequest(request));
  console.log(JSON.stringify({
    out: OUT,
    source_commit: request.source_commit,
    chain_digest: request.party_schema.chain_digest,
    world_parts: request.world_schema.ordered_parts.length,
    party_migrations: request.party_schema.ordered_migrations.length,
    bytes: statSync(OUT).size
  }, null, 2));
}
