import { isPlainObject, normalizeArray, readSelectedG4TypeId, readTemplateAnchorTypes, readTemplateAnchors, readTemplateId } from './shared.js';

export function filterAllowedG5Templates(input = {}) {
  const templateSet = normalizeAllowedG5TemplateSet(input.allowed_g5_template_set ?? input.allowedG5TemplateSet ?? {});
  const selectedG4TypeId = templateSet.selected_g4_type_id
    ?? readSelectedG4TypeId(input.selected_start_node)
    ?? input.selected_g4_type_id
    ?? null;
  const scope = input.materialization_context ?? {};
  if (!scope.world_revision_id || templateSet.world_revision_id !== scope.world_revision_id || !scope.region_id || !Number.isInteger(scope.year) || !scope.season) return [];
  return templateSet.allowed_g5_templates.filter((template) => {
    if (!isPlainObject(template)) return false;
    const status = String(template.status ?? template.template_status ?? '').toLowerCase();
    if (status !== 'approved') return false;
    if (template.enabled === false) return false;
    const templateG4Type = template.g4_type_id ?? template.selected_g4_type_id ?? null;
    if (selectedG4TypeId && templateG4Type && templateG4Type !== selectedG4TypeId) return false;
    for (const scoped of [template, template.materialization_profile, template.layout_template]) {
      if (!isPlainObject(scoped)) return false;
      if (scoped.world_revision_id !== scope.world_revision_id || scoped.region_id !== scope.region_id) return false;
      if (!Number.isInteger(scoped.valid_from_year) || !Number.isInteger(scoped.valid_to_year)) return false;
      if (scope.year < scoped.valid_from_year || scope.year > scoped.valid_to_year) return false;
      if (!Array.isArray(scoped.allowed_seasons) || !scoped.allowed_seasons.includes(scope.season)) return false;
    }
    const anchorTypes = readTemplateAnchorTypes(template);
    const anchors = readTemplateAnchors(template);
    return anchorTypes.size > 0 || anchors.size > 0 || Boolean(readTemplateId(template));
  });
}

export function normalizeAllowedG5TemplateSet(value = {}) {
  return {
    version: value.version ?? 1,
    schema: value.schema ?? 'allowed_g5_template_set',
    selected_g4_type_id: value.selected_g4_type_id ?? value.g4_type_id ?? null,
    world_revision_id: value.world_revision_id ?? value.revision_id ?? null,
    bundle_id: value.bundle_id ?? null,
    catalog_digest: value.catalog_digest ?? null,
    allowed_g5_templates: normalizeArray(value.allowed_g5_templates ?? value.templates ?? value.g5_templates)
  };
}

export function buildAllowedTemplateIndex(input = {}) {
  const templates = filterAllowedG5Templates(input);
  const templateIds = new Set();
  const anchorTypes = new Set();
  for (const template of templates) {
    const templateId = readTemplateId(template);
    if (templateId) templateIds.add(templateId);
    for (const type of readTemplateAnchorTypes(template)) anchorTypes.add(type);
    for (const anchor of readTemplateAnchors(template)) anchorTypes.add(anchor);
  }
  return { templateIds, anchorTypes, templates };
}
