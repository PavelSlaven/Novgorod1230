import { sha256, stableStringify } from '@rus/kernel';

const V1_KEYS = ['scope_ref','property_catalog_version_ref',
  'placement_catalog_version_ref','item_kind','supporting_basis_ref',
  'causal_basis_refs','requested_position_ref','personal_communal_refs',
  'occupied_site_refs','unowned_cause_refs','placement_context_refs',
  'property_catalog','placement_catalog'];
const V2_KEYS = ['schema','version','scope_ref','property_catalog_version_ref',
  'placement_catalog_version_ref','item_kind','supporting_basis_ref',
  'causal_basis_refs','requested_position_ref','explicit_item_source_refs',
  'personal_possession_refs','communal_public_service_refs',
  'container_property_refs','occupied_site_refs','unowned_cause_refs',
  'placement_context_refs','property_catalog','placement_catalog'];
const V1_PAYLOAD = ['scope_ref','item_kind','property_catalog_version_ref',
  'placement_catalog_version_ref','personal_communal_refs','occupied_site_refs',
  'unowned_cause_refs','placement_context_refs','property_catalog',
  'placement_catalog'];
const V2_PAYLOAD = ['scope_ref','item_kind','property_catalog_version_ref',
  'placement_catalog_version_ref','explicit_item_source_refs',
  'personal_possession_refs','communal_public_service_refs',
  'container_property_refs','occupied_site_refs','unowned_cause_refs',
  'placement_context_refs','property_catalog','placement_catalog'];

export function ordinaryWorldPropertyPlacementContextDigest(value = {}) {
  if (exact(value, V1_KEYS)) return digest('v1', value, V1_PAYLOAD);
  if (exact(value, V2_KEYS)
      && value.schema === 'rus.items.ordinary_world_property_placement_context.v2'
      && value.version === 2) return digest('v2', value, V2_PAYLOAD);
  return null;
}

function digest(version, value, keys) {
  return sha256(stableStringify({
    domain: `rus.items.ordinary_world_property_placement_context.${version}`,
    ...Object.fromEntries(keys.map((key) => [key, value[key]]))
  }));
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
