import { validateActorBaseAppearance } from '@rus/actors';
import {
  assertPortraitSpecV1,
  PORTRAIT_SPEC_V1_ENUMS
} from '@rus/contracts/portrait-spec-v1';
import { deepFreeze } from '@rus/kernel';

const AGE = Object.freeze({ young_adult: 'young', adult: 'adult', middle_aged: 'middle_aged', old: 'old' });
const SLOT = Object.freeze({ base_garment: 'base', base: 'base', outer_garment: 'outer', outer: 'outer', headwear: 'headwear' });

export function projectActorPortraitSpecV1({
  identity,
  visible_equipment: visibleEquipment = [],
  presentation = {}
} = {}) {
  if (!validateActorBaseAppearance(identity, { requireComplete: true }).ok || !Array.isArray(visibleEquipment)) return null;
  const slots = { base: [], outer: [], headwear: [] };
  for (const item of visibleEquipment) {
    if (!['worn', 'equipped'].includes(item?.physical_position ?? item?.placement?.physical_position)) continue;
    const snapshot = item?.visual_profile_snapshot ?? item?.state?.visual_profile_snapshot;
    if (!plain(snapshot)
      || snapshot.schema !== 'item_visual_profile_snapshot_v1'
      || snapshot.version !== 1) continue;
    const rawSlot = item?.equipment_slot_category_id ?? item?.placement?.equipment_slot_category_id ?? snapshot.equipment_slot;
    const slot = SLOT[rawSlot];
    if (!slot) continue;
    slots[slot].push(snapshot);
  }
  if (slots.base.length !== 1 || slots.outer.length > 1 || slots.headwear.length > 1) return null;

  const base = slots.base[0];
  const outer = slots.outer[0] ?? null;
  const headwear = slots.headwear[0] ?? null;
  const garment = outer ?? base;
  const mainColor = garment.main_visible_color;
  const spec = {
    schema: 'portrait_spec_v1',
    person: {
      sex: identity.sex_category,
      age: AGE[identity.age_category],
      build: identity.appearance.build,
      skin_tone: identity.appearance.skin_tone,
      face_shape: identity.appearance.face_shape
    },
    hair: {
      color: identity.appearance.hair.color,
      length: identity.appearance.hair.length,
      style: identity.appearance.hair.style,
      facial_hair: identity.appearance.hair.facial_hair
    },
    eyes: {
      color: identity.appearance.eyes.color,
      gaze: presentationValue(presentation.gaze, PORTRAIT_SPEC_V1_ENUMS.eyes.gaze, 'viewer')
    },
    expression: {
      emotion: presentationValue(presentation.emotion, PORTRAIT_SPEC_V1_ENUMS.expression.emotion, 'neutral'),
      intensity: presentationValue(presentation.intensity, PORTRAIT_SPEC_V1_ENUMS.expression.intensity, 'low')
    },
    clothing: {
      neckline: garment.neckline,
      sleeve: garment.sleeve_form,
      outer: outer?.outer_form ?? 'none',
      fabric: garment.visible_fabric,
      trim: garment.trim ?? 'none',
      main_color: mainColor,
      secondary_color: garment.secondary_visible_color ?? mainColor,
      headwear: headwear?.headwear_kind ?? 'none'
    },
    pose: {
      body: presentationValue(presentation.body_pose, PORTRAIT_SPEC_V1_ENUMS.pose.body, 'frontal'),
      head: presentationValue(presentation.head_pose, PORTRAIT_SPEC_V1_ENUMS.pose.head, 'straight')
    },
    background: presentationValue(presentation.background, PORTRAIT_SPEC_V1_ENUMS.background, 'neutral')
  };
  if (!requiredGarmentSemanticsPresent(spec.clothing)) return null;
  assertPortraitSpecV1(spec);
  return deepFreeze(spec);
}

function requiredGarmentSemanticsPresent(clothing) {
  return ['neckline', 'sleeve', 'outer', 'fabric', 'trim', 'main_color', 'secondary_color', 'headwear']
    .every((key) => typeof clothing[key] === 'string' && clothing[key].length > 0);
}

function presentationValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
