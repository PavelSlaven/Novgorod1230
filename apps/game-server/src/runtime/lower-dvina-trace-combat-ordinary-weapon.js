import { combatActionProducedWeaponProfile,
  ordinaryArmamentWeaponDanger,
  resolveActionProducedCombatWeaponClass } from '@rus/combat-health';

export function resolveTraceOrdinaryWeaponDanger(items, actorRef) {
  if (!Array.isArray(items)) return undefined;
  const snapshots = items.filter((item) => {
    const placement = item?.placement;
    return actorRef.entity_kind === 'player_character'
      ? placement?.holder_character_id === actorRef.entity_id
      : placement?.holder_npc_id === actorRef.entity_id;
  }).map((item) => {
    const snapshot = item.weapon_mechanics_snapshot
      ?? item.state?.weapon_mechanics_snapshot;
    if (snapshot != null) return { kind: 'ordinary', snapshot,
      condition: item.state?.condition_state ?? item.condition_state };
    const action = item.state?.action_production;
    return action?.output_class === 'weapon_capable'
      ? { kind: 'action_produced',
          qualitative_class: action.weapon_qualitative_class,
          condition: item.state?.condition_state ?? item.condition_state }
      : null;
  }).filter(Boolean);
  if (snapshots.length === 0) return undefined;
  if (snapshots.length !== 1) return null;
  const selected = snapshots[0];
  let danger;
  if (selected.kind === 'ordinary') {
    if (selected.snapshot.condition_state !== selected.condition) return null;
    danger = ordinaryArmamentWeaponDanger(selected.snapshot);
  } else {
    if (selected.condition !== 'serviceable') return null;
    try {
      const profile = combatActionProducedWeaponProfile();
      danger = resolveActionProducedCombatWeaponClass({
        classification: {
          schema: 'rus.combat.action_produced_weapon_classification.v1',
          qualitative_class: selected.qualitative_class
        }, profile, expected_profile_pin: {
          profile_ref: profile.profile_ref,
          profile_version: profile.profile_version,
          state_version: profile.state_version,
          catalog_digest: profile.catalog_digest
        }
      }).formal_mechanics.weapon_danger;
    } catch { return null; }
  }
  return danger == null || danger === 0 ? null : danger;
}
