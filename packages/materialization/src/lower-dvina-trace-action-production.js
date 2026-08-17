import { canonicalDigest } from './core.js';
import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function actionProductionMechanicsProfiles(profile) {
  return [...profile.source_profiles, ...profile.tool_profiles]
    .map((entry) => ({
      template_id: entry.template_id,
      inventory_profile_id: entry.inventory_profile_id,
      mechanics: structuredClone(entry.mechanics),
      profile_ref: profile.profile_id,
      profile_version: String(profile.revision)
    }));
}

export function actionProductionMechanicsSnapshot(profile, templateId) {
  const matches = [
    ...(profile?.source_profiles ?? []), ...(profile?.tool_profiles ?? [])
  ].filter(({ template_id: id }) => id === templateId);
  if (matches.length !== 1) {
    fail('TRACE_ACTION_PRODUCTION_MECHANICS_PROFILE_INVALID',
      'Revision 21 requires one exact A1 mechanics profile per active item.');
  }
  return {
    schema: 'rus.items.action_production_committed_mechanics_snapshot.v1',
    profile_ref: profile.profile_id,
    profile_version: String(profile.revision),
    template_id: matches[0].template_id,
    inventory_profile_id: matches[0].inventory_profile_id,
    mechanics: structuredClone(matches[0].mechanics)
  };
}

export function buildActionProductionAuthority({ partyId, actorRef, profile }) {
  if (profile?.schema
      !== 'rus.lower_dvina_trace_action_production_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 1) {
    fail('TRACE_ACTION_PRODUCTION_PROFILE_INVALID',
      'Approved A1 profile is required for revision 21.');
  }
  const row = {
    party_id: partyId, actor_ref: actorRef,
    context_ref: profile.context_ref, profile_ref: profile.profile_id,
    profile_version: String(profile.revision), policy_ref: profile.policy_ref,
    policy_version: profile.policy_version,
    max_new_entities: profile.max_new_entities,
    allowed_access_states: structuredClone(profile.allowed_access_states),
    allowed_identity_modes: structuredClone(profile.allowed_identity_modes),
    allowed_origins: structuredClone(profile.allowed_origins),
    allowed_result_classes: structuredClone(profile.allowed_result_classes),
    authority_state_version: 1, status: 'committed'
  };
  return { ...row, authority_digest: `sha256:${canonicalDigest(row)}` };
}
