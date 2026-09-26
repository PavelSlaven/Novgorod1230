# npc_psychology — психологические профили NPC (candidate)

Таблицу генерирует `../scripts/build.py`, проверяет `../scripts/check.py`.

## psychology_profiles.csv — 139 строк (68 occupation + 71 role), confidence C (rework 2026-09-26)

Одна строка на каждое занятие `novgorod_occupations_v1_enriched.tsv` и каждую
роль `novgorod_social_roles_v1_enriched.tsv` (все закрыты `check.py`:
покрытие проверено против полного списка `occupation_id`/`role_id`).

**Корневая проблема прошлого прохода (исправлена).** Правило вывода читало
поля `attitude_to_*`, `typical_fears`, `languages_or_speech_notes` (roles) и
`social_risk_if_insulted`, `theft_risk`, `witness_likelihood`,
`common_conflicts`, `common_fears`, `common_goals` (occupations) —
все это шаблонный текст, **одинаковый на 100% строк** (distinct=1 по
скрипту). Подсчёт ключевых слов по константному тексту давал почти
одинаковый результат на все 139 строк (temperament ≈2 сигнатуры,
formal_literate только 4 роли и т.п. — см. VERIFICATION.md). Табличный
вывод из шаблона был вычисляем, но содержательно пуст.

**Закрытые словари** (значения `temperament_weights` / `values_weights`,
без изменений):

- темперамент: `calm, wary, hot_tempered, timid, assertive, sociable, withdrawn`
- ценности: `honour, piety, kin_loyalty, profit, safety, custom, hospitality`

**Новое правило вывода (derivation_rule, воспроизводимо скриптом,
`build.py:rule_temperament_values_from_occ`/`_role`):** использует только
поля, которые реально различаются по строкам —
`occupation_group`/`role_group` (11/10 distinct), `typical_status_range`/
`social_rank` через единую шкалу `wealth_band` (7 distinct), `freedom_status`
(roles, 5 distinct), `combat_likelihood`/`violence_risk` (occupations, 4/5
distinct) — по небольшой фиксированной таблице категориальных весов
(документирована в коде), не по подсчёту слов в шаблонном тексте.
Результат: 16 различных сигнатур темперамента на 68 occupation-строк, 21 на
71 role-строку (было: 3–4 на occupations, ≈2 на roles).

- `risk_traits.violence` — из `violence_risk` (occupations, реально
  различается); `theft`/`witness` — `"unspecified"` (occupations: поля
  шаблонны, distinct=1 — нет сигнала; roles: таких полей в TSV нет вообще).
  Раньше стояло `"unknown"` без объяснения причины; теперь причина явно в
  `fears_motives_note`/derivation_rule.
- `motives`/`fears` — теперь **пустой список**, а не разбор шаблонного
  `common_goals`/`common_fears`/`typical_fears` (тоже distinct=1): разбор
  константного текста давал один и тот же список на все строки, что было
  ложным сигналом различия. `fears_motives_note` (новая колонка) объясняет
  причину и фиксирует гэп прямо в данных.

Все веса — положительные целые (проверено `check.py`); все значения входят
в закрытые словари (проверено `check.py`).

## Гэпы

- Владелец не выбрал шкалу значений (упомянуто в брифе: «Шкалу выбирает
  владелец») — использован рабочий закрытый словарь из 7 значений,
  предложенный этим проходом; требует утверждения владельцем, а не
  собственного утверждения сборщика.
- `motives`/`fears` не заполнены построчно (см. выше) — нет источника,
  который различал бы их по occupation/role; замена шаблонного текста
  фиктивным списком не выполняется намеренно.
- `initial_mood_rules` — текстовое правило-заглушка (baseline=calm плюс
  условия), не полноценная таблица правил по обстоятельствам.
- WK-домены `psychology_behavior`/`social_behavior`, заявленные в брифе как
  источники, как отдельные файлы в WK production-v1 не найдены (только
  строки с такими тегами внутри `foundations-mind-society.json` и других
  общих файлов); не интегрированы построчно в этом проходе — открытый гэп.
- Книжная evidence npc_psychology этой группы (57 строк, verified,
  `servak:/srv/novgorod-work/data/books/evidence/households-psychology-speech.csv`)
  даёт богатый материал общего уровня (страх нищеты, недоверие к друзьям,
  почитание старших, престиж богатства, вера в судьбу/колдовство и т.д.), но
  не привязана построчно к конкретным occupation/role id — использована в
  этом проходе только в `social_norms_honour_hospitality/norms.csv`
  (норм. таблица), не здесь. Открытый гэп для следующего прохода: решить,
  как привязывать общие психологические атрибуты периода к конкретным
  ролям без выдумывания частот.

## Источники

- `data/novgorod-region/novgorod_occupations_v1_enriched.tsv`
- `data/novgorod-region/novgorod_social_roles_v1_enriched.tsv`
