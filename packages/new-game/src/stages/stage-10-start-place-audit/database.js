import { block, check, collectSourceIds, isMissingRelation, unique } from './shared.js';

export async function checkRequiredRelations(db) {
  const evidence = [];
  const concerns = [];
  const required = ['world_base.graph_nodes', 'world_base.place_templates', 'world_base.region_place_templates', 'world_base.source_records'];
  for (const relation of required) {
    const ok = await relationExists(db, relation);
    evidence.push({ kind: 'required_relation', relation, exists: ok });
    if (!ok) concerns.push(block('START_PLACE_REQUIRED_TABLE_MISSING', `Required world_base table is missing: ${relation}.`));
  }
  let edgeTable = null;
  if (await relationExists(db, 'world_base.graph_edges')) edgeTable = 'world_base.graph_edges';
  else if (await relationExists(db, 'world_base.access_edges')) edgeTable = 'world_base.access_edges';
  evidence.push({ kind: 'required_relation_alternative', relation: 'world_base.graph_edges OR world_base.access_edges', exists: !!edgeTable, selected_relation: edgeTable });
  if (!edgeTable) concerns.push(block('START_PLACE_REQUIRED_TABLE_MISSING', 'Required world_base edge table is missing: world_base.graph_edges OR world_base.access_edges.'));
  return { pass: concerns.length === 0, concerns, evidence, edge_table: edgeTable };
}

export async function relationExists(db, relation) {
  try {
    await db.query(`SELECT 1 FROM ${relation} LIMIT 1`, []);
    return true;
  } catch (error) {
    if (isMissingRelation(error)) return false;
    return true;
  }
}

export async function queryGraphNodes(db, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.graph_nodes
    WHERE id = ANY($1::text[]) OR node_id = ANY($1::text[])
  `, [ids]);
  return rows ?? [];
}

export async function queryPlaceTemplate(db, id) {
  if (!id) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.place_templates
    WHERE id = $1 OR place_template_id = $1
    LIMIT 1
  `, [id]);
  return rows ?? [];
}

export async function queryRegionPlaceTemplate(db, regionId, templateId) {
  if (!regionId || !templateId) return [];
  const { rows } = await db.query(`
    SELECT *
    FROM world_base.region_place_templates
    WHERE region_id = $1
      AND (place_template_id = $2 OR template_id = $2)
    LIMIT 1
  `, [regionId, templateId]);
  return rows ?? [];
}

export async function queryAccessEdges(db, nodeId, edgeTable) {
  if (!nodeId || !edgeTable) return [];
  const sql = edgeTable.endsWith('access_edges')
    ? `SELECT * FROM world_base.access_edges WHERE node_id = $1 OR source_node_id = $1 OR target_node_id = $1 OR from_node_id = $1 OR to_node_id = $1 LIMIT 20`
    : `SELECT * FROM world_base.graph_edges WHERE source_node_id = $1 OR target_node_id = $1 OR from_node_id = $1 OR to_node_id = $1 LIMIT 20`;
  const { rows } = await db.query(sql, [nodeId]);
  return rows ?? [];
}

export async function validateSources(db, rows, policy) {
  const sourceIds = unique(rows.flatMap((row) => collectSourceIds(row)));
  if (policy.require_sources !== true) return check('pass', [], [{ kind: 'source_trace_not_required' }]);
  if (sourceIds.length === 0) return check('fail', [block('START_PLACE_SOURCE_TRACE_MISSING', 'No source IDs were found for selected start place audit inputs.')], []);
  let sourceRows = [];
  try {
    const result = await db.query(`
      SELECT source_id, status, confidence
      FROM world_base.source_records
      WHERE source_id = ANY($1::text[])
    `, [sourceIds]);
    sourceRows = result.rows ?? [];
  } catch (error) {
    const result = await db.query(`
      SELECT id AS source_id, status, confidence
      FROM world_base.source_records
      WHERE id = ANY($1::text[])
    `, [sourceIds]);
    sourceRows = result.rows ?? [];
  }
  const byId = new Map(sourceRows.map((row) => [String(row.source_id ?? row.id), row]));
  const concerns = [];
  for (const id of sourceIds) {
    const row = byId.get(String(id));
    if (!row) concerns.push(block('START_PLACE_SOURCE_ID_NOT_FOUND', `Source ID was not found in world_base.source_records: ${id}.`));
    const status = String(row?.status ?? '').toLowerCase();
    if (policy.reject_rejected_or_conflict_records === true && ['rejected', 'conflict'].includes(status)) {
      concerns.push(block(status === 'conflict' ? 'START_PLACE_SOURCE_RECORD_CONFLICT' : 'START_PLACE_SOURCE_RECORD_REJECTED', `Source record ${id} has forbidden status ${status}.`));
    }
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'source_records_checked', source_ids: sourceIds }]);
}
