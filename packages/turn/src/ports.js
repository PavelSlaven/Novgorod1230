import { turnFailure } from './errors.js';

const REQUIRED = Object.freeze({
  stateReader: 'read',
  visibleProjector: 'project',
  persistedVisibleReader: 'read',
  narrator: 'run',
  partyStore: 'commit'
});

export function validateTurnServices(services = {}) {
  const missing = [];
  for (const [name, method] of Object.entries(REQUIRED)) {
    if (!services?.[name] || typeof services[name][method] !== 'function') missing.push(`${name}.${method}`);
  }
  if (!services.commandRegistry) missing.push('commandRegistry');
  if (typeof services.semanticResolver !== 'function') {
    missing.push('semanticResolver');
  }
  if (typeof services.decisionSecret !== 'string'
      || typeof services.decisionExpiresAt !== 'string') {
    missing.push('boundedDecisionIdentity');
  }
  if (missing.length) {
    throw turnFailure('TURN_SERVICES_MISSING', `Missing turn services: ${missing.join(', ')}`, { missing });
  }
  return services;
}

export function requireRandomSource(services, checkRequests) {
  if (!Array.isArray(checkRequests) || checkRequests.length === 0) return null;
  if (!services.randomSource || typeof services.randomSource.next !== 'function') {
    throw turnFailure('TURN_RANDOM_SOURCE_REQUIRED', 'RandomSource.next is required for approved check requests.');
  }
  return services.randomSource;
}
