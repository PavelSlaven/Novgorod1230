-- Current mutable visibility modifiers; removal deletes the current row.
CREATE TABLE IF NOT EXISTS party_runtime.visibility_modifiers (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  source_entity_ref jsonb NOT NULL,
  affected_scope_ref jsonb NOT NULL,
  modifier_kind text NOT NULL CHECK (modifier_kind IN ('occlusion', 'concealment', 'smoke', 'glare', 'darkness')),
  condition_ref jsonb NOT NULL,
  source_dependency_pins jsonb NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 0),
  updated_change_set_id text NOT NULL,
  CHECK (jsonb_typeof(source_entity_ref) = 'object' AND source_entity_ref ? 'entity_kind' AND source_entity_ref ? 'entity_id'),
  CHECK (jsonb_typeof(affected_scope_ref) = 'object' AND affected_scope_ref ? 'spatial_kind' AND affected_scope_ref ? 'spatial_id'),
  CHECK (affected_scope_ref->>'spatial_kind' IN ('canonical_g0','canonical_g1','canonical_g2','canonical_g3','canonical_g4','canonical_g5','party_g5_site','party_g6','scene_position','transit_anchor','route_anchor_scene')),
  CHECK (jsonb_typeof(condition_ref) = 'object' AND condition_ref ? 'entity_ref' AND condition_ref ? 'authoring_version'),
  CHECK (jsonb_typeof(source_dependency_pins) = 'object' AND jsonb_typeof(source_dependency_pins->'pins') = 'array' AND source_dependency_pins ? 'canonical_digest')
);
CREATE INDEX IF NOT EXISTS visibility_modifiers_party_scope_idx
  ON party_runtime.visibility_modifiers (party_id, (affected_scope_ref->>'spatial_kind'), (affected_scope_ref->>'spatial_id'));
