import { digestValue } from './digest.js';
import { MATERIALIZATION_FOREIGN_KEYS } from './materialization-readiness.js';

const ORDER = Object.freeze([
  'building_templates', 'quantity_unit_definitions', 'region_equipment_profiles', 'source_records', 'universal_categories', 'world_revisions',
  'building_layout_templates', 'category_labels', 'container_content_category_relations', 'container_templates',
  'g5_anchor_templates', 'g5_edge_templates', 'g5_minilocation_templates', 'item_profile_sets', 'item_templates', 'property_profiles',
  'region_category_options', 'room_templates', 'universal_category_relations', 'building_layout_nodes', 'container_content_profiles',
  'container_template_facet_bindings', 'container_template_inventory_profiles', 'container_template_source_bindings', 'g4_materialization_profiles',
  'item_profile_entries', 'item_template_category_bindings', 'item_template_inventory_profiles', 'item_template_quantity_profiles',
  'item_template_source_bindings', 'property_profile_rules', 'region_equipment_profile_entries', 'container_content_profile_entries',
  'g4_materialization_bindings', 'g4_materialization_layout_edges', 'materialization_slot_rules',
  'g4_container_materialization_rules', 'g4_item_materialization_rules', 'record_sources'
]);

const REVISION_SCOPED = new Set([
  'building_layout_templates', 'container_templates', 'item_profile_sets', 'item_templates', 'property_profiles', 'region_category_options',
  'container_template_inventory_profiles', 'container_template_source_bindings', 'g4_materialization_profiles',
  'item_template_inventory_profiles', 'item_template_quantity_profiles', 'item_template_source_bindings',
  'g4_container_materialization_rules', 'g4_item_materialization_rules'
]);

export function buildRevisionPromotionPlan({
  parent_revision: parentRevision,
  target_revision: targetRevision,
  source_records_by_table: sourceRecords = {},
  approved_record_ids_by_table: approvedIds = {},
  approval_attestation: approvalAttestation = null,
  external_approved_ids: externalApprovedIds = {},
  external_records_by_table: externalRecords = {},
  graph_node_status_transitions: graphNodeStatusTransitions = []
} = {}) {
  const errors = [];
  const gaps = [];
  if (!parentRevision?.id || parentRevision.status !== 'approved') errors.push(issue('PARENT_REVISION_NOT_APPROVED', 'Parent revision must exist and be approved.'));
  if (!targetRevision?.id || targetRevision.id === parentRevision?.id || !targetRevision?.title) errors.push(issue('TARGET_REVISION_INVALID', 'Target revision requires a new ID and title.'));
  if (approvalAttestation?.decision !== 'approve_subset' || !approvalAttestation.approved_by || !approvalAttestation.approved_at) errors.push(issue('PROMOTION_APPROVAL_ATTESTATION_MISSING', 'Exact approved subset requires explicit approval attestation.'));

  const records = selectApprovedRecords({ sourceRecords, approvedIds, targetRevision, errors });
  if ((records.item_templates?.length ?? 0) + (records.container_templates?.length ?? 0) === 0) gaps.push(issue('APPROVED_SUBSET_EMPTY', 'No item or container template passed approval.', { severity: 'hard_block' }));

  const transitionResult = validateGraphNodeStatusTransitions(graphNodeStatusTransitions, externalRecords.graph_nodes);
  errors.push(...transitionResult.errors);
  const transitions = transitionResult.transitions;
  const data = Object.fromEntries(ORDER.filter((table) => table !== 'world_revisions' && records[table]?.length).map((table) => [table, sort(records[table])]));
  const catalogDigest = digestValue({
    schema: 'rus.stage3c.catalog_snapshot.v1',
    parent_revision_id: parentRevision?.id ?? null,
    target_revision_id: targetRevision?.id ?? null,
    datasets: data,
    status_transitions: transitions
  });
  const revision = targetRevision?.id ? {
    id: targetRevision.id,
    parent_revision_id: parentRevision?.id,
    title: targetRevision.title,
    ...(targetRevision.effective_from ? { effective_from: targetRevision.effective_from } : {}),
    ...(targetRevision.effective_to ? { effective_to: targetRevision.effective_to } : {}),
    catalog_digest: catalogDigest,
    status: 'approved'
  } : null;

  const closureExternalIds = addApprovedIds(externalApprovedIds, {
    world_revisions: parentRevision?.status === 'approved' ? [parentRevision.id] : [],
    graph_nodes: transitions.map((transition) => transition.id)
  });
  const closureRecords = revision ? { ...records, world_revisions: [revision] } : records;
  const closure = validateApprovedDependencyClosure({ target_revision_id: targetRevision?.id, records_by_table: closureRecords, external_approved_ids: closureExternalIds });
  gaps.push(...closure.gaps);
  errors.push(...closure.errors);

  const blocked = errors.length > 0 || gaps.length > 0;
  if (!blocked && revision) records.world_revisions = [revision];
  const datasets = blocked ? [] : ORDER.filter((table) => records[table]?.length).map((table, dependencyOrder) => ({
    table,
    dependency_order: dependencyOrder,
    record_count: records[table].length,
    payload_digest: digestValue(sort(records[table]))
  }));
  const transitionManifest = blocked || transitions.length === 0 ? [] : [{ table: 'graph_nodes', record_count: transitions.length, payload_digest: digestValue(transitions) }];
  const core = {
    schema_version: 'rus.world_revision_promotion.v1',
    promotion_id: revision ? `promotion_${revision.id}` : null,
    parent_revision_id: parentRevision?.id ?? null,
    world_revision_id: revision?.id ?? null,
    catalog_digest: catalogDigest,
    approval: blocked ? 'blocked' : 'approved',
    activation: 'not_requested',
    deletion_mode: 'none',
    datasets,
    status_transitions: transitionManifest
  };
  const manifest = { ...core, manifest_digest: digestValue(core) };
  const effectiveTransitions = blocked ? [] : transitions;
  return freeze({
    status: blocked ? 'blocked' : 'ready',
    revision_candidate: revision ? { ...revision, import_status: blocked ? 'blocked_not_created' : 'ready_to_insert' } : null,
    typed_data_gaps: uniqueIssues(gaps),
    errors: uniqueIssues(errors),
    manifest,
    records_by_table: records,
    status_transitions: effectiveTransitions,
    dependency_closure: closure,
    rollback_plan: buildRevisionRollbackPlan({ parent_revision: parentRevision, target_revision: revision, datasets, status_transitions: effectiveTransitions }),
    activation: { requested: false, performed: false, runtime_loader_changed: false, existing_parties_changed: false }
  });
}

export function validateApprovedDependencyClosure({ target_revision_id: targetRevisionId, records_by_table: records = {}, external_approved_ids: externalApprovedIds = {} } = {}) {
  const gaps = [];
  const errors = [];
  const maps = Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, new Map((rows ?? []).map((record) => [record.id, record]))]));
  const approved = (table, id) => {
    const local = maps[table]?.get(id);
    if (local) return local.status == null || local.status === 'approved';
    return externalHas(externalApprovedIds[table], id);
  };
  const need = (table, id, owner, code) => {
    if (!id || !approved(table, id)) gaps.push(issue(code, `${owner} requires approved ${table}:${id ?? '<missing>'}.`, { owner, table, id, severity: 'hard_block' }));
  };

  for (const [table, rows] of Object.entries(records)) for (const row of rows ?? []) {
    if (row.status != null && row.status !== 'approved') errors.push(issue('NON_APPROVED_RECORD_IN_PROMOTION', `${table}:${row.id} is not approved.`, { table, id: row.id }));
    if (REVISION_SCOPED.has(table) && row.world_revision_id !== targetRevisionId) errors.push(issue('REVISION_PIN_MISMATCH', `${table}:${row.id} is not pinned to target revision.`, { table, id: row.id }));
  }
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) for (const row of records[sourceTable] ?? []) {
    if (row[sourceColumn] != null) need(targetTable, row[sourceColumn], `${sourceTable}:${row.id}`, 'PROMOTION_FOREIGN_KEY_NOT_APPROVED');
  }

  const options = records.region_category_options ?? [];
  const allowed = (category, region) => options.some((record) => record.status === 'approved' && record.category_id === category && record.region_id === region && record.world_revision_id === targetRevisionId);
  const itemBindings = records.item_template_category_bindings ?? [];
  const itemSources = records.item_template_source_bindings ?? [];
  const itemEntries = records.item_profile_entries ?? [];
  const itemRules = records.g4_item_materialization_rules ?? [];
  for (const template of records.item_templates ?? []) {
    need('universal_categories', template.category_id, `item_templates:${template.id}`, 'ITEM_CATEGORY_NOT_APPROVED');
    need('source_records', template.source_id, `item_templates:${template.id}`, 'ITEM_SOURCE_NOT_APPROVED');
    if (!allowed(template.category_id, template.region_id)) gaps.push(issue('ITEM_REGIONAL_PERMISSION_MISSING', `${template.id} lacks approved region permission.`, { severity: 'hard_block' }));
    for (const kind of ['object_type', 'primary_function', 'material', 'size_band']) if (!itemBindings.some((record) => record.item_template_id === template.id && record.status === 'approved' && record.binding_kind === kind)) gaps.push(issue('ITEM_CLASSIFICATION_CLOSURE_MISSING', `${template.id} lacks ${kind}.`, { severity: 'hard_block' }));
    for (const scope of ['historical_presence', 'material', 'construction', 'physical_parameter']) if (!itemSources.some((record) => record.item_template_id === template.id && record.status === 'approved' && record.review_status === 'reviewed' && record.claim_scope === scope)) gaps.push(issue('ITEM_EVIDENCE_CLAIM_MISSING', `${template.id} lacks reviewed ${scope}.`, { severity: 'hard_block' }));
    if (!(records.item_template_inventory_profiles ?? []).some((record) => record.item_template_id === template.id && record.status === 'approved')) gaps.push(issue('ITEM_INVENTORY_PROFILE_MISSING', `${template.id} lacks inventory profile.`, { severity: 'hard_block' }));
    const quantity = (records.item_template_quantity_profiles ?? []).find((record) => record.item_template_id === template.id && record.status === 'approved');
    if (!quantity) gaps.push(issue('ITEM_QUANTITY_PROFILE_MISSING', `${template.id} lacks quantity profile.`, { severity: 'hard_block' }));
    else if (quantity.default_quantity_policy?.mode !== 'explicit_only') gaps.push(issue('HIDDEN_DEFAULT_QUANTITY_FORBIDDEN', `${quantity.id} must be explicit_only.`, { severity: 'hard_block' }));
    const profiles = new Set(itemEntries.filter((record) => record.item_template_id === template.id).map((record) => record.profile_id));
    if (![...profiles].some((id) => approved('item_profile_sets', id))) gaps.push(issue('ITEM_PROFILE_MEMBERSHIP_MISSING', `${template.id} lacks approved item profile membership.`, { severity: 'hard_block' }));
    if (!itemRules.some((record) => record.status === 'approved' && profiles.has(record.item_profile_id))) gaps.push(issue('ITEM_MATERIALIZATION_RULE_MISSING', `${template.id} lacks approved G4 rule.`, { severity: 'hard_block' }));
  }

  const facets = records.container_template_facet_bindings ?? [];
  const containerSources = records.container_template_source_bindings ?? [];
  const containerRules = records.g4_container_materialization_rules ?? [];
  for (const template of records.container_templates ?? []) {
    need('universal_categories', template.category_id, `container_templates:${template.id}`, 'CONTAINER_CATEGORY_NOT_APPROVED');
    need('source_records', template.source_id, `container_templates:${template.id}`, 'CONTAINER_SOURCE_NOT_APPROVED');
    if (!allowed(template.category_id, template.region_id)) gaps.push(issue('CONTAINER_REGIONAL_PERMISSION_MISSING', `${template.id} lacks approved region permission.`, { severity: 'hard_block' }));
    for (const facet of ['container_form', 'capacity_band', 'closure_type', 'access_model', 'portability', 'content_compatibility', 'condition', 'material']) if (!facets.some((record) => record.container_template_id === template.id && record.status === 'approved' && record.facet === facet)) gaps.push(issue('CONTAINER_FACET_CLOSURE_MISSING', `${template.id} lacks ${facet}.`, { severity: 'hard_block' }));
    for (const scope of ['historical_presence', 'material', 'construction', 'physical_parameter']) if (!containerSources.some((record) => record.container_template_id === template.id && record.status === 'approved' && record.review_status === 'reviewed' && record.claim_scope === scope)) gaps.push(issue('CONTAINER_EVIDENCE_CLAIM_MISSING', `${template.id} lacks reviewed ${scope}.`, { severity: 'hard_block' }));
    if (!(records.container_template_inventory_profiles ?? []).some((record) => record.container_template_id === template.id && record.status === 'approved')) gaps.push(issue('CONTAINER_INVENTORY_PROFILE_MISSING', `${template.id} lacks inventory profile.`, { severity: 'hard_block' }));
    if (!(records.container_content_profiles ?? []).some((record) => record.container_template_id === template.id && record.status === 'approved')) gaps.push(issue('CONTAINER_CONTENT_PROFILE_MISSING', `${template.id} lacks content profile.`, { severity: 'hard_block' }));
    if (!containerRules.some((record) => record.container_template_id === template.id && record.status === 'approved')) gaps.push(issue('CONTAINER_MATERIALIZATION_RULE_MISSING', `${template.id} lacks approved G4 rule.`, { severity: 'hard_block' }));
  }

  validateSpatialClosure({ records, gaps, errors, approved });
  for (const link of records.record_sources ?? []) {
    need('source_records', link.source_id, `record_sources:${link.id}`, 'RECORD_SOURCE_NOT_APPROVED');
    need(link.target_table, link.target_record_id, `record_sources:${link.id}`, 'RECORD_SOURCE_TARGET_NOT_APPROVED');
  }
  return freeze({ pass: errors.length === 0 && gaps.length === 0, gaps: uniqueIssues(gaps), errors: uniqueIssues(errors) });
}

export async function applyRevisionPromotionPlan({ plan, adapter } = {}) {
  if (plan?.status !== 'ready') return freeze({ applied: false, errors: [issue('PROMOTION_PLAN_BLOCKED', 'Only a ready plan can be applied.')], audit: null });
  for (const name of ['begin', 'insert', 'readback', 'readRevision', 'commit', 'rollback']) if (typeof adapter?.[name] !== 'function') throw new TypeError(`PROMOTION_ADAPTER_MISSING:${name}`);
  const transitions = plan.status_transitions ?? [];
  if (transitions.length) for (const name of ['transition', 'readTransition']) if (typeof adapter?.[name] !== 'function') throw new TypeError(`PROMOTION_ADAPTER_MISSING:${name}`);
  await adapter.begin();
  const tables = [];
  const transitionAudit = [];
  try {
    const parentBefore = await adapter.readRevision(plan.manifest.parent_revision_id);
    if (parentBefore?.status !== 'approved') throw new Error('PROMOTION_PARENT_REVISION_NOT_FOUND');
    if (await adapter.readRevision(plan.manifest.world_revision_id)) throw new Error('PROMOTION_TARGET_REVISION_ALREADY_EXISTS');
    for (const transition of transitions) {
      await adapter.transition('graph_nodes', transition);
      const actual = await adapter.readTransition('graph_nodes', transition.id);
      const pass = actual?.status === transition.to_status;
      transitionAudit.push({ ...transition, actual_status: actual?.status ?? null, pass });
      if (!pass) throw new Error(`PROMOTION_STATUS_TRANSITION_READBACK_MISMATCH:graph_nodes:${transition.id}`);
    }
    for (const dataset of plan.manifest.datasets) {
      const rows = sort(plan.records_by_table[dataset.table]);
      await adapter.insert(dataset.table, orderSelfReferentialRows(dataset.table, rows));
      const actual = await adapter.readback(dataset.table, rows);
      const pass = actual?.record_count === dataset.record_count && actual?.payload_digest === dataset.payload_digest;
      tables.push({ ...dataset, actual_count: actual?.record_count, actual_digest: actual?.payload_digest, pass });
      if (!pass) throw new Error(`PROMOTION_READBACK_MISMATCH:${dataset.table}`);
    }
    const parentAfter = await adapter.readRevision(plan.manifest.parent_revision_id);
    if (digestValue(parentAfter) !== digestValue(parentBefore)) throw new Error('PROMOTION_PARENT_REVISION_CHANGED');
    const target = await adapter.readRevision(plan.manifest.world_revision_id);
    if (target?.status !== 'approved' || target.catalog_digest !== plan.manifest.catalog_digest) throw new Error('PROMOTION_TARGET_REVISION_READBACK_MISMATCH');
    await adapter.commit();
    return freeze({ applied: true, errors: [], audit: { pass: true, parent_revision_unchanged: true, world_revision_id: target.id, catalog_digest: target.catalog_digest, tables, status_transitions: transitionAudit }, activation: { performed: false, runtime_loader_changed: false, existing_parties_changed: false } });
  } catch (error) {
    await adapter.rollback();
    error.readback_audit = { tables, status_transitions: transitionAudit };
    throw error;
  }
}

export function buildRevisionRollbackPlan({ parent_revision: parentRevision, target_revision: targetRevision, datasets = [], status_transitions: transitions = [] } = {}) {
  return freeze({
    schema: 'rus.world_revision_rollback_plan.v1',
    parent_revision_id: parentRevision?.id ?? null,
    target_revision_id: targetRevision?.id ?? null,
    preconditions: ['target revision is not active', 'no party is pinned to target revision', 'delete only rows identified by manifest'],
    actions: [
      ...[...datasets].sort((left, right) => right.dependency_order - left.dependency_order).map((dataset) => ({ action: 'delete_inserted_rows_only', table: dataset.table, payload_digest: dataset.payload_digest })),
      ...[...transitions].reverse().map((transition) => ({ action: 'restore_status_if_exact', table: 'graph_nodes', id: transition.id, from_status: transition.to_status, to_status: transition.from_status }))
    ],
    forbidden_actions: ['update parent revision', 'delete parent revision', 'rematerialize existing party', 'implicit delete outside manifest']
  });
}

function selectApprovedRecords({ sourceRecords, approvedIds, targetRevision, errors }) {
  const records = {};
  for (const [table, ids] of Object.entries(approvedIds ?? {})) {
    if (!ORDER.includes(table) || table === 'world_revisions') { errors.push(issue('PROMOTION_TABLE_NOT_REGISTERED', `Unsupported table ${table}.`, { table })); continue; }
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) { errors.push(issue('APPROVAL_ID_LIST_INVALID', `Approval list for ${table} must contain unique IDs.`, { table })); continue; }
    const byId = new Map((sourceRecords[table] ?? []).map((row) => [row?.id, row]));
    records[table] = ids.slice().sort().flatMap((id) => {
      const row = byId.get(id);
      if (!row) { errors.push(issue('APPROVED_RECORD_NOT_FOUND', `${table}:${id} is absent.`, { table, id })); return []; }
      const copy = structuredClone(row);
      if ('status' in copy) copy.status = 'approved';
      if (REVISION_SCOPED.has(table)) copy.world_revision_id = targetRevision.id;
      return [copy];
    });
  }
  return records;
}

function validateGraphNodeStatusTransitions(values, graphNodes = []) {
  const errors = [];
  const records = new Map((graphNodes ?? []).map((record) => [record.id, record]));
  const seen = new Set();
  const transitions = [];
  for (const value of values ?? []) {
    const id = value?.id ?? value?.graph_node_id;
    const current = records.get(id);
    if (!id || seen.has(id)) { errors.push(issue('G4_STATUS_TRANSITION_ID_INVALID', `G4 status transition ID is missing or duplicated: ${id ?? '<missing>'}.`)); continue; }
    seen.add(id);
    if (!current || current.scale_level !== 'G4') errors.push(issue('G4_STATUS_TRANSITION_TARGET_INVALID', `G4 status transition target is absent or not G4: ${id}.`, { id }));
    if (current?.status !== value.from_status) errors.push(issue('G4_STATUS_TRANSITION_SOURCE_MISMATCH', `G4 ${id} status does not match ${value.from_status}.`, { id, actual_status: current?.status ?? null }));
    if (value.to_status !== 'approved') errors.push(issue('G4_STATUS_TRANSITION_TARGET_NOT_APPROVED', `G4 ${id} must transition exactly to approved.`, { id }));
    for (const field of ['approval_basis', 'causal_basis_type', 'causal_basis_id']) if (typeof value[field] !== 'string' || value[field].trim() === '') errors.push(issue('G4_STATUS_TRANSITION_BASIS_MISSING', `G4 ${id} lacks ${field}.`, { id, field }));
    transitions.push({ id, from_status: value.from_status, to_status: value.to_status, approval_basis: value.approval_basis, causal_basis_type: value.causal_basis_type, causal_basis_id: value.causal_basis_id });
  }
  return { errors, transitions: transitions.sort((left, right) => left.id.localeCompare(right.id)) };
}

function validateSpatialClosure({ records, gaps, errors }) {
  const slots = new Map((records.materialization_slot_rules ?? []).map((record) => [record.id, record]));
  const profiles = new Map((records.g4_materialization_profiles ?? []).map((record) => [record.id, record]));
  for (const binding of records.g4_materialization_bindings ?? []) {
    const selectorCount = ['graph_node_id', 'node_type', 'place_template_id', 'building_template_id'].filter((field) => binding[field] != null).length;
    if (selectorCount !== 1) errors.push(issue('G4_BINDING_SELECTOR_INVALID', `${binding.id} must declare exactly one selector.`, { id: binding.id }));
  }
  for (const rule of [...(records.g4_item_materialization_rules ?? []), ...(records.g4_container_materialization_rules ?? [])]) {
    const slot = slots.get(rule.slot_rule_id);
    const profile = slot ? profiles.get(slot.profile_id) : null;
    const expectedDomain = rule.item_profile_id ? 'item' : 'container';
    if (!slot || slot.status !== 'approved' || slot.slot_domain !== expectedDomain) gaps.push(issue('G4_RULE_SLOT_NOT_APPROVED', `${rule.id} lacks an approved ${expectedDomain} slot.`, { severity: 'hard_block' }));
    if (!profile || profile.status !== 'approved') gaps.push(issue('G4_RULE_PROFILE_NOT_APPROVED', `${rule.id} lacks an approved materialization profile.`, { severity: 'hard_block' }));
    if (typeof rule.causal_basis_type !== 'string' || !rule.causal_basis_type || typeof rule.causal_basis_id !== 'string' || !rule.causal_basis_id) gaps.push(issue('G4_RULE_CAUSAL_BASIS_MISSING', `${rule.id} lacks a causal basis.`, { severity: 'hard_block' }));
    if (!Number.isInteger(rule.min_count) || !Number.isInteger(rule.max_count) || rule.min_count < 0 || rule.max_count < rule.min_count) errors.push(issue('G4_RULE_COUNT_RANGE_INVALID', `${rule.id} has an invalid count range.`));
  }
}

function addApprovedIds(source, additions) {
  const result = {};
  for (const [table, values] of Object.entries(source ?? {})) result[table] = new Set(values instanceof Set ? values : values ?? []);
  for (const [table, values] of Object.entries(additions)) {
    const set = result[table] ?? new Set();
    for (const value of values) if (value) set.add(value);
    result[table] = set;
  }
  return result;
}

function orderSelfReferentialRows(table, rows) {
  const parentColumns = MATERIALIZATION_FOREIGN_KEYS.filter(([sourceTable, , targetTable]) => sourceTable === table && targetTable === table).map(([, sourceColumn]) => sourceColumn);
  if (parentColumns.length === 0) return rows;
  const remaining = new Map(rows.map((record) => [record.id, record]));
  const emitted = new Set();
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((record) => parentColumns.every((column) => record[column] == null || !remaining.has(record[column]) || emitted.has(record[column]))).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    if (ready.length === 0) throw new Error(`PROMOTION_SELF_REFERENCE_CYCLE:${table}`);
    for (const record of ready) { remaining.delete(record.id); emitted.add(record.id); ordered.push(record); }
  }
  return ordered;
}

function externalHas(values, id) { return values instanceof Set ? values.has(id) : Array.isArray(values) && values.includes(id); }
function sort(rows) { return [...rows].map((row) => structuredClone(row)).sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? ''))); }
function issue(code, message, extra = {}) { return Object.freeze({ code, message, ...extra }); }
function uniqueIssues(values) { return [...new Map(values.map((value) => [JSON.stringify(value), value])).values()]; }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
