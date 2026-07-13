import { buildFirstScreenCodePrecheck } from '../input/validate-input.js';
import { STAGE26_SCREEN_SCHEMA } from '../policy/constants.js';
import { buildStage26ReferenceIndex, summarizeReferenceIndex } from '../references/reference-index.js';
import { requirePublicText, stage26Error } from '../shared/issues.js';
import { deepFreeze } from '../shared/utils.js';
import { buildApprovedActions, buildAttentionPanel, buildCharacterPanel, buildMapPanel, buildPositionPanel, buildTimePanel, resolveCommittedDeliveryState } from './panels.js';

export function buildFirstGameScreenProjection(input = {}) {
  const precheck = buildFirstScreenCodePrecheck(input);
  if (!precheck.pass) throw stage26Error('input_validation', precheck.concerns, 'Stage 26 input precheck failed.');
  const publicState = input.committed_public_read_model;
  const committed = input.party_start_committed;
  const narrator = input.approved_narrator_output;
  const index = buildStage26ReferenceIndex(input);
  const delivery = resolveCommittedDeliveryState(committed, publicState);
  const screen = {
    version: 1,
    schema: STAGE26_SCREEN_SCHEMA,
    request_id: input.request_id,
    screen_status: 'ready',
    party_id: committed.party_id,
    turn_number: committed.party_state.current_turn_number,
    main_prose: requirePublicText(narrator.prose, 'approved_narrator_output.prose'),
    position_panel: buildPositionPanel(publicState, committed),
    time_panel: buildTimePanel(publicState, committed),
    character_panel: buildCharacterPanel(publicState),
    attention_panel: buildAttentionPanel(publicState),
    action_panel: {
      suggested_actions: buildApprovedActions(narrator.action_options),
      free_text_input: {
        enabled: true,
        placeholder: 'Что ты делаешь?',
        input_contract: 'player_intent_not_world_fact'
      }
    },
    map_panel: buildMapPanel(publicState),
    ui_safety_boundary: {
      hidden_state_not_included: false,
      audit_not_included: false,
      source_trace_not_included: false,
      raw_ids_not_included: false,
      player_sees_only_character_safe_context: false
    },
    delivery_state: delivery,
    provenance: {
      stage25_postcommit_state_digest: input.stage25_party_commit_approval.postcommit_state_digest,
      committed_public_read_model_digest: input.stage25_party_commit_approval.party_public_state_digest,
      narrator_output_digest: input.narrator_output_digest,
      visible_context_package_digest: input.visible_context_package_digest,
      approved_reference_counts: summarizeReferenceIndex(index)
    }
  };
  return deepFreeze(screen);
}
