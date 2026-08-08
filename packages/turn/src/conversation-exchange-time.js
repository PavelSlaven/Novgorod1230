export function contributionSlices({
  total_minutes: total,
  contribution_slots: slots
}) {
  const quotient = Math.floor(total / slots);
  const remainder = total % slots;
  return Array.from({ length: slots }, (_, index) =>
    quotient + (index < remainder ? 1 : 0));
}

export function plannedNpcContributionMinutes({
  defaultMinutes,
  remainingBudgetMinutes,
  queuedBoundaries,
  plan,
  priorNpcDecisionCount,
  sameTimestamp = false
}) {
  if (sameTimestamp) return 0;
  const queuedKeys = new Set(queuedBoundaries.map(({ npc_ref: npcRef }) =>
    `${npcRef.entity_kind}\u0000${npcRef.entity_id}`));
  const terminal = ['leave_conversation', 'action_handoff', 'combat_handoff']
    .includes(plan.contribution_kind);
  if (terminal) {
    return Math.max(1, Math.min(defaultMinutes, remainingBudgetMinutes));
  }
  if (plan.contribution_kind === 'silence'
      && priorNpcDecisionCount > 0
      && remainingBudgetMinutes > 1) {
    return 1;
  }
  const queuedBoundaryCount = queuedKeys.size;
  const expectedRefs = plan.speech?.response_expectation?.kind === 'none'
    ? [] : plan.speech?.response_expectation?.target_refs ?? [];
  for (const reference of expectedRefs) {
    queuedKeys.add(`${reference.entity_kind}\u0000${reference.entity_id}`);
  }
  if (queuedKeys.size === 0) return remainingBudgetMinutes;
  if (queuedBoundaryCount === 0) return 1;
  const futureReserve = Math.min(
    queuedKeys.size,
    Math.max(0, remainingBudgetMinutes - 1)
  );
  return Math.max(1, Math.min(
    defaultMinutes,
    remainingBudgetMinutes - futureReserve
  ));
}
