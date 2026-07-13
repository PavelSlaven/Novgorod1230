import {
  computeNarratorStartingProseDigest,
  computeVisibleContextPackageDigest,
  VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA
} from '@rus/contracts';
import {
  STAGE23_AUDIT_SCHEMA,
  STAGE23_REQUIRED_CHECKS,
  STAGE23_ROUTE_SCHEMA,
  buildStage23AuditInput
} from '@rus/new-game/stages/stage-23/compat';
import { buildStage22NarratorInput } from '@rus/new-game/stages/stage-22/compat';

export function makeStage22VisiblePackage() {
  return {
    version: 1,
    schema: 'visible_context_package',
    request_id: 'req-stage22-23',
    visible_context_status: 'formed',
    frame: {
      clock: { current_year: 1230, current_day_index: 4, current_minute_of_day: 420 },
      weather_state: { label: 'морозное утро', precipitation: 'none' },
      light_state: { label: 'серый рассвет' }
    },
    position: {
      region_id: 'region-novgorod',
      place_id: 'place-yard',
      location_id: 'location-gate',
      minilocation_id: 'mini-gate',
      anchor_id: 'anchor-gate'
    },
    narrator_scope: {
      perspective: 'second_person',
      tense: 'present',
      language: 'ru'
    },
    visible_scene_dossier: {
      must_include: [{ requirement_id: 'req-anchor', source_ref: 'anchor-gate' }],
      must_not_include: [{ requirement_id: 'req-hidden', source_ref: 'hidden-cellar' }]
    },
    visible_anchors: [
      { anchor_id: 'anchor-gate', label: 'ворота двора' },
      { anchor_id: 'anchor-yard', label: 'двор' }
    ],
    visible_exits: [
      { g5_edge_id: 'edge-yard', route_id: 'route-yard', from_anchor_id: 'anchor-gate', to_anchor_id: 'anchor-yard' }
    ],
    visible_npcs: [{ npc_instance_id: 'npc-watchman-1', label: 'сторож' }],
    visible_items: [{ item_instance_id: 'item-lantern-1', label: 'фонарь' }],
    visible_containers: [{ container_instance_id: 'container-chest-1', label: 'закрытый ларь' }],
    available_actions_context: [
      { action_id: 'action-look-gate', action_kind: 'inspect', target_ref: { anchor_id: 'anchor-gate' } },
      { action_id: 'action-ask-watchman', action_kind: 'ask', target_ref: { npc_instance_id: 'npc-watchman-1' } }
    ],
    visible_facts: [{ visible_fact_id: 'fact-frost', label: 'на воротах лежит иней' }]
  };
}

export function makeVisibleContextApproval(pkg = makeStage22VisiblePackage()) {
  return {
    version: 1,
    schema: VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA,
    request_id: pkg.request_id,
    pass: true,
    visible_context_package_digest: computeVisibleContextPackageDigest(pkg),
    commit_permission: {
      can_send_to_narrator: true,
      can_write_visible_context_snapshot: true,
      can_generate_player_facing_prose: true
    }
  };
}

export function makeStage22Input(mutator = null) {
  const pkg = makeStage22VisiblePackage();
  const values = {
    request_id: pkg.request_id,
    visible_context_package: pkg,
    visible_context_package_digest: computeVisibleContextPackageDigest(pkg),
    visible_context_approval: makeVisibleContextApproval(pkg),
    narrator_policy: {}
  };
  if (mutator) mutator(values, pkg);
  return buildStage22NarratorInput(values);
}

export function makeNarratorProse(overrides = {}) {
  return {
    version: 1,
    schema: 'narrator_starting_prose',
    request_id: 'req-stage22-23',
    prose_status: 'drafted',
    prose: 'Серый рассвет лежит на воротах двора. У створки стоит сторож, а на дереве серебрится иней.',
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
    used_visible_context_refs: ['anchor-gate', 'npc-watchman-1', 'fact-frost'],
    self_constraints_check: {
      used_only_visible_context: true,
      did_not_add_new_world_facts: true,
      did_not_reveal_hidden_state: true,
      preserved_time_weather_light: true,
      preserved_position: true,
      rumors_remain_rumors: true,
      uncertainty_remains_uncertain: true
    },
    ...overrides
  };
}

export function makeStage23Input(prose = makeNarratorProse(), mutator = null) {
  const pkg = makeStage22VisiblePackage();
  const values = {
    request_id: pkg.request_id,
    visible_context_package: pkg,
    visible_context_package_digest: computeVisibleContextPackageDigest(pkg),
    visible_context_approval: makeVisibleContextApproval(pkg),
    narrator_starting_prose: prose,
    narrator_starting_prose_digest: computeNarratorStartingProseDigest(prose),
    audit_policy: {}
  };
  if (mutator) mutator(values, pkg, prose);
  return buildStage23AuditInput(values);
}

export function makePassingNarratorAudit(input = makeStage23Input()) {
  return {
    version: 1,
    schema: STAGE23_AUDIT_SCHEMA,
    request_id: input.request_id,
    pass: true,
    checks: Object.fromEntries(STAGE23_REQUIRED_CHECKS.map((key) => [key, { pass: true }])),
    concerns: [],
    evidence: ['Проза и варианты действий опираются только на утверждённый видимый контекст.'],
    repair_route: null,
    commit_permission: {
      can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true
    }
  };
}

export function makeFailingNarratorAudit(input = makeStage23Input()) {
  const checks = Object.fromEntries(STAGE23_REQUIRED_CHECKS.map((key) => [key, { pass: true }]));
  checks.new_fact_check = { pass: false };
  return {
    version: 1,
    schema: STAGE23_AUDIT_SCHEMA,
    request_id: input.request_id,
    pass: false,
    checks,
    concerns: [{
      code: 'NARRATOR_PROSE_ADDED_FACT',
      severity: 'repairable',
      message: 'Проза добавила неутверждённый факт.'
    }],
    evidence: ['В тексте присутствует утверждение, отсутствующее в visible_context_package.'],
    repair_route: null,
    commit_permission: {
      can_show_to_player: false,
      can_write_player_visible_message: false,
      can_mark_opening_scene_presented: false
    }
  };
}

export function makeNarratorRepairRoute(input = makeStage23Input()) {
  return {
    version: 1,
    schema: STAGE23_ROUTE_SCHEMA,
    request_id: input.request_id,
    return_to_stage: 'narrator_prose_semantic_repair',
    repair_kind: 'semantic_rewrite',
    reason: 'Удалить добавленный факт и сохранить утверждённые видимые сведения.',
    supporting_concern_codes: ['NARRATOR_PROSE_ADDED_FACT']
  };
}
