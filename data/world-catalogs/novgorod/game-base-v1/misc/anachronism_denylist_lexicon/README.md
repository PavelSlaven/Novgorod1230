# anachronism_denylist_lexicon — denylist анахронизмов и словарь эпохи

**Статус:** candidate (не утверждено; автор не утверждает сам себя — нужен отдельный проход по WR §21.1).
**Группа:** misc. **Приоритет:** M2c.

## Что здесь

| Файл | Строк | Что это |
|---|---:|---|
| `denylist.csv` | 20 | Единая таблица двух `kind`: `denylist` (17) — конкретный анахроничный термин/образ с причиной, заменой и `match_pattern` для сканирования прозы; `forbidden_assumption` (3) — запрет для `llm_context_packs.forbidden_assumptions`, сформулированный как правило, а не как один термин; `period_term` — пока 0 (см. пробел ниже). Поля: `an_id`, `kind`, `term_ru`, `match_pattern`, `applies_to_domains[]`, `reason`, `earliest_attestation_or_basis`, `modern_gloss`, `replacement_term`, `source_refs`, `confidence`, `note`. |

Счёт строк получен скриптом (`scripts/build.mjs`, вывод `denylist.csv: 20 rows (17 denylist, 3 forbidden_assumption; ...)`).

**Костюмные анахронизмы (ANTI001–020) здесь не хранятся.** Их владелец — `clothing-appearance/garments/denylist.csv` (status: candidate, с колонками `pattern`/`scope`, нужными брифовскому тесту «0 совпадений»). До 2026-09-26 этот файл дублировал те же 20 строк под вторым владельцем и с неверным статусом «approved» — см. «Исправления 2026-09-26» ниже.

## Метод

1. `scripts/build.mjs` пишет 17 ручных `denylist`-строк: 2 подтверждены approved WK claims (паровой двигатель, электромотор — `wk:claim:technology-newcomen-boundary`, `wk:claim:technology-motor-boundary`), 4 — с WK-claim-по-аналогии (картофель источниковый B; кукуруза/томат — тот же claim только по аналогии, C), 1 пересобрана из книжного свидетельства (стеклянные окна, B), 10 — общеизвестные датировки без найденного в проекте библиографического источника (порох/огнестрел, механические часы с минутной стрелкой, столовая вилка, подсолнечник, табак, индейка, кролик как скот, тяжеловозы, чай, кофе, сахар-песок); эти строки помечены `confidence: C` с `note`, объясняющей пробел, и `source_refs: gap:no_project_bibliographic_source_yet` — по правилу «не выдумывай»: датировка не изобретена, но и не выдана за подтверждённую.
2. 3 строки `forbidden_assumption` — формулировки для `world_base.llm_context_packs.forbidden_assumptions` (носитель пуст, 0 строк), выведенные из тех же WK claims плюс правило владельца по #133 (реальные исторические лица).
3. `scripts/check.mjs` проверяет: `kind` из трёх допустимых значений, есть `reason` и `source_refs`, у каждой строки есть основание (`earliest_attestation_or_basis` заполнено ИЛИ `source_refs` резолвится как `wk:claim:*`/`repo:*`/`issue:*`), `confidence` ∈ {A,B,C}, у каждой C-строки есть `note`, каждый `repo:` путь реально существует в репозитории, id уникальны, каждое значение `applies_to_domains` — реальный `catalog.json` domain id, у каждой строки `kind=denylist` заполнен `match_pattern`, и каждый термин из `catalog.json` `conventions.anachronism` покрыт хотя бы одной строкой (добавлено 2026-09-26). Результат — `OK: 20 rows, all checks passed`.

## Приёмка (скрипт `check.mjs` — OK)

- У каждого термина denylist есть `reason` и основание (`earliest_attestation_or_basis` или разрешаемый `source_refs`).
- Проверка по всем доменам каталога на совпадение с `match_pattern` из этого списка (плюс из `garments/denylist.csv` для костюма) — **не выполнена в этом проходе** как отдельный кросс-групповой скрипт (нужен обход всех ~60 доменов извне полномочий одного сборщика misc); см. пробел ниже. Внутри самого файла добавлена проверка catalog-term coverage (см. выше).
- Каждая позиция имеет `source_refs`; для approved/editorial WK claims — `wk:claim:*`, для книжного свидетельства — `book:<id> §... ¶...`, для необоснованных общеизвестных датировок — явный `gap:` маркер вместо придуманного источника.
- Каждое значение `applies_to_domains` — реальный domain id из `catalog.json` (проверка добавлена 2026-09-26; раньше 7 из 14 значений были именами групп, а не доменов).

## Источники

- WK production-v1 (approved/editorial claims): `technology-boundaries.json` → `claim:technology-newcomen-boundary`, `claim:technology-motor-boundary`; `final-static-r7-gap-repair-v1.json` → `claim:r7-potato-must-not-be-assumed-locally-available-in-novgorod-rus-1200-1300` (qualifiers: confidence medium, directness editorial — отсюда B, не A).
- Верифицированное книжное свидетельство (servak, read-only): book:622242 (Рыбаков, Даркевич и др., «Древняя Русь. Город, замок, село», 1985) §Глава четвертая Сооружения ¶1210 (круглое стекло/слюда в богатых постройках) и book:423821 (Рыбаков, «Киевская Русь и русские княжества XII–XIII вв.», 2013) ¶1601 (крестьянские избы топились по-чёрному, малое оконце) — вместе дают B для `an_glass_window_ordinary_house`.
- Issue `#133` (владелец) — запрет на выдуманных исторических лиц у LLM.
- `world_base.llm_validation_rules` / `world_base.llm_context_packs` DDL (`infra/world-base/schema/06.sql`) — носители правил и `forbidden_assumptions`, оба 0 строк в БД.
- `clothing-appearance/garments/denylist.csv` — владелец костюмных ANTI001–020 (candidate); этот файл их не дублирует.
- `C:/Users/Slaven/Documents/РИСОВАЛКА ВЕБ/novgorod_character_1230.md` (character-bible-1230, скопирован в `sources/`) — прочитан; его список анахронизмов (§18 «Главные ошибки») почти целиком перекрывает уже собранные `garments/denylist.csv` (косоворотка, московский кафтан, «викингский» образ, лапти как массовая обувь) — новых уникальных позиций сверх costume-набора не найдено.

## Известные пробелы

- **`period_term` (словарь эпохи) — 0 строк.** Бриф требует «название реалии, современный пояс, запрет модернизмов в прозе» отдельно от денилиста конкретных ошибок. Материал для него (свита, кожух, поршни, гривна кун vs гривна-украшение, верста/сажень) рассыпан по costume/MASTER/economy_social источникам, но не собран как отдельная колонка «современный пояс термина» ни в одном из них — нужен отдельный проход, который явно выберет 30–50 слов и для каждого напишет modern_gloss с источником, а не переносить сюда весь глоссарий смежных доменов без разбора.
- **Кросс-групповая проверка по всем ~60 доменам каталога** (соглашение `anachronism`) не выполнена как отдельный обходной скрипт: это требует прохода по `catalog.json` и всем CSV/JSON всех групп на совпадение `match_pattern` из `denylist.csv` (плюс `garments/denylist.csv` для костюма и `nature-materials-weather/_shared/anachronism_denylist.json` для регионально-отсутствующих таксонов), что выходит за собранные только этим сборщиком (`misc`) файлы. `match_pattern` теперь есть и готов как вход для такого скрипта.
- 10 строк (порох, механические часы с минутной стрелкой, вилка, подсолнечник, табак, индейка, кролик как скот, тяжеловозы, чай, кофе, сахар-песок) держатся на общеизвестной датировке без библиографического источника, уже собранного в проекте; для перехода в `usable_with_caution`/`approved` нужен конкретный источник.
- `fa_no_potato_tomato_maize` и стандалон-строки `an_maize`/`an_tomato` держатся на потatо-claim только по аналогии (тот же колумбов обмен); отдельного источника по кукурузе/томату в проекте не найдено — если он появится, эти строки можно поднять до B.
- `llm_validation_rules` (носитель `validation_type`/`severity`/`repair_instruction` для скрипта-валидатора прозы) не заполнен этим доменом — здесь собран только материал (denylist + forbidden_assumptions), а не сами executable-правила; их формулировка — задача владельца рассказчика/валидатора, использующего этот CSV как вход.

## Исправления 2026-09-26 (см. также корневой `VERIFICATION.md`)

Убраны 20 дублированных костюмных строк ANTI001–020 (владелец — `garments/denylist.csv`, статус candidate, не approved — прежняя пометка «approved» была неверной); добавлен `match_pattern`; `applies_to_domains` переведён на реальные `catalog.json` id; `an_potato` понижен A→B (WK claim editorial/medium); `fa_no_potato_tomato_maize` понижен B→C (только картофель сourced, не томат/кукуруза); убран несourced «ветряной привод» из `an_steam_engine`; `an_glass_window_ordinary_house` пересобран на книжном свидетельстве и поднят C→B; добавлены 10 недостающих каталожных терминов (кукуруза, томат, подсолнечник, табак, индейка, кролик как скот, тяжеловозы, чай, кофе, сахар-песок) как честные C-строки с `gap:`-маркером, кроме кукурузы/томата (аналогия к potato-claim); README count (26→…) исправлен на фактический подсчёт скриптом.
