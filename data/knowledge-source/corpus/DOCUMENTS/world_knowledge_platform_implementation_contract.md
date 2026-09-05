# World Knowledge Platform — полный implementation contract

**Проект:** `PavelSlaven/Novgorod1230` / «Русь XIII век»
**Статус:** `ACTIVE` как норматив реализованной World Knowledge Platform production-v1 в PR92 (`4.13.0-world-knowledge.1`). Runtime wiring spatial-v3 production v15 имеет статус `validated_candidate_not_active`; production activation не заявляется этим документом и определяется actual versioned release/binding. Неактивированные optional stages остаются target именно там, где это указано.
**Главный production target:** fully offline gameplay с локальной World Knowledge Platform и локальными весами моделей; облачные модели — пользовательская опция для отдельных LLM-ролей.
**Первый game Knowledge Pack:** factual model реальности, необходимой игре `Novgorod1230`, включая Новгородскую землю около 1230 года и общие знания физики, материалов, химии, биологии и других естественно-научных/бытовых областей.
**Первый target embedding profile:** `ai-sage/Giga-Embeddings-instruct-480M-0826` с exact revision pin при реальном embedding cutover.

---

# 0. Статус документа и порядок работы

Этот документ задаёт активные границы World Knowledge Platform production-v1 и target для явно неактивированных optional stages. Точное production state определяют versioned release/bindings, pack/profile manifests, код и тесты.

Этот документ не активирует runtime release: статус spatial-v3 production v15
и `production_activation` определяет actual versioned release/binding.

Перед первой правкой и перед каждым отдельным cutover агент обязан:

1. установить exact checkout, branch и HEAD;
2. получить актуальное состояние GitHub `PavelSlaven/Novgorod1230`;
3. считать `main` единственным источником уже смерженного production state;
4. если работа идёт в PR92, считать exact checkout PR92 рабочим состоянием задачи, а его base — фактическим parent state;
5. заново прочитать root `AGENTS.md` из этого checkout;
6. прочитать `data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md`;
7. проверить applicable nested `AGENTS.md`;
8. прочитать relevant `MODULE.md`, public contracts/schemas, active profiles/bindings, callers, tests и CI;
9. активную часть сверять с exact production release/bindings и pack/profile manifests; неактивированные optional stages читать как target;
10. не редактировать `AGENTS.md` без отдельного прямого разрешения владельца проекта;
11. не создавать `Novgorod1230_project_instruction_full.md` и не считать его обязательным repository source; если пользователь отдельно передал внешний документ с таким именем, использовать его только как task input для сравнения с canonical repository sources;
12. переиспользовать существующих owners и interfaces;
13. реализовывать минимальный достаточный diff текущего stage;
14. не активировать следующий stage заранее;
15. запускать обязательный Contract Auditor при изменении contracts/schemas/owners/LLM boundary/profile status и перед final acceptance cross-module изменения.

Если конкретное имя package/export/file в этом target расходится с текущим репозиторием, нормативны ответственность и поведение. Агент должен встроиться в фактическую текущую архитектуру самым маленьким корректным способом.

## 0.1. Статическое наполнение и будущая gameplay-testing фаза

Статическая фаза World Knowledge включает архитектурный контракт, максимально
широкую game-need cartography, corpus проверенных фактов и правдоподобных
реконструкций (§0.2), независимую per-claim source/domain либо plausibility
verification, согласованные indexes/vectors и retrieval benchmarks.
Карту проектируют от потенциальных потребностей открытой RPG, включая ещё не
реализованные consumers, а не от наличного corpus или текущего сценария.
Для таких consumers явно сохраняется target status: карта не активирует runtime.

Gameplay Gap Auditor (§112.12) — целевая development/testing архитектура
отдельной последующей фазы, не критерий завершения статического наполнения.
Систематические live campaigns, blind/adversarial explorers, replay и gameplay
saturation запускаются только в явно назначенной gameplay-testing фазе после
статического наполнения и отдельных тестовых проходов основного gameplay.
Наличие development driver/validator само по себе не активирует эту фазу.

Обнаруженный gameplay defect передаётся отдельным finding правильному owner;
статическое наполнение WK не разрешает ремонт inventory, ownership,
materialization, persistence, body, combat, NPC, narration или spatial ради
продолжения живого прогона. Такие findings не превращаются в corpus claims.
Существующие WK runtime integration и обязательные проверки затронутого кода
сохраняются; это разделение фаз не отменяет exact-HEAD CI merge gate.

Статическая готовность не равна полноте мира или gameplay saturation. Она
требует независимо проверенной карты потребностей, явного учёта отсутствующих
и частичных factual families, максимально полного игрового наполнения
этих потребностей и честных границ применимости. Счётчик claims, заполнение
собственной матрицы или отсутствие live findings не доказывают такую готовность.

## 0.2. Игровая реконструкция при недостатке источников

Цель — связная и пригодная для открытой RPG картина мира, не научная полнота
документирования. Недостаток свидетельств о конкретном месте и годе сам по
себе не оставляет ordinary game need без ответа. Разрешены правдоподобные
реконструкции по более ранним или поздним периодам, соседним культурам,
общим знаниям и здравому смыслу, если они не противоречат известным
ограничениям мира. Небольшая историческая неточность допустима; выдавать
реконструкцию за установленный факт или ссылаться на выдуманный источник нельзя.

Различаются установленный факт, обоснованный вывод/аналогия и редакторская
реконструкция. Используются существующие `qualifiers.directness`
(`inferred`, `analogical`, `editorial`), confidence и текстовые оговорки.
Применимость аналогии к игровому периоду не обязана совпадать с датой
предмета-аналога: evidence поясняет перенос и его пределы. Конкретный месяц,
тариф, богатство или социальная реакция не становятся универсальными только
из-за правдоподобия. Варианты и качественные диапазоны предпочтительнее
ложной точности.

В compact model-facing context эти различия сохраняются метками `FACT`,
`INFERENCE`, `ANALOGY`, `EDITORIAL`, `UNCERTAIN`, соответствующими
directness. Structured slice сохраняет прежние qualifiers. Нельзя описать
editorial claim как `FACT` только потому, что он прошёл plausibility review.
`EDITORIAL` означает редакторскую посылку, включая реконструкцию или
обобщение источника; это не метка происхождения источника. Аналогия и вывод
могут опираться как на внешний источник, так и на редакторскую реконструкцию.

Для реконструкции без прямого внешнего свидетельства source имеет
`source_kind: editorial_reconstruction`; citation указывает на реальную
редакторскую заметку с ходом рассуждения и допущениями. Это не научный
источник. Evidence описывает основание правдоподобия, а независимый reviewer
проверяет связность, отсутствие явных анахронизмов/противоречий и полезность
для игры. Отдельное историческое свидетельство на каждую обычную деталь
не требуется. Такие claims не имеют `direct`, `high` или `attested` и
не устанавливают hard exclusion. Существующий per-claim approval (§35.1)
используется без нового ledger, слоя доверия или runtime owner.

Карта потребностей проверяет связные стороны жизни: одежда, инструменты и
пространство работы, процессы, жильё и хозяйство, достаток и его вариативность,
семья, статус, зависимости, публичное и частное поведение. Например, кузнец
должен иметь правдоподобную целостную картину жизни, а не только факт
существования молотка. Те же отношения применимы к другим занятиям и
областям; это не закрытый каталог профессий или готовых реплик.

Approved reconstruction может закрывать композиционную потребность без
прямого свидетельства 1230 года. Отсутствие такого свидетельства не является
самостоятельным P1. Непокрытая сторона жизни всё ещё gap: нельзя заменить
её оговоркой «это определяет actor state» или несколькими частными примерами.
На произвольный вопрос ответ складывается из общих посылок, контекста и
обозначенной ordinary-реконструкции, не из исчерпывающего списка Q&A.

Реконструкция не переписывает committed state, физические ограничения,
каноническую географию, authoritative identity или exact mechanics.
Социальное положение даёт ожидания и варианты, а не обязательное одинаковое
решение всех NPC. Выбор и materialization остаются у существующих owners.
Текущая фаза остаётся статической; live gameplay и ремонт других owners
этим уточнением не разрешаются.

## 0.3. Статическая проверка случайными ситуациями

После широкого наполнения несколько независимых агентов-генераторов создают
разнообразные случайные ситуации в Новгороде и окрестностях XIII века,
не подбирая их под существующие claims. Варируются место, возраст, пол,
профессия, достаток, статус, отношения, занятия, предметы и обстоятельства.
Случайность стратифицирована по независимым от corpus областям потребностей:
каждый batch заранее распределяет случаи между трудом и ремёслами,
хозяйством/одеждой/предметами, строительством и ремонтом, приготовлением и
хранением пищи, транспортом, животными, растениями, физиологией и болезнями,
погодой/сезонами/освещением, водой/почвой/ландшафтом, огнём/дымом, холодом,
материалами/механикой, теплом/химией, экологическими/биологическими процессами,
а также торговлей, правом/институтами, семьёй/обучением/статусом и
коммуникацией/религией/досугом. Это контрольные области выборки, не закрытый
словарь мира, действий или возможных знаний; новые области можно добавлять.

Для текущего прогона ориентир — 20 областей по пять случаев на сотню:
не менее 80 случаев с основной практической, природной или физической
потребностью, не более 20 с основной социально-институциональной потребностью.
Случаи внутри области тоже различаются по необходимому знанию, а не только
именам и декорациям. Генератор сохраняет основную область и конкретную
потребность в знании; пересечения областей допустимы. Область засчитывается
лишь когда ответ реально требует её знания: печь на фоне семейного спора
не проверяет горение. Проверяющий сверяет это по содержанию, не только тегам.
До засчитывания batch публикуются распределение и выявленные пропуски;
перекошенная выборка остаётся диагностической и не увеличивает серию приёмки.
Отдельный проверяющий получает ситуацию и только World Knowledge; он
восстанавливает внешний вид, одежду, хозяйство, имущество, знания, работу,
ожидания окружающих, вероятные реакции и причинные предпосылки. Допустимы
выводы из общих WK premises; неподкреплённая память проверяющего не
используется для маскировки пробела. При retrieval miss проверяются доступные
authoring/compiled claims, чтобы отличить отсутствие знания от плохого поиска.

Существенный gap мешает правдоподобному ответу либо заметно меняет поведение,
устройство мира, доступные предметы/действия, социальную реакцию или причинный
результат. Редкие детали, точные цифры/названия, равнозначные реконструкции и
безопасно выводимые частные случаи не требуют отдельных claims.
Существенные gaps дополняются и проходят обычный независимый review; затем
проверка повторяется на новых, не использованных при исправлении ситуациях.

Для текущей статической приёмки достаточный рабочий порог — три независимые
выборки подряд, не менее 100 ситуаций каждая, без новых существенных gaps.
В каждой выборке участвуют несколько генераторов, а покрытие не сводится
к одной профессии или группе мест. Любой существенный новый gap сбрасывает
серию. Это операционный критерий остановки, а не доказательство полноты мира.
Ситуации, ссылки на использованные WK premises и выводы сохраняются в
существующей области offline benchmarks/audits; новый runtime framework,
integrity ledger или отдельный materializer не нужны.

Эта проверка не запускает игровую сессию, NPC loop или gameplay repair.
Будущий Gameplay Gap Auditor по реальным traces остаётся отдельной фазой.

---

# 1. Назначение платформы

World Knowledge Platform — общий read-only factual layer между открытой semantic situation и semantic reasoning.

Она выносит из ненадёжной внутренней памяти LLM проверяемые сведения о реальном мире и возвращает модели минимальный релевантный factual slice для конкретной задачи.

База предназначена не только для истории XIII века. Она должна постепенно покрывать все **game-relevant factual premises**, которые могут понадобиться для реалистичного разрешения свободного действия, генерации ordinary world details, поведения NPC и объяснения причинных последствий.

К таким знаниям относятся, где это реально нужно игре:

- историческая допустимость предметов, институтов, технологий и практик;
- материальная культура;
- архитектура, жильё, хозяйство и типичное содержимое пространств;
- профессии, занятия, социальные роли и распорядок;
- одежда, внешность и бытовые нормы в контексте;
- право, власть, судебные и административные практики;
- экономика, торговля, меры, деньги и хозяйственные отношения;
- религия, обычаи, язык, имена и формы обращения;
- природная среда, растения, животные, сельское хозяйство;
- свойства материалов;
- механика, тепло, огонь, вода, давление, трение и другие физические зависимости;
- химические свойства и реакции, когда они релевантны gameplay;
- биология, анатомия и физиологический контекст, не принадлежащий уже существующей exact body mechanic;
- технологические процессы, инструменты, входы, условия, промежуточные и конечные результаты;
- качественные и, где действительно нужно, source-backed количественные свойства реального мира;
- другие factual domains, необходимые реальному consumer.

Целевая задача semantic LLM:

```text
Вот релевантные проверенные факты мира.
Вот actor-safe/party-safe состояние конкретной партии.
Используй их как фактические посылки и реши только текущую semantic situation.
```

а не:

```text
Вспомни историю, физику, химию, право и быт из pretraining
и выдай недокументированную догадку за подтверждённый факт.
```

Платформа создаётся ради:

```text
factual correctness
+ historical correctness
+ scientific/physical plausibility
+ меньше hallucinations
+ меньше background prompt
+ меньше main-model input tokens
+ меньше model recall/reasoning
+ меньше cloud cost
+ целево меньше semantic latency
+ возможность использовать меньшие локальные модели
```

## 1.1. Композиционная полнота вместо базы готовых ответов

Нельзя практически перечислить все возможные вопросы игрока, сочетания предметов и формулировки действий.

Поэтому production target — не коллекция заранее написанных Q&A, recipes или canned outcomes, а достаточно полное покрытие **фактических примитивов и типизированных связей**, из которых произвольная ситуация собирается композиционно.

Примеры primitives/relations:

```text
предмет → материал
материал → свойства
предмет → типичное назначение
процесс → inputs
процесс → tools
процесс → required conditions
процесс → outputs
процесс → known failure conditions
профессия → typical practices
профессия → typical tools/items
тип пространства → typical contents/resources/activities
социальная роль → expectations
правовая ситуация → applicable norm/procedure/authority
вещество/материал → qualitative interaction/reaction
животное/растение → habitat/seasonality/use
```

Формулировка «база отвечает на любой вопрос» нормативно означает:

> gameplay-relevant factual premise либо находится в code-owned exact mechanics, либо покрывается production World Knowledge, либо честно возвращается как knowledge gap; LLM memory сама по себе не становится factual authority.

## 1.2. Нельзя заменять отсутствие знания модельной догадкой

Для production-covered factual domain/purpose/context:

```text
required factual premise
→ exact code-owned fact/mechanic
или
→ approved World Knowledge claim(s)
или
→ partial / unresolved / out_of_scope / unavailable
```

Запрещено:

```text
knowledge gap
→ «пусть большая модель сама знает»
→ authoritative factual premise
```

LLM может рассуждать и комбинировать переданные факты, но не должна вводить новую фактическую посылку из pretraining как будто она подтверждена платформой.

Runtime `unresolved` является допустимым честным состоянием. Для production coverage повторяющийся `unresolved` по обязательному question class является authoring/coverage defect и должен попадать в backlog наполнения базы, а не маскироваться prompt-ом.

---

# 2. Главный product invariant: свободная causal game

World Knowledge не является command catalog, action catalog, recipe whitelist или перечнем допустимых предметов.

Игрок и NPC могут попытаться совершить разумное действие, даже если заранее нет конкретного:

- command;
- handler;
- action type;
- recipe;
- item template;
- dialogue option;
- outcome;
- способа использования предмета;
- комбинации существующих объектов.

Отсутствие записи в Knowledge Pack само по себе никогда не является причиной технического отказа свободному действию.

Нормативный принцип:

```text
LLM отвечает за неизвестную разработчику семантику.
World Knowledge предоставляет фактические посылки и ограничения.
Код отвечает за известную механику и authoritative state.
```

World Knowledge отвечает:

> Какие общие факты, ограничения, связи и зависимости реального мира важны для этой попытки?

World Knowledge не отвечает:

> Есть ли такое действие в базе и разрешено ли его выполнять?

---

# 3. Главный production target: offline-first

Конечная базовая поставка должна поддерживать:

```text
game
+ local Knowledge Pack
+ local embedding model
+ local LLM weights
= gameplay без интернета
```

Для полностью локального профиля:

```text
knowledge bundle      → local
knowledge retrieval   → local
query embeddings      → local
query planning        → local
semantic reasoning    → local
party state           → local
narration              → local
network                → 0
```

Отключение интернета не должно ломать simulation в offline profile.

Облако является optional backend для отдельных LLM-ролей, а не обязательной инфраструктурной зависимостью игры.

---

# 4. Model-role independence

Игра не выбирает одну «модель для всего». Каждая semantic responsibility является отдельной логической LLM-role.

Минимальные роли:

```text
world_knowledge_query_planner
semantic_turn
npc_decision
conversation
narrator
translation
```

`translation` optional. Одна физическая модель может обслуживать несколько roles. Разные roles могут использовать разные providers.

Допустимые backend classes:

```text
local model runtime
cloud API
self-hosted remote API
```

Provider/model routing принадлежит `@rus/llm-runtime` либо фактически существующему эквивалентному owner.

Gameplay owners не содержат provider-specific branches.

Production LLM transport policy должен переиспользовать единый owner проекта. Если в active parent уже действует общий `max_output_tokens = 20_000` и hard timeout `120 seconds`, World Knowledge roles используют тот же policy и не создают собственные тесные лимиты.

---

# 5. Narrator отделён от semantic reasoning

Нормативный порядок:

```text
semantic input
→ World Knowledge
→ semantic LLM
→ structured plan
→ domain owners
→ exact mechanics
→ commit / approved working projection
→ narrator
→ UI
```

Narrator может получать:

```text
actor-visible committed/working facts
+ approved event skeleton
+ минимальный релевантный general World Knowledge context
+ style instructions
+ requested output locale
```

Narrator не может:

- создавать новый party object;
- менять outcome;
- менять exact quantities/mechanics;
- придумывать hidden truth;
- добавлять authoritative history;
- materialize actionable entity prose-ом;
- переписывать committed result.

---

# 6. Пользовательская настройка моделей

## 6.1. Simple presets

Минимально:

```text
Полностью локально
Сбалансированный
Максимальное качество
```

Рекомендуемая semantics:

```text
Полностью локально:
  все required roles → local

Сбалансированный:
  simulation roles → local
  narrator → configured cloud provider

Максимальное качество:
  semantic roles → high-quality configured backend
  narrator → high-quality configured backend
```

## 6.2. Advanced routing

Пользователь может назначить provider/model каждой role отдельно.

Изменение модели не меняет gameplay schemas, Knowledge Pack semantics или authoritative owners.

API secrets не хранятся внутри Knowledge Pack или gameplay data.

---

# 7. Целевая архитектура

```text
                         AUTHORING SOURCES

 books / articles / PDFs / datasets / catalogues / official docs / archive
                         ↓
                  OFFLINE INGESTION
                         ↓
                CANONICAL KNOWLEDGE
 sources + evidence + concepts + claims + profiles + localizations
                         ↓
                 VALIDATE / REVIEW
                         ↓
                      COMPILE
                         ↓
               IMMUTABLE KNOWLEDGE PACK
                         ↓
                  PREPARED INDEXES
             exact / structured / lexical / vector
                         ↓
                   KNOWLEDGE CORE
             retrieval + applicability + coverage
                + conflict + ranking + packing
                         ↓
                COMPACT KNOWLEDGE SLICE
                         ↓
                    LLM RUNTIME
                         ↓
                  SEMANTIC PLAN
                         ↓
                EXISTING OWNERS
                         ↓
                       COMMIT
                         ↓
                   NARRATOR / UI
```

---

# 8. Knowledge Core

Отдельная logical runtime responsibility называется:

```text
@rus/world-knowledge
```

Если в актуальном repository уже существует эквивалентный owner/surface, он расширяется вместо создания дубликата.

До появления реального runtime resolver новый runtime package не создаётся только «на будущее». Stage 1 authoring/compiler остаётся у существующего authoring workflow owner.

Knowledge Core pure/read-only относительно gameplay state.

Он владеет:

- runtime knowledge query schemas;
- Knowledge Pack runtime schemas;
- чтением уже загруженного approved bundle;
- exact ref lookup;
- structured filtering;
- lexical retrieval;
- optional vector candidate retrieval;
- deterministic applicability;
- coverage evaluation;
- knowledge verdicts;
- conflict grouping;
- deterministic ranking;
- bounded context packing;
- protected factual assertion assessment;
- typed knowledge errors.

Он не владеет:

- LLM calls;
- model/provider selection;
- party DB reads/writes;
- party state;
- actor decisions;
- narration;
- materialization commit;
- exact gameplay mechanics;
- social/legal consequences;
- hidden party truth;
- global topology;
- time progression;
- RNG;
- combat/body state.

---

# 9. Existing owners сохраняются

Нормативные responsibilities сверяются с current `MODULE_INDEX.md`/`MODULE.md`, но логически остаются такими:

```text
@rus/turn
→ sole player semantic orchestration/boundary

@rus/llm-runtime
→ provider/model transport and role configuration

@rus/runtime-catalog
→ immutable approved runtime catalogs/bundle loading

@rus/items-property
→ items/property/access/quantity/exact item mechanics

social/legal owner
→ formal social/legal consequence

visibility/knowledge/memory owner
→ actor-safe visibility/knowledge projection

Spatial owners
→ topology/placement

world-processes owner
→ process lifecycle/mechanics

temporal owner
→ exact time

combat/body/check owners
→ exact mechanics

party-store/game-server
→ persistence and transaction boundary
```

World Knowledge сообщает factual context и constraints, но не применяет consequences вместо профильного owner.

---

# 10. Главные factual invariants

## 10.1. Knowledge precedence

Если production coverage profile заявляет достаточное покрытие domain/purpose/context, переданный World Knowledge slice является factual authority для main semantic model в пределах этого coverage.

Main LLM не должна заменять его своими воспоминаниями из pretraining.

## 10.2. Missing не означает impossible

```text
missing knowledge → unresolved
```

Нельзя выводить `excluded` из отсутствия записи, low lexical/vector score или мнения LLM.

## 10.3. General knowledge не является party state

```text
historically/scientifically compatible != present here now
```

World Knowledge не доказывает presence, ownership, access, quantity, position, hidden contents или конкретное произошедшее событие.

## 10.4. Objective knowledge не равно actor knowledge

Строго различаются:

```text
WORLD KNOWLEDGE
PARTY OBJECTIVE STATE
ACTOR KNOWLEDGE
```

World Knowledge не является обходом visibility/knowledge owner.

## 10.5. Supported не означает runtime admission

```text
supported
!= present
!= owned
!= visible
!= accessible
!= successfully usable
!= materializable
```

## 10.6. Exact mechanics code-owned

World Knowledge может содержать exact scientific/historical fact или source-backed quantity, но не назначает произвольные gameplay numbers, если ими владеет code owner.

Пример: source-backed температура плавления материала является knowledge fact; конкретная формула урона от ожога остаётся body/combat mechanic.

## 10.7. Committed facts не переписываются

Новая Knowledge Pack revision влияет на будущие semantic decisions, но не переписывает автоматически committed history.

## 10.8. Factual-premise closure для covered domains

Если query получил `covered`, main model должна считать переданный slice закрытым набором authoritative factual premises для данного purpose/context, кроме отдельно переданных code-owned facts.

Model может делать reasoning over facts, но не добавлять новую premise из pretraining.

## 10.9. Grounded inference != new authority

Semantic inference допустима только как вывод из:

```text
World Knowledge claims
+ actor-safe authoritative party context
+ explicit code-owned mechanics/facts
```

Если вывод требует отсутствующей factual premise, результат должен сохранить uncertainty/gap, а не скрыть её.

---

# 11. Knowledge Pack

Reusable unit — `Knowledge Pack`.

Для первого продукта один game pack может включать и исторически контекстные, и общие научные domains. Не требуется вводить pack-composition layer, пока это не станет реальной необходимостью.

Knowledge Pack определяет:

- pack identity;
- immutable revision;
- domains;
- predicate registry/signatures;
- concept namespace;
- applicability schema;
- coverage profiles;
- concepts;
- claims;
- sources/evidence;
- localization surfaces;
- embedding profile compatibility;
- runtime policies.

Пример:

```text
wk-pack:novgorod-1230
```

Для другого setting создаётся другой pack поверх того же Knowledge Core.

---

# 12. Pack manifest

Минимальная logical schema:

```json
{
  "schema": "world_knowledge_pack_manifest_v1",
  "pack_ref": "wk-pack:novgorod-1230",
  "revision_id": "revision:...",
  "status": "production",
  "default_locale": "ru",
  "supported_locales": ["ru", "en"],
  "domains": [
    "material_culture",
    "materials_physics",
    "general_physics",
    "chemistry_reactions",
    "technology_processes",
    "social_norms",
    "law_institutions"
  ],
  "context_schema_ref": "wk-context:novgorod:v1",
  "embedding_profile_ref": "wk-embedding:giga-480m-0826:v1"
}
```

Pack revision immutable. Runtime slice всегда сообщает `pack_ref` и `revision_id`.

---

# 13. Applicability является pack-specific

Knowledge Core не hard-code-ит `year/place/actor` как универсальную модель мира.

Каждый pack объявляет строгую applicability schema.

Для historical/game pack возможны:

```text
time
place
actor/context facets
social/professional context
knowledge access
conditions
```

Общие физические/химические факты могут иметь явно объявленный `context_scope: universal` либо другое строгое pack-defined значение. Пустая applicability не должна неявно означать «истинно везде».

Для технического pack возможны:

```text
product
version
component
platform
environment
```

Нельзя создавать unrestricted arbitrary EAV.

Каждая applicability dimension должна иметь deterministic semantics и реального consumer.

---

# 14. Historical applicability profile

Novgorod pack поддерживает минимум:

```text
time
place
actor/context
conditions
knowledge_access
```

`knowledge_access` имеет strict shape: `class`, `required_facets` и
опциональный `required_values`. `required_values` — map только от уже
объявленного `required_facets` к непустой string или непустому массиву strings.
Для bound class единственный соответствующий facet обязателен
(`occupation_bound` → `occupation_ref`, `role_bound` → `role_ref`,
`specialist_bound` → `specialist_domain`); general/common/domain-internal
classes facet values не задают. Runtime применяет value-match только к actor-facing
`npc_decision`/`conversation`/`narration`; historical applicability и
materialization-support от него не зависят.

Temporal precision:

```text
exact
range
circa
century_part
before
after
unknown
```

Spatial relation examples:

```text
used_in
produced_in
origin_in
trade_available_in
found_in
```

Запрещены автоматические inference без отдельного approved relation/policy:

```text
origin_in → used_in
found_in → produced_in
trade_available_in → common
```

---

# 15. Domain registry первого game pack

Target domains добавляются только вместе с реальным corpus, consumer, predicate semantics и applicability semantics.

Историко-социальный слой:

```text
historical_chronology
material_culture
technology_processes
social_norms
law_institutions
economy_trade
occupations_practices
language_names
religion_customs
environment_natural_history
food_agriculture
architecture_construction
transport_navigation
warfare_equipment
medicine_health_context
```

Общий factual/scientific слой, где он нужен gameplay:

```text
general_physics
materials_physics
materials_science
chemistry_reactions
mechanics_engineering
thermodynamics_fire
hydrology_fluids
biology_anatomy
botany
zoology
ecology_seasonality
weather_climate_context
psychology_behavior
social_behavior
```

Это registry knowledge domains, а не список новых gameplay engines.

В production-v1 `psychology_behavior` содержит проверенные общие premises
восприятия, внимания, памяти, обучения и индивидуального поведения;
`social_behavior` — условные межличностные и групповые закономерности.
Это универсальные `supported_fact` для semantic resolution, materialization
support и source-grounded QA. Они не подменяют исторически контекстный
`social_law_economy` и не устанавливают состояние, мотив, знание, согласие,
отношение, репутацию или обязанность конкретного actor. Claims этого слоя
остаются `domain_internal_only`; решения NPC и exact mechanics сохраняют
прежних владельцев. Общие геологические, гидрологические и атмосферные
premises используют отдельный universal profile существующего `environment`,
не расширяя историческую применимость его contextual claims.

---

# 16. Coverage измеряется по factual needs, а не по количеству записей

Production completeness не определяется размером JSON или числом claims.

Для каждого production profile должны быть объявлены реальные **question classes / consumer needs**, например:

```text
historical_availability
object_identity_and_material
material_properties
item_interaction
material_interaction
process_requirements
process_outputs
known_failure_conditions
typical_location_contents
natural_resources_by_context
occupation_eligibility
occupation_practices
npc_clothing_context
npc_typical_items
npc_daily_routine
npc_common_knowledge
social_expectations
legal_norm
legal_procedure
authority_response_context
economic_practice
food_and_agriculture
animal_plant_context
transport_and_navigation
construction_context
medical_context
language_name_form
```

Coverage profile должен позволять ответить:

> Для каких классов factual needs, в каком time/place/context и для каких consumers мы утверждаем production-useful coverage?

Нельзя объявлять profile `production` только потому, что в domain существует несколько claims.

---

# 17. Canonical data layers

```text
SOURCE REGISTRY
      ↓
EVIDENCE
      ↓
CONCEPTS
      ↓
CLAIMS / RELATIONS
      ↓
COVERAGE PROFILES / REQUIREMENTS
      ↓
LOCALIZATION RECORDS
      ↓
INDEPENDENT PER-CLAIM VERIFICATIONS
      ↓
APPROVED PACK REVISION
      ↓
COMPILED RUNTIME BUNDLE
      ↓
DERIVED INDEXES
```

Derived indexes пересобираемы и не являются source of truth.

Party state не является слоем World Knowledge.

---

# 18. Source registry

Минимальная schema:

```json
{
  "schema": "world_knowledge_source_v1",
  "source_ref": "source:...",
  "title": "...",
  "authors": ["..."],
  "publication": "...",
  "source_kind": "scholarship",
  "citation": "...",
  "rights": {
    "status": "approved",
    "redistribution": "metadata_only"
  },
  "review_status": "approved"
}
```

Базовые `source_kind`:

```text
primary_object
primary_text
excavation
catalogue
scholarship
technical_reference
trusted_structured_dataset
official_documentation
editorial_reconstruction
```

`editorial_reconstruction` обозначает собственную редакторскую реконструкцию
по §0.2, а не внешний научный источник. Citation ведёт к реальной заметке;
автор не придумывает библиографическую ссылку ради заполнения evidence.

Rights metadata — operational project policy и не заменяет юридическую экспертизу.

---

# 19. Evidence

```json
{
  "schema": "world_knowledge_evidence_v1",
  "evidence_ref": "evidence:...",
  "source_ref": "source:...",
  "anchor": {
    "page": "123",
    "section": "...",
    "record_id": null
  },
  "note": "Что именно подтверждает источник.",
  "review_status": "approved"
}
```

Не являются evidence сами по себе:

```text
LLM summary
retrieval chunk
embedding similarity
search score
model memory
```

Production claim имеет approved evidence либо отдельно утверждённый deterministic trusted import profile.

Самостоятельное model memory не доказывает факт. Оно может быть отправной
точкой editorial candidate по §0.2; после независимой plausibility review
evidence фиксирует именно реконструктивное основание, не научное доказательство.

---

# 20. Concepts

Canonical identity language-independent.

```json
{
  "schema": "world_knowledge_concept_v1",
  "concept_ref": "wk:material:oak_wood",
  "domain": "materials_physics",
  "broader_refs": [],
  "related_refs": [],
  "external_mappings": [],
  "review_status": "approved"
}
```

Правила:

```text
local concept_ref = primary identity
external ID = mapping only
broader concept != automatic inheritance of all claims
runtime LLM cannot create approved concept_ref
```

External mappings могут связывать knowledge concepts с existing runtime catalog IDs. Они не создают второй runtime catalog и сами по себе не дают materialization permission.

---

# 21. Claims и typed objects

Claim — минимальная authoritative structured factual unit.

```json
{
  "schema": "world_knowledge_claim_v1",
  "claim_ref": "claim:...",
  "domain": "materials_physics",
  "subject_ref": "wk:material:oak_wood",
  "predicate": "has_qualitative_property",
  "object": {
    "kind": "concept_ref",
    "value": "wk:property:splittable"
  },
  "polarity": "support",
  "applicability": {
    "context_scope": "universal"
  },
  "qualifiers": {
    "typicality": "common",
    "confidence": "high",
    "directness": "direct"
  },
  "knowledge_access": {
    "class": "general_physical",
    "required_facets": []
  },
  "hard_exclusion": null,
  "evidence_refs": ["evidence:..."],
  "review_status": "approved"
}
```

Для scientific/technical facts допускаются только заранее объявленные typed object kinds, например:

```text
concept_ref
literal
boolean
quantity
range
```

Пример quantity:

```json
{
  "kind": "quantity",
  "value": 1000,
  "unit": "kg/m3"
}
```

Пример range:

```json
{
  "kind": "range",
  "min": 600,
  "max": 900,
  "unit": "kg/m3"
}
```

Каждый predicate объявляет допустимые object kinds и, если нужны quantities, допустимую unit family/semantics. Нельзя принимать arbitrary JSON object только потому, что schema его технически сериализует.

Source-backed physical quantity является world fact, но не становится автоматически gameplay formula.

Claim не хранит обязательную human-readable prose как canonical truth. Human/LLM-readable wording принадлежит localization layer.

---

# 22. Predicate registry и signatures

Не используется unrestricted universal relation engine.

Каждый domain имеет небольшой closed predicate registry с deterministic semantics.

Registry обязан для каждого predicate определить минимум:

```text
predicate name
subject concept/domain constraints
allowed object kind(s)
object concept/domain constraints, если применимо
unit family, если применимо
polarity rules
applicability expectations
consumer meaning
```

Examples:

```text
historically_compatible
attested_use
typical_for_context
introduced_after
ceased_before
produced_in
origin_in
trade_available_in
used_by_actor_context
has_qualitative_property
has_quantitative_property
typically_contains
typically_uses
typically_wears
performed_by
requires_input
requires_tool
requires_condition
produces
transforms_into
incompatible_with
reacts_with
supports_known_process
known_failure_condition
social_expectation_in_context
role_expectation
legal_norm_in_context
legal_procedure_in_context
authority_response_context
economic_practice_in_context
linguistic_form_in_context
```

Это examples, не обязательный универсальный vocabulary. Predicate добавляется только вместе с реальным consumer.

---

# 23. Qualifiers

Минимальные общие qualifiers:

```text
typicality:
  common | attested | uncommon | exceptional | unknown

confidence:
  high | medium | low | unknown

directness:
  direct | inferred | analogical | editorial | unknown
```

Compiler обязан валидировать значения и обязательность qualifiers по profile/domain policy.

Низкая typicality сама по себе не является hard exclusion.

---

# 24. Hard exclusion

Hard exclusion требует положительного reviewed основания.

Недостаточно:

```text
нет записи
не найдено поиском
редко встречается
low embedding score
LLM считает странным
```

Для historical pack базовые `basis_kind`:

```text
introduced_after_context
ceased_before_context
not_available_in_region
institution_not_existing
explicit_domain_incompatibility
```

Для scientific domains могут быть отдельные reviewed basis kinds, например `explicit_physical_incompatibility`, но только если semantics и evidence policy реально определены.

`not_attested` не является hard-exclusion basis.

---

# 25. Конфликты и disputed knowledge

Если approved evidence поддерживает несовместимые claims, compiler/reviewer не должен молча выбирать удобный вариант.

Допустимы:

```text
supported
excluded
disputed
unresolved
```

Conflict grouping должно быть deterministic и основано на явной совместимости predicate/subject/applicability, а не на LLM summary.

Semantic model получает dispute как uncertainty, а не как разрешение выбрать понравившийся факт без основания.

---

# 26. Coverage и factual verdict

Coverage:

```text
covered
partial
out_of_scope
unavailable
```

Knowledge verdict:

```text
supported
excluded
disputed
unresolved
```

Нормативно:

```text
partial != excluded
out_of_scope != excluded
unresolved != excluded
```

`unavailable` означает operational failure bundle/index.

---

# 27. Coverage profile

```json
{
  "schema": "world_knowledge_profile_v1",
  "profile_ref": "wk-profile:materials-gameplay:v1",
  "domain": "materials_physics",
  "status": "production",
  "scope": {
    "context_scope": "universal"
  },
  "purposes": [
    "semantic_resolution",
    "materialization_support"
  ],
  "question_classes": [
    "material_properties",
    "item_interaction",
    "process_requirements"
  ],
  "runtime_requirement": "required_when_selected",
  "guard": {
    "mode": "advisory"
  }
}
```

Profile status:

```text
experimental
reviewed
production
```

`production` означает доказанное production-useful coverage для declared scope/purposes/question classes, а не абсолютную полноту человеческих знаний.

Compiler должен fail-closed валидировать scope, purposes, question classes, runtime requirement и guard mode по declared schema.


---

# 28. Localization layer

Фактическая база не дублируется по языкам.

Canonical truth:

```text
concept refs
claims
relations
applicability
evidence
coverage
```

существует один раз.

## 28.1. Concept localization

```json
{
  "schema": "world_knowledge_concept_localization_v1",
  "concept_ref": "wk:occupation:merchant",
  "locale": "en",
  "labels": ["merchant", "trader"],
  "short_definition": "A person engaged in trade in the relevant historical context.",
  "search_aliases": []
}
```

## 28.2. Claim localization

```json
{
  "schema": "world_knowledge_claim_localization_v1",
  "claim_ref": "claim:...",
  "locale": "en",
  "runtime_text": "A short approved factual formulation for model context.",
  "search_aliases": ["..."]
}
```

`runtime_text` — reviewed projection canonical claim, не отдельная factual truth.

Перевод не меняет polarity, applicability, qualifier, evidence или identity.

---

# 29. Языковая стратегия

Первый mandatory proof поддерживает минимум:

```text
ru
en
```

Для first-class locale должны существовать, где применимо:

```text
concept labels
claim runtime_text
search aliases
localized retrieval text
precomputed embedding entries
prompt/model language support
narrator output support
```

Новый locale не создаёт новый canonical fact.

---

# 30. Translation fallback

Translation — transport/localization step, не factual owner.

```text
user semantic input in locale X
→ translation role
→ supported retrieval/reasoning locale
→ normal Knowledge Core + semantic path
→ structured result
→ narrator/translation into locale X
```

Translation не имеет права:

- создавать concept refs;
- менять structured IDs;
- менять quantities;
- менять historical/scientific meaning;
- превращать unresolved в fact;
- менять committed result.

Structured refs/enums/numbers не переводятся.

---

# 31. Canonical authoring storage и sharding

World Knowledge расширяет существующий `data/world-catalogs/...` authoring workflow и не создаёт второй источник истины.

Полный game corpus не должен храниться одним гигантским `authoring.json`.

Логически допускаются:

```text
manifest
sources/
evidence/
concepts/
claims/
profiles/
localizations/
staging/
reports/
revisions/
```

Точная physical serialization следует repository conventions.

Минимально достаточный sharding contract:

- один versioned pack manifest;
- manifest или authoring descriptor содержит explicit ordered/normalized `includes` либо эквивалентный repository-native список authoring fragments;
- CLI/authoring loader читает fragments и собирает один in-memory canonical pack;
- pure validator/compiler получает уже собранные records и сам не делает filesystem I/O;
- global refs, duplicate IDs, predicate signatures, conflicts и localization completeness проверяются **после объединения всех fragments**;
- порядок файлов не должен менять compiled result;
- implicit recursive glob с неочевидной semantics не нужен, если explicit includes решают задачу.

Canonical truth:

```text
approved repository records + pack manifest/revision
```

Не canonical:

```text
vector index
runtime cache
compiled bundle
LLM memory
PostgreSQL mirror
```

---

# 32. Authoring / ingestion pipeline

```text
SOURCE DISCOVERY
→ RIGHTS / SOURCE REGISTRATION
→ OPTIONAL PARSING/OCR
→ EVIDENCE CREATION
→ CANDIDATE CLAIM EXTRACTION
→ CONCEPT LINKING
→ DOMAIN/PREDICATE TYPING
→ APPLICABILITY VALIDATION
→ DUPLICATE / CONFLICT CHECK
→ COVERAGE MAPPING
→ STAGING
→ LOCALIZATION BUILD
→ INDEPENDENT REVIEW
→ APPROVED REVISION
→ COMPILE
→ RUNTIME BUNDLE
```

Rules:

1. runtime не читает staging;
2. parser/OCR output не является claim;
3. LLM extraction не self-approves;
4. conflicting sources не скрываются автоматически;
5. structured production claims имеют source/evidence lineage либо approved deterministic import profile;
6. gameplay runtime не исследует web;
7. raw copyrighted corpus не пакуется в игру без redistribution rights;
8. authoring agents могут использовать web/источники только offline during build/review;
9. coverage report является authoring artifact, а не runtime truth.

---

# 33. Миграция полусырого архива

Существующий пользовательский архив должен проходить отдельный staging audit до переноса полезного содержания в approved Knowledge Pack.

Нормативный pipeline:

```text
RAW ARCHIVE
→ inventory
→ classify source/file type
→ identify duplicates/near-duplicates
→ identify source provenance and rights
→ split source text from editorial notes/model output
→ extract candidate concepts/claims
→ attach or reconstruct evidence lineage where possible
→ map to domains/predicates/applicability
→ detect contradictions and unsupported assertions
→ normalize terminology/refs
→ coverage contribution report
→ independent factual review
→ approved authoring fragments
```

Для каждого archive record должен получиться один из результатов:

```text
APPROVE_AS_SOURCE/EVIDENCE
APPROVE_AS_STRUCTURED_CLAIM
KEEP_AS_STAGING_NOTE
NEEDS_SOURCE_BACKFILL
DUPLICATE
CONFLICTING
OUT_OF_SCOPE
REJECT_UNSUPPORTED
REJECT_RIGHTS
```

Нельзя превращать старый prose-note или прошлый LLM answer в approved claim только потому, что он звучит правдоподобно.

Архив должен использоваться максимально полно, но полезность определяется provenance и фактическим содержанием, а не обязательством «импортировать всё».

---

# 34. Роль сильной модели при сборке базы

Высококачественная cloud/self-hosted LLM может использоваться offline для:

- source parsing;
- candidate claim extraction;
- terminology normalization;
- concept linking;
- predicate/object typing proposals;
- applicability proposals;
- conflict/duplicate detection;
- localization drafts;
- coverage-gap discovery;
- review reports;
- authoring tests.

Сильная модель помогает **создать и проверить** Knowledge Pack, но не является runtime source of truth.

Её output проходит deterministic schema validation и независимый review/import policy.

---

# 35. Independent authoring review

Extractor и factual approver не должны быть одной и той же logical review pass для неоднозначных/неструктурированных источников.

Минимум:

```text
EXTRACTION AGENT
→ candidate structured records
→ SOURCE/EVIDENCE AUDITOR (read-only)
→ DOMAIN KNOWLEDGE AUDITOR (read-only)
→ deterministic validator
→ approval/promotion step
```

Для trusted deterministic import профиль может заменить ручную/LLM review только если mapping semantics заранее утверждены и воспроизводимы.

## 35.1. Machine-readable per-claim approval

Authoring pack/fragment поддерживает `verifications[]`. Для pack либо любого
coverage profile со статусом `production` каждому claim соответствует ровно
одна `world_knowledge_verification_v1` запись с вердиктом `APPROVE`:

```json
{
  "schema": "world_knowledge_verification_v1",
  "verification_ref": "wk-verification:...",
  "claim_ref": "claim:...",
  "claim_digest": "<64 lowercase hex SHA-256 characters>",
  "candidate_ref": "git:<reviewed commit>:<authoring shard>#<claim_ref>",
  "auditor_ref": "<independent review agent/session>",
  "independence_basis": "<how this review is separate from extraction>",
  "evidence_checked": ["evidence:..."],
  "review_ref": "verification/<report>.md#<verdict-section>",
  "verdict": "APPROVE",
  "limits": "<actual scientific/historical/source-access limits>"
}
```

Связь claim → verification задаётся уникальным `claim_ref` в ledger;
compiler выдаёт прямой `verification_ref` в compiled claim. Ledger остаётся
authoring data, не передаётся LLM и не создаёт runtime store/owner.

`candidate_ref` имеет формат `git:<40 lowercase hex commit>:<repo-relative
authoring JSON path>#<same claim_ref>`. Это ссылка на зафиксированный кандидат,
не произвольная метка. `review_ref` — относительный к World Knowledge root путь
к Markdown report с необязательным `#section`; существующие отчёты могут
находиться как в `verification/`, так и в `research/`. Абсолютные пути и
traversal запрещены. Compiler проверяет формат и claim binding; production
проверки репозитория дополнительно проверяют существование связанных файлов.

`worldKnowledgeClaimDigest` использует существующий canonical SHA-256 helper
workflow и связывает весь claim, его predicate signature, все claim
localizations, непосредственно связанные subject/object concepts и их
localizations, все referenced evidence и sources. Изменение любого из этих
входов требует нового независимого review. Порядок shards/records не влияет
на binding. `evidence_checked` должен в точности покрывать evidence claim.

`REJECT` и `NEEDS_REVIEW`, пропущенный или duplicate verdict, неизвестный
claim, неполный evidence set и stale digest блокируют production compile.
Reviewed/experimental pack без production profiles может не иметь ledger;
предоставленные verification records всё равно валидируются. Статус
`review_status: approved` сам по себе production approval не доказывает.

`APPROVE` оценивает заявленный вид знания, а не обещает одинаковую
достоверность всех claims. Для §0.2 reconstruction reviewer подтверждает
правдоподобие, пригодность переноса и честность маркировки; прямое
свидетельство для даты игровой сцены не обязательно. `limits` и review text
явно различают source verification и plausibility approval. Одной
независимой проверки достаточно; дополнительные доказательные пакеты не нужны.

Auditor identity и independence basis — доверенные редакторские сведения,
а не криптографическая аутентификация агента. Проверка не защищает от
владельца репозитория, намеренно подделывающего записи. Digest введён по
прямому требованию PR92 review для конкретного дефекта: после изменения
проверенного claim старый approval не должен продолжать действовать.
Новые signatures, runtime hashes и authentication infrastructure не нужны.

Повторная сверка текущего claim с ранее выполненным source/domain review
допустима при точной ссылке на кандидат, проверенное evidence и допустимый
вердиктом текст. Она должна называться reconciliation, а не новым чтением
источника. Наличие report-файла или прежнего approved flag не заменяет
самостоятельной семантической проверки текущего claim и его RU/EN текста.

---

# 36. Structured knowledge mode

Основной gameplay mode — structured claims.

Gameplay LLM получает:

```text
approved facts
+ hard constraints
+ qualifiers
+ disputes/gaps
```

и не получает длинные source documents.

---

# 37. Source-grounded technical mode

Для technical/documentation packs допускается purpose:

```text
source_grounded_qa
```

Slice может дополнительно возвращать bounded evidence fragments:

```text
source_ref
anchor
short excerpt/projection
retrieval relevance
```

Evidence fragment:

```text
!= approved structured claim
!= hard exclusion
!= automatic truth
```

Gameplay historical/scientific hot path не обязан читать raw evidence fragments.

---

# 38. Trusted document imports

First-party/official technical corpus может объявить trusted import profile.

Он обязан определить:

- trusted source classes;
- parser/import path;
- source anchors;
- какие records являются evidence;
- какие records считаются claims;
- version/applicability mapping;
- validation and rollback policy.

LLM-generated summary не становится authoritative только потому, что исходный документ trusted.

---

# 39. Compile stage

Approved pack revision deterministic компилируется в immutable runtime bundle.

```text
assembled approved records
→ strict global validate
→ normalize
→ localization join
→ build runtime projections
→ build exact/structured/lexical indexes
→ build embedding retrieval texts
→ optional precompute corpus embeddings
→ bundle
```

Compile validation должна fail-closed проверять минимум:

- schema versions;
- manifest fields/status/locales/domains/context profile;
- duplicate refs across assembled shards;
- source/evidence lineage;
- source rights/review status;
- exact per-claim independent verification binding before production (§35.1);
- concept domain and relation refs;
- predicate registration and full signature;
- subject/object domain/type compatibility;
- allowed object kinds;
- quantities/ranges/unit semantics where used;
- polarity;
- hard-exclusion basis;
- applicability shape and allowed dimensions;
- qualifiers;
- knowledge_access classes/facets;
- coverage profile scope/purposes/question classes/guard;
- localization uniqueness/completeness;
- unsupported cross-ref;
- deterministic conflict grouping inputs.

Compiler не делает LLM/network/party DB calls.

Runtime bundle полностью восстанавливаем из canonical approved data.

---

# 40. Runtime bundle

Bundle — immutable directory/archive, не обязательный custom binary database format.

Минимально:

```text
manifest
runtime concepts
runtime claims
coverage profiles
localizations
exact indexes
structured applicability indexes
lexical indexes
embedding profile metadata
optional precomputed vectors
embedding entry metadata
```

Raw books/PDFs/articles не обязательны в gameplay bundle.

После load normal retrieval не перечитывает authoring files.

---

# 41. Runtime storage

Для offline game отдельный SQL/network database service не требуется.

Базовый target:

```text
immutable local bundle
→ load once
→ local/RAM indexes
→ read-only retrieval
```

Во время normal lookup запрещены:

```text
web request
remote database call
raw document parse
full file corpus scan
provider call внутри Knowledge Core
party DB transaction
```

---

# 42. SQL и external storage

SQL не является Knowledge Platform semantics.

MVP hot path не требует PostgreSQL, pgvector или отдельного vector DB.

Если measured scale need появится, storage backend может меняться без изменения query/applicability/verdict/ranking/slice semantics.

---

# 43. Exact, structured и lexical indexes

Обязательные prepared indexes по мере появления соответствующих consumers:

```text
concept_ref → concept
concept_ref → claims
domain → claims
predicate → claims
normalized localized label/alias → refs/claims
time applicability
place applicability
actor/context facets
question-class/profile lookup
```

Lexical retrieval — обязательный baseline recall path.

---

# 44. Embedding profile

Первый target profile:

```json
{
  "schema": "world_knowledge_embedding_profile_v1",
  "embedding_profile_ref": "wk-embedding:giga-480m-0826:v1",
  "model_id": "ai-sage/Giga-Embeddings-instruct-480M-0826",
  "model_revision": "<pinned exact revision>",
  "dimension": 1024,
  "normalization": "l2",
  "pooling": "mean",
  "query_mode": "instruct",
  "document_mode": "plain",
  "status": "production"
}
```

На дату подготовки этого контракта upstream model card указывает MIT license, ~480M parameters, embedding dimension 1024, mean pooling + L2 normalization и instruction prefix только для asymmetric query. Перед distribution exact revision и applicable license/notice должны быть повторно pinned/reviewed.

Corpus vectors и runtime query vectors строятся одной exact model revision/profile.

---

# 45. Роль GigaEmbeddings

GigaEmbeddings — recall layer, не factual authority.

```text
semantic query text
→ embedding
→ candidate claims
→ approved record check
→ deterministic applicability
→ ranking
```

Не:

```text
embedding similarity → truth
```

Vector score не может создать claim/concept, сделать candidate supported/excluded, обойти applicability или доказать party presence.

---

# 46. Когда считаются embeddings

Build time:

```text
approved localized retrieval surfaces
→ pinned Giga model
→ precomputed vectors
→ runtime bundle
```

Runtime у игрока кодируется только новый query/search text текущей semantic need.

Полный corpus не переиндексируется при каждом запуске.

---

# 47. Localized embedding entries

```json
{
  "entry_ref": "wk-retrieval:claim:123:en",
  "target_ref": "claim:123",
  "locale": "en",
  "retrieval_text": "Approved localized retrieval text and aliases.",
  "embedding_profile_ref": "wk-embedding:giga-480m-0826:v1"
}
```

Canonical claim остаётся один.

---

# 48. MVP vector index

Первый production implementation использует simplest sufficient representation:

```text
entry metadata array
+ contiguous normalized float vectors
+ cosine similarity / dot product
```

Для приемлемого corpus size допускается deterministic flat scan.

ANN/HNSW/vector DB добавляются только после measured latency/scale gap.

---

# 49. Hybrid retrieval

Нормативный candidate pipeline:

```text
1. exact refs
2. domain/predicate narrowing
3. structured applicability prefilter
4. localized lexical retrieval
5. optional Giga semantic retrieval
6. merge/deduplicate
7. full deterministic applicability
8. conflict grouping
9. deterministic ranking
10. bounded packing
```

Exact refs выше fuzzy retrieval.

---

# 50. Knowledge need policy

Перед factual enrichment должно быть ясно, какой тип потребности существует:

```text
NONE
→ factual World Knowledge не нужна; лишний lookup не делать

EXACT
→ code уже знает refs/domain/predicate; direct structured query

RETRIEVE
→ factual need есть, но exact refs неизвестны; query planner строит information need
```

Не вводить отдельную универсальную classifier LLM только ради этих трёх состояний. Использовать фактический semantic orchestration и real call sites.

---

# 51. Query planner responsibility

Planner отвечает только:

> Какие knowledge domains, refs, predicates и semantic search hints нужны для текущей semantic situation?

Planner может вернуть:

```text
domains
focus_refs
requested_predicates
search_hints
query_locale
```

Planner не может:

- создавать world facts;
- решать gameplay outcome;
- менять time/place/entity identity;
- придумывать approved refs;
- materialize object;
- выбирать social consequence;
- писать party state;
- писать Knowledge Pack.

Если code уже знает exact need, planner не вызывается.

В текущем production grounding смешаны typed predicates и общий
`supported_fact`. Semantic planner не получает карту predicates каждого
concept, поэтому server строит его retrieval query с
`requested_predicates: []`: выбранный моделью predicate не должен отбрасывать
дополняющие factual premises. Шесть полей planner DTO сохраняются; exact
code-owned queries продолжают использовать registered predicate filters.

---

# 52. Query planner request/response

Request example:

```json
{
  "schema": "world_knowledge_query_planner_request_v1",
  "pack_ref": "wk-pack:novgorod-1230",
  "purpose": "semantic_resolution",
  "input_locale": "ru",
  "semantic_input": "Хватаю купца за ворот и требую вернуть долг.",
  "situation_summary": "Публичный спор с купцом.",
  "allowed_domains": ["social_norms", "law_institutions", "economy_trade"],
  "available_knowledge_refs": ["wk:occupation:merchant"],
  "planner_limits": {
    "max_domains": 5,
    "max_search_hints": 8,
    "max_focus_refs": 8
  }
}
```

Response example:

```json
{
  "schema": "world_knowledge_query_plan_v1",
  "query_locale": "ru",
  "domains": ["social_norms", "law_institutions", "economy_trade"],
  "focus_refs": ["wk:occupation:merchant"],
  "requested_predicates": ["social_expectation_in_context", "legal_norm_in_context"],
  "search_hints": ["публичное физическое принуждение", "спор о долге"]
}
```

Validation:

```text
domains ∈ allowed_domains
focus_refs ∈ available_knowledge_refs
predicates registered for selected domains
query_locale supported or explicitly translated
unknown fields rejected
facts/outcomes forbidden
bounded output
```

Допускается не более одного cheap structural repair на том же immutable request.

---

# 53. Authoritative context merge

Planner не назначает:

```text
year
current place
canonical region
party entity identity
actor state
ownership
hidden state
catalog revision
```

После planner orchestrator добавляет authoritative context из committed/working state и actor-safe projections.

---

# 54. Runtime query

```json
{
  "schema": "world_knowledge_query_v1",
  "pack_ref": "wk-pack:novgorod-1230",
  "pack_revision": "revision:...",
  "purpose": "semantic_resolution",
  "query_locale": "ru",
  "domains": ["materials_physics"],
  "focus_refs": ["wk:material:oak_wood"],
  "requested_predicates": ["has_qualitative_property"],
  "search_hints": ["расколоть дубовую деталь"],
  "context": {
    "time": {"year": 1230},
    "place_refs": ["region_novgorod_land"],
    "actor_facets": {}
  },
  "budget": {
    "max_facts": 24,
    "max_candidates": 12,
    "max_context_chars": 7000
  }
}
```

Example limits не universal defaults. Bounded limits принадлежат runtime profile.

---

# 55. Retrieval engine

Knowledge Core выполняет retrieval без LLM:

```text
validate pack/query
→ exact lookup
→ domain/predicate filter
→ applicability narrowing
→ lexical candidates
→ vector candidates where enabled
→ merge/deduplicate
→ full applicability
→ conflict grouping
→ deterministic ranking
→ budget packing
→ slice
```

Normal gameplay retrieval не делает web research и не читает raw corpus.

---

# 56. Applicability evaluator

Каждый candidate проходит:

1. approved revision check;
2. purpose/coverage check;
3. pack-specific context applicability;
4. conditions;
5. knowledge-access filtering для actor-facing purposes;
6. support/exclusion/conflict classification;
7. specificity/ranking metadata.

Evaluator не использует LLM для authoritative verdict.

---

# 57. Knowledge access for NPC/player-facing purposes

Базовые classes historical/game pack:

```text
general_physical
common_cultural
occupation_bound
role_bound
specialist_bound
domain_internal_only
```

Orchestrator передаёт только actor-safe facets, разрешённые visibility/knowledge owners.

Specific party secrets не хранятся в World Knowledge.

---

# 58. Ranking

Deterministic priority:

```text
1. applicable hard constraints
2. exact focus-ref facts
3. direct requested predicates
4. lexical/vector relevance
5. higher context specificity
6. confidence/typicality/directness
7. stable claim_ref
```

Vector score никогда не поднимает inapplicable claim выше applicable.

Приоритеты сравниваются лексикографически, а не суммой весов разных
уровней. Exact focus включает как явно указанный claim, так и claims
указанного concept. Внутри одинаковых hard/exact/predicate уровней
релевантность запросу предшествует specificity: исторически точная, но
посторонняя справка не должна вытеснять нужную универсальную causal premise.
Applicability и actor access остаются обязательными фильтрами до ranking.

---

# 59. World Knowledge slice

```json
{
  "schema": "world_knowledge_slice_v1",
  "pack_ref": "wk-pack:novgorod-1230",
  "pack_revision": "revision:...",
  "purpose": "semantic_resolution",
  "locale": "ru",
  "coverage": [
    {"domain": "materials_physics", "status": "covered"}
  ],
  "hard_constraints": [],
  "facts": [
    {
      "claim_ref": "claim:...",
      "domain": "materials_physics",
      "runtime_text": "...",
      "qualifiers": {"typicality": "common", "confidence": "high"},
      "evidence_refs": ["evidence:..."]
    }
  ],
  "candidates": [],
  "disputes": [],
  "gaps": [],
  "evidence_fragments": [],
  "context_text": "..."
}
```

`context_text` — deterministic compact projection returned records, не LLM summary.

---

# 60. Context packing

Цель:

> минимальный factual context, достаточный текущей semantic model.

Packing:

```text
hard constraints
→ exact focus facts
→ direct requested relations
→ query-relevant facts within equal priority tiers
→ context specificity and qualifiers as relevance tie-breakers
→ disputes/gaps
```

Slice не растёт пропорционально corpus.

---

# 61. Runtime summarizer запрещён

```text
retrieval
→ deterministic compact projection
→ main semantic model
```

Отдельная summarizer LLM между retrieval и semantic model не вводится без отдельной доказанной необходимости.

---

# 62. Main semantic model instruction

Каждый semantic prompt с World Knowledge должен содержать эквивалент норм:

```text
World Knowledge является основным factual context для покрытых domains.
Не заменяй его собственными историческими/научными воспоминаниями.
Не вводи новую factual premise, которой нет в supplied World Knowledge или explicit code-owned context.
Не превращай partial/unresolved в подтверждённый факт.
Party state является истиной конкретной партии.
General knowledge не доказывает presence конкретного party object.
Не создавай protected authoritative identity без разрешённого structured ref.
```

Prompt не заменяет code validation и coverage/audit gates.

---

# 63. Grounding sufficiency

Перед main semantic call orchestrator должен иметь один из результатов:

```text
NO_KNOWLEDGE_REQUIRED
SUFFICIENT_KNOWLEDGE
PARTIAL_KNOWLEDGE
UNRESOLVED_KNOWLEDGE
OUT_OF_SCOPE
KNOWLEDGE_UNAVAILABLE
```

Для `PARTIAL/UNRESOLVED/OUT_OF_SCOPE/UNAVAILABLE` model не получает право «дополнить факт по памяти».

Она может:

- выбрать ближайшую semantic action interpretation, не требующую неизвестной premise;
- сохранить uncertainty;
- получить realistic failure/indeterminate result через существующих owners;
- сообщить structured knowledge gap там, где contract consumer это поддерживает.

Она не может объявить неизвестное истинным только ради завершения turn.

---

# 64. Protected factual assertions

Некоторые factual slots могут использовать code-owned guard:

```text
advisory
explicit_exclusion
reference_required
```

Potential slots:

```text
garment_identity
currency_identity
official_title_identity
historical_person_identity
canonical_technology_identity
legal_status_identity
historical_institution_identity
```

Strict guard разрешён только при достаточном production coverage и reliable structured identity boundary.

Свободные actor actions никогда не становятся `reference_required` whitelist.

---

# 65. Player free semantic step

```text
player intent
+ player-safe state
        ↓
semantic LLM boundary needed?
        ↓ yes
exact factual need known?
   /                 \
 yes                  no
  ↓                    ↓
direct query      query planner
   \                  /
     validated query
          ↓
   Knowledge Core
          ↓
   Knowledge Slice
          ↓
configured semantic_turn model
          ↓
existing structured semantic plan
          ↓
existing validation/domain owners
          ↓
commit
```

Если exact code path полностью разрешает действие и factual lookup не нужен, planner/lookup не вызываются.

Не создаётся второй player planner или новый public player operation только ради knowledge enrichment.


---

# 66. World/materialization consumers

World Knowledge должна использоваться не только для свободного player turn. Полный target включает factual grounding ordinary world creation, но не переносит materialization authority в Knowledge Core.

## 66.1. Создание/конкретизация location

Пример target flow:

```text
authoritative location context
(time + place + location/building type + social/economic context)
→ exact/direct World Knowledge query
→ typical/allowed resources, structures, tools, activities, animals/plants, household contents
→ existing catalog mappings/candidate filters
→ existing materialization owner
→ committed location state
```

Knowledge slice может сообщить:

```text
what is historically/scientifically compatible
what is typical/common/uncommon
what resources are naturally available in context
what tools/items are associated with this type of place
what activities/processes are plausible here
what exclusions are known
```

Но:

```text
World Knowledge support != item exists here
```

Конкретное presence/quantity/placement/source/persistence создаёт existing materialization owner.

## 66.2. Создание NPC

Target flow:

```text
authoritative time/place/social context
+ authored/scenario constraints
→ World Knowledge
→ profession/role candidates
→ appearance/clothing/material culture constraints
→ typical items/tools
→ practices/routine
→ common/specialist knowledge access classes
→ existing NPC/materialization owners
→ committed NPC
```

World Knowledge не создаёт personality/goals/current private beliefs. Она даёт factual envelope и context-compatible candidates.

## 66.3. Runtime catalog mapping

Для materialization-support purposes knowledge concept может иметь explicit mapping к existing approved catalog concept/template/category.

Если mapping отсутствует:

- knowledge concept может оставаться factual context;
- он не становится автоматически runtime materializable entity;
- LLM не создаёт новый catalog ID;
- consumer либо использует ordinary semantic path, если это разрешено active materialization contract, либо возвращает typed gap.

World Knowledge не становится вторым runtime catalog.

---

# 67. NPC decisions

World Knowledge используется как actor-safe general factual context, но не выбирает действие NPC.

NPC-facing slice может включать:

```text
general physical knowledge
common cultural knowledge
occupation practices
role expectations
known technology
legal/economic context
```

Он не включает private knowledge другого NPC, hidden party truth или objective fact, который actor не имеет основания знать.

После slice NPC принимает самостоятельное решение через existing semantic boundary и проходит обычные mechanics.

---

# 68. Social behavior, law and authority

```text
social/legal norm exists != NPC must react identically
```

World Knowledge может сообщать:

- applicable norm;
- historical institution/authority;
- procedure;
- typical expectation;
- known sanctions/consequences as factual context;
- who normally has authority/jurisdiction in context.

Конкретная reaction зависит от:

```text
NPC state
relationships
goals
knowledge
current situation
semantic decision
formal social/legal mechanics
```

World Knowledge не применяет punishment, reputation change, arrest, property transfer или другой exact consequence вместо domain owner.

---

# 69. Physical/material knowledge

World Knowledge хранит gameplay-relevant properties, например:

```text
cuttable
splittable
flexible
rigid
brittle
absorbent
combustible
water_sensitive
supports_tension
supports_compression
conductive
insulating
soluble_in_water
corrosive_to
```

и source-backed quantitative properties, когда они реально нужны consumer.

Knowledge Core не становится universal physics simulator.

Если exact mechanic существует, code имеет приоритет.

---

# 70. Chemistry and material interactions

Target позволяет хранить знания химии и взаимодействий веществ/материалов настолько широко, насколько это требуется gameplay.

Предпочтительная форма:

```text
substance/material identities
qualitative properties
compatibilities/incompatibilities
known reactions/interactions
required conditions
hazards/limitations as factual claims
products/classes of products
source-backed quantitative ranges where needed
```

Не нужно перечислять каждую возможную пару предметов как отдельный action/recipe.

Semantic model может композиционно рассуждать из retrieved premises. Если для реакции требуется фактическая посылка, которой в slice нет, model не должна придумывать её.

Knowledge Platform не обязана становиться универсальным chemical solver. Если будущему gameplay действительно нужна exact chemistry simulation, это отдельная mechanics task у соответствующего owner.

---

# 71. Technology and free crafting

Knowledge Pack может содержать:

```text
known processes
materials
inputs
outputs
tools
required conditions
sequence constraints
period/region availability
known limitations
known failure conditions
```

Known process/recipe может быть fast path.

Отсутствие recipe не является запретом физически осмысленной попытки.

Applicable hard constraint не позволяет model объявить работающей исторически/физически невозможную технологию.

Actor всё равно может попытаться и получить realistic failure/partial/nonworking/waste result через semantic/domain path.

---

# 72. Ordinary materialization

World Knowledge помогает определить:

```text
исторически/материально/социально допустима ли ordinary detail
насколько она typical
какие свойства/conditions/relations известны
какие related candidates логично рассмотреть
```

Но:

```text
supported concept != object exists here
```

Presence, causal basis, source, property, placement, conservation, mechanics и persistence остаются у existing gameplay owners.

Player wording не evidence presence.

---

# 73. Narration knowledge

Narrator использует general World Knowledge только после party facts.

Priority:

```text
committed visible party state
→ approved event/factual skeleton
→ optional general World Knowledge context
→ localized narration
```

Если prose называет новый authoritative/actionable object, такой object уже должен существовать в approved working/committed projection.

---

# 74. Failure semantics

```text
missing factual knowledge → unresolved
useful but insufficient coverage → partial
outside declared profile → out_of_scope
bundle/index operational failure → unavailable
```

Operational failure не маскируется под factual uncertainty.

Repeated unresolved в declared production question class является authoring coverage defect и должен быть видим telemetry/eval.

---

# 75. Planner failure

Допускается один structural repair на том же immutable request.

После повторного failure:

```text
known deterministic default query exists
→ use it

otherwise
→ typed knowledge_query_planning_unavailable
```

Strict protected assertion не получает ungrounded fallback из model memory.

---

# 76. Versioning and pinning

Каждый approved pack имеет immutable revision identity.

Каждый embedding profile имеет pinned exact model revision.

Runtime slice сообщает pack revision.

Save/runtime world profile может pin compatible pack revision для воспроизводимых будущих decisions, если current persistence architecture действительно требует такого pin. Не добавлять новый persistence marker без реального consumer.

Knowledge migration влияет только на будущие resolutions и не переписывает committed history.

---

# 77. Caching

Cache — performance optimization, не truth.

Safe logical key использует только реально влияющие на result dimensions:

```text
pack revision
embedding profile where relevant
purpose
normalized query
applicability context
locale
```

Не вводить cryptographic cache identity/fingerprint без отдельного реального требования.

---

# 78. Internal API

Primary API Knowledge Core in-process/provider-independent:

```text
resolveWorldKnowledge(query)
→ world_knowledge_slice_v1
```

Knowledge Core API не зависит от REST/MCP/provider/party database.

---

# 79. REST/MCP adapters

External deployment может позднее предоставить thin adapters поверх того же Core API.

REST example:

```text
POST /v1/knowledge/resolve
body: world_knowledge_query_v1
response: world_knowledge_slice_v1
```

MCP tool example:

```text
world_knowledge_resolve
input: world_knowledge_query_v1
output: world_knowledge_slice_v1
```

Gameplay offline hot path не ходит через REST/MCP к самому себе.

Adapters не содержат independent ranking/applicability semantics.

---

# 80. Portability

Для другого setting:

```text
same Knowledge Core
+ another Knowledge Pack
```

Generality достигается pack schemas/predicate registries/applicability, а не universal ontology framework.

---

# 81. Явно не является целью

Без concrete measured need запрещено превращать платформу в:

```text
RDF runtime
triple store
universal ontology framework
universal rule engine
universal affordance engine
universal physics simulator
universal chemical reaction solver
полную численную economic simulation
новый party-state store
новый social-law owner
новый NPC decision engine
новый materialization engine
command/action/recipe whitelist
runtime web-research system
runtime document summarizer
GraphRAG ради самого GraphRAG
vector similarity authority
network DB как обязательный offline dependency
multi-agent research chain на каждый turn
```

Широкая **база знаний** по физике/химии/биологии допустима и является target. Запрещён именно преждевременный universal simulation engine.

---

# 82. Порядок роста retrieval complexity

```text
1. exact refs
2. structured indexes
3. localized lexical index
4. Giga flat semantic retrieval
5. improve lexical/FTS after measured gap
6. ANN/HNSW after measured latency gap
7. external SQL/vector backend only after measured scale need
```

---

# 83. Лицензии и коммерческая поставка

Для каждого bundled model/runtime component хранится минимальный release manifest:

```text
component/model id
exact revision/version
source repository
license identifier
license/notice location
commercial_use_allowed
redistribution_allowed
reviewed_at
```

Для Giga target exact revision pin и license/notice review выполняются в embedding implementation stage и повторно перед release.

Knowledge Pack не включает большие copyrighted excerpts без redistribution rights.

Historical/scientific gameplay предпочитает собственные structured claims + source metadata/evidence anchors.

---

# 84. Telemetry: LLM roles

Для model call по возможности измеряются:

```text
role
provider class
model identity
input/output locale
latency
input/output tokens
reasoning tokens if provider exposes
status/error
estimated cloud cost
```

Hidden chain-of-thought не сохраняется.

---

# 85. Telemetry: knowledge retrieval

Для lookup:

```text
pack revision
embedding profile
purpose
query locale
requested domains/question classes
planner call count/latency
query embedding latency
lexical latency
vector latency
retrieval total latency
facts returned
hard constraints count
slice size
coverage/gaps
cache hit/miss
```

---

# 86. Turn-level metrics

Минимум:

```text
planner_latency_ms
knowledge_retrieval_latency_ms
semantic_llm_latency_ms
narrator_latency_ms
semantic_pipeline_latency_ms
total_turn_latency_ms

planner_input_tokens
planner_output_tokens
semantic_input_tokens
semantic_output_tokens
narrator_input_tokens
narrator_output_tokens

total_cloud_tokens
estimated_cloud_cost
```

---

# 87. Performance objective

World Knowledge успешна, когда снимает factual recall workload с main model.

Target effect:

```text
меньше factual/historical/scientific ошибок
+ меньше background prompt
+ меньше semantic input tokens
+ меньше model recall/reasoning
+ меньше cloud cost
+ целево меньше semantic latency
```

Quality improvement и performance cutover — отдельные gates.

---

# 88. Normal runtime cost model

Для новой open semantic boundary:

```text
0 или 1 query-planner LLM call
+ 0 или 1 local query embedding call
+ 1 deterministic Knowledge Core retrieval
+ 1 main semantic LLM call
```

Narrator — отдельный последующий role call, если narration нужна.

Без concrete need запрещены runtime web research, source-reading agent, summarizer LLM, multi-agent chain, multiple sequential knowledge reasoning calls.

---

# 89. Correctness и performance — отдельные gates

```text
REFERENCE CORRECTNESS
→ STRUCTURED/LEXICAL RETRIEVAL CORRECTNESS
→ HYBRID RETRIEVAL QUALITY
→ GAMEPLAY GROUNDING
→ MATERIALIZATION/NPC CONSUMERS
→ PLANNER OPTIMIZATION
→ LOCAL MODEL CUTOVER
→ OPTIONAL EXTERNAL SERVICE
```

Нельзя объяснять defect Knowledge Core слабостью local model.

---

# 90. Reference correctness eval

Representative eval сравнивает минимум:

```text
A. strong semantic model without World Knowledge
B. same model + World Knowledge
```

Измеряются:

```text
semantic plan correctness
historical/factual/scientific errors
unsupported factual premises
input/output tokens
latency
cloud cost
```

World Knowledge должна доказать самостоятельную ценность до оптимизации на маленькую local model.

---

# 91. Retrieval eval

До production hybrid activation сравниваются:

```text
exact/structured + lexical
vs
exact/structured + lexical + Giga
```

Dataset содержит unseen realistic queries и размеченные relevant claims.

Metrics:

```text
Recall@10
Recall@20
candidate noise
hard-constraint recall
applicability precision
query embedding latency
retrieval latency
RAM/VRAM
vector index size
final factual correctness
final semantic input tokens
```

External benchmarks не заменяют project eval.

---

# 92. Query planner optimization

После стабильного Core planner переводится на самый дешёвый/быстрый model profile, который проходит eval.

Metrics:

```text
domain recall
focus-ref correctness
predicate selection
noise/over-selection
schema validity
latency
tokens
cost
```

Planner не запрашивает все domains «на всякий случай».

---

# 93. Local semantic model cutover

Сравнение:

```text
A. cloud without WK
B. cloud + WK
C. local semantic model without WK
D. local semantic model + WK
```

Главный offline показатель:

```text
quality gap(B, D)
```

и factual grounding error rate.

---

# 94. Narrator quality eval

Narrator оценивается отдельно от semantic correctness:

```text
prose quality
style adherence
factual fidelity
language quality
latency
tokens
cost
```

Cloud narrator может оставаться optional quality tier после полного offline simulation cutover.

---

# 95. Staged implementation scope

Первый gameplay cutover подключает World Knowledge к реальной existing player free semantic boundary.

Но полный platform target дополнительно включает:

```text
location/ordinary materialization support
NPC generation/materialization support
NPC factual decision context
conversation/social/legal context
optional narrator factual background
```

Каждый consumer активируется отдельным reviewable cutover после Core correctness.

---

# 96. Pilot corpus

Pilot обязан содержать source/evidence-backed cases минимум для:

```text
supported historical fact
supported social/legal fact
supported material property
supported physical/scientific fact
supported process requirement
known incompatibility
multi-domain situation
unresolved query
partial/out-of-scope query
irrelevant-domain noise
free action absent from catalog
```

Не добавлять invented facts ради test pass.

---

# 97. Core acceptance

Knowledge Core обязан:

1. быть deterministic для same revision/query/context;
2. exact refs ставить выше fuzzy hits;
3. учитывать applicability;
4. не использовать staging;
5. не считать missing result exclusion;
6. не зависеть от LLM для factual verdict;
7. не делать runtime web/raw-corpus research;
8. возвращать bounded slice;
9. возвращать coverage/gaps/disputes;
10. не читать/писать party state;
11. не выполнять model calls;
12. сохранять same canonical truth для ru/en.

---

# 98. Coverage Completeness Gate

Для production game pack должна существовать versioned coverage matrix по реальным consumers/question classes.

Gate проходит, когда:

1. каждый declared production question class имеет representative unseen probes;
2. relevant facts стабильно извлекаются;
3. систематические gaps либо закрыты authoring-ом, либо profile честно `partial`;
4. profile не объявлен `production`, если критические обязательные needs регулярно `unresolved`;
5. количество claims само по себе не используется как proof completeness;
6. canned Q&A не подменяет primitive/relationship coverage.

## 98.1. Category cartography and independent completeness review

`production-v1/category-cartography.json` — отдельная authoring-карта:
domain → subdomain → category family → location applicability →
resource/material/process/NPC applicability → linked claims and coverage.
Иерархия отражает игровые потребности, а не названия файлов корпуса.
Один shard может питать несколько families, одна family — несколько shards.

Карта сопоставляет factual families с реальными WK profiles и
location/materialization consumers. Approved scenario profile, unpublished
authoring candidate и activated production binding различаются явно.
Нельзя выдавать тестовый/неактивированный location profile за всё
production materialization-space.

Completeness Auditor независимо ищет отсутствующие семейства: природные
среды и ресурсы, виды/экологические функции, material life cycles,
производство/хранение/разрушение, бытовые функции места, занятия и социальные
контексты NPC. Проверка не ограничивается уже перечисленными cells или
claim refs. Missing/partial family получает отдельную запись с причиной,
применимостью и потребителем; счётчик заполненных cells не закрывает gap.

По §0.2 потребность может быть покрыта verified facts, аналогиями и approved
editorial reconstruction совместно. Проверяются целостные жизненные контексты
и полезность ответов, а не только наличие прямых первичных свидетельств.
Источник из соседнего периода не означает автоматически P1; отсутствие
одежды, инструментария, быта или социального контекста роли означает gap,
пока не добавлена пригодная фактическая либо реконструктивная основа.

Карта не является runtime whitelist и не доказывает scene presence.
Она не меняет цепочку category → template → profile → rule → instance и
не создаёт второго materializer. Structural consistency проверки карты
не равны содержательному completeness approval.

---

# 99. Archive Ingestion Gate

Миграция полусырого архива принята, когда:

1. существует полный inventory входных материалов;
2. каждый файл/record классифицирован;
3. provenance/rights состояние известно либо явно `unknown/needs_backfill`;
4. duplicates/conflicts выявлены;
5. approved claims имеют evidence lineage;
6. unsupported prose/LLM notes не получили approval;
7. useful content перенесён в canonical concepts/claims/sources/evidence/localizations;
8. остаток архива имеет отчётливую причину, почему не promoted;
9. compile проходит strict global validation;
10. coverage report показывает, какие реальные gaps архив закрыл и какие остались.

---

# 100. Grounding Gate

Для любой активированной semantic boundary:

1. exact factual need использует direct query без planner;
2. retrieve need использует planner + Knowledge Core;
3. covered factual need не отдаётся main model без Knowledge Slice;
4. `partial/unresolved` не становится уверенным invented fact;
5. existing code mechanics не дублируются knowledge/model reasoning;
6. hidden party facts не попадают в query/slice;
7. same factual input with/without different wording приводит к same grounding class;
8. development World Knowledge Grounding Auditor не находит model-memory fallback.

---

# 101. Materialization Gate

Location/NPC/ordinary materialization integration готова, когда:

1. factual candidates приходят из World Knowledge для covered classes;
2. presence создаётся только materialization owner;
3. runtime catalog mappings validated where required;
4. absence mapping не создаёт invented ID;
5. knowledge typicality не становится deterministic presence без owner policy;
6. unseen equivalent location/NPC не требует нового hardcoded branch;
7. committed materialization сохраняется после reload.

---

# 102. NPC/social/legal Gate

1. NPC получает только actor-safe factual context;
2. World Knowledge сообщает norm/procedure/context, но не выбирает NPC action;
3. formal consequence остаётся у existing owner;
4. law/authority reaction не выдумывается model memory при covered profile;
5. same norm не заставляет всех NPC реагировать одинаково;
6. hidden knowledge не утечёт.

---

# 103. Multilingual acceptance

```text
canonical claim identity same for ru/en
ru query retrieves relevant claim
en equivalent retrieves same canonical claim
localized runtime_text соответствует canonical claim
locale switch does not change verdict
translation fallback cannot change refs/outcome
```

---

# 104. Anti-regression

## Free action

```text
action absent from Knowledge Pack → semantic resolution remains possible
```

## No wish fulfillment

```text
player mentioned concept != concept exists in party
```

## No hidden leak

Knowledge enrichment не раскрывает hidden party state.

## No owner theft

World Knowledge не применяет item/social/time/body/property consequences.

## No scripted implementation

Production code не содержит branches/constants под eval phrases/items.

## Code first

Exact existing mechanic не получает unnecessary model call.

---

# 105. Knowledge Correctness Gate

Production knowledge profile correctness-ready, если representative eval подтверждает:

1. relevant claims стабильно попадают в slice;
2. applicability корректна;
3. hard constraints доходят до semantic model;
4. unresolved/partial сохраняются;
5. factual correctness лучше либо не хуже baseline;
6. unsupported premise rate уменьшается;
7. free gameplay сохранён;
8. hidden-state boundary сохранена;
9. existing ownership сохранён;
10. locale не меняет factual result.

---

# 106. Performance Gate

Сравниваются одинаковые semantic backends:

```text
without World Knowledge
vs
with World Knowledge
```

Target:

```text
меньше semantic input tokens
меньше reasoning/cost
лучше factual correctness
planner+retrieval not dominant latency
целево ниже semantic pipeline latency
```

Quality-ready architecture может быть принята до performance-default cutover.

---

# 107. Offline Production Gate

Fully local profile готов, когда:

1. Knowledge Pack работает без сети;
2. query encoder local;
3. planner local;
4. semantic model local;
5. required weights помещаются в target hardware profile;
6. latency приемлема;
7. representative quality проходит;
8. internet disconnect не ломает simulation;
9. narrator может быть переключён на local backend.

---

# 108. Security and privacy

Cloud provider получает только minimum purpose-safe context.

World Knowledge enrichment не является обходом visibility rules.

API secrets принадлежат provider configuration layer.

Не добавлять security/integrity layers без реального threat model и требований `AGENTS.md`.

---

# 109. Observability

Trace должен позволять определить:

```text
role/provider/model
pack revision
embedding profile
locale
query plan
domains/predicates/question classes
claim refs in slice
coverage/gaps/disputes
hard constraints
planner/retrieval/embedding/model/narrator latency
tokens/cost
```

Hidden chain-of-thought не сохраняется.

---

# 110. Что платформа гарантирует и чего не гарантирует

Для production-covered structured domains она должна гарантировать:

```text
approved relevant factual context перед main LLM
known hard exclusions deterministic
missing knowledge not automatic impossibility
missing knowledge not silent model-memory fact
retrieval reproducible for same revision/query/context
runtime offline/no raw research
locale does not create another truth
```

Нельзя честно гарантировать:

```text
абсолютную полноту человеческих знаний
отсутствие любой ошибки arbitrary prose
точную numerical simulation всех процессов
что любой unknown уже покрыт текущей revision
что local model равен strongest cloud model во всех задачах
```

Target проекта — систематически расширять primitive/relationship coverage до практически полного покрытия factual needs игры, а не заявлять математически невозможную абсолютную полноту.

---

# 111. Implementation sequence

## Stage 1A — Foundation hardening

- strict schemas/validation;
- predicate signatures;
- typed objects;
- strict applicability/qualifiers/knowledge_access/profile validation;
- sharded authoring assembler;
- deterministic compile;
- exact/structured/lexical indexes;
- no gameplay activation.

## Stage 1B — Archive audit and canonical migration

- inventory supplied archive;
- source/evidence provenance;
- candidate extraction;
- independent factual review;
- dedupe/conflicts;
- approved shards;
- coverage matrix/gap report.

## Stage 2 — Knowledge Core

- runtime owner only now;
- loader/query/slice schemas;
- applicability/coverage/verdict/conflict/ranking/packing;
- pure read-only resolver.

## Stage 3 — Reference player semantic grounding

- planner role through existing LLM runtime;
- direct query fast path;
- existing player semantic boundary enrichment;
- no second player planner/operation;
- telemetry;
- Grounding Gate + correctness eval.

## Stage 4 — Giga hybrid retrieval

- exact revision/license pin;
- corpus vectors;
- local query encoder;
- flat vector scan;
- lexical+vector merge;
- benchmark.

## Stage 5 — World/materialization consumers

- location factual envelope;
- ordinary resources/contents/practices;
- runtime catalog mappings;
- existing materialization owners only.

## Stage 6 — NPC/social/legal consumers

- NPC generation envelope;
- occupation/clothing/items/routine/common knowledge;
- NPC decision factual context;
- conversation/social/legal grounding;
- existing owners only.

## Stage 7 — Multilingual/model routing/local optimization

- ru/en first-class retrieval;
- translation fallback;
- role routing presets;
- local planner/semantic profile;
- offline benchmark.

## Stage 8 — Optional adapters/scale optimization

REST/MCP/ANN/external DB only after stable Core API and measured need.

---

# 112. Development-time independent auditors

World Knowledge implementation requires targeted independent read-only audits. Они не являются runtime LLM chain.

## 112.1. CONTRACT AUDITOR

Используется по правилам root `AGENTS.md` при каждом contract/schema/owner/LLM-boundary/profile-status change и перед final acceptance.

## 112.2. WORLD KNOWLEDGE GROUNDING AUDITOR

Главная обязанность:

> проверить, что factual need сначала обслуживается code-owned fact/mechanic или World Knowledge, а не скрыто отдаётся main LLM «на память».

Проверяет изменённые semantic call sites, prompts, query planning, slices и runtime traces.

BLOCK если:

- covered factual need приходит в semantic model без Knowledge Slice;
- `partial/unresolved` молча превращается в invented fact;
- general knowledge превращается в party presence;
- hidden party truth попадает в knowledge query;
- model memory используется как fallback factual authority;
- exact code-owned mechanics unnecessary переотданы LLM.

## 112.3. SOURCE / EVIDENCE AUDITOR

Независим от extraction agent. Проверяет archive/import records, provenance, source anchors, rights metadata, evidence-to-claim match, unsupported promotions и conflicts.

## 112.4. DOMAIN KNOWLEDGE AUDITOR

Проверяет историческую/научную корректность candidate claims в своей области, typicality/confidence/directness/applicability и отсутствие overclaim.

## 112.5. SCHEMA / DATA CONTRACT AUDITOR

Проверяет fail-closed validation, predicate signatures, typed objects, units, applicability, global refs, sharded merge и deterministic compiler.

## 112.6. RETRIEVAL QUALITY AUDITOR

Проверяет benchmark recall/noise/applicability/hard constraints/ranking/bounded packing и отсутствие score-as-truth.

## 112.7. OPEN-WORLD / ANTI-SCRIPT AUDITOR

Обязателен после gameplay integration. Проверяет, что Knowledge Pack не стал action/item/recipe whitelist и unseen case проходит без нового branch.

## 112.8. LLM PIPELINE / LATENCY AUDITOR

Проверяет planner/main/narrator calls, duplicated semantic work, repairs, tokens, latency, 20k/120s owner policy reuse и отсутствие unnecessary model calls.

## 112.9. PERCEPTION / KNOWLEDGE / IDENTITY AUDITOR

Проверяет actor-safe context и отсутствие hidden/identity leaks.

## 112.10. MATERIALIZATION / PHYSICAL REALITY AUDITOR

Проверяет integration locations/NPC/items/resources с existing owners, causal presence, quantities/placement/persistence и отсутствие materialization authority у Knowledge Core.

## 112.11. PERSISTENCE / CAUSAL CONTINUITY AUDITOR

Запускается при реальном committed-state integration. Проверяет save/load/retry/restart и отсутствие retroactive pack rewrite.

## 112.12. GAMEPLAY GAP AUDITOR — target последующей testing-фазы

Независимый development-time auditor сравнивает фактические потребности
реальной игры с доставленными premises и результатом. Он не является runtime
ролью, вторым planner/materializer, автоматическим исследователем или
источником production approval. Его реальное применение отложено по §0.1.
Существующие internal driver и backlog validator — подготовленные инструменты,
не доказательство достижения gameplay readiness или saturation.

### Trace requirements

Трасса связывает exact code/pack/profile/model revisions, campaign/turn IDs,
свободное намерение, public/actor-safe вход, WK need/query plan, фактический
retrieval query и consumer slice с claim refs, structured semantic plan,
repair attempts, owner admission/rejection, commit либо отсутствие commit,
player-safe presentation и continuation. Секреты и private model reasoning
не сохраняются. Hidden diagnostic state не передаётся blind explorer.
Успешный HTTP или правдоподобная narration не заменяют owner commit evidence.
Auditor отдельно перечисляет required, used и implied factual premises,
их evidence и unsupported accepted premises; пустой backlog без такого
per-trace assessment не является положительным аудитом.

### Gap classes и правильный owner

- `COVERED_BY_WORLD_KNOWLEDGE`: существующий approved factual support.
- `COVERED_BY_CODE_MECHANICS`: известная exact mechanics/state ответственность.
- `CORPUS_GAP`: отсутствует factual premise; research и отдельная verification.
- `RETRIEVAL_GAP`: premise есть, но не доставлена; WK retrieval/query owner.
- `SCHEMA_GAP`: нужная связь не выражается текущим factual contract; schema owner.
- `HISTORICAL_APPLICABILITY_GAP`: не установлена дата/место/доступность знания.
- `ACTOR_KNOWLEDGE_OR_PERCEPTION_GAP`: actor access/perception owner, не новые facts.
- `MATERIALIZATION_OR_PRESENCE_GAP`: causal presence/materialization owner.
- `CODE_MECHANICS_GAP`: отдельный gameplay owner, не authoring corpus.
- `AMBIGUOUS_OR_DISPUTED_REAL_WORLD_KNOWLEDGE`: сохранить спор и limits.
- `NO_FACTUAL_KNOWLEDGE_REQUIRED`: семантическая задача без factual research.

### Lifecycle

Finding содержит stable gap ID, trace/campaign refs, scenario summary,
required premise, class/domain/proposed family/consumer, severity, причину
недостаточности WK, universal/historical scope, research и resolution status.
Research проходит `new → researching → candidate_ready → verified` либо
`rejected/not_required`; только отдельный verifier разрешает promotion по §35.1.
Resolution проходит `open → resolved → replayed`; `bounded_limit` требует
независимого обоснования, а не переименования нерешённого critical gap.
Gameplay bug получает отдельную задачу соответствующего owner.
Replay ссылается на реальную новую трассу и независимый verdict: корректный
commit либо ожидаемый typed rejection с совпадающим error code и без commit.
Простая смена status, HTTP 200 или unit fixture не заменяет replay.

### Будущий saturation gate

После последнего P0/P1 исправления нужны три последовательные независимые
unseen кампании на одном неизменном acceptance candidate с различающимися
ситуациями/стилями explorers и непересекающимися trace IDs. Во всех кампанийных
traces обязателен независимый premise audit; новых и незакрытых P0/P1 — ноль,
unsupported premises в accepted traces — ноль. P2 должен быть replayed либо
иметь независимо принятый bounded limit. Regression replay не считается unseen.
Новый critical finding сбрасывает последовательность. Это ограниченное
эмпирическое насыщение проверенного пространства, не математическая полнота
мира. В статической фазе gate имеет статус «не применяется / будущая фаза»,
а не PASS или blocker статического authoring.

---

# 113. Full Definition of Done

Ниже — совокупный target полной платформы. Для отдельной статической фазы
применяется §0.1: обязательны corpus/verification/cartography/retrieval и
проверки уже затронутой интеграции, но не новые live campaigns, gameplay
saturation или ремонт других gameplay owners.

Полная implementation-ready platform revision завершена, когда одновременно:

1. contract зарегистрирован в статусе, совпадающем с exact versioned production cutover;
2. current Stage 1 compiler/schema hardened;
3. authoring поддерживает deterministic shards;
4. все canonical record types strict validated;
5. predicate signatures и typed objects validated;
6. applicability/qualifiers/knowledge_access/profile fields strict validated;
7. source/evidence lineage enforced;
8. semi-raw archive inventoried/audited;
9. useful archive facts migrated с provenance;
10. unsupported archive material не promoted;
11. coverage matrix существует по real question classes;
12. immutable runtime bundle собирается deterministically;
13. Knowledge Core pure/read-only существует;
14. exact/structured/lexical retrieval работает;
15. applicability/coverage/verdict/conflicts/ranking/packing deterministic;
16. missing knowledge → unresolved;
17. player free semantic boundary использует WK без второго planner/operation;
18. covered factual need не отдан model memory;
19. Grounding Auditor PASS;
20. Giga exact revision/profile pinned при Stage 4;
21. same Giga revision encodes corpus/query;
22. flat hybrid retrieval benchmarked;
23. vector score не является truth;
24. location materialization получает factual envelope из WK;
25. NPC generation получает factual envelope из WK;
26. presence/materialization остаётся у existing owners;
27. NPC/social/legal factual context grounded;
28. actor knowledge boundary сохранена;
29. runtime summarizer отсутствует;
30. runtime knowledge web research = 0;
31. ru/en share canonical facts;
32. translation fallback не меняет structured truth;
33. telemetry измеряет planner/retrieval/model/narrator separately;
34. reference correctness eval проходит;
35. retrieval Recall@K и noise измерены;
36. unsupported-premise rate измерен;
37. anti-script unseen probes проходят;
38. committed gameplay state переживает reload/retry where applicable;
39. fully-local profile существует и проходит offline gate;
40. licenses/notices/source rights учтены для release;
41. relevant `MODULE.md`/contract index/docs отражают фактический status и owner boundaries;
42. required CI на exact merge HEAD зелёный.

---

# 114. Главные anti-regression и efficiency tests

## Anti-regression

> Если player или NPC делает разумную вещь, которой нет в Knowledge Pack, commands и recipes, остаётся ли общий semantic resolution path?

Если нет только из-за отсутствия записи — World Knowledge превратилась в whitelist.

## Grounding

> Если для решения нужен factual premise из covered domain, можно ли проследить, что он пришёл из code-owned fact/mechanic или approved World Knowledge, а не из памяти main LLM?

Если нет — integration не готова.

## Coverage

> Если representative gameplay question возвращает `unresolved`, profile честно отражает gap и создаётся authoring action, вместо silent model fallback?

## Efficiency

Платформа достигает основной цели, когда со временем одновременно выполняются:

```text
меньше factual/historical/scientific ошибок
+ меньше unsupported factual premises
+ меньше main-model input tokens
+ меньше model recall/reasoning
+ меньше cloud cost
+ целево меньше semantic latency
```

---

# 115. Финальная architecture formula

```text
SOURCE KNOWLEDGE
→ strong authoring/extraction agents
→ independent source/domain audits
→ structured approved language-independent factual primitives/relations
→ coverage profiles by real game needs
→ localized retrieval surfaces
→ immutable local Knowledge Pack
→ exact + structured + lexical + optional Giga retrieval
→ deterministic applicability/conflicts/ranking/packing
→ compact relevant factual slice
→ replaceable semantic LLM using slice as factual premise set
→ existing exact domain mechanics/materialization owners
→ committed world
→ actor-safe projection
→ independently replaceable narrator
```

Production target:

> Игра полностью работает offline на скачанных весах и локальной World Knowledge Platform. Исторические, бытовые, физические, химические, биологические, социальные и иные gameplay-relevant знания являются собственной проверяемой частью системы. LLM используется для понимания и композиционного semantic reasoning, но не как скрытая энциклопедия, которой разрешено придумывать отсутствующие factual premises.
