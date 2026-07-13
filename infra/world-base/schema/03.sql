CREATE TABLE world_base.social_classes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.social_role_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.legal_status_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.dependency_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.mobility_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.social_position_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  social_class_id TEXT NOT NULL REFERENCES world_base.social_classes(id) ON DELETE RESTRICT,
  role_archetype_id TEXT NOT NULL REFERENCES world_base.social_role_archetypes(id) ON DELETE RESTRICT,
  legal_status_archetype_id TEXT NOT NULL REFERENCES world_base.legal_status_archetypes(id) ON DELETE RESTRICT,
  dependency_archetype_id TEXT NOT NULL REFERENCES world_base.dependency_archetypes(id) ON DELETE RESTRICT,
  mobility_archetype_id TEXT NOT NULL REFERENCES world_base.mobility_archetypes(id) ON DELETE RESTRICT,
  property_rights_model TEXT,
  weapon_rights_model TEXT,
  court_voice_model TEXT,
  typical_power_over_others TEXT,
  typical_power_over_them TEXT,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.class_role_rules (
  social_class_id TEXT NOT NULL REFERENCES world_base.social_classes(id) ON DELETE CASCADE,
  role_archetype_id TEXT NOT NULL REFERENCES world_base.social_role_archetypes(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (social_class_id, role_archetype_id)
);

CREATE TABLE world_base.occupation_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
