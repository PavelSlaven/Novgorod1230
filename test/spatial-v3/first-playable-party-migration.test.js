import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPATIAL_V3_TARGET_MIGRATIONS
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const sql = readFileSync(
  new URL('../../schemas/party-db/011_party_runtime_first_playable.sql', import.meta.url),
  'utf8'
);
const externalOwnershipSql = readFileSync(
  new URL('../../schemas/party-db/012_party_runtime_external_ownership.sql', import.meta.url),
  'utf8'
);
const obligationsSql = readFileSync(
  new URL('../../schemas/party-db/013_party_runtime_obligations.sql', import.meta.url),
  'utf8'
);
const resumeTerminalSql = readFileSync(
  new URL('../../schemas/party-db/014_party_runtime_activity_resume_terminal.sql', import.meta.url),
  'utf8'
);
const turnStepItemsSql = readFileSync(
  new URL('../../schemas/party-db/015_party_runtime_turn_step_items.sql', import.meta.url),
  'utf8'
);
const npcSemanticConversationSql = readFileSync(
  new URL('../../schemas/party-db/016_party_runtime_npc_semantic_conversation.sql', import.meta.url),
  'utf8'
);
const conversationTranscriptSql = readFileSync(
  new URL('../../schemas/party-db/017_party_runtime_conversation_transcript.sql', import.meta.url),
  'utf8'
);
const phase7ContainerSql = readFileSync(
  new URL('../../schemas/party-db/018_party_runtime_phase7_container_state.sql', import.meta.url),
  'utf8'
);
const combatSessionSql = readFileSync(
  new URL('../../schemas/party-db/019_party_runtime_combat_sessions.sql', import.meta.url),
  'utf8'
);
const actorEquipmentSql = readFileSync(
  new URL('../../schemas/party-db/020_party_runtime_actor_equipment.sql', import.meta.url),
  'utf8'
);
const ordinaryMaterializationSql = readFileSync(
  new URL('../../schemas/party-db/021_party_runtime_ordinary_materialization.sql', import.meta.url),
  'utf8'
);
const ordinaryCommitSql = readFileSync(
  new URL('../../schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql', import.meta.url),
  'utf8'
);
const ordinaryEnablementSql = readFileSync(
  new URL('../../schemas/party-db/023_party_runtime_ordinary_materialization_enablement.sql', import.meta.url),
  'utf8'
);
const ordinaryWorldItemsSql = readFileSync(
  new URL('../../schemas/party-db/024_party_runtime_ordinary_world_items.sql', import.meta.url),
  'utf8'
);
const finiteResourceSql = readFileSync(
  new URL('../../schemas/party-db/025_party_runtime_finite_resource_transitions.sql', import.meta.url),
  'utf8'
);
const existingContainerOrdinarySql = readFileSync(
  new URL('../../schemas/party-db/026_party_runtime_existing_container_ordinary_contents.sql', import.meta.url),
  'utf8'
);
const actionProductionSql = readFileSync(
  new URL('../../schemas/party-db/027_party_runtime_action_production.sql', import.meta.url),
  'utf8'
);
test('target chain appends migrations 011 through 027 in exact order', () => {
  assert.equal(SPATIAL_V3_TARGET_MIGRATIONS.length, 27);
  assert.deepEqual(SPATIAL_V3_TARGET_MIGRATIONS.slice(-17), [sql,
    externalOwnershipSql, obligationsSql, resumeTerminalSql, turnStepItemsSql,
    npcSemanticConversationSql, conversationTranscriptSql, phase7ContainerSql,
    combatSessionSql, actorEquipmentSql, ordinaryMaterializationSql,
    ordinaryCommitSql, ordinaryEnablementSql, ordinaryWorldItemsSql,
    finiteResourceSql, existingContainerOrdinarySql, actionProductionSql]);
});

test('027 adds only A1 item versioning without parallel authority or ledger',
  () => {
  assert.doesNotMatch(actionProductionSql,
    /party_action_production_authorities/u);
  assert.doesNotMatch(actionProductionSql,
    /party_action_production_(?:commits|resource_transitions)/u);
  assert.match(actionProductionSql,
    /ALTER TABLE party_runtime\.party_items[\s\S]*state_version/u);
  assert.doesNotMatch(actionProductionSql,
    /ALTER TABLE party_runtime\.party_resource_node_decrements/u);
});

test('024 admits only the separate closed O1 v2 runtime snapshot', () => {
  assert.match(ordinaryWorldItemsSql,
    /ordinary_world_runtime_instance_mechanics_snapshot_valid/u);
  assert.match(ordinaryWorldItemsSql,
    /rus\.items\.runtime_instance_mechanics_snapshot\.v2/u);
  assert.match(ordinaryWorldItemsSql,
    /source_kind' <> 'ordinary_world_materialization'/u);
  assert.match(ordinaryWorldItemsSql,
    /runtime_instance_mechanics_snapshot_valid[\s\S]+OR party_runtime[\s\S]+ordinary_world_runtime_instance/u);
  assert.doesNotMatch(ordinaryWorldItemsSql, /^\s*(?:BEGIN|COMMIT)\s*;/imu);
});

test('019 keeps combat sessions in the target migration transaction', () => {
  assert.match(combatSessionSql,
    /CREATE TABLE IF NOT EXISTS party_runtime\.party_combat_sessions/u);
  assert.match(combatSessionSql, /combat_session_v1/u);
  assert.match(combatSessionSql, /last_change_set_id/u);
  assert.doesNotMatch(combatSessionSql, /^\s*(?:BEGIN|COMMIT)\s*;/imu);
});

test('017 delegates transaction ownership to the target migration runner', () => {
  assert.doesNotMatch(conversationTranscriptSql, /^\s*BEGIN\s*;/imu);
  assert.doesNotMatch(conversationTranscriptSql, /^\s*COMMIT\s*;/imu);
});

test('016 defines one NPC decision identity per same-time batch', () => {
  assert.match(npcSemanticConversationSql,
    /party_id,\s*npc_id,\s*\(same_time_batch_ref ->> 'entity_id'\)/u);
  assert.doesNotMatch(npcSemanticConversationSql,
    /party_npc_decision_traces_batch_npc_mode_key/u);
});

test('013 keeps general obligations in the P16 change-set transaction and history append-only', () => {
  for (const table of ['party_obligations', 'party_obligation_transitions']) {
    assert.match(obligationsSql, new RegExp(`CREATE TABLE IF NOT EXISTS party_runtime\\.${table}`, 'u'));
  }
  assert.match(obligationsSql, /policy_ref jsonb NOT NULL[\s\S]+policy_version text NOT NULL/u);
  assert.match(obligationsSql, /promisor_ref jsonb NOT NULL[\s\S]+beneficiary_ref jsonb NOT NULL/u);
  assert.match(obligationsSql, /witness_refs jsonb NOT NULL[\s\S]+scope_snapshot jsonb NOT NULL/u);
  assert.match(obligationsSql, /state_version bigint NOT NULL DEFAULT 1[\s\S]+last_change_set_id text NOT NULL/u);
  assert.match(obligationsSql, /transition_ordinal integer NOT NULL[\s\S]+from_state text[\s\S]+to_state text NOT NULL[\s\S]+transition_kind text NOT NULL/u);
  assert.match(obligationsSql, /causal_basis jsonb NOT NULL[\s\S]+witness_snapshot jsonb NOT NULL/u);
  assert.match(obligationsSql, /activity_execution_id text[\s\S]+check_resolution_id text[\s\S]+npc_decision_request_id text/u);
  assert.match(obligationsSql, /idempotency_record_id text[\s\S]+occurred_at_turn bigint NOT NULL/u);
  assert.match(obligationsSql, /game_timestamp_parts_valid\([\s\S]+occurred_at_whole_minutes/u);
  assert.match(obligationsSql, /REFERENCES party_runtime\.party_v3_change_sets\(party_id, id\)/u);
  assert.match(obligationsSql, /CREATE OR REPLACE TRIGGER party_obligation_transition_append_only[\s\S]+temporal_append_only\(\)/u);
  assert.match(obligationsSql, /CREATE OR REPLACE TRIGGER party_obligation_current_immutable/u);
  assert.doesNotMatch(obligationsSql, /lower_dvina|scenario_binding|fingerprint|_v2\b/u);
});

test('013 admits positioned NPC-held items while preserving placement targets and equipment rules', () => {
  assert.match(
    obligationsSql,
    /party_item_placements[\s\S]+physical_position IS NULL%holder_character_id IS NOT NULL/u
  );
  assert.match(
    obligationsSql,
    /ADD CONSTRAINT party_item_placements_holder_position_check CHECK \([\s\S]+physical_position IS NOT NULL[\s\S]+holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL/u
  );
  assert.match(
    obligationsSql,
    /DROP CONSTRAINT IF EXISTS party_item_placements_holder_position_check/u
  );
  assert.match(
    obligationsSql,
    /party_item_placements_holder_position_check[\s\S]+\);/u
  );
  assert.doesNotMatch(
    obligationsSql,
    /DROP CONSTRAINT.*party_item_placements.*(?:FOREIGN KEY|exactly_one)/u
  );
});

test('012 admits one structured external owner without weakening existing owners', () => {
  assert.match(
    externalOwnershipSql,
    /ADD COLUMN IF NOT EXISTS owner_external_ref JSONB/u
  );
  assert.match(
    externalOwnershipSql,
    /owner_npc_id IS NULL[\s\S]+owner_character_id IS NULL[\s\S]+owner_party[\s\S]+owner_external_ref IS NULL[\s\S]+= 1/u
  );
  assert.match(
    externalOwnershipSql,
    /jsonb_typeof\(owner_external_ref\) = 'object'/u
  );
  assert.match(externalOwnershipSql, /owner_external_ref->>'entity_kind'/u);
  assert.match(externalOwnershipSql, /owner_external_ref->>'entity_id'/u);
  assert.doesNotMatch(externalOwnershipSql, /DROP CONSTRAINT.*FOREIGN KEY/u);
});

test('011 extends the existing activity owner with strict standalone XOR', () => {
  assert.match(sql, /execution_scope IN \('route_step','standalone'\)/u);
  assert.match(sql, /activity_series_id/u);
  assert.match(sql, /activity_owner_ref/u);
  assert.match(sql, /originating_command_ref/u);
  assert.match(sql, /party_activity_series_one_nonterminal_uq/u);
  assert.doesNotMatch(sql, /CREATE TABLE party_runtime\.party_standalone/u);
  assert.match(sql, /ALTER TABLE party_runtime\.party_action_step_runs/u);
  assert.match(sql, /action_scope IN \('route_step','standalone'\)/u);
  assert.match(sql, /semantic_command_snapshot/u);
});

test('011 replaces legacy ResourceBinding identity and keeps unit registry explicit', () => {
  assert.match(sql, /'required_tool'/u);
  assert.match(sql, /'reserved_input'/u);
  assert.match(sql, /'consumable_input'/u);
  assert.match(sql, /'output_target'/u);
  assert.match(sql, /consumption_policy_ref/u);
  assert.match(sql, /state_version/u);
  assert.doesNotMatch(sql, /ADD COLUMN unit_id/u);
});

test('011 preserves transport controls without a placement cascade', () => {
  assert.match(
    sql,
    /DROP CONSTRAINT IF EXISTS party_entity_controls_party_id_entity_kind_entity_id_fkey/u
  );
  assert.match(sql, /transport_root_location_required/u);
  assert.match(sql, /transport_mooring_location_mismatch/u);
  assert.match(sql, /transport_transit_placement_forbidden/u);
});

test('011 reuses committed state for save and adds only evidence-backed projections', () => {
  assert.doesNotMatch(sql, /party_save_checkpoints/u);
  for (const table of [
    'party_actor_profile_bindings',
    'party_actor_body_states',
    'party_actor_active_conditions',
    'party_resource_nodes',
    'party_transports',
    'party_actor_relations',
    'party_check_resolutions',
    'party_actor_npc_interactions',
    'party_actor_npc_interaction_summaries'
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE party_runtime\\.${table}`, 'u'));
  }
});
