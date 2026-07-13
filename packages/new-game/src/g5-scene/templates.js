import { isPlainObject, normalizeArray, readSelectedG4TypeId, readTemplateAnchorTypes, readTemplateAnchors, readTemplateId } from './shared.js';

export function filterAllowedG5Templates(input = {}) {
  const templateSet = normalizeAllowedG5TemplateSet(input.allowed_g5_template_set ?? input.allowedG5TemplateSet ?? {});
  const selectedG4TypeId = templateSet.selected_g4_type_id
    ?? readSelectedG4TypeId(input.selected_start_node)
    ?? input.selected_g4_type_id
    ?? null;
  return templateSet.allowed_g5_templates.filter((template) => {
    if (!isPlainObject(template)) return false;
    const status = String(template.status ?? template.template_status ?? 'active').toLowerCase();
    if (status === 'rejected' || status === 'conflict') return false;
    if (template.enabled === false) return false;
    const templateG4Type = template.g4_type_id ?? template.selected_g4_type_id ?? null;
    if (selectedG4TypeId && templateG4Type && templateG4Type !== selectedG4TypeId) return false;
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
