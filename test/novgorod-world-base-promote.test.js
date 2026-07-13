import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKED_STATUSES,
  CHANGED_BY,
  GLOBAL_CLOSURE_KINDS,
  NOVGOROD_REGION_ID,
  PROMOTE_REASON,
  REQUIRED_WORLD_BASE_TABLES,
  TABLE_REGISTRY,
  buildPromoteSql,
  classifyRowStatus,
  getTableScopeType,
  projectPreflightAfterPlan
} from '../src/world/novgorod-world-base-promote.js';

test('classifyRowStatus gates draft eligible and blocks review states', () => {
  assert.equal(classifyRowStatus('draft'), 'eligible');
  assert.equal(classifyRowStatus('approved'), 'skipped');
  assert.equal(classifyRowStatus('usable_with_caution'), 'skipped');

  for (const status of BLOCKED_STATUSES) {
    assert.equal(classifyRowStatus(status), 'blocked');
  }
});

test('table registry covers required world_base tables with known scope types', () => {
  for (const table of REQUIRED_WORLD_BASE_TABLES) {
    assert.ok(TABLE_REGISTRY[table], `missing registry for ${table}`);
    assert.ok(getTableScopeType(table), `missing scope for ${table}`);
  }

  assert.equal(getTableScopeType('regions'), 'region_singleton');
  assert.equal(getTableScopeType('graph_edges'), 'region_direct_via_nodes');
  assert.equal(getTableScopeType('landscape_templates'), 'global_closure');
  assert.equal(getTableScopeType('graph_scale_rules'), 'scientific_global');
  assert.equal(getTableScopeType('llm_context_packs'), 'region_direct_llm');
});

test('global closure kinds include template catalogs from the plan', () => {
  assert.deepEqual(new Set(Object.keys(GLOBAL_CLOSURE_KINDS)), new Set([
    'landscape_templates',
    'water_body_templates',
    'route_templates',
    'land_use_templates',
    'place_templates',
    'item_templates'
  ]));
});

test('buildPromoteSql only targets world_base draft rows', () => {
  const plan = {
    promotedAt: '2026-07-07T12:00:00.000Z',
    eligible: [
      { table: 'regions', id: NOVGOROD_REGION_ID, status: 'draft' },
      { table: 'landscape_templates', id: 'land_forest', status: 'draft' }
    ]
  };
  const sql = buildPromoteSql(plan);

  assert.match(sql, /UPDATE world_base\."regions"/u);
  assert.match(sql, /UPDATE world_base\."landscape_templates"/u);
  assert.match(sql, /WHERE id = 'region_novgorod_land' AND status = 'draft'/u);
  assert.match(sql, /INSERT INTO world_base\.audit_log/u);
  assert.match(sql, new RegExp(PROMOTE_REASON, 'u'));
  assert.match(sql, new RegExp(CHANGED_BY.replace(/\./gu, '\\.'), 'u'));
  assert.doesNotMatch(sql, /party\./u);
  assert.doesNotMatch(sql, /status = 'approved'/u);
  assert.doesNotMatch(sql, /WHERE id = '[^']+' AND status = 'usable_with_caution'/u);
  assert.equal((sql.match(/WHERE id = '[^']+' AND status = 'draft'/gu) ?? []).length, 2);
});

test('buildPromoteSql skips blocked or already-ready rows from plan input', () => {
  const plan = {
    promotedAt: '2026-07-07T12:00:00.000Z',
    eligible: [{ table: 'regions', id: NOVGOROD_REGION_ID, status: 'draft' }]
  };
  const sql = buildPromoteSql(plan);
  assert.equal((sql.match(/UPDATE world_base/u) ?? []).length, 1);
});

test('projectPreflightAfterPlan marks tables ready when skipped plus eligible > 0', () => {
  const plan = {
    tables: {
      regions: { scoped: 1, draft: 1, eligible: 1, blocked: 0, skipped: 0, eligibleIds: [NOVGOROD_REGION_ID], blockedIds: [], skippedIds: [] },
      landscape_templates: { scoped: 2, draft: 0, eligible: 0, blocked: 1, skipped: 1, eligibleIds: [], blockedIds: ['bad'], skippedIds: ['ok'] },
      route_templates: { scoped: 0, draft: 0, eligible: 0, blocked: 0, skipped: 0, eligibleIds: [], blockedIds: [], skippedIds: [] }
    },
    graphNodesByScale: { G1: { scoped: 1, ready: 1 }, G2: { scoped: 0, ready: 0 } },
    graphEdgesByScale: { G1: { scoped: 1, ready: 1 }, G2: { scoped: 0, ready: 0 } }
  };

  const projection = projectPreflightAfterPlan(plan);
  const regions = projection.checks.find((check) => check.id === 'world-base-regions');
  const landscapes = projection.checks.find((check) => check.id === 'world-base-landscape_templates');
  const routes = projection.checks.find((check) => check.id === 'world-base-route_templates');
  const g1Nodes = projection.checks.find((check) => check.id === 'world-base-graph-nodes-G1');
  const g2Edges = projection.checks.find((check) => check.id === 'world-base-graph-edges-G2');

  assert.equal(regions.ok, true);
  assert.equal(regions.projected, 1);
  assert.equal(landscapes.ok, true);
  assert.equal(landscapes.projected, 1);
  assert.equal(routes.ok, false);
  assert.equal(g1Nodes.ok, true);
  assert.equal(g2Edges.ok, false);
  assert.equal(projection.ok, false);
});
