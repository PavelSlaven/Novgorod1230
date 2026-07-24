import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootArgumentIndex = process.argv.indexOf('--documents-root');
const documentsRoot = rootArgumentIndex === -1
  ? 'data/knowledge-source/corpus/DOCUMENTS'
  : process.argv[rootArgumentIndex + 1];
if (!documentsRoot) throw new Error('--documents-root requires a directory');
const declarationArgumentIndex = process.argv.indexOf('--declaration');
const declarationPath = declarationArgumentIndex === -1
  ? 'docs/migration/spatial-v3/evidence/p02-boundary-declaration.json'
  : process.argv[declarationArgumentIndex + 1];
if (!declarationPath) throw new Error('--declaration requires a file');
const schemaArgumentIndex = process.argv.indexOf('--schema');
const schemaPath = schemaArgumentIndex === -1
  ? 'data/contracts/spatial-v3/p02-boundary-declaration.schema.json'
  : process.argv[schemaArgumentIndex + 1];
if (!schemaPath) throw new Error('--schema requires a file');
const trustedSchemaSha256 = '38c334b8d0997f22245aa711343dfe9a689f29878b2813ffbaef86bae00ad8cc';
const activeTrustAnchors = {
  architecture: '7f46bbb187356eb31920b7fa2f915a866f3923dde6d1f5538bd523a5683161dc',
  requirements: '0428d1c62a5431911480b7ea67bac136b2362b7253c388c9b48bb33cf55c71bf',
  graph: '6da82a0545c1f428e9dce85aafd058ad6fe75baa693243fac98e2753863906ca',
  workflow: '965e569be0f123fda0c882ce195bd387c9942cf1e92b8a59da1f7cbe7286dcb2'
};

const documentPairs = {
  architecture: {
    active: 'code_driven_world_materialization_architecture.md',
    target: 'spatial_v3_target_code_driven_world_materialization_architecture.md',
    required: [
      /canonical\s+G0[–-]G5/i,
      /finite\s+party-generated\s+G5/i,
      /scene_position_node/i,
      /preparation/i,
      /proposals?\/reports?/i,
      /commit component/i,
      /hard block/i,
      /candidate set/i
    ]
  },
  requirements: {
    active: 'world_base_materialization_table_requirements.md',
    target: 'spatial_v3_target_world_base_materialization_table_requirements.md',
    required: [
      /world_base[\s\S]*read-only canonical authoring store/i,
      /party_runtime[\s\S]*mutable party store/i,
      /нормализован/i,
      /route topology/i,
      /scene templates/i,
      /expansion profiles?\/capacities/i,
      /controlled vocabularies/i,
      /Import order/i,
      /readiness/i,
      /логический table-purpose contract/i,
      /физические имена/i
    ]
  },
  graph: {
    active: 'read_only_database_and_graph_architecture.md',
    target: 'spatial_v3_target_read_only_database_and_graph_architecture.md',
    required: [
      /Single-source matrix/i,
      /runtime-read-only/i,
      /bare IDs/i,
      /exact versioned refs/i,
      /layout-derived topology/i,
      /Physical segment имеет одного factual owner/i,
      /Save\/load[\s\S]*pinned records/i
    ]
  },
  workflow: {
    active: 'map_g0_g4_workflow.txt',
    target: 'spatial_v3_target_map_g0_g4_workflow.txt',
    required: [
      /Масштабы и причинность/i,
      /Историческая опора/i,
      /G4 sector and expansion scope/i,
      /G5 local location\/complex/i,
      /canonical G5 inventory/i,
      /explicit directed site\/route topology/i,
      /directional/i,
      /exits?/i,
      /G7\/G8/i,
      /Containment и coordinates не заменяют edge/i,
      /readiness/i
    ]
  }
};

const unsafeAssertionPolicies = [
  {
    name: 'pre-P28 dual write',
    unsafe: [
      /\bdual write\b.{0,40}\b(?:is |are )?(?:enabled|allowed|permitted|supported|active|used)\b/i,
      /\b(?:enabled|allowed|permitted|supported|use)\b.{0,40}\bdual write\b/i,
      /\bproduction writes? (?:each|every) change to both v2 and v3 stores?\b/i,
      /\bwrite(?:s|ing)?\b.{0,50}\bboth v2 and v3 (?:stores?|databases?|schemas?)\b/i,
      /двойн[а-яё]* запис[а-яё]*.{0,40}(?:разреш|допуска|включ|актив|использ)/i,
      /(?:разреш|допуска|включ|актив|использ).{0,40}двойн[а-яё]* запис[а-яё]*/i,
      /(?:кажд[а-яё]* изменен[а-яё]*).{0,50}(?:одновременно|сразу).{0,30}\bv2\b.{0,20}\bv3\b/i
    ],
    safe: [
      /\bdual write\b.{0,30}\b(?:is |are )?(?:not enabled|not allowed|not permitted|disabled|forbidden|prohibited)\b/i,
      /\b(?:no|without)\b.{0,120}\bdual write\b/i,
      /двойн[а-яё]* запис[а-яё]*.{0,30}(?:запрещ|не разреш|не допуска|отключ)/i
    ]
  },
  {
    name: 'mixed execution/read authority',
    unsafe: [
      /\bmixed (?:execution|reads?|read authority|authoritative reads?)\b.{0,40}\b(?:enabled|allowed|permitted|supported|authoritative)\b/i,
      /\b(?:enabled|allowed|permitted|supported)\b.{0,40}\bmixed (?:execution|reads?|authority)\b/i,
      /смешан[а-яё]* (?:исполн|чтен|авторитет|authority)[а-яё]*.{0,40}(?:разреш|допуска|включ|поддерж)/i,
      /(?:разреш|допуска|включ|поддерж).{0,40}смешан[а-яё]* (?:исполн|чтен|авторитет|authority)/i
    ],
    safe: [
      /\bmixed (?:execution|reads?|authority)\b.{0,30}\b(?:not allowed|forbidden|prohibited|disabled)\b/i,
      /\b(?:no|without)\b.{0,140}\bmixed (?:execution|reads?|authority|fallback)\b/i,
      /смешан[а-яё]* (?:исполн|чтен|авторитет)[а-яё]*.{0,30}(?:запрещ|не разреш|не допуска)/i
    ]
  },
  {
    name: 'v3 fallback to v2',
    unsafe: [
      /\b(?:the )?v3 path\b.{0,30}\bfalls? back to v2\b/i,
      /\bv3\b.{0,40}\b(?:fallback|falls? back|may revert|can revert)\b.{0,30}\bv2\b/i,
      /\bv3\b.{0,40}(?:откат|fallback|возвращ)[а-яё]*.{0,30}\bv2\b/i
    ],
    safe: [
      /\bv3\b.{0,35}\b(?:fallback|falls? back)\b.{0,30}\bv2\b.{0,120}\b(?:forbidden|prohibited|not allowed)\b/i,
      /\b(?:no|without)\b.{0,140}\b(?:v3.{0,20})?fallback\b/i,
      /\bv3\b.{0,35}(?:откат|fallback)[а-яё]*.{0,30}\bv2\b.{0,25}(?:запрещ|не разреш|не допуска)/i
    ]
  },
  {
    name: 'partial or early activation',
    unsafe: [
      /\b(?:partial|early) activation\b.{0,40}\b(?:enabled|allowed|permitted|supported|possible)\b/i,
      /\b(?:enabled|allowed|permitted|supported|possible)\b.{0,40}\b(?:partial|early) activation\b/i,
      /(?:частичн|досрочн)[а-яё]* активац[а-яё]*.{0,40}(?:разреш|допуска|возмож|поддерж)/i,
      /(?:разреш|допуска|возмож|поддерж).{0,40}(?:частичн|досрочн)[а-яё]* активац[а-яё]*/i
    ],
    safe: [
      /\b(?:partial|early) activation\b.{0,30}\b(?:not allowed|forbidden|prohibited|impossible)\b/i,
      /(?:частичн|досрочн)[а-яё]* активац[а-яё]*.{0,30}(?:запрещ|не разреш|не допуска|невозмож)/i
    ]
  },
  {
    name: 'canonical G5 forbidden or party-only',
    unsafe: [
      /\bcanonical g5\b.{0,35}\b(?:must not exist|cannot exist|is forbidden|is prohibited)\b/i,
      /\b(?:every|all) g5\b.{0,35}\b(?:belongs?|exists?|lives?|is stored)\b.{0,20}\bparty(?: runtime)?\b/i,
      /\bg5\b.{0,25}\b(?:party-only|only (?:in|inside) party(?: runtime)?)\b/i,
      /каноническ[а-яё]* g5.{0,35}(?:не долж[а-яё]* существ|не может существ|запрещ)/i,
      /(?:кажд[а-яё]*|все) g5.{0,35}(?:принадлеж|хран|существ).{0,20}party/i,
      /\bg5\b.{0,25}только (?:в |внутри )?party/i
    ],
    safe: []
  },
  {
    name: 'G7/G8 introduced or required',
    unsafe: [
      /\bg[78]\b\s+(?:is\s+)?(?!not\b)(?:introduced|required|mandatory)\b/i,
      /\b(?:introduces?|requires?|adds?)\b.{0,30}\bg[78]\b/i,
      /\bg[78]\b.{0,20}(?<!не )(?:вводится|обязателен|требуется|добавляется)\b/i,
      /(?<!не )(?:вводит|требует|добавляет).{0,30}\bg[78]\b/i
    ],
    safe: []
  }
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const resolveDocument = (name) => path.join(documentsRoot, name);
const exactKeys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: object required`);
  assert(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label}: missing or additional properties`
  );
};
const resolveRef = (root, reference) => {
  assert(reference.startsWith('#/'), `schema: unsupported $ref ${reference}`);
  return reference.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root);
};
const validateJsonSchema = (definition, value, location = '$', root = definition) => {
  if (definition.$ref) return validateJsonSchema(resolveRef(root, definition.$ref), value, location, root);
  const errors = [];
  if (definition.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${location}: object required`];
    for (const required of definition.required ?? []) if (!Object.hasOwn(value, required)) errors.push(`${location}.${required}: required`);
    if (definition.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(definition.properties ?? {}, key)) errors.push(`${location}.${key}: additional property`);
    }
    for (const [key, child] of Object.entries(definition.properties ?? {})) {
      if (Object.hasOwn(value, key)) errors.push(...validateJsonSchema(child, value[key], `${location}.${key}`, root));
    }
  } else if (definition.type === 'array') {
    if (!Array.isArray(value)) return [`${location}: array required`];
    if (definition.minItems != null && value.length < definition.minItems) errors.push(`${location}: minItems`);
    if (definition.maxItems != null && value.length > definition.maxItems) errors.push(`${location}: maxItems`);
    value.forEach((item, index) => errors.push(...validateJsonSchema(definition.items ?? {}, item, `${location}[${index}]`, root)));
  } else if (definition.type === 'string' && typeof value !== 'string') errors.push(`${location}: string required`);
  else if (definition.type === 'boolean' && typeof value !== 'boolean') errors.push(`${location}: boolean required`);
  if (Object.hasOwn(definition, 'const') && value !== definition.const) errors.push(`${location}: const mismatch`);
  if (definition.enum && !definition.enum.includes(value)) errors.push(`${location}: enum mismatch`);
  if (definition.pattern && !new RegExp(definition.pattern, 'u').test(String(value))) errors.push(`${location}: pattern mismatch`);
  if (definition.minLength != null && typeof value === 'string' && value.length < definition.minLength) errors.push(`${location}: minLength`);
  return errors;
};

const declaration = JSON.parse(await readFile(declarationPath, 'utf8'));
const schemaBytes = await readFile(schemaPath, 'utf8');
assert(sha256(schemaBytes) === trustedSchemaSha256, 'declaration schema does not match the trusted checker anchor');
const schema = JSON.parse(schemaBytes);
const schemaErrors = validateJsonSchema(schema, declaration);
assert(schemaErrors.length === 0, `declaration JSON Schema validation failed: ${schemaErrors.join('; ')}`);
const globalContract = {
  schema_version: 'p02-boundary-declaration.v1',
  phase: 'P02',
  active_owner: 'v2',
  target_status: 'inactive_until_P28',
  production_read: 'v2_only',
  production_write: 'v2_only',
  dual_write: false,
  mixed_authority: false,
  fallback: false,
  partial_activation: false,
  canonical_g5: 'world_base',
  generated_g5: 'party_runtime',
  max_level: 'G6'
};
exactKeys(declaration, [...Object.keys(globalContract), 'documents'], 'declaration');
for (const [field, expected] of Object.entries(globalContract)) {
  assert(declaration[field] === expected, `declaration.${field}: expected ${JSON.stringify(expected)}`);
}
assert(schema.additionalProperties === false, 'declaration schema must reject additional properties');
assert(schema.properties?.documents?.minItems === 4 && schema.properties?.documents?.maxItems === 4, 'declaration schema must require exactly four pairs');
assert(Array.isArray(declaration.documents) && declaration.documents.length === 4, 'declaration.documents: exactly four pairs required');
const declaredById = new Map();
for (const [index, row] of declaration.documents.entries()) {
  exactKeys(row, ['pair_id', 'active', 'target'], `declaration.documents[${index}]`);
  assert(!declaredById.has(row.pair_id), `declaration.documents: duplicate pair_id ${row.pair_id}`);
  assert(Object.hasOwn(documentPairs, row.pair_id), `declaration.documents: unknown pair_id ${row.pair_id}`);
  const expectedPair = documentPairs[row.pair_id];
  for (const side of ['active', 'target']) {
    const pin = row[side];
    exactKeys(pin, ['path', 'sha256', 'section_id', 'section_sha256'], `${row.pair_id}.${side}`);
    assert(pin.path === expectedPair[side], `${row.pair_id}.${side}.path: unexpected document`);
    assert(/^[0-9a-f]{64}$/.test(pin.sha256), `${row.pair_id}.${side}.sha256: invalid`);
    assert(pin.section_id === 'whole_document', `${row.pair_id}.${side}.section_id: unsupported`);
    assert(pin.section_sha256 === pin.sha256, `${row.pair_id}.${side}: whole-document section digest mismatch`);
  }
  declaredById.set(row.pair_id, row);
}
assert(
  [...declaredById.keys()].sort().join(',') === Object.keys(documentPairs).sort().join(','),
  'declaration.documents: exact pair set required'
);

const documents = Object.fromEntries(await Promise.all(
  Object.entries(documentPairs).map(async ([name, pair]) => [
    name,
    {
      active: await readFile(resolveDocument(pair.active), 'utf8'),
      target: await readFile(resolveDocument(pair.target), 'utf8')
    }
  ])
));

for (const [name, pair] of Object.entries(documentPairs)) {
  const { active, target } = documents[name];
  const declared = declaredById.get(name);
  assert(active.includes('## P02 target routing (inactive until P28)'), `${name}: explicit P02 target routing is missing`);
  assert(active.includes(pair.target), `${name}: active owner does not route to its target supplement`);
  assert(active.includes('spatial_architecture_standard_g0_g6.md'), `${name}: canonical target standard route is missing`);
  assert(active.includes('data/world-catalogs/novgorod/spatial-v3/manifest.json'), `${name}: approved P12 manifest route is missing`);
  assert(/37 SHA-256-pinned datasets/.test(active) && /data_gaps:\s*\[\]/.test(active), `${name}: approved P12 state is missing`);
  assert(/v2 remains the sole production owner until P28/i.test(active), `${name}: pre-P28 production ownership is ambiguous`);
  assert(/does not authorize production import, runtime use, write, or activation/i.test(active), `${name}: P12 authoring approval boundary is missing`);
  assert(declared.active.sha256 === activeTrustAnchors[name], `${name}: declaration active pin does not match the reviewed P02 owner-document trust anchor`);
  assert(sha256(active) === activeTrustAnchors[name], `${name}: active owner-document bytes do not match the reviewed P02 trust anchor`);
  assert(sha256(target) === declared.target.sha256, `${name}: target document digest does not match declaration`);
  assert(/target/i.test(target) && /P28/i.test(target) && /\bv2\b/i.test(target), `${name}: target/active boundary missing`);
  assert(/G5/i.test(target) && /G6/i.test(target), `${name}: target G5/G6 coverage missing`);
  assert(!/\bactive\s+v3\b/i.test(target), `${name}: target supplement claims premature v3 activation`);
  for (const marker of pair.required) {
    assert(marker.test(target), `${name}: required P02 evidence missing (${marker})`);
  }
}

const normalizedParagraphs = (text) => text
  .split(/\r?\n\s*\r?\n/)
  .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

for (const [name, { target }] of Object.entries(documents)) {
  for (const [paragraphNumber, paragraph] of normalizedParagraphs(target).entries()) {
    for (const policy of unsafeAssertionPolicies) {
      const explicitlySafe = policy.safe.some((pattern) => pattern.test(paragraph));
      const unsafe = policy.unsafe.some((pattern) => pattern.test(paragraph));
      assert(!unsafe || explicitlySafe, `${name}:paragraph-${paragraphNumber + 1}: unsafe target assertion permits ${policy.name}`);
    }
  }
}

console.log('P02 checks passed: strict boundary declaration and exact document pins are valid; P02-S01..S04 prose coverage and contradiction scans passed as defense-in-depth.');
