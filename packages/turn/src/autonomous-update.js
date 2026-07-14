import { deepFreeze, sha256 } from '@rus/kernel';
import { TURN_ALLOWED_WRITE_TARGETS } from './contracts.js';

const registries = new WeakSet();
const autonomousUpdates = new WeakSet();

export function isCodeOwnedAutonomousUpdate(update) { return autonomousUpdates.has(update); }

export function createAutonomousUpdateRegistry(rules = []) {
  const byId = new Map();
  for (const rule of rules) {
    if (!rule?.rule_id || !rule.rule_version || !rule.policy_id || !rule.policy_version || byId.has(rule.rule_id) || typeof rule.applies !== 'function' || typeof rule.buildChangeSet !== 'function') throw new TypeError('Autonomous rule requires unique ID, rule/policy versions, applies and buildChangeSet code handlers.');
    byId.set(rule.rule_id, Object.freeze({ ...rule }));
  }
  const registry = Object.freeze({ eligible(state, trigger) { return [...byId.values()].filter((rule) => rule.applies(deepFreeze(structuredClone(state)), trigger) === true).sort((a, b) => a.rule_id.localeCompare(b.rule_id)); } });
  registries.add(registry);
  return registry;
}

export async function runAutonomousUpdates({ registry, partyId, baseState, stateVersion, trigger, catalogPins, commit }) {
  if (!registries.has(registry)) throw updateError('AUTONOMOUS_REGISTRY_INVALID', 'Autonomous update registry is not code-owned.');
  if (Number(baseState?.state_version) !== stateVersion) throw updateError('AUTONOMOUS_STATE_STALE', 'Autonomous update base state version is stale.');
  if (typeof commit !== 'function') throw new TypeError('Autonomous update commit callback is required.');
  validateCatalogPins(catalogPins);
  const scheduledFor = parseTriggerTime(trigger?.at);
  const results = [];
  let currentState = structuredClone(baseState);
  let currentVersion = stateVersion;
  for (const [ordinal, rule] of registry.eligible(baseState, trigger).entries()) {
    currentState.state_version = currentVersion;
    const versionPins = { rule_version: rule.rule_version, policy_id: rule.policy_id, policy_version: rule.policy_version, world_revision_id: catalogPins.world_revision_id, command_catalog_digest: catalogPins.command_catalog_digest, profile_bundle_digest: catalogPins.profile_bundle_digest };
    const inputBasis = { party_id: partyId, base_state: currentState, state_version: currentVersion, trigger, version_pins: versionPins, catalog_digest: catalogPins.catalog_digest };
    const inputDigest = sha256(inputBasis);
    const rawChangeSet = await rule.buildChangeSet(deepFreeze(structuredClone(inputBasis)));
    validateChangeSet(rawChangeSet, partyId, currentVersion, rule.rule_id);
    const idempotencyKey = `autonomous:${partyId}:${rule.rule_id}:${rule.rule_version}:${currentVersion}:${inputDigest}`;
    const sharedTrace = { input_basis: structuredClone(inputBasis), version_pins: versionPins, input_digest: inputDigest, catalog_digest: catalogPins.catalog_digest, trigger: structuredClone(trigger), rule_id: rule.rule_id, created_or_changed_refs: structuredClone(rawChangeSet.created_or_changed_refs) };
    const changeSet = deepFreeze({ ...structuredClone(rawChangeSet), idempotency_key: idempotencyKey, version_pins: versionPins, input_digest: inputDigest, catalog_digest: catalogPins.catalog_digest, trace: sharedTrace });
    const update = deepFreeze({ version: 2, schema: 'party_autonomous_update_v2', update_id: `update_${sha256([idempotencyKey, ordinal]).slice(0, 24)}`, party_id: partyId, rule_id: rule.rule_id, idempotency_key: idempotencyKey, scheduled_for: scheduledFor, base_state_version: currentVersion, result_state_version: changeSet.result_state_version, version_pins: versionPins, input_digest: inputDigest, catalog_digest: catalogPins.catalog_digest, created_or_changed_refs: structuredClone(changeSet.created_or_changed_refs), change_set: changeSet, validation_report: { pass: true }, trace: sharedTrace });
    autonomousUpdates.add(update);
    results.push(await commit(update));
    currentState = applyOperations(currentState, changeSet.operations);
    currentVersion = changeSet.result_state_version;
  }
  return deepFreeze(results);
}

function validateCatalogPins(value) {
  if (!value || typeof value.world_revision_id !== 'string' || !value.world_revision_id.trim() || ['catalog_digest', 'command_catalog_digest', 'profile_bundle_digest'].some((field) => !/^[a-f0-9]{64}$/u.test(String(value[field] ?? '')))) throw updateError('AUTONOMOUS_VERSION_PINS_INVALID', 'Autonomous update requires complete catalog/version pins and SHA-256 digests.');
}

function validateChangeSet(value, partyId, stateVersion, ruleId) {
  if (value?.version !== 2 || value?.schema !== 'party_change_set_v2' || value.party_id !== partyId || value.rule_id !== ruleId || value.base_state_version !== stateVersion || value.result_state_version !== stateVersion + 1 || typeof value.change_set_id !== 'string' || !value.change_set_id || !Array.isArray(value.operations) || value.operations.length === 0 || value.operations.some((operation) => !operation || typeof operation !== 'object' || Array.isArray(operation) || Object.keys(operation).some((key) => !['target', 'value'].includes(key)) || !TURN_ALLOWED_WRITE_TARGETS.includes(operation.target)) || !Array.isArray(value.created_or_changed_refs) || value.validation_report?.pass !== true || !value.trace || typeof value.trace !== 'object') throw updateError('AUTONOMOUS_CHANGE_SET_INVALID', 'Code autonomous handler returned an invalid or unbound change set.');
}
function applyOperations(state, operations) { const next = structuredClone(state); for (const operation of operations) next[operation.target] = structuredClone(operation.value); return next; }
function parseTriggerTime(value) { const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN; if (!Number.isFinite(parsed)) throw updateError('AUTONOMOUS_TRIGGER_TIME_INVALID', 'Autonomous trigger.at must be an RFC3339 timestamp.'); return new Date(parsed).toISOString(); }
function updateError(code, message) { return Object.assign(new Error(message), { code }); }
