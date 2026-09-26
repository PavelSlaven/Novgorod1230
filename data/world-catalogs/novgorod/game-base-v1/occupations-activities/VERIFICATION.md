# VERIFICATION — occupations-activities

- **Кто:** verifier agent (независимый старший проход, не автор данных).
- **Когда:** 2026-09-26.
- **Что проверено:** `game-base-v1/occupations-activities/`:
  - `occupations/occupations_additions.csv` (+ `scripts/build_occupations_additions.py`, `scripts/check_occupations_additions.py`, `README.md`)
  - `carried_inventories/carried_inventories.csv` (+ `scripts/build_carried_inventories.py`, `README.md`)
  - `activities_observable/activities_new_occupations.csv` (+ `scripts/build_activities_for_new_occupations.py`, `README.md`)
  - `npc_runtime_profiles/README.md`, `skills_competences/README.md` (данных нет)
  - `README.md` группы.
- Данные не правились. Git-состояние не менялось.

## Метод

Детерминированные проверки — скриптами в scratch (`scratchpad/gb-fix-occupations-activities/v1.py` и inline-скрипты той же папки), только чтение:

1. Подсчёт строк, уникальность id, непустота `source_refs`, распределение `confidence`.
2. Полная сверка поле-в-поле `carried_inventories.csv` с `sources/master-archive-v1/.../material_entities/inventory_profiles.csv` и `activities_new_occupations.csv` с `.../occupations/activities.csv`, повторный фильтр по 27 `PRO####`.
3. Разрешение всех item-id наборов по `canonical/material_items.csv` (legacy_id) и `material_entities.csv`.
4. Сверка каждой из 18 строк occupations с процитированными строками `professions.csv` (название, historical_confidence, source_ids, anachronism_risk, notes).
5. Сверка `occupation_archetype_id`, формата id и обязательных полей с pinned `Novgorod/data/novgorod-region/novgorod_occupations_v1_enriched.tsv` (68 строк) и с `Novgorod-runtime/packages/materialization/src/approved-npc-runtime-basis.js`.
6. Поиск по WK production-v1 (ключевые слова ru/en) и по BOOK EVIDENCE на servak: `evidence/occupations-activities.csv` (249 строк) и `evidence/crafts-tools-processes.csv` (267 строк), только чтение.
7. Поиск по словарю анахронизмов (цех, гильдия, картофель, табак, сахар, чай, рубль, копейка, стекло и др.) по всем трём файлам.

Выборка на содержательную проверку: 18/18 строк occupations (все), 9/26 carried_inventories (каждая третья, плюс 26/26 механически), 16/135 activities (стратифицировано: 5 A, 7 B, 4 C; плюс 135/135 механически). Итого 43 строки вручную.

## Счёт: README против скрипта

| Файл | README | Скрипт | Дубли id | Без source_refs | confidence |
|---|---|---|---|---|---|
| occupations/occupations_additions.csv | 18 | 18 | 0 | 0 | A 5, B 12, C 1 |
| carried_inventories/carried_inventories.csv | 26 | 26 | 0 | 0 | B 26 |
| activities_observable/activities_new_occupations.csv | 135 | 135 | 0 | 0 | A 40, B 85, C 10 |
| npc_runtime_profiles | 0 | нет файла | — | — | — |
| skills_competences | 0 | нет файла | — | — | — |

Счёт совпадает. Поле-в-поле сверка с источниками: 0 расхождений (carried 26/26, activities 135/135). Повторный фильтр activities даёт ровно 135. Item-ссылки carried: 396/396 разрешаются. Циклов prev/next нет, 216 ссылок prev/next, все внутри файла. Словарь анахронизмов: 0 срабатываний («водк» — ложное совпадение с «доводка»). Цитат длиннее одного предложения нет (полей-цитат в файлах нет).

## Вердикты по файлам

### occupations/occupations_additions.csv — **rework**

Фабрикации строк нет: 17 из 18 строк опираются на реальные строки `professions.csv`, конкретные бытовые детали в основном совпадают с книжными свидетельствами (Колчин в book:622242; book:755331). Но блокирующие ошибки:

1. **`occupation_archetype_id` не разрешаются.** Использованы 6 id (`archetype_urban_craftsman`, `archetype_rural_or_periurban_craftsman`, `archetype_church_craftsman`, `archetype_urban_or_household_craftsman`, `archetype_urban_trader`, `archetype_household_dependent`). Ни один не входит в 12 id pinned TSV (`craft_production`, `trade_exchange`, `domestic_service`, `religious_literate`, `fishing_water` …). Acceptance брифа («archetype id резолвятся») не выполнен. `check_occupations_additions.py` этого не проверяет, хотя его docstring утверждает обратное.
2. **Строки не проходят вход `compileApprovedNpcRuntimeBasis`.** Нет `region_id` и `allowed_social_role_ids`: без них код бросает `NPC_RUNTIME_BASIS_INPUT_INVALID`. Формат id `occ_*` расходится с `nov_occ_*`, `occupation_title_ru` расходится с `occupation_title`. Не хватает и других колонок схемы TSV (period, typical_g3/g4, seasonality, daily_schedule_normal/market/church/crisis и др.).
3. **occ_bowyer: ошибка атрибуции.** PRO0311 «Лучник» в источнике — воин-стрелок (оружие WPN/MIL, «стрельба и обслуживание лука»), а строка переопределена в ремесленника-лукодела с унаследованным confidence A. Лукодел засвидетельствован в другом месте: book:755331 §Часть первая ¶2716 (дерево и рог, клей, жилы, пресс/тиски, медные полосы). Нужно сменить ссылку и поставить confidence не выше B. «Склейка месяцами» и «дерево+кость» источником не подтверждены (в книге рог, а не кость).
4. **occ_dyer: неверная ссылка и завышенный confidence.** В README сказано, что в `professions.csv` красильщика нет, но там есть `PRO0062` «Красильщик ткани и пряжи» с historical_confidence C. Строка же сослана на цвета палитры костюма (COL005–007), которые подтверждают крашеную ткань, а не ремесло, и получила B. В книгах красильщик только под вопросом: book:755331 ¶2737 «красильники(?)»; book:622242 ¶1527 даёт medieval_general. WK clothing.json прямо не устанавливает местное крашение. Правильно: C и PRO0062. «Секрет ярко-красного/синего оттенка» не подтверждён.
5. **occ_jeweler_caster: неподтверждённые техники.** «Литьё по восковой модели» подано как основная работа, но book:622242 ¶1748 даёт основной приём XII–XIII вв. — литьё в каменные формы. «Зернь, эмаль-выемка» не подтверждены ни PRO0017, ни WK nonferrous-casting, ни книгами, а выемчатая эмаль для Новгорода 1230 — риск анахронизма. Notes приписывают восковую модель SRC001 через тигли, льячки и формы — это неверная атрибуция. Опора есть: book:709382 ¶705–707 и book:622242 ¶1743 (мастерская литейщика 1220–30-х). Её нужно сослать, а спорные техники убрать.
6. **Пропущенное засвидетельствованное ремесло «щитник».** В README сказано, что отдельной специализации нет. BOOK EVIDENCE это опровергает: Никифор Щитник в 1228 (book:709382 ¶650; book:755331 ¶2773; book:622242 ¶1539), Щитная улица (book:755331 ¶4024), инструмент и материалы щитника (book:755331 ¶2711). Строку нужно добавить.
7. **Пряха.** `PRO0058` «Прядильщик / пряха» (A) и `PRO0427` существуют. Решение оставить пряху внутри ткача — вопрос владельца, но в README не отмечено, что источник есть.
8. **Acceptance брифа «≥1 ссылка на WK или археологию» не выполнен ни для одной строки.** Все ссылки ведут только на master-archive (кандидат, superseded) или на палитру костюма. Прямые ссылки есть в WK (nonferrous-casting: crucible, ladle, mould; approved-construction: известняк для каменных церквей — косвенно для каменщика и известника) и в book evidence (токарь ¶1712–1723, косторез ¶1851–1854, замочник ¶1643, сетевяз ¶1447, мясник/хлебник ¶1480, рыботорговец ¶1484 и book:709382 ¶674–675, кормилица — Русская Правда book:641351 ¶2768 A).
9. Второй пункт брифа (31 caution-занятие → approved) не начат. В README это указано честно.

Строки, которые по существу подтверждены и после правки id и схемы можно утверждать: bone_carver, wood_turner, furrier, ropemaker_netmaker, netmaker, locksmith, arrowsmith, mason, limeburner, icon_painter, brewer_meadmaker (пивовар в книгах только medieval_general), butcher, market_baker, fish_trader, wetnurse (C).

### carried_inventories/carried_inventories.csv — **approve_with_limits**

Чистая детерминированная экстракция 26/26 без расхождений. Все 396 item-id разрешаются (confidence предметов: A 238, B 139, C 19). `max_items` взяты из источника, не выдуманы. Анахронизмов в выборке нет: пергамент, бересто, свинцовые пломбы, щёлок, силки уместны. Ограничения:

1. `confidence=B` проставлен на все строки по умолчанию: в источнике уровень профиля отсутствует, правило в README заявлено. Статус — кандидат, не утверждённое значение. В наборах есть C-предметы.
2. `season=unspecified_all_season` — заглушка. `circumstance` — это `name_ru`, а не категория (дорога/работа/торг). `mark_rule_ref` пуст.
3. `role_or_occupation_ref` — свободный текст `owner_context`, он не ссылается на id занятий (ни `nov_occ_*`, ни новые `occ_*`).
4. При экстракции потеряны поля источника `property_rule`, `availability_class`, `state_modifier`. Среди них единственный профиль `famine_1230` — значимое для старта 1230 состояние.
5. Проверка массы против лимита переноса (acceptance) не выполнена. Опора — master-archive (кандидат, superseded), кросс-проверки по WK и книгам нет.

### activities_observable/activities_new_occupations.csv — **rework**

Экстракция точная (135/135, 0 расхождений, циклов нет), но как данные для рассказчика и распорядка не годится:

1. **`observable_text_ru` шаблонный** и во всех 135 строках несёт мета-фразу «Действие ограничено доступом, сезоном, физикой, навыком и committed-состоянием мира». Это не текст для рассказчика. Есть несовпадения шаблона с занятием: «Солильщик рыбы … сбивает масло», «Известник выбирает подходящее дерево, кору…», «Каменщик переносит брёвна… плахи», у кормилицы «кормит животных».
2. **Строки PRO0311 (5) — боевые действия воина** («выполнить боевую попытку», «нести караул»), а привязаны к ремесленнику-лукоделу. Это наследует ошибку атрибуции из occupations.
3. **`confidence` скопирован с уровня профессии** (`historical_confidence`), а не с действия. Шаблонные действия получают A, например «Лучник: выполнить боевую попытку».
4. **Сезон и длительность не несут информации:** у всех 135 строк `season_scope` = все 4 сезона, хотя строка каменщика в occupations говорит, что зимой кладку не ведут. У всех `duration_estimate.basis=gameplay_estimate` — это не историческая величина.
5. Включены 5 строк PRO0128 (мездрильщик), который не цитируется в occupations. README говорит о «27 PRO за 18 занятиями», а цитируется 26.
6. Нет полей брифа: `occupation_ref` (стоят PRO-id, а не id занятий), `inputs`/`outputs` (не разрешены в items), `pf_id`. Acceptance «входы и выходы резолвятся в items» не выполнен.

### npc_runtime_profiles/ — **rework** (не произведено)

Только README, 0 строк. Бриф (профили для одобренных занятий, G4-композиции) не выполнен. README честно фиксирует разрыв, выдумки нет.

### skills_competences/ — **rework** (не произведено)

Только README, 0 строк. Разложение 12 навыков, уровни и способы обучения не сделаны. Выдумки нет.

## Итог группы

Фабрикаций на уровне строк не найдено, числа и частоты не выдуманы (кроме явно помеченных `gameplay_estimate`). Главные дефекты: неразрешимые archetype id, несовместимость с runtime-схемой, неверная атрибуция лукодела и красильщика, неподтверждённые ювелирные техники, пропущенный засвидетельствованный щитник, отсутствие ссылок на WK и книги, шаблонные тексты activities. Три домена из пяти по существу не закрыты (activities — узкий срез; npc_runtime_profiles, skills_competences — пусто).
