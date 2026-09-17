ALTER TABLE party_runtime.party_narration_jobs
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'narrated',
  ADD COLUMN IF NOT EXISTS factual_screen jsonb;

ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_check,
  DROP CONSTRAINT IF EXISTS party_narration_jobs_delivery_valid;
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_jobs_delivery_valid CHECK(
    state_version >= 1 AND next_attempt_ordinal >= 0 AND delivery_mode IN ('narrated','factual') AND (
    (delivery_mode='narrated' AND (
      (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NULL)
      OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL AND factual_screen IS NULL)
    ))
    OR (delivery_mode='factual' AND status='delivered' AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL AND factual_screen IS NOT NULL))
  );

ALTER TABLE party_runtime.party_narration_attempts
  DROP CONSTRAINT IF EXISTS party_narration_attempts_outcome_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_check1,
  DROP CONSTRAINT IF EXISTS party_narration_attempts_delivery_valid;
ALTER TABLE party_runtime.party_narration_attempts
  ADD CONSTRAINT party_narration_attempts_delivery_valid CHECK(
    attempt_ordinal >= 0 AND (
    (outcome='delivered' AND output_digest IS NOT NULL AND failure_code IS NULL)
    OR (outcome='factual_delivered' AND output_digest IS NULL AND failure_code IS NULL)
    OR (outcome='failed_retryable' AND output_digest IS NULL)
    )
  );

CREATE OR REPLACE FUNCTION party_runtime.party_narration_job_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state_version <> OLD.state_version + 1 THEN RAISE EXCEPTION 'narration job state version must advance by one'; END IF;
  IF NOT (
    (OLD.status IN ('pending','failed_retryable') AND NEW.status='in_progress' AND NEW.delivery_mode='narrated')
    OR (OLD.status='in_progress' AND NEW.status IN ('output_ready','failed_retryable') AND NEW.delivery_mode='narrated')
    OR (OLD.status='output_ready' AND NEW.status='delivered' AND NEW.delivery_mode='narrated')
    OR (OLD.status='in_progress' AND NEW.status='delivered' AND NEW.delivery_mode='factual')
  ) THEN RAISE EXCEPTION 'narration job lifecycle transition is invalid'; END IF;
  IF NEW.job_id<>OLD.job_id OR NEW.party_id<>OLD.party_id OR NEW.package_id<>OLD.package_id OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'narration job identity is immutable';
  END IF;
  RETURN NEW;
END $$;
