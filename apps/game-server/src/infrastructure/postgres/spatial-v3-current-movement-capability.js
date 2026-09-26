import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { serverError } from '../../errors.js';

const text = (value) => typeof value === 'string' && value.length > 0;

/** Read the committed body owner once in the caller's transaction. */
export async function readCurrentActorBodyCapability({ transaction, partyId, actorId,
  purpose = 'movement' } = {}) {
  const reason = purpose === 'perception' ? 'actor_perception_capability_owner_required'
    : 'movement_capability_policy_required';
  if (typeof transaction?.query !== 'function' || ![partyId, actorId].every(text)) gap(reason);
  const body = await transaction.query(`SELECT b.*
    FROM party_runtime.party_actor_body_states b
    JOIN party_runtime.party_player_characters pc
      ON pc.party_id=b.party_id AND pc.character_id=b.actor_id
    WHERE b.party_id=$1 AND b.actor_kind='player_character' AND b.actor_id=$2`,
  [partyId, actorId]);
  const row = body.rows[0];
  const version = Number(row?.state_version);
  if (body.rowCount !== 1 || !Number.isSafeInteger(version) || version < 1) gap(reason);
  const conditions = await transaction.query(`SELECT condition_id,status,state_version
    FROM party_runtime.party_actor_active_conditions
    WHERE party_id=$1 AND actor_kind='player_character' AND actor_id=$2
    ORDER BY condition_id`, [partyId, actorId]);
  if (conditions.rows.some((condition) => !text(condition.condition_id)
    || !Number.isSafeInteger(Number(condition.state_version)))) gap(reason);
  const combat = await transaction.query(`SELECT combat_id,state_version,participant_refs,
      participant_states FROM party_runtime.party_combat_sessions
    WHERE party_id=$1 AND status <> 'ended'`, [partyId]);
  const matches = combat.rows.filter((session) => session.participant_refs?.some((ref) =>
    ref.entity_kind === 'player_character' && ref.entity_id === actorId));
  if (matches.length > 1) gap(reason);
  const session = matches[0];
  const states = session?.participant_states?.filter((participant) =>
    participant.actor_ref?.entity_kind === 'player_character'
    && participant.actor_ref.entity_id === actorId) ?? [];
  if (session && (states.length !== 1 || !text(session.combat_id)
    || !Number.isSafeInteger(Number(session.state_version)))) gap(reason);
  const status = session ? states[0].combat_status : 'active';
  if (!['active', 'disengaging', 'restrained', 'surrendered', 'incapacitated', 'left']
    .includes(status)) gap(reason);
  const pins = [{ dependency_role: 'body_state',
    entity_ref: { entity_kind: 'party_actor_body_states', entity_id: `player_character:${actorId}` },
    version_pin: { pin_kind: 'party_state_version', state_version: version,
      authoring_version: null } }, ...conditions.rows.map((condition) => ({
    dependency_role: 'body_condition',
    entity_ref: { entity_kind: 'party_actor_active_conditions',
      entity_id: `player_character:${actorId}:${condition.condition_id}` },
    version_pin: { pin_kind: 'party_state_version',
      state_version: Number(condition.state_version), authoring_version: null } }))];
  if (session) pins.push({ dependency_role: 'combat_session',
    entity_ref: { entity_kind: 'party_combat_sessions', entity_id: session.combat_id },
    version_pin: { pin_kind: 'party_state_version',
      state_version: Number(session.state_version), authoring_version: null } });
  if (status === 'incapacitated') return { visual_capability: 'none',
    hearing_capability: 'none', allowed_movement_methods: [], body_state_version: version,
    dependency_pins: pins };
  if (conditions.rows.some((condition) => condition.status === 'active')
    && (purpose === 'perception' || status !== 'restrained')) gap(reason);
  return { visual_capability: 'clear', hearing_capability: 'clear',
    allowed_movement_methods: status === 'restrained' ? [] : ['movement.foot@1'],
    body_state_version: version, dependency_pins: pins };
}

/** Current actor body is the movement admission owner for action-cost site crossings. */
export function createSpatialV3CurrentMovementCapability({ pool } = {}) {
  if (!pool?.query) throw new TypeError('PostgreSQL pool is required.');
  async function assessMovementCapability({ transaction = pool, partyId, actorId } = {}) {
    const current = await readCurrentActorBodyCapability({ transaction, partyId, actorId });
    if (current.allowed_movement_methods.length === 0) {
      return { ok: false, actor_id: actorId, code: 'movement_actor_unavailable' };
    }
    const pins = current.dependency_pins;
    const capability_context = { cohort_membership_snapshot_pin: null, load_state_pin: null,
      root_carrier_attachment_pins: null,
      allowed_movement_methods: current.allowed_movement_methods,
      available_transport_pins: null, equipment_state_pins: null,
      legal_access_fact_pins: null, allowed_pace_modes: [],
      dependency_pins: { pins, canonical_digest: digest(pins).replace('sha256:', '') } };
    capability_context.canonical_digest = digest(capability_context);
    return { ok: true, actor_id: actorId, capability_context };
  }
  async function assessAvailability({ connection, connectionId, profile, conditionSetRef } = {}) {
    const id = connection?.id ?? connectionId;
    const ref = connection ? connection.availability_condition_set_ref : conditionSetRef;
    if (!text(id)) gap('site_traversal_availability_source_missing');
    if (ref != null || profile?.availability_condition_set_ref != null) {
      gap('availability_condition_set_owner_missing');
    }
    return { ok: true, connection_id: id, condition_set_ref: null };
  }
  return Object.freeze({ assessMovementCapability, assessAvailability });
}

function gap(reason) { throw serverError('SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP',
  'Current movement capability is required.', { status: 409, details: { reason } }); }
