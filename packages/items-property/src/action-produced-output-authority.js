import { deepFreeze } from '@rus/kernel';
import { snapshotActionProducedBoundary as snapshot } from
  './action-produced-transition-boundary.js';

const PRESERVED_KEYS = ['schema', 'mode'];
const NEW_KEYS = [
  'schema', 'mode', 'canonical_identity_status', 'currency_status',
  'legal_tender_status', 'official_status', 'objective_truth_status',
  'knowledge_status'
];
const OWNERSHIP_KEYS = [
  'ownership_id', 'owner_npc_id', 'owner_character_id', 'owner_party',
  'controller_npc_id', 'controller_character_id', 'claim_state'
];

export function createActionProducedOutputAuthority(identityKind) {
  if (identityKind === 'preserved_source') {
    return deepFreeze({
      schema: 'rus.items.action_produced_output_authority.v1',
      mode: 'preserve_existing'
    });
  }
  if (identityKind !== 'independent_output') fail();
  return deepFreeze({
    schema: 'rus.items.action_produced_output_authority.v1',
    mode: 'new_non_authoritative',
    canonical_identity_status: 'absent',
    currency_status: 'not_currency',
    legal_tender_status: 'not_legal_tender',
    official_status: 'not_official',
    objective_truth_status: 'not_projected',
    knowledge_status: 'not_projected'
  });
}

export function validateActionProducedOutputAuthority(value, identityKind) {
  const authority = snapshot(value);
  if (identityKind === 'preserved_source') {
    return exact(authority, PRESERVED_KEYS)
      && authority.schema === 'rus.items.action_produced_output_authority.v1'
      && authority.mode === 'preserve_existing';
  }
  return identityKind === 'independent_output'
    && exact(authority, NEW_KEYS)
    && authority.schema === 'rus.items.action_produced_output_authority.v1'
    && authority.mode === 'new_non_authoritative'
    && authority.canonical_identity_status === 'absent'
    && authority.currency_status === 'not_currency'
    && authority.legal_tender_status === 'not_legal_tender'
    && authority.official_status === 'not_official'
    && authority.objective_truth_status === 'not_projected'
    && authority.knowledge_status === 'not_projected';
}

export function deriveActionProducedOutputProperty(ownershipValue,
  outputEntityRef, controllerCharacterRef = undefined) {
  const source = snapshot(ownershipValue);
  if (!exact(source, OWNERSHIP_KEYS) || !text(source.ownership_id)
      || !nullableText(source.owner_npc_id)
      || !nullableText(source.owner_character_id)
      || typeof source.owner_party !== 'boolean'
      || !nullableText(source.controller_npc_id)
      || !nullableText(source.controller_character_id)
      || !text(source.claim_state) || !text(outputEntityRef)
      || controllerCharacterRef !== undefined
        && !text(controllerCharacterRef)) fail();
  const ownership = {
    ...source,
    ownership_id: `ownership:${outputEntityRef}`,
    ...(controllerCharacterRef === undefined ? {} : {
      controller_npc_id: null,
      controller_character_id: controllerCharacterRef
    })
  };
  const propertyState = null;
  return deepFreeze({
    property_state: propertyState,
    ownership
  });
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function nullableText(value) { return value === null || text(value); }
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function fail() {
  throw Object.assign(
    new TypeError('ITEM_ACTION_PRODUCED_OUTPUT_AUTHORITY_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_OUTPUT_AUTHORITY_INVALID' });
}
