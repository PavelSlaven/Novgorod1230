# rt-harness: живой прогон среза D49 на v17 (novgorod_vikhtuy_work_storage_v1)

Заготовка собрана скриптом из фактов прогона. Findings ниже — факты по ногам; диагноз и выводы дописывает ревьюер.

## Identity

- Ветка `fleet/rt-harness`, HEAD `a3a08013561ad5958bf9f2c8af06f7f4cee822eb`.
- Прогон `run1`: 2026-09-30T03:26:33.877Z — 2026-09-30T03:48:45.148Z (1331 с).
- Сценарий `novgorod_vikhtuy_work_storage_v1`; драйвер `tools/local-play/v17-slice-run.mjs`; ходы идут по публичному HTTP-API (`createGameHttpServer` на loopback).
- Модель: `qwen3.8-27b-uncensored-w4a16-tp2` через OpenAI-совместимый шлюз локальной Qwen; файл настроек `/srv/novgorod-work/prose-test/llm-settings.json` (содержимое, URL и ключ не публикуются).

## Preconditions

- PostgreSQL: docker `postgres:16.14-alpine` через pg-slot, свежая пара `novgorod_world_v17` / `novgorod_party_v17`, стандартный bootstrap v17 (включая импорт волны NPC, D27) с **фикстурными attestation** (`isolated-postgres-test-fixture`): данные одноразовые и не утверждают развёртывание.
- World Knowledge энкодер: **ЗАГЛУШКА (нулевые векторы 1024)** — векторный поиск WK не работает, привязка речи NPC к World Knowledge ослаблена; нога talk оценивается с этой оговоркой.
- Бюджет: 24 ходов (из них 3 зарезервированы под make), дедлайн 40 мин.
- Квалификация модели при старте: выполнена, 19 вызовов LLM.

## Gameplay transcript

### Открытие партии

- Партия `party:c9ea150c4048258f7010723d`; попыток new-game: 2; отказов открытия (AUTHORED_OPENING_AUDIT_REJECTED): 1.

Что увидел игрок (дословно):

> Вы стоите на низком, ровном месте, где илистый и глинистый грунт под ногами кажется тяжёлым. Вокруг раскинулась местность, покрытая травой, осоками и кустарником, а у самой воды видна густая растительность. На поверхности земли заметны остатки срезанных трав и обломки кустарниковых ветвей, которые лежат среди живой зелени. Вдали просматривается речной проток, а его кромка берега чётко очерчена на фоне низины. Отдельные деревья возвышаются над нижним ярусом растительности, создавая редкий силуэт на горизонте.
> 
> Ваше тело не знает ран, и сил достаточно для работы. Сильного голода вы не чувствуете. Вы — Микула, лесной промысловик. На вас надеты штаны и нижняя рубаха, а ноги обуты в низкую кожаную обувь, которая защищает от влажной земли. Летний день наполнен светом, и вы находитесь в нём, ощущая каждую деталь этого пространства. Местность спокойна, и вы стоите в ней, готовый к тому, что принесёт этот день.

### Ход 1 · нога walk out

- Ввод игрока: «Осматриваюсь вокруг.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 0 → 1
- Вызовов LLM за ход: 5 · 34 с

Что увидел игрок (дословно):

> Вы внимательно изучаете обстановку. Поверхность перед вами покрыта илистым и глинистым грунтом, а местность низкая и ровная. В поле зрения открывается речной проток, кромка берега, отдельные деревья и нижний ярус растительности. Землю покрывают трава, осоки и кустарник, а у самой воды видна растительность. На поверхности различимы остатки трав и осок, а также обломки кустарниковых ветвей. В поле зрения находятся Проход 1, Проход 3 и Проход 4.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 2 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 1 → 2
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей. Вы Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 3 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival; state_version 2 → 3
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 4 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed; текст получен через presentation-recovery
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival); state_version 3 → 4
- Вызовов LLM за ход: 7 · 35 с

Что увидел игрок (дословно):

> (текста нет)

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 5 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus; state_version 4 → 5
- Вызовов LLM за ход: 7 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, оглядывая окрестности; вас зовут Микула, и вы лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 6 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 5 → 6
- Вызовов LLM за ход: 5 · 26 с

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
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure; state_version 7 → 8
- Вызовов LLM за ход: 5 · 26 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 9 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure); state_version 8 → 9
- Вызовов LLM за ход: 5 · 25 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 10 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 9 → 10; запас m2c_finite_driftwood_v1:41db3f8467e4a1abe122bccf: — → 100
- Вызовов LLM за ход: 5 · 39 с

Что увидел игрок (дословно):

> Вы оглядываете окрестности.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4»

### Ход 11 · нога take

- Ввод игрока: «Беру плавник.»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 10 → 11; запас m2c_finite_driftwood_v1:41db3f8467e4a1abe122bccf: 100 → 99; новые предметы: ordinary_item_5c585410f52948bef9103fdb
- Вызовов LLM за ход: 11 · 45 с

Что увидел игрок (дословно):

> Вы замечаете «Плавник». Поднимаете его, и предмет оказывается в ваших руках.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 12 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 11 → 12
- Вызовов LLM за ход: 7 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущих окрестностей, где вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 13 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival; state_version 12 → 13
- Вызовов LLM за ход: 5 · 29 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 14 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival); state_version 13 → 13
- Вызовов LLM за ход: 5 · 44 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 15 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 13 → 14
- Вызовов LLM за ход: 7 · 33 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, оглядывая окрестности; вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 16 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 14 → 15
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> Вы переместились в пределах Окрестностей. Вы — Микула, лесной промысловик.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 17 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus; state_version 15 → 16
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> Вы перемещаетесь в пределах текущих окрестностей, оставаясь Микулой, лесным промысловиком.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 18 · нога walk out

- Ввод игрока: «Проход 4»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@focus → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure; state_version 16 → 17
- Вызовов LLM за ход: 7 · 34 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места, где вы, Микула, лесной промысловик, находитесь в окрестностях.

Проходы на экране: «Проход 1», «Проход 2», «Проход 3», «Проход 4»

### Ход 19 · нога walk out

- Ввод игрока: «Проход 2»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure); state_version 17 → 18
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Цель «Проход 2» не достигнута.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4»

### Ход 20 · нога walk out

- Ввод игрока: «Проход 3»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access@departure → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival; state_version 18 → 19; запас m2c_finite_deadwood_v1:fa0366d3de9b02c5ee065fdc: — → 60
- Вызовов LLM за ход: 5 · 40 с

Что увидел игрок (дословно):

> Ты стоишь и смотришь на окрестности. Что именно ты видишь, пока неясно.

Проходы на экране: «Проход 1», «Продолжить путь — выход 1», «Продолжить путь — выход 2», «Продолжить путь — выход 3», «Проход 3», «Проход 4», «Проход 5»

### Ход 21 · нога walk out

- Ввод игрока: «Проход 1»
- HTTP: 200
- Commit-state: committed
- Domain outcome (SQL): позиция cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@arrival → cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus; state_version 19 → 20
- Вызовов LLM за ход: 5 · 28 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 22 · нога make

- Ввод игрока: «Оторву полосу от подола рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus); state_version 20 → 20
- Вызовов LLM за ход: 4 · 50 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 23 · нога make

- Ввод игрока: «Оторву лоскут от нижней рубахи.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus); state_version 20 → 20
- Вызовов LLM за ход: 3 · 41 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

### Ход 24 · нога make

- Ввод игрока: «Отрежу кусок от штанов на повязку.»
- HTTP: 500, ошибка TEMPORARY_ACTION_UNAVAILABLE (turn_commit_status not_started)
- Commit-state: не committed
- Domain outcome (SQL): позиция без изменений (cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path@focus); state_version 20 → 20
- Вызовов LLM за ход: 3 · 47 с

Что увидел игрок (дословно):

> Вы переместились в пределах текущего места. Окрестности. Вас зовут Микула. Ваш род занятий: лесной промысловик.

Проходы на экране: «Проход 1», «Проход 3», «Проход 4», «Проход 5»

## Persistence/readback

LLM-вызовы за прогон: 168 (ошибок транспорта/статуса: 0); по ролям:

```
13× Return only one JSON object containing the ordinary semantic
35× You are a strict evidence auditor of Russian game prose. Sil
21× Return only {"prose":"<complete Russian prose>"}. The server
5× Return only {"prose":"<complete opening>"}. Write 2-4 connec
5× Return only {"pass":<boolean>,"failed_checks":["<required ch
46× Return only one JSON object with exactly these six keys: sch
29× Return only one JSON object containing the semantic choice f
9× Return only {"replacements":[{"prose":"<complete repaired Ru
2× Return only JSON with exactly mode and support_refs. mode is
3× Return only {"pass":true,"concerns":[]} or {"pass":false,"co
```

Финальный SQL-снимок партии (позиция, размещения в G6 игрока, предметы, запасы):

```
{
 "state_version": "20",
 "position": {
  "slot": "focus",
  "origin": "canonical",
  "site_id": "canonical:3a39ebd11f57ac81c880f1f42cad18605e75c3d96e574aa68417b21eff81af5c:site",
  "canonical_g5": "cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_forest_path",
  "generated_template": null
 },
 "placements_here": [],
 "items": [
  {
   "holder": "player_character_b880d90ab174f2f05067c702",
   "item_id": "item_6ca9246d0071d33b14bd0cc0",
   "position": "equipped"
  },
  {
   "holder": "player_character_b880d90ab174f2f05067c702",
   "item_id": "item_b6c74dcec9afd0657473fc53",
   "position": "equipped"
  },
  {
   "holder": "player_character_b880d90ab174f2f05067c702",
   "item_id": "item_c4a50ab2a533bd23ff198c07",
   "position": "equipped"
  },
  {
   "holder": "player_character_b880d90ab174f2f05067c702",
   "item_id": "ordinary_item_5c585410f52948bef9103fdb",
   "position": "hands"
  }
 ],
 "party_items": [
  {
   "item_id": "item_6ca9246d0071d33b14bd0cc0",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_b6c74dcec9afd0657473fc53",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "item_c4a50ab2a533bd23ff198c07",
   "state_version": 1,
   "action_production": false
  },
  {
   "item_id": "ordinary_item_5c585410f52948bef9103fdb",
   "state_version": 1,
   "action_production": false
  }
 ],
 "resource_nodes": [
  {
   "state_version": 1,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_deadwood_v1:fa0366d3de9b02c5ee065fdc",
   "quantity_numerator": 60,
   "quantity_denominator": 1
  },
  {
   "state_version": 2,
   "lifecycle_state": "active",
   "resource_node_id": "m2c_finite_driftwood_v1:41db3f8467e4a1abe122bccf",
   "quantity_numerator": 99,
   "quantity_denominator": 1
  }
 ],
 "resource_decrements": [
  {
   "after_numerator": 99,
   "before_numerator": 100,
   "resource_node_id": "m2c_finite_driftwood_v1:41db3f8467e4a1abe122bccf",
   "decrement_numerator": 1
  }
 ],
 "npc_statements": []
}
```

## Findings

| нога | итог | причина |
|---|---|---|
| start | pass | партия party:c9ea150c4048258f7010723d, место vikhtuy_locality_work_storage |
| walk out | pass | места Вихтуя по ходу: vikhtuy_locality_work_storage → vikhtuy_locality_water_access → vikhtuy_locality_forest_path |
| meet | blocked | ни одного видимого NPC на местах: vikhtuy_locality_work_storage, vikhtuy_locality_water_access, vikhtuy_locality_forest_path (бюджет ходов исчерпан) |
| talk | blocked | нет видимого NPC: meet не пройден |
| take | pass | запас m2c_finite_driftwood_v1:41db3f8467e4a1abe122bccf: 100 → 99, предмет в руках |
| make | fail | все 3 фразы без предмета; последняя причина: ход не прошёл: TEMPORARY_ACTION_UNAVAILABLE |

- **start**: отказов открытия до успеха: 1

## Result

**PARTIAL**: start — pass; walk out — pass; meet — blocked; talk — blocked; take — pass; make — fail.
