-- rt-names (D49): code-set NPC personal names and character.
-- The name pool table itself (region_name_pool_entries: sex/people/class columns and the
-- (pool, form, sex, people) key) is defined in 09.sql; the world schema is drop-and-recreate.
CREATE INDEX region_name_pool_entries_selection_idx
  ON world_base.region_name_pool_entries (name_pool_id, people_ref, sex_category, selection_class, status);

-- Which pool and people a NPC regional context draws personal names from.
-- A context without a row has no name source: its NPC stay unnamed (owner decision pending).
CREATE TABLE world_base.npc_regional_context_name_bindings (
  regional_context_id TEXT NOT NULL CHECK (length(btrim(regional_context_id)) > 0),
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  name_pool_id TEXT NOT NULL REFERENCES world_base.region_name_pools(id) ON DELETE RESTRICT,
  people_ref TEXT NOT NULL CHECK (people_ref ~ '^pp_'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  PRIMARY KEY (regional_context_id, world_revision_id)
);

-- Closed temperament trait and value vocabulary (D29 psychology_scales).
CREATE TABLE world_base.npc_psychology_scale_entries (
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  scale_kind TEXT NOT NULL CHECK (scale_kind IN ('trait', 'value')),
  entry_id TEXT NOT NULL CHECK (length(btrim(entry_id)) > 0),
  label_ru TEXT NOT NULL CHECK (length(btrim(label_ru)) > 0),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  PRIMARY KEY (world_revision_id, scale_kind, entry_id)
);

-- Goal and fear candidates per occupation; the NPC picks from them by seed.
CREATE TABLE world_base.occupation_character_items (
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  occupation_id TEXT NOT NULL CHECK (length(btrim(occupation_id)) > 0),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('goal', 'fear')),
  item_id TEXT NOT NULL CHECK (length(btrim(item_id)) > 0),
  text_ru TEXT NOT NULL CHECK (length(btrim(text_ru)) > 0),
  basis TEXT NOT NULL CHECK (basis IN ('sourced', 'logical_necessity', 'analogy')),
  confidence TEXT NOT NULL CHECK (length(btrim(confidence)) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  PRIMARY KEY (world_revision_id, occupation_id, item_kind, item_id)
);
