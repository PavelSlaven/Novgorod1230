# households-psychology-speech (candidate, status=candidate — not self-approved)

Группа: двор и семья, психология NPC, речь и этикет. Собрано скриптом
`scripts/build.py` из уже одобренных источников (`novgorod-region` TSV,
WK production-v1 `family-social-context.json`) плюс курированный набор
(kinship-термины, статьи Русской Правды об оскорблении, посевные формулы
обращения, нормы гостеприимства/возраста/табу) с библиографическими и
книжными `source_refs`. Проверено `scripts/check.py` (все проверки проходят
на текущий момент, см. вывод ниже).

**D-3 rework.** Связи и обращения покрывают достижимые пары на стартовых G5-узлах: общий расчёт читает `people_presence_authoring.csv`, `schedules_routines.csv`, `never_created_gaps` и привязки PF к G5, пересекает сезон и фазы `on_site`/`nearby` среди основного и вторичных PF узла. Пары с никогда не созданным субъектом перечислены в `scripts/build_report.json` как пробелы, без производных правил и форм. `joint_work` допустим только для работников на одном PF. Актуальные количества в `scripts/build_report.json`. Общая сцена даёт возможность встречи, но не создаёт отношение или знакомство конкретных NPC. Для пары есть точное правило или `no_source`, а для каждого направления — устная форма или `no_source` того же вида связи. Письменные формулы отделены полем `channel`; `scripts/check.py --probe` проверяет, что удаление покрытия обнаруживается.

После обновления присутствия и расписаний общий расчёт даёт 727 совместных контекстов G5×сезон и 6617 пересечений фаз; числа сверяются `scripts/check.py` и `scripts/build_report.json`.

`book:622242 §519` относится к городским усадьбам; сельский контекст подтверждает `book:648161 §2639`. Ни один из этих источников не устанавливает состав конкретного двора.

**Rework 2026-09-26.** Независимый verifier (см. `VERIFICATION.md`) вернул
5 из 7 таблиц группы на переработку: `household_composition_profiles.csv`,
`kinship_terms.csv`, `psychology_profiles.csv`, `speech_registers.csv`,
`norms.csv`. Все пять исправлены (см. секцию «Исправления 2026-09-26» в
`VERIFICATION.md` и README каждого домена); `marriage_inheritance_rules.csv`
и `address_forms.csv` (`approve_with_limits`) не входили в объём той
переработки; `address_forms.csv` расширен отдельно в D-3.
Статус всех таблиц остаётся `candidate` — переработка не является
самоутверждением.

## Домены и покрытие

| Домен | Файлы | Строк | Приоритет брифа | Статус покрытия |
|---|---|---|---|---|
| households_kinship | household_composition_profiles.csv, marriage_inheritance_rules.csv, kinship_terms.csv, relationship_rules.csv | см. `scripts/build_report.json` | M2c | стартовые пары покрыты; конкретные отношения устанавливаются только при материализации |
| npc_psychology | psychology_scales.json, psychology_profiles.csv | 139 | M2c | покрытие 68 occupation + 71 role; D29 задаёт ровный игровой baseline, не историческое распределение; контекстные мотивы и страхи не изменены |
| speech_address | speech_registers.csv, address_forms.csv | см. `scripts/build_report.json` | M3 | направленные стартовые пары покрыты устной формой или явным пробелом |
| social_norms_honour_hospitality | norms.csv | 19 | M3 | 4 из 5 ранее пустых norm_kind закрыты book evidence; gift всё ещё 0 строк |

Подробности, правила вывода и гэпы — в README.md каждого домена.

Для `pf_peasant_homestead` D-3 читает явную `slot_relationships` из D-2: два названных слота образуют `spouse`. Правило отношения требует материализованных актёров именно из этих слотов; совпадение ролей в другом дворе брака не устанавливает. `form_spouse_smerd*` выпускаются только при такой связи; без неё пара остаётся `unspecified` с нейтральными пробелами обращения.

## Запуск

```
cd scripts
python build.py   # генерирует все CSV, пишет build_report.json
python check.py    # OK: all checks passed — на момент сдачи
python check.py --probe  # удаляет покрытие только в памяти, включая оба направления новой зимней пары
```

## Что НЕ сделано (общие ограничения, оставшиеся после rework 2026-09-26)

- Не читались: v6 g3 household_estimate/household_mix, rus13tpl
  household_wealth_profiles/name_pools/npc_archetypes, sqlite
  `novgorod_1230(1) (1).sqlite` (вне разрешённых для этого сборщика
  read-only путей), gramoty.ru корпус берестяных грамот (для address_forms.csv,
  вне объёма этой переработки).
- Книжная BOOK EVIDENCE этой группы (255 строк, verified,
  `servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv`)
  теперь использована — в households_kinship/kinship_terms.csv,
  households_kinship/household_composition_profiles.csv (численность двора) и
  social_norms_honour_hospitality/norms.csv; **не** привязана построчно к
  npc_psychology/psychology_profiles.csv (общий психологический материал
  этой evidence остаётся гэпом для отдельного прохода — см. README домена).
- Не запускался WebSearch/WebFetch для внешнего исследования.
- `status_rules` (draft, nov_region_audit) — не прочитан, хотя лежит в
  разрешённом пути.

Все эти пункты перечислены как открытые гэпы в README доменов, а не
скрыты и не выданы за выполненные.
