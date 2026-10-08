/** Initial party state exists only before a server session has been created. */
export function isInitialPartyState({ state_version, session_party_id } = {}) {
  return Number(state_version) === 0 && session_party_id === null;
}
