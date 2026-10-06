export function createLowerDvinaTracePhase2StateReader({
  repository,
  partyId,
  idempotencyKey,
  state,
  projectCurrentScene,
  turnBudget = null
}) {
  return {
    async read(request) {
      const committedState = request.revalidation === true
          ? await repository.loadPhase2State(partyId, {
            presentationIdempotencyKey: idempotencyKey, turnBudget
          })
        : state;
      return projectCurrentScene(committedState);
    },
    async revalidate(_request, { transaction } = {}) {
      if (typeof repository.loadPhase2StateVersion === 'function') {
        return repository.loadPhase2StateVersion(partyId, {
          presentationIdempotencyKey: idempotencyKey, turnBudget,
          ...(transaction == null ? {} : { transaction })
        });
      }
      const committedState = await repository.loadPhase2State(partyId, {
        presentationIdempotencyKey: idempotencyKey, turnBudget,
        ...(transaction == null ? {} : { transaction })
      });
      return committedState.party_state?.state_version;
    }
  };
}
