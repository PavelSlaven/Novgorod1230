import { frameFromHistoricalFrame, makeAudit, sourceTrace } from './common.js';

export async function retrieveItemProfileCandidates(input = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const items = input.regional_context_package?.item_context?.item_templates ?? [];
  const templateLinks = input.candidate_place_template_set?.candidate_template_links ?? [];
  const max = Number(input.item_profile_policy?.target_profiles_max ?? 160);

  const itemCandidates = items.slice(0, max).map((item) => ({
    item_profile_candidate_id: `item_profile:${item.id}`,
    item_template_id: item.id,
    item_type: item.item_type,
    title: item.title,
    allowed_place_template_ids: allowedPlaceTemplateIds(templateLinks, item.typical_locations),
    typical_owner_roles: item.typical_owner_roles ?? [],
    typical_holder_roles: item.typical_holder_roles ?? [],
    typical_containers: item.typical_containers ?? [],
    visibility_default: item.visibility_default ?? null,
    access_default: item.access_default ?? null,
    source_ref: { table: 'world_base.item_templates', id: item.id }
  }));

  const containerCandidates = buildContainerCandidates(itemCandidates);
  const propertyRuleCandidates = buildPropertyRuleCandidates(itemCandidates);
  const concerns = itemCandidates.length === 0 ? [{
    code: 'ITEM_PROFILE_CANDIDATE_SET_EMPTY',
    message: 'No item profile candidates found in regional item context.'
  }] : [];

  return {
    version: 1,
    schema: 'item_profile_candidate_set',
    request_id: requestId,
    selection_status: itemCandidates.length > 0 ? 'ready' : 'empty',
    frame,
    summary: {
      item_profile_count: itemCandidates.length,
      container_profile_count: containerCandidates.length,
      property_rule_count: propertyRuleCandidates.length,
      trade_rule_count: 0,
      rejected_profile_count: 0
    },
    item_profile_candidates: itemCandidates,
    container_profile_candidates: containerCandidates,
    property_rule_candidates: propertyRuleCandidates,
    trade_and_price_references: [],
    rejected_item_profile_candidates: [],
    item_profile_groups: groupBy(itemCandidates, 'item_type'),
    downstream_constraints: {
      must_choose_from_item_profile_candidate_ids: itemCandidates.map((item) => item.item_profile_candidate_id),
      must_choose_from_container_profile_candidate_ids: containerCandidates.map((item) => item.container_profile_candidate_id),
      must_apply_property_rule_ids: propertyRuleCandidates.map((item) => item.property_rule_candidate_id),
      must_preserve: ['item_template_id', 'source_ref'],
      must_not_create_yet: ['item_id', 'inventory_entry', 'closed_container_contents'],
      must_resolve_later: ['materialized_items', 'ownership_state', 'access_state']
    },
    source_trace: sourceTrace('item_templates', items),
    audit: makeAudit(concerns.length === 0, concerns, [{ kind: 'adapter_mapping', mapping: 'item_profiles_from_item_templates' }])
  };
}

function allowedPlaceTemplateIds(templateLinks, typicalLocations = []) {
  if (!Array.isArray(typicalLocations) || typicalLocations.length === 0) {
    return [...new Set(templateLinks.map((link) => link.place_template_id))];
  }
  return [...new Set(templateLinks
    .filter((link) => typicalLocations.includes(link.place_template_id) || typicalLocations.includes(link.place_kind))
    .map((link) => link.place_template_id))];
}

function buildContainerCandidates(itemCandidates) {
  const names = new Set(itemCandidates.flatMap((item) => Array.isArray(item.typical_containers) ? item.typical_containers : []));
  return [...names].map((name) => ({
    container_profile_candidate_id: `container_profile:${slug(name)}`,
    container_label: name,
    source_mapping: 'world_base.item_templates.typical_containers'
  }));
}

function buildPropertyRuleCandidates(itemCandidates) {
  const keys = new Set();
  for (const item of itemCandidates) {
    for (const role of item.typical_owner_roles) keys.add(role);
  }
  return [...keys].map((role) => ({
    property_rule_candidate_id: `property_rule:owner_role:${slug(role)}`,
    owner_role: role,
    source_mapping: 'world_base.item_templates.typical_owner_roles'
  }));
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key] ?? 'unknown';
    groups.set(value, (groups.get(value) ?? 0) + 1);
  }
  return [...groups.entries()].map(([value, count]) => ({ [key]: value, count }));
}

function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-zа-я0-9_]+/giu, '_').replace(/^_+|_+$/gu, '') || 'unknown';
}
