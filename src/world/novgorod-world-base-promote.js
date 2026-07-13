import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NOVGOROD_REGION_ID,
  REQUIRED_GRAPH_SCALES,
  REQUIRED_WORLD_BASE_TABLES
} from './new-game-prerequisites.js';

export { NOVGOROD_REGION_ID, REQUIRED_WORLD_BASE_TABLES };

export const PROMOTE_REASON = 'novgorod_world_base_promote_v1';
export const CHANGED_BY = 'scripts/promote-novgorod-world-base-status.js';

export const BLOCKED_STATUSES = new Set(['needs_review', 'conflict', 'rejected']);
export const SKIP_STATUSES = new Set(['approved', 'usable_with_caution']);
export const ELIGIBLE_STATUS = 'draft';

export const LLM_CONTEXT_TYPES = ['region_start', 'scene_context', 'repair_context'];

export const GLOBAL_CLOSURE_KINDS = {
  landscape_templates: 'landscape_templates',
  water_body_templates: 'water_body_templates',
  route_templates: 'route_templates',
  land_use_templates: 'land_use_templates',
  place_templates: 'place_templates',
  item_templates: 'item_templates'
};

/** @type {Record<string, { scope: string, closureKind?: string }>} */
export const TABLE_REGISTRY = Object.fromEntries([
  ['regions', { scope: 'region_singleton' }],
  ['graph_scale_rules', { scope: 'scientific_global' }],
  ['graph_edge_modifiers', { scope: 'scientific_global' }],
  ['landscape_templates', { scope: 'global_closure', closureKind: 'landscape_templates' }],
  ['water_body_templates', { scope: 'global_closure', closureKind: 'water_body_templates' }],
  ['route_templates', { scope: 'global_closure', closureKind: 'route_templates' }],
  ['land_use_templates', { scope: 'global_closure', closureKind: 'land_use_templates' }],
  ['place_templates', { scope: 'global_closure', closureKind: 'place_templates' }],
  ['item_templates', { scope: 'global_closure', closureKind: 'item_templates' }],
  ['region_landscape_templates', { scope: 'region_direct' }],
  ['region_water_body_templates', { scope: 'region_direct' }],
  ['region_land_use_templates', { scope: 'region_direct' }],
  ['region_place_templates', { scope: 'region_direct' }],
  ['social_classes', { scope: 'scientific_global' }],
  ['social_role_archetypes', { scope: 'scientific_global' }],
  ['social_position_archetypes', { scope: 'scientific_global' }],
  ['occupation_archetypes', { scope: 'scientific_global' }],
  ['skill_catalog', { scope: 'scientific_global' }],
  ['region_social_roles', { scope: 'region_direct' }],
  ['region_occupations', { scope: 'region_direct' }],
  ['region_place_generation_rules', { scope: 'region_direct' }],
  ['place_generation_limits', { scope: 'region_direct' }],
  ['historical_events', { scope: 'region_direct' }],
  ['llm_context_packs', { scope: 'region_direct_llm' }],
  ['graph_nodes', { scope: 'region_direct' }],
  ['graph_edges', { scope: 'region_direct_via_nodes' }]
]);

export function classifyRowStatus(status) {
  if (status === ELIGIBLE_STATUS) return 'eligible';
  if (SKIP_STATUSES.has(status)) return 'skipped';
  if (BLOCKED_STATUSES.has(status)) return 'blocked';
  return 'blocked';
}

export function getTableScopeType(table) {
  return TABLE_REGISTRY[table]?.scope ?? null;
}

function emptyTableSummary() {
  return {
    scoped: 0,
    draft: 0,
    eligible: 0,
    blocked: 0,
    skipped: 0,
    eligibleIds: [],
    blockedIds: [],
    skippedIds: []
  };
}

function summarizeRows(rows) {
  const summary = emptyTableSummary();
  summary.scoped = rows.length;
  const eligible = [];
  const blocked = [];
  const skipped = [];

  for (const row of rows) {
    const bucket = classifyRowStatus(row.status);
    if (bucket === 'eligible') {
      summary.draft += 1;
      summary.eligible += 1;
      summary.eligibleIds.push(row.id);
      eligible.push(row);
    } else if (bucket === 'blocked') {
      summary.blocked += 1;
      summary.blockedIds.push(row.id);
      blocked.push(row);
    } else {
      summary.skipped += 1;
      summary.skippedIds.push(row.id);
      skipped.push(row);
    }
  }

  return { summary, eligible, blocked, skipped };
}

export async function fetchClosureIds(client, regionId = NOVGOROD_REGION_ID) {
  const { rows } = await client.query(
    `
      WITH novgorod_nodes AS (
        SELECT *
        FROM world_base.graph_nodes
        WHERE region_id = $1
      ),
      closure AS (
        SELECT 'landscape_templates'::text AS kind, primary_landscape_template_id AS template_id
        FROM novgorod_nodes
        WHERE primary_landscape_template_id IS NOT NULL
        UNION
        SELECT 'landscape_templates', jsonb_array_elements_text(secondary_landscape_template_ids)
        FROM novgorod_nodes
        UNION
        SELECT 'water_body_templates', primary_water_body_template_id
        FROM novgorod_nodes
        WHERE primary_water_body_template_id IS NOT NULL
        UNION
        SELECT 'water_body_templates', jsonb_array_elements_text(secondary_water_body_template_ids)
        FROM novgorod_nodes
        UNION
        SELECT 'land_use_templates', jsonb_array_elements_text(land_use_template_ids)
        FROM novgorod_nodes
        UNION
        SELECT 'place_templates', place_template_id
        FROM novgorod_nodes
        WHERE place_template_id IS NOT NULL
        UNION
        SELECT 'route_templates', ge.route_template_id
        FROM world_base.graph_edges ge
        JOIN novgorod_nodes gn ON gn.id = ge.from_node_id
        WHERE ge.route_template_id IS NOT NULL
        UNION
        SELECT 'landscape_templates', ge.landscape_template_id
        FROM world_base.graph_edges ge
        JOIN novgorod_nodes gn ON gn.id = ge.from_node_id
        WHERE ge.landscape_template_id IS NOT NULL
        UNION
        SELECT 'water_body_templates', ge.water_body_template_id
        FROM world_base.graph_edges ge
        JOIN novgorod_nodes gn ON gn.id = ge.from_node_id
        WHERE ge.water_body_template_id IS NOT NULL
        UNION
        SELECT 'landscape_templates', landscape_template_id
        FROM world_base.region_landscape_templates
        WHERE region_id = $1
        UNION
        SELECT 'water_body_templates', water_body_template_id
        FROM world_base.region_water_body_templates
        WHERE region_id = $1
        UNION
        SELECT 'land_use_templates', land_use_template_id
        FROM world_base.region_land_use_templates
        WHERE region_id = $1
        UNION
        SELECT 'place_templates', place_template_id
        FROM world_base.region_place_templates
        WHERE region_id = $1
        UNION
        SELECT 'item_templates', item_template_id
        FROM world_base.location_object_rules
        WHERE region_id = $1
          AND item_template_id IS NOT NULL
      )
      SELECT kind, template_id
      FROM closure
      WHERE template_id IS NOT NULL
    `,
    [regionId]
  );

  const byKind = Object.fromEntries(Object.keys(GLOBAL_CLOSURE_KINDS).map((kind) => [kind, new Set()]));
  for (const row of rows) {
    if (!byKind[row.kind]) byKind[row.kind] = new Set();
    byKind[row.kind].add(row.template_id);
  }
  return byKind;
}

async function fetchScopedRows(client, table, closureIds, regionId = NOVGOROD_REGION_ID) {
  const registry = TABLE_REGISTRY[table];
  if (!registry) return [];

  switch (registry.scope) {
    case 'region_singleton': {
      const { rows } = await client.query(
        `SELECT id, status FROM world_base.regions WHERE id = $1`,
        [regionId]
      );
      return rows;
    }
    case 'region_direct': {
      const extraColumns = table === 'graph_nodes' ? ', scale_level' : '';
      const { rows } = await client.query(
        `SELECT id, status${extraColumns} FROM world_base.${quoteIdent(table)} WHERE region_id = $1`,
        [regionId]
      );
      return rows;
    }
    case 'region_direct_llm': {
      const { rows } = await client.query(
        `
          SELECT id, status
          FROM world_base.llm_context_packs
          WHERE (region_id = $1 OR region_id IS NULL)
            AND context_type = ANY($2::text[])
        `,
        [regionId, LLM_CONTEXT_TYPES]
      );
      return rows;
    }
    case 'region_direct_via_nodes': {
      const { rows } = await client.query(
        `
          SELECT ge.id, ge.status, ge.scale_level
          FROM world_base.graph_edges ge
          JOIN world_base.graph_nodes gn ON gn.id = ge.from_node_id
          WHERE gn.region_id = $1
        `,
        [regionId]
      );
      return rows;
    }
    case 'scientific_global': {
      const { rows } = await client.query(
        `SELECT id, status FROM world_base.${quoteIdent(table)}`
      );
      return rows;
    }
    case 'global_closure': {
      const ids = [...(closureIds[registry.closureKind] ?? [])];
      if (table === 'item_templates' && ids.length === 0) {
        // ponytail: Novgorod regional import writes item_templates without FK closure edges;
        // preflight counts the global catalog, so fall back to all rows when closure is empty.
        const { rows } = await client.query(
          `SELECT id, status FROM world_base.${quoteIdent(table)}`
        );
        return rows;
      }
      if (ids.length === 0) return [];
      const { rows } = await client.query(
        `SELECT id, status FROM world_base.${quoteIdent(table)} WHERE id = ANY($1::text[])`,
        [ids]
      );
      return rows;
    }
    default:
      return [];
  }
}

export async function buildPromotePlan(client, { regionId = NOVGOROD_REGION_ID, promotedAt = new Date().toISOString() } = {}) {
  const closureIds = await fetchClosureIds(client, regionId);
  const tables = {};
  const eligible = [];
  const blocked = [];
  const skipped = [];
  const graphNodesByScale = {};
  const graphEdgesByScale = {};

  for (const table of REQUIRED_WORLD_BASE_TABLES) {
    const rows = await fetchScopedRows(client, table, closureIds, regionId);
    const { summary, eligible: tableEligible, blocked: tableBlocked, skipped: tableSkipped } = summarizeRows(rows);
    tables[table] = summary;
    eligible.push(...tableEligible.map((row) => ({ table, id: row.id, status: row.status })));
    blocked.push(...tableBlocked.map((row) => ({ table, id: row.id, status: row.status })));
    skipped.push(...tableSkipped.map((row) => ({ table, id: row.id, status: row.status })));

    if (table === 'graph_nodes') {
      for (const row of rows) {
        if (!row.scale_level) continue;
        graphNodesByScale[row.scale_level] ??= { scoped: 0, ready: 0 };
        graphNodesByScale[row.scale_level].scoped += 1;
        if (classifyRowStatus(row.status) !== 'blocked') {
          graphNodesByScale[row.scale_level].ready += 1;
        }
      }
    }
    if (table === 'graph_edges') {
      for (const row of rows) {
        if (!row.scale_level) continue;
        graphEdgesByScale[row.scale_level] ??= { scoped: 0, ready: 0 };
        graphEdgesByScale[row.scale_level].scoped += 1;
        if (classifyRowStatus(row.status) !== 'blocked') {
          graphEdgesByScale[row.scale_level].ready += 1;
        }
      }
    }
  }

  return {
    regionId,
    promotedAt,
    tables,
    eligible,
    blocked,
    skipped,
    graphNodesByScale,
    graphEdgesByScale,
    closureCounts: Object.fromEntries(
      Object.entries(closureIds).map(([kind, ids]) => [kind, ids.size])
    )
  };
}

function buildWarnings(plan) {
  const warnings = [];
  for (const table of REQUIRED_WORLD_BASE_TABLES) {
    const summary = plan.tables[table];
    if (!summary || summary.scoped === 0) {
      warnings.push(`${table}: no scoped rows`);
    } else if (summary.eligible === 0 && summary.skipped === 0) {
      warnings.push(`${table}: scoped rows exist but none are promotable`);
    }
  }
  return warnings;
}

export function projectPreflightAfterPlan(plan) {
  const preflightTables = REQUIRED_WORLD_BASE_TABLES.filter(
    (table) => table !== 'graph_nodes' && table !== 'graph_edges'
  );
  const checks = preflightTables.map((table) => {
    const summary = plan.tables[table] ?? emptyTableSummary();
    const projected = summary.skipped + summary.eligible;
    return {
      id: `world-base-${table}`,
      ok: projected > 0,
      projected,
      skipped: summary.skipped,
      eligible: summary.eligible,
      blocked: summary.blocked,
      message: projected > 0
        ? `world_base.${table} projected ready rows: ${projected}`
        : `world_base.${table} would still have no approved/usable_with_caution rows after promote.`
    };
  });

  for (const scale of REQUIRED_GRAPH_SCALES) {
    const nodes = plan.graphNodesByScale?.[scale] ?? { scoped: 0, ready: 0 };
    const edges = plan.graphEdgesByScale?.[scale] ?? { scoped: 0, ready: 0 };
    checks.push({
      id: `world-base-graph-nodes-${scale}`,
      ok: nodes.ready > 0,
      projected: nodes.ready,
      message: nodes.ready > 0
        ? `world_base.graph_nodes ${scale} projected ready rows: ${nodes.ready}`
        : `world_base.graph_nodes has no projected Novgorod ${scale} rows.`
    });
    checks.push({
      id: `world-base-graph-edges-${scale}`,
      ok: edges.ready > 0,
      projected: edges.ready,
      message: edges.ready > 0
        ? `world_base.graph_edges ${scale} projected ready rows: ${edges.ready}`
        : `world_base.graph_edges has no projected Novgorod ${scale} rows.`
    });
  }

  const errors = checks.filter((check) => !check.ok).map((check) => check.message);
  return { ok: errors.length === 0, errors, checks };
}

export async function auditNovgorodWorldBase(client, options = {}) {
  const plan = await buildPromotePlan(client, options);
  const preflight = projectPreflightAfterPlan(plan);
  const warnings = buildWarnings(plan);
  let fkAudit = null;

  if (options.fkAuditReportPath) {
    fkAudit = readFkAuditReport(options.fkAuditReportPath);
  }

  return {
    regionId: plan.regionId,
    promotedAt: plan.promotedAt,
    tables: plan.tables,
    eligible: plan.eligible,
    blocked: plan.blocked,
    skipped: plan.skipped,
    closureCounts: plan.closureCounts,
    graphNodesByScale: plan.graphNodesByScale,
    graphEdgesByScale: plan.graphEdgesByScale,
    preflight,
    warnings,
    fkAudit
  };
}

export function buildPromoteSql(plan, { promotedAt = plan.promotedAt, changedBy = CHANGED_BY } = {}) {
  const stamp = promotedAt;
  const note = `[promote-novgorod] draft→usable_with_caution @ ${stamp}`;
  const lines = ['BEGIN;'];

  for (const row of plan.eligible) {
    lines.push(
      `UPDATE world_base.${quoteIdent(row.table)} SET status = 'usable_with_caution', audit_notes = COALESCE(audit_notes, '') || E'\\n${escapeSqlString(note)}' WHERE id = ${sqlLiteral(row.id)} AND status = 'draft';`
    );
    lines.push(buildAuditLogInsert(row, { promotedAt: stamp, changedBy }));
  }

  lines.push('COMMIT;');
  return `${lines.join('\n')}\n`;
}

export function buildAuditLogInsert(row, { promotedAt, changedBy = CHANGED_BY, auditId = randomUUID() } = {}) {
  const oldValue = JSON.stringify({ status: 'draft' });
  const newValue = JSON.stringify({ status: 'usable_with_caution' });
  return `INSERT INTO world_base.audit_log (id, target_table, target_record_id, action_type, old_value, new_value, reason, changed_by, notes) VALUES (${sqlLiteral(auditId)}, ${sqlLiteral(row.table)}, ${sqlLiteral(row.id)}, 'updated', ${sqlLiteral(oldValue)}::jsonb, ${sqlLiteral(newValue)}::jsonb, ${sqlLiteral(PROMOTE_REASON)}, ${sqlLiteral(changedBy)}, ${sqlLiteral(`promoted @ ${promotedAt}`)});`;
}

export async function applyPromotePlan(client, plan, { changedBy = CHANGED_BY } = {}) {
  const promotedAt = plan.promotedAt ?? new Date().toISOString();
  const note = `[promote-novgorod] draft→usable_with_caution @ ${promotedAt}`;

  await client.query('BEGIN');
  try {
    for (const row of plan.eligible) {
      const { rowCount } = await client.query(
        `
          UPDATE world_base.${quoteIdent(row.table)}
          SET status = 'usable_with_caution',
              audit_notes = COALESCE(audit_notes, '') || E'\\n' || $2
          WHERE id = $1
            AND status = 'draft'
        `,
        [row.id, note]
      );
      if (rowCount === 0) continue;

      await client.query(
        `
          INSERT INTO world_base.audit_log (
            id, target_table, target_record_id, action_type, old_value, new_value, reason, changed_by, notes
          ) VALUES ($1, $2, $3, 'updated', $4::jsonb, $5::jsonb, $6, $7, $8)
        `,
        [
          randomUUID(),
          row.table,
          row.id,
          JSON.stringify({ status: 'draft' }),
          JSON.stringify({ status: 'usable_with_caution' }),
          PROMOTE_REASON,
          changedBy,
          `promoted @ ${promotedAt}`
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export function defaultFkAuditReportPath(repoRoot = process.cwd()) {
  return resolve(repoRoot, 'data/world-base-fk-audit-database/world_base_fk_audit_report_v1.json');
}

export function readFkAuditReport(reportPath) {
  const payload = JSON.parse(readFileSync(reportPath, 'utf8'));
  const blocking = Number(payload?.summary?.errors ?? 0) > 0 || (payload?.violations?.length ?? 0) > 0;
  return {
    path: reportPath,
    blocking,
    errors: Number(payload?.summary?.errors ?? 0),
    violations: payload?.violations?.length ?? 0
  };
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function escapeSqlString(value) {
  return String(value).replace(/'/gu, "''");
}
