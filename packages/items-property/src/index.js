import { deepFreeze } from '@rus/kernel';
import { planApprovedItemZoneTransition } from './approved-item-zone-transition.js';
import { planApprovedItemVisibilityTransition } from
  './approved-item-visibility-transition.js';
import { planApplicableApprovedItemTransition } from
  './applicable-approved-item-transition.js';
import { ambientOrdinaryCommittedContextDigest, createAmbientOrdinaryPortionAdmission } from './ambient-ordinary-portion.js';
import { classifyExistingContainerContents } from './container-ordinary-eligibility.js';
import { buildExistingContainerOrdinarySeedRequest } from './container-ordinary-request.js';
import { validateOrdinaryContainerContentsMechanics } from './ordinary-container-contents-mechanics.js';
import { createActionProducedOutputAuthority,
  deriveActionProducedOutputProperty,
  validateActionProducedOutputAuthority } from
  './action-produced-output-authority.js';
import { ACTION_PRODUCED_OUTPUT_CLASSES,
  validateActionProducedOutputClass } from
  './action-produced-output-class.js';
import { actionProducedPhysicalFactTexts,
  mergeActionProducedPhysicalFacts } from
  './action-produced-output-semantics.js';
export { validateInventoryTopology, calculateInventoryMass, resolveInventoryLoad, calculateHandsState, resolveInventoryAccess, deriveInventoryZone, calculateContainerUsage, buildInventoryStackSignature, planInventoryTransfer } from './inventory.js';
export {
  ACTOR_ITEM_PHYSICAL_POSITIONS,
  planApprovedActorItemTransition
} from './approved-actor-item-transition.js';
export { planApprovedPropertyTransition } from './approved-property-transition.js';
export { InventoryArchetypeError, validateInventoryArchetypes, resolveInventoryProfile } from './inventory-archetypes.js';
export {
  createOrdinaryWorldRuntimeInstanceMechanicsSnapshot,
  createRuntimeInstanceMechanicsSnapshot,
  resolveInventoryMechanicsProfile
} from './runtime-instance-mechanics.js';
export {
  admitOrdinaryRuntimeFact,
  admitOrdinaryRuntimeResult,
  admitOrdinaryWorldMaterialization,
  resolveOrdinaryWorldPropertyPlacement,
  ordinaryWorldPropertyPlacementContextDigest
} from './ordinary-runtime-result.js';
export {
  applyRuntimeInventoryTransition,
  admitAuthoredItemPlacementTransition,
  applyRuntimeContainerAccess,
  authoredItemPlacementSourceProof,
  normalizeRuntimeItemPlacement,
  planRuntimeContainerAccess,
  projectRuntimeInventoryInstance
} from './runtime-item-transition.js';
export {
  runtimeItemContentsAreOpen,
  runtimeItemIsTerminal,
  runtimeItemRecordIsConcealed,
  runtimeItemStateValues
} from './runtime-item-visibility.js';
export { calculatePackingSlots } from './packing-slots.js';

const ACCESS = new Set(['immediate','quick','top_bag','deep_bag','contained','closed_container','not_carried','borrowed','held_for_others','restricted']);
const PLACEMENT = new Set(['held','equipped','carried','contained','property','borrowed','held_for_others']);

function normalizeItem(item = {}) {
  return deepFreeze({
    id: text(item.id) || null,
    profile_id: text(item.profile_id ?? item.profileId) || null,
    label: text(item.label ?? item.name ?? item.title) || null,
    type: text(item.type) || null,
    material: text(item.material) || null,
    condition: text(item.condition ?? item.state) || null,
    weight: finite(item.weight ?? item.mass),
    placement: normalizePlacement(item.placement),
    access: normalizeAccess(item.access),
    owner_id: text(item.owner_id ?? item.ownerId) || null,
    holder_id: text(item.holder_id ?? item.holderId) || null,
    container_id: text(item.container_id ?? item.containerId) || null,
    visibility: text(item.visibility) || null,
    discoverability: finite(item.discoverability),
    legal_status: text(item.legal_status ?? item.legalStatus) || null,
    marks: strings(item.marks),
    contents: Array.isArray(item.contents) ? item.contents.map(normalizeItem) : []
  });
}

function validateItem(item = {}) {
  const errors = [];
  const normalized = normalizeItem(item);
  if (!normalized.id) errors.push('item.id is required');
  if (!normalized.label) errors.push('item label is required');
  if (!normalized.type) errors.push('item.type is required');
  if (normalized.weight != null && normalized.weight < 0) errors.push('item.weight must be non-negative');
  if (normalized.access && !ACCESS.has(normalized.access)) errors.push('item.access is invalid');
  if (normalized.placement && !PLACEMENT.has(normalized.placement)) errors.push('item.placement is invalid');
  if (normalized.owner_id && normalized.holder_id && normalized.legal_status === 'owned' && !normalized.owner_id) errors.push('owned item requires owner');
  return { ok: errors.length === 0, errors };
}

export function physicalAccessTier(item = {}) {
  const placement = normalizePlacement(item.placement);
  const access = normalizeAccess(item.access);
  if (placement === 'property' || access === 'not_carried') return 'not_carried';
  if (access === 'closed_container') return 'closed_container';
  if (access === 'top_bag') return 'top_bag';
  if (['deep_bag','contained'].includes(access) || placement === 'contained') return 'deep_bag';
  if (placement === 'held' || access === 'immediate') return 'hands';
  return 'quick';
}

export function calculateCarriedWeight(actor = {}) {
  const groups = ['carried_items','equipment','weapons','armor','clothing','containers'];
  const seen = new Set();
  let total = 0;
  for (const group of groups) {
    for (const raw of Array.isArray(actor?.items?.[group]) ? actor.items[group] : []) {
      const item = normalizeItem(raw);
      if (item.id && seen.has(item.id)) continue;
      if (item.id) seen.add(item.id);
      total += item.weight ?? 0;
      total += item.contents.reduce((sum, child) => sum + (child.weight ?? 0), 0);
    }
  }
  return total;
}

export function resolveLoadCategory(actor = {}) {
  const explicit = text(actor?.items?.load_category).toLowerCase();
  if (explicit) return explicit;
  const weight = calculateCarriedWeight(actor);
  const strength = finite(actor?.attributes?.strength);
  if (strength == null) return null;
  if (strength <= 0) return weight > 0 ? 'overloaded' : 'light';
  if (weight <= strength * 2 * 1000) return 'light';
  if (weight <= strength * 4 * 1000) return 'moderate';
  if (weight <= strength * 6 * 1000) return 'heavy';
  return 'overloaded';
}

export function buildRecognitionRequest(actor = {}, item = {}, scene = {}) {
  const normalized = normalizeItem(item);
  const visible = item.visible !== false && !['hidden','secret','unknown'].includes(text(normalized.visibility).toLowerCase());
  const knows = normalized.owner_id && normalized.owner_id === text(actor.id)
    || knowledgeStrings(actor).some((entry) => normalized.label && entry.includes(normalized.label.toLowerCase()));
  let dc = 5;
  if (!visible) dc = 20;
  else if (normalized.discoverability != null && normalized.discoverability < 0.3) dc = 25;
  else if (/damaged|dirty|worn|изнош|гряз|повреж/iu.test(normalized.condition ?? '')) dc = 15;
  else if (normalized.marks.length) dc = 10;
  const obvious = visible && knows && dc <= 10;
  return deepFreeze({
    actor_id: text(actor.id) || null,
    item_id: normalized.id,
    obvious,
    check_required: !obvious,
    difficulty: dc,
    visible,
    scene_ref: text(scene.id) || null,
    reason: obvious ? 'marked_and_known' : (knows ? 'mark_requires_attention' : 'no_prior_knowledge')
  });
}

export function validatePropertyRelation(relation = {}) {
  const errors = [];
  if (!text(relation.item_id)) errors.push('property relation item_id is required');
  if (!text(relation.relation_type)) errors.push('property relation type is required');
  if (!text(relation.subject_id)) errors.push('property relation subject_id is required');
  return { ok: errors.length === 0, errors };
}

export {
  ambientOrdinaryCommittedContextDigest,
  ACTION_PRODUCED_OUTPUT_CLASSES,
  actionProducedPhysicalFactTexts,
  buildExistingContainerOrdinarySeedRequest,
  classifyExistingContainerContents,
  createActionProducedOutputAuthority,
  deriveActionProducedOutputProperty,
  validateOrdinaryContainerContentsMechanics,
  createAmbientOrdinaryPortionAdmission,
  normalizeItem,
  mergeActionProducedPhysicalFacts,
  planApplicableApprovedItemTransition,
  planApprovedItemVisibilityTransition,
  planApprovedItemZoneTransition,
  validateActionProducedOutputAuthority,
  validateActionProducedOutputClass,
  validateItem
};

function normalizePlacement(value) {
  const key = text(value).toLowerCase();
  const map = { hands:'held', hand:'held', in_hands:'held', body:'equipped', on_body:'equipped', belt:'equipped', bag:'contained', 'в руках':'held', 'за поясом':'equipped', 'на теле':'equipped', 'в мешке':'contained', 'в сумке':'contained' };
  return (map[key] ?? key) || null;
}
function normalizeAccess(value) {
  const key = text(value).toLowerCase();
  const map = { 'в верхнем мешке':'top_bag', 'глубоко в мешке':'deep_bag', 'в закрытом контейнере':'closed_container', 'не при персонаже':'not_carried', 'можно использовать сразу':'immediate', 'можно быстро достать':'quick' };
  return (map[key] ?? key) || null;
}
function knowledgeStrings(actor) { return [...(actor.knowledge ?? []), ...(actor.memory ?? [])].map((entry) => text(entry).toLowerCase()); }
function strings(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
