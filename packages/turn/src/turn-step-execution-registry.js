import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import {
  TURN_STEP_DIRECT_OPERATIONS,
  TURN_STEP_DOMAIN_OPERATIONS
} from './turn-step-actor-step.js';

const DIRECT_OPS = new Set(TURN_STEP_DIRECT_OPERATIONS);
const DOMAIN_OPS = new Set(TURN_STEP_DOMAIN_OPERATIONS);
const executionRegistries = new WeakSet();

export function createTurnStepExecutionRegistry({
  direct = {},
  domain = {},
  applySemanticActivity = null,
  operationContract = {}
} = {}) {
  const directHandlers = handlers(direct, DIRECT_OPS, 'direct');
  const domainHandlers = handlers(domain, DOMAIN_OPS, 'domain');
  if (applySemanticActivity != null
      && typeof applySemanticActivity !== 'function') {
    throw new TypeError('applySemanticActivity must be a function.');
  }
  const contract = normalizeOperationContract(
    operationContract, directHandlers, domainHandlers
  );
  const registry = Object.freeze({
    direct(operation) {
      return directHandlers.get(operation?.op) ?? null;
    },
    domain(operation) {
      return domainHandlers.get(operation?.op) ?? null;
    },
    semanticActivity() {
      return applySemanticActivity;
    },
    operationContract() {
      return structuredClone(contract);
    }
  });
  executionRegistries.add(registry);
  return registry;
}

export function requireTurnStepExecutionRegistry(registry) {
  if (!executionRegistries.has(registry)) {
    throw turnFailure('TURN_STEP_EXECUTION_REGISTRY_INVALID',
      'Execution registry must be created by its factory.');
  }
  return registry;
}

function normalizeOperationContract(value, directHandlers, domainHandlers) {
  if (!plain(value)) {
    throw new TypeError('operationContract must be a JSON object.');
  }
  const output = {};
  for (const [operation, descriptor] of Object.entries(value)) {
    const registered = directHandlers.has(operation)
      || domainHandlers.has(operation);
    if (!registered || !plain(descriptor)) {
      throw new TypeError(
        `Operation contract requires a registered handler: ${operation}.`
      );
    }
    try {
      output[operation] = structuredClone(descriptor);
    } catch {
      throw new TypeError(
        `Operation contract descriptor must be cloneable: ${operation}.`
      );
    }
  }
  return deepFreeze(output);
}

function handlers(value, allowed, label) {
  const entries = value instanceof Map ? [...value.entries()]
    : Object.entries(value ?? {});
  const result = new Map();
  for (const [name, handler] of entries) {
    if (!allowed.has(name) || typeof handler !== 'function') {
      throw new TypeError(`Invalid ${label} step handler: ${name}.`);
    }
    result.set(name, handler);
  }
  return result;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object'
    && !Array.isArray(value);
}
