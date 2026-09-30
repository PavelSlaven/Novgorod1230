-- rt-names (D49): personal-name pool key and code-set NPC character data.
-- 09.sql stays untouched: the legacy world bridge migration is pinned to parts 09-20.
-- The pool table is empty on any fresh schema, so the NOT NULL columns apply without backfill.
ALTER TABLE world_base.region_name_pool_entries
  ADD COLUMN sex_category TEXT NOT NULL CHECK (sex_category IN ('female', 'male')),
  ADD COLUMN people_ref TEXT NOT NULL CHECK (people_ref ~ '^pp_'),
  ADD COLUMN selection_class TEXT NOT NULL
    CHECK (selection_class IN ('ordinary', 'dynastic', 'monastic', 'significant')),
  ADD COLUMN social_position_archetype_id TEXT
    REFERENCES world_base.social_position_archetypes(id) ON DELETE RESTRICT,
  ADD COLUMN derivation_class TEXT,
  ADD COLUMN derivation TEXT,
  ADD COLUMN people_derivation TEXT,
  ADD COLUMN evidence_period TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'deprecated')),
  ADD COLUMN provenance_ref TEXT;

-- The same form may belong to different sexes and peoples (b2-import-contract).
ALTER TABLE world_base.region_name_pool_entries
  DROP CONSTRAINT region_name_pool_entries_name_pool_id_name_form_key;
ALTER TABLE world_base.region_name_pool_entries
  ADD CONSTRAINT region_name_pool_entries_name_form_sex_people_key
  UNIQUE (name_pool_id, name_form, sex_category, people_ref);
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
  provenance_ref TEXT NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
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
  provenance_ref TEXT NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
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
  provenance_ref TEXT NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  PRIMARY KEY (world_revision_id, occupation_id, item_kind, item_id)
);
