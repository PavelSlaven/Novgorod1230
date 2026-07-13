import { computeStage25Digest } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import {
  buildNarratorProseApproval,
  buildStage26Input,
  computeStage26Digest,
  STAGE26_ACTION_AUDIT_SCHEMA,
  STAGE26_SAFETY_AUDIT_SCHEMA
} from '../src/world/new-game-pipeline/stages/stage26-first-game-screen.js';
import { computeNarratorStartingProseDigest } from '../src/world/new-game-pipeline/stages/stage23-narrator-prose-audit.js';
import { computeVisibleContextPackageDigest } from '../src/world/new-game-pipeline/stages/visible-context-digest.js';

export function makeStage26Artifacts() {
  const requestId = 'req-stage26';
  const partyId = 'party-stage26';
  const transactionId = 'tx-stage26';
  const currentPosition = {
    region_id: 'region-novgorod',
    place_id: 'place-gate',
    location_id: 'location-yard',
    minilocation_id: 'minilocation-gate',
    anchor_id: 'anchor-gate',
    last_route_id: null
  };
  const currentClock = {
    current_year: 1230,
    current_season: 'winter',
    current_day_index: 4,
    current_minute_of_day: 420
  };
  const partyStartCommitted = {
    version: 1,
    schema: 'party_start_committed',
    request_id: requestId,
    commit_status: 'committed',
    party_id: partyId,
    transaction_id: transactionId,
    party_state: {
      status: 'ready',
      is_ready_for_player: true,
      current_phase: 'awaiting_player_input',
      current_turn_number: 0,
      opening_scene_presented: false
    },
    current_position: currentPosition,
    current_clock: currentClock,
    player_output_ref: {
      narrator_output_id: 'message-opening-001',
      player_visible_message_ready: true,
      opening_scene_presented: false
    }
  };
  const publicState = {
    version: 1,
    schema: 'party_public_state',
    request_id: requestId,
    party_id: partyId,
    transaction_id: transactionId,
    current_turn_number: 0,
    current_position_ref: currentPosition,
    current_clock_ref: currentClock,
    read_model_source: 'live_postcommit_readback',
    public_position_label: 'У ворот двора',
    public_time_label: 'Раннее зимнее утро',
    public_light_label: 'Серый рассвет',
    public_weather_label: 'Морозный воздух',
    public_character_label: 'Путник',
    public_body_state_summary: ['Ты озяб.'],
    public_inventory_summary: ['За плечами дорожная сумка.'],
    public_warning_badges: ['Холод'],
    public_visible_npcs: [
      { npc_instance_id: 'npc-watchman-1', label: 'Сторож у ворот', certainty: 'visible' }
    ],
    public_visible_items: [
      { item_instance_id: 'item-lantern-1', label: 'Погасший фонарь', certainty: 'visible' }
    ],
    public_visible_containers: [
      { container_instance_id: 'container-chest-1', label: 'Закрытый ларь', certainty: 'visible' }
    ],
    public_visible_exits: [
      { exit_id: 'exit-dark-passage', label: 'Тёмный проход', certainty: 'uncertain' }
    ],
    public_visible_cues: [
      { cue_id: 'cue-footsteps', label: 'За стеной слышны шаги', certainty: 'audible' }
    ],
    public_context_hints: [
      { source_ref: 'hint-cold', label: 'На открытом месте быстро мёрзнут руки', certainty: 'known' }
    ],
    public_attention_targets: [
      { source_ref: 'hint-cold', label: 'Холод усиливается' }
    ],
    public_action_targets: [
      { target_ref: { anchor_id: 'anchor-gate' } },
      { target_ref: { npc_instance_id: 'npc-watchman-1' } },
      { target_ref: { item_instance_id: 'item-lantern-1' } },
      { target_ref: { container_instance_id: 'container-chest-1' } }
    ],
    public_known_routes: [
      { route_id: 'exit-dark-passage', label: 'Неизвестный проход' }
    ],
    public_visible_map: {
      known_current_node: { node_ref: 'anchor-gate', label: 'Ворота двора', certainty: 'known' },
      known_nearby_nodes: [{ node_ref: 'anchor-yard', label: 'Двор', certainty: 'known' }],
      unknown_exits: [{ exit_ref: 'exit-dark-passage', label: 'Тёмный проход', certainty: 'uncertain', destination_unknown: true }]
    }
  };
  const narrator = {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: requestId,
    narrator_output_id: 'message-opening-001',
    prose_status: 'drafted',
    prose: 'Серый рассвет едва обозначает ворота двора. Рядом стоит сторож, а тёмный проход уходит за стену.',
    action_options: [
      {
        option_id: 'option-look-gate',
        label: 'Осмотреть ворота',
        action_kind: 'inspect',
        basis: 'visible',
        risk_hint: 'low',
        target_ref: { anchor_id: 'anchor-gate' },
        must_not_reveal_hidden_truth: true
      },
      {
        option_id: 'option-ask-watchman',
        label: 'Заговорить со сторожем',
        action_kind: 'ask',
        basis: 'visible',
        risk_hint: 'low',
        target_ref: { npc_instance_id: 'npc-watchman-1' },
        must_not_reveal_hidden_truth: true
      }
    ],
    used_visible_context_refs: ['anchor-gate', 'npc-watchman-1', 'exit-dark-passage'],
    self_constraints_check: {
      no_new_world_facts: true,
      no_hidden_state_leak: true,
      no_private_motive_claims: true,
      no_closed_container_contents: true,
      no_future_event_claims: true
    }
  };
  const visible = {
    version: 1,
    schema: 'visible_context_package',
    request_id: requestId,
    visible_context_status: 'formed',
    visible_anchors: [{ anchor_id: 'anchor-gate' }, { anchor_id: 'anchor-yard' }],
    visible_exits: [{ exit_id: 'exit-dark-passage', route_id: 'exit-dark-passage' }],
    visible_npcs: [{ npc_instance_id: 'npc-watchman-1' }],
    visible_items: [{ item_instance_id: 'item-lantern-1' }],
    visible_containers: [{ container_instance_id: 'container-chest-1' }],
    audible_context: [{ cue_id: 'cue-footsteps' }],
    available_actions_context: [
      { action_id: 'action-look-gate', action_kind: 'inspect', target_ref: { anchor_id: 'anchor-gate' } },
      { action_id: 'action-ask-watchman', action_kind: 'ask', target_ref: { npc_instance_id: 'npc-watchman-1' } }
    ]
  };
  const narratorDigest = computeNarratorStartingProseDigest(narrator);
  const visibleDigest = computeVisibleContextPackageDigest(visible);
  const stage25Approval = {
    version: 1,
    schema: 'stage25_party_commit_approval',
    request_id: requestId,
    pass: true,
    commit_status: 'committed',
    party_id: partyId,
    transaction_id: transactionId,
    physical_plan_digest: computeStage25Digest({ physical: true }),
    postcommit_state_digest: computeStage25Digest({ postcommit: true, party_public_state: publicState }),
    party_start_committed_digest: computeStage25Digest(partyStartCommitted),
    party_public_state_digest: computeStage25Digest(publicState),
    permissions: {
      can_start_stage_26: true,
      can_show_player_output: true,
      can_accept_player_input: true
    }
  };
  const narratorApproval = {
    version: 1,
    schema: 'narrator_prose_audit_approval',
    request_id: requestId,
    pass: true,
    narrator_output_digest: narratorDigest,
    visible_context_package_digest: visibleDigest,
    repair_route: null,
    permissions: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  };
  const visibleApproval = {
    version: 1,
    schema: 'visible_context_audit_approval',
    request_id: requestId,
    pass: true,
    visible_context_package_digest: visibleDigest,
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
  return { requestId, partyId, transactionId, currentPosition, currentClock, partyStartCommitted, publicState, narrator, visible, narratorDigest, visibleDigest, stage25Approval, narratorApproval, visibleApproval };
}

export function makeStage26Input(mutator = null) {
  const a = makeStage26Artifacts();
  const values = {
    request_id: a.requestId,
    stage25_party_commit_approval: a.stage25Approval,
    party_start_committed: a.partyStartCommitted,
    committed_public_read_model: a.publicState,
    approved_narrator_output: a.narrator,
    narrator_output_digest: a.narratorDigest,
    narrator_prose_approval: a.narratorApproval,
    approved_visible_context: a.visible,
    visible_context_package_digest: a.visibleDigest,
    visible_context_approval: a.visibleApproval,
    screen_policy: {}
  };
  if (mutator) mutator(values, a);
  return buildStage26Input(values);
}

export function makeSafetyAudit(screen, input, pass = true, concerns = []) {
  const checks = Object.fromEntries([
    'no_new_world_facts', 'hidden_state_absent', 'private_motives_absent',
    'closed_container_truth_absent', 'future_events_absent', 'unknown_route_destination_absent',
    'position_time_consistent', 'technical_text_absent', 'screen_grounded_in_approved_data'
  ].map((key) => [key, { pass }]));
  return {
    version: 1,
    schema: STAGE26_SAFETY_AUDIT_SCHEMA,
    request_id: input.request_id,
    screen_digest: typeof screen === 'string' ? screen : computeStage26Digest(screen),
    pass,
    checks,
    concerns,
    evidence: pass ? ['Screen is grounded in approved committed data.'] : ['Unsafe label requires repair.'],
    commit_permission: {
      can_show_to_player: pass,
      can_accept_first_turn: pass
    }
  };
}

export function makeActionAudit(screen, input, pass = true, concerns = []) {
  const checks = Object.fromEntries([
    'attention_labels_grounded', 'action_labels_grounded', 'no_hidden_truth',
    'no_outcome_promises', 'no_created_targets', 'no_unknown_destination', 'uncertainty_preserved'
  ].map((key) => [key, { pass }]));
  return {
    version: 1,
    schema: STAGE26_ACTION_AUDIT_SCHEMA,
    request_id: input.request_id,
    screen_digest: typeof screen === 'string' ? screen : computeStage26Digest(screen),
    pass,
    checks,
    concerns,
    evidence: pass ? ['Action and attention labels are safe.'] : ['Unsafe action label requires repair.']
  };
}
