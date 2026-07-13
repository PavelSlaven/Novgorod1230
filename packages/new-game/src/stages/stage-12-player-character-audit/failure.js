import { PLAYER_AUDIT_REQUIRED_CHECKS, STAGE12_OUTPUT_SCHEMA } from './constants.js';
import { buildStage12CodePrecheck } from './precheck.js';
import { concern } from './shared.js';

export function buildStage12FailedAuditFromPrecheck(input = {}) {
  const precheck = input.code_precheck ?? buildStage12CodePrecheck(input);
  return {
    version: 1,
    schema: STAGE12_OUTPUT_SCHEMA,
    request_id: input.request_id ?? null,
    pass: false,
    checks: buildFailedChecksFromPrecheck(precheck),
    concerns: precheck.concerns?.length ? precheck.concerns : [concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'Stage 12 code_precheck failed.', { severity: 'hard_block' })],
    evidence: precheck.evidence?.length ? precheck.evidence : ['code_precheck.pass=false'],
    repair_route: {
      return_to_stage: 'player_character_semantic_repair',
      repair_kind: 'fix_player_character_dossier_from_code_precheck'
    },
    commit_permission: {
      can_shape_game_profile: false,
      can_continue_to_g5_materialization: false,
      can_write_player_character_after_commit_gate: false
    }
  };
}

export function buildFailedChecksFromPrecheck(precheck = {}) {
  return Object.fromEntries(PLAYER_AUDIT_REQUIRED_CHECKS.map((key) => [key, { pass: precheck.pass === true }]));
}
