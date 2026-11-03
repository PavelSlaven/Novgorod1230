# Утверждение данных профиля novgorod_dev_watchman — 2026-11-02

- Профиль: `tools/cataclysm-prototype/npc-profiles/novgorod_dev_watchman.json`, весь файл (`npc_snapshot` и `knowledge_snapshot`).
- Автор данных: Claude Sonnet 5.5 high, роль «14 Подключение данных», шаг 6 CR npc-talk.
- Кто утвердил: Claude Opus 5.5, распорядитель — итоговое утверждение (решение владельца D383). Приёмку шага до этого провёл исполнитель npc-talk (Claude Sonnet 5.5): ПРИНЯТЬ.
- Когда (UTC): 2026-11-02T20:27:15Z.
- База проверки: `e878b86cc1e13cdf3ea77910c3346a62f8cff9e8`.
- Коммит утверждённых данных: 0bc08d7b59209de9c4588f00337494617d86bad3.
- Вердикт: APPROVE. Ссылки сверены с файлами базы: `novgorod_social_roles_v1.tsv:9`, `professions.csv:327` (PRO0326), `novgorod_occupations_v1.tsv:5`, `decision-log.md:131` и `:135` (D261, D266), `courtyard.json:66–70`, `time-calendar-church.csv:64`, WK-claim в `place-community-environments-v1.json`. Авторский выбор помечен как авторский и не выдан за источник; часов, колотушки, права задерживать и иных неподтверждённых обычаев в тексте нет. Любое изменение записей профиля снимает утверждение.

Профиль новый: до него у сторожа Прокши была только запись NPC в `tools/cataclysm-prototype/dev-world/npc.json`. Форма — как у `novgorod_dev_master.json`. Значения `state`, `intensity`, `priority`, `confidence` взяты по аналогии с профилем Жирко (читатель `p3-npc-profile.js` схему значений не проверяет).

## Что опирается на источники, а что — авторский выбор

Границу задаёт строка «Источник» в таблице ниже. Историческая опора у профиля одна и общая: сторож/страж ворот и двора существует как занятие и как социальная роль, служит хозяину или держателю места и получает корм. Всё, что рассказывает Прокша о своём нраве, правилах впуска и выпуска и отношении к Жирко, — авторский выбор; в источниках проекта этого нет.

## Социальная роль и нрав (`npc_snapshot`)

| Поле | Значение | Источник |
|---|---|---|
| `social_role.role_ref` | `nov_role_guard` | `data/novgorod-region/novgorod_social_roles_v1.tsv`, строка 9: «страж», историческое название «сторож / страж», «Сторож ворот, торга, двора, пристани, брода или склада»; ранг low, статус free, зависимость service; `approved`, `medium_high`; примечание источника: «точные термины и частные права требуют аудита» |
| `social_role.status` | «сторож двора плотника Жирко, на его корму» | роль — из строки выше; «двор плотника Жирко» — данные dev-мира (`dev-world/npc.json`); корм — `common_income_sources` той же строки: «жалование; корм; добыча только при правовом основании» |
| `identity_state.age_range` | «зрелых лет» | авторский выбор; в данных dev-мира возраста нет. `origin` не задан намеренно |
| `temperament-1`, `temperament-2` | осторожный, немногословный; бережливый | авторский выбор |
| `value-1`, `value-2` | слово хозяина — последнее; безвинного силой не держит | авторский выбор. Ограничение «не вяжу и не задерживаю» согласуется с WK-claim `claim:place-community-local-temporary-watch-can-agree-attention-handover-and-signal` (`data/world-catalogs/novgorod/world-knowledge/production-v1/place-community-environments-v1.json`, `approved`, `directness: editorial`, `confidence: low`): он «не устанавливает… право задерживать прохожих» |
| `goal-1` | достоять ночь так, чтобы хозяин поутру нашёл всё на месте | авторский выбор; смысл — охрана двора, `data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/occupations/professions.csv:327` (PRO0326 «Сторож усадьбы», `historical_names` «сторож», «Охрана ворот, склада и двора», 1180–1260, historical_confidence B, anachronism_risk high) |
| `fear-1` | что чужой унесёт хозяйское добро, а спросят со сторожа | авторский выбор |

## Знания (`knowledge_snapshot.known_facts`)

| `fact_ref.entity_id` | `summary` | Источник | `confidence` профиль / источник |
|---|---|---|---|
| `novgorod-dev-watchman-master` | Двор Жирко; он хозяин, Прокша у него сторожем, хозяин кормит | факт сцены: `tools/cataclysm-prototype/dev-world/npc.json` (два NPC одного двора, `novgorod_dev_master_household`); роль и корм — `data/novgorod-region/novgorod_social_roles_v1.tsv:9` (см. выше) | certain / `medium_high` (роль) |
| `novgorod-dev-watchman-duty` | Стоит ночью, с вечера до утра, пока не рассветёт | решение владельца о ночном окне работы сторожа (`docs/design/decision-log.md:131` D261, `:135` D266; `tools/cataclysm-prototype/dev-world/npc.json` `work_hours` 20–5). Историческими источниками время не засвидетельствовано: механических часов в 1230 году нет (`data/world-catalogs/novgorod/sources/books-evidence-v1/time-calendar-church.csv:64`) | certain / — |
| `novgorod-dev-watchman-guarded` | Берёт под охрану ворота и двор: брёвна на дворе и съестное запасное | занятие — `professions.csv:327` («Охрана ворот, склада и двора»); состав двора (брёвна, сушёная рыба) — данные dev-мира (`tools/cataclysm-prototype/dev-world/courtyard.json:66–70`) | certain / B |
| `novgorod-dev-watchman-guarded-from` | Стережёт от чужих, пришедших на двор ночью | авторский выбор. Опора только по смыслу: `data/novgorod-region/novgorod_occupations_v1.tsv`, строка 5 (`nov_occ_gate_guard`, «страж ворот», `approved`, `medium_high`), `night_behavior`: «спит или сторожит по роли; тревожить ночью опасно; доступ через хозяина, стражу, семью или сильную необходимость» (поле общее для строк таблицы) | certain / `medium_high` |
| `novgorod-dev-watchman-rule-own` | Своих — хозяина и домашних — пускает в любой час | авторский выбор; по смыслу — «доступ через хозяина… семью» (там же) | certain / — |
| `novgorod-dev-watchman-rule-stranger` | Чужого ночью без слова хозяина не пускает: окликнет, спросит, позовёт хозяина; силой не держит и не вяжет | авторский выбор; по смыслу — «доступ через хозяина» (там же) и ограничение права задерживать (WK-claim выше, `editorial_reconstruction`) | certain / — |
| `novgorod-dev-watchman-rule-leaving` | Ночью без нужды никого не выпускает: спросит, куда и зачем; решает хозяин | авторский выбор | certain / — |
| `novgorod-dev-watchman-master-manner` | С Жирко говорит коротко, с почтением; что велит хозяин, то делает | авторский выбор; зависимость службы — `novgorod_social_roles_v1.tsv:9` (`dependency_type` service) | high / — |
| `novgorod-dev-watchman-home` | Живёт при хозяйском дворе | авторский выбор; жилья и сторожки сторожа в данных dev-мира нет, историческая опора для сторожа усадьбы — `professions.csv:327` (охрана двора) | medium / — |
| `novgorod-dev-watchman-belief-night` (belief, `held`) | Кто по чужим дворам ночью ходит — с делом нужным или недобрым; потому и спрашивает | авторский выбор | medium |

У всех известных фактов: `state: known`, `source_event_ref`, `resource_ref`, `process_ref` — `null`. У веры — `state: held`, `source_event_ref` — `null`.

## Чего источники не дают

- Давность службы Прокши, происхождение, плата: в профиле числа давности и происхождения нет.
- Процедура ночного впуска и выпуска (окрик, зов хозяина, колотушка, сигнал) как засвидетельствованный обычай: правила в профиле — авторский выбор, а не пересказ источника.
- Время сторожения: источники числа часов не дают; окно 20–05 — решение владельца для dev-мира.
- Нрав, отношение к хозяину, жильё, возраст.

## Пределы

Профиль задаёт, что Прокша знает и как себя держит. Он не утверждает исторически засвидетельствованную городскую караульную службу, обязательную обязанность, состав смены, право задерживать, колотушку или иной сигнал, плату или иной размер жалования. Правила впуска и выпуска — поведение этого сторожа этого двора для dev-мира.
