ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_aggregates_state_version_check;
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  ADD CONSTRAINT party_ordinary_materialization_aggregates_state_version_check
  CHECK (state_version >= 0 AND state_version <= 9007199254740991);
ALTER TABLE party_runtime.parties
  DROP CONSTRAINT IF EXISTS party_runtime_parties_state_version_safe_integer_check;
ALTER TABLE party_runtime.parties
  ADD CONSTRAINT party_runtime_parties_state_version_safe_integer_check
  CHECK (state_version <= 9007199254740991);

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_contexts (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6','scene_position','container','source')),
  scope_id TEXT NOT NULL,
  catalog_version BIGINT NOT NULL CHECK (catalog_version >= 0 AND catalog_version <= 9007199254740991),
  property_version BIGINT NOT NULL CHECK (property_version >= 0 AND property_version <= 9007199254740991),
  placement_version BIGINT NOT NULL CHECK (placement_version >= 0 AND placement_version <= 9007199254740991),
  supporting_basis_catalog_version BIGINT NOT NULL DEFAULT 0 CHECK (supporting_basis_catalog_version >= 0 AND supporting_basis_catalog_version <= 9007199254740991),
  supporting_basis_catalog_digest TEXT NOT NULL CHECK (supporting_basis_catalog_digest <> ''),
  property_placement_context_digest TEXT NOT NULL CHECK (property_placement_context_digest <> ''),
  property_placement_base_snapshot JSONB NOT NULL CHECK (jsonb_typeof(property_placement_base_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id),
  FOREIGN KEY (party_id,scope_kind,scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_commits (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  transition_digest TEXT NOT NULL,
  write_plan_digest TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('materialize','absent','no_change','authority_required')),
  transition_count SMALLINT NOT NULL CHECK (transition_count IN (1,2)),
  from_party_state_version BIGINT NOT NULL CHECK (from_party_state_version >= 0 AND from_party_state_version <= 9007199254740991),
  to_party_state_version BIGINT NOT NULL CHECK (to_party_state_version = from_party_state_version + 1),
  from_ordinary_state_version BIGINT NOT NULL CHECK (from_ordinary_state_version >= 0 AND from_ordinary_state_version <= 9007199254740991),
  to_ordinary_state_version BIGINT NOT NULL CHECK (to_ordinary_state_version = from_ordinary_state_version + transition_count),
  item_id TEXT,
  PRIMARY KEY (party_id,request_identity),
  UNIQUE (party_id,scope_kind,scope_id,request_identity),
  UNIQUE (party_id,request_identity,transition_digest),
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK ((resolution = 'materialize') = (item_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_basis_catalog (
  party_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  origin_request_identity TEXT,
  basis_snapshot JSONB NOT NULL CHECK (jsonb_typeof(basis_snapshot) = 'object'),
  PRIMARY KEY (party_id,scope_kind,scope_id,basis_ref),
  FOREIGN KEY (party_id,origin_request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  CHECK (basis_ref <> '' AND basis_snapshot ->> 'basis_ref' = basis_ref),
  CHECK (basis_snapshot ->> 'state' IN ('committed','prepared_seed')),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (basis_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id),
  CHECK ((basis_snapshot ->> 'state' = 'prepared_seed') = (origin_request_identity IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_items (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  request_identity TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  candidate_key TEXT NOT NULL,
  coverage_key TEXT NOT NULL,
  context_version TEXT NOT NULL,
  functional_bucket TEXT NOT NULL,
  admission_class TEXT NOT NULL,
  supporting_basis_ref TEXT NOT NULL,
  causal_basis_refs JSONB NOT NULL CHECK (jsonb_typeof(causal_basis_refs) = 'array'),
  property_basis_ref TEXT NOT NULL,
  position_ref TEXT NOT NULL,
  property_placement_context_digest TEXT NOT NULL,
  property_catalog_version_ref TEXT NOT NULL,
  placement_catalog_version_ref TEXT NOT NULL,
  property_placement_evidence JSONB NOT NULL CHECK (jsonb_typeof(property_placement_evidence) = 'object'),
  mechanics_policy_ref TEXT NOT NULL,
  item_proposal JSONB NOT NULL CHECK (jsonb_typeof(item_proposal) = 'object'),
  mechanics_snapshot JSONB NOT NULL CHECK (jsonb_typeof(mechanics_snapshot) = 'object'),
  PRIMARY KEY (party_id,item_id),
  UNIQUE (party_id,request_identity),
  UNIQUE (party_id,request_identity,item_id),
  UNIQUE (party_id,scope_kind,scope_id,candidate_key,coverage_key,context_version),
  FOREIGN KEY (party_id,request_identity) REFERENCES party_runtime.party_ordinary_materialization_commits(party_id,request_identity) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id) REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id,scope_kind,scope_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,supporting_basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE RESTRICT,
  CONSTRAINT party_ordinary_materialization_items_item_proposal_schema_check CHECK (item_proposal ->> 'schema' = 'ordinary_world_item_proposal_v1'),
  CONSTRAINT party_ordinary_materialization_items_property_placement_evidence_schema_check CHECK (property_placement_evidence ->> 'schema' = 'rus.items.ordinary_world_property_placement_evidence.v2'),
  CHECK (property_placement_evidence ->> 'property_placement_context_digest' = property_placement_context_digest),
  CHECK (property_placement_evidence ->> 'property_catalog_version_ref' = property_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'placement_catalog_version_ref' = placement_catalog_version_ref),
  CHECK (property_placement_evidence ->> 'property_basis_ref' = property_basis_ref),
  CHECK (property_placement_evidence -> 'placement' ->> 'position_ref' = position_ref),
  CHECK (mechanics_snapshot ->> 'schema' = 'rus.items.runtime_instance_mechanics_snapshot.v2'),
  CHECK (mechanics_snapshot -> 'provenance' ->> 'source_kind' = 'ordinary_world_materialization')
);
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_item_fk;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_item_fk
  FOREIGN KEY (party_id,request_identity,item_id)
  REFERENCES party_runtime.party_ordinary_materialization_items(party_id,request_identity,item_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_item_basis_refs (
  party_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  basis_ref TEXT NOT NULL,
  PRIMARY KEY (party_id,item_id,basis_ref),
  FOREIGN KEY (party_id,item_id) REFERENCES party_runtime.party_ordinary_materialization_items(party_id,item_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id,scope_kind,scope_id,basis_ref) REFERENCES party_runtime.party_ordinary_materialization_basis_catalog(party_id,scope_kind,scope_id,basis_ref) ON DELETE CASCADE
);
