# VERIFICATION — resource-catalog

Данные архитектуры ресурсов (#171, шаг 1, часть A; сбор — fleet `b3-data`, автор Codex sol 5.6 + luna). Утверждение — независимый старший проход, не автор (D35, WR §21.1). Данные остаются candidate.

### resource-catalog — данные ресурсов, часть A (B3) — approve_with_limits

Проверено: Claude Opus 5.5 (D35, WR §21.1), три круга 2026-09-28. Круг 1 — Opus (здравый смысл чисел) + Sonnet (механика): CHANGES_REQUESTED, 7 блокеров. Круг 2 — Opus: все 7 закрыты (file:line). Круг 3 — Opus: решение владельца D39/D40 (включение по существованию, а не по пользе) и мелкие правки; всё пересобрано во временной копии.
- Файлы: resource_families.csv, species_resource_families.csv, material_resource_families.csv, extraction_actions.csv, action_skill_map.csv, patch_profiles.csv, tenure_defaults.csv, fish_season_rules.csv, frequency_rule.json, README.md, reports/, scripts/, authoring/ — approve_with_limits
- Скрипты: check.mjs --self-test OK (40 отрицательных проб, 39 кодов, в т.ч. ACTION_IDENTIFY_OUTCOME_INVALID, TRAIT_RAPTOR_GAME_BOUND, UNBOUND_REASON_INVALID), natural_materials_soils check OK; build обеих частей и build-catalog.cjs дают байт-в-байт тот же результат (607 файлов game-base-v1; 61 домен / 21 группа).
- D39 (скриптом): 553/553 видов привязаны, 0 unbound, 762 привязки. 155 прежних unbound: F29 — 115 (79 птиц, 24 зверя, 12 гадов и грызунов-вредителей), из них F29+F30 — крот, водяная полёвка, летяга; F32 — 79 птиц; F20 — 25 беспозвоночных; F09 — 9 папоротников и плаунов и спорынья; F04 — 5 кустарничков. Итог: F29 188, F30 16, F32 151, F34 17 (хищные, не в F29), совы — F29+F32. Межцарственных привязок 0, совпадений с denylist анахронизмов 0.
- Частота: «подходящая среда» — join привязанных видов с habitat ubiquitous|common по place_family/water_body в сезоне генерации (spring_rasputitsa → spring), иначе глобальная шкала places-binding. F10/F11/F32/F33 исключены до patch-профилей; F11/F32/F33 — rare 125000 ppm; F29 — обитание и следы, встреча — отдельный бросок.
- F09: 85 трав сверены с phenology_by_month (0 расхождений, 0 зимних месяцев); папоротники V–X, плауны IV–XI; лещина VIII–IX 1000 г/ч; жёлуди IX–X 4000 г/ч; спорынья VII–VIII, 50–300 г, 100 г/ч (верхний край ручного сбора, editorial). Трутовик в F31, у трутовых грибов нет волны.
- Действия: опознание → misidentification, поиск → потерянное время; класс A без бросков; fell_tree — бросок только при неясном исходе; у track/stalk/check_hunting_trap полосы — найден след или дичь; проверка снастей и раколовок — свет бонусом; вода через прорубь, удочка ночью, моллюски DC 10, сок III–IV, лыко и береста V–VI.
- Числа (урожай, скорость по rate_class, волна 14 дн., near_settlement 0.4, ppm) — basis=editorial. Владение: закрытие I–VI только на общинном пойменном лугу; нет строки — решают права экземпляра.
- Ограничения: candidate — не active binding, не runtime. Действия F27/F30, hunting_methods, разделка и нормы C — следующая часть. F10/F11/F32/F33 без patch-профилей не активировать; F06/F19 — только candidate-действия. Ссылка `resource-catalog-v3` в source_refs — каталог опубликован в #171, в репозитории его нет.
- Ограничения F29: нет ловли руками и выхода по размеру (strike_game требует hunting_weapon) — мелочь пока ловится свободным действием; F29 «подходит» в 37 из 38 place families (мыши, воробьи), поэтому встреча выбирает вид по habitat места. Спорынья — только на ржаном поле; условие «посеяна рожь» профиль не выражает.
- На следующую часть: всем земноводным F20+F29 (сейчас травяная лягушка — только F20, остромордая и прудовая — только F29); три дубля грызунов-вредителей из invertebrates_herps пометить duplicate и разрешить в check.mjs unbound с причиной из закрытого списка (сейчас требуется 0); годность F20 как наживки брать из свойств вида (вши, блохи, клещи, тля — D40); F10 расширить на всех гнездящихся (сейчас 4 птицы); ласке F30 (пустой products в mammals.csv); fauna_presence.csv добавить в habitat_sources; живой отлов певчих птиц и сов (F34) — после #175.

## Независимая проверка rc-next (Claude Opus 5.5, 2026-09-29)

История. Хвосты, оставленные при merge #179, автор Codex sol 5.6. Круг 1 (REVIEW-rc-next): rework по RCN-01…04 (presence дублей, F20 по `group`, basis по набору правил, устаревшие README), решения RCN-05…11. Круг 2 (REVIEW-rc-next-2): R1 — F20 как физическая возможность по группе, закрытый список `physically_impossible` по одному размерному критерию без cue-регэкспов, F20 и typed gap не пересекаются. Круг 3 (DONE-rc-next-3): R1 закрыт.
- Проверено скриптами на копии дерева (незакоммиченный diff против `44caf7b7`).
- **F20.** 22 = 33 недублирующихся insect/arachnid/annelid/amphibian минус 11 `physically_impossible`. У всех 11 одна причина (типичная особь или насаживаемая стадия меньше ~5 мм и не собирается как наживка). Typed gap `bait_size_or_stage` (#178) — те же 11, пересечение с F20 пустое. Cue-регэкспов нет. Derivation не утверждает годность вида. `sourced` только у дождевого червя (`claim:static-bait-b11`). Размер сверен по биологии: среди связанных нет таксонов меньше ~5 мм, среди 11 нет крупных.
- **Пробы.** Отрицательные пробы проверяющего на копии пойманы: связанный таксон в typed gap, F20 у клещей, удалённая F20 у муравьёв, `typed_gap` в derivation, ложный basis у червя, пересказ правила в `nm_bait`. `check.mjs --self-test`: 57 проб.
- **Круги 1–2 не сломаны.** Связей 915 (+167/−14 к HEAD), уникальных видов 539, unbound 14 (3 `duplicate` + 11). F10 137, F30 44/44, F29 186, `sourced` 45 (строковые inline refs), пустых derivation 0. Habitat sources 5. Стартовая территория: 69 видов, 68 со средой, 37 qualifying, не покрыта только чёрная крыса (`no_active_habitat_rows`).
- **Прогоны:** `build.mjs`, затем `check.mjs --self-test --start-territory <codex-data start-territory.json>` — OK; `build-catalog.cjs` — 61 домен / 21 группа; `build-status.mjs` — 22 группы / 313 файлов, его тест 4/4; три пересборки побайтно совпали, файлы группы равны worktree.
- **Ограничения:** данные candidate; размер и стадия для F20 не структурированы (#178), список 11 закрытый ручной; список исключений и правило «локально гнездится» продублированы в `build.mjs` и `check.mjs`; F34 для певчих птиц и сов — после #175.
- README.md — approve_with_limits: F20/F10/F30/basis описаны верно; в строке 23 `perceptual_cues` указан как вход, после R1 сборка его не читает
- authoring/resource-data.mjs — approve: добавлен пятый habitat source `fauna_presence.csv`
- frequency_rule.json — approve: 5 источников, равен пересборке
- reports/counts.json — approve: равен пересборке
- reports/family-summary.json — approve: равен пересборке
- reports/species-unbound.json — approve: 14 = 3 duplicate + 11 physically_impossible, typed gap не пересекается с F20
- scripts/build.mjs — approve_with_limits: F20 по группе без cue; закрытый список 11 и правило F10 скопированы в check.mjs
- scripts/check.mjs — approve_with_limits: пробы ловят нарушения; копия списка исключений из build.mjs
- species_resource_families.csv — approve_with_limits: 915 связей с basis/derivation, candidate; размер для F20 ждёт #178

Вердикт группы: **approve_with_limits**.
