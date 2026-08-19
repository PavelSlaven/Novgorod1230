import { ordinaryArmamentWeaponDanger } from '@rus/combat-health';

export function resolveTraceOrdinaryWeaponDanger(items, actorRef) {
  if (!Array.isArray(items)) return undefined;
  const snapshots = items.filter((item) => {
    const placement = item?.placement;
    return actorRef.entity_kind === 'player_character'
      ? placement?.holder_character_id === actorRef.entity_id
      : placement?.holder_npc_id === actorRef.entity_id;
  }).map((item) => ({ snapshot: item.weapon_mechanics_snapshot
    ?? item.state?.weapon_mechanics_snapshot,
  condition: item.state?.condition_state ?? item.condition_state }))
    .filter(({ snapshot }) => snapshot != null);
  if (snapshots.length === 0) return undefined;
  if (snapshots.length !== 1) return null;
  if (snapshots[0].snapshot.condition_state !== snapshots[0].condition) return null;
  const danger = ordinaryArmamentWeaponDanger(snapshots[0].snapshot);
  return danger == null || danger === 0 ? null : danger;
}
