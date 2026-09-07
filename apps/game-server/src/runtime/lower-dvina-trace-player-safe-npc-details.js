import { validateActorBaseAppearance } from '@rus/actors';
import { PORTRAIT_SPEC_V1_ENUMS } from '@rus/contracts';
import { runtimeItemRecordIsConcealed } from '@rus/items-property';
import { validateNpcOrdinarySemanticRemainder } from '@rus/npc-runtime';
import { plain } from './lower-dvina-trace-player-safe-json.js';

export function projectLowerDvinaTraceVisibleNpcDetails({
  visibleContext, projectedNpcs, committedNpcs, committedItems
}) {
  if (!Array.isArray(projectedNpcs)) return [];
  const labels = Array.isArray(visibleContext?.visible_npc)
    ? visibleContext.visible_npc : [];
  return projectedNpcs.map((npc) => {
    const ids = [npc?.instance_id, npc?.actor_id, npc?.npc_id].filter(Boolean);
    const publicNames = labels.filter((visibleNpc) =>
      visibleNpc?.entity_ref?.entity_kind === 'npc'
        && ids.includes(visibleNpc.entity_ref.entity_id)
        && typeof visibleNpc.display_label === 'string'
        && visibleNpc.display_label.trim())
      .map(({ display_label: displayLabel }) => displayLabel.trim());
    if (publicNames.length !== 1) return null;
    const committedMatches = (committedNpcs ?? []).filter((candidate) =>
      ids.some((id) => [candidate?.instance_id, candidate?.actor_id,
        candidate?.npc_id].includes(id)));
    const committed = committedMatches.length === 1 ? committedMatches[0] : null;
    return {
      instance_id: npc.instance_id,
      actor_id: npc.actor_id,
      npc_id: npc.npc_id,
      identity_state: safeConversationIdentity(
        committed?.identity_state, publicNames[0]),
      visible_equipment: safeConversationEquipment(committedItems, ids),
      presentation: safeConversationPresentation(
        committed?.player_safe_presentation),
      ordinary_remainder: safeOrdinaryRemainder(
        committed?.semantic_state?.n1_remainder)
    };
  }).filter(Boolean);
}

function safeOrdinaryRemainder(value) {
  if (!validateNpcOrdinarySemanticRemainder(value)) return null;
  return {
    ordinary_descriptor: value.ordinary_descriptor,
    ordinary_activity: value.ordinary_activity
  };
}

function safeConversationIdentity(value, displayName) {
  if (!validateActorBaseAppearance(value, { requireComplete: true }).ok) {
    return { display_name: displayName };
  }
  return {
    display_name: displayName,
    sex_category: safeText(value?.sex_category),
    age_category: value?.age_category === 'young_adult'
      ? 'young' : safeText(value?.age_category),
    appearance: {
      build: safeText(value?.appearance?.build),
      skin_tone: safeText(value?.appearance?.skin_tone),
      face_shape: safeText(value?.appearance?.face_shape),
      hair: {
        color: safeText(value?.appearance?.hair?.color),
        length: safeText(value?.appearance?.hair?.length),
        style: safeText(value?.appearance?.hair?.style),
        facial_hair: safeText(value?.appearance?.hair?.facial_hair)
      },
      eyes: { color: safeText(value?.appearance?.eyes?.color) }
    }
  };
}

function safeConversationEquipment(items, npcIds) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const placement = plain(item?.placement) ? item.placement : item;
    return npcIds.includes(placement?.holder_npc_id)
      && ['worn', 'equipped'].includes(placement?.physical_position)
      && !runtimeItemRecordIsConcealed(item, { includeAccess: false });
  }).map((item) => {
    const placement = plain(item.placement) ? item.placement : item;
    const snapshot = item?.state?.visual_profile_snapshot
      ?? item?.visual_profile_snapshot;
    return {
      physical_position: placement.physical_position,
      equipment_slot_category_id: placement.equipment_slot_category_id,
      visual_profile_snapshot: safeVisualProfile(snapshot)
    };
  }).filter((item) => item.visual_profile_snapshot !== null);
}

export function safeVisualProfile(value) {
  if (!plain(value)
      || value.schema !== 'item_visual_profile_snapshot_v1'
      || value.version !== 1
      || !['base_garment', 'base', 'outer_garment', 'outer',
        'headwear'].includes(value.equipment_slot)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.neckline.includes(value.neckline)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.sleeve.includes(value.sleeve_form)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.outer.includes(value.outer_form)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.fabric.includes(value.visible_fabric)
      || !['none', null].includes(value.trim)
        && !PORTRAIT_SPEC_V1_ENUMS.clothing.trim.includes(value.trim)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.main_color.includes(
        value.main_visible_color)
      || value.secondary_visible_color != null
        && !PORTRAIT_SPEC_V1_ENUMS.clothing.secondary_color.includes(
          value.secondary_visible_color)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.headwear.includes(
        value.headwear_kind)) return null;
  return {
    schema: safeText(value.schema), version: Number(value.version),
    equipment_slot: safeText(value.equipment_slot),
    neckline: safeText(value.neckline),
    sleeve_form: safeText(value.sleeve_form),
    outer_form: safeText(value.outer_form),
    visible_fabric: safeText(value.visible_fabric),
    trim: safeText(value.trim),
    main_visible_color: safeText(value.main_visible_color),
    secondary_visible_color: safeText(value.secondary_visible_color),
    headwear_kind: safeText(value.headwear_kind)
  };
}

function safeConversationPresentation(value) {
  if (!plain(value)) return {};
  const allowed = {
    emotion: PORTRAIT_SPEC_V1_ENUMS.expression.emotion,
    intensity: PORTRAIT_SPEC_V1_ENUMS.expression.intensity,
    gaze: PORTRAIT_SPEC_V1_ENUMS.eyes.gaze,
    body_pose: PORTRAIT_SPEC_V1_ENUMS.pose.body,
    head_pose: PORTRAIT_SPEC_V1_ENUMS.pose.head,
    background: PORTRAIT_SPEC_V1_ENUMS.background
  };
  return Object.fromEntries(Object.entries(allowed).flatMap(([key, values]) => {
    const candidate = safeText(value[key]);
    return candidate !== null && values.includes(candidate)
      ? [[key, candidate]] : [];
  }));
}

function safeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
