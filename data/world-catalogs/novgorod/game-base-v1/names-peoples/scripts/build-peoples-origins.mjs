// Deterministic extraction: peoples_origins candidate table, combining
// costume foreigner_profiles.csv (10 groups, candidate) and
// rus13 novgorod_neighbor_regions_v1.json (6 neighbor regions, draft).
// Both are read-only reference sources copied/available under sources_copied.
import fs from "node:fs";
import path from "node:path";

const FOREIGNERS = "C:/Users/Slaven/Documents/Novgorod-game-base/data/world-catalogs/novgorod/sources/costume-dataset-v1/data/foreigner_profiles.csv";
const NEIGHBORS = "C:/Users/Slaven/Documents/Одним ПРОМТОМ/data/rus13-base-staging/nov_region_audit/novgorod_neighbor_regions_v1.json";
const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"), "../peoples_origins");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0]);
}

function csvEsc(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const raw = fs.readFileSync(FOREIGNERS, "utf8").replace(/^\uFEFF/, "");
const table = parseCsv(raw);
const fHeader = table[0];
const fRows = table.slice(1).map((r) => Object.fromEntries(fHeader.map((h, i) => [h, r[i] ?? ""])));

const neighbors = JSON.parse(fs.readFileSync(NEIGHBORS, "utf8")).neighbor_regions;

const outHeader = [
  "pp_id", "entity_kind", "name_ru", "endonym", "languages", "faith", "typical_occupations",
  "pf_ids", "presence_note", "clothing_profile_ref", "name_pool_ref",
  "legal_status_ref", "source_refs", "confidence",
];
const rows = [];

// A rating like "A–B" is a real value from the source CSV (costume dataset), not
// something this script invented. The group rule for a combined grade is to take
// the lower (worse) one, so normalize it here rather than propagate an invalid
// confidence value into our own table.
function normalizeConfidence(raw) {
  const m = String(raw || "").match(/^([ABC])\s*[–-]\s*([ABC])$/);
  if (!m) return raw || "C";
  const order = { A: 0, B: 1, C: 2 };
  return order[m[1]] >= order[m[2]] ? m[1] : m[2];
}

// Foreigner/traveller groups (guest merchants, clergy, mercenaries) — presence via costume dataset.
// `pf_ids` is intentionally left empty: this collector has no real place_family ids for
// these groups (the costume group id already lives in `clothing_profile_ref`; putting it
// in `pf_ids` too, as the previous pass did, misrepresents it as a place_family reference).
for (const r of fRows) {
  const groupId = r.group_id;
  const sourceIds = (r.source_ids || "").split("|").map((s) => s.trim()).filter(Boolean);
  const sourceRefs = [
    `game-base:sources.costume-dataset-v1/foreigner_profiles.csv#${groupId}`,
    ...(sourceIds.length ? [`costume-dataset-v1:source_ids#${sourceIds.join(",")}`] : []),
  ].join(" | ");
  rows.push([
    `pp_${groupId.toLowerCase()}`,
    "guest_itinerant",
    r.name_ru.replace(/^"|"$/g, ""),
    "",
    "",
    "",
    r.who,
    "",
    r.presence_basis,
    `costume-dataset-v1:foreigner_profiles#${groupId}`,
    "unassigned",
    "guest_status_unassigned",
    sourceRefs,
    normalizeConfidence(r.presence_confidence),
  ]);
}

// Neighbor lands (settled populations across the border, not itinerant guests).
// These are lands, not peoples — `entity_kind` says so explicitly; see the group
// README for which brief-named peoples still need a distinct `people` row.
for (const nb of neighbors) {
  rows.push([
    `pp_${nb.neighbor_region_id}`,
    "neighbor_land",
    nb.neighbor_region_title,
    "",
    "",
    "",
    (nb.trade_connection && nb.trade_connection.who_travels || []).join("|"),
    "",
    `direction:${nb.direction_from_novgorod}; ${(nb.route_connection_summary && nb.route_connection_summary.main_directions || []).join("|")}`,
    "unassigned",
    "unassigned",
    "unassigned",
    `game-base:sources.rus13/novgorod_neighbor_regions_v1.json#${nb.neighbor_region_id}`,
    "C",
  ]);
}

// Distinct `people` rows the previous pass was missing (VERIFICATION.md, peoples_origins
// verdict, actions 1 and 5). Sourced from the verified remote book evidence
// (`ssh servak … data/books/evidence/names-peoples.csv`, domain=peoples_origins), cited as
// "book:<book_id> §<section_path> ¶<para_no>". Confidence B throughout: every citation is a
// scholarly secondary source (book_type=scholarly), never a primary record, so per the group
// rule (A = primary, B = scholarly secondary) these cannot be A — even where the evidence file
// itself marks one row (ижора faith, book 641352) as A, that fact is combined here with B-rated
// facts about the same people, and the rule takes the lower grade for a combined claim.
// новгородцы (`pp_novgorod_rus`) is deliberately keyed to `novgorod_rus` so that
// `personal_names.csv`'s `people_ref = novgorod_rus` finally resolves to a real row
// (VERIFICATION.md, personal_names verdict, item 4).
const BOOK_ATTESTED_PEOPLES = [
  {
    id: "novgorod_rus",
    name_ru: "Новгородцы (Новгородская Русь)",
    endonym: "",
    languages: "",
    faith: "",
    typical_occupations: "",
    presence_note: "Основное (автохтонное) население Новгородской земли. Западные (славянские) корни первонасельников Новгорода и Пскова подтверждены курганной археологией, антропологией и сходством дохристианских личных имён с польскими (концепция В.Л. Янина).",
    source_refs: "book:624953 §Глава 7 Новгородские берестяные грамоты В.Л. Янин ¶1396",
  },
  {
    id: "vod",
    name_ru: "Водь",
    endonym: "Vatjalaiset",
    languages: "водский (прибалтийско-финский)",
    faith: "",
    typical_occupations: "",
    presence_note: "Занимала обширную территорию на Ижорском плато и в Причудье в раннем средневековье; от этнонима — название Водской пятины. В XIII–XIV вв. собственно водской оставалась лишь прибрежная полоса Финского залива; на Ижорское плато расселяются славяне, и водь постепенно славянизируется.",
    source_refs: "book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶315; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶316; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶387",
  },
  {
    id: "izhora",
    name_ru: "Ижора",
    endonym: "",
    languages: "прибалтийско-финский (карельская ветвь; ижора до сих пор называет себя карелами)",
    faith: "В основном язычники (1240 г.); отмечен как минимум один крещёный старейшина, соблюдавший постные дни.",
    typical_occupations: "Несла «стражу морскую» на Неве, платила дань Новгороду и давала отряды в новгородскую рать.",
    presence_note: "Молодое этнообразование: отпочковавшаяся от корелы группа на Неве (конец I тыс. н. э.), жила в бассейне Невы и на части южного побережья Финского залива; первое летописное упоминание — 1228 г.; шведы и немцы звали землю Ингрией.",
    source_refs: "book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶399; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶414; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶419; book:641352 §ЖИТИЕ АЛЕКСАНДРА НЕВСКОГО > ПЕРЕВОД ¶1931",
  },
  {
    id: "korela",
    name_ru: "Корела",
    endonym: "",
    languages: "карельский (прибалтийско-финский)",
    faith: "",
    typical_occupations: "Купцы-посредники в торговле Новгорода с Лапландией (пушнина); засвидетельствованы на Неревском раскопе в Новгороде, включая одну грамоту на корельском языке.",
    presence_note: "В XII–XIV вв. основной регион — западное и северо-западное Приладожье и бассейн Вуоксы, к западу от Ладожского озера; западный сосед — емь, к северу — саамы (лопь).",
    source_refs: "book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶424; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶458; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶457; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶477",
  },
  {
    id: "ves",
    name_ru: "Весь",
    endonym: "",
    languages: "весьский/вепсский (прибалтийско-финский); предки вепсов",
    faith: "",
    typical_occupations: "",
    presence_note: "По летописи сидит на Белоозере; новгородцами также причислялась к «чуди». Западная граница памятников — р. Волхов, южная — соседство с мерей у верхнего Поволжья; на северо-западе граничит с корелой. Отличается от карел, води и ижоры по материальной культуре.",
    source_refs: "book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶538; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶553; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶547; book:751267 §А.В. Куза. Новгородская земля ¶558",
  },
  {
    id: "chud_est",
    name_ru: "Чудь / эсты",
    endonym: "",
    languages: "эстонский (прибалтийско-финский); «чудь» — новгородский общий термин для западнофинских племён, не самоназвание",
    faith: "",
    typical_occupations: "Эстонская чудь (земли Очела, Торма, Ерева, Уганди с Медвежьей Головой) платила дань Новгороду через местную знать; поступления дани стали прерываться в начале XIII в. из-за действий Ордена. Чудь заволочская — отдельная, географически удалённая группа в бассейне Ваги, сохранявшая самостоятельность в XI–XIII вв.",
    presence_note: "Бандл двух брифовых значений одного термина «чудь/эсты», а не разных брифовых народов: прибалтийская эстонская чудь и заволочская чудь — обе названы новгородцами «чудью».",
    source_refs: "book:751267 §А.В. Куза. Новгородская земля ¶555; book:751267 §А.В. Куза. Новгородская земля ¶649; book:681281 §Часть первая Финно-угры > Глава первая Прибалтийские финны ¶655",
  },
  {
    id: "yem_sum",
    name_ru: "Емь / сумь",
    endonym: "",
    languages: "прибалтийско-финский (собственно финская ветвь; овально-выпуклые фибулы типов J,G,I,E,C1 — «емские», в землях еми и суми)",
    faith: "",
    typical_occupations: "Данническая/вассальная зависимость от Новгорода до середины XIII в., с перерывами; военные набеги на Ладожскую волость (1142, 1228) и походы новгородцев (иногда с корелой) на емь (1143, 1191, 1227, 1228).",
    presence_note: "",
    source_refs: "book:220871 §Новгородские бояре и князья в первой трети XIII века ¶330; book:751267 §А.В. Куза. Новгородская земля ¶669; book:751267 §А.В. Куза. Новгородская земля ¶683; book:751267 §А.В. Куза. Новгородская земля ¶695",
  },
];

for (const p of BOOK_ATTESTED_PEOPLES) {
  rows.push([
    `pp_${p.id}`,
    "people",
    p.name_ru,
    p.endonym,
    p.languages,
    p.faith,
    p.typical_occupations,
    "",
    p.presence_note,
    "unassigned",
    "unassigned",
    "unassigned",
    p.source_refs,
    "B",
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const csv = [outHeader.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(OUT_DIR, "peoples_origins.csv"), csv, "utf8");

console.log(`peoples_origins.csv rows: ${rows.length} (foreigner groups: ${fRows.length}, neighbor lands: ${neighbors.length}, book-attested peoples: ${BOOK_ATTESTED_PEOPLES.length})`);
console.log("Still a real gap, no sourced row added (needs new research): смоляне — no book-evidence or other read-only source row found this pass.");
