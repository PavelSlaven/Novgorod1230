-- Authored, party-scoped O1 authority. The aggregate and property-placement
-- context remain in 021/022; this row supplies the immutable server objective
-- and policy snapshot required before a model may be called.
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_enablements (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind = 'g6'),
  scope_id TEXT NOT NULL CHECK (scope_id <> ''),
  objective_snapshot JSONB NOT NULL CHECK (jsonb_typeof(objective_snapshot) = 'object'),
  objective_digest TEXT NOT NULL CHECK (objective_digest <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (party_id, scope_kind, scope_id),
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_aggregates(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, scope_kind, scope_id)
    REFERENCES party_runtime.party_ordinary_materialization_contexts(party_id, scope_kind, scope_id)
    ON DELETE CASCADE,
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_kind' = scope_kind),
  CHECK (objective_snapshot -> 'scope_ref' ->> 'entity_id' = scope_id)
);
