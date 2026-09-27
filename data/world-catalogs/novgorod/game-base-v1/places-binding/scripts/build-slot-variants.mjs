import path from 'node:path';
import { GROUP, readCsv, writeJson } from './lib.mjs';

const P = (...parts) => path.join(GROUP, ...parts);
const candidates = readCsv(P('slots/slot_candidates.csv'));
const slots = new Map(readCsv(P('slots/materialization_slot_rules.csv')).map((row) => [row.slot_id, row]));
const buildings = new Map(readCsv(P('../buildings-interiors-containers/buildings/building_types.csv')).map((row) => [row.bt_id, row]));
const routes = new Map(readCsv(P('../transport-health-recreation/transport_travel/route_modes.csv')).map((row) => [row.route_template_id, row]));
const transport = new Map(readCsv(P('../transport-health-recreation/transport_travel/transport_entities.csv')).map((row) => [row.tr_id, row]));
const facet = (value = '', value_ref = '', route = 'no_source', evidence = '', gap = 'not established for this candidate') => ({
  value, value_ref, source_refs: route === 'source_refs' ? evidence : '',
  rule_ref: route === 'rule_ref' ? evidence : '', no_source: route === 'no_source' ? gap : '',
  confidence: route === 'no_source' || route === 'rule_ref' || evidence.startsWith('book:') ? 'C' : 'B',
});

const variants = candidates.map((candidate, index) => {
  const [kind, id] = candidate.candidate_record_ref.split(':');
  const building = kind === 'building' ? buildings.get(id) : undefined;
  const route = kind === 'route' ? routes.get(id) : undefined;
  const crossing = kind === 'transport' ? transport.get(id) : undefined;
  if (kind === 'transport' && !crossing) throw new Error(`missing transport ${id}`);
  const material = building?.materials || '';
  const size = building?.size_note || '';
  const arc = building?.source_refs.match(/matcult:ARC\d+/)?.[0];
  const dimensions = {
    bt_palisade_fence: ['городской пример: тын 2–2,5 м высотой, брёвна 13–18 см; частокол 2,5–2,6 м, жерди 14–16 см', 'book:622242 ¶1262|book:709382 ¶280|book:709382 ¶283'],
    bt_klet_ambar: ['городские примеры: клеть 4×4 м (ярус 1224 г.), амбар 4×4 м (усадьба XII в.); не норма для сельского слота', 'book:709382 ¶669|book:709382 ¶638'],
  }[id];
  const routeMaterial = route?.game_use_ru || '';
  return {
    variant_id: `siv_${String(index + 1).padStart(3, '0')}`,
    slot_id: candidate.slot_id,
    candidate_record_ref: candidate.candidate_record_ref,
    weight: Number(candidate.weight),
    applicability: slots.get(candidate.slot_id)?.applicability || '',
    facets: {
      material: material ? facet('', material, 'rule_ref', `building:${id}.materials`) : routeMaterial ? facet(routeMaterial, '', 'rule_ref', `route_modes.csv#${route.rm_id}.game_use_ru`) : facet('', '', 'no_source', '', crossing ? `${crossing.tr_id}: тип перевозного судна не указан` : 'тип перевозного судна не указан'),
      size: dimensions ? facet(dimensions[0], '', 'source_refs', dimensions[1]) : size && !size.startsWith('небольшой') ? facet(size, '', 'source_refs', building.source_refs.split('|').filter((ref) => /ARC0020|B028|S26|arhitekto/.test(ref)).join('|') || arc || '') : facet('', '', 'no_source', '', kind === 'building' ? 'размер для сельского экземпляра не установлен' : 'размер конкретного пути или судна не установлен'),
      condition: building && arc ? facet('возможны следы дыма, осадки, грязь и ремонт; состояние экземпляра не задано', '', 'source_refs', arc) : route ? facet('на зимнике возможны снежные заносы и полыньи (пример пути по Ильменю)', '', 'source_refs', 'book:694952 ¶140') : facet('', '', 'no_source', '', 'состояние конкретного экземпляра не установлено'),
      age: facet('', '', 'no_source', '', 'возраст конкретного экземпляра не установлен'),
    },
    status: 'candidate',
  };
});
writeJson(P('slots/slot_instance_variants.json'), variants);
console.log(`slot variants: ${variants.length}`);
