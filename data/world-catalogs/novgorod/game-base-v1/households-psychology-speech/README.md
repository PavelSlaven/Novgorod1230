# households-psychology-speech (candidate, status=candidate — not self-approved)

Группа: двор и семья, психология NPC, речь и этикет. Собрано скриптом
`scripts/build.py` из уже одобренных источников (`novgorod-region` TSV,
WK production-v1 `family-social-context.json`) плюс курированный набор
(kinship-термины, статьи Русской Правды об оскорблении, посевные формулы
обращения, нормы гостеприимства/возраста/табу) с библиографическими и
книжными `source_refs`. Проверено `scripts/check.py` (все проверки проходят
на текущий момент, см. вывод ниже).

**Rework 2026-09-26.** Независимый verifier (см. `VERIFICATION.md`) вернул
5 из 7 таблиц группы на переработку: `household_composition_profiles.csv`,
`kinship_terms.csv`, `psychology_profiles.csv`, `speech_registers.csv`,
`norms.csv`. Все пять исправлены (см. секцию «Исправления 2026-09-26» в
`VERIFICATION.md` и README каждого домена); `marriage_inheritance_rules.csv`
и `address_forms.csv` (`approve_with_limits`) не входили в объём этой
переработки и не менялись, кроме статистики в README households_kinship.
Статус всех таблиц остаётся `candidate` — переработка не является
самоутверждением.

## Домены и покрытие

| Домен | Файлы | Строк | Приоритет брифа | Статус покрытия |
|---|---|---|---|---|
| households_kinship | household_composition_profiles.csv, marriage_inheritance_rules.csv, kinship_terms.csv | 139 / 8 / 32 | M2c | частично: состав двора теперь оценён по book evidence (min/max по wealth_band), но не по relation/sex/age_band (гэп) |
| npc_psychology | psychology_profiles.csv | 139 | M2c | полное покрытие 68 occupation + 71 role; вывод теперь по различающимся категориальным полям, а не по шаблонному тексту; шкала ценностей не утверждена владельцем |
| speech_address | speech_registers.csv, address_forms.csv | 71 / 3 | M3 | speech_registers.csv переработан (правило починено); address_forms.csv по-прежнему частичен: берестяно-грамотный корпус не собран |
| social_norms_honour_hospitality | norms.csv | 19 | M3 | 4 из 5 ранее пустых norm_kind закрыты book evidence; gift всё ещё 0 строк |

Подробности, правила вывода и гэпы — в README.md каждого домена.

## Запуск

```
cd scripts
python build.py   # генерирует все CSV, пишет build_report.json
python check.py    # OK: all checks passed — на момент сдачи
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
