import { STAGE26_SCREEN_APPROVAL_SCHEMA } from '../schema-names.js';

export function buildStage26ScreenApproval(result = {}) {
  const source = isObject(result) ? result : {};
  return deepFreeze({
    version: 1,
    schema: STAGE26_SCREEN_APPROVAL_SCHEMA,
    request_id: source.request_id ?? null,
    pass: source.pass === true,
    party_id: source.party_id ?? null,
    transaction_id: source.transaction_id ?? null,
    message_id: source.first_game_screen?.delivery_state?.message_id ?? null,
    screen_digest: source.screen_digest ?? null,
    postcommit_state_digest: source.postcommit_state_digest ?? null,
    permissions: clone(source.delivery_permission ?? {})
  });
}

function clone(value) { return value == null ? value : structuredClone(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
