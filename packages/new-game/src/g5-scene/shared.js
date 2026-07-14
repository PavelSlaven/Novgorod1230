export function checkArrayBounds(concerns, value, limits, code, field) {
  if (value.length < limits.min || value.length > limits.max) {
    concerns.push(concern(code, `${field} length must be ${limits.min}..${limits.max}.`, { field, severity: 'hard_block' }));
  }
}

export function hasDarkVisibilityContradiction(output, input) {
  const lightProfile = input?.historical_frame?.clock?.light_profile ?? input?.historical_frame?.calendar?.light_profile ?? null;
  if (lightProfile !== 'dark') return false;
  const anchors = normalizeArray(output.g5_anchors);
  if (anchors.length === 0) return false;
  const visibleAnchors = anchors.filter((anchor) => anchor.visible_now === true || anchor.visibility?.visible_now === true);
  if (visibleAnchors.length <= Math.ceil(anchors.length / 2)) return false;
  return !visibleAnchors.every((anchor) => Boolean(anchor.light_source || anchor.open_space === true || anchor.visibility_reason || anchor.visibility?.reason));
}

export function modelsAreMerged(visibilityModel, accessModel) {
  if (!isPlainObject(visibilityModel) || !isPlainObject(accessModel)) return false;
  if (visibilityModel === accessModel) return true;
  const visibilityKeys = Object.keys(visibilityModel);
  const accessKeys = Object.keys(accessModel);
  if (visibilityKeys.length === 0 || accessKeys.length === 0) return false;
  return JSON.stringify(visibilityModel) === JSON.stringify(accessModel);
}

export function readSelectedChain(selectedStartNode = {}) {
  return selectedStartNode.selected_node_chain ?? selectedStartNode.node_chain ?? selectedStartNode.selected?.selected_node_chain ?? {};
}

export function readSelectedScaleLevel(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_scale_level ?? selectedStartNode.selected_scale_level ?? selectedStartNode.scale_level ?? null;
}

export function readSelectedPlaceTemplateId(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_place_template_id
    ?? selectedStartNode.selected_place_template_id
    ?? selectedStartNode.place_template_id
    ?? selectedStartNode.selected_candidate_place_template_link_id
    ?? null;
}

export function readSelectedG4TypeId(selectedStartNode = {}) {
  return selectedStartNode.selected?.selected_g4_type_id
    ?? selectedStartNode.selected?.g4_type_id
    ?? selectedStartNode.selected_g4_type_id
    ?? selectedStartNode.g4_type_id
    ?? selectedStartNode.selected?.g4_type
    ?? null;
}

export function readMinilocationId(value = {}) {
  return value.minilocation_id ?? value.g5_minilocation_id ?? value.id ?? null;
}

export function readAnchorId(value = {}) {
  return value.anchor_id ?? value.g5_anchor_id ?? value.id ?? null;
}

export function readAnchorTemplateId(value = {}) {
  return value.template_id ?? value.g5_template_id ?? value.g5_template_ref ?? value.allowed_g5_template_id ?? null;
}

export function readAnchorType(value = {}) {
  return value.anchor_type ?? value.type ?? value.anchor_kind ?? null;
}

export function readTemplateId(value = {}) {
  return value.template_id ?? value.g5_template_id ?? value.id ?? null;
}

export function readTemplateAnchorTypes(value = {}) {
  const raw = value.allowed_anchor_types ?? value.anchor_types ?? value.allowed_anchors ?? value.anchor_type_ids ?? [];
  return new Set(normalizeArray(raw).map((item) => typeof item === 'string' ? item : (item.anchor_type ?? item.type ?? item.id)).filter(Boolean));
}

export function readTemplateAnchors(value = {}) {
  const raw = value.anchors ?? value.g5_anchors ?? value.anchor_templates ?? [];
  return new Set(normalizeArray(raw).map((item) => typeof item === 'string' ? item : (item.anchor_type ?? item.type ?? item.id)).filter(Boolean));
}

export function hasOwnRecursive(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return true;
  if (Array.isArray(value)) return value.some((item) => hasOwnRecursive(item, key));
  return Object.values(value).some((item) => hasOwnRecursive(item, key));
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function dedupeConcerns(concerns) {
  const seen = new Set();
  const result = [];
  for (const item of concerns) {
    const key = `${item.code}:${item.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function concern(code, message, extra = {}) { return { code, message, ...extra }; }
