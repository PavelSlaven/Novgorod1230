export function projectTraceCombatWorkingState(state) {
  const working = structuredClone(state);
  delete working.last_turn;
  const actorStates = {
    [`player_character\0${state.actor_id}`]: {
      body_state: structuredClone(state.body_state) }
  };
  for (const npc of state.npcs ?? []) {
    actorStates[`npc\0${npc.instance_id}`] = { body_state: {
      health: Number(npc.machine_state?.body_condition?.health ?? 100),
      energy: null, satiety: null, active_conditions: [], body_parts: {},
      prose: null } };
  }
  return { ...working, actor_states: actorStates };
}
