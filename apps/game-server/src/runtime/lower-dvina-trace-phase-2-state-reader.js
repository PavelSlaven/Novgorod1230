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
    async revalidate() {
      if (typeof repository.loadPhase2StateVersion === 'function') {
        return repository.loadPhase2StateVersion(partyId, {
          presentationIdempotencyKey: idempotencyKey, turnBudget
        });
      }
      const committedState = await repository.loadPhase2State(partyId, {
        presentationIdempotencyKey: idempotencyKey, turnBudget
      });
      return committedState.party_state?.state_version;
    }
  };
}
