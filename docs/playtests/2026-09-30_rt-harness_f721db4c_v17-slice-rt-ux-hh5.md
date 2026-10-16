# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_household_cluster_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-ux`, HEAD `f721db4c5b01a58ad6a924fac3c9e95768886cda`.
- Прогон `rt-ux-hh5`: 2026-09-30T09:32:29.062Z — 2026-09-30T09:55:02.184Z (1353 с).
- Сценарий `novgorod_vikhtuy_household_cluster_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **реальный Giga**.
- Бюджет: 24 ходов (из них 3 зарезервированы под make), дедлайн 26 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:cf12ef18a2bd5b0e0cd3f139`; попыток new-game: 1; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 0.

Что увидел игрок (дословно):

> Вы — Микула, лесной промысловик. Тело не знает ран, сил хватает на работу, а в желудке нет того тягостного, сильного голода, что отвлекает от дела. На ногах низкая кожаная обувь, на себе штаны и нижняя рубаха. День стоит светлый, и вы стоите на низкой, ровной местности, где поверхность покрыта илистым и глинистым грунтом.
> 
> Перед вами виден речной проток и кромка берега. Землю здесь покрывают трава, осоки и кустарник, а у самой воды видна растительность. На поверхности заметны остатки трав и осок, а также обломки кустарниковых ветвей. Вдали видны отдельные деревья, а нижний ярус растительности заполняет пространство между ними.
> 
> В этой низине, среди глины и растительности, находится человек. Это старая женщина с широким лицом, рыжеватыми, но облысевшими волосами и коричневыми глазами. Она носит светлую льняную одежду и низкие кожаные ботинки, стоя среди обломков ветвей и осок, на фоне ровного, низкого берега.

### Ход 1 · нога talk

- Ввод игрока: «Здороваюсь с человеком и спрашиваю, как его зовут.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 0 → 1; реплик NPC в снимке: +1
- Вызовов LLM за ход: 10 · 60 с

Что увидел игрок (дословно):

> Человек говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?». Возможно, она не сказала всего, что знает.

Люди на экране: «человек»

### Ход 2 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 1 → 2
- Вызовов LLM за ход: 5 · 38 с

Что увидел игрок (дословно):

> Вы внимательно изучаете обстановку. В поле зрения — человек, Проход 1, Проход 3 и Проход 4. Человек говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 2 → 3
- Вызовов LLM за ход: 5 · 33 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Старая женщина, живущая у воды, говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?» Вас зовут Микула, и вы лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival; state_version 3 → 4
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Старая женщина, живущая у воды, говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?». Вас зовут Микула, и вы лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival); state_version 4 → 5
- Вызовов LLM за ход: 5 · 32 с

Что увидел игрок (дословно):

> Проход 2. Цель «Проход 2» не достигнута. Женщина говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 5 → 6
- Вызовов LLM за ход: 7 · 36 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек, живущий у воды, обращается к вам: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?» Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 7 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 6 → 7
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 8 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus; state_version 7 → 8
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места. Человек говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?» Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure; state_version 8 → 9
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Перед вами стоит женщина, которая говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?» Вас зовут Микула, и вы лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure); state_version 9 → 10
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы стоите перед Проходом 2, но цель «Проход 2» не достигнута. Рядом стоит старая женщина, которая говорит: «Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?»

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

Люди на экране: «человек»

### Ход 11 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 10 → 11; размещения в G6 игрока: 1 → 0
- Вызовов LLM за ход: 5 · 42 с

Что увидел игрок (дословно):

> Окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 43 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 12 → 13
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами раскрываются окрестности. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 13 → 14
- Вызовов LLM за ход: 7 · 33 с

Что увидел игрок (дословно):

> Перед вами Проход 2, цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 14 → 15
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 15 → 16
- Вызовов LLM за ход: 5 · 30 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 16 → 17
- Вызовов LLM за ход: 7 · 36 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах Окрестностей, где вы, Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 17 → 18
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущего места, и перед вами открываются окрестности. Вас зовут Микула, и ваш род занятий — лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 19 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 18 → 19
- Вызовов LLM за ход: 5 · 26 с

Что увидел игрок (дословно):

> Перед вами Проход 2. Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 19 → 20; запас m2c_finite_driftwood_v1:44d457af877c552c18f78677: — → 100
- Вызовов LLM за ход: 5 · 41 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности. Что именно ты видишь, пока неизвестно.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 21 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 20 → 21; запас m2c_finite_driftwood_v1:44d457af877c552c18f78677: 100 → 99; новые предметы: ordinary_item_20ac79ccf1dcf6f8deb53a1a
- Вызовов LLM за ход: 11 · 47 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подняв его, вы берёте в руки Плавник.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 22 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 409, ошибка WORLD_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): M2C_TARGET_A1_APPLICABILITY_DATA_GAP: M2C_TARGET_A1_APPLICABILITY_DATA_GAP
- Вызовов LLM за ход: 4 · 41 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подняв его, вы берёте в руки Плавник.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 23 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 38 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подняв его, вы берёте в руки Плавник.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 24 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 409, ошибка TURN_NOT_SAVED (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 21 → 21
- Причина на сервере (в HTTP скрыта за TEMPORARY_ACTION_UNAVAILABLE): TURN_STEP_PLAN_INVALID: TURN_STEP_PLAN_INVALID: $.operations[0].action_production.result_descriptor.source_fact_delta only a surviving partial source requires a fact delta; $.operations[0].action_production.material_extent material extent must match the physical identity transition [identity_shape; material_extent_shape]
- Вызовов LLM за ход: 3 · 45 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Подняв его, вы берёте в руки Плавник.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

## Persistence/readback

LLM-вызовы за прогон: 155 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
31× You are a strict evidence auditor of Russian game prose. Sil
22× Return only {"prose":"<complete Russian prose>"}. The server
1× Return only {"prose":"<complete opening>"}. Write 2-4 connec
1× Return only {"pass":<boolean>,"failed_checks":["<required ch
49× Return only one JSON object with exactly these six keys: sch
28× Return only one JSON object containing the semantic choice f
2× Return only one plain JSON object with the semantic conversa
3× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
4× Return only {"replacements":[{"prose":"<complete repaired Ru
1× Return only JSON with exactly mode and support_refs. mode is
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "21",
 "position": {
  "slot": "arrival",
  "origin": "canonical",
  "site_id": "canonical:c5b34c52bcc3041c608b194a903817698f7391573ba4357d2c1bbc1d4844a77a:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access",
  "generated_template": null
 },
 "placements_here": [],
 "npc_placements_all": [
  {
   "slot": "focus",
   "entity_id": "npc_fa85513ac706927ac6de1f43",
   "g6_instance_id": "baseline:g5_node_4eeb8d65a3f4bc9e4d1edb3a:g6:main"
  }
 ],
 "items": [
  {
   "holder": null,
   "item_id": "item_2540ad4ef7b8f1f2fccd3e62",
   "position": "equipped"
  },
  {
   "holder": "player_character_7fb84a3a9cf6aad23045e8e6",
   "item_id": "item_85b42c3afa6ca579890211ef",
   "position": "equipped"
  },
  {
   "holder": "player_character_7fb84a3a9cf6aad23045e8e6",
   "item_id": "item_873dfbf26d35eced61b98dd1",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_875ee0e6830e82ce497c3066",
   "position": "hands"
  },
  {
   "holder": "player_character_7fb84a3a9cf6aad23045e8e6",
   "item_id": "item_962719c0a449c3c34af6884c",
   "position": "equipped"
  },
  {
   "holder": null,
   "item_id": "item_c4830ab79bacf0ea162fdfd3",
   "position": "equipped"
  },
  {
   "holder": "player_character_7fb84a3a9cf6aad23045e8e6",
   "item_id": "ordinary_item_20ac79ccf1dcf6f8deb53a1a",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_2540ad4ef7b8f1f2fccd3e62",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_85b42c3afa6ca579890211ef",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_873dfbf26d35eced61b98dd1",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_875ee0e6830e82ce497c3066",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_962719c0a449c3c34af6884c",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_c4830ab79bacf0ea162fdfd3",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_20ac79ccf1dcf6f8deb53a1a",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:44d457af877c552c18f78677",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:44d457af877c552c18f78677",
   "decrement_numerator": 1
  }
 ],
 "npc_statements": [
  {
   "claims": [],
   "schema": "conversation_statement_event_v1",
   "duration": {
    "owner": "approved_activity_contract",
    "activity_ref": "novgorod_live_world_conversation_brief"
   },
   "spoken_at": {
    "whole_minutes": "261123",
    "subminute_numerator": "0",
    "subminute_denominator": "1"
   },
   "topic_refs": [],
   "exchange_id": "exchange:b109abf74413c539f67817e9bf7d079d",
   "speaker_ref": {
    "entity_id": "npc_fa85513ac706927ac6de1f43",
    "entity_kind": "npc"
   },
   "dominant_act": "answer",
   "statement_id": "statement:b109abf74413c539f67817e9bf7d079deb8afe1a19211b7fdb710a3782ee31a1:2",
   "utterance_text": "Здравствуйте. Меня зовут... эх, я старая, память подводит. Я просто рыбацка, живу у воды. А вы, простите, кто будете?",
   "conversation_id": "conversation:b109abf74413c539f67817e9bf7d079d",
   "source_plan_ref": {
    "entity_id": "semantic-plan:b109abf74413c539f67817e9bf7d079deb8afe1a19211b7fdb710a3782ee31a1:2",
    "entity_kind": "semantic_plan"
   },
   "interaction_tags": [],
   "message_completeness": "complete",
   "social_delivery_result": null,
   "intended_addressee_refs": [
    {
     "entity_id": "player_character_7fb84a3a9cf6aad23045e8e6",
     "entity_kind": "player_character"
    }
   ]
  }
 ]
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:cf12ef18a2bd5b0e0cd3f139, место vikhtuy_locality_household_cluster |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_household_cluster → vikhtuy_locality_work_storage → vikhtuy_locality_water_access |
| meet | pass | на месте vikhtuy_locality_household_cluster: NPC по SQL npc_fa85513ac706927ac6de1f43 |
| talk | pass | реплика NPC записана (+1) |
| take | pass | запас m2c_finite_driftwood_v1:44d457af877c552c18f78677: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TURN_NOT_SAVED |

- **walk out**: ходов движения: 19, из них без смены места: 17; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»
- **meet**: на экране: панель людей пуста; NPC в G6 игрока по SQL: 1
- **talk**: последняя реплика NPC в снимке: {"claims":[],"schema":"conversation_statement_event_v1","duration":{"owner":"approved_activity_contract","activity_ref":"novgorod_live_world_conversation_brief"},"spoken_at":{"whole_minutes":"261123","subminute_numerator":"0","subminute_denominator":"1"},"topic_refs":[],"exchange_id":"exchange:b109abf74413c539f67817e9bf7d079d","speaker_ref":{"entity_id":"npc_fa85513ac706927ac6de1f43","entity_kind":"npc"},"dominant_act":"answer","statement_id":"statement:b109abf74413c539f67817e9bf7d079deb8afe1a19211b7fdb710a3782ee31a1:2","utterance_text":"Здравствуйте. Меня зовут... эх, я старая, память подводи

## Result

**PARTIAL**: start — pass; walk out — pass; meet — pass; talk — pass; take — pass; make — fail.
