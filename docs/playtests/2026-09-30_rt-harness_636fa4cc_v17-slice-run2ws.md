# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_work_storage_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-harness`, HEAD `636fa4ccac0364ad8d4041297e15ea3dad0f014c`.
- Прогон `run2ws`: 2026-09-30T03:50:14.487Z — 2026-09-30T04:20:42.371Z (1828 с).
- Сценарий `novgorod_vikhtuy_work_storage_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **ЗАГЛУШКА (нулевые векторы 1024)** — векторный поиск WK не работает, привязка речи NPC к World Knowledge ослаблена; нога talk оценивается с этой оговоркой.
- Бюджет: 36 ходов (из них 3 зарезервированы под make), дедлайн 40 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:eb81d03c861463661fa0070f`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, силы достаточно для работы, а сильного голода нет. На вас нижняя рубаха, штаны и низкая кожаная обувь.
> 
> Перед вами различима вода. Различима кромка берега. Различимы очертания деревьев.

### Ход 1 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 0 → 1
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы внимательно изучаете обстановку. Различимы вода, кромка берега и очертания деревьев. В поле зрения находятся Проход 1, Проход 3 и Проход 4.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 2 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 1 → 2
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы остаётесь в Окрестностях. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 2 → 3
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, обозревая окрестности. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 3 → 4
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Вы не достигли цели «Проход 2».

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 4 → 5
- Вызовов LLM за ход: 7 · 32 с

Что увидел игрок (дословно):

> Вы остаётесь в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 5 → 6
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 6 → 7
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 7 → 8
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 8 → 9
- Вызовов LLM за ход: 5 · 24 с

Что увидел игрок (дословно):

> Проход 2. Не удалось достичь цели «Проход 2».

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 9 → 10; запас m2c_finite_driftwood_v1:2b1bca04f3ab8ce8137031f4: — → 100
- Вызовов LLM за ход: 5 · 39 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 11 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 10 → 11; запас m2c_finite_driftwood_v1:2b1bca04f3ab8ce8137031f4: 100 → 99; новые предметы: ordinary_item_b263162eb5174be63a0561a0
- Вызовов LLM за ход: 11 · 44 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подбираете его, и теперь он находится в ваших руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 12 → 13
- Вызовов LLM за ход: 7 · 40 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 13 → 13
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [operation_semantic_grounding]
- Вызовов LLM за ход: 5 · 57 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 13 → 14
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 14 → 15
- Вызовов LLM за ход: 5 · 41 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 15 → 16
- Вызовов LLM за ход: 7 · 51 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, обозревая окрестности; вы Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 16 → 17
- Вызовов LLM за ход: 7 · 56 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 19 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure); state_version 17 → 18
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 18 → 19; запас m2c_finite_deadwood_v1:4783ba7fc47ced47ab35980f: — → 60
- Вызовов LLM за ход: 5 · 42 с

Что увидел игрок (дословно):

> Вы стоите посреди окрестностей.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4», «Проход 5»

### Ход 21 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 19 → 20
- Вызовов LLM за ход: 7 · 41 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 22 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 20 → 21
- Вызовов LLM за ход: 7 · 42 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 23 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [operation_semantic_grounding]
- Вызовов LLM за ход: 5 · 41 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 24 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 21 → 22
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 25 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure; state_version 22 → 23
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 26 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 23 → 24
- Вызовов LLM за ход: 7 · 37 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 27 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure; state_version 24 → 25
- Вызовов LLM за ход: 5 · 27 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 28 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure); state_version 25 → 25
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [operation_semantic_grounding]
- Вызовов LLM за ход: 5 · 35 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4», «Проход 5»

### Ход 29 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival; state_version 25 → 26
- Вызовов LLM за ход: 5 · 40 с

Что увидел игрок (дословно):

> Вы оглядываете окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 30 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus; state_version 26 → 27
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах Окрестностей, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 31 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival; state_version 27 → 28
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами раскрываются окрестности. Вас зовут Микула, и вы — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 32 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival); state_version 28 → 29
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 33 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus; state_version 29 → 30
- Вызовов LLM за ход: 7 · 32 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 34 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus); state_version 30 → 30
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: Turn-step semantic grounding is invalid. [operation_semantic_grounding]
- Вызовов LLM за ход: 4 · 54 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 35 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus); state_version 30 → 30
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 41 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 36 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area@focus); state_version 30 → 30
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 40 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 235 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
52× You are a strict evidence auditor of Russian game prose. Sil
31× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
68× Return only one JSON object with exactly these six keys: sch
43× Return only one JSON object containing the semantic choice f
16× Return only {"replacements":[{"prose":"<complete repaired Ru
4× Return only JSON with exactly mode and support_refs. mode is
6× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "30",
 "position": {
  "slot": "focus",
  "origin": "canonical",
  "site_id": "canonical:1d6be76a277fc04c8b95f7ce5b29d8d87092c826bfb7cd63f14917cabdc6990c:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [],
 "items": [
  {
   "holder": "player_character_cfd44909b8b0c4a8529a8f24",
   "item_id": "item_85edd750d7e17d7cc1c72436",
   "position": "equipped"
  },
  {
   "holder": "player_character_cfd44909b8b0c4a8529a8f24",
   "item_id": "item_a50cac4694f088d86c08badb",
   "position": "equipped"
  },
  {
   "holder": "player_character_cfd44909b8b0c4a8529a8f24",
   "item_id": "item_bcbbb6a240f45339fe2afea6",
   "position": "equipped"
  },
  {
   "holder": "player_character_cfd44909b8b0c4a8529a8f24",
   "item_id": "ordinary_item_b263162eb5174be63a0561a0",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_85edd750d7e17d7cc1c72436",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_a50cac4694f088d86c08badb",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_bcbbb6a240f45339fe2afea6",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_b263162eb5174be63a0561a0",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 1,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_deadwood_v1:4783ba7fc47ced47ab35980f",
   "quantity_numerator": 60,
   "quantity_denominator": 1
  },
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:2b1bca04f3ab8ce8137031f4",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:2b1bca04f3ab8ce8137031f4",
   "decrement_numerator": 1
  }
 ],
 "npc_statements": []
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:eb81d03c861463661fa0070f, место vikhtuy_locality_work_storage |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_work_storage → vikhtuy_locality_water_access → vikhtuy_locality_forest_path → vikhtuy_locality_meeting_area |
| meet | blocked | ни одного видимого NPC на местах: vikhtuy_locality_work_storage, vikhtuy_locality_water_access, vikhtuy_locality_forest_path, vikhtuy_locality_meeting_area (бюджет ходов исчерпан) |
| talk | blocked | нет видимого NPC: meet не пройден |
| take | pass | запас m2c_finite_driftwood_v1:2b1bca04f3ab8ce8137031f4: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TEMPORARY_ACTION_UNAVAILABLE |

- **walk out**: ходов движения: 32, из них без смены места: 29; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: NPC-размещений во всей партии по SQL: 0

## Result

**PARTIAL**: start — pass; walk out — pass; meet — blocked; talk — blocked; take — pass; make — fail.
