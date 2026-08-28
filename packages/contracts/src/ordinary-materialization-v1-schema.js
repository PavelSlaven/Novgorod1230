import {
  ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA
} from './schema-names.js';

export {
  ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA
};

const REQUEST_SCHEMA = ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA;
const PLAN_SCHEMA = ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA;

export const ORDINARY_MATERIALIZATION_V1_ENUMS = deepFreeze({
  mode: ['seed_scope', 'resolve_presence', 'resolve_container', 'resolve_natural_feature', 'refine_background_group'],
  resolution: ['seeded', 'materialize', 'absent', 'no_change', 'authority_required'],
  authority_class: ['ordinary', 'significant', 'hidden', 'informational', 'authored_canonical'],
  availability_class: ['common', 'context_bound'],
  admission_class: ['common_mundane', 'specialized_or_valuable', 'weapon_or_armament', 'currency_or_precious', 'document_like', 'container_capable', 'other_restricted'],
  functional_bucket: ['household', 'work', 'storage', 'stock', 'furnishing_textile', 'maintenance_material', 'waste_scrap', 'personal_effect', 'arms', 'other_ordinary'],
  density_band: ['sparse', 'ordinary', 'dense'], basis_state: ['committed', 'prepared_seed'],
  scope_kind: ['g6', 'scene_position', 'container', 'source'], presence_expectation: ['routine', 'plausible', 'exceptional']
});

export const ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: REQUEST_SCHEMA, type: 'object', additionalProperties: false,
  required: ['schema', 'request_id', 'mode', 'scope_ref', 'context_refs', 'policy_refs', 'ordinary_state', 'candidate_query', 'technical_limits'],
  properties: {
    schema: { const: REQUEST_SCHEMA }, request_id: stringSchema(), mode: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.mode), scope_ref: scopeRefSchema(),
    context_refs: objectSchema({ period_ref: stringSchema(), region_ref: stringSchema(), function_refs: stringArraySchema(), environment_refs: stringArraySchema(), occupation_household_refs: stringArraySchema(), economic_context_ref: stringSchema(), occupancy_state_ref: stringSchema(), material_culture_refs: stringArraySchema(), property_context_ref: stringSchema() }),
    policy_refs: policyRefsSchema(),
    ordinary_state: ordinaryStateSchema(),
    candidate_query: nullableCandidateQuerySchema(), technical_limits: objectSchema({ max_new_entities: { type: 'integer', minimum: 1 }, max_new_background_groups: { type: 'integer', minimum: 1 }, max_resolution_records: { type: 'integer', minimum: 1 } }), authority_envelope: authorityEnvelopeSchema()
  },
  allOf: [{
    if: { properties: { mode: { const: 'seed_scope' } }, required: ['mode'] },
    then: { properties: { candidate_query: { type: 'null' } } },
    else: { properties: { candidate_query: candidateQuerySchema() } }
  }]
});

export const ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema', $id: PLAN_SCHEMA, type: 'object', additionalProperties: false,
  required: ['schema', 'request_id', 'resolution', 'density_band_proposal', 'background_groups', 'entities', 'presence_resolutions', 'reason_code'],
  properties: {
    schema: { const: PLAN_SCHEMA }, request_id: stringSchema(), resolution: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.resolution), density_band_proposal: nullableEnumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.density_band), background_groups: { type: 'array', items: backgroundGroupSchema() }, entities: { type: 'array', items: entitySchema() },
    presence_resolutions: { type: 'array', items: objectSchema({ candidate_key: stringSchema(), coverage_key: stringSchema(), resolution: enumSchema(['absent', 'no_change', 'authority_required']) }) }, reason_code: stringSchema()
  },
  allOf: [{
    if: { properties: { resolution: { const: 'materialize' } }, required: ['resolution'] },
    then: { properties: { entities: { minItems: 1 } } }
  }]
});

function stringSchema() { return { type: 'string', minLength: 1, pattern: '^(?:\\S|\\S[\\s\\S]*\\S)$' }; }
function enumSchema(values) { return { type: 'string', enum: values }; }
function nullableEnumSchema(values) { return { anyOf: [{ type: 'null' }, enumSchema(values)] }; }
function stringArraySchema() { return { type: 'array', items: stringSchema() }; }
function enumArraySchema(values) { return { type: 'array', items: enumSchema(values) }; }
function objectSchema(properties) { return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties }; }
function objectSchemaWithOptional(properties, optional) { return { type:'object', additionalProperties:false, required:Object.keys(properties), properties:{...properties,...optional} }; }
function scopeRefSchema() { return objectSchema({ entity_kind: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.scope_kind), entity_id: stringSchema() }); }
function ordinaryStateSchema() { const schema = objectSchema({ seeded: { type: 'boolean' }, density_band: nullableEnumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.density_band), remaining_identity_budget: { type: 'integer', minimum: 0 }, background_groups: stringArraySchema(), presence_resolutions: stringArraySchema(), closed_observation_scopes: stringArraySchema() }); return { ...schema, allOf: [{ if: { properties: { seeded: { const: false } }, required: ['seeded'] }, then: { properties: { density_band: { type: 'null' }, remaining_identity_budget: { const: 0 }, background_groups: { maxItems: 0 }, presence_resolutions: { maxItems: 0 }, closed_observation_scopes: { maxItems: 0 } } }, else: { properties: { density_band: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.density_band) } } }] }; }
function candidateQuerySchema() { return objectSchema({ candidate_key: stringSchema(), candidate_hint: stringSchema(), coverage_key: stringSchema(), evidence_weight: { const: 0 } }); }
function authorityEnvelopeSchema() { return { oneOf: [seedAuthorityEnvelopeSchema(), presenceAuthorityEnvelopeSchema()] }; }
function seedAuthorityEnvelopeSchema() { return objectSchema({ stage: { const: 'seed_scope' }, density_bands: enumArraySchema(ORDINARY_MATERIALIZATION_V1_ENUMS.density_band), disclosure_policy_refs: stringArraySchema(), group_bases: { type:'array', items: objectSchema({ basis_ref:stringSchema(), basis_state:enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state), functional_buckets:enumArraySchema(ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket), allowed_admission_classes:enumArraySchema(ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class), permission_refs:stringArraySchema() }) } }); }
function presenceAuthorityEnvelopeSchema() { return objectSchema({ stage: { const: 'resolve_presence' }, candidate: objectSchema({ semantic_type:stringSchema(), functional_bucket:enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket), admission_class:enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class), availability_class:enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class), coverage_kind:stringSchema(), coverage_ref:stringSchema() }), allowed_supporting_bases:{ type:'array', items:objectSchema({ basis_ref:stringSchema(), basis_state:enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state) }) }, property_basis_ref:stringSchema(), placement_refs:stringArraySchema() }); }
function nullableCandidateQuerySchema() { return { anyOf: [{ type: 'null' }, candidateQuerySchema()] }; }
function causalBasisSchema() { return objectSchema({ basis_kind: stringSchema(), basis_refs: { ...stringArraySchema(), minItems: 1 } }); }
function backgroundGroupSchema() { return objectSchema({ descriptor: stringSchema(), functional_bucket: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket), availability_class: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class), allowed_admission_classes: enumArraySchema(ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class), causal_basis: causalBasisSchema(), property_basis_ref: stringSchema(), permission_refs: stringArraySchema(), disclosure_policy_ref: stringSchema() }); }
function policyRefsSchema() { return objectSchemaWithOptional({ authority_policy_ref: stringSchema(), density_policy_ref: stringSchema(), ordinary_presence_policy_ref: stringSchema(), runtime_item_mechanics_policy_ref: stringSchema(), allowed_admission_classes: enumArraySchema(ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class), context_bound_permission_refs: stringArraySchema(), allowed_supporting_bases: { type: 'array', items: objectSchema({ basis_ref: stringSchema(), basis_state: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state) }) } }, { finite_source_initial_amount_estimate_policy: objectSchema({ schema: { const: 'finite_source_initial_amount_estimate_policy_v1' }, minimum: positiveRationalSchema(), maximum: positiveRationalSchema() }) }); }
function positiveRationalSchema() { return objectSchema({ numerator: { type:'integer', minimum:1 }, denominator: { type:'integer', minimum:1 }, unit:stringSchema() }); }
function entitySchema() { const base={ semantic_descriptor: objectSchema({ semantic_type: stringSchema(), name: stringSchema(), facts: stringArraySchema() }), authority_class: { const: 'ordinary' }, admission_class: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class), availability_class: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class), functional_bucket: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket), presence_expectation: enumSchema(ORDINARY_MATERIALIZATION_V1_ENUMS.presence_expectation), supporting_basis_ref: stringSchema(), causal_basis: causalBasisSchema(), property_basis_ref: stringSchema(), placement_proposal: objectSchema({ scope_ref: stringSchema(), position_ref: stringSchema() }), mechanics_proposal: objectSchema({ mass_grams: { type: 'integer', minimum: 1, maximum: 1000000 }, external_hand_cost: { type: 'integer', minimum: 0, maximum: 2 }, carry_form: stringSchema(), packing_slot_cost: { type: 'integer', minimum: 0, maximum: 1000 }, quantity: objectSchema({ value: { type: 'integer', minimum: 1, maximum: 1000 }, unit: { const: 'item' } }), container: { type: 'null' } }) }; return objectSchemaWithOptional(base,{finite_source_initial_amount_estimate:objectSchema({schema:{const:'finite_source_initial_amount_estimate_v1'},amount:positiveRationalSchema()})}); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deepFreeze(child); return Object.freeze(value); }
