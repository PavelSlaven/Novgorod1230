import { createPartyStore } from '@rus/party-store';

export function createPartyStoreAdapter({
  transact,
  readPublicState,
  recordDeliveryAttempt = null,
  commitDeliveryAcknowledgement = null
} = {}) {
  if (typeof transact !== 'function') throw new TypeError('party transact function is required.');
  if (typeof readPublicState !== 'function') throw new TypeError('readPublicState function is required.');
  for (const [name, value] of Object.entries({ recordDeliveryAttempt, commitDeliveryAcknowledgement })) {
    if (value != null && typeof value !== 'function') throw new TypeError(`${name} must be a function when provided.`);
  }
  const partyStore = createPartyStore({ transact });
  return Object.freeze({
    partyStore,
    stateReader: Object.freeze({ read: (partyId) => readPublicState(partyId) }),
    deliveryStore: Object.freeze({
      recordAttempt: async (attempt) => recordDeliveryAttempt ? recordDeliveryAttempt(attempt) : attempt,
      commitAcknowledgement: async (result) => commitDeliveryAcknowledgement ? commitDeliveryAcknowledgement(result) : result
    })
  });
}
