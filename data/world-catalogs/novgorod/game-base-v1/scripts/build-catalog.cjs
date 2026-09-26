#!/usr/bin/env node
// Builds catalog.json and CATALOG.md from scripts/*.src.json and validates them.
// Run: node scripts/build-catalog.cjs   (from game-base-v1/)
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const head = read('catalog-source.json');
const groups = read('groups.src.json');
const domains = [...read('domains-a.src.json'), ...read('domains-b.src.json')];

const FILL = ['import', 'derive', 'research', 'rule', 'mixed'];
const PRIO = ['M2c', 'M3', 'later'];
const REQ_STR = ['id', 'name_ru', 'group', 'entities_ru', 'gaps_ru', 'fill_method', 'priority', 'acceptance_ru'];
const REQ_ARR = ['key_fields', 'target_tables', 'consumers', 'existing_sources'];
// Domain ids the task requires to exist (coverage check).
const REQUIRED = [
  'flora_trees_shrubs', 'flora_herbs_grasses_mosses', 'flora_berries_mushrooms', 'cultivated_plants',
  'fauna_mammals', 'fauna_birds', 'fauna_fish', 'fauna_invertebrates_herps', 'livestock_husbandry',
  'natural_materials_soils', 'weather_climate', 'place_families', 'place_binding', 'presence_rules',
  'buildings_structures', 'interiors_scenes', 'household_items', 'item_place_frequency', 'carried_inventories',
  'containers_contents', 'garments', 'outfits_by_role', 'adornment_appearance', 'food_ingredients',
  'dishes_meals_preservation', 'currencies_measures', 'trade_goods_markets', 'price_bands',
  'social_strata_legal_status', 'occupations', 'activities_observable', 'households_kinship', 'npc_psychology',
  'personal_names', 'place_names', 'craft_processes', 'craft_tools_gear', 'workshops', 'calendar_feasts_fasts',
  'schedules_routines', 'historical_events', 'historical_figures', 'law_justice_governance', 'religion_church',
  'transport_travel', 'health_body', 'item_ownership_rules', 'item_marks_text_pools'
];

const errors = [];
const gids = new Set();
for (const g of groups) {
  if (!g.id || !g.name_ru || !g.collector_brief_ru) errors.push(`group incomplete: ${g.id}`);
  if (gids.has(g.id)) errors.push(`duplicate group ${g.id}`);
  gids.add(g.id);
}
if (groups.length < 16 || groups.length > 20) errors.push(`group count ${groups.length} not in 16..20`);
const dids = new Set();
for (const d of domains) {
  for (const k of REQ_STR) if (typeof d[k] !== 'string' || !d[k].trim()) errors.push(`${d.id}: missing ${k}`);
  for (const k of REQ_ARR) if (!Array.isArray(d[k]) || d[k].length === 0) errors.push(`${d.id}: empty ${k}`);
  if (dids.has(d.id)) errors.push(`duplicate domain ${d.id}`);
  dids.add(d.id);
  if (!/^[a-z][a-z0-9_]*$/.test(d.id)) errors.push(`bad slug ${d.id}`);
  if (!gids.has(d.group)) errors.push(`${d.id}: unknown group ${d.group}`);
  if (!FILL.includes(d.fill_method)) errors.push(`${d.id}: bad fill_method ${d.fill_method}`);
  if (!PRIO.includes(d.priority)) errors.push(`${d.id}: bad priority ${d.priority}`);
}
for (const g of groups) if (!domains.some((d) => d.group === g.id)) errors.push(`group without domains: ${g.id}`);
for (const r of REQUIRED) if (!dids.has(r)) errors.push(`required domain missing: ${r}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

const count = (f) => domains.reduce((m, d) => ((m[d[f]] = (m[d[f]] || 0) + 1), m), {});
const byPrio = count('priority');
const byFill = count('fill_method');
const byGroup = count('group');
const tokens = { n_domains: domains.length, n_groups: groups.length, n_M2c: byPrio.M2c || 0, n_M3: byPrio.M3 || 0, n_later: byPrio.later || 0 };
const summary = head.summary_ru.replace(/\{\{(\w+)\}\}/g, (_, k) => String(tokens[k]));

const out = { ...head, summary_ru: summary, counts: { domains: domains.length, groups: groups.length, by_priority: byPrio, by_fill_method: byFill, by_group: byGroup }, groups, domains };
fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify(out, null, 2) + '\n');

// ---- CATALOG.md
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const FILL_RU = { import: 'импорт', derive: 'вывод скриптом', research: 'исследование', rule: 'правило', mixed: 'смешанный' };
const L = [];
L.push('# Каталог игровой базы game-base-v1', '');
L.push(`Статус: ${head.status}. Создан ${head.created}. Файл сгенерирован скриптом \`scripts/build-catalog.cjs\` из \`scripts/*.src.json\`; править исходники, затем перезапустить скрипт.`, '');
L.push('## Итог', '', summary, '');
L.push('## Счёт (по скрипту)', '');
L.push(`- Доменов: ${domains.length}; групп-сборщиков: ${groups.length}.`);
L.push(`- По приоритету: ${PRIO.map((p) => `${p} — ${byPrio[p] || 0}`).join('; ')}.`);
L.push(`- По способу заполнения: ${FILL.map((f) => `${FILL_RU[f]} — ${byFill[f] || 0}`).join('; ')}.`, '');
L.push('## Соглашения', '');
for (const [k, v] of Object.entries(head.conventions)) L.push(`- **${k}**: ${v}`);
L.push('', '## Корни путей', '');
for (const [k, v] of Object.entries(head.roots)) L.push(`- \`${k}\` — ${v}`);
L.push('', '## Сводная таблица доменов', '');
L.push('| # | Домен | Группа | Приоритет | Способ | Состояние (источники) | Пробел |');
L.push('|---|---|---|---|---|---|---|');
domains.forEach((d, i) => {
  L.push(`| ${i + 1} | **${esc(d.name_ru)}** \`${d.id}\` | ${d.group} | ${d.priority} | ${FILL_RU[d.fill_method]} | ${esc(d.existing_sources.join('; '))} | ${esc(d.gaps_ru)} |`);
});
L.push('', '## Группы сборщиков', '');
for (const g of groups) {
  const ds = domains.filter((d) => d.group === g.id);
  L.push(`### ${g.name_ru} (\`${g.id}\`)`, '');
  L.push(`Домены: ${ds.map((d) => `\`${d.id}\` (${d.priority})`).join(', ')}.`, '');
  L.push(`**Задание сборщику.** ${g.collector_brief_ru}`, '');
  for (const d of ds) {
    L.push(`#### ${d.name_ru} — \`${d.id}\``, '');
    L.push(`- Сущности: ${d.entities_ru}`);
    L.push(`- Ключевые поля: ${d.key_fields.map((f) => `\`${f}\``).join(', ')}`);
    L.push(`- Целевые таблицы: ${d.target_tables.join('; ')}`);
    L.push(`- Потребители: ${d.consumers.join('; ')}`);
    L.push(`- Источники и статус: ${d.existing_sources.join('; ')}`);
    L.push(`- Пробел: ${d.gaps_ru}`);
    L.push(`- Способ: ${FILL_RU[d.fill_method]}; приоритет: ${d.priority}`);
    L.push(`- Приёмка (детерминированный тест): ${d.acceptance_ru}`, '');
  }
}
fs.writeFileSync(path.join(root, 'CATALOG.md'), L.join('\n'));
console.log(JSON.stringify(out.counts));
