import { serverError } from '../errors.js';

const REQUIRED_PORTS = Object.freeze({
  travelContextReader: 'read',
  travelRulesBundleReader: 'read',
  environmentBundleReader: 'read',
  journeyRepository: 'read',
  environmentRepository: 'read',
  routeGraphReader: 'read',
  clock: 'read',
  randomSourceFactory: 'create',
  partyStore: 'commit'
});

export function validateTravelRuntimePorts(ports) {
  if (!plain(ports)) {
    throw serverError('TRAVEL_RUNTIME_PORTS_INVALID', 'Production travel ports must be an object.', { status: 500 });
  }
  const missing = [];
  for (const [name, method] of Object.entries(REQUIRED_PORTS)) {
    if (typeof ports[name]?.[method] !== 'function') missing.push(`${name}.${method}`);
  }
  if (missing.length) {
    throw serverError('TRAVEL_RUNTIME_PORTS_INVALID', `Missing production travel ports: ${missing.join(', ')}.`, {
      status: 500,
      details: Object.freeze({ missing: Object.freeze(missing) })
    });
  }
  return Object.freeze({ ...ports });
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
