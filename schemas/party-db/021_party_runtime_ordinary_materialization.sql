-- Closed party-scoped ordinary-materialization state; not an event log.
CREATE TABLE IF NOT EXISTS party_runtime.party_ordinary_materialization_aggregates (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('g6', 'scene_position', 'container', 'source')),
  scope_id TEXT NOT NULL CHECK (
    scope_id <> ''
    AND scope_id !~ '^[[:space:]]|[[:space:]]$'
    AND scope_id !~ '[[:cntrl:]]'
  ),
  state_version BIGINT NOT NULL CHECK (state_version >= 0),
  aggregate_payload JSONB NOT NULL CHECK (jsonb_typeof(aggregate_payload) = 'object'),
  PRIMARY KEY (party_id, scope_kind, scope_id)
);
