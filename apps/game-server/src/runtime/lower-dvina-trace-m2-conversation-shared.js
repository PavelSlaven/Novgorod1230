import { canonicalDigest } from '@rus/materialization';
import { buildSocialDeliveryResult } from '@rus/npc-runtime';

export const PLAYER_OPERATION = 'speak_exact_utterance';
export const PROMISE_OPERATION = 'offer_conditional_protection';
export const ROUTE_OPERATION = 'disclose_known_route';
export const SURRENDER_OPERATION = 'commit_surrender';
export const BARGAIN_OPERATION = 'state_bargain';
export const LIE_OPERATION = 'state_known_falsehood';

const CHECK_DELIVERY = Object.freeze({
  clean_success: Object.freeze({
    quality: 'compelling', cue: 'delivery_compelling'
  }),
  success: Object.freeze({
    quality: 'credible', cue: 'delivery_credible'
  }),
  success_with_cost: Object.freeze({
    quality: 'credible_with_visible_cost',
    cue: 'delivery_credible_with_visible_cost'
  }),
  failure_with_consequence: Object.freeze({
    quality: 'unconvincing', cue: 'delivery_unconvincing'
  }),
  severe_failure: Object.freeze({
    quality: 'transparently_manipulative',
    cue: 'delivery_transparently_manipulative'
  })
});

export function deliveryResult(checkResult, phase, partyId, turnNumber) {
  if (checkResult === null) return null;
  const band = checkResult?.outcome?.band;
  const delivery = CHECK_DELIVERY[band];
  if (!delivery) {
    fail(
      'TRACE_M2_CHECK_RESULT_INVALID',
      'The code-owned check must have one exact five-band outcome.'
    );
  }
  return buildSocialDeliveryResult({
    schema: 'social_delivery_result_v1',
    check_resolution_id: `check:${partyId}:trace-${phase.replace('_', '')}:${
      turnNumber}`,
    outcome_band: band,
    delivery_quality: delivery.quality,
    observable_effects: [delivery.cue]
  });
}

export function requireCommonInput({
  state,
  contracts,
  playerInput,
  inputDigest,
  playerConversationModel,
  npcSemanticModel,
  revalidateStateVersion
}) {
  if (!plainRecord(state) || !plainRecord(contracts)
      || !plainRecord(playerInput)
      || typeof inputDigest !== 'string'
      || !/^[a-f0-9]{64}$/u.test(inputDigest)
      || typeof playerConversationModel !== 'function'
      || typeof npcSemanticModel !== 'function'
      || typeof revalidateStateVersion !== 'function'
      || contracts.conversationBindings?.fallback_policy !== 'forbidden'
      || contracts.conversationBindings?.legacy_bounded_production_path
        !== 'forbidden'
      || contracts.conversationBindings?.max_contributions_per_exchange
        !== 8) {
    fail(
      'TRACE_M2_CONVERSATION_INPUT_INVALID',
      'The exact M2 conversation inputs and semantic ports are required.'
    );
  }
}

export function requiredRawText(playerInput) {
  const value = playerInput.raw_text;
  if (typeof value !== 'string' || !value.trim()) {
    fail(
      'TRACE_M2_PLAYER_UTTERANCE_REQUIRED',
      'An exact non-empty player utterance is required.'
    );
  }
  return value;
}

export function sameTimeBatchKey(partyId, clock) {
  return `conversation-batch:${canonicalDigest({
    schema: 'rus.lower_dvina_trace_conversation_batch_identity.v1',
    party_id: partyId,
    exact_game_timestamp: clock
  }).slice(0, 32)}`;
}

export function canonicalActors(actors) {
  const byId = new Map();
  for (const actor of actors ?? []) {
    if (actor?.instance_id) byId.set(actor.instance_id, actor);
  }
  return [...byId.values()].sort((left, right) =>
    left.instance_id.localeCompare(right.instance_id, 'en'));
}

export function exactTimestamp(value) {
  return plainRecord(value)
    && typeof value.whole_minutes === 'string'
    && typeof value.subminute_numerator === 'string'
    && typeof value.subminute_denominator === 'string';
}

export function exactKeys(value, keys) {
  return plainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

export function npcRef(entityId) {
  return ref('npc', entityId);
}

export function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

export function isEntityRef(value) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && typeof value.entity_kind === 'string'
    && value.entity_kind.trim().length > 0
    && typeof value.entity_id === 'string'
    && value.entity_id.trim().length > 0;
}

export function refKey(reference) {
  return `${reference?.entity_kind}\u0000${reference?.entity_id}`;
}

export function compareRefs(left, right) {
  const leftKey = refKey(left);
  const rightKey = refKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

export function freezeResult(value) {
  return Object.freeze(structuredClone(value));
}

export function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
