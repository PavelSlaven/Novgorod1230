-- Existing zero rows are historical depletion, never an invitation to reroll.
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb)
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v2'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v3'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal ->> 'causal_basis_kind' IN ('personal_possession','stored_supply','communal_or_service','waste_or_scrap','remnant','finite_source','ambient_source','local_natural_feature')
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged' OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'
      AND property_placement_evidence ->> 'version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'] = '{}'::jsonb)
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v3'
      AND property_placement_evidence ->> 'version' = '3'
      AND property_placement_evidence ->> 'property_context_version' = '2'
      AND property_placement_evidence ?& ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']
      AND property_placement_evidence - ARRAY['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement'] = '{}'::jsonb
      AND (property_placement_evidence ->> 'unowned_cause_kind' IS NULL OR property_placement_evidence ->> 'unowned_cause_kind' IN ('lost','discarded','abandoned','broken_waste','battlefield_or_ruin_remnant')))
  );
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS lifecycle_state text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS retired_by_causal_identity text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_bounds jsonb;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initialization_identity text;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS initial_amount_evidence jsonb;
ALTER TABLE party_runtime.party_resource_nodes ADD COLUMN IF NOT EXISTS property_basis_ref text;
UPDATE party_runtime.party_resource_nodes SET lifecycle_state=CASE WHEN quantity_numerator=0 THEN 'depleted' ELSE 'active' END WHERE lifecycle_state IS NULL;
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET NOT NULL;
ALTER TABLE party_runtime.party_resource_nodes ALTER COLUMN lifecycle_state SET DEFAULT 'active';
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_lifecycle_quantity_check;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_lifecycle_quantity_check CHECK ((lifecycle_state='active' AND quantity_numerator>0) OR (lifecycle_state='depleted' AND quantity_numerator=0) OR (lifecycle_state='uninitialized' AND quantity_numerator=0 AND property_basis_ref IS NOT NULL AND initial_amount_bounds IS NOT NULL AND jsonb_typeof(initial_amount_bounds)='object' AND initial_amount_bounds ?& ARRAY['minimum','maximum'] AND initial_amount_bounds - ARRAY['minimum','maximum'] = '{}'::jsonb AND initialization_identity IS NULL AND initial_amount_evidence IS NULL));
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_state_version_safe_check;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_state_version_safe_check CHECK (state_version >= 1 AND state_version <= 9007199254740991);
ALTER TABLE party_runtime.party_resource_nodes DROP CONSTRAINT IF EXISTS party_resource_nodes_party_id_updated_change_set_id_fkey;
ALTER TABLE party_runtime.party_resource_nodes ADD CONSTRAINT party_resource_nodes_party_id_updated_change_set_id_fkey FOREIGN KEY (party_id,updated_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS party_runtime.party_resource_node_decrements (
  party_id text NOT NULL, resource_node_id text NOT NULL,
  causal_transition_identity text NOT NULL CHECK (causal_transition_identity <> '' AND causal_transition_identity !~ '[[:cntrl:]]'),
  result_item_id text NOT NULL,
  result_item_mechanics_digest text NOT NULL CHECK (result_item_mechanics_digest ~ '^[0-9a-f]{64}$'),
  result_item_property_placement_digest text NOT NULL CHECK (result_item_property_placement_digest ~ '^[0-9a-f]{64}$'),
  expected_state_version bigint NOT NULL CHECK (expected_state_version >= 1 AND expected_state_version <= 9007199254740991),
  quantity_unit_ref jsonb NOT NULL CHECK (jsonb_typeof(quantity_unit_ref) = 'object'),
  before_numerator numeric NOT NULL CHECK (before_numerator >= 0 AND party_runtime.integral_numeric(before_numerator)),
  before_denominator numeric NOT NULL CHECK (before_denominator > 0 AND party_runtime.integral_numeric(before_denominator) AND gcd(before_numerator,before_denominator)=1),
  decrement_numerator numeric NOT NULL CHECK (decrement_numerator > 0 AND party_runtime.integral_numeric(decrement_numerator)),
  decrement_denominator numeric NOT NULL CHECK (decrement_denominator > 0 AND party_runtime.integral_numeric(decrement_denominator) AND gcd(decrement_numerator,decrement_denominator)=1),
  after_numerator numeric NOT NULL CHECK (after_numerator >= 0 AND party_runtime.integral_numeric(after_numerator)),
  after_denominator numeric NOT NULL CHECK (after_denominator > 0 AND party_runtime.integral_numeric(after_denominator) AND gcd(after_numerator,after_denominator)=1),
  lifecycle_state_after text NOT NULL CHECK (lifecycle_state_after IN ('active','depleted')),
  initialization_identity text NULL CHECK (initialization_identity IS NULL OR (initialization_identity <> '' AND initialization_identity !~ '[[:cntrl:]]')),
  initial_amount_evidence jsonb NULL CHECK (initial_amount_evidence IS NULL OR jsonb_typeof(initial_amount_evidence)='object'),
  p16_change_set_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (party_id, resource_node_id, causal_transition_identity), UNIQUE (party_id, causal_transition_identity),
  FOREIGN KEY (party_id,resource_node_id) REFERENCES party_runtime.party_resource_nodes(party_id,resource_node_id) ON DELETE RESTRICT,
  FOREIGN KEY (party_id,result_item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (party_id,p16_change_set_id) REFERENCES party_runtime.party_v3_change_sets(party_id,id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (before_numerator * decrement_denominator * after_denominator = decrement_numerator * before_denominator * after_denominator + after_numerator * before_denominator * decrement_denominator),
  CHECK ((lifecycle_state_after='depleted') = (after_numerator=0))
);
