import { validateStage11PlayerCharacterOutput } from '@rus/new-game/stages/stage-11';
import { buildStage12CodePrecheck } from '@rus/new-game/stages/stage-12';

export function validateLowerDvinaTracePlayerDossier(result, bundle, fail) {
  const dossier = result?.immediate?.player?.dossier;
  const regional = {
    social_context: { roles: [{ role_id: bundle.player_profile.role.id }] },
    occupation_context: { occupations: [{ occupation_id: bundle.player_profile.occupation_id }] }
  };
  const itemCandidates = {
    item_profile_candidates: [{ item_profile_id: 'trace_ld_v1_item_mikula_knife' }]
  };
  const common = {
    request_id: result?.request_identity?.idempotency_key,
    regional_context_package: regional,
    item_profile_candidate_set: itemCandidates,
    npc_candidate_set: {}
  };
  const stage11Concerns = validateStage11PlayerCharacterOutput(dossier, {
    version: 1,
    schema: 'player_character_generator_input',
    ...common,
    normalized_request: {},
    historical_frame: {
      region: { region_id: 'gn_nov_g1_xp017_yp026' },
      year: { value: 1230 }
    },
    selected_start_node: { selected_candidate_id: 'trace_ld_v1_loc_wreck_shore' },
    start_place_audit: { pass: true },
    character_generation_policy: { trace_player_profile_policy: bundle.approved_policy }
  });
  const stage12 = buildStage12CodePrecheck({
    ...common,
    player_character_dossier: dossier,
    audit_policy: { trace_player_profile_policy: bundle.approved_policy },
    start_place_audit: { pass: true }
  });
  if (stage11Concerns.length > 0 || stage12.pass !== true) {
    fail(
      'TRACE_PLAYER_PROFILE_SEMANTIC_VALIDATION_FAILED',
      'Approved player dossier failed Stage 11/12 validation.',
      { stage11Concerns, stage12 }
    );
  }
  return Object.freeze({ pass: true, stage11: { pass: true, concerns: [] }, stage12 });
}
