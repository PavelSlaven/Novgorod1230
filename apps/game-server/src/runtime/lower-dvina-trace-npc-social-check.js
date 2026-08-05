import { executeCheck } from '@rus/checks-rng';

export function createNpcSocialCheckResolver({ contracts, randomSourceFactory,
  partyId, requestId, idempotencyKey }) {
  const profile = contracts.npcSocialCheckProfile;
  return ({ request, boundary }) => executeCheck({
    check_id: `npc-social-check:${request.request_id}`,
    attribute_value: profile.attribute_value,
    skill_bonus: profile.skill_bonus,
    difficulty: profile.difficulty,
    state_modifier: profile.state_modifier,
    equipment_modifier: profile.equipment_modifier,
    circumstance_modifier: profile.circumstance_modifier
  }, randomSourceFactory({
    party_id: partyId,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    decision_boundary_id: boundary.boundary_id,
    check_profile_ref: profile.profile_id
  }));
}
