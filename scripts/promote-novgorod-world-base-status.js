import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';
import {
  applyPromotePlan,
  auditNovgorodWorldBase,
  buildPromotePlan,
  buildPromoteSql,
  defaultFkAuditReportPath,
  projectPreflightAfterPlan,
  readFkAuditReport
} from '../src/world/novgorod-world-base-promote.js';

const { Client } = pg;
const repoRoot = resolve(import.meta.dirname, '..');

export function getAdminUrl(env = process.env) {
  const user = env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
  const db = env.POSTGRES_DB || 'world_db';
  const port = env.POSTGRES_PORT || '5432';
  const host = env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

export function parseCliArgs(argv = process.argv) {
  const mode = readArg(argv, '--mode') || 'audit';
  const outputSql = resolve(readArg(argv, '--output-sql') || joinRepo('data/novgorod-promote.sql'));
  const json = argv.includes('--json');
  const confirm = argv.includes('--confirm');
  const requireFkAudit = argv.includes('--require-fk-audit');
  const fkAuditReportPath = resolve(
    readArg(argv, '--fk-audit-report') || defaultFkAuditReportPath(repoRoot)
  );
  return { mode, outputSql, json, confirm, requireFkAudit, fkAuditReportPath };
}

export function formatAuditReport(audit, { mode } = {}) {
  const lines = [
    `mode: ${mode}`,
    `region: ${audit.regionId}`,
    `eligible: ${audit.eligible.length}`,
    `blocked: ${audit.blocked.length}`,
    `skipped: ${audit.skipped.length}`,
    `preflight projected ok: ${audit.preflight.ok}`
  ];

  if (audit.warnings.length) {
    lines.push('warnings:');
    for (const warning of audit.warnings) lines.push(`  - ${warning}`);
  }

  if (audit.blocked.length) {
    lines.push('blocked sample:');
    for (const row of audit.blocked.slice(0, 10)) {
      lines.push(`  - ${row.table}.${row.id} (${row.status})`);
    }
  }

  if (!audit.preflight.ok) {
    lines.push('preflight still red:');
    for (const check of audit.preflight.checks.filter((item) => !item.ok)) {
      lines.push(`  - ${check.id}: ${check.message}`);
    }
  }

  if (mode === 'dry-run' && audit.eligible.length) {
    lines.push('eligible sample:');
    for (const row of audit.eligible.slice(0, 20)) {
      lines.push(`  - ${row.table}.${row.id}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  await loadLocalEnv(repoRoot);
  const { mode, outputSql, json, confirm, requireFkAudit, fkAuditReportPath } = parseCliArgs();
  const databaseUrl = process.env.WORLD_DB_ADMIN_URL || getAdminUrl();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const auditOptions = {};
    const audit = await auditNovgorodWorldBase(client, auditOptions);

    try {
      const fkAudit = readFkAuditReport(fkAuditReportPath);
      audit.fkAudit = fkAudit;
      if (fkAudit.blocking) {
        const message = `FK audit report has blocking violations: ${fkAuditReportPath}`;
        if (requireFkAudit && mode === 'apply') throw new Error(message);
        audit.warnings.push(
          requireFkAudit ? message : `${message} (ignored without --require-fk-audit)`
        );
      }
    } catch (error) {
      if (requireFkAudit && mode === 'apply') throw error;
      audit.warnings.push(`FK audit report unavailable: ${fkAuditReportPath}`);
    }

    if (mode === 'audit') {
      if (json) console.log(JSON.stringify(audit, null, 2));
      else console.log(formatAuditReport(audit, { mode }));
      return;
    }

    if (mode === 'dry-run') {
      const payload = {
        ...audit,
        plan: {
          eligibleCount: audit.eligible.length,
          eligibleIds: audit.eligible.map((row) => `${row.table}.${row.id}`)
        }
      };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else console.log(formatAuditReport(audit, { mode }));
      return;
    }

    const plan = await buildPromotePlan(client, { promotedAt: audit.promotedAt });

    if (mode === 'emit-sql') {
      const sql = buildPromoteSql(plan);
      writeFileSync(outputSql, sql, 'utf8');
      const payload = {
        mode,
        outputSql,
        eligible: plan.eligible.length,
        preflight: projectPreflightAfterPlan(plan)
      };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`SQL written: ${outputSql}`);
        console.log(`eligible rows: ${plan.eligible.length}`);
      }
      return;
    }

    if (mode === 'apply') {
      if (!confirm) throw new Error('--confirm is required for --mode apply');
      if (requireFkAudit) {
        const fkAudit = readFkAuditReport(fkAuditReportPath);
        if (fkAudit.blocking) {
          throw new Error(`FK audit report has blocking violations: ${fkAuditReportPath}`);
        }
      }
      await applyPromotePlan(client, plan);
      const after = await auditNovgorodWorldBase(client);
      const payload = {
        mode,
        applied: plan.eligible.length,
        preflight: after.preflight
      };
      if (json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`applied rows: ${plan.eligible.length}`);
        console.log(`preflight projected ok: ${after.preflight.ok}`);
      }
      return;
    }

    throw new Error(`Unknown mode: ${mode}`);
  } finally {
    await client.end().catch(() => {});
  }
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function joinRepo(relativePath) {
  return resolve(repoRoot, relativePath);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
