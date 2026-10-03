# D65/D67: кандидат общих данных минимального боя

Статус работы: подготовлен unapproved candidate bundle; D67 не пройден. В кандидате `status=candidate_not_approved`, `production_usable=false`, общий fallback на сценарий запрещён. Материалы не меняют контракт, runtime или базу данных. Пины checkout и SHA256 источников находятся в `source-map.json`.

## Предлагаемый минимальный scope

Поддержан как candidate один технический шаг `melee_attack_step`: одна проверка, один расчёт вреда и потеря здоровья, если она следует из профиля. Норма даёт формулы атаки/защиты, margin-to-quality, harm и health loss; из нулевого здоровья следует incapacity, а не автоматическая смерть. В отчёте combat-min прямо ограничивает первый этап без долговременных injuries/diagnosis/treatment и требует повторной проверки тела, цели, предметов и позиции перед поздним шагом.

Для NPC без persisted body учтено решение ведущего и его дополнение (`combat-min/answers.md:140–153`): `@rus/body-state` инициализирует при первом боевом P16 commit из approved `actor_base_attributes_v1` и identity, с чтением persisted row первым. Добавлен D71 профиль-кандидат v1: health=100, energy=80 при endurance=10 с правилом `clamp(80 + 2 * (endurance - 10), 60, 100)`, satiety=70. Это игровая гипотеза, а не исторический вывод: 100/80/70 взяты только как аналогия к scoped candidate first-playable boatman body_profile; коэффициент endurance→energy предложен по смысловой аналогии с domain guide. Профиль требует полного source-pinned `actor_base_attributes_v1` и версионированного identity snapshot; identity ref/version/digest связывает субъекта, sex/age/build не меняют показатели в этом proposal. Hard bounds body-state — 0..100; candidate calibration bounds: health 80..100, energy/satiety 60..100. D71 метка только во внутренних metadata. Профиль остаётся unapproved: его нельзя использовать как fallback или runtime initial state до approval body-state owner и D67; failure/missing input — gap этого NPC. 100/80/70 из сценарного каталога не загружаются как профиль.

Короткие подтверждающие выдержки:

- Норма check, `book` источник не использовался: `combat_system.md:115` — «d20 + бонус характеристики + бонус боевого навыка».
- Норма health, `combat_system.md:376` — «новое здоровье = старое здоровье − потеря здоровья».
- Граница incapacitation, `combat_system.md:410` — «персонаж не может нормально действовать».
- Ограничение CR #224, `combat-cr.md:35` — «нулевое здоровье само по себе не доказывает смерть».

Для каждой формулы applicability к generic v17 пути остаётся pending: CONTRACT_INDEX помечает `combat_system.md` как ACTIVE DOMAIN NORM, но документ сохраняет header rev16 / spatial-v3-v6. Наличие формулы не утверждает generic value binding. Источники должны быть закреплены владельцами до production use.

## Weapon mapping

Candidate связывает факты и capability refs, а не выводит механику из военного tier, роли, категории, массы или частоты. `game-base` явно candidate: строки дают идентификатор, вид/категорию, material, частоты, доступ, condition и provenance, но сами не задают combat danger, reach или protection. Из существующих правил включены:

- явный безоружный удар кулаком → danger 1 по примеру действующей боевой нормы;
- `ordinary_armament.light.v1` → 1 при состоянии `serviceable`, 0 и недоступность при `damaged`, только при наличии этого exact capability ref;
- D47 action-produced enum → code-owned danger 0/1/2 только для одного выбранного предмета и текущих player-safe physical facts;
- кандидатные строки `wp_sword`, `wp_spear`, `wp_rogatina`, `wp_battle_axe`, `wp_knife`, `wp_long_knife`, `wp_club` связываются с ровно совпадающими примерами действующей danger-нормы (3/3/3/3/2/2/2); их game-base status остаётся candidate, каждый mapping ожидает D67 approval;
- другие catalog melee rows остаются в typed gap, если имеющиеся поля не задают точный normative type/use. Ranged и mounted rows вне среза. D47 qualitative action-produced mapping не применяется к catalog rows.

Даже существующие runtime mappings остаются candidate для общего D67 пути; это не row-by-row approval каталога. Неизвестный, повреждённый, двусмысленный или множественный набор предметов блокирует только этот шаг с typed gap.

## Время и D71

Собранные исследования не дали измерения длительности боевого удара/обмена/ухода для Новгорода около 1230 г. Современные демонстрационные, лабораторные, спортивные и клинические времена из `combat-research` имеют другую задачу/эпоху и не превращаются в профили боя. Значения Lower Dvina, включая 2 минуты, не переносились.

Для review предложено одно точное игровое значение: один `melee_attack_step` длится `1/10` минуты (6 секунд), внутри D71 bounds 5–10 секунд (`1/12–1/6` минуты). Это явная unbenchmarked калибровка игрового темпа: один ограниченный resolved step на шестисекундный slice, десять таких slices в игровую минуту. Она не является историческим фактом и не заявлена утверждённой. Стенд сравнивает 5/6/10 секунд. Pending остаются независимое D67 approval, подтверждение clock owner и generic rational sub-minute handoff. Проверка temporal contract подтверждает каноническое представление дроби и разрешает положительное время time-bearing success; текущий turn helper из gap matrix ограничен целыми положительными минутами.

Сдача и решение `break_contact` сами по себе — NPC intents, не физический эффект. Boundary event не двигает clock в candidate при условии отдельного подтверждения time owner, что это зарегистрированный zero-time control outcome. Реальное опускание/отпускание предмета, путь к выходу, движение, elapsed time и progress здесь не реализованы: typed gaps остаются открытыми до approval соответствующих owners.

## NPC boundary и допустимые факты

Candidate использует начальное решение при входе в бой и агрегированную decision boundary после unconsumed material/critical signal, который меняет известные NPC факты, capability или исполнимость intent; same-time факты сначала проходят temporal recheck. Обычный hit/miss, защита, неизменившийся техшаг, tick, replay или не замеченное NPC скрытое изменение сами по себе не требуют нового решения.

В decision context входят current intent/status, causal signals, собственное известное тело/возможности NPC, perception snapshot видимых участников и распознанных угроз, известные позиции/выходы/опасности/неопределённость, а также только source-pinned индивидуальные цели/страхи/обязательства/отношения. Из него исключены скрытое здоровье оппонента, скрытые участники/намерения и следующий бросок. `surrender`/`break_contact` — семантический выбор, не гарантия успеха; код отдельно подтверждает физический маршрут и его progress. Candidate не назначает bravery/fear probabilities, motive по occupation, universal HP threshold или invented exit.

После F01 D72 кандидат покрывает непрерывный вещественный диапазон без округления: low `[0,30)`, moderate `[30,70)`, high `[70,100]`; `29.5` и `69.5` классифицируются ровно одной полосой. Границы 30/70 — игровые калибровки D71 с допустимыми интервалами настройки; они не описывают исторические/медицинские факты и не управляют attack/surrender. Фразы сообщают только агрегированное состояние. Неизвестное значение/readback error пропускает соответствующее поле и сохраняет typed gap; неподтверждённый стартовый D71 профиль не подставляется. Guide `character_parameters.txt:110–115` задаёт общую шкалу 0–100 и грубые качественные состояния, но не утверждает runtime-пороги; соответствие `energy` ↔ `бодрость` требует решения владельца. Причинные symptom descriptions не перенесены.

## Исправления независимого аудита F01–F08

Authoring-предложение отделено от owner DTO `rus.body_state.initialization_profile.v1`. Адаптер задаёт только тестируемое преобразование полей, но закрыт до approval: `candidate_emission=null`, профиль остаётся `candidate_not_approved`. Исполняемый interface bench закреплён за combat-min HEAD `8ef2b6494a88589ef88b7bacf13a9c427408e91`: pinned validator принимает 12 полноформатных actor snapshots с `profile_ref`, `generation` и `trace`, отвергает 3 malformed snapshot; все 12 принятых exact-регенерируются. Тестовый approved DTO принимается initializer, proposed profile отвергается. Actor-bound check request повторно сверяет actor/target refs перед исполнением и fail-closed.

Для вреда сохранена сырая нормативная сумма (`hit_quality + weapon_danger + target_vulnerability - target_protection`) и отдельно помечено производное runtime clamp `max(0, raw_damage_score)`, со ссылкой на закреплённый runtime source. Полноформатный D47 mapping теперь проверяется как typed integer enum, а вложенные `source_refs` разрешаются рекурсивно. Schema/type/path assertions охватывают весь ожидаемый inventory gaps, включая неизвестную защиту и уязвимость цели. Для append-only answer refs применены excerpt hashes вместо нестабильных полных хешей; duration остаётся внутренней self-derived calibration locator без притворного независимого source hash.

Модельный D72 probe `20261003T113408.427993Z-1` поставлен в очередь через `bench-request`; он использует pinned combat-min import root. На момент этого отчёта результат executor не пришёл. До результата естественность/утечки текстов моделью не проверены.

## Typed gaps, проверки и ограничения

`typed-gaps.json` фиксирует contract applicability, actor/target input bindings, approval семи кандидатных weapon rows и неподдержанные melee variants, target vulnerability/protection facts, NPC body readback/commit, D71 approval, rational clock handoff, auto-defense timing, retreat movement, individual surrender basis, generic perception binding and physical surrender effects. Числовые игровые параметры health/energy/satiety и duration теперь имеют D71 предложения, rationale и границы; оставшиеся gaps относятся к фактам мира, source/applicability binding и runtime-owner handoff, а не к отсутствию исторического источника для игрового числа. Каждый gap называет owner, consumer, причину и условие закрытия. Это не утверждение, что соответствующий механизм уже доступен.

После F01–F08 валидатор дополнительно требует точные формулы check/raw harm/health, отдельную derived harm normalization, типизированный полный D47 enum, рекурсивно разрешённые ссылки, точные схемы/типы всех typed gaps и required target-protection/vulnerability gap. Для D72 проверяется непрерывное покрытие finite real диапазона 0..100 с явной включительностью концов и без округления. Append-only source refs закрепляются хешами выдержек; длительность адресована точным JSON locator как self-derived calibration. `--self-test` проверяет ожидаемые коды отказа для негативных мутаций, включая отсутствие полосы, разрыв диапазона, потерю D71 label, подмену нейтрального описания причинной фразой и нулевой default. Bench runner с фиксированным seed исполняет combat check/harm границы, 15 body mapping cases A/B/C и полноформатные snapshots, 15 D72 cases, exhaustive 303 integer values плюс 36 дробных boundary checks (12 на каждую метрику), а также 1000 синтетических checks. Проверка D72 сравнивает только точный candidate output и пропуск поля, а не naturalness. Для десяти шагов варианты 5/6/10 секунд дают ровно 5/6, 1 и 5/3 минуты. В синтетическом sample получено quality `{0:615, 1:162, 2:189, 3:34, 4:0}` и health loss `{0:615, 5:351, 12:34, 25:0, 45:0}`. Эти частоты зависят только от тестового seed/фикстуры и не являются runtime defaults. Dry-run не проверяет модель, NPC выбор, контрактную применимость, persistence/replay и не проходит D41.

Код/данные репозитория, БД и сервисы не изменялись. D41 review числовых/контекстных данных этого bundle и отдельное D67 approval не выполнялись. Body-варианты стенда являются только числовым сравнением synthetic proposals; они не калибруют историческую достоверность и не проходят D41/D67. В canonical `/srv/novgorod-work/benches/combat-data/` ничего не записывалось: bench подготовлен в разрешённом `out/bench/combat-data/`; production model run и перенос оставлены ревьюеру по принятому процессу.


## Обновление после DONE-combat-data-4

Первый executor для D72 model probe (`20261003T113408.427993Z-1`) завершился через 0.064с с `ENOENT`, без опубликованных файлов и без вызовов модели. После постановки выяснилось, что его runner ещё указывал import root `ref-pr98`; runner уже исправлен на pinned `/srv/novgorod-work/worktrees/combat-min`. Локальная проверка подтвердила импорт всех пяти production modules, `node --check` и offline `--check` PASS. Повторный запрос `20261003T114450.782101Z-1` отправлен через `bench-request`; результат ожидается автоматическим прогоном и пока не проверен.


### Диагностика staging ENOENT

Read-only аудит bench executor установил, что staging копирует только каталог `out/bench/combat-data-model`; путь runner к candidate в родительском `out/` был недоступен и вызывал ENOENT до любого модельного вызова. Исправление: актуальный candidate snapshot расположен рядом с runner, его SHA256 закреплён в manifest и проверяется offline; URL чтения локальный. Локальные `node --check`, `--check` и snapshot hash проверка PASS. Запрос `20261003T114450.782101Z-1` был отправлен до этой staging-правки; его результат ещё не пришёл, поэтому неизвестно, увидит ли executor исправленный каталог до staging. Дубликат запроса пока не ставился, чтобы избежать двойных вызовов модели.
