import { PORTRAIT_SPEC_V1_ENUMS } from '../src/portrait-lab/contract.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

export const PORTRAIT_CONTROL_SHEET_SIZE = 24;

const CONTROL_OVERRIDES = Object.freeze([
  Object.freeze({
    'hair.length': 'long',
    'hair.style': 'loose',
    'hair.facial_hair': 'none',
    'clothing.outer': 'none',
    'clothing.headwear': 'none'
  }),
  Object.freeze({
    'hair.length': 'long',
    'hair.style': 'braided',
    'hair.facial_hair': 'none',
    'clothing.headwear': 'none'
  }),
  Object.freeze({
    'hair.length': 'long',
    'hair.style': 'braided',
    'clothing.headwear': 'headscarf'
  }),
  Object.freeze({
    'hair.length': 'long',
    'hair.style': 'loose',
    'clothing.headwear': 'linen_cap'
  }),
  Object.freeze({
    'person.sex': 'male',
    'hair.facial_hair': 'full_beard',
    'pose.body': 'three_quarter',
    'pose.head': 'slightly_turned',
    'clothing.headwear': 'none'
  }),
  Object.freeze({
    'person.age': 'old',
    'expression.emotion': 'surprised',
    'clothing.outer': 'cloak',
    'clothing.headwear': 'none'
  }),
  Object.freeze({
    'person.sex': 'male',
    'hair.facial_hair': 'moustache',
    'clothing.headwear': 'none'
  })
]);

export function buildPortraitControlSheetSpecs() {
  return Object.freeze(Array.from(
    { length: PORTRAIT_CONTROL_SHEET_SIZE },
    (_, caseIndex) => controlSpec(caseIndex)
  ));
}

function controlSpec(caseIndex) {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  let factorIndex = 0;
  for (const [group, fields] of Object.entries(PORTRAIT_SPEC_V1_ENUMS)) {
    if (group === 'background') {
      spec.background = selectedValue(fields, factorIndex, caseIndex);
      factorIndex += 1;
      continue;
    }
    for (const [field, values] of Object.entries(fields)) {
      spec[group][field] = selectedValue(values, factorIndex, caseIndex);
      factorIndex += 1;
    }
  }
  for (const [path, value] of Object.entries(
    CONTROL_OVERRIDES[caseIndex] ?? {}
  )) {
    const [group, field] = path.split('.');
    spec[group][field] = value;
  }
  makeControlSpecCompatible(spec);
  return spec;
}

function makeControlSpecCompatible(spec) {
  if (spec.person.sex === 'female') spec.hair.facial_hair = 'none';
  if (spec.hair.length === 'bald') spec.hair.style = 'straight';
}

function selectedValue(values, factorIndex, caseIndex) {
  const block = Math.floor(caseIndex / values.length);
  const position = caseIndex % values.length;
  const direction = (factorIndex + block) % 2 ? -1 : 1;
  const rotation = (factorIndex * 3 + block * 2) % values.length;
  const index = (
    rotation + direction * position + values.length
  ) % values.length;
  return values[index];
}
