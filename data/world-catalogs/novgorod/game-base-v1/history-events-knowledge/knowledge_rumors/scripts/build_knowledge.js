// knowledge_rumors domain: rumor templates, knowledge profiles by role, literacy, birchbark letter genre pools.
const fs = require('fs');
const path = require('path');

const [, , RUMOR_F, COMMON_F, ROUTE_F, SQLITE_F, OUT_DIR] = process.argv;
const rumorD = JSON.parse(fs.readFileSync(RUMOR_F, 'utf8'));
const commonD = JSON.parse(fs.readFileSync(COMMON_F, 'utf8'));
const routeD = JSON.parse(fs.readFileSync(ROUTE_F, 'utf8'));
const sq = JSON.parse(fs.readFileSync(SQLITE_F, 'utf8'));

function csvEsc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  if (/[",;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function writeCsv(file, header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => csvEsc(r[h])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

const rows = [];

// 1) rumor templates (53) -- generic-class topic = rumor_type (no specific historical event_ref in this source)
for (const t of rumorD.rumor_templates) {
  rows.push({
    kn_id: 'kn_rumor_' + t.rumor_template_id,
    kind: 'rumor',
    role_refs: (t.who_spreads || []).join('|'),
    topic: t.title,
    event_ref: 'generic_class:' + t.rumor_type,
    carrier_rule: 'who_spreads=' + (t.who_spreads || []).join(';') + ' | where_heard=' + (t.where_heard || []).join(';'),
    distortion_rule: 'truth_variants=' + (t.truth_variants || []).join(';') + ' | must_not_reveal=' + (t.what_it_must_not_reveal || []).join(';'),
    text_pool_ref: (t.typical_text_patterns || []).join(' / '),
    source_refs: 'rus13tpl novgorod_rumor_templates_v1.json (draft) [' + t.rumor_template_id + ']',
    confidence: 'C',
    status: 'candidate',
  });
}

// 2) knowledge profiles by role -- from common_knowledge.social_group_knowledge_profiles
for (const g of commonD.social_group_knowledge_profiles) {
  rows.push({
    kn_id: 'kn_profile_' + g.social_group_id,
    kind: 'knowledge_profile',
    role_refs: g.social_group_id,
    topic: g.title + ' | категории: ' + (g.typical_knowledge_categories || []).join(';'),
    event_ref: '',
    carrier_rule: 'how_they_know=' + (g.how_they_know || []).join(';'),
    distortion_rule: 'misunderstand=' + (g.what_they_often_misunderstand || []).join(';') + ' | hide=' + (g.what_they_may_hide || []).join(';'),
    text_pool_ref: '',
    source_refs: 'rus13tpl novgorod_common_knowledge_v1.json (draft) [' + g.social_group_id + ']',
    confidence: 'C',
    status: 'candidate',
  });
}
// route knowledge by role -- from route_knowledge_rules.social_group_route_knowledge
for (const g of routeD.social_group_route_knowledge) {
  rows.push({
    kn_id: 'kn_route_' + g.social_group_id,
    kind: 'knowledge_profile',
    role_refs: g.social_group_id,
    topic: g.title + ' (дорожное знание)',
    event_ref: '',
    carrier_rule: 'knows_exact=' + (g.usually_knows_exact || []).join(';') + ' | can_guide_for=' + (g.can_act_as_guide_for || []).join(';'),
    distortion_rule: 'may_lie_or_hide_when=' + (g.may_lie_or_hide_when || []).join(';'),
    text_pool_ref: '',
    source_refs: 'rus13tpl novgorod_route_knowledge_rules_v1.json (draft) [' + g.social_group_id + ']',
    confidence: 'C',
    status: 'candidate',
  });
}

// 3) literacy by role -- researched (not present as a structured dataset in existing sources); confidence B,
// grounded in the birchbark-letter corpus scholarship already cited by sqlite S05/S06/S20 (gramoty.ru, RNC corpus)
// and the standard secondary-literature consensus (Zaliznyak, Yanin) that literacy in Novgorod ca. XII-XIII in.
// was unusually broad for medieval Europe and cut across social strata, including women and children, though
// unevenly and mostly for short practical/business texts rather than literary composition.
const literacyRows = [
  { role: 'бояре/житьи люди (владельцы усадеб)', level: 'высокая практическая грамотность; часто сами читают и пишут деловые и долговые тексты', note: 'усадьбы Неревского/Троицкого раскопов дают деловую переписку хозяев' },
  { role: 'купцы', level: 'высокая практическая грамотность; счёт, долговые записи, деловые письма', note: 'многочисленные берестяные долговые грамоты и торговые записки' },
  { role: 'духовенство', level: 'высокая, включая церковнославянскую книжную грамотность', note: 'богослужебные и учебные тексты' },
  { role: 'ремесленники', level: 'практическая грамотность распространена, но неравномерна; короткие деловые записи, метки', note: 'берестяные тексты из ремесленных усадеб; надписи-собственности на предметах' },
  { role: 'женщины-хозяйки/собственницы', level: 'засвидетельствована практическая грамотность у части женщин (личные и деловые письма)', note: 'известные берестяные письма женщин-адресантов и адресаток' },
  { role: 'дети/подростки в грамотных дворах', level: 'засвидетельствовано обучение письму (учебные упражнения на бересте)', note: 'знаменитые учебные грамоты мальчика Онфима' },
  { role: 'смерды и сельские жители', level: 'низкая-неравномерная; преимущественно устная передача, грамотность концентрируется в городе и погостах', note: 'рабочая реконструкция по отсутствию сельских берестяных находок сопоставимого объёма' },
  { role: 'холопы/челядь', level: 'вероятно низкая; отдельных прямых свидетельств в подборке нет', note: 'reconstruction by absence, не прямое свидетельство' },
];
for (const l of literacyRows) {
  rows.push({
    kn_id: 'kn_literacy_' + l.role.replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 40),
    kind: 'literacy',
    role_refs: l.role,
    topic: 'грамотность по роли',
    event_ref: '',
    carrier_rule: l.level,
    distortion_rule: '',
    text_pool_ref: '',
    source_refs: 'НПЛ/берестяной корпус контекст (S05 gramoty.ru; S06 RNC birchbark corpus; S20) + научный консенсус (Зализняк, Янин о новгородской грамотности); ' + l.note,
    confidence: 'B',
    status: 'candidate',
  });
}

// 4) birchbark letter genre pools -- derived from sqlite.birchbark_selection (19 dated documents, confidence A, S05)
const genreGroups = {};
for (const b of sq.birchbark_selection) {
  const key = b.theme;
  (genreGroups[key] = genreGroups[key] || []).push(b);
}
for (const [theme, docs] of Object.entries(genreGroups)) {
  rows.push({
    kn_id: 'kn_genre_' + theme.replace(/[^a-zа-я0-9]+/gi, '_').slice(0, 30),
    kind: 'letter_genre',
    role_refs: '',
    topic: theme,
    event_ref: '',
    carrier_rule: 'примеры: ' + docs.map(d => '№' + d.number + ' (' + d.content + ', ' + d.dating + ')').join('; '),
    distortion_rule: '',
    text_pool_ref: 'item_text_pools:birchbark:' + theme.replace(/[^a-zа-я0-9]+/gi, '_'),
    source_refs: 'sqlite novgorod_1230(1).birchbark_selection [' + docs.map(d => '#' + d.number).join(',') + '], sources=' + docs[0].sources + ' (gramoty.ru)',
    confidence: 'A',
    status: 'candidate',
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeCsv(path.join(OUT_DIR, 'knowledge_rumors.csv'),
  ['kn_id', 'kind', 'role_refs', 'topic', 'event_ref', 'carrier_rule', 'distortion_rule', 'text_pool_ref', 'source_refs', 'confidence', 'status'],
  rows);

console.log('knowledge_rumors.csv rows:', rows.length,
  '(rumor:', rumorD.rumor_templates.length,
  ', knowledge_profile:', commonD.social_group_knowledge_profiles.length + routeD.social_group_route_knowledge.length,
  ', literacy:', literacyRows.length,
  ', letter_genre:', Object.keys(genreGroups).length, ')');
