#!/usr/bin/env node
/**
 * Rebuild live-world-runtime-v17 fresh-schema-request.json from current SQL bytes
 * and SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST. Test: rebuild === committed file.
 * source_commit is an explicit admin pin of the last significant input change —
 * never silent HEAD (REVIEW-067 N6).
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
const REVIEW_OUT = resolve(
  ROOT,
  'data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-review-request.md'
);
const ENTRY = 'infra/world-base/schema.sql';
const PART_COUNT = 30;
const EXPECTED_TABLES = 224;
const INPUT_PATHS = [
  ENTRY,
  'infra/world-base/schema',
  'schemas/party-db',
  'apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
];

function sha256File(rel) {
  const buf = readFileSync(resolve(ROOT, rel));
  return {
    path: rel.replaceAll('\\', '/'),
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex')
  };
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Last commit that touched fresh-schema SQL/owner inputs (not HEAD). */
export function resolveFreshSchemaSourceCommit({
  envCommit = process.env.FRESH_SCHEMA_SOURCE_COMMIT?.trim(),
  argv = process.argv.slice(2)
} = {}) {
  if (envCommit) return envCommit;
  const flag = argv.find((a) => a.startsWith('--source-commit='));
  if (flag) return flag.slice('--source-commit='.length).trim();
  const idx = argv.indexOf('--source-commit');
  if (idx >= 0 && argv[idx + 1]) return String(argv[idx + 1]).trim();
  const r = spawnSync(
    'git',
    ['log', '-1', '--format=%H', '--', ...INPUT_PATHS],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (r.status !== 0 || !r.stdout.trim()) {
    throw new Error(
      'fresh-schema source_commit requires --source-commit, FRESH_SCHEMA_SOURCE_COMMIT, or a git history on schema inputs'
    );
  }
  return r.stdout.trim();
}

export function buildFreshSchemaRequest({
  source_commit = resolveFreshSchemaSourceCommit(),
  templatePath = OUT
} = {}) {
  if (!source_commit || !/^[0-9a-f]{40}$/i.test(source_commit)) {
    throw new Error(`fresh-schema source_commit must be a full 40-char git sha, got: ${source_commit}`);
  }
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

export function renderFreshSchemaReviewRequest(request, requestBytes) {
  const digest = sha256Buffer(Buffer.from(renderFreshSchemaRequest(request), 'utf8'));
  const parts = request.world_schema.ordered_parts.length;
  const migrations = request.party_schema.ordered_migrations.length;
  const tables = request.world_schema.expected_world_base_tables;
  return `# Fresh v17 database schema review request

Review [fresh-schema-request.json](fresh-schema-request.json) at source commit
\`${request.source_commit}\`. Request SHA-256:
\`${digest}\` (${requestBytes} bytes).
This is a pending request, not an approval or execution record.

Requested target is two **new** databases in the existing managed local-play
PostgreSQL cluster: \`novgorod_world_v17\` owned by \`world_operator\`, and
\`novgorod_party_v17\` owned by \`party_operator\`. Existing \`novgorod_world\` and
\`novgorod_party\` must remain unchanged. Independent Sol high review must verify
the exact request, source commit, all ${parts} world DDL parts, the world entrypoint,
the ordered ${migrations} party migrations and chain digest
\`${request.party_schema.chain_digest}\` before any write.

The operator must confirm cluster identity, database absence, roles, and a
verified backup before creating either database. Stop if either v17 name exists.
After creation, prove each database empty before applying DDL. Apply the world
entrypoint to the new world database only: it includes \`01.sql\`, whose first
statement drops \`world_base\` with \`CASCADE\`. Use
\`psql -X -v ON_ERROR_STOP=1 -1 -f infra/world-base/schema.sql\` from the
repository root against that verified target. Apply party migrations through
\`runSpatialV3TargetMigrations\` against the new party database only; its owner
executes the complete ordered chain in one transaction.

Read back ${tables} world tables, the world-reader grants, party migration result
\`applied: ${migrations}\`, empty party count, and unchanged old-database row counts. Record
actual target identity, source hashes, execution results and exact readback in
an independent execution attestation. Do not treat this request or its review
as evidence that either database was created.

P12 import needs its **own** request and independent attestation after schema
readback. The old P12 request targets a different database and cannot authorize
import into \`novgorod_world_v17\`. No P12 import, catalog activation, runtime
selection, party migration or default startup change is in this request.
`;
}

if (process.argv[1]?.includes('build-live-world-v17-fresh-schema-request.mjs')) {
  const request = buildFreshSchemaRequest();
  if (request.party_schema.chain_digest !== SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST) {
    throw new Error('chain_digest mismatch against SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST');
  }
  const rendered = renderFreshSchemaRequest(request);
  writeFileSync(OUT, rendered);
  writeFileSync(REVIEW_OUT, renderFreshSchemaReviewRequest(request, Buffer.byteLength(rendered)));
  console.log(JSON.stringify({
    out: OUT,
    review: REVIEW_OUT,
    source_commit: request.source_commit,
    chain_digest: request.party_schema.chain_digest,
    world_parts: request.world_schema.ordered_parts.length,
    party_migrations: request.party_schema.ordered_migrations.length,
    bytes: statSync(OUT).size
  }, null, 2));
}
