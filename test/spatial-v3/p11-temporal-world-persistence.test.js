import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../schemas/party-db/007_party_runtime_temporal_world.sql', import.meta.url);
const resumeTerminalMigrationPath = new URL('../../schemas/party-db/014_party_runtime_activity_resume_terminal.sql', import.meta.url);
const loaderPath = new URL('../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js', import.meta.url);

test('P11 temporal-world migration persists the bounded temporal runtime model', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const table of [
    'party_activity_participant_bindings', 'party_activity_resource_bindings',
    'party_temporal_events', 'party_temporal_event_subjects', 'party_temporal_event_dependencies',
    'party_npc_runtime_transitions', 'party_perception_records', 'party_perception_witnesses', 'party_npc_decision_traces',
    'party_body_temporal_history', 'party_remote_aggregate_states', 'party_propagation_processes',
    'party_visible_packages', 'party_narration_jobs', 'party_narration_attempts'
  ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS party_runtime\\.${table}\\b`, 'u'), table);

  assert.match(sql, /ALTER TABLE party_runtime\.party_timed_activity_executions[\s\S]*ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric/u);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS progress jsonb/u);
  assert.match(sql, /ALTER TABLE party_runtime\.party_timed_activity_attempts[\s\S]*ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric/u);
  for (const column of ['progress_before jsonb', 'progress_after jsonb', 'resource_reservations jsonb', 'resource_consumptions jsonb', 'body_effect_refs jsonb', 'participant_attendance jsonb', 'rule_and_policy_pins jsonb']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'u'), column);
  }
  assert.match(sql, /ALTER TABLE party_runtime\.party_npc_spatial_schedules[\s\S]*ADD COLUMN IF NOT EXISTS next_transition_at_whole_minutes numeric/u);
  for (const column of ['current_activity_execution_id text', 'attention_state_ref jsonb', 'body_state_ref jsonb', 'knowledge_state_ref jsonb', 'relationship_state_ref jsonb']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'u'), column);
  }
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS party_runtime\.party_timed_activity_(?:executions|attempts)_v2/u);
  assert.match(sql, /party_runtime\.integral_numeric\(/u);
  assert.match(sql, /gcd\(/u);
  assert.match(sql, /CREATE OR REPLACE FUNCTION party_runtime\.game_timestamp_parts_valid/u);
  assert.match(sql, /SELECT COALESCE\(/u);
  assert.ok((sql.match(/party_runtime\.game_timestamp_parts_valid\(/gu) ?? []).length >= 10);
  assert.match(sql, /activity_active_boundary_valid/u);
  assert.match(sql, /activity_attempt_timestamp_valid/u);
  assert.match(sql, /activity_attempt_ordinal_valid/u);
  assert.match(sql, /activity_execution_temporal_valid/u);
  assert.match(sql, /party_activity_participant_lifecycle_valid/u);
  assert.match(sql, /party_npc_schedule_lifecycle_valid/u);
  assert.match(sql, /party_npc_schedule_party_reference_valid/u);
  assert.match(sql, /state_version bigint NOT NULL DEFAULT 1 CHECK\(state_version >= 1\)/u);
  assert.match(sql, /temporal_event_dependency_acyclic/u);
  assert.match(sql, /temporal_event_dependency_same_party/u);
  assert.match(sql, /party_temporal_event_lifecycle_valid/u);
  assert.match(sql, /party_remote_aggregate_lifecycle_valid/u);
  assert.match(sql, /party_propagation_process_lifecycle_valid/u);
  for (const column of ['recognition_policy_ref jsonb NOT NULL', 'visibility_policy_ref jsonb NOT NULL', 'canonical_digest text NOT NULL', 'signal_refs jsonb NOT NULL', 'knowledge_update_refs jsonb NOT NULL']) assert.match(sql, new RegExp(column, 'u'), column);
  assert.match(sql, /validated_at_whole_minutes numeric NOT NULL/u);
  assert.match(sql, /started_at_whole_minutes numeric NOT NULL/u);
  assert.match(sql, /termination_policy_ref jsonb NOT NULL/u);
  assert.match(sql, /aggregate_process_refs jsonb NOT NULL/u);
  assert.match(sql, /pending_incoming_effect_refs jsonb NOT NULL/u);
  assert.match(sql, /coarse_rule_versions jsonb NOT NULL/u);
  assert.match(sql, /temporal_append_only/u);
  assert.match(sql, /presentation_status text NOT NULL CHECK\(presentation_status IN \('pending'\)\)/u);
  assert.match(sql, /committed_state_version bigint NOT NULL CHECK\(committed_state_version >= 1\)/u);
  assert.match(sql, /status text NOT NULL CHECK\(status IN \('pending','in_progress','output_ready','delivered','failed_retryable'\)\)/u);
  for (const column of ['next_attempt_ordinal integer NOT NULL DEFAULT 0', 'active_attempt_id text', 'claim_token text', 'lease_expires_at timestamptz', 'narration_output jsonb', 'output_digest text', 'state_version bigint NOT NULL DEFAULT 1']) assert.match(sql, new RegExp(column, 'u'), column);
  assert.match(sql, /party_narration_job_lifecycle_valid/u);
  for (const constraint of [
    'party_npc_transition_event_party_fk',
    'party_perception_event_party_fk',
    'party_propagation_aggregate_party_fk',
    'party_narration_package_party_fk'
  ]) assert.match(sql, new RegExp(`ADD CONSTRAINT ${constraint}\\b`, 'u'), constraint);
  assert.match(sql, /OLD\.status IN \('pending','failed_retryable'\) AND NEW\.status='in_progress'/u);
  assert.match(sql, /OLD\.status='in_progress' AND NEW\.status IN \('output_ready','failed_retryable'\)/u);
  assert.match(sql, /OLD\.status='output_ready' AND NEW\.status='delivered'/u);
  assert.match(sql, /attempt_id text PRIMARY KEY/u);
  assert.match(sql, /UNIQUE\(job_id,attempt_ordinal\)/u);
  assert.match(sql, /outcome text NOT NULL CHECK\(outcome IN \('delivered','failed_retryable'\)\)/u);
  assert.match(sql, /started_at timestamptz NOT NULL DEFAULT now\(\)/u);
  assert.match(sql, /completed_at timestamptz NOT NULL DEFAULT now\(\)/u);
  assert.doesNotMatch(sql, /(?:scheduled_at|ended_at|next_boundary_at|last_processed_at)\s+timestamptz/iu);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS party_temporal_events_due_idx/u);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS party_propagation_processes_due_idx/u);
});

test('P11 target migration loader applies the complete ordered 001 through 015 chain', async () => {
  const source = await readFile(loaderPath, 'utf8');
  assert.match(source, /const files = \['001_party_runtime\.sql', '002_party_runtime_v3\.sql', '003_party_runtime_v3_planning\.sql', '004_party_runtime_v3_journeys\.sql', '005_party_runtime_v3_domain\.sql', '006_party_runtime_v3_migration\.sql', '007_party_runtime_temporal_world\.sql', '008_party_runtime_pr8_first_entry\.sql', '009_party_runtime_pr8_reaction_knowledge\.sql', '010_party_runtime_pr8_reaction_options\.sql', '011_party_runtime_first_playable\.sql', '012_party_runtime_external_ownership\.sql', '013_party_runtime_obligations\.sql', '014_party_runtime_activity_resume_terminal\.sql', '015_party_runtime_turn_step_items\.sql'\]/u);
});

test('P11 resume-terminal migration permits only one proven resumed attempt', async () => {
  const sql = await readFile(resumeTerminalMigrationPath, 'utf8');
  assert.match(sql, /OLD\.status='paused'[\s\S]*NEW\.status IN \('completed','failed'\)/u);
  assert.match(sql, /NEW\.state_version=OLD\.state_version\+2/u);
  assert.match(sql, /NEW\.next_attempt_ordinal=OLD\.next_attempt_ordinal\+1/u);
  assert.match(sql, /NEW\.terminal_change_set_id IS NOT NULL/u);
  assert.match(sql, /latest_attempt\.result_kind<>execution_row\.status/u);
  assert.match(sql, /latest_attempt\.result_change_set_id[\s\S]*execution_row\.terminal_change_set_id/u);
  assert.match(sql, /latest_attempt\.progress_after IS DISTINCT FROM execution_row\.progress/u);
  assert.match(sql, /terminal activity execution does not match its append-only attempt/u);
  assert.doesNotMatch(sql, /OLD\.status='paused'\s+AND NEW\.status IN \('completed','failed'\)\s*\)/u);
});
