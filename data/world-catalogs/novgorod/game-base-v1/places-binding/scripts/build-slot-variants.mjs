import path from 'node:path';
import { GROUP, readCsv, writeJson } from './lib.mjs';

const P = (...parts) => path.join(GROUP, ...parts);
const candidates = readCsv(P('slots/slot_candidates.csv'));
const slots = new Map(readCsv(P('slots/materialization_slot_rules.csv')).map((row) => [row.slot_id, row]));
const buildings = new Map(readCsv(P('../buildings-interiors-containers/buildings/building_types.csv')).map((row) => [row.bt_id, row]));
const facet = (value = '', value_ref = '', route = 'no_source', evidence = '') => ({
  value, value_ref, source_refs: route === 'source_refs' ? evidence : '',
  rule_ref: route === 'rule_ref' ? evidence : '', no_source: route === 'no_source' ? 'not established for this candidate' : '',
  confidence: route === 'no_source' ? 'C' : 'B',
});

const variants = candidates.map((candidate, index) => {
  const [kind, id] = candidate.candidate_record_ref.split(':');
  const building = kind === 'building' ? buildings.get(id) : undefined;
  const material = building?.materials.split('|')[0];
  const size = building?.size_note || '';
  return {
    variant_id: `siv_${String(index + 1).padStart(3, '0')}`,
    slot_id: candidate.slot_id,
    candidate_record_ref: candidate.candidate_record_ref,
    weight: Number(candidate.weight),
    applicability: slots.get(candidate.slot_id)?.applicability || '',
    facets: {
      material: material ? facet('', material, 'source_refs', building.source_refs) : facet(),
      size: size ? facet(size, '', 'source_refs', building.source_refs) : facet(),
      condition: building ? facet(building.condition_states.split('|')[0], '', 'rule_ref', `building:${id}.condition_states`) : facet(),
      age: building ? facet(building.age_states.split('|')[0], '', 'rule_ref', `building:${id}.age_states`) : facet(),
    },
    status: 'candidate',
  };
});
writeJson(P('slots/slot_instance_variants.json'), variants);
console.log(`slot variants: ${variants.length}`);
