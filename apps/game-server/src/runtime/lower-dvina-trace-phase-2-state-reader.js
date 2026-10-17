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
      const projected = projectCurrentScene(committedState);
      // Current-scene projection consumes this read-time baseline to refresh
      // presentation, but a direct observation still needs it to distinguish
      // newly perceived facts from the opening the player already saw.
      const priorPerceivedContext = committedState?.prior_perceived_visible_context;
      return priorPerceivedContext == null ? projected : {
        ...projected,
        prior_perceived_visible_context: priorPerceivedContext
      };
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
