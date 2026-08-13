import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

const COMPLETION_LABELS = Object.freeze({
  trace_ld_v1_completion_full:
    'Расследование доведено до полного подтверждённого итога.',
  trace_ld_v1_completion_partial:
    'Временное решение принято, но часть обстоятельств остаётся открытой.',
  trace_ld_v1_completion_case_open:
    'Дело остаётся открытым: подтверждённых оснований для окончательного итога недостаточно.'
});
const DIMENSION_LABELS = Object.freeze({
  onisim_fate: 'судьба Онисима',
  packet_state: 'состояние свёртка',
  seal_state: 'состояние печати',
  wreck_cause_resolution: 'причина крушения',
  ratsha_participation_resolution: 'участие Ратши',
  principal_resolution: 'роль Жданко',
  principal_presence: 'местонахождение Жданко',
  promise_state: 'состояние обещания',
  temporary_disposition_state: 'временное решение'
});
const VALUE_LABELS = Object.freeze({
  found_alive: 'Онисим найден живым', returned: 'свёрток возвращён',
  lost_or_destroyed: 'свёрток утрачен или уничтожен',
  intact: 'печать цела', damaged: 'печать повреждена',
  established: 'обстоятельство доказано',
  zhdanko_established: 'роль Жданко доказана',
  partially_corroborated: 'роль Жданко подтверждена лишь частично',
  held_or_present: 'Жданко остаётся под временным контролем группы',
  fled: 'Жданко скрылся', fulfilled: 'обещание исполнено',
  broken: 'обещание нарушено', active: 'обещание остаётся действующим',
  not_active_or_unresolved: 'состояние обещания не установлено',
  committed_typed_disposition: 'временное решение зафиксировано',
  missing: 'временное решение отсутствует'
});

export function phase10VisibleEnvelope({ partyId, state, nextVersion,
  changeSetId, idemId, contracts, terminalProjection }) {
  const payload = phase10VisiblePayload(terminalProjection);
  const pins = contracts.pins.map((pin) => ({
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'source_record', entity_id: pin.key },
    version_pin: { pin_kind: 'authoring_version',
      authoring_version: String(pin.revision), state_version: null }
  }));
  return { package_id: `visible:${partyId}:trace-phase10:${nextVersion}`,
    party_id: partyId,
    turn_id: `turn:${partyId}:${state.party_state.turn_number}`,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: { entity_ref: {
      entity_kind: 'visibility_modifier',
      entity_id: 'lower_dvina_phase10_terminal_visible_v1' },
    authoring_version: '1' }, dependency_pins: { pins,
      canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId };
}

export function phase10VisiblePayload(projection) {
  const primary = COMPLETION_LABELS[projection.visible_completion_state];
  if (!primary) throw new Error('TRACE_PHASE_10_VISIBLE_STATE_INVALID');
  const resolved = projection.visible_completion_dimensions.filter(
    ({ value_id: value }) => value !== 'unresolved');
  const unresolved = projection.visible_completion_dimensions.filter(
    ({ value_id: value }) => value === 'unresolved');
  return { schema: 'temporal_visible_package.v1',
    perceived_scene: primary,
    perceived_changes: resolved.map(({ dimension_id: dimension,
      value_id: value }) => `${DIMENSION_LABELS[dimension]}: ${
      VALUE_LABELS[value] ?? value}.`),
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [
      'Итог вычислен только из уже совершившихся и сохранённых фактов.',
      'Это локальный итог расследования; мир и его жители продолжают существовать.'
    ],
    uncertainties: unresolved.map(({ dimension_id: dimension }) =>
      `${DIMENSION_LABELS[dimension]} остаётся неустановленным.`),
    hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
}

export function nextPhase10State({ state, outcome, envelope, changeSetId }) {
  const next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  const sourceVersion = state.party_state.state_version;
  next.party_state = { ...next.party_state,
    state_version: sourceVersion + 1,
    session_state_version: state.party_state.session_state_version + 1 };
  next.completion = { status: 'committed', outcome: structuredClone(outcome),
    source_commit_version: sourceVersion, change_set_id: changeSetId };
  next.last_turn.visible_package = { package_id: envelope.package_id,
    package_digest: envelope.package_digest, change_set_id: changeSetId };
  return next;
}

export function phase10PendingScreen({ state, envelope, nextVersion }) {
  const visible = phase2VisibleContextFromPayload(envelope.visible_payload);
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1', party_id: state.party_id,
    turn_id: envelope.turn_id, turn_number: state.party_state.turn_number,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: { committed_state_version: nextVersion,
      package_id: envelope.package_id, package_digest: envelope.package_digest,
      narration_output_digest: null }, visible_context: visible,
    main_prose: visible.visible_scene };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase10Writes({ partyId, next, envelope, screen,
  changeSetId, idemId }) {
  return { inserts: [row('party_state_snapshots',
    `${partyId}:${next.party_state.state_version}`, { party_id: partyId,
      state_version: next.party_state.state_version, state_payload: next,
      state_digest: canonicalDigest(next) })],
  updates: [row('parties', partyId, { party_id: partyId, status: 'active' }),
    row('party_server_sessions', partyId, { party_id: partyId,
      turn_number: next.party_state.turn_number,
      last_turn_id: envelope.turn_id, screen,
      updated_change_set_id: changeSetId })],
  appends: [row('party_v3_change_sets', changeSetId, { id: changeSetId,
    party_id: partyId, operation_kind: 'trace_phase_10_completion',
    idempotency_record_id: idemId })], deletes: [] };
}
