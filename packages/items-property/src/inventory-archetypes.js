import { deepFreeze } from '@rus/kernel';

const CARRY_FORMS = new Set(['compact', 'regular', 'long', 'bulky']);
const PROFILE_FIELDS = ['mass_grams', 'carry_form', 'external_hand_cost'];
const OVERRIDE_FIELDS = PROFILE_FIELDS.map((field) => `${field}_override`);
const ARCHETYPE_FIELDS = new Set([
  'inventory_archetype_id',
  ...PROFILE_FIELDS,
  'status'
]);

export class InventoryArchetypeError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'InventoryArchetypeError';
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

export function validateInventoryArchetypes(archetypes) {
  if (!Array.isArray(archetypes)
    && (archetypes?.schema !== 'rus.inventory_archetype_set.v1'
      || archetypes?.revision !== 1)) {
    fail('INVENTORY_ARCHETYPE_SET_INVALID');
  }
  const records = Array.isArray(archetypes) ? archetypes : archetypes?.archetypes;
  if (!Array.isArray(records)) fail('INVENTORY_ARCHETYPE_SET_INVALID');
  const seen = new Set();
  const validated = records.map((record) => {
    const id = exactText(record?.inventory_archetype_id);
    if (!id) fail('INVENTORY_ARCHETYPE_ID_REQUIRED');
    if (seen.has(id)) fail('INVENTORY_ARCHETYPE_ID_DUPLICATE', { inventory_archetype_id: id });
    seen.add(id);
    if (Object.hasOwn(record, 'inventory_archetype_ref')
      || OVERRIDE_FIELDS.some((field) => Object.hasOwn(record, field))) {
      fail('INVENTORY_ARCHETYPE_INHERITANCE_FORBIDDEN', { inventory_archetype_id: id });
    }
    const unknownField = Object.keys(record)
      .find((field) => !ARCHETYPE_FIELDS.has(field));
    if (unknownField) {
      fail('INVENTORY_ARCHETYPE_FIELD_UNKNOWN', {
        inventory_archetype_id: id,
        field: unknownField
      });
    }
    validatePhysicalProfile(record, 'INVENTORY_ARCHETYPE');
    if (record.status !== 'approved') fail('INVENTORY_ARCHETYPE_STATUS_INVALID', { inventory_archetype_id: id });
    return deepFreeze({ ...structuredClone(record), inventory_archetype_id: id });
  });
  return deepFreeze(validated);
}

export function resolveInventoryProfile({ profile, archetypes } = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) fail('INVENTORY_PROFILE_INVALID');
  const ref = exactText(profile.inventory_archetype_ref);
  if (!ref) {
    if (profile.inventory_archetype_ref != null) fail('INVENTORY_ARCHETYPE_NOT_FOUND', { inventory_archetype_ref: profile.inventory_archetype_ref });
    const orphanOverride = OVERRIDE_FIELDS.find((field) => Object.hasOwn(profile, field));
    if (orphanOverride) fail('INVENTORY_ARCHETYPE_OVERRIDE_WITHOUT_REF', { field: orphanOverride });
    validatePhysicalProfile(profile, 'INVENTORY_PROFILE');
    return resolved(profile);
  }
  for (const field of PROFILE_FIELDS) {
    if (Object.hasOwn(profile, field)) fail('INVENTORY_ARCHETYPE_PROFILE_CONFLICT', { inventory_archetype_ref: ref, field });
  }
  const archetype = validateInventoryArchetypes(archetypes ?? [])
    .find((record) => record.inventory_archetype_id === ref);
  if (!archetype) fail('INVENTORY_ARCHETYPE_NOT_FOUND', { inventory_archetype_ref: ref });
  const result = { ...profile };
  delete result.inventory_archetype_ref;
  for (const field of PROFILE_FIELDS) {
    const override = `${field}_override`;
    result[field] = Object.hasOwn(profile, override) ? profile[override] : archetype[field];
    delete result[override];
  }
  validatePhysicalProfile(result, 'INVENTORY_PROFILE');
  return resolved(result);
}

function resolved(profile) {
  const result = structuredClone(profile);
  delete result.inventory_archetype_ref;
  for (const field of PROFILE_FIELDS) delete result[`${field}_override`];
  return deepFreeze(result);
}

function validatePhysicalProfile(profile, prefix) {
  if (!Number.isInteger(profile?.mass_grams) || profile.mass_grams < 0) fail(`${prefix}_MASS_INVALID`);
  if (!CARRY_FORMS.has(profile?.carry_form)) fail(`${prefix}_CARRY_FORM_INVALID`);
  if (![0, 1, 2].includes(profile?.external_hand_cost)) fail(`${prefix}_HAND_COST_INVALID`);
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : '';
}
function fail(code, details) { throw new InventoryArchetypeError(code, details); }
