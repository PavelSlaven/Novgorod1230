-- O2b reuses the ordinary aggregate and the common P16 transaction.
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_enablements_scope_kind_check;
ALTER TABLE party_runtime.party_ordinary_materialization_enablements
  ADD CONSTRAINT party_ordinary_materialization_enablements_scope_kind_check
  CHECK (scope_kind IN ('g6','container'));

ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS plan_schema text;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS item_count integer;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD COLUMN IF NOT EXISTS max_new_entities integer DEFAULT 1;
UPDATE party_runtime.party_ordinary_materialization_commits
SET plan_schema='ordinary_materialization_atomic_write_plan_v1'
WHERE plan_schema IS NULL;
UPDATE party_runtime.party_ordinary_materialization_commits
SET item_count=CASE WHEN item_id IS NULL THEN 0 ELSE 1 END
WHERE item_count IS NULL;
UPDATE party_runtime.party_ordinary_materialization_commits
SET max_new_entities=1 WHERE max_new_entities IS NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN plan_schema SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN item_count SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ALTER COLUMN max_new_entities SET DEFAULT 1;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_batch_limit_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_batch_limit_check
  CHECK (max_new_entities BETWEEN 1 AND 8
    AND item_count BETWEEN 0 AND max_new_entities);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_transition_count_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_transition_count_check
  CHECK (transition_count >= 1 AND transition_count <= 128);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_check;
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='party_runtime.party_ordinary_materialization_commits'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%resolution%materialize%item_id%IS NOT NULL%'
      AND pg_get_constraintdef(oid) NOT LIKE '%plan_schema%'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_ordinary_materialization_commits DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_cardinality_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_cardinality_check CHECK (
    (plan_schema='ordinary_materialization_atomic_write_plan_v1'
      AND item_count IN (0,1)
      AND max_new_entities=1
      AND ((resolution='materialize')=(item_id IS NOT NULL))
      AND item_count=CASE WHEN item_id IS NULL THEN 0 ELSE 1 END)
    OR
    (plan_schema='ordinary_container_contents_atomic_write_plan_v2'
      AND scope_kind='container' AND item_id IS NULL
      AND item_count <= max_new_entities
      AND resolution IN ('materialize','no_change'))
  );

ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS container_id text;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD COLUMN IF NOT EXISTS resolution_request_identity text;
UPDATE party_runtime.party_ordinary_materialization_items
SET resolution_request_identity=request_identity
WHERE resolution_request_identity IS NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN resolution_request_identity SET NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ALTER COLUMN position_ref DROP NOT NULL;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_party_id_request_identity_key;
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='party_runtime.party_ordinary_materialization_items'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid)='UNIQUE (party_id, request_identity)'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_ordinary_materialization_items DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_placement_xor_check;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_placement_xor_check CHECK (
    (position_ref IS NOT NULL AND container_id IS NULL)
    OR (position_ref IS NULL AND container_id IS NOT NULL AND scope_kind='container')
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_container_fk;
ALTER TABLE party_runtime.party_ordinary_materialization_items
  ADD CONSTRAINT party_ordinary_materialization_items_container_fk
  FOREIGN KEY (party_id,container_id)
  REFERENCES party_runtime.party_containers(party_id,container_id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_item_proposal_schema_check;
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
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
    OR
    (item_proposal ->> 'schema' = 'ordinary_existing_container_item_proposal_v1'
      AND item_proposal ?& ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']
      AND item_proposal - ARRAY['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'] = '{}'::jsonb
      AND item_proposal -> 'scope_ref' ->> 'entity_kind'='container'
      AND item_proposal -> 'scope_ref' ->> 'entity_id'=container_id
      AND item_proposal -> 'placement' ->> 'container_id'=container_id
      AND (item_proposal ->> 'causal_basis_kind' IS NULL
        OR item_proposal ->> 'causal_basis_kind' IN
          ('personal_possession','stored_supply','communal_or_service',
           'waste_or_scrap','remnant','finite_source','ambient_source',
           'local_natural_feature'))
      AND item_proposal ->> 'condition_state' IN ('serviceable','damaged')
      AND (item_proposal ->> 'condition_state' <> 'damaged'
        OR item_proposal ->> 'causal_basis_kind' = 'remnant'))
  );
ALTER TABLE party_runtime.party_ordinary_materialization_items
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_items_property_placement_evidence_schema_check;
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
    OR
    (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_existing_container_property_placement_evidence.v1'
      AND property_placement_evidence ->> 'version' = '1'
      AND property_placement_evidence ?& ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref']
      AND property_placement_evidence - ARRAY['schema','version','scope_ref','container_id','property_basis_ref','property_context_ref','owner_controller_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref'] = '{}'::jsonb
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_kind'='container'
      AND property_placement_evidence -> 'scope_ref' ->> 'entity_id'=container_id
      AND property_placement_evidence ->> 'container_id'=container_id)
  );

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commit_items (
  party_id text NOT NULL,
  request_identity text NOT NULL,
  item_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  resolution_request_identity text NOT NULL,
  PRIMARY KEY (party_id,request_identity,item_id),
  UNIQUE (party_id,request_identity,ordinal),
  UNIQUE (party_id,resolution_request_identity),
  FOREIGN KEY (party_id,request_identity)
    REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id,item_id)
    REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION
  party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN
    party_runtime.runtime_item_jsonb_exact_keys(
      value,ARRAY['schema','version','provenance','mechanics'])
    AND value->>'schema'='rus.items.runtime_instance_mechanics_snapshot.v1'
    AND jsonb_typeof(value->'version')='number'
    AND (value->>'version')::numeric=1
    AND party_runtime.runtime_item_jsonb_exact_keys(value->'provenance',
      ARRAY['source_kind','root_turn_id','step_index','operation_ref',
        'origin_kind','source_refs'])
    AND value->'provenance'->>'source_kind'='ordinary_world_materialization'
    AND value->'provenance'->>'origin_kind'='existing_container_ordinary'
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'provenance'->'root_turn_id')
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'provenance'->'operation_ref')
    AND jsonb_typeof(value->'provenance'->'step_index')='number'
    AND (value->'provenance'->>'step_index')::numeric BETWEEN 1 AND 8
    AND (value->'provenance'->>'step_index')::numeric
      = trunc((value->'provenance'->>'step_index')::numeric)
    AND jsonb_typeof(value->'provenance'->'source_refs')='array'
    AND jsonb_array_length(value->'provenance'->'source_refs')>0
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
      value->'provenance'->'source_refs') AS source(entry)
      WHERE NOT party_runtime.runtime_item_jsonb_exact_text(source.entry))
    AND (SELECT count(*) FROM jsonb_array_elements(
      value->'provenance'->'source_refs'))
      = (SELECT count(DISTINCT source.entry #>> '{}') FROM jsonb_array_elements(
        value->'provenance'->'source_refs') AS source(entry))
    AND party_runtime.runtime_item_jsonb_exact_keys(value->'mechanics',
      ARRAY['mass_grams','external_hand_cost','carry_form',
        'packing_slot_cost','quantity','container'])
    AND jsonb_typeof(value->'mechanics'->'mass_grams')='number'
    AND (value->'mechanics'->>'mass_grams')::numeric>=0
    AND (value->'mechanics'->>'mass_grams')::numeric
      = trunc((value->'mechanics'->>'mass_grams')::numeric)
    AND jsonb_typeof(value->'mechanics'->'external_hand_cost')='number'
    AND (value->'mechanics'->>'external_hand_cost')::numeric IN (0,1,2)
    AND value->'mechanics'->>'carry_form' IN
      ('compact','regular','long','bulky')
    AND jsonb_typeof(value->'mechanics'->'packing_slot_cost')='number'
    AND (value->'mechanics'->>'packing_slot_cost')::numeric>=0
    AND (value->'mechanics'->>'packing_slot_cost')::numeric
      = trunc((value->'mechanics'->>'packing_slot_cost')::numeric)
    AND jsonb_typeof(value->'mechanics'->'quantity')='object'
    AND party_runtime.runtime_item_jsonb_exact_keys(
      value->'mechanics'->'quantity',ARRAY['value','unit'])
    AND jsonb_typeof(value->'mechanics'->'quantity'->'value')='number'
    AND (value->'mechanics'->'quantity'->>'value')::numeric>0
    AND party_runtime.runtime_item_jsonb_exact_text(
      value->'mechanics'->'quantity'->'unit')
    AND jsonb_typeof(value->'mechanics'->'container')='null'
  THEN true ELSE false END;
$$;

ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_mechanics_source_check CHECK (
    (
      run_id IS NOT NULL AND template_id IS NOT NULL
      AND profile_id IS NOT NULL AND category_id IS NOT NULL
      AND NOT state ? 'runtime_instance_mechanics_snapshot'
    )
    OR (
      run_id IS NULL AND template_id IS NULL
      AND profile_id IS NULL AND category_id IS NULL
      AND (
        party_runtime.runtime_instance_mechanics_snapshot_valid(
          state->'runtime_instance_mechanics_snapshot')
        OR (
          legal_status='ordinary_container_content'
          AND party_runtime.ordinary_container_runtime_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot')
        )
      )
    )
  );
