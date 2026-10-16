import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PREFIX = 'data/world-catalogs/novgorod/spatial-v3/';
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const source = {
  local: read(`${PREFIX}datasets/spatial_v3_canonical_g5_connection_bindings.json`),
  routes: read(`${PREFIX}datasets/spatial_v3_world_routes.json`),
  segments: read(`${PREFIX}datasets/spatial_v3_world_route_segments.json`),
  routeEndpoints: read(`${PREFIX}datasets/spatial_v3_world_route_endpoint_bindings.json`),
  exits: read(`${PREFIX}datasets/spatial_v3_g4_directional_exits.json`),
  inventory: read(`${PREFIX}source-approval/p12_novgorod_source_approval_001/data/canonical-g5-inventory.json`).records,
};
const evidenceIds = new Map([
  [`${PREFIX}datasets/spatial_v3_canonical_g5_connection_bindings.json`, new Set(source.local.map((x) => x.id))],
  [`${PREFIX}datasets/spatial_v3_world_routes.json`, new Set(source.routes.map((x) => x.id))],
  [`${PREFIX}datasets/spatial_v3_world_route_segments.json`, new Set(source.segments.map((x) => x.id))],
  [`${PREFIX}datasets/spatial_v3_world_route_endpoint_bindings.json`, new Set(source.routeEndpoints.map((x) => x.id))],
  [`${PREFIX}source-approval/p12_novgorod_source_approval_001/data/canonical-g5-inventory.json`, new Set(source.inventory.map((x) => x.id))],
  ['data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv', new Set(readFileSync(resolve(ROOT, 'data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv'), 'utf8').split('\n').slice(1).map((line) => line.split(',')[0]))],
  ['data/world-catalogs/novgorod/m2c-natural/candidate.json', new Set(read('data/world-catalogs/novgorod/m2c-natural/candidate.json').natural_profiles.map((x) => x.profile_id))],
  ['data/world-catalogs/novgorod/m2c-natural-presentation/candidate.json', new Set(read('data/world-catalogs/novgorod/m2c-natural-presentation/candidate.json').presentation_profiles.map((x) => x.id))],
  ['data/world-catalogs/novgorod/m2c-natural-placement/candidate.json', new Set(read('data/world-catalogs/novgorod/m2c-natural-placement/candidate.json').placements.map((x) => x.id))],
]);

export const KINDS = Object.freeze([
  'road', 'path', 'forest_track', 'street', 'yard', 'footbridge',
  'bridge', 'ford', 'ferry', 'river_channel', 'side_channel', 'open_water', 'shore',
  'portage', 'winter_road', 'causeway', 'wetland_path', 'offroad',
]);
const DERIVED_ROUTE_KINDS = new Map([
  ['route.river_channel', 'river_channel'], ['route.side_channel', 'side_channel'],
  ['route.path', 'path'], ['route.wetland_path', 'wetland_path'],
  ['route.forest_track', 'forest_track'], ['route.offroad_crossing', 'offroad'],
]);
const LOCAL_MINUTES = new Map([
  ['road', [7, 10]], ['path', [4, 8]], ['forest_track', [7, 10]],
  ['street', [3, 6]], ['yard', [2, 6]], ['footbridge', [3, 5]],
  ['bridge', [3, 5]], ['ford', [5, 5]], ['ferry', [8, 8]],
  ['river_channel', [3, 8]], ['side_channel', [3, 8]], ['open_water', [3, 8]],
  ['shore', [4, 8]], ['wetland_path', [4, 8]],
]);
const WATER_KINDS = new Set(['river_channel', 'side_channel', 'open_water']);

const norm = (s) => s.toLocaleLowerCase('ru').replaceAll('ё', 'е').normalize('NFC');
const words = (s) => norm(s).match(/[а-я]+/g) ?? [];
const ENDINGS = ['ыми', 'ими', 'ого', 'его', 'ому', 'ему', 'ами', 'ями',
  'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ей', 'ую', 'юю',
  'ым', 'им', 'ых', 'их', 'ах', 'ях', 'ам', 'ям', 'ом', 'ем',
  'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о'];
const stem = (word) => {
  const ending = ENDINGS.find((value) => word.endsWith(value) && word.length - value.length >= 3);
  return (ending ? word.slice(0, -ending.length) : word).slice(0, 4);
};
// Generic terrain and carrier words can describe a line without naming a place.
const COMMON_TITLE_STEMS = new Set([
  'бере', 'вод', 'водн', 'рек', 'речн', 'лес', 'троп', 'русл', 'прот', 'плес',
  'рука', 'ход', 'подх', 'кром', 'выхо', 'вход', 'учас', 'мест',
  'доро', 'путь', 'мост', 'речн', 'лесн',
]);
const ORDINAL = /(?:\d+|№|\b[IVXLCDM]+\b|(?:^|[\s(])(?:перв|втор|трет|четвер|пят|шест|седьм|восьм|девят|десят)[а-яё]*)/iu;
const NUMBER_WORD = /(?:^|[\s(])(?:ноль|один|одн(?:а|о|и|у|ой|ого|ому|им|их|ими)|дв(?:а|е|ух|ум|умя)|тр(?:и|ех|ем|емя)|четыр(?:е|ех|ем|ьмя)|пят(?:ь|и|ью)|шест(?:ь|и|ью)|сем(?:ь|и|ью)|восем(?:ь|и|ью)|восьм(?:и|ью)|девят(?:ь|и|ью)|десят(?:ь|и|ью)|(?:один|две|три|четыр|пят|шест|сем|восем|девят)надцат[ьиью]?|двадцат[ьиью]?|тридцат[ьиью]?|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто)(?=$|[\s).,;:!?])/iu;
const TARGET_PREPOSITION = /(?:^|[\s(])(?:(?:к|ко|до|в сторону)\s+[а-яё]|по направлению\s+к\s+[а-яё])/iu;
const DIRECTIONAL = /(?:^|[\s(])(?:(?:по|против)\s+течени[юя]|(?:от|с|со)\s+[^.]{1,60}\s+(?:к|на)\s+|(?:от|с|со|из)\s+(?:берег[а-яё]*|вод[а-яё]*|суш[а-яё]*)|на\s+подъ[её]м[а-яё]*)/iu;

function titleLeak(label, place) {
  const labelStems = new Set(words(label).map(stem));
  const title = place.title.split(' — ')[0];
  const distinct = words(title).filter((word) => word.length >= 4 && !COMMON_TITLE_STEMS.has(stem(word)));
  const leaked = distinct.find((word) => labelStems.has(stem(word)));
  return leaked ? `place title word ${leaked} from ${place.id}` : null;
}

function repeatsName(name, qualifier) {
  const nameWords = words(name);
  const qualifierWords = words(qualifier);
  const nameStems = new Set(nameWords.map(stem));
  const content = qualifierWords.filter((word) => word.length >= 4 && !['вверх', 'вниз', 'течению', 'вдоль', 'через', 'между', 'около'].includes(word));
  return norm(name).includes(norm(qualifier)) || norm(qualifier).includes(norm(name)) ||
    (content.length > 0 && content.every((word) => nameStems.has(stem(word))));
}

export function validate(candidate, data = source) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const kinds = new Set(KINDS);
  if (candidate.status !== 'candidate' || candidate.approved !== false || candidate.activation_authorized !== false) fail('candidate status/approval flags');
  if (JSON.stringify(Object.keys(candidate.line_kinds ?? {}).sort()) !== JSON.stringify([...KINDS].sort())) fail('closed line-kind dictionary');
  const inventory = new Map(data.inventory.map((x) => [x.id, x]));
  const pairBindings = new Map();
  for (const edge of data.local) {
    const group = pairBindings.get(edge.source_pair_id) ?? [];
    group.push(edge);
    pairBindings.set(edge.source_pair_id, group);
  }
  const sourceRoutes = new Map(data.routes.map((x) => [x.id, x]));
  const sourceSegments = new Map(data.segments.map((x) => [x.world_route_id, x]));
  const endpoint = new Map();
  for (const x of data.routeEndpoints) endpoint.set(`${x.world_route_id}:${x.endpoint_role}`, x);
  const exitById = new Map(data.exits.map((x) => [x.id, x]));
  const linesAt = new Map();
  const usedLocal = new Set();
  const usedRoutes = new Set();

  function checkCommon(row, id, a, b) {
    if (!kinds.has(row.line_kind)) fail(`${id}: invalid line_kind`);
    if (typeof row.name_ru !== 'string' || !row.name_ru.trim()) { fail(`${id}: empty name`); return; }
    if (ORDINAL.test(row.name_ru)) fail(`${id}: ordinal number in name`);
    if (NUMBER_WORD.test(norm(row.name_ru))) fail(`${id}: number word in name`);
    if (TARGET_PREPOSITION.test(row.name_ru)) fail(`${id}: destination-direction preposition`);
    if (DIRECTIONAL.test(row.name_ru)) fail(`${id}: direction-specific name`);
    if (WATER_KINDS.has(row.line_kind) && row.travel_method !== 'boat') fail(`${id}: water line needs boat method`);
    if (!WATER_KINDS.has(row.line_kind) && row.travel_method != null) fail(`${id}: non-water boat method`);
    if (!Number.isInteger(row.base_minutes) || row.base_minutes <= 0) fail(`${id}: invalid minutes`);
    if (!row.minutes_reason?.trim()) fail(`${id}: no minutes_reason`);
    if (!row.basis_reason?.trim()) fail(`${id}: no basis_reason`);
    if (!['derived', 'authored'].includes(row.basis)) fail(`${id}: invalid basis`);
    const qualifier = row.qualifier;
    if (!qualifier || typeof qualifier !== 'object' || Array.isArray(qualifier) ||
      JSON.stringify(Object.keys(qualifier).sort()) !== JSON.stringify(['from_to', 'to_from'])) fail(`${id}: invalid directional qualifier`);
    for (const side of ['from_to', 'to_from']) {
      const value = qualifier?.[side];
      if (value !== null && (typeof value !== 'string' || !value.trim())) fail(`${id}: invalid ${side} qualifier`);
      if (typeof value === 'string' && ORDINAL.test(value)) fail(`${id}: ordinal number in ${side} qualifier`);
      if (typeof value === 'string' && NUMBER_WORD.test(norm(value))) fail(`${id}: number word in ${side} qualifier`);
      if (typeof value === 'string' && TARGET_PREPOSITION.test(value)) fail(`${id}: destination-direction preposition in ${side} qualifier`);
      if (typeof value === 'string' && repeatsName(row.name_ru, value)) fail(`${id}: ${side} qualifier repeats name`);
    }
    if (!Array.isArray(row.evidence) || row.evidence.length < 4 || row.evidence.some((x) => typeof x !== 'string' || !x.includes('#')) || !row.evidence.some((x) => x.includes(a)) || !row.evidence.some((x) => x.includes(b))) fail(`${id}: insufficient endpoint evidence`);
    else if (row.evidence.some((x) => {
      const [path, fragment] = x.split('#');
      return !path.startsWith('data/') || !existsSync(resolve(ROOT, path)) || (evidenceIds.has(path) && !evidenceIds.get(path).has(fragment.split(':')[0]));
    })) fail(`${id}: evidence record missing`);
    for (const [here, there, side] of [[a, b, 'from_to'], [b, a, 'to_from']]) {
      if (!inventory.has(here) || !inventory.has(there)) { fail(`${id}: unknown endpoint`); continue; }
      const nameLeak = titleLeak(row.name_ru, inventory.get(here));
      if (nameLeak) fail(`${id}: ${nameLeak}`);
      const value = qualifier?.[side];
      if (typeof value === 'string') {
        const qualifierLeak = titleLeak(value, inventory.get(there));
        if (qualifierLeak) fail(`${id}: qualifier ${qualifierLeak}`);
      }
      const lines = linesAt.get(here) ?? [];
      lines.push({ id, name: norm(row.name_ru.trim()), qualifier: value });
      linesAt.set(here, lines);
    }
  }

  for (const row of candidate.local_pairs ?? []) {
    const id = row.source_pair_id;
    if (usedLocal.has(id)) fail(`${id}: duplicate local pair`);
    usedLocal.add(id);
    const binding = pairBindings.get(id);
    if (!binding || binding.length !== 2) { fail(`${id}: missing reciprocal bindings`); continue; }
    const [f, r] = binding;
    if (f.reverse_binding_id !== r.id || r.reverse_binding_id !== f.id || f.from_canonical_g5_id !== r.to_canonical_g5_id || f.to_canonical_g5_id !== r.from_canonical_g5_id) fail(`${id}: inconsistent reciprocal bindings`);
    const pairEnds = new Set([f.from_canonical_g5_id, f.to_canonical_g5_id]);
    if (row.parent_g4_id !== f.parent_g4_id || !pairEnds.has(row.from_g5_id) || !pairEnds.has(row.to_g5_id) || row.from_g5_id === row.to_g5_id) fail(`${id}: endpoint mismatch`);
    if (row.basis !== 'authored') fail(`${id}: local carrier is not derived by source`);
    const range = LOCAL_MINUTES.get(row.line_kind);
    if (!range || row.base_minutes < range[0] || row.base_minutes > range[1]) fail(`${id}: local minutes outside kind range`);
    checkCommon(row, id, row.from_g5_id, row.to_g5_id);
  }
  if (usedLocal.size !== pairBindings.size) fail(`local coverage ${usedLocal.size}/${pairBindings.size}`);

  const forwardRoutes = data.routes.filter((x) => x.id.includes('g4dirv3f'));
  for (const row of candidate.world_routes ?? []) {
    const id = row.route_pair_id;
    if (usedRoutes.has(id)) fail(`${id}: duplicate world route`);
    usedRoutes.add(id);
    const [forwardId, reverseId] = row.world_route_ids ?? [];
    const f = sourceRoutes.get(forwardId), r = sourceRoutes.get(reverseId);
    if (!f || !r || !forwardId.includes('g4dirv3f') || !forwardId.endsWith(`__${id}`) || f.reverse_route_id !== reverseId || r.reverse_route_id !== forwardId) { fail(`${id}: reciprocal route mismatch`); continue; }
    const a = endpoint.get(`${forwardId}:from`)?.canonical_g5_id;
    const b = endpoint.get(`${forwardId}:to`)?.canonical_g5_id;
    const ra = endpoint.get(`${reverseId}:from`)?.canonical_g5_id;
    const rb = endpoint.get(`${reverseId}:to`)?.canonical_g5_id;
    if (!a || !b || ra !== b || rb !== a || row.from_g5_id !== a || row.to_g5_id !== b) fail(`${id}: route endpoint mismatch`);
    const fs = sourceSegments.get(forwardId), rs = sourceSegments.get(reverseId);
    if (!fs || !rs || fs.base_minutes !== rs.base_minutes || row.base_minutes !== fs.base_minutes) fail(`${id}: source segment minutes mismatch`);
    const derivedKind = DERIVED_ROUTE_KINDS.get(f.route_kind_id);
    if (row.basis !== (derivedKind ? 'derived' : 'authored') || (derivedKind && row.line_kind !== derivedKind)) fail(`${id}: route basis/kind mismatch`);
    const fromExit = exitById.get(endpoint.get(`${forwardId}:from`)?.directional_exit_id);
    const reverseExit = exitById.get(endpoint.get(`${reverseId}:from`)?.directional_exit_id);
    if (fromExit?.exit_canonical_g5_id !== a || reverseExit?.exit_canonical_g5_id !== b) fail(`${id}: directional exit mismatch`);
    checkCommon(row, id, a, b);
  }
  if (usedRoutes.size !== forwardRoutes.length) fail(`world-route coverage ${usedRoutes.size}/${forwardRoutes.length}`);
  for (const [g5, lines] of linesAt) {
    const byName = new Map();
    for (const line of lines) {
      const group = byName.get(line.name) ?? [];
      group.push(line);
      byName.set(line.name, group);
    }
    for (const sameName of byName.values()) {
      if (sameName.length === 1) {
        if (sameName[0].qualifier !== null) fail(`${sameName[0].id}: unneeded qualifier at ${g5}`);
        continue;
      }
      const qualifiers = new Set();
      for (const line of sameName) {
        if (typeof line.qualifier !== 'string' || !line.qualifier.trim()) fail(`${line.id}: missing duplicate-name qualifier at ${g5}`);
        else if (qualifiers.has(norm(line.qualifier))) fail(`${line.id}: duplicate displayed name at ${g5}`);
        else qualifiers.add(norm(line.qualifier));
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const candidate = read('data/world-catalogs/novgorod/m2c-line-names/candidate.json');
  const errors = validate(candidate);
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`OK: ${candidate.local_pairs.length} local pairs, ${candidate.world_routes.length} world routes, ${KINDS.length} kinds\n`);
  }
}
