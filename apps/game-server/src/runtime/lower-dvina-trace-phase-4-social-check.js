import { serverError } from '../errors.js';

const PROFILE_ID = 'trace_ld_v1_npc_ratsha_social_delivery_check_v1';

export function resolveRatshaNpcSocialCheckProfile(conversationBindings) {
  if (conversationBindings === null) return null;
  const matches = (
    conversationBindings.npc_social_check_profiles ?? []
  ).filter(({ actor_ref: actorRef }) =>
    actorRef === 'ratsha_storehouse_helper'
  );
  const profile = matches.length === 1 ? matches[0] : null;
  if (profile?.profile_id !== PROFILE_ID
      || profile.attribute_ref !== 'influence'
      || profile.skill_ref !== 'communication'
      || profile.difficulty !== 13) {
    throw serverError(
      'TRACE_PHASE_4_APPROVED_CHAIN_INVALID',
      'The exact party-pinned Phase 4 chain is incomplete.',
      { status: 409 }
    );
  }
  return structuredClone(profile);
}
