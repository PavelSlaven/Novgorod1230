const HAIR_COLORS = Object.freeze({
  blond: 'русые', light_brown: 'светло-каштановые',
  dark_brown: 'тёмно-каштановые', black: 'чёрные', auburn: 'рыжие',
  gray: 'седые', white: 'белые'
});
const HAIR_STYLES = Object.freeze({
  straight: 'прямые', wavy: 'волнистые', loose: 'распущенные',
  braided: 'заплетённые'
});
const FACIAL_HAIR = Object.freeze({
  moustache: 'усы', short_beard: 'короткая борода',
  full_beard: 'густая борода'
});
const CLOTHING_COLORS = Object.freeze({
  undyed_linen: 'неокрашенная льняная', dark_blue: 'тёмно-синяя',
  forest_green: 'зелёная', madder_red: 'красная', ochre: 'охряная',
  brown: 'коричневая', charcoal: 'угольно-серая'
});
const CLOTHING_FABRICS = Object.freeze({
  light_linen: 'льна', wool: 'шерсти', coarse_wool: 'грубой шерсти',
  furred: 'меха'
});

export function playerSafeAppearanceSummary(npc) {
  const appearance = npc?.observable_cues?.identity?.appearance;
  const hair = appearance?.hair;
  const details = [];
  if (hair?.length === 'bald') {
    details.push('лысина');
  } else {
    const color = HAIR_COLORS[hair?.color];
    const style = HAIR_STYLES[hair?.style];
    const length = hair?.length === 'short' ? 'короткие'
      : hair?.length === 'long' ? 'длинные' : null;
    const hairDescription = [length, color, style, 'волосы']
      .filter(Boolean).join(' ');
    if (color != null || style != null || length != null) {
      details.push(hair?.length === 'medium'
        ? `${hairDescription} средней длины` : hairDescription);
    }
  }
  if (FACIAL_HAIR[hair?.facial_hair]) {
    details.push(FACIAL_HAIR[hair.facial_hair]);
  }
  const garment = (npc?.observable_cues?.equipment ?? []).find(({ visual_profile_snapshot: visual }) =>
    ['outer_garment', 'outer'].includes(visual?.equipment_slot))
    ?? npc?.observable_cues?.equipment?.[0];
  const garmentColor = CLOTHING_COLORS[
    garment?.visual_profile_snapshot?.main_visible_color];
  if (garmentColor != null) details.push(`${garmentColor} одежда`);
  const equipment = npc?.observable_cues?.equipment ?? [];
  for (const item of equipment) {
    const visual = item?.visual_profile_snapshot;
    const fabric = CLOTHING_FABRICS[visual?.visible_fabric];
    if (!fabric) continue;
    const slot = visual.equipment_slot ?? item.equipment_slot_category_id;
    const label = slot === 'base_garment' || slot === 'base'
      ? 'нижняя одежда' : slot === 'outer_garment' || slot === 'outer'
        ? 'верхняя одежда' : slot === 'headwear' ? 'головной убор'
          : 'видимая вещь';
    details.push(`${label} из ${fabric}`);
  }
  return details.length > 0 ? details.join(', ') : null;
}
