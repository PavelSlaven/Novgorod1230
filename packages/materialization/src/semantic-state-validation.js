export function validateSemanticState(instance, concerns, fields) {
  for (const field of fields) {
    const value = instance.attributes?.[field];
    const valid = validateField(field, value);
    if (!valid) concerns.push({ code: 'INSTANCE_SEMANTIC_BASIS_MISSING', instance_id: instance.instance_id, domain: instance.domain, field });
  }
}

function validateField(field, value) {
  if (['presence_reason', 'item_category_id'].includes(field)) return typeof value === 'string' && value.trim().length > 0;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) return false;
  const anyText = (...keys) => keys.some((key) => typeof value[key] === 'string' && value[key].trim());
  if (field === 'causal_basis') return anyText('causal_basis_type', 'type') && anyText('causal_basis_id', 'source_id', 'rule_id');
  if (field === 'access_state') return anyText('access', 'access_state', 'state');
  if (field === 'visibility_state') return anyText('visibility', 'visibility_default', 'state') || typeof value.visible === 'boolean' || typeof value.visible_to_player === 'boolean';
  if (field === 'property_state') return anyText('owner_model');
  if (field === 'risk_state') return anyText('risk_level') || Array.isArray(value.risk_basis) || Object.keys(value).some((key) => key.endsWith('_risk'));
  if (field === 'identity_state') return anyText('name_status', 'visibility', 'identity_model');
  if (field === 'machine_state') return anyText('mode', 'state', 'machine_state');
  return Object.keys(value).length > 0;
}
