import { digestValue } from './digest.js';

const ITEM_SCOPES = ['historical_presence','material','construction','physical_parameter'];
const ITEM_BINDINGS = ['object_type','primary_function','material','size_band'];
const CONTAINER_FACETS = ['container_form','capacity_band','closure_type','access_model','portability','content_compatibility','condition','material'];
const APPROVAL_TABLES = ['source_records','universal_categories','region_category_options','item_templates','container_templates','item_template_category_bindings','container_template_facet_bindings','item_template_inventory_profiles','container_template_inventory_profiles','item_template_source_bindings','container_template_source_bindings','quantity_unit_definitions','item_template_quantity_profiles','container_content_profiles','container_content_profile_entries','container_content_category_relations','item_profile_sets','item_profile_entries','property_profiles','property_profile_rules','region_equipment_profiles','region_equipment_profile_entries','g4_item_materialization_rules','g4_container_materialization_rules'];

export function buildCatalogEditorialReadinessReport({ template_catalog = [], records_by_table = {}, legacy_inventory_snapshot = null, target_revision_id = null } = {}) {
  const catalog = normalizeCatalog(template_catalog);
  const structural = [];
  const itemCount = catalog.filter((row) => row.kind === 'item').length;
  const containerCount = catalog.filter((row) => row.kind === 'container').length;
  if (catalog.length !== 120) structural.push(problem('TEMPLATE_COHORT_SIZE_INVALID', `Expected 120 templates, received ${catalog.length}.`));
  if (itemCount !== 102 || containerCount !== 18) structural.push(problem('TEMPLATE_COHORT_KIND_COUNTS_INVALID', `Expected 102 items and 18 containers, received ${itemCount} and ${containerCount}.`));
  if (!target_revision_id) structural.push(problem('TARGET_REVISION_ID_MISSING', 'Readiness requires a target revision ID.'));
  const templates = catalog.map((template) => assessTemplate(template, records_by_table, legacy_inventory_snapshot, target_revision_id));
  const ids = (predicate) => templates.filter(predicate).map((row) => row.template_id);
  const summary = { template_count: templates.length, item_template_count: itemCount, container_template_count: containerCount, fully_ready_count: ids((row) => row.fully_ready).length, blocked_by_sources_count: ids((row) => row.blockers.sources.length).length, blocked_by_parameters_count: ids((row) => row.blockers.parameters.length).length, blocked_by_profiles_rules_count: ids((row) => row.blockers.profiles_rules.length).length, blocked_by_legacy_migration_count: ids((row) => row.blockers.legacy_migration.length).length, ready_for_editorial_approval_count: ids((row) => row.ready_for_editorial_approval).length };
  const core = { schema_version: 'rus.stage3c.promotion_readiness.v1', target_revision_id, legacy_source_verified: legacy_inventory_snapshot?.complete === true && legacy_inventory_snapshot?.source?.verified === true, structural_issues: structural, summary, template_ids: { fully_ready: ids((row) => row.fully_ready), blocked_by_sources: ids((row) => row.blockers.sources.length), blocked_by_parameters: ids((row) => row.blockers.parameters.length), blocked_by_profiles_rules: ids((row) => row.blockers.profiles_rules.length), blocked_by_legacy_migration: ids((row) => row.blockers.legacy_migration.length), ready_for_editorial_approval: ids((row) => row.ready_for_editorial_approval) }, templates, approval_cohort_ready: structural.length === 0 && templates.length === 120 && templates.every((row) => row.ready_for_editorial_approval) };
  return freeze({ ...core, report_digest: digestValue(core) });
}

export function buildEditorialEvidenceReviewPlan({ readiness_report, records_by_table = {}, review_attestation = null } = {}) {
  const errors = validateReport(readiness_report);
  if (review_attestation?.decision !== 'review_evidence' || !review_attestation.reviewed_by || !review_attestation.reviewed_at) errors.push(problem('EDITORIAL_REVIEW_ATTESTATION_MISSING', 'Evidence review requires an explicit human attestation.'));
  if (readiness_report?.approval_cohort_ready !== true) errors.push(problem('EDITORIAL_REVIEW_COHORT_BLOCKED', 'All 120 templates must be ready before evidence bindings can move to reviewed.'));
  const transitions = [];
  if (!errors.length) {
    const cohort = new Set(readiness_report.templates.map((row) => row.template_id));
    for (const table of ['item_template_source_bindings','container_template_source_bindings']) for (const row of records_by_table[table] ?? []) {
      const templateId = row.item_template_id ?? row.container_template_id;
      if (cohort.has(templateId) && row.review_status === 'needs_review' && row.status === 'draft') transitions.push({ table, id: row.id, from: { review_status: 'needs_review', status: 'draft' }, to: { review_status: 'reviewed', status: 'draft' } });
    }
  }
  return freeze({ schema_version: 'rus.stage3c.editorial_review_plan.v1', status: errors.length ? 'blocked' : 'ready', errors, transitions, source_records_unchanged: true, template_statuses_unchanged: true });
}

export function buildCoherentEditorialApprovalPlan({ readiness_report, records_by_table = {}, approval_attestation = null } = {}) {
  const errors = validateReport(readiness_report);
  if (approval_attestation?.decision !== 'approve_all_120' || !approval_attestation.approved_by || !approval_attestation.approved_at) errors.push(problem('EDITORIAL_APPROVAL_ATTESTATION_MISSING', 'Approval requires an explicit human attestation for all 120 templates.'));
  if (readiness_report?.approval_cohort_ready !== true || readiness_report?.summary?.ready_for_editorial_approval_count !== 120) errors.push(problem('EDITORIAL_APPROVAL_COHORT_INCOMPLETE', 'Partial approval is forbidden; all 120 templates and dependencies must be ready.'));
  const transitions = [];
  if (!errors.length) for (const table of APPROVAL_TABLES) for (const row of records_by_table[table] ?? []) if (row.status === 'draft') transitions.push({ table, id: row.id, from_status: 'draft', to_status: 'approved' });
  return freeze({ schema_version: 'rus.stage3c.editorial_approval_plan.v1', status: errors.length ? 'blocked' : 'ready', errors, transitions, atomic: true, partial_approval_forbidden: true, activation_requested: false });
}

function assessTemplate(template, records, legacy, targetRevisionId) {
  const sources = [], parameters = [], profiles = [], migration = [];
  const item = template.kind === 'item';
  const table = item ? 'item_templates' : 'container_templates';
  const row = (records[table] ?? []).find((value) => value.id === template.id);
  if (!row) profiles.push('TEMPLATE_RECORD_MISSING');
  const sourceRows = (records[item ? 'item_template_source_bindings' : 'container_template_source_bindings'] ?? []).filter((binding) => (binding.item_template_id ?? binding.container_template_id) === template.id);
  for (const scope of ITEM_SCOPES) if (!sourceRows.some((binding) => binding.claim_scope === scope && binding.review_status === 'reviewed')) sources.push(`SOURCE_SCOPE_NOT_REVIEWED:${scope}`);
  if (item) {
    const bindings = (records.item_template_category_bindings ?? []).filter((binding) => binding.item_template_id === template.id);
    for (const kind of ITEM_BINDINGS) if (!bindings.some((binding) => binding.binding_kind === kind)) parameters.push(`ITEM_BINDING_MISSING:${kind}`);
    if (!(records.item_template_inventory_profiles ?? []).some((profile) => profile.item_template_id === template.id)) parameters.push('ITEM_INVENTORY_PROFILE_MISSING');
    if (!(records.item_template_quantity_profiles ?? []).some((profile) => profile.item_template_id === template.id && profile.default_quantity_policy?.mode === 'explicit_only' && profile.maximum_quantity != null)) parameters.push('ITEM_QUANTITY_PROFILE_NOT_REVIEWED');
    const profileIds = new Set((records.item_profile_entries ?? []).filter((entry) => entry.item_template_id === template.id).map((entry) => entry.profile_id));
    if (![...profileIds].some((id) => (records.item_profile_sets ?? []).some((profile) => profile.id === id))) profiles.push('ITEM_PROFILE_MEMBERSHIP_MISSING');
    if (!(records.g4_item_materialization_rules ?? []).some((rule) => profileIds.has(rule.item_profile_id))) profiles.push('ITEM_MATERIALIZATION_RULE_MISSING');
  } else {
    const facets = (records.container_template_facet_bindings ?? []).filter((binding) => binding.container_template_id === template.id);
    for (const facet of CONTAINER_FACETS) if (!facets.some((binding) => binding.facet === facet)) parameters.push(`CONTAINER_FACET_MISSING:${facet}`);
    if (!(records.container_template_inventory_profiles ?? []).some((profile) => profile.container_template_id === template.id)) parameters.push('CONTAINER_INVENTORY_PROFILE_MISSING');
    if (!(records.container_content_profiles ?? []).some((profile) => profile.container_template_id === template.id)) parameters.push('CONTAINER_CONTENT_PROFILE_MISSING');
    if (!(records.g4_container_materialization_rules ?? []).some((rule) => rule.container_template_id === template.id)) profiles.push('CONTAINER_MATERIALIZATION_RULE_MISSING');
  }
  if (row?.category_id && !(records.region_category_options ?? []).some((option) => option.category_id === row.category_id && option.region_id === row.region_id && option.world_revision_id != null && ['draft','approved'].includes(option.status))) profiles.push('REGIONAL_PERMISSION_MISSING');
  if (!legacy || legacy.complete !== true || legacy.source?.verified !== true) migration.push('LEGACY_SOURCE_NOT_VERIFIED');
  else for (const entry of (legacy.rows ?? []).filter((entry) => entry.legacy_table_name === table && entry.legacy_record_id === template.id)) if (!['mapped','deferred'].includes(entry.resolution_status)) migration.push(`LEGACY_${entry.resolution_status.toUpperCase()}:${entry.legacy_field_name}`);
  const blockers = { sources: unique(sources), parameters: unique(parameters), profiles_rules: unique(profiles), legacy_migration: unique(migration) };
  const ready = Object.values(blockers).every((values) => values.length === 0);
  return freeze({ template_id: template.id, kind: template.kind, blockers, fully_ready: ready, ready_for_editorial_approval: ready });
}

function validateReport(report) { const errors = []; if (report?.schema_version !== 'rus.stage3c.promotion_readiness.v1') errors.push(problem('READINESS_REPORT_INVALID', 'A Stage 3C readiness report is required.')); else if (report.report_digest !== digestValue((({ report_digest, ...core }) => core)(report))) errors.push(problem('READINESS_REPORT_DIGEST_MISMATCH', 'Readiness report digest does not match its content.')); return errors; }
function normalizeCatalog(values) { const rows = values.map((row) => ({ id: String(row?.id ?? ''), kind: row?.kind })).filter((row) => row.id && ['item','container'].includes(row.kind)).sort((a,b) => a.id.localeCompare(b.id)); if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('TEMPLATE_COHORT_DUPLICATE_ID'); return rows; }
function unique(values) { return [...new Set(values)].sort(); }
function problem(code, message) { return Object.freeze({ code, message, severity: 'hard_block' }); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
