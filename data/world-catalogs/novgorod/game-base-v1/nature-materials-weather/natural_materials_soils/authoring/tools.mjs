// Proposed access-tool refs used by natural materials. Canonical tool rows belong to the
// craft_tools_gear domain; these ids are proposals for reconciliation there.
export default [
  { id: 'tool:hands', name_ru: 'голыми руками', src: ['editorial'], conf: 'A', note: 'без инструмента' },
  { id: 'tool:axe', name_ru: 'топор', src: ['wk:claim:population-woodwork-axe'], conf: 'A', note: '' },
  { id: 'tool:knife', name_ru: 'нож', src: ['master_me'], conf: 'A', note: 'бытовой железный нож' },
  { id: 'tool:sickle', name_ru: 'серп', src: ['wk:claim:harvest-sickle-crops-grasses'], conf: 'A', note: '' },
  { id: 'tool:scythe', name_ru: 'коса', src: ['kolchin_1953'], conf: 'B', note: 'коса-горбуша/литовка: тип для 1230 уточнить в craft_tools_gear' },
  { id: 'tool:zastup_ironshod', name_ru: 'заступ (деревянная лопата с железной оковкой)', src: ['kolchin_1953'], conf: 'B', note: 'оковки лопат — в обзоре Колчина; страница не перечитана' },
  { id: 'tool:lever_pole', name_ru: 'вага, кол-рычаг', src: ['editorial'], conf: 'C', note: '' },
  { id: 'tool:wedges_and_hammer', name_ru: 'клинья и молот', src: ['editorial'], conf: 'C', note: 'для раскалывания плитняка' },
  { id: 'tool:iron_pick_or_crowbar', name_ru: 'кирка или железный лом', src: ['editorial'], conf: 'C', note: 'наличие типа в 1230 проверить в craft_tools_gear' },
  { id: 'tool:sledge_or_cart', name_ru: 'сани или телега', src: ['wk:claim:population-wood-sledge', 'wk:claim:population-wood-cart'], conf: 'A', note: '' },
  { id: 'tool:container_basket_or_box', name_ru: 'короб, корзина или мешок', src: ['wk:claim:household-bark-tues'], conf: 'B', note: '' },
  { id: 'tool:container_bucket_or_vessel', name_ru: 'ведро, кадь, горшок', src: ['master_me'], conf: 'A', note: '' },
  { id: 'tool:soaking_place', name_ru: 'место для вымачивания (вода)', src: ['wk:claim:place-adhesive-linden-bast-soaking-can-support-separation-and-flexible-handling'], conf: 'B', note: 'не инструмент, а условие процесса' },
];
