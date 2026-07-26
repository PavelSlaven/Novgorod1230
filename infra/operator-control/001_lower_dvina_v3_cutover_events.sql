CREATE SCHEMA IF NOT EXISTS operator_control;

CREATE OR REPLACE FUNCTION operator_control.reject_cutover_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE IF NOT EXISTS operator_control.lower_dvina_v3_cutover_events (
  request_digest TEXT NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  phase TEXT NOT NULL
    CHECK (phase IN ('prepared','party_cleanup_committed')),
  release_id TEXT NOT NULL CHECK (release_id = 'spatial-v3-production-v3'),
  world_revision_id TEXT NOT NULL
    CHECK (
      world_revision_id =
        'novgorod_spatial_v3_production_v3_candidate_001'
    ),
  world_catalog_digest TEXT NOT NULL
    CHECK (
      world_catalog_digest =
        '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
    ),
  expected_previous_event_id TEXT NOT NULL,
  expected_party_ids JSONB NOT NULL
    CHECK (jsonb_typeof(expected_party_ids) = 'array'),
  expected_party_set_digest TEXT NOT NULL
    CHECK (expected_party_set_digest ~ '^[a-f0-9]{64}$'),
  authorization_digest TEXT NOT NULL
    CHECK (authorization_digest ~ '^[a-f0-9]{64}$'),
  party_database TEXT NOT NULL,
  party_principal TEXT NOT NULL,
  party_cleanup_result_digest TEXT
    CHECK (
      party_cleanup_result_digest IS NULL
      OR party_cleanup_result_digest ~ '^[a-f0-9]{64}$'
    ),
  event_digest TEXT NOT NULL UNIQUE CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_digest, phase),
  CHECK (
    (phase = 'prepared' AND party_cleanup_result_digest IS NULL)
    OR (
      phase = 'party_cleanup_committed'
      AND party_cleanup_result_digest IS NOT NULL
    )
  )
);

DROP TRIGGER IF EXISTS lower_dvina_v3_cutover_events_append_only
  ON operator_control.lower_dvina_v3_cutover_events;
CREATE TRIGGER lower_dvina_v3_cutover_events_append_only
BEFORE UPDATE OR DELETE
ON operator_control.lower_dvina_v3_cutover_events
FOR EACH ROW
EXECUTE FUNCTION operator_control.reject_cutover_event_mutation();

REVOKE UPDATE, DELETE, TRUNCATE
  ON operator_control.lower_dvina_v3_cutover_events
  FROM PUBLIC;
