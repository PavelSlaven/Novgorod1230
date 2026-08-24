# Контракт свободного семантического мира: действия, lazy ordinary-materialization и самостоятельные процессы v2.1

**Предлагаемый файл в репозитории:**  
`data/knowledge-source/corpus/DOCUMENTS/semantic_world_actions_materialization_and_processes_contract.md`

**Статус:** `proposed umbrella target`; не является active production contract. Каждая описанная ниже feature profile активируется отдельным versioned cutover только после своей реализации и профильных tests.  
**Проект:** «Русь XIII век» / `PavelSlaven/Novgorod1230`.  
**Сверено с GitHub `main`:** 2026-08-16, HEAD `2a6ce7ab72a515ae1d240ca99eb4fc5dd4795b58`.  
**Редакция ревизии:** `2.1.0-review`.  
**Основной владелец LLM orchestration:** `@rus/turn`.  
**Deterministic authored materialization, RNG и code-only helpers:** `@rus/materialization`.  
**Предметы, количество, масса, контейнеры и property:** `@rus/items-property`.  
**Пространство и topology:** существующие Spatial v3 owners/contracts.  
**NPC semantic decision:** `@rus/npc-runtime`, orchestration model calls — через `@rus/turn`.  
**Самостоятельные процессы:** существующий `@rus/world-processes`.  
**Точное время:** `@rus/time-events-history`.  
**Logical persistence boundary:** `@rus/party-store`; physical PostgreSQL transaction остаётся у существующего server-owned committer.

Эта редакция сохраняет продуктовую цель исходного v2, но исправляет найденные при сверке с `main` противоречия и недооценённые implementation gaps.

Ключевые изменения ревизии:

- ordinary world resolution переиспользует существующие player domain requests `request_discovery` и `request_container_access`; новый player operation для ordinary content не вводится;
- любой положительный targeted result требует independent eligible `supporting_basis_ref`: уже committed либо candidate-free prepared Stage A basis в той же working projection; player/NPC wording остаётся только trigger и имеет `evidence_weight = 0`;
- LLM не назначает числовую world-capacity: она предлагает только закрытый `density_band`, а code-owned policy переводит его в persisted identity budget;
- concrete ordinary proposal получает broad closed `admission_class` и functional bucket: code применяет gates, а semantic correctness классификации проверяется adversarial model eval, без притворного NLP-парсинга free-text name;
- initial primitive mechanics нового non-container item могут быть предложены LLM только один раз внутри request-bound policy; после validation/commit exact snapshot принадлежит `@rus/items-property`;
- active authority class `hidden` сохраняется для hidden truth/candidate paths; простая физическая concealment обычного предмета моделируется отдельным disclosure state `concealed`;
- no-reroll гарантируется для committed exact resolution identity; универсальная эквивалентность произвольных перефразирований и durable replay незафиксированного LLM-плана не обещаются;
- ordinary contents v1 относятся к уже существующему container; создание нового template-less runtime container отложено до отдельного mechanics snapshot contract;
- local `fire` v1 использует code-owned discrete whole-unit fuel rule: один persisted fuel-unit entity на exact boundary; LLM не возвращает arbitrary numeric resource deltas;
- umbrella target разделён на независимые atomic activation profiles. Запрещена mixed semantics внутри одного profile, но не требуется один огромный cutover для ordinary world, free crafting, spatial/NPC remainder и fire одновременно.

До активации конкретного profile источником production behavior остаются актуальные active-нормативы и код `main`.

Документ является proposed amendment прежде всего к:

- `AGENTS.md`;
- `turn_step_llm_contract.md`;
- `code_driven_world_materialization_architecture.md`;
- `spatial_architecture_standard_g0_g6.md`;
- `world_base_materialization_table_requirements.md` и target specialization;
- `items_and_property.txt`;
- `npc_autonomous_decision_contract.md` в части доступа NPC к ordinary world;
- `temporal_world_and_interruptible_activities.md`;
- module contracts `@rus/turn`, `@rus/items-property`, `@rus/materialization`, `@rus/world-processes`, persistence/visibility owners.

---

## 0. Назначение, нормативная граница и результат ревизии

Цель контракта — сохранить основной игровой инвариант проекта:

> Игрок и NPC не ограничены конечным списком команд, recipes, заранее написанных реакций и конкретных ordinary-объектов. Код исполняет всё, что уже можно надёжно формализовать; LLM семантически разрешает неизбежный остаток неизвестных разработчику ситуаций внутри уже заданной реальности; результат после code-owned проверки и commit становится устойчивым состоянием партии.

Контракт охватывает:

1. свободные действия игрока и NPC;
2. semantic facts и их связь с формальными mechanics;
3. ordinary physical materialization;
4. lazy scene content и targeted presence resolution;
5. локальный density/identity budget без каталога диапазонов каждого предмета;
6. property, anti-free-loot и context-bound предметы;
7. природные sources/features/resources;
8. ресурсы, первоначальное количество, расход и practically abundant sources;
9. free crafting без обязательного recipe;
10. party-scoped ordinary content внутри уже существующей spatial рамки;
11. отдельный будущий structural semantic remainder;
12. импровизированные предметы в domain mechanics;
13. самостоятельные world processes;
14. первый exact local process — `fire`;
15. persistence, retry, safe projections и atomicity;
16. реалистичную implementation delta относительно current `main`.

Контракт **не**:

- заменяет canonical G0–G5 процедурной генерацией;
- материализует весь G4/G5/G6 заранее;
- требует item ranges для всех бытовых объектов;
- разрешает LLM писать runtime code, SQL или arbitrary state patch;
- разрешает LLM писать в БД;
- разрешает LLM придумывать canonical/history/informational truth;
- создаёт второй player planner;
- переносит LLM call внутрь `@rus/materialization`;
- создаёт второй NPC, spatial, temporal или process owner;
- требует универсальную materials ontology;
- требует universal affordance engine;
- требует full economy simulator или event sourcing;
- требует durable журнала незафиксированных LLM-планов;
- гарантирует универсальное semantic matching любых перефразирований.

### 0.1. Что подтверждено текущим `main`

Сверка current `main` подтверждает пригодность существующих owners, но показывает, что исходный v2 недооценивал объём cutover.

Уже существует:

- `@rus/turn` как единственная active player semantic boundary, internal step loop, working projection, execution registry, state revalidation и combined logical write-plan composition;
- `@rus/items-property` как owner item/container/property/access, inventory mechanics и immutable mechanics snapshots для template-less direct-action results;
- `@rus/materialization` как code-only deterministic owner без LLM;
- Spatial v3 с canonical G0–G5, party-scoped G6/dynamic state, immutable topology baseline и single-writer discipline;
- `@rus/world-processes` как pure owner coarse remote catch-up, включая remote `process_kind = fire`;
- `@rus/party-store` как logical persistence boundary и game-server как physical transaction owner.

Одновременно current `main` имеет следующие реальные ограничения:

1. Active player domain operations не содержат ни ordinary-materialization operation, ни `request_world_process`. Ordinary presence разумнее подключать как внутренний branch существующих `request_discovery` и `request_container_access`.
2. `@rus/items-property` допускает ordinary runtime result только при exact match заранее approved `semantic_type + name`, а все facts должны входить в `approved_fact_texts`. Это несовместимо со свободной semantic concretization и требует нового admission contract, а не только prompt change.
3. `rus.items.runtime_instance_mechanics_snapshot.v1` допускает только provenance `ordinary_direct_action_result`, требует `root_turn_id/step_index` и запрещает runtime container mechanics через `container = null`. System/NPC seed и новый template-less container этим contract не выражаются.
4. `first-entry-materialization.js` выполняет materializer внутри injected transaction после locked baseline read. Этот helper пригоден для deterministic code materialization, но не должен стать местом сетевого LLM-вызова.
5. Current turn loop сохраняет accepted plan только внутри ещё не committed execution draft. После process crash до final commit нет durable plan, который можно replay без нового model call.
6. Current `@rus/world-processes` реализует только remote aggregate catch-up. Интерактивный local fire с concrete fuel refs, exact item transitions и actor affect является отдельным additive contract внутри того же owner.
7. Checked `@rus/items-property` surfaces пересчитывают placement/inventory mechanics, но не предоставляют подтверждённого общего transition для частичного расхода arbitrary mass/quantity. Поэтому F1 v1 использует целые заранее отделённые fuel-unit entities и retirement одного unit на boundary; partial stack/mass burn остаётся отдельной будущей mechanics delta.
8. Наборы turn-step operations продублированы в validators/admission/actor-step constants. Добавление `request_world_process` требует синхронной правки всех этих surfaces и tests.

Следовательно:

> Ordinary common-content profile реализуем поверх существующей архитектуры, но это cross-cutting contract/persistence/admission change. Полный набор ordinary world + free crafting expansion + broad spatial/NPC remainder + local fire не является одной локальной доработкой.

### 0.2. Внешняя design-сверка

Внешние решения используются как design validation, а не как источник production semantics проекта.

- Latitude Heroes Dev Log #15 описывает пользу planning/persistence для locations, characters и potential items и прямо связывает чистую импровизацию с проблемами cohesion и boundedness.
- Latitude Heroes Dev Log #17 формулирует `reactive entity expansion`: создавать ровно столько устойчивой конкретики, сколько требуется в нужный момент.
- Minecraft Bedrock loot-table documentation разделяет conditions, pools, rolls и entries и допускает `empty`, то есть eligibility и доступный roll не гарантируют предмет.
- Production pipeline No Man’s Sky демонстрирует техническую жизнеспособность continuous/on-demand generation внутри заранее построенной архитектуры, а не необходимость заранее хранить весь возможный мир.
- Survey Maleki & Zhao по PCG + LLM рассматривает LLM как один компонент комбинированных PCG-методов и отдельно отмечает сохраняющиеся research gaps.

Из внешней сверки принимается:

```text
persistent structured state
+ lazy/reactive expansion
+ explicit constraints and supporting basis
+ valid empty/absent outcome
+ generator proposal inside a controlled representation
+ code validation before durable effect
+ profile-specific evaluation of generator behavior
```

Не принимается как доказанное внешними источниками:

- что LLM сама надёжно избегает wish-fulfillment;
- что произвольная natural-language paraphrase всегда может быть сведена к одной semantic identity;
- что полный location inventory нужно генерировать заранее;
- что runtime-генерация исполняемого кода безопасна;
- что authored world следует заменить procedural world;
- что одному feature profile нужен отдельный engine.

Latitude Heroes является полезным публичным design precedent, но не доказательством зрелой реализации exact contract этого проекта. Minecraft и No Man’s Sky являются более сильными shipped precedents только для отдельных принципов: conditions/empty result и on-demand generation. Они не снимают необходимость project-specific gates, persistence и tests.

### 0.3. Результат ревизии

Продуктовая идея признана реалистичной, но исходная оценка «локализуемого единого cutover» исправлена.

Документ задаёт umbrella target с независимыми activation profiles:

```text
O1 — common ordinary G6/content resolution
O2 — context-bound, natural/resource и existing-container extensions
A1 — broader action-produced physical results / free crafting admission
F1 — exact local fire
S1 — broad ordinary structure/spatial semantic remainder
N1 — autonomous NPC decisions through current actor-step owner capabilities
```

Правила:

- каждый profile имеет собственный versioned atomic cutover;
- внутри profile запрещены dual writers, prompt-only activation и mixed old/new semantics;
- profile не обязан ждать unrelated profile;
- O1 не активирует A1, F1 или S1;
- S1 не входит в минимальную реализацию ordinary item world; N1 регулируется отдельным active NPC contract;
- authored/significant/hidden/informational materialization остаётся fail-closed во всех profiles.

Такое разделение уменьшает release risk и соответствует проектному принципу разумной достаточности без создания новых owners.

# 1. Главные игровые инварианты

## 1.1. Любой actor может попытаться сделать всё осмысленное

Игрок может заявить любое действие.

NPC на своей semantic decision boundary может выбрать любое действие, которое этот NPC способен осмысленно захотеть совершить из своего субъективного состояния.

Отсутствие команды, handler, recipe, action type, dialogue option, заранее написанного outcome, конкретного item template или конкретного ordinary building variant само по себе не является игровым запретом.

Ограничивать попытку могут только факты мира и реальные mechanics:

1. committed state;
2. положение и доступ;
3. тело и способности;
4. предметы и материалы;
5. знания actor;
6. время;
7. физическая причинность;
8. историческая реальность XIII века;
9. решения других actor;
10. уже идущие процессы;
11. authoritative ограничения соответствующего domain owner.

## 1.2. Code first, LLM for the unenumerable remainder

Если существующий код способен однозначно и корректно разрешить ситуацию — используется код.

LLM вызывается только для неизвестной разработчику семантики, которую невозможно разумно свести к уже существующему closed choice.

Это относится одинаково к действию, разговору, NPC decision, ordinary materialization, свободному крафту, качественной классификации импровизированного объекта и одному шагу world process, если deterministic resolver недостаточен.

## 1.3. После commit мир перестаёт быть предположением

После commit найденный камень существует, созданный клин существует, NPC имеет стабильную identity, расход ресурса остаётся расходом, решение NPC не переигрывается, fire process не исчезает из-за ухода actor, изменённое состояние объекта не пересчитывается заново.

LLM не получает право позже «уточнить» committed факт так, будто прежнего решения не было.

## 1.4. Semantic freedom inside authoritative envelope

LLM свободна только внутри уже определённой рамки.

Она может конкретизировать ordinary-реальность.

Она не может по одному правдоподобию создавать новую каноническую историю, canonical G0–G5, global route, официальную власть, legal status, hidden evidence, informational/authored contents закрытого контейнера, настоящую currency identity, историческую фигуру, significant institution или другой authoritative fact без профильного owner. Ordinary concealed contents уже существующего container допускаются только через O2 pre-reveal resolution и не становятся знанием actor до reveal.

---

# 2. Уровни игрового состояния

Контракт различает пять уровней:

```text
1. SEMANTIC FACT
   текущий конкретный качественный факт существующей сущности

2. RUNTIME ENTITY / RESOURCE
   конкретный party-scoped физический объект, NPC, ordinary content
   или извлечённая порция ресурса

3. ORDINARY CONTENT COMMITMENT
   persisted background group, density/identity budget, presence resolution,
   observation closure или unresolved-state aggregate,
   который ограничивает будущую конкретизацию, но сам не является item

4. WORLD PROCESS
   самостоятельный причинный процесс, продолжающийся после породившего действия

5. DOMAIN MECHANICS
   формализованная code-owned механика
```

LLM может предлагать фактическую конкретизацию уровней 1–4 только через formal semantic boundary, принадлежащую существующему orchestration owner.

LLM не создаёт уровень 5 во время игры.

`unresolved` не является concealed fact о том, что конкретный предмет «на самом деле уже лежит там». Это simulation commitment: мир ещё не обязан иметь concrete identity, а будущая конкретизация ограничена committed context, identity budget, supporting basis refs, groups, prior observations и authority gates.

Во время партии LLM не пишет JavaScript, не создаёт handler, не меняет формулу, не добавляет SQL, не регистрирует owner, не меняет command registry и не создаёт новый process kind.

---

# 3. Владельцы ответственности

| Область | Владелец |
|---|---|
| player/NPC actor-step orchestration и runtime LLM service calls | `@rus/turn` |
| player free semantic plan | active `turn_step_*` contract |
| ordinary-world semantic subrequest | `@rus/turn` + strict contracts; это не второй player planner |
| code-only materialization/admission helpers | `@rus/materialization` |
| autonomous NPC decision state/semantics | `@rus/npc-runtime` |
| items, mass, quantity, containers, property, physical access | `@rus/items-property` |
| spatial topology, portals, blockers, G5/G6 | существующий Spatial v3 owner |
| exact time и temporal boundaries | `@rus/time-events-history` / active temporal owner |
| world-process semantics/lifecycle proposal | `@rus/world-processes` |
| combat formulas/outcomes | существующий combat owner |
| body consequences | body-state owner |
| hidden/knowledge/visibility | `@rus/visibility-knowledge-memory` и связанные owners |
| social/legal consequence | `@rus/social-law` |
| logical persistence adaptation | `@rus/party-store` |
| physical transaction | существующий game-server combined committer |

Ни один новый contract этого документа не переносит domain ownership.

Ключевой handoff:

```text
@rus/turn calls LLM
→ semantic proposal
→ code-only materialization/admission
→ профильный domain owner
→ combined write plan
→ physical committer
```

`@rus/materialization` не становится LLM caller. `@rus/items-property` не решает, существует ли неизвестный бытовой предмет только потому, что игрок его назвал. Spatial baseline не становится хранилищем бытовой описи.

---

# 4. Единый routing свободного actor action

Сохраняется существующая player semantic boundary:

```text
turn_step_request_v1
→ turn_step_plan_v1
```

Отдельный materialization planner или process planner перед player planner не создаётся.

Общий путь:

```text
actor intent
→ existing exact fast path, если он однозначно применим
→ иначе existing semantic actor planner
→ direct operations / generic check / domain request
→ профильный owner проверяет известную механику
→ если owner не может разрешить только качественную часть:
     bounded semantic request через @rus/turn
→ owner валидирует returned semantic proposal
→ working projection
→ atomic commit соответствующей causal boundary
```

NPC использует тот же actor-step после собственного semantic decision.

---

# 5. Semantic facts и формальная механика

## 5.1. Semantic fact

`change_entity_facts` остаётся стандартным способом сохранить нестандартное текущее качественное состояние существующей entity.

Примеры:

```text
один конец жерди заострён
ткань насквозь промокла
край доски обуглен
поверхность покрыта мокрой грязью
верёвка туго обмотана вокруг стойки
```

Semantic fact после commit является authoritative party fact, а не narration.

Он обязан быть текущим, конкретным, причинно возникшим, относящимся к существующей entity и не предсказывающим неизвестное будущее.

## 5.2. Противоречащие текущие facts заменяются

Если новое состояние делает старый текущий fact ложным, старый `fact_ref` удаляется тем же causal change set.

```text
before:
  "один конец жерди заострён"

after break:
  remove old fact_ref
  add:
    "заострённый конец обломан и затуплен"
```

Не вводится отдельный `semantic_state`, `state_key` или parallel fact store.

## 5.3. Semantic prose не является скрытым mechanics engine

Критическая норма:

> Exact code handler не обязан и не должен семантически интерпретировать произвольный текст facts.

Если нестандартное действие влияет на уже существующую formal mechanic, тот же semantic step должен материализовать соответствующее owner-native формальное состояние.

Пример:

```text
player:
  "подпираю дверь жердью"

semantic fact:
  "дверь подпёрта жердью"
```

Этого текста недостаточно для exact `open`.

Если подпорка реально блокирует проход, spatial owner дополнительно получает существующее formal blocker/portal state representation.

Тогда exact `open` читает formal spatial state, видит blocker и возвращает blocked/not-applicable, а не пытается NLP-парсить строку fact.

Если нужного owner-native механического представления в проекте нет, а конкретный gameplay case без него ломается, минимально расширяется существующий owner. Универсальный semantic dependency engine не создаётся.

## 5.4. Facts сами по себе не меняют другие domains

Semantic fact не может только текстом менять owner, placement, damage, legal status, currency authenticity, knowledge NPC, hidden container contents, route или exact body values.

Для этого нужен соответствующий domain operation/owner.

---

# 6. Главный принцип

## 6.1. Semantic freedom inside authoritative envelope

Ordinary materialization разрешена только внутри уже committed/approved envelope.

```text
AUTHORED / COMMITTED WORLD
period + region + G0–G5 + G6 topology + function + environment
+ ownership/social/economic context + material culture + hard permissions
                         ↓
CODE-OWNED POLICY
scope + authority class + availability gates + supporting basis refs
+ persisted density/identity budget + prior resolutions/observations
                         ↓
LLM
minimal ordinary semantic proposal
                         ↓
CODE-OWNED ADMISSION
basis membership + authority + property + mechanics + spatial validation
                         ↓
ATOMIC COMMIT
                         ↓
PERSISTENT PARTY WORLD
```

LLM не создаёт authoritative envelope и не назначает final supporting-basis refs. Stage A может предложить structured background-group/source basis только из supplied context refs; code-owned admission валидирует proposal и присваивает prepared ref. Stage B использует только allowlisted committed либо candidate-free prepared refs.

## 6.2. Код не обязан знать диапазоны всех предметов

Код не должен содержать таблицу вида:

```text
крестьянская изба:
  горшки 2..6
  ложки 3..9
  верёвки 1..4
  ...
```

Код обязан знать:

- structural scope;
- hard authority/property/source gates;
- approved broad ordinary policies;
- code-owned mapping density band → identity budget;
- persisted groups, resolutions и observation closures;
- exact mechanics уже созданных instances;
- профильные запреты и ownership.

LLM может один раз предложить только закрытый qualitative band:

```text
sparse | ordinary | dense
```

Она не назначает произвольное число slots. Versioned code-owned policy переводит band и authored hints в persisted local identity budget. Такой budget является технической границей плотности и стоимости, а не доказательством присутствия конкретного предмета.

## 6.3. Свободный budget не создаёт предмет

```text
remaining identity budget
≠ object exists
```

Положительный targeted result требует одновременно:

```text
budget/admission available
AND candidate is ordinary under authority policy
AND historically/materially admissible
AND supporting_basis_ref is committed or candidate-free prepared before Stage B
AND that basis is allowed for this request
AND candidate is covered by that basis
AND property/source context is valid
AND prior resolution/observation does not contradict it
AND context-bound permission exists when required
```

`supporting_basis_ref` может ссылаться на committed basis либо на code-owned prepared seed basis, созданный Stage A без candidate, например:

- independently committed or candidate-free prepared background group;
- finite source;
- ambient ordinary source;
- existing container context;
- authored occupation/household/armament/economic permission;
- approved scope-bound ordinary-presence policy instance.

Player/NPC wording, свободный budget и LLM reason text supporting basis не заменяют.

`absent`, `no_change` и `authority_required` являются нормальными first-class outcomes. Они не требуют materialize-ить похожий или менее полезный предмет.

# 7. Независимые измерения: authority, availability и disclosure

Нельзя смешивать:

- значимость истины;
- бытовую доступность объекта;
- видимость/раскрытость объекта.

## 7.1. Authority class

Для materialization используется ось:

```text
ordinary
significant
hidden
informational
authored_canonical
```

`ordinary` означает, что существование и бытовые свойства конкретного объекта сами по себе не создают canonical, legal, historical или evidence-bearing truth.

`significant`, `hidden`, `informational` и `authored_canonical` требуют профильного authoritative owner/candidate path и не могут возникнуть из ordinary fallback.

`hidden` сохраняет active project meaning: существование, содержание или происхождение entity несёт скрытую authoritative truth. Mere physical concealment — другое измерение `disclosure = concealed`. Поэтому обычный предмет может быть `authority = ordinary` и одновременно `disclosure = concealed`, а видимый документ может иметь `authority = informational`.

## 7.2. Availability class

Для ordinary physical content используется независимая ось:

```text
common
context_bound
```

### `common`

Низкоценная материя, рутинно ожидаемая при подходящем committed basis:

- простая утварь;
- обычная тара;
- хозяйственные материалы;
- дешёвые инструменты общего назначения;
- отходы и обрезки;
- стандартные природные материалы.

`common` не означает автоматически `present`, `unowned` или `visible`.

### `context_bound`

Неуникальный объект, присутствие которого требует отдельной причины:

- оружие;
- деньги и ценная переносимая материя;
- дорогой импорт;
- специализированный профессиональный инструмент;
- товарный запас;
- социально ограниченная вещь.

Для `context_bound` нужны matching permission/profile/source и concrete committed basis.

### 7.2.1. Closed ordinary admission class

Чтобы code gates не зависели от NLP-парсинга `name`, каждый concrete proposal получает один broad closed class:

```text
common_mundane
specialized_or_valuable
weapon_or_armament
currency_or_precious
document_like
container_capable
other_restricted
```

Это локальный admission vocabulary, а не catalog конкретных предметов и не universal ontology.

Code-owned mapping задаёт минимальные последствия:

- `common_mundane` может иметь `availability_class = common`;
- `specialized_or_valuable` и `weapon_or_armament` всегда `context_bound`;
- `currency_or_precious` требует economic/source permission и не получает authentic currency identity ordinary path;
- `document_like` не получает informational/authentic content;
- `container_capable` не materialize-ится template-less до отдельного container mechanics contract;
- `other_restricted` не получает positive result без explicit versioned policy.

LLM выполняет неизбежную semantic classification, а code проверяет enum, разрешённость класса и consistency с availability/authority/profile refs. Code не утверждает, что умеет самостоятельно NLP-проверить произвольное имя; correctness этой semantic classification входит в adversarial model-eval acceptance.

## 7.3. Disclosure state

Visibility/knowledge owner хранит отдельное измерение:

```text
visible
concealed
inaccessible
unknown_to_actor
revealed
```

Ordinary contents уже существующего закрытого container могут быть `ordinary + concealed`. Ordinary path вправе concrete-изировать их до reveal только по container context и без player wishlist.

Ordinary path не вправе создавать:

- evidence-bearing contents;
- подлинность документа;
- hidden historical event;
- тайного владельца или преступника;
- canonical secret.

## 7.4. Authority имеет приоритет

Наличие common/context-bound permission никогда не открывает ordinary fallback для:

- уникального или легендарного предмета;
- сюжетной улики;
- подлинной грамоты;
- официального статуса;
- значимой печати;
- клада как authored event;
- исторически определённого объекта;
- content, истинность которого является informational fact.

Такие результаты возвращают `authority_required` либо используют существующий authoritative candidate path.

# 8. Пространственный scope: G4/G5 задают рамку, G6 получает concrete content

## 8.1. G0–G5 не становятся каталогом всех вещей

Канонические G0–G5 сохраняют действующую spatial-v3 семантику.

LLM не создаёт:

- G0–G4;
- canonical G5;
- world routes;
- permanent topology;
- canonical containment;
- новые spatial slots сверх approved capacity.

Generated G5 по-прежнему создаётся code-owned spatial materialization из approved G4 expansion profile.

## 8.2. Ordinary-content envelope наследуется сверху вниз

G4/G5 дают контекст:

- тип и функция места;
- экономика;
- occupation/household context;
- владелец/контролёр;
- населённость и использование;
- material culture;
- сезон/период;
- sensitive permissions;
- природная среда.

Но это не означает, что все вещи G5 должны существовать как item instances.

## 8.3. Narrowest relevant scope

Concrete ordinary entity материализуется в самом узком mechanically relevant scope, обычно:

```text
G6
→ scene position / local placement
→ конкретный container/source при необходимости
```

Предмет не создаётся «на весь G4» только потому, что игрок вошёл в G4.

Предмет не создаётся «на весь G5» только потому, что G5 стал достижим.

## 8.4. Scene baseline не мутируется ordinary-content

Действующий `party_scene_baseline` остаётся immutable владельцем подготовленной spatial topology.

Lazy ordinary materialization:

- не добавляет новые permanent positions;
- не меняет baseline template;
- не меняет endpoint bindings;
- не переписывает G6 topology.

Она создаёт только dynamic party state:

- ordinary-content ledger;
- concrete items/placements;
- local natural features/modifiers, если разрешены spatial owner;
- background groups;
- presence resolutions.

---

# 9. Lazy materialization: trigger и routing

## 9.1. Проход мимо

Если actor только проходит через пространство и concrete ordinary detail не нужна:

```text
ordinary semantic call = 0
```

Spatial preparation подготавливает только movement/readiness.

Нельзя ради pass-through заранее генерировать:

- содержимое домов;
- полный набор утвари;
- весь рабочий инвентарь;
- природные мелочи;
- contents недоступных containers.

## 9.2. Meaningful engagement

Ordinary resolution запускается, когда concrete detail нужна механике или factual projection.

Типовые triggers:

- `look`, `inspect`, `search` либо `dig`;
- ссылка actor на ещё не существующий mundane object как цель поиска;
- first reveal ordinary contents уже существующего container;
- physical extraction из committed source;
- действие NPC, которому объективно нужна unresolved ordinary detail;
- system-owned scene seed перед detailed actionable projection;
- local natural detail становится mechanically relevant.

Trigger определяет code/orchestration. LLM не решает, когда вызвать себя.

## 9.3. Переиспользование active player domain operations

Для O1/O2 новый player operation `request_ordinary_detail` не вводится.

```text
request_discovery
→ domain handler проверяет authored/committed result
→ при unresolved ordinary gap вызывает internal ordinary semantic subrequest
→ обновляет working projection
→ continuation turn loop

request_container_access
→ до reveal проверяет authoritative contents
→ при разрешённом unresolved ordinary container вызывает internal contents subrequest
→ применяет open/reveal к обновлённой working projection
```

Это сохраняет единственную player semantic boundary и не расширяет public operation vocabulary без необходимости.

System-owned initial seed и NPC path используют тот же internal contract через `@rus/turn`, но не притворяются player operation.

## 9.4. Model call не выполняется внутри PostgreSQL transaction

Текущий `first-entry-materialization.js` выполняет deterministic materialization внутри injected transaction. Ordinary LLM seed не подключается к этому helper.

Правильный порядок:

```text
read committed snapshot + state version
→ build sanitized request
→ model call outside physical transaction
→ validate proposal
→ revalidate committed state/version
→ build one logical write plan
→ short atomic physical commit
```

При stale state proposal отклоняется или request строится заново. Нельзя удерживать DB lock во время сетевого model call.

## 9.5. Code first

LLM не вызывается, если ответ уже следует из:

- committed concrete entity;
- authored/significant candidate;
- persisted exact presence resolution;
- committed background group, для refinement которого достаточно deterministic rule;
- existing finite/ambient source;
- exact domain mechanic;
- closed observation scope;
- current authoritative container contents.

# 10. Двухступенчатая ordinary materialization

Две стадии нужны, чтобы candidate из player wording не мог сформировать собственное основание присутствия.

## 10.1. Stage A — independent minimal scope seed

При первом meaningful engagement unseeded scope `@rus/turn` может создать `mode = seed_scope`.

В request запрещены:

- raw player action;
- candidate name;
- desired use;
- utility/risk for actor;
- narration suggestion.

Разрешён только committed server context:

- scope/function/environment;
- period/region/material culture;
- occupancy/economic/property context;
- approved ordinary policies и permissions;
- existing authored/committed entities;
- technical limits.

Stage A может предложить:

- `density_band`;
- несколько structured background groups;
- несколько действительно salient common entities;
- natural/household source descriptors;
- `seeded` без concrete entity, если scene этого не требует.

Каждый Stage A concrete entity обязан ссылаться на уже committed allowlisted basis из request. Entity не может ссылаться на background group, предложенный в том же response, пока code не валидировал group и не присвоил prepared ref; такой group предназначен прежде всего для следующего Stage B в той же working projection.

Stage A не создаёт arbitrary numeric capacity и не заполняет budget ради заполнения.

## 10.2. Stage B — targeted resolution

Позднее конкретная потребность передаётся как normalized query target:

```json
{
  "candidate_key": "code-owned-normalized-key",
  "candidate_hint": "верёвка",
  "evidence_weight": 0
}
```

`candidate_hint` помогает понять, что проверяется, но не является world evidence.

Положительный result обязан ссылаться на `supporting_basis_ref`, который уже существовал до Stage B либо был code-owned prepared Stage A basis, созданным без candidate в той же working projection. Отдельный промежуточный DB commit не требуется.

Контрфактический критерий:

> Было бы это присутствие допустимо и поддержано тем же independent basis, если бы actor никогда не назвал предмет?

Если нет — `absent`, `no_change` или `authority_required`.

## 10.3. Первый targeted query в unseeded scope

Допустимы два model calls:

```text
1. seed_scope without candidate
2. resolve_presence with candidate + evidence_weight 0
```

Между ними Stage A proposal проходит validation и получает stable code-owned prepared refs в working projection. Stage B request может включить эти refs как `basis_state = prepared_seed`.

Финальный root commit атомарно сохраняет seed, supporting basis и targeted resolution. Если commit не состоялся, ни seed, ни positive presence не являются world facts.

Если Stage A не создаёт подходящего supporting basis, Stage B не может invent-ить его из candidate wording.

## 10.4. System seed не равен first-entry materialization

Ordinary seed запускается только при meaningful engagement, а не автоматически при каждом G4/G5/G6 entry.

Deterministic spatial first-entry path остаётся отдельным. Его наличие не является основанием вызывать LLM, генерировать inventory или держать transaction во время semantic call.

# 11. Density band и ordinary identity budget

## 11.1. Budget ограничивает concrete identities, а не материю

Persisted budget ограничивает число новых независимых mechanically relevant ordinary identities, которые scope может породить через lazy materialization.

Он не равен:

- полному числу вещей в комнате;
- количеству каждой ложки;
- объёму песка на берегу;
- числу частиц сырья;
- container capacity;
- technical batch limit.

Однородный слой может оставаться background group/source.

## 11.2. LLM предлагает только density band

Stage A может вернуть:

```text
sparse
ordinary
dense
```

Code-owned versioned policy принимает:

- density band;
- authored hints;
- scope type/function;
- hard technical maximum;

и вычисляет persisted `identity_budget`.

LLM не видит формулу и не назначает число slots.

Если authoring уже содержит exact design-critical limit, code использует его и не спрашивает LLM.

## 11.3. Functional buckets

Budget может учитываться по небольшому закрытому набору широких buckets:

```text
household
work
storage
stock
furnishing_textile
maintenance_material
waste_scrap
personal_effect
arms
other_ordinary
```

Buckets являются локальным admission vocabulary, а не универсальной ontology предметов.

## 11.4. Budget не обязан исчерпываться

Свободный budget:

- не создаёт предмет;
- не заставляет выбирать замену после `absent`;
- не гарантирует, что любой common object будет present;
- может остаться полностью неиспользованным.

Negative result обычно не уменьшает unrelated identity budget.

## 11.5. Batch limit отдельно

```text
technical max_new_entities
≠ persisted ordinary identity budget
```

Первое ограничивает один call/commit ради стоимости и безопасности.

Второе ограничивает party-scoped concrete identities данного scope.

## 11.6. Не вводится global quota engine

Не требуется мировой реестр `pot=2..6`, `rope=0..3`, `axe=0..1` для всех типов мест.

Data gap возникает не из-за отсутствия item-by-item range, а когда отсутствует обязательный envelope:

- period/region/material culture;
- function/use context;
- property/source basis;
- authority/context-bound permission;
- code-owned density policy.

# 12. Background groups: prepared/persisted basis без индивидуализации

## 12.1. Назначение

Background group фиксирует обычный функциональный слой без materialization каждой вещи.

Примеры:

```text
обычная кухонная утварь
мелкие деревообрабатывающие принадлежности
дешёвая хозяйственная тара
обрезки и ремонтный материал
```

## 12.2. Минимальная structured форма

Каждый committed group содержит минимум:

```yaml
group_ref:            # code-owned stable ref
scope_ref:
descriptor:
functional_bucket:
availability_class: common | context_bound
allowed_admission_classes: []
causal_basis:
  basis_kind:
  basis_refs: []
property_basis_ref:
permission_refs: []
disclosure_policy_ref:
```

Правила:

- `basis_refs` и `property_basis_ref` должны существовать;
- `context_bound` требует matching `permission_refs`;
- LLM не назначает `group_ref`;
- free text descriptor не заменяет refs;
- disclosure определяется visibility owner, а не самим фактом существования group.

## 12.3. Group не является item

Background group:

- нельзя взять как один предмет;
- не имеет aggregate item mass;
- не является inventory entity;
- не подменяет placement;
- не раскрывает concealed contents;
- не является canonical category.

До commit validated Stage A group является prepared supporting basis только внутри той же working projection; после commit он становится persisted supporting basis для поздней минимальной конкретизации.

## 12.4. Refinement из group

Candidate может materialize из group только если code-owned admission подтверждает:

```text
candidate declared functional bucket/admission class covered by group policy
AND group scope/property/permission applicable
AND budget available
AND no contradictory resolution/observation
```

Player wording не расширяет descriptor group. Code валидирует closed bucket/class compatibility; произвольный descriptor text не является machine proof coverage.

Group может описывать слой тары/посуды, но concrete refinement с `admission_class = container_capable` требует existing authored/template-backed container mechanics. До отдельного runtime-container contract такой detail остаётся group-level либо возвращает `no_change/data_gap`.

## 12.5. Когда quantity становится механически важным

Пока exact count не влияет на механику, group остаётся aggregate.

При запросе вроде:

```text
«собираю все деревянные ложки»
«сколько здесь поленьев?»
```

resolver один раз materialize-ит минимально необходимый finite instance/quantity. После commit amount принадлежит `@rus/items-property` и не переоценивается LLM.

# 13. Independent presence test и anti-wish admission

## 13.1. Candidate query — trigger, не causal source

Запрещено:

```text
actor назвал предмет
+ budget available
→ present
```

Разрешено:

```text
actor назвал предмет
→ code builds candidate_key
→ read prior exact resolution
→ identify allowed supporting basis refs
→ semantic proposal
→ code validates basis coverage and gates
→ present | absent | no_change | authority_required
```

## 13.2. Presence expectation — diagnostic, не authority

LLM может классифицировать:

```text
routine
plausible
exceptional
```

Это помогает review/telemetry, но само по себе не разрешает creation.

Даже `routine` требует allowlisted supporting basis: committed либо candidate-free prepared Stage A basis в той же working projection. Например, household ordinary policy instance или independently seeded background group может быть таким basis; голое рассуждение «обычно бывает» — нет.

## 13.3. Положительный result

`materialize` допустим только если:

1. candidate authority class = `ordinary`;
2. `supporting_basis_ref` входит в request allowlist;
3. code-owned validator подтверждает closed bucket/admission-class compatibility basis;
4. availability gate пройден;
5. context-bound permission/profile существует при необходимости;
6. property proposal выводится из committed property basis;
7. source/conservation rules соблюдены;
8. exact candidate resolution и observation не противоречат;
9. identity budget и batch limit доступны.

LLM reason text не может компенсировать провал любого gate. Code не NLP-парсит free-text name; semantic correctness declared class проверяется profile-specific model eval и known sensitive category bindings, где они существуют.

## 13.4. Negative и authority outcomes

- `absent` — в данном resolution scope candidate зафиксирован отсутствующим;
- `no_change` — данных/coverage недостаточно для factual presence result либо record cap не позволяет создавать новый granular resolution;
- `authority_required` — candidate относится к authoritative path;
- `materialize` — positive proposal, ещё не effect до code admission/commit.

При слабом основании выбирается `absent` или `no_change`, а не полезный игроку object.

## 13.5. Candidate identity

`candidate_key` строится code-owned normalizer из закрытых полей и scope, а не произвольного model text.

No-reroll гарантируется для того же committed key. Эквивалентное перефразирование использует тот же result только если deterministic normalizer свёл его к тому же key либо observation closure уже покрывает категорию.

# 14. Property и anti-free-loot

## 14.1. Property basis precedence

Property proposal выводится из committed refs в следующем приоритете:

```text
explicit item/source property basis
→ personal possession basis
→ communal/public/service property basis
→ container property basis
→ occupied site/household/workplace default
→ explicit genuinely-unowned causal basis
```

Location default применяется только если более конкретного basis нет.

LLM не выбирает удобный owner свободным текстом.

## 14.2. Default для man-made object

Man-made object внутри используемого жилья, мастерской, склада, торгового места, двора или служебного пространства по умолчанию наследует соответствующий owner/controller/property context.

`ordinary` не означает `unowned`.

## 14.3. Бесхозность требует committed причины

Допустимые basis kinds:

```text
lost
discarded
abandoned
broken_waste
battlefield_or_ruin_remnant
```

Отсутствие владельца в текущем кадре не создаёт такой basis.

## 14.4. Практический эффект

- молот в кузнице может существовать, но остаётся рабочим property;
- оружие в household воина может быть context-bound ordinary property;
- общественная тара может иметь communal controller, а не household owner;
- предмет из committed discarded group может быть genuinely unowned;
- materialization не создаёт бесплатный loot и не меняет legal owner при физическом изъятии.

# 15. Context-bound content

## 15.1. Минимальный gate

Для `context_bound` ordinary materialization требуется одновременно:

- approved permission/profile/source ref;
- committed local causal basis;
- matching property/economic context;
- ordinary authority class;
- owner-native mechanics path.

Общего утверждения «для XIII века возможно» недостаточно.

## 15.2. Оружие

Неуникальное оружие может быть `ordinary + context_bound`, но только внутри approved closed weapon/equipment profile либо source.

Примеры:

- ordinary yard без armament basis → `absent`;
- household воина с armament profile → возможен owned item;
- weapon production/stock profile → возможен work/stock item;
- battlefield/ruin remnant source → возможен finite damaged remnant;
- unique/historical/evidence-bearing weapon → `authority_required`.

LLM не изобретает authoritative weapon type, combat parameters или template identity. Она может concrete-изировать semantic variant только внутри переданного approved class; mechanics определяет item/combat owner.

## 15.3. Деньги, драгоценности и дорогие материалы

Currency identity, precious metal, expensive import и high-value stock требуют approved economic/source profile.

Template-less ordinary path не создаёт настоящую currency identity. Physical money-like token, созданный actor из доступного material, относится к A1 direct-action result и не становится валютой.

Свободный household budget не создаёт серебро или деньги.

## 15.4. Письменные и document-like objects

Ordinary path не создаёт:

- authoritative text content;
- подпись;
- official status;
- seal authenticity;
- legal force;
- evidence-bearing information.

Можно materialize ordinary blank substrate или obvious non-authoritative physical imitation только при committed material/source basis.

Player-written text как causal action result регулируется A1 и не становится objective truth.

## 15.5. Specialized tools и stock

Specialized professional tool либо товарный запас требует occupation/stock profile. `work` function без конкретной matching permission недостаточна для дорогого или переносимого context-bound item.

# 16. Природная materialization

Природные вещи делятся на три практических класса.

## 16.1. Ambient abundant source

Примеры:

- вода большой реки;
- обычный песок на песчаном берегу;
- грязь;
- обычная почва;
- обычные камни в каменистом месте;
- трава;
- мелкий валежник при подходящей среде.

Такой source считается практически неистощимым **в масштабе обычного gameplay**, а не буквально бесконечным.

Он не требует отдельного item slot для всей среды.

Когда actor извлекает порцию:

```text
ambient_abundant_source
→ direct-action origin ambient_ordinary
→ finite item/resource portion
→ exact quantity/mass/container mechanics
→ @rus/items-property
```

## 16.2. Local natural feature

Примеры:

- упавшее дерево;
- валун;
- небольшой глинистый выход;
- кустарниковая группа;
- локальная болотистая лужа;
- куча плавника.

Такая деталь materialize-ится лениво, только когда становится релевантна сцене.

Если она меняет movement/visibility/hazard/topology, semantic proposal передаётся spatial/environment owner; LLM не пишет topology сама.

## 16.3. Constrained natural resource

Примеры:

- руда;
- драгоценный металл;
- ценный янтарь;
- редкое сырьё;
- иной ресурс с существенной экономической ценностью.

Нужен approved regional/resource permission и локальный causal basis.

Нельзя получать его только потому, что геологически «такое где-то возможно» или игрок начал копать.

---

# 17. Finite sources и сохранение количества

## 17.1. Первый semantic estimate допустим один раз

Если finite ordinary source существует, но его точный initial quantity заранее не задан, LLM может один раз предложить правдоподобный initial amount при первом mechanically relevant resolution.

Примеры:

- куча обрезков;
- связка дров;
- запас обычной глины;
- группа однотипной дешёвой тары.

## 17.2. После commit quantity code-owned

После materialization:

- остаток хранится;
- расход уменьшает его;
- повторный запрос не пересчитывает объём;
- save/load сохраняет тот же результат.

LLM не может «найти ещё столько же» в том же finite source без новой causal basis.

---

# 18. Containers

## 18.1. Authoritative contents

Authored/significant/hidden/informational contents остаются у code/data owner.

Пустой authoritative candidate set не открывает ordinary fallback.

## 18.2. O2 v1 scope: уже существующий container

Первый ordinary-container profile поддерживает unresolved contents только для container, который уже существует как committed authored/template-backed instance.

Причина: current `rus.items.runtime_instance_mechanics_snapshot.v1` запрещает runtime container mechanics (`container = null`). Создание нового template-less container требует отдельного mechanics snapshot/versioned contract и не входит в O1/O2 existing-container cutover.

## 18.3. Resolution before reveal

Для разрешённого ordinary unresolved container:

```text
request_container_access
→ validate existing container/access
→ authoritative contents path first
→ if ordinary unresolved allowed:
     seed contents from container/site/property context
     without desired player item
→ validate item/property/mechanics writes
→ apply open/reveal on working projection
→ continue turn step from updated player-safe state
```

Содержимое определяется до player-visible reveal.

## 18.4. Player desire не входит в seed

Для:

```text
«Открываю сундук и беру меч»
```

contents seed не получает `меч` как evidence или desired output.

Seed получает:

- container template/category;
- owner/controller/property;
- site function;
- economic/occupation context;
- existing content profile;
- context-bound permissions;
- prior resolutions.

Continuation берёт sword только если committed/working contents действительно его содержат.

## 18.5. Exact mechanics before they matter

Если contents влияют на текущую exact механику container — total mass, packing usage, transportability — они должны быть resolved до выполнения этой mechanics.

Если current owner не может выразить exact state, operation блокируется typed data gap. Нельзя считать unresolved contents невесомыми.

## 18.6. Concealed ordinary не равно informational truth

Ordinary contents могут быть concealed до открытия. Это disclosure state.

Ordinary path всё равно не создаёт clue, authentic document, secret cache as authored event или другое informational content.

# 19. Observation, search и no-reroll

## 19.1. Presence state

Для ordinary candidate:

```text
unresolved
committed_present
committed_absent
```

Visibility/knowledge хранятся отдельно.

`unresolved` не означает concealed existence.

## 19.2. Exact resolution identity

Committed resolution привязан к:

- `scope_ref`;
- `coverage_key`;
- code-owned `candidate_key`;
- relevant physical/context version;
- request/idempotency identity.

Повтор exact identity читает persisted result без model call.

## 19.3. Перефразирование

Не обещается универсальный semantic matcher natural language.

Rephrase не reroll-ит только если:

1. deterministic code normalizer дал тот же `candidate_key`; либо
2. committed category/observation closure уже покрывает новый query.

Иначе request может получить новый key, но code всё равно проверяет overlap, closed scope и budget. Добавлять LLM-based paraphrase classifier только ради no-reroll запрещено без отдельной реальной потребности.

## 19.4. Более глубокий поиск

`look`, `inspect`, `search`, открытие container и `dig` могут иметь разные `coverage_key`.

```text
absent among visible surface objects
≠ absent inside closed container
```

Но exhaustive closure текущего micro-scope запрещает будущую противоречащую materialization без committed world change.

## 19.5. Закрытие micro-scope

Пример:

```text
open shelf + exhaustive large-vessel coverage
→ committed_absent candidate/category closure
→ крупный моток верёвки позже не появляется на неизменённой полке
```

World-state change может создать новый version/context и новое causal basis.

## 19.6. Bounded negative state

Ledger не хранит бесконечный список каждого вопроса.

Versioned policy задаёт `max_resolution_records` на scope. При приближении к limit code:

- объединяет совместимые negatives в category/coverage closure; либо
- возвращает `no_change` без нового granular record.

LLM не решает compaction и не получает возможность перезаписать прежние results.

# 20. Player-safe completeness

## 20.1. Concrete completeness сохраняется

`turn_step_request_v1.player_safe_state` остаётся полным для уже существующих player-visible/accessible concrete entities.

Если entity отсутствует в concrete player-safe set, actor не может использовать её как already-existing ref.

## 20.2. Отсутствие concrete ref не всегда является exhaustive absence

Если current scope допускает unresolved ordinary resolution:

```text
not in concrete player-safe entities
→ cannot reference as existing entity

but

ordinary_resolution_available = true
→ planner may issue request_discovery or request_container_access
→ domain handler may resolve ordinary detail
```

Planner не создаёт entity через direct `create_entity` для query-conditioned pre-existing world presence.

## 20.3. Capability marker

Player-safe projection может содержать минимальный marker:

```json
{
  "ordinary_resolution": {
    "discovery_available": true,
    "container_resolution_available": false
  }
}
```

Marker сообщает capability, а не hidden capacity, permission или expected result.

## 20.4. Hidden server state не раскрывается

Planner не получает:

- identity budget;
- background groups, если actor их не воспринимает;
- context-bound permissions;
- supporting basis allowlist;
- negative records вне actor knowledge;
- property/source evidence, которое не должно быть известно actor.

Dedicated internal ordinary request получает отдельную server-sanitized objective projection.

# 21. LLM authority

## 21.1. LLM может предложить

В пределах request allowlists LLM может:

- `density_band` для independent seed;
- minimal structured background groups;
- ordinary common item semantic descriptor + closed admission class/functional bucket;
- bounded initial primitive mechanics proposal для нового non-container item, когда request явно разрешает этот field;
- targeted `materialize|absent|no_change|authority_required`;
- local natural feature descriptor;
- initial qualitative scale/amount proposal только там, где contract явно разрешает first resolution;
- ordinary result existing-entity transformation;
- qualitative domain classification для импровизированного object;
- qualitative local-process transition, если deterministic rule недостаточен.

## 21.2. LLM обязана ссылаться на supplied basis

Положительный ordinary proposal обязан содержать `supporting_basis_ref` из request.

LLM не может:

- создать новый basis ref;
- заменить ref свободным explanation;
- расширить permission;
- перевести `common` в `context_bound`;
- назначить owner без property basis;
- назначить numeric identity budget;
- менять mechanics existing item либо предлагать mechanics вне supplied policy;
- назначить arbitrary fire resource delta.

## 21.3. LLM не может

LLM не может:

- создавать/изменять G0–G4;
- создавать canonical G5;
- создавать permanent route/edge/position;
- менять history/canon;
- создавать political/legal/religious authoritative fact;
- создавать informational/evidence-bearing truth;
- создавать unique/historical item ordinary path;
- создавать context-bound item без profile/permission/source;
- объявлять man-made object бесхозным без committed cause;
- менять persisted quantity/mass без physical event;
- писать DB/SQL/write patch;
- использовать actor wording как world evidence;
- возвращать player-visible narration как materialization effect.

# 22. Identity и преобразование предметов

Если физически продолжается тот же объект, сохраняется та же identity.

```text
жердь
→ заострить конец
→ та же entity_id
+ changed fact/mechanics при необходимости
```

Не:

```text
retire pole
create spear
```

Новая entity создаётся, когда возникает физически независимый объект:

```text
доска
→ четыре самостоятельных клина
```

Source transition и result creation должны образовывать один causal change set, если partial commit дал бы противоречивый мир.

---

# 23. Causal source и supporting basis contract

Player/NPC wording может быть trigger, но не causal source и не supporting basis.

## 23.1. Action-produced origin kinds

Для current direct-action path сохраняются active names:

```text
direct_partition
ambient_ordinary
crafted
```

A1 может versioned-расширить admissible semantics, но не меняет эти origin names без отдельной schema version.

### `direct_partition`

- source refs существуют;
- actor имеет access;
- source уменьшается/разделяется;
- known mass/quantity сохраняется;
- retry не повторяет partition.

### `crafted`

- inputs существуют и доступны;
- tools/conditions учитываются существующими owners;
- time/check проходят active mechanics;
- known material budget соблюдается;
- LLM не создаёт inputs.

### `ambient_ordinary`

- требуется committed spatial/environment source ref;
- extracted portion становится finite item/resource;
- precious/constrained material этим origin не создаётся без O2 permission/source.

## 23.2. Pre-existing ordinary basis kinds

Pre-existing ordinary content использует отдельное поле `basis_kind`, а не притворяется direct-action origin:

```text
household_use
work_or_occupation_use
stored_supply
maintenance
personal_possession
communal_or_service_use
waste_or_scrap
lost
discarded
abandoned
battlefield_or_ruin_remnant
existing_finite_source
ambient_ordinary_source
local_natural_feature
approved_structure_component
ordinary_container_context
independent_background_group
scope_bound_ordinary_policy
```

Каждый basis содержит existing refs.

## 23.3. Supporting basis membership

Request передаёт закрытый `allowed_supporting_bases`, где каждый entry содержит `basis_ref` и `basis_state = committed | prepared_seed`.

Positive proposal:

```text
supporting_basis_ref ∈ allowed_supporting_bases[].basis_ref
```

Code дополнительно проверяет, что candidate действительно покрывается basis kind/profile/group.

Свободная reason string не является membership proof.

## 23.4. Pre-existing man-made object

Для ordinary man-made object требуется `why here` relation:

```text
household | work | storage | maintenance | possession
| communal/service | waste | lost | abandoned | remnant
```

Если relation слабая или отсутствует, result — `absent` либо `no_change`.

## 23.5. Presence не гарантируется желанием

Если existing code/profile/RNG уже определяет presence — он имеет приоритет.

Ordinary semantic path возвращает только:

```text
materialize | absent | no_change | authority_required
```

Budget и expectation не превращают negative result в positive.

# 24. Свободный крафт

Этот раздел является target profile `A1`. До A1 cutover действует current direct-action admission `main`.

## 24.1. Recipe — fast path, не whitelist возможной физики

Если recipe существует и применим, используется code-owned recipe.

Если recipe отсутствует, разумная физическая попытка не блокируется автоматически.

```text
actor intent
→ LLM semantic grounding
→ source/tools/context
→ existing checks/time mechanics
→ result or state change
→ code admission
→ commit
```

## 24.2. Known conservation

Если известны exact amounts inputs:

```text
output + known waste
≤ available known material
```

с учётом иных явно существующих sources.

Не требуется моделировать полную химию и материаловедение, если gameplay этого не использует.

## 24.3. Невозможная технология

Попытка сделать невозможное для эпохи устройство остаётся реальной попыткой actor, но не создаёт работающую невозможную технологию.

Возможные результаты:

- неработающая конструкция;
- частично изменённые materials;
- wasted time;
- поломка;
- травма;
- fire/process, если есть причинное основание.

## 24.4. Письма и записи

Если actor физически написал текст на доступном материале:

- носитель и текст могут стать persisted physical fact;
- содержание текста не становится objective truth;
- knowledge других actor возникает только через perception/communication owners.

## 24.5. Weapon-capable и money-like physical outputs

Запрет на свободную материализацию **предсуществующего** оружия, денег и ценных вещей не запрещает физически получить обычный объект такого рода как прямой причинный результат действия.

Допустимо, например:

- заточить доступный кусок металла или сделать простое импровизированное оружие из реально имеющихся материалов;
- вырезать или отчеканить похожий на монету жетон;
- написать записку или изготовить обычный physical document-like carrier.

Для этого обязательны доступные materials/source refs, инструменты и время, а при неопределённом результате — обычная check/domain boundary. Получившийся объект проходит code-owned admission, получает exact mechanics/property/placement и сохраняется как новый causal result.

При этом LLM не получает права объявить такой объект официальной монетой, подлинным документом, canonical weapon type, законным знаком власти, исторической реликвией или иной authoritative identity без отдельного owner-owned основания. Самодельный money-like token не становится валютой только из-за внешнего сходства.

Этот путь не разрешает отвечать на вопрос игрока «тут лежит меч/монета?» созданием готового предмета: pre-existing world presence разрешается только через ordinary world resolution либо authoritative materialization, описанные выше.

---

# 25. Импровизированный предмет в domain mechanics

Template-less object может участвовать в бою или другой mechanic.

Если domain owner уже способен решить действие по существующим mechanics, новый LLM call не нужен.

Если owner объективно не имеет необходимой qualitative classification, допускается bounded semantic classification **на конкретной domain boundary**.

Для combat пример закрытых classes:

```text
not_weapon_capable
improvised_puncture_light
improvised_impact_light
improvised_cutting_light
improvised_two_hand_heavy
```

Точный vocabulary принадлежит combat owner.

LLM не возвращает произвольный `damage = 900`.

Combat owner переводит qualitative class в свои code-owned parameters.

Валидный `not_weapon_capable` не является ошибкой: ноль положительных
классификаций оставляет обычный unarmed/default profile применимым. Ровно один
positive задаёт weapon mechanics текущего resolution; несколько positive,
invalid output или exception fail closed.

В этой редакции не требуется long-lived универсальный affordance/combat profile item. После физического изменения вещи её можно классифицировать заново при следующей реально требующей этого boundary.

---

# 26. Spatial semantic concretization: finite topology, broad envelopes

Broad structure/site concretization этого раздела относится к отдельному profile `S1`. O1/O2 используют только уже существующий spatial scope и placement primitives.

## 26.1. Canonical geography

`world_base` продолжает владеть:

- canonical G0–G5;
- containment;
- routes;
- directional exits;
- significant/historical spatial entities;
- regional constraints;
- expansion profiles/capacities.

LLM runtime не создаёт G0–G4 и canonical G5.

## 26.2. Generated G5 сохраняет current finite proof

Критическое исправление относительно прежнего proposed-контракта:

> LLM semantic materialization **не отменяет** finite approved template candidate для generated G5.

Current Spatial v3 использует finite slots, allowed templates, per-template limits, residual capacities, reservation, terminal ordinal и feasibility proof.

Эти гарантии сохраняются.

## 26.3. Approved template может быть semantic envelope

Разработчик не обязан создавать отдельный concrete template для каждой возможной мастерской, двора или ordinary природной вариации.

Approved generated-G5/scene/structure template может описывать **широкий допустимый envelope**:

```text
ordinary craft parcel
ordinary riverside work compound
ordinary forest parcel
ordinary household outbuilding slot
```

Code по-прежнему:

1. выбирает/reserve-ит конечный approved template;
2. расходует существующую capacity;
3. создаёт topology только supported primitives.

LLM затем конкретизирует только разрешённые semantic fields/content внутри выбранного envelope.

Таким образом finite topology/capacity proof и unbounded concrete semantic variety существуют одновременно.

## 26.4. LLM не рисует arbitrary topology

LLM может предложить смысл:

> небольшая лодочная мастерская с крытым рабочим пространством и навесом.

Spatial owner определяет G5 class, supported G6 classes, positions, portal/blocker mechanics, edges, capacities и placement.

Если proposal невозможно представить существующими structural primitives, это mechanics/data gap, а не повод позволить LLM записать свободный graph.

## 26.5. Buildings

Ordinary building/structure может быть semantic-concretized, если:

- есть разрешённый structure/site envelope;
- capacity имеется;
- period/region/material culture совместимы;
- объект ordinary, а не authoritative institution;
- topology выражается supported primitives.

Canonical monastery, fortress, seat of power и другое significant authored place не создаются ordinary fallback.

## 26.6. Local natural features

Party-scoped ordinary feature допустима:

- небольшой овраг;
- глинистый обрыв;
- песчаная коса;
- валунная россыпь;
- заболоченная низина;
- упавшее дерево;
- кустарник;
- локальный родник.

Она должна соответствовать canonical environment, не переписывать global hydrography/topology, не создавать новый G3/G4, использовать spatial owner при влиянии на movement/hazard и resource contract при извлечении material.

## 26.7. Local landmarks

Материализованный ordinary объект может стать persisted local reference в knowledge/memory.

Он не становится автоматически canonical route point или глобальным общеизвестным ориентиром.

---

## 26.8. Ordinary-content не является scene-baseline augmentation

`party_scene_baseline` остаётся immutable.

Конкретные utensils, tools, scrap, local movable items, background groups и presence resolutions относятся к dynamic party state.

Если ordinary feature реально меняет permanent topology, она перестаёт быть просто content и проходит существующий spatial proposal/validation path. Нельзя использовать lazy-content ledger как обход finite G5/G6 topology rules.

---

# 27. Structural semantic remainder

Этот раздел задаёт будущий profile `S1`. Он не является обязательной частью O1 common ordinary item world. N1 — active общий механизм автономного решения NPC на existing decision boundary: NPC получает только реально исполнимые current actor-step owner capabilities и NPC-safe refs, LLM выбирает одно действие, а existing domain owners исполняют mechanics и persistence. Это не сценарный whitelist и не специальная logic Жданко.

## 27.1. Structural capacity остаётся code-owned

G5/G6 slots, finite topology и approved templates остаются у current owners.

LLM не увеличивает population или spatial capacity.

## 27.2. Code path имеет приоритет

Если approved spatial template уже разрешает instance без semantic gap, используется deterministic code path.

LLM нужна только для поля, которое:

- реально требуется текущему gameplay;
- не является authoritative;
- не имеет готового code/data representation;
- может быть выражено supported primitives.

## 27.3. Profile separation

```text
O1/O2
→ ordinary items, groups, resources, existing-container contents

S1
→ broad ordinary structure/site semantic envelope inside approved topology

N1
→ active autonomous NPC decision through executable current actor-step owner capabilities and NPC-safe refs, not scenario whitelist or Zhanko-specific logic
```

O1 не получает право materialize NPC или building.

## 27.4. Appearance и mechanics

Старое понятие ordinary NPC semantic remainder after deterministic profile/materializer отменено как значение N1. Оно может рассматриваться только как отдельная неактивная будущая идея без profile identifier.

## 27.5. Structure parts

Ordinary part существующей structure может materialize как item/source в O2, если:

- parent structure committed;
- partition physically possible;
- permanent topology не создаётся;
- spatial/items owners валидируют consequence.

Новая building topology относится к S1, а не к ordinary item ledger.

# 28. Tracks, traces и evidence boundary

## 28.1. Ordinary direct trace

LLM может semantic-concretize физический след, если причинный source уже committed:

- персонаж прошёл по грязи;
- телега оставила колею;
- дерево рубили в текущем процессе;
- огонь оставил золу.

## 28.2. Нельзя invent hidden history

Нельзя materialize:

- «следы разбойников»;
- кровь неизвестного человека;
- тайный лагерь;
- следы преступления

только потому, что это было бы интересно или игрок их ищет.

Если trace сообщает hidden/significant event, его causal source должен существовать у authoritative owner.

---

# 29. Player и NPC используют один ordinary world

После активации соответствующего profile ordinary materialization не является player privilege.

NPC может подобрать ordinary material, заострить жердь, сделать клин, связать предметы, использовать локальный resource, разжечь fire, добавить fuel и залить fire водой, если это следует из NPC-safe context и доступных refs.

NPC не может материализовать нужный ресурс только потому, что его decision требует этот ресурс.

---

# 30. Handoff и ownership responsibilities

## 30.1. `@rus/turn`

`@rus/turn` остаётся единственным runtime LLM orchestration owner для player и NPC actor paths.

Он:

- принимает `request_discovery` / `request_container_access`;
- определяет наличие unresolved ordinary gap;
- строит internal `ordinary_materialization_request_v1`;
- исключает player candidate из Stage A;
- вызывает injected model вне physical transaction;
- принимает strict response;
- передаёт proposal code-owned admission/domain owners;
- обновляет working projection;
- включает approved writes в root atomic plan.

System seed использует тот же internal service, но не создаёт второй player planner.

`request_world_process` добавляется отдельно только для F1.

## 30.2. `@rus/materialization`

Сохраняет code-only характер.

Допустимые pure helpers:

- request/plan structural validation;
- density-band policy application;
- supporting-basis membership validation;
- deterministic ref allocation;
- budget/resolution transition validation;
- semantic proposal → approved materialization proposal mapping.

`@rus/materialization` не вызывает LLM, не читает DB и не commit-ит.

## 30.3. `@rus/items-property`

После concrete item admission владеет:

- validation и persistence exact mechanics profile/snapshot;
- mass/quantity;
- packing;
- holder/controller/owner;
- container/inventory transitions;
- physical access;
- placement.

O1 требует два изменения current code:

1. отдельный ordinary-world admission, который не требует exact pre-authored `semantic_type + name + approved_fact_texts`;
2. versioned runtime mechanics provenance, пригодный для system/NPC ordinary materialization без обязательного `root_turn_id/step_index`.

Existing primitive mechanics shape переиспользуется: для нового non-container ordinary item LLM может один раз предложить initial `mass_grams`, hand/carry/packing и quantity только внутри request-supplied mechanics policy. Code валидирует shape, technical bounds, source conservation и context, затем сохраняет immutable snapshot. После commit LLM эти values не переоценивает.

Новый mass/inventory engine и item-by-item physical catalog не создаются.

Создание template-less runtime container не включается до mechanics contract, который способен валидировать container profile. Existing-container contents используют current committed container.

## 30.4. Spatial owner

Spatial owner владеет topology, position, portal, blocker, hazard и movement-significant feature.

Ordinary content:

- не мутирует immutable scene baseline;
- не создаёт permanent position/edge;
- использует существующие placement refs.

## 30.5. `@rus/visibility-knowledge-memory`

Owner формирует actor-safe projection из approved working/committed state.

Background group может существовать объективно, не будучи известным actor. Disclosure state не выводится из authority class.

## 30.6. `@rus/world-processes`

F1 добавляет pure local-exact process resolver в тот же package/owner.

Remote `catchUp` не меняет semantics и не становится local simulator.

## 30.7. `@rus/party-store` / game-server

`@rus/party-store` адаптирует approved logical plan.

Physical transaction:

- короткая;
- выполняется после model call и revalidation;
- атомарно сохраняет ledger + items/property/placement;
- не удерживает lock во время network call.

# 31. Proposed ordinary semantic contracts

Контракты являются internal family `@rus/turn` + `@rus/contracts`. Новый runtime package и новый player planner не создаются.

## 31.1. `ordinary_materialization_request_v1`

Логическая форма:

```json
{
  "schema": "ordinary_materialization_request_v1",
  "request_id": "...",
  "mode": "seed_scope",
  "scope_ref": {
    "entity_kind": "g6",
    "entity_id": "..."
  },
  "context_refs": {
    "period_ref": "...",
    "region_ref": "...",
    "function_refs": [],
    "environment_refs": [],
    "occupation_household_refs": [],
    "economic_context_ref": "...",
    "occupancy_state_ref": "...",
    "material_culture_refs": [],
    "property_context_ref": "..."
  },
  "policy_refs": {
    "authority_policy_ref": "...",
    "density_policy_ref": "...",
    "ordinary_presence_policy_ref": "...",
    "runtime_item_mechanics_policy_ref": "...",
    "allowed_admission_classes": ["common_mundane"],
    "context_bound_permission_refs": [],
    "allowed_supporting_bases": [
      {
        "basis_ref": "...",
        "basis_state": "committed"
      }
    ]
  },
  "ordinary_state": {
    "seeded": true,
    "density_band": "ordinary",
    "remaining_identity_budget": 3,
    "background_groups": [],
    "presence_resolutions": [],
    "closed_observation_scopes": []
  },
  "candidate_query": null,
  "technical_limits": {
    "max_new_entities": 2,
    "max_new_background_groups": 3,
    "max_resolution_records": 32
  }
}
```

Для `seed_scope`:

```text
candidate_query = null
```

Для targeted mode:

```json
{
  "candidate_key": "code-owned-key",
  "candidate_hint": "верёвка",
  "coverage_key": "visible_surface",
  "evidence_weight": 0
}
```

`mode` имеет закрытый enum `seed_scope | resolve_presence | resolve_container | resolve_natural_feature | refine_background_group`; `scope_ref.entity_kind` — `g6 | scene_position | container | source`. `candidate_hint` не влияет на policy refs и allowed basis refs. `basis_state` имеет закрытый enum `committed | prepared_seed`.

## 31.2. `ordinary_materialization_plan_v1`

`resolution` имеет закрытый enum `seeded | materialize | absent | no_change | authority_required`.

```json
{
  "schema": "ordinary_materialization_plan_v1",
  "request_id": "...",
  "resolution": "seeded",
  "density_band_proposal": null,
  "background_groups": [],
  "entities": [],
  "presence_resolutions": [],
  "reason_code": "..."
}
```

### Background group proposal

```json
{
  "descriptor": "обычная кухонная утварь",
  "functional_bucket": "household",
  "availability_class": "common",
  "allowed_admission_classes": ["common_mundane"],
  "causal_basis": {
    "basis_kind": "household_use",
    "basis_refs": ["..."]
  },
  "property_basis_ref": "...",
  "permission_refs": [],
  "disclosure_policy_ref": "..."
}
```

### Entity proposal

```json
{
  "semantic_descriptor": {
    "semantic_type": "hand_utensil",
    "name": "простая деревянная ложка",
    "facts": []
  },
  "authority_class": "ordinary",
  "admission_class": "common_mundane",
  "availability_class": "common",
  "functional_bucket": "household",
  "presence_expectation": "routine",
  "supporting_basis_ref": "...",
  "causal_basis": {
    "basis_kind": "independent_background_group",
    "basis_refs": ["..."]
  },
  "property_basis_ref": "...",
  "placement_proposal": {
    "scope_ref": "...",
    "position_ref": "..."
  },
  "mechanics_proposal": {
    "mass_grams": 35,
    "external_hand_cost": 1,
    "carry_form": "compact",
    "packing_slot_cost": 1,
    "quantity": {
      "value": 1,
      "unit": "item"
    },
    "container": null
  }
}
```

LLM не возвращает final entity ID, SQL row, state version или numeric budget. `mechanics_proposal` разрешена только как initial bounded proposal нового non-container item; это не mechanics formula и не permission менять existing instance.

## 31.3. Positive-plan invariants

Для каждого `entities[]` code проверяет:

- `authority_class = ordinary`;
- `admission_class` входит в request allowlist и согласован с availability/authority rules;
- `functional_bucket` входит в closed vocabulary;
- `supporting_basis_ref` входит в `allowed_supporting_bases`; prepared basis был создан candidate-free Stage A;
- `causal_basis.basis_refs` существуют и согласованы с supporting basis/source relation;
- basis/group policy разрешает declared `functional_bucket` и admission class;
- property basis существует;
- `context_bound` имеет permission;
- placement существует;
- initial mechanics proposal имеет exact primitive shape, проходит supplied mechanics policy/technical bounds и не создаёт runtime container;
- source/quantity conservation проверена, где существует finite source;
- mechanics owner способен сохранить exact snapshot;
- identity budget и batch limit доступны;
- resolution/observation не противоречат.

## 31.4. Strict schema

- `additionalProperties = false`;
- unknown enums запрещены;
- unknown refs отклоняются;
- `density_band_proposal` допускает только closed enum;
- arbitrary capacity number запрещён;
- LLM-generated IDs запрещены;
- significant/hidden/informational/authored entity rejected;
- unknown/disallowed admission class rejected;
- `container_capable` template-less entity rejected in O1/O2 existing-container profiles;
- positive without supporting basis rejected;
- negative record rejected, если candidate/coverage identity отсутствует;
- structural repair допускается один раз на том же immutable request.

# 32. Persisted ordinary-content state

## 32.1. Минимальный aggregate

Нужен один versioned party-scoped aggregate на relevant G6/container/source scope:

```text
scope_ref
state_version
seeded
density_band
identity_budget
remaining_identity_budget
background_groups
presence_resolutions
closed_observation_scopes
last_committed_request_identity
```

Concrete items/property/placements остаются в существующих normalized stores.

## 32.2. Физическая реализация

Current `main` не подтверждает готовый persistence slot для всех этих fields. Поэтому O1 должен планировать явную schema/repository delta, а не предполагать, что «dynamic state уже всё умеет».

Минимально приемлемы:

- одна normalized row на scope с versioned closed JSON payload для internal aggregate; либо
- существующая row/payload, если implementation докажет exact versioned update, uniqueness и atomic handoff.

Отдельный service/store owner не создаётся.

## 32.3. Bounded state

Aggregate не хранит:

- все потенциальные items;
- строку на каждый natural-language query;
- копию concrete item state;
- universal taxonomy;
- uncommitted model drafts.

Negative records ограничены policy cap и могут быть compacted в category/coverage closures code-owned способом.

## 32.4. Optimistic concurrency

Semantic call выполняется по pinned:

```text
party_state_version
ordinary_state_version
scope context refs
```

Перед commit обе версии revalidate-ятся.

Stale proposal не rebased silently.

## 32.5. Нет durable uncommitted-plan journal в O1

Если model response валиден, но process падает до commit, никакой world fact ещё не создан.

O1 не добавляет отдельный durable journal только для replay такого response. После restart допустим новый model call по тому же still-unresolved state, при условии:

- игрок не получил factual success response до commit;
- no partial writes occurred;
- committed result после успешного commit становится replay source.

Если product отдельно потребует bit-identical replay precommit proposals, это новый concrete requirement и отдельное persistence decision.

# 33. Authoring envelope и fallback hierarchy

## 33.1. Что авторить внимательно

Вместо списка каждого item критично корректно задать:

1. функцию G5/G6;
2. регион/период/material culture;
3. occupancy/use state;
4. household/occupation/economic context;
5. property context;
6. environment;
7. sensitive/context-bound permissions;
8. authored/significant/hidden/informational contents и disclosure policy, если они design-critical.

## 33.2. Context composition

Для ordinary semantics допустимо собирать контекст из уже approved/committed фактов по иерархии:

```text
specific G6/G5 context
→ function/building context
→ occupation/household context
→ settlement/social/economic context
→ regional material culture
→ conservative ordinary baseline
```

Это не является fallback к отсутствующему authored/significant candidate.

Новые historical/category facts на этом пути не придумываются.

## 33.3. Минимальный context gate

Для man-made ordinary materialization обычно должны быть известны:

- period/region;
- scope function/use;
- material culture либо достаточный региональный proxy;
- property context или explicit genuinely-unowned basis.

Если этих данных недостаточно, resolver предпочитает `no_change/absent`, а не фантазирует.

---

# 34. Historical realism prompt requirements

Dedicated ordinary prompt обязан фиксировать:

- actor query is not evidence;
- Stage A has no candidate or wishlist;
- use only supplied refs and policies;
- positive result requires supplied eligible `supporting_basis_ref` from committed or candidate-free prepared basis;
- maximize realism, not usefulness;
- prefer `absent`/`no_change` over weak justification;
- do not create wealth/value without economic basis;
- man-made items inherit property basis;
- context-bound requires explicit permission/profile/source;
- do not invent history, hidden actors, ownership events or evidence;
- respect period/region/material culture;
- use minimum detail needed now;
- do not fill identity budget for its own sake;
- prefer background group over enumerating unimportant entities;
- never contradict persisted resolution/observation;
- do not output arbitrary capacity, mechanics formulas or post-creation resource deltas; initial primitive item mechanics are allowed only in the bounded schema supplied for a new non-container item;
- authority and disclosure are separate;
- `reason_code` explains selection but never substitutes missing refs.

Prompt не используется как narrator prompt и не получает unrestricted DB state.

# 35. Narration boundary

Narrator не материализует factual entities.

Если narration называет конкретный actionable object:

```text
«на лавке лежит деревянная ложка»
```

эта ложка уже должна быть committed/working concrete entity.

Если visibility owner уже projected actor-visible group и concrete identity не нужна, narration может использовать group-level wording:

```text
«у печи стоит обычная кухонная утварь»
```

Concealed/background group, не входящий в actor-safe projection, narration не раскрывает. Проза не создаёт individual interactable facts.

---

# 36. Token, latency и transaction policy

## 36.1. Zero-call paths

Ordinary LLM call не выполняется для:

- pass-through;
- exact committed item;
- persisted exact candidate resolution;
- closed observation scope;
- deterministic group refinement;
- ordinary exact mechanics;
- replay committed result.

## 36.2. Minimal seed

Seed предпочитает:

```text
0..few salient concrete entities
+ few structured background groups
+ density_band
```

Полный inventory scene не генерируется.

## 36.3. First targeted query

Unseeded scope может потребовать два calls:

```text
seed_scope
resolve_presence
```

Это допустимо один раз для данного seed version. Candidate отсутствует в первом call.

## 36.4. Cache only committed facts

Committed resolution читается без model call.

In-process execution может reuse уже полученный immutable plan до завершения root attempt. После process crash до commit durable reuse не гарантируется, потому что O1 не вводит uncommitted-plan journal.

## 36.5. No network call under transaction lock

Model call всегда вне physical PostgreSQL transaction.

Transaction открывается только для revalidated write-plan commit.

## 36.6. Batch targeted work

Один discovery/search может resolve несколько действительно связанных candidates одним call, если:

- один scope;
- один coverage;
- общий policy context;
- batch limit соблюдён;
- независимые authoritative outcomes не смешиваются.

Не запускать call на каждую ложку.

# 37. World processes: один owner, два режима

## 37.1. Current remote catch-up не является local fire

Current `@rus/world-processes` реализует pure remote aggregate catch-up.

Remote `process_kind = fire` означает coarse propagation process, а не scene-level campfire с concrete fuel refs.

Запрещено:

- хранить local campfire в `remote_aggregate_state`;
- менять current `catchUp` semantics;
- создавать `@rus/local-world-processes`;
- автоматически конвертировать local fire в remote process в F1.

## 37.2. Additive local-exact contract

Тот же package/owner получает additive pure API, например:

```text
createWorldProcessEngine(...).catchUp(remote_request)       // unchanged
resolveLocalWorldProcessStep(local_request, local_policy)   // new pure surface
```

Нормативны owner и separation, а не export name.

## 37.3. Почему local state оправдан

Local fire должен:

- ссылаться на concrete finite fuel-unit entities;
- deterministic retire-ить один whole fuel unit на temporal boundary;
- реагировать на actor affect;
- иметь exact next boundary;
- жить независимо от actor;
- переживать reload;
- replay-ить committed boundary без double consumption.

Remote DTO этого не выражает без искажения.

Новый logical contract внутри existing owner допустим; новый engine/store owner — нет.

# 38. Local world process state v1

F1 поддерживает только:

```text
process_mode = local_exact
process_kind = fire
```

Минимальный state:

```yaml
schema: local_world_process_state_v1
process_ref:
process_mode: local_exact
process_kind: fire

scope_ref:
causal_basis_ref:

status:
  active | completed

started_at:
next_boundary_at:

fuel_bindings:
  - fuel_ref:
    fuel_class: ordinary_solid_fuel_unit

state_version:
```

Правила:

- `fuel_ref` ссылается на один persisted finite, non-stacked fuel-unit entity;
- `fuel_class = ordinary_solid_fuel_unit` входит в closed F1 vocabulary;
- этот class существует до `request_world_process`: его назначает только code-owned fuel-unit admission из approved template/category binding либо из causally partitioned A1/O2 result; F1 model не может объявить arbitrary item топливом;
- exact `mass_grams` whole unit обязан попадать в bounds active `local_fire_policy_v1`; слишком маленький/большой item сначала причинно partition-ится либо отклоняется;
- persisted array order задаёт deterministic burn order; новое fuel добавляется в конец;
- один `fuel_ref` не может одновременно принадлежать двум active local fires;
- process state является authoritative binding: обычный move/retire/consume bound fuel обязан либо atomically обновить fire через F1 `subject_changed`, либо быть отклонён; отдельная дублирующая item relation не требуется;
- F1 не классифицирует arbitrary liquids/materials как fuel;
- completed process не имеет `next_boundary_at`;
- process state не дублирует mass/quantity;
- storage переиспользует party-runtime persistence owner.

Не вводятся temperature, heat field, smoke graph, oxygen, generic intensity, arbitrary properties или process DSL.

## 38.1. Минимальная code-owned policy

F1 policy содержит exact temporal interval и узкие whole-unit admission bounds:

```yaml
schema: local_fire_policy_v1
recheck_interval:
fuel_unit_mass_grams_min:
fuel_unit_mass_grams_max:
```

`recheck_interval` — positive versioned interval существующего time contract. Mass bounds — positive safe integers, `min <= max`; они только не дают tiny twig и whole log гореть как один и тот же unit. Они не вводят burn curve, material ontology или partial-mass engine. Exact item mass остаётся у `@rus/items-property`.

Consumption rule фиксирован самим F1 contract и не является model decision или per-item authoring parameter:

```text
one exact temporal boundary
→ retire first persisted fuel binding as one whole fuel-unit entity
→ remove that binding from process state
```

Code-owned resolver:

1. выбирает первый `fuel_binding` в persisted order;
2. через item owner и current process binding валидирует, что это всё ещё active whole fuel-unit entity с ожидаемой item/process version;
3. retire-ит этот entity и удаляет binding одним causal proposal;
4. завершает process, если bindings больше нет;
5. иначе назначает `next_boundary_at = current_timestamp + recheck_interval`.

LLM не назначает burn amount. Partial mass/quantity consumption не входит в F1 v1.

## 38.2. Fuel всегда конечен

Continuous ambient source, quantity stack или arbitrary partially consumable resource нельзя присоединить напрямую.

Сначала через causal item/resource path отделяется один или несколько finite non-stacked fuel-unit entities, которые проходят code-owned class и mass-bound admission. Только такие units могут стать `fuel_ref`.

Каждый unit целиком retire-ится на одной boundary. Это делает F1 bounded без arbitrary max-lifetime и не требует нового generic partial-quantity engine. Различия внутри разрешённого narrow mass band являются намеренной v1 abstraction.

## 38.3. Ignition basis

Start требует:

- existing eligible whole-unit fuel binding;
- actor access;
- existing ignition basis/tool/fact;
- suitable local scope;
- current state version.

Фраза actor «разжигаю» не materialize-ит огонь, искру или fuel.

# 39. `request_world_process`

F1 добавляет один player/NPC actor-step domain operation:

```json
{
  "op": "request_world_process",
  "actor_ref": "actor-id",
  "process_action": "start",
  "process_ref": null,
  "process_kind": "fire",
  "source_refs": ["..."],
  "target_refs": ["..."],
  "description": "..."
}
```

`process_action` имеет закрытый enum `start | affect`.

## 39.1. `start`

```text
process_ref = null
process_kind = fire
```

`source_refs`/`target_refs` должны содержать existing fuel/ignition/scope basis.

Actor заявляет попытку, не successful process.

## 39.2. `affect`

```text
process_ref = existing local_exact fire
process_kind = fire
```

Code проверяет match process ref/kind/mode.

Типовые attempts:

- добавить approved fuel;
- залить existing water portion;
- физически разгрести fuel/embers.

Actor не назначает lifecycle result.

## 39.3. Почему одна операция

Отдельные commands `ignite_fire`, `add_fuel`, `pour_water` не нужны.

Свободное описание остаётся в actor intent, а process owner получает concrete refs и bounded action.

## 39.4. Реальная delta turn-step registry

Current operation sets продублированы как минимум в:

- `packages/turn/src/turn-step-contracts/constants.js`;
- `packages/turn/src/turn-step-contracts/operations.js`;
- `packages/turn/src/turn-step-actor-step.js`;
- `packages/turn/src/turn-step-admission.js`.

F1 обязан синхронно обновить validators, registry/admission, operation contract publication, handlers и tests. Prompt-only registration недостаточна.

# 40. Local fire resolution

## 40.1. Общий порядок

```text
request_world_process
→ @rus/turn validates actor/process/source refs
→ @rus/world-processes receives minimal objective snapshots
→ deterministic rule applicable?
     yes → exact lifecycle/resource proposal
     no  → optional world_process_step_request_v1
→ @rus/turn calls injected model
→ @rus/world-processes validates qualitative plan
→ code computes exact item/time/process deltas
→ one causal write plan
→ atomic commit
```

`@rus/world-processes` остаётся pure:

- no DB;
- no network;
- no direct model provider;
- no commit;
- no narration.

## 40.2. Deterministic-first

Без LLM разрешаются:

- unknown/completed/stale process;
- missing source/access;
- empty fuel binding set;
- regular temporal burn;
- retirement of the first whole fuel unit;
- adding already approved `ordinary_solid_fuel_unit`;
- duplicate/already-bound fuel ref;
- exact completion after the last unit is retired.

Semantic call допустим только для qualitative transition, которого code policy не моделирует, например uncertain ignition or extinguishing effect with supplied physical facts.

## 40.3. Exact transitions code-owned

LLM не возвращает numeric mass/quantity delta.

Она может вернуть qualitative outcome:

```text
no_effect | start | continue | complete
```

Regular temporal boundary всегда применяет fixed F1 transition: retire ровно один first-bound whole fuel unit. Actor affect использует только заранее отделённые finite input units, например один water-portion entity; accepted consumption retire-ит whole referenced input unit.

Если требуемый effect нельзя выразить whole-unit transition, result блокируется как mechanics gap. LLM number и partial hidden mutation не используются как fallback.

## 40.4. Actor affect атомарен

```text
water portion consumed
+ fire lifecycle transition
+ next boundary update
= one commit
```

Нельзя сначала расходовать resource, а затем отдельно решать effect.

## 40.5. Player-visible factual result

После успешного player actor-step F1 production resolver добавляет во
внутренний consequence safe factual seed с ordered key
`turn_step_world_process_<step_index>`:

```yaml
schema: rus.lower_dvina_trace_turn_step_world_process_visible_result.v1
process_kind: fire
action: start | add_fuel | affect
outcome: started | fuel_added | no_effect | continue | complete
status: active | completed
```

Разрешены ровно `start/started/active`, `add_fuel/fuel_added/active`,
`affect/no_effect/active`, `affect/continue/active` и
`affect/complete/completed`. Process/item refs, bindings, pins, causal evidence
и timestamps в seed запрещены. Existing visibility owner преобразует seed в
safe factual overlay над обычной phase projection того же root turn либо над
validated current-scene package pure F1. Overlay сохраняет остальные visible
facts, а clarification следует после уже совершённых F1 results. Combined
package сохраняется до narration; narrator только излагает сохранённые факты.
NPC actor-step и `temporal_boundary` seed не создают: off-screen transition
остаётся perception-gated и не раскрывается из process mechanics.

# 41. `world_process_step_request_v1`

Request создаётся только при irreducible qualitative gap.

```yaml
schema: world_process_step_request_v1
request_id:

party_state_version:
process_state_version: null | current

process_mode: local_exact
process_kind: fire

process: null | object
# existing object:
#   process_ref
#   scope_ref
#   causal_basis_ref
#   status: active
#   started_at
#   next_boundary_at
#   fuel_bindings: []

current_timestamp:

trigger:
  start_attempt | actor_affected | subject_changed

subject_state:
environment_state:

allowed_outcomes:
  - no_effect
  - start
  - continue
  - complete
```

Regular `temporal_boundary` не требует LLM в F1: consumption и lifecycle следуют code policy.

`subject_state`/`environment_state` содержат только:

- relevant committed facts;
- exact quantities supplied by owners;
- wet/dry/material class facts, если они существуют;
- actor affect inputs;
- scope environment.

Private NPC knowledge не становится objective physics.

# 42. `world_process_step_plan_v1`

```yaml
schema: world_process_step_plan_v1
request_id:
process_ref: null | existing_process_ref
process_state_version: null | current

interpretation:
  grounded_transition:

process_outcome:
  no_effect | start | continue | complete

affected_refs: []
fact_changes: []

reason_code:
```

Правила:

- start attempt использует `process_ref = null`;
- existing process ref/version должны exact match request;
- `affected_refs` могут ссылаться только на request refs;
- `fact_changes` проходят ordinary fact admission и не меняют item quantity;
- plan не содержит `resource_deltas`;
- plan не назначает timestamp, version, process ID или policy;
- plan не создаёт process kind;
- plan не применяет body damage;
- plan не раскрывает informational truth.

После validation `@rus/world-processes` и item/time owners строят exact lifecycle/resource proposal.

Successful start получает code-owned process ref.

`continue` не означает «неограниченно гореть»: next boundary и consumption определяет policy.

# 43. Fire boundaries и recheck

Fire не пересчитывается каждый UI tick.

Recheck создаётся только при:

```text
A. exact next_boundary_at reached
B. actor affect in current turn
C. requested or committed change to bound fuel/scope that F1 explicitly recognizes
```

### Temporal boundary

Всегда deterministic:

```text
retire first whole fuel-unit entity
→ remove its binding
→ complete if no bindings remain
→ otherwise schedule exact next boundary
```

### Actor/subject change

Может потребовать semantic request только если qualitative effect не покрыт F1 policy.

Universal subscription graph не создаётся. Item/process composition проверяет только refs, перечисленные в active local fire bindings, и регистрирует concrete F1-relevant triggers.

# 44. Fire v1 scope

Обязательное поведение:

1. ignition attempt с existing fuel/ignition refs;
2. successful start создаёт persisted `local_exact fire`;
3. process независим от actor activity;
4. exact temporal boundary исполняется current temporal owner;
5. один whole fuel-unit entity retire-ится на каждой due boundary;
6. approved fuel можно добавить;
7. existing water portion может вызвать validated affect;
8. process завершается;
9. reload воспроизводит state/next boundary;
10. committed retry не повторяет whole-unit resource transition;
11. model provider, если нужен, вызывается только `@rus/turn`.

Не требуется F1:

- smoke entity/propagation;
- dynamic lighting;
- body burns;
- adjacent spread;
- automatic NPC perception;
- weather simulation;
- heat transfer;
- temperature field;
- oxygen;
- multiple fuel classes;
- remote/local synchronization;
- remote wildfire bridge.

Эти функции требуют следующего concrete gameplay profile.

# 45. Process independent from actor

После committed successful start:

```text
NPC ушёл
→ process остаётся

actor погиб
→ process остаётся

player покинул scene
→ local exact state остаётся в party world
→ temporal owner продолжает due boundaries
```

Process принадлежит миру, а не activity породившего actor.

F1 не делает его remote aggregate автоматически. Off-screen внутри party exact temporal scope он остаётся local-exact process.

# 46. Safe projections

Semantic freedom не меняет security/knowledge boundary.

Player planner получает:

- existing concrete visible/accessible entities;
- revealed contents;
- actor knowledge;
- player-visible mechanics;
- minimal capability markers.

Не получает:

- hidden ordinary ledger;
- identity budgets;
- supporting basis allowlist;
- context-bound permissions;
- objective concealed contents;
- server-side economic/property evidence.

Правило:

```text
entity absent from concrete player-safe set
→ actor cannot use it as existing ref

ordinary discovery capability present
→ planner may issue request_discovery

existing container access capability present
→ planner may issue request_container_access
```

Internal ordinary request получает separate sanitized objective context.

NPC decision получает NPC-safe subjective context. Ordinary resolver получает only objective refs needed for physical admission, not NPC belief as truth.

World-process request получает process-relevant objective projection.

Narrator читает only approved working/committed visible projection и не materialize-ит entities.

# 47. Persistence, retry и atomicity

## 47.1. Committed actor result

После successful commit должны replay-иться:

- request/root identity;
- accepted step trace;
- created/changed refs;
- RNG/check result;
- mechanics snapshots;
- ordinary ledger transition;
- process boundary/whole-unit resource transition.

Один committed causal identity не применяется дважды.

## 47.2. Precommit failure boundary

Current turn loop не предоставляет durable accepted-plan journal до final commit.

Поэтому нормативная гарантия:

```text
before commit:
  no world fact
  no player-visible factual success
  process crash may cause a new model call

after commit:
  persisted result is source of truth
  no semantic reroll
```

In-process retry может reuse immutable plan. Bit-identical replay after crash-before-commit не входит в O1/F1.

## 47.3. Ordinary state replay

После commit переживают reload:

```text
seeded
density_band and identity budget
background groups
exact candidate/coverage resolutions
observation closures
ordinary state version
created items/property/placements
```

Exact committed `candidate_key + coverage + scope version` не вызывает model.

Arbitrary rephrase — только если code normalizer/closure сводит к той же identity.

## 47.4. Structural repair

Один structural repair допустим на том же immutable request до application.

Repair не считается отдельным world roll, потому что ни первый invalid response, ни repair не являются fact до commit.

Если repair не проходит — operation fails without partial writes.

## 47.5. Concrete item handoff

После creation item получает:

- stable ID;
- authored profile либо approved runtime mechanics snapshot;
- exact quantity/mass;
- property/holder/controller;
- placement;
- ordinary provenance.

Дальнейшие изменения проходят owners, а не LLM re-estimation.

## 47.6. Local process replay

Committed boundary связывает:

```text
process_ref
previous state version
boundary identity
qualitative plan if used
exact code-owned whole-unit resource transitions
new lifecycle state
next boundary
commit identity
```

Retry не повторяет burn/water/fuel unit transition.

## 47.7. Atomic examples

Craft:

```text
source transition
+ result items
+ mechanics/property/placements
= one commit
```

Ordinary present:

```text
positive resolution
+ item
+ mechanics/property/placement
+ identity budget delta
= one commit
```

Ordinary absent:

```text
negative resolution or coverage closure
= one commit
```

Fire affect:

```text
whole input-unit retirement
+ process transition
+ next boundary/lifecycle
= one commit
```

Partial causal commit запрещён.

# 48. Примеры нормативного поведения

## 48.1. Игрок просто проходит через двор

```text
movement/path mechanics
→ no ordinary seed
→ no ordinary model call
```

PASS.

## 48.2. Игрок подробно осматривает жилую избу

```text
request_discovery
→ unseeded scope
→ Stage A without player candidate
→ density band + household group
→ code-owned budget + property basis
→ atomic commit with discovery result
```

PASS.

## 48.3. «Тут есть деревянная ложка?»

Допустимы:

- committed scope-bound household/ordinary policy basis; либо
- candidate-free prepared Stage A household group в той же working projection.

Stage B returns spoon only with matching `supporting_basis_ref`.

```text
free budget without basis
→ absent/no_change
```

PASS.

## 48.4. «Тут есть серебряный кубок?» в бедной избе

Economic/context-bound permission отсутствует:

```text
absent
```

Household group и budget не помогают.

PASS.

## 48.5. «Ищу меч в земле обычного двора»

Нет armament/lost/remnant basis:

```text
absent
```

PASS.

## 48.6. Household воина

Committed armament profile + property basis существуют.

Обычное неуникальное оружие может materialize внутри approved class, но не получает arbitrary weapon mechanics и остаётся property household/owner.

PASS.

## 48.7. Battlefield/ruin remnant

Approved remnant source может поддержать finite damaged ordinary item.

Exact candidate result сохраняется. Повтор того же search identity не reroll-ит лучший object.

PASS.

## 48.8. Вода из реки

Committed river source = ambient ordinary source.

Извлечённая portion получает finite quantity/mass/container state.

PASS.

## 48.9. Ценный янтарь на любом берегу

Без regional/resource permission и local basis:

```text
absent
```

PASS.

## 48.10. «Открываю сундук и беру меч»

Container уже существует.

1. authoritative contents path checked first;
2. ordinary contents seed получает container/site/property context без desired sword;
3. contents materialize before reveal;
4. continuation берёт sword только если он реально present.

PASS.

## 48.11. «Создайте тут обычный новый сундук»

O1/O2 existing-container profile не создаёт template-less runtime container, потому что current mechanics snapshot не выражает container profile.

```text
authority/data gap or action-produced path after separate container mechanics contract
```

PASS.

## 48.12. Exhaustively inspected shelf

Committed category/coverage closure запрещает позднее materialize-ить противоречащий large vessel на неизменённой shelf.

PASS.

## 48.13. Повтор exact query после reload

Тот же `candidate_key + coverage + scope version`:

```text
read committed result
→ zero model calls
```

PASS.

## 48.14. Произвольное перефразирование

Если deterministic normalizer дал тот же key — reuse.

Если нет, contract не обещает universal equivalence. Code всё равно применяет closures/basis/budget и не создаёт semantic matcher LLM-call только ради deduplication.

PASS.

## 48.15. Crash после model response, до commit

```text
no factual player response
no partial writes
restart may call model again
```

После successful commit result не reroll-ится.

PASS.

## 48.16. Local fire temporal boundary

```text
next_boundary_at reached
→ code retires first whole fuel-unit entity
→ removes its binding
→ complete if no fuel remains, otherwise schedule next
→ no LLM
```

PASS.

## 48.17. Actor льёт воду на fire

Qualitative effect может потребовать bounded semantic plan; whole pre-portioned water-unit retirement и process transition commit-ятся атомарно. LLM не назначает количество.

PASS.

# 49. Acceptance tests

Каждый activation profile запускает только относящиеся к нему tests. Umbrella document не требует unrelated heavy suites.

## 49.1. O1 anti-wish

- candidate отсутствует в Stage A request payload;
- Stage B `evidence_weight = 0`;
- positive without `supporting_basis_ref` rejected;
- unknown/non-allowed basis ref rejected;
- free identity budget + wrong context → absent/no_change;
- silver/sword/unique evidence without permission → rejected;
- LLM reason text не заменяет basis refs.

## 49.2. O1 positive realism

- independently seeded household group supports owned wooden spoon;
- work group supports matching common tool;
- property proposal follows basis precedence;
- materialized item receives exact mechanics snapshot;
- direct `create_entity` cannot create query-conditioned world presence.

## 49.3. O1 routing/cost

- pass-through → zero ordinary calls;
- discovery in unseeded scope → at most seed + targeted calls;
- `request_discovery` internal branch used; no new player ordinary op;
- repeated committed exact key → zero calls;
- model call occurs outside transaction;
- stale version rejects proposal before write.

## 49.4. O1 persistence/no-reroll

- seed/group/budget survive reload;
- positive/negative resolution survives restart;
- exact candidate/coverage identity reuses result;
- deterministic rephrase normalization reuses same key;
- unrecognized paraphrase has no universal-equivalence guarantee;
- failed transaction leaves ledger/item/budget unchanged;
- committed retry does not duplicate item;
- crash-before-commit produces no visible factual success and no partial write.

## 49.5. O1 items-property cutover

- new ordinary-world admission does not require exact pre-authored name/fact allowlist;
- significant/hidden/informational candidate still rejected;
- system/NPC provenance validates without fake root player step;
- current direct-action snapshot remains valid during its own profile;
- container mechanics rejected in O1 runtime snapshot.

## 49.6. O2 property/context/resource

- explicit personal/communal/source property overrides location default;
- no silent unowned;
- context-bound without permission rejected;
- approved warrior armament class possible and owned;
- currency identity never template-less;
- ambient ordinary extraction creates finite portion;
- constrained resource requires permission;
- finite source amount decremented once through the owner-native quantity/resource transition;

## 49.7. O2 containers

- only existing committed container enters ordinary contents path;
- desired item absent from contents seed request;
- authoritative contents path has priority;
- concealed ordinary contents not player-visible before reveal;
- exact mass/packing resolved before relevant mechanics;
- template-less new container blocked until separate mechanics snapshot version.

## 49.8. Observation state

- visible-negative blocks same candidate/coverage reroll;
- deeper legitimate coverage may resolve separately;
- exhaustive closure blocks contradictory later item;
- resolution record cap triggers code-owned closure/no_change;
- narration does not expose ledger/budget/permissions.

## 49.9. Spatial

- ordinary content does not mutate scene baseline;
- no permanent edge/position from O1/O2 item materialization;
- movement-significant feature routes through spatial owner;
- S1 remains disabled when only O1/O2 active; N1 follows its separate active NPC contract.

## 49.10. A1 action-produced objects

| Case | Expected |
|---|---|
| Заострить жердь | same identity + facts/mechanics |
| Вырезать клинья | source transition + independent entities |
| Написать записку | physical text, no objective truth |
| Сделать token похожий на монету | physical item, no currency identity |
| Сделать weapon-capable object | physical result allowed, no unsupported canonical weapon identity |
| Impossible technology | realistic failure/limited physical result |

## 49.11. F1 registry/contracts

- `request_world_process` registered in all duplicated turn-step operation sets;
- strict operation validator rejects unknown fields/kinds;
- current remote `catchUp` behavior unchanged;
- local process has `process_mode = local_exact`;
- local/remote fire refs cannot be confused.

## 49.12. F1 process

- start requires fuel + ignition basis;
- arbitrary/undersized/oversized item cannot become fuel by model label;
- temporal boundary deterministic and model-free;
- each due boundary retires exactly the first whole fuel-unit entity;
- LLM plan cannot contain numeric resource delta;
- add fuel updates same process;
- the same fuel ref cannot bind two fires;
- moving/retiring bound fuel without an atomic process update is rejected;
- water affect is atomic with whole pre-portioned input-unit retirement;
- completed process has no next boundary;
- reload keeps same state/boundary;
- committed retry does not double consume;
- leaving scene/actor death does not delete process.

## 49.13. Model evaluation fixtures

Перед profile activation выполняется repeatable eval set:

- adversarial useful-item prompts;
- poor/rich household contrast;
- occupation/property contrast;
- context-bound negatives;
- adversarial class-mislabel fixtures (`weapon`/`silver`/`document` as `common_mundane`);
- anachronism probes;
- seed independence checks;
- over-enumeration checks;
- false-positive and false-negative review.

Eval не заменяет code gates. Она ловит systematic model behavior, которое schema сама не выявляет.

# 50. Authoring quality и model-behavior QA

Полный ordinary catalog не требуется.

Проверяется envelope:

1. function/use;
2. period/region/material culture;
3. occupancy;
4. household/occupation/economic context;
5. property;
6. environment;
7. context-bound permissions;
8. authoritative contents where design-critical;
9. density-policy binding.

Для изменяемого profile выполняется sampled seed preview:

```text
same committed context
+ several independent model proposals
→ review systematic realism
```

Проверяются:

- отсутствующий очевидный functional layer;
- excessive density;
- expensive objects without basis;
- anachronism;
- wrong property;
- context-bound leakage;
- background group over/under-breadth;
- candidate leakage into Stage A;
- pressure to fill budget.

Это профильный authoring/eval check, а не offline generation всего мира и не общий тяжёлый release ritual.

Code-owned acceptance tests остаются обязательными независимо от model eval.

# 51. Сверка с применяемыми игровыми решениями

Этот раздел является design validation, не runtime dependency.

## 51.1. Latitude Heroes

Sources:

- Heroes Dev Log #15:  
  `https://blog.latitude.io/heroes-dev-logs/heroes-dev-log-15-planned-and-persistent-locations-and-characters`
- Heroes Dev Log #17:  
  `https://blog.latitude.io/heroes-dev-logs/17`

Полезные patterns:

- important entities need planned/persistent reality;
- improv-only systems suffer from cohesion/boundedness problems;
- `reactive entity expansion` creates detail when and where needed.

Применение в проекте:

```text
authored/significant truth precommitted
ordinary detail expanded lazily
result persisted after code admission
```

Ограничение вывода: публичные dev logs описывают direction продукта и являются design precedent, но не доказывают production-grade implementation exact anti-wish/persistence contract.

## 51.2. Minecraft loot tables

Official Bedrock reference:

`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/loottablereference/examples/loottablecomponents/loot_entry?view=minecraft-bedrock-stable`

Shipped pattern:

- conditions determine eligibility;
- pools/rolls control attempts;
- entries determine outputs;
- `empty` is an explicit valid result.

Проект не копирует loot tables, weights или random drops.

Принимается только разделение:

```text
eligibility/budget
≠ content
≠ guaranteed item

absent
= valid result
```

## 51.3. No Man’s Sky continuous generation

GDC Vault:

`https://www.gdcvault.com/play/1024265/`

Production precedent показывает:

- large world content can be generated continuously/on demand;
- generation runs inside a supporting representation/pipeline;
- population/simulation are later pipeline stages, not arbitrary prose;
- authored tooling and procedural systems can coexist.

Проект не перенимает deterministic planet generation. Принимается только feasibility on-demand generation under engine constraints.

## 51.4. PCG + LLM survey

Maleki & Zhao, AIIDE 2024:

`https://doi.org/10.1609/aiide.v20i1.31877`

Survey supports treating LLM as one method inside combined PCG architecture rather than sole authority.

Для проекта:

```text
authoring controls envelope
code controls mechanics/gates/persistence
LLM supplies unenumerable semantic proposal
evaluation measures behavior
```

Survey также указывает research gaps; поэтому schema/gates нельзя заменять доверием к model.

## 51.5. Вывод внешней сверки

Внешние решения поддерживают:

- lazy/on-demand creation;
- persistence;
- separation of eligibility and output;
- explicit empty result;
- hybrid authored/code/generative pipeline.

Они не поддерживают:

- player wording as evidence;
- arbitrary LLM state writes;
- universal semantic rephrase deduplication;
- one-shot generation of entire location inventory;
- removal of project-specific property/authority/source gates.

Поэтому ревизия усиливает independent basis, code-owned budget mapping и profile-specific eval.

# 52. Реалистичность реализации на current `main`

## 52.1. Что уже можно переиспользовать

- `@rus/turn`: model orchestration, working projection, state revalidation, execution registry, logical write fragments;
- `request_discovery` / `request_container_access`: existing public domain requests для ordinary internal branch;
- `@rus/materialization`: pure validation/ref allocation location;
- `@rus/items-property`: primitive mechanics validation/snapshot, item/property/inventory mechanics после handoff;
- Spatial v3: existing scope/placement/topology boundary;
- `@rus/world-processes`: existing owner для additive local process;
- party-store/game-server: logical/physical commit boundary.

Новый ordinary engine не нужен.

## 52.2. Что нельзя считать уже готовым

- свободный ordinary admission без exact candidate allowlist;
- runtime mechanics provenance для system/NPC seed;
- ordinary-world mechanics policy binding for bounded initial proposals;
- runtime container mechanics;
- persisted ordinary ledger;
- committed supporting-basis model;
- no-reroll key/coverage model;
- owner-native finite quantity/resource decrement transition for O2/A1 partial consumption;
- local exact process storage/resolver;
- `request_world_process` operation wiring;
- durable uncommitted plan replay.

## 52.3. Оценка по profiles

| Profile | Scope | Реалистичность | Риск/объём |
|---|---|---:|---|
| O1 | common ordinary items/groups through discovery | высокая | medium-high, cross-cutting |
| O2a | property/context-bound/natural resources | высокая | medium-high |
| O2b | contents of existing containers | высокая | medium-high; exact mass/reveal ordering |
| A1 | broader action-produced physical results | высокая | medium-high; admission/contract cutover |
| F1 | local exact fire | высокая | high; process + time + item persistence |
| S1 | broad structure/spatial semantic remainder | условно высокая | high, separate spatial profile |
| N1 | autonomous NPC decision through current actor-step owner capabilities and NPC-safe refs | active | separate NPC contract |
| new template-less container | возможна позже | high | requires container mechanics snapshot version |

## 52.4. Итоговая оценка

Реализация реалистична при staged atomic profiles.

Нереалистично считать весь umbrella target:

- одной prompt change;
- одной локальной правкой `@rus/turn`;
- одним небольшим cutover;
- готовым только потому, что owners уже существуют.

O1 является разумным первым production slice. F1 и S1 не должны блокировать его и не должны активироваться вместе ради формальной «целостности документа»; N1 следует отдельному active NPC contract.

# 53. Противоречия с current active contracts и code

## 53.1. `AGENTS.md`

Current production:

- template-less ordinary entity only as direct-action result;
- no ordinary pre-existing world path;
- broad ban on weapon/money/letter-like ordinary results;
- authored/significant/hidden/informational candidate path fail-closed.

Required profile changes:

- O1 adds validated pre-existing common ordinary path;
- O2 adds context-bound under approved permissions;
- A1 separately broadens causally produced physical results;
- authoritative candidate hard block remains.

## 53.2. `code_driven_world_materialization_architecture.md`

Current candidate-set architecture has no third ordinary pre-existing semantic path.

Required split:

```text
authoritative candidate materialization
ordinary direct-action result
ordinary pre-existing world resolution
```

Ordinary fallback never repairs empty authoritative candidate set.

## 53.3. `turn_step_llm_contract.md` and operation registry

Current completeness means missing concrete entity cannot be used.

Required clarification:

- unresolved ordinary may be searched through existing domain requests;
- no new player ordinary operation;
- query-conditioned world presence cannot use direct `create_entity`;
- F1 alone adds `request_world_process`.

Current code duplicates operation sets across multiple files; F1 must update all.

## 53.4. `items_and_property.txt`

Design prose already supports category/group-level background content.

Active header/code still restrict template-less runtime to direct action.

Required:

- new ordinary-world admission;
- preserve property/access/inventory ownership;
- separate A1 produced-result changes.

## 53.5. `ordinary-runtime-result.js`

Current admission requires exactly one approved candidate by `semantic_type + name` and approved fact strings.

This is incompatible with unenumerable ordinary semantics.

O1 must add a separate strict admission based on:

- authority policy;
- closed admission class/functional bucket;
- supporting basis;
- availability/property/source gates;
- mechanics owner acceptance.

Do not silently weaken current direct-action admission for all paths.

## 53.6. `runtime-instance-mechanics.js`

Current snapshot:

- source kind only `ordinary_direct_action_result`;
- requires `root_turn_id`, `step_index`, `operation_ref`;
- origin kinds only direct-action;
- `container` must be null.

O1 needs versioned provenance for world/system/NPC materialization. Existing primitive mechanics fields can be reused, but request must supply a code-owned policy/bounds ref and admission must distinguish one-time initial proposal from later mechanics mutation.

Checked transfer paths expose `quantity_changes` in change-set shape but return it empty; no reviewed surface proves a general decrement operation. O2/A1 resource consumption therefore needs one narrow owner-native quantity/resource transition. F1 v1 deliberately avoids this dependency by retiring whole fuel-unit entities.

Template-less runtime container remains out until a separate snapshot/profile contract.

## 53.7. First-entry transaction

Current `first-entry-materialization.js` calls materialize inside transaction.

Ordinary semantic call must not reuse this pattern. It executes outside transaction with optimistic version revalidation.

## 53.8. Persistence/retry

Current loop result is not durable before commit.

Therefore original promise to reuse every validated plan after failed final commit is unsupported without new journal. Revised contract guarantees no reroll only after committed resolution.

## 53.9. Spatial v3

Compatible if:

```text
ordinary ledger = dynamic party state
not baseline/topology augmentation
```

S1 remains separate.

## 53.10. `@rus/world-processes`

Current owner only supports remote catch-up.

F1 needs additive local-exact state/resolver but keeps remote API unchanged.

## 53.11. World-base authoring

Current exact candidate/profile rules remain for authoritative items.

O1/O2 need broad ordinary policy/density/property/permission bindings, not item-by-item catalogs.

## 53.12. Module/generated docs

Each activated profile must synchronize affected:

- `AGENTS.md` and active profile contracts;
- `packages/turn/MODULE.md`;
- `packages/items-property/MODULE.md`;
- `packages/materialization/MODULE.md` if public responsibility changes;
- `packages/world-processes/MODULE.md` for F1;
- `apps/game-server/MODULE.md` when commit composition changes;
- `MODULE_INDEX.md` and generated schema/reference artifacts.

# 54. Profile activation acceptance

Umbrella document itself is not switched on as one runtime mode.

## 54.1. Common requirements

Every profile requires:

1. active normative text without opposite production rule for that profile;
2. strict schemas/validators;
3. one owner per responsibility;
4. state-version revalidation;
5. atomic writes;
6. save/load/retry tests;
7. no hidden-state leakage;
8. updated module/generated docs;
9. profile-specific integration/PostgreSQL tests where persistence changes;
10. no regression of authored/significant/hidden/informational fail-closed path.

## 54.2. O1 cutover

O1 becomes active only after:

- ordinary ledger persistence;
- density policy mapping;
- structured groups/supporting basis;
- `request_discovery` integration;
- new ordinary-world items admission/provenance;
- anti-wish/classification/property/no-reroll/lazy-cost tests;
- model call outside transaction;
- pass-through zero-call proof.

O1 may activate without O2/A1/F1/S1; N1 follows its separate active NPC contract.

## 54.3. O2 cutover

O2 activates only its selected subprofiles:

- context-bound/resource;
- existing-container contents.

A subprofile cannot claim support for template-less new containers unless container mechanics contract exists.

## 54.4. A1 cutover

A1 synchronizes direct-action contract/admission and tests. It does not implicitly enable pre-existing ordinary world presence.

## 54.5. F1 cutover

F1 requires:

- `request_world_process` wiring in all operation sets;
- local-exact process persistence;
- fixed whole-unit consumption rule and code-owned fuel-unit admission bounds;
- temporal integration;
- item retirement/process atomicity;
- bound-fuel conflict validation on item transitions;
- unchanged remote catch-up tests.

## 54.6. S1 cutover

S1 requires its own owner-specific contract/test acceptance and does not enter production merely because O1 ledger exists. N1 is governed by its separate active NPC contract.

## 54.7. Mixed semantics rule

Запрещено внутри одного active profile:

- dual writer;
- prompt-only partial activation;
- fallback to old path after new positive admission;
- reading/writing incompatible ledger versions.

Разные independent profiles могут находиться в разных statuses, если capability routing явно versioned и не маскирует отсутствующую feature.

# 55. Требуемая delta относительно current `main`

## 55.1. Normative split

Обновить active texts по profile, а не объявлять весь umbrella active.

Сохранить:

- single-writer owners;
- code first;
- authoritative fail-closed;
- one player semantic boundary;
- no LLM DB writes;
- committed result persistence.

## 55.2. `@rus/turn` — O1/O2

Использовать existing domain requests:

```text
request_discovery
request_container_access
```

Добавить internal ordinary semantic service:

- request construction;
- Stage A candidate exclusion;
- Stage B evidence weight zero;
- model call outside transaction;
- validation/admission handoff;
- working projection update;
- root write fragments.

Не добавлять `request_ordinary_detail` public op.

## 55.3. `@rus/turn` — F1

Добавить `request_world_process` во все duplicated:

- operation constants;
- validators/schema;
- actor-step registry;
- admission/domain sets;
- operation contract metadata;
- tests/composition handlers.

## 55.4. `@rus/materialization`

Добавить pure helpers:

- density band → identity budget;
- supporting basis/ref validation;
- group/entity closed class/bucket admission;
- budget/resolution transition;
- deterministic refs.

Никакого model transport.

## 55.5. `@rus/items-property`

Не ограничиваться provenance enum.

Нужно:

1. сохранить current direct-action admission;
2. добавить separate ordinary-world admission;
3. добавить versioned mechanics snapshot/provenance для `ordinary_world_materialization`;
4. разрешить system/NPC causal identity без fake player root step;
5. добавить request-bound runtime item mechanics policy/technical limits для one-time initial proposal;
6. сохранить exact mechanics/property/placement owners после validation/commit;
7. добавить owner-native finite quantity/resource transition для O2/A1 cases, где расход не выражается retirement целой entity;
8. оставить runtime container unsupported до отдельного contract.

## 55.6. Persistence/DDL

Добавить или доказанно переиспользовать one-row-per-scope ordinary aggregate:

- version;
- seed/density/budget;
- groups;
- resolutions;
- closures;
- request identity.

Обновить repository, migration, schema reference и PostgreSQL tests.

Concrete item relations остаются normalized.

## 55.7. Spatial/player-safe projection

Добавить:

- placement validation against existing positions;
- no baseline mutation assertion;
- ordinary resolution capability marker;
- concealed ledger filtering;
- working projection refresh after internal resolution.

## 55.8. Containers

O2 existing-container only:

- authoritative contents priority;
- ordinary seed before reveal;
- desired item excluded;
- exact mass/packing before dependent mechanics;
- no new runtime container.

## 55.9. World-base authoring

Добавить broad versioned policy bindings:

- function/use;
- economic/property;
- material culture;
- context-bound permissions;
- density hints/policy ref;
- ordinary presence/source basis.

Не добавлять item-by-item min/max catalog.

## 55.10. A1 direct-action result

Versioned-расширить admission для:

- weapon-capable physical result;
- fake-money-like token;
- player-written carrier/text;
- other ordinary crafted/partitioned output.

Не granting authoritative identity.

## 55.11. F1 `@rus/world-processes`

Добавить:

- local state/validator;
- local resolver;
- `local_fire_policy_v1`;
- deterministic one-whole-unit temporal boundary consumption;
- bound-fuel conflict/revalidation adapter for relevant item transitions;
- qualitative semantic request/plan adapter;
- process write proposal.

Remote engine/API unchanged.

## 55.12. S1 and inactive future NPC semantic remainder

Вынести в отдельные implementation plans:

- S1 broad template semantic fields inside finite topology;
- inactive future NPC semantic remainder after deterministic profile/materializer, without profile identifier.

Не включать в O1 MVP.

## 55.13. Prompts/eval

Добавить dedicated ordinary and process prompts plus fixture evaluation.

Prompt не является safety boundary; code validators остаются authoritative.

## 55.14. Documentation/generated registries

После каждого profile cutover обновить только affected docs/modules/schema references и штатно regenerate registries.

# 56. Рекомендуемый порядок внедрения

## 56.1. Foundation shadow work

Без production semantic switch:

- strict ordinary schemas;
- density policy;
- ledger schema/repository;
- supporting-basis validator;
- projection capability marker;
- model fixtures;
- unit/contract tests.

## 56.2. O1 — common ordinary world

- `request_discovery` internal branch;
- independent Stage A;
- structured common groups;
- common targeted resolution;
- property inheritance;
- exact candidate no-reroll;
- new items admission/provenance;
- atomic commit.

После acceptance O1 может активироваться отдельно.

## 56.3. O2a — natural/resource/context-bound

- ambient ordinary source;
- finite source first amount + exact decrement transition;
- constrained resource permissions;
- context-bound profiles;
- currency/weapon/value negatives;
- property precedence.

## 56.4. O2b — existing-container contents

- pre-reveal seed;
- authoritative contents priority;
- concealed projection;
- exact container mass/packing ordering.

Template-less new container remains deferred.

## 56.5. A1 — action-produced physical freedom

- direct-action admission changes;
- free crafting/conservation;
- weapon-capable/fake-money-like/written physical results;
- authoritative meaning remains blocked.

## 56.6. F1 — local exact fire

- operation registry;
- local process state;
- whole-unit consumption rule;
- temporal boundaries;
- fuel/water affect;
- persistence/retry;
- remote compatibility tests.

## 56.7. S1 and inactive future NPC semantic remainder — only on concrete demand

- broad spatial/structure envelope;
- ordinary NPC semantic remainder without profile identifier.

Каждый получает отдельный plan/cutover.

## 56.8. Activation discipline

Нет единого Phase G для unrelated features.

Для каждого profile:

```text
implement
→ shadow/fixtures
→ profile tests
→ active normative synchronization
→ one versioned cutover
```

До своего cutover profile остаётся disabled, а current production path сохраняется.

# 57. Явно не требуется v2.1

Без следующей конкретной игровой потребности не вводить:

- universal quota engine;
- item-by-item min/max catalog;
- LLM numeric world capacity;
- universal material ontology;
- universal semantic dependency engine;
- universal affordance engine;
- separate loot engine;
- global resource ecology;
- full economy simulator;
- full chemistry/heat/oxygen;
- procedural replacement G0–G5;
- runtime creation G0–G4;
- LLM-authored global routes;
- mutable scene baseline;
- second player planner;
- LLM inside `@rus/materialization`;
- second spatial/NPC/temporal/process owner;
- event sourcing;
- durable journal of uncommitted model plans;
- universal natural-language paraphrase matcher;
- long-lived generic combat affordance profile for every item;
- generic process DSL;
- dynamic smoke/lighting/fire spread;
- full flora/fauna simulation;
- automatic remote/local fire bridge;
- world materialization far from current causal boundary;
- decorative mass generation;
- one LLM call per small object;
- offline generation of all possible contents;
- template-less runtime container before exact container mechanics contract;
- synchronized activation of unrelated O1/O2/A1/F1/S1 profiles.

Technical strictness remains mandatory where it directly preserves committed facts, atomicity, exact mechanics, safe projections and owner boundaries.

# 58. Итоговая архитектура

## 58.1. Ordinary world

```text
CANONICAL / AUTHORED WORLD
G0–G5 + G6 topology + period/region
+ function/economy/property/material culture
+ approved ordinary policies/permissions
                    |
                    v
          meaningful engagement?
          no  → zero ordinary calls
          yes → existing domain request
                    |
                    v
        scope seeded?
          no  → Stage A without candidate
                density_band + structured groups
          yes → reuse committed state
                    |
                    v
       targeted candidate needed?
          no  → projection/terminal
          yes → Stage B:
                candidate evidence_weight = 0
                    |
                    v
        SUPPORTING BASIS CHECK
allowed committed/prepared basis ref
+ authority/availability/property/source
+ observation/resolution
+ identity budget
                    |
          +---------+------------------+
          |         |                  |
      materialize  absent/no_change  authority_required
          |         |                  |
          v         v                  v
 items/property   persisted exact     authoritative
 mechanics        resolution/closure  path
          |
          v
 short revalidated atomic commit
          |
          v
 persistent party world
```

## 58.2. Actor action

```text
ANY ACTOR INTENT
→ exact fast path if applicable
→ active turn semantic planner
→ direct operations or existing domain request
→ internal ordinary resolver only for genuine mundane gap
→ owner validation
→ working projection
→ atomic commit
```

Ordinary pre-existing presence не создаётся direct `create_entity`.

## 58.3. Persistence semantics

```text
before commit
= proposal only, no factual response

after commit
= stable world fact, exact identity, no reroll
```

No-reroll applies to committed code-owned resolution identity, not magical equivalence of all phrases.

## 58.4. Local fire

```text
request_world_process
→ existing fuel/ignition refs
→ deterministic-first local resolver
→ optional qualitative model call through @rus/turn
→ code-owned whole-unit resource transition
→ temporal boundary
→ atomic process/item commit
```

Remote catch-up remains separate.

## 58.5. Activation

```text
O1 common ordinary
O2 context/resource/container
A1 action-produced results
F1 local fire
S1 spatial remainder
N1 active autonomous NPC decisions
```

Each profile is independently atomic. Umbrella document is not a reason to combine them in one release.

## 58.6. Главный продуктовый принцип

> Заранее исчерпывающе задаются не все ordinary-предметы, а исторические, пространственные, экономические, property, source и authority-границы правдоподобия. Конкретная бытовая реальность materialize-ится в самом узком активном scope только при реальной игровой потребности. Actor wording открывает вопрос, но не является доказательством ответа. Положительный result требует independently committed либо candidate-free prepared Stage A supporting basis. После code validation и commit конкретика становится устойчивым фактом партии.

# Приложение A. Устранённые противоречия и принятые решения

## A.1. Один giant cutover для unrelated features — отклонено

Исходный v2 запрещал любую частичную активацию и связывал ordinary world, free crafting, spatial/NPC remainder и local fire.

Это противоречило принципу разумной достаточности и увеличивало release risk.

Решение: независимые atomic profiles O1/O2/A1/F1/S1; N1 регулируется отдельным active NPC contract. Mixed semantics запрещена внутри profile, но profile не ждёт unrelated implementation.

## A.2. Новый player operation для ordinary detail — отклонено

Current `request_discovery` и `request_container_access` уже выражают player intent.

Решение: ordinary materialization является internal subrequest domain handler, а не новым public player operation.

## A.3. Reuse `first-entry-materialization.js` для LLM — отклонено

Current helper вызывает materializer внутри transaction.

Решение: ordinary model call вне transaction; затем version revalidation и short atomic commit.

## A.4. LLM назначает arbitrary capacity number — отклонено

Числовой budget является mechanics/policy, а не semantic prose.

Решение: LLM возвращает `sparse|ordinary|dense`; code-owned versioned policy вычисляет identity budget.

## A.5. Свободный budget разрешает названный предмет — отклонено

Решение:

```text
budget = necessary admission guard
supporting_basis_ref = necessary independent presence basis
(committed or candidate-free prepared)
actor wording = zero evidence
```

## A.6. `routine` является достаточным gate — отклонено

Expectation является diagnostic.

Даже routine candidate требует committed scope policy/group/source basis.

## A.7. Background group как свободная строка — отклонено

Решение: structured group с scope, basis refs, property basis, availability class, permission refs и disclosure policy.

## A.8. `hidden` как синоним concealment — отклонено

Current active `hidden` authority class и физическая concealment — разные измерения. Удалять active class нельзя.

Решение:

```text
authority: ordinary | significant | hidden | informational | authored_canonical
disclosure: visible | concealed | inaccessible | unknown_to_actor | revealed
```

## A.9. Ordinary concealed container contents запрещены как hidden — уточнено

Ordinary contents existing container могут быть concealed.

Запрещено не concealment, а invention informational/evidence-bearing truth.

## A.10. Universal no-reroll для любого перефразирования — отклонено

Решение: no-reroll по committed code-owned `candidate_key + scope + coverage + version`.

Rephrase reuses result only after deterministic normalization or coverage closure.

## A.11. Unlimited negative resolution rows — отклонено

Решение: policy cap + code-owned category/coverage closure либо `no_change`.

## A.12. Durable replay любого validated precommit plan — отклонено для v2.1

Current loop не commit-ит plan до root transaction.

Решение:

- before commit — no fact, crash may call model again;
- after commit — persisted result no reroll;
- durable uncommitted journal только по отдельному product requirement.

## A.13. `@rus/items-property` требует только provenance change — отклонено

Current code также требует exact approved `semantic_type + name` и approved fact texts.

Решение: separate ordinary-world admission + versioned mechanics provenance.

## A.14. System seed притворяется player turn step — отклонено

Current snapshot требует `root_turn_id/step_index`, но system/NPC seed не должен подделывать player provenance.

Решение: new versioned causal provenance identity.

## A.15. Template-less runtime container уже поддержан — отклонено

Current snapshot требует `container = null`.

Решение: O2 existing-container contents only. New runtime container deferred until exact mechanics contract.

## A.16. Pre-existing weapon как common item — отклонено

Weapon может быть ordinary authority, но `context_bound` availability.

Нужны approved class/profile + local armament/remnant basis + property.

## A.17. Currency identity через template-less ordinary path — отклонено

Actual currency identity требует authoritative/economic profile.

Actor-produced token может существовать физически, но не становится currency.

## A.18. Location owner всегда имеет приоритет — уточнено

Решение: more specific committed property/source/personal/communal basis precedes location default.

## A.19. `ambient_extraction` как current origin name — исправлено

Active direct-action vocabulary использует `ambient_ordinary`.

Pre-existing sources используют separate `basis_kind`, а не новый origin enum без schema version.

## A.20. New ordinary path ослабляет direct-action admission — отклонено

Решение: current direct-action admission сохраняется; O1 adds separate path. A1 changes direct-action semantics independently.

## A.21. Broad structure/NPC remainder входит в O1 — отклонено

S1 — separate high-risk profile. N1 не является ordinary materialization profile: это separate active NPC contract.

O1 materialize-ит only ordinary content in existing scope.

## A.22. Local fire state с `weaken|strengthen|smolder` без state fields — отклонено

Исходный plan vocabulary не соответствовал minimal state `active|completed`.

Решение F1:

```text
no_effect | start | continue | complete
```

## A.23. `recheck_interval` без consumption semantics достаточно для exact fire — отклонено

Один interval не определяет physical transition. Добавлять generic partial-mass engine только ради F1 также не требуется.

Решение F1 v1: fixed code-owned invariant — на каждой due boundary retire-ится ровно первый whole `ordinary_solid_fuel_unit`; policy хранит `recheck_interval` и narrow whole-unit mass admission bounds.

## A.24. LLM numeric fire resource deltas — отклонено

Exact quantity belongs to code/item owner.

LLM returns qualitative outcome only.

## A.25. Local and remote fire share one DTO — отклонено

Один owner/package сохраняется, но modes/contracts разные:

```text
remote aggregate
local_exact
```

## A.26. Automatic local→remote bridge in F1 — отклонено

Нет текущей gameplay need. Local exact process continues offscreen under party temporal scope.

## A.27. External precedent доказывает exact architecture — отклонено

Latitude is design precedent; Minecraft/No Man’s Sky support individual production patterns; PCG survey supports hybrid composition.

Project-specific anti-wish/persistence still requires gates and eval.

# Приложение B. Внешняя design-сверка

Приложение не является runtime dependency и не является источником исторических фактов игры.

## B.1. Latitude Heroes Dev Log #15

Source:

`https://blog.latitude.io/heroes-dev-logs/heroes-dev-log-15-planned-and-persistent-locations-and-characters`

Подтверждает design problem:

- improv-only content weakens cohesion and boundedness;
- important locations/characters benefit from planning;
- planning may occur dynamically as exploration makes entity important.

Применение:

- independent seed;
- persistent result;
- no full pre-generation.

Ограничение: dev log описывает product direction, а не audit exact persistence implementation.

## B.2. Latitude Heroes Dev Log #17

Source:

`https://blog.latitude.io/heroes-dev-logs/17`

Формулирует `reactive entity expansion`: enough detail, at the right time.

Применение:

```text
minimal scope seed
→ targeted expansion on need
→ persistence
```

Не применяется к canonical/significant/hidden/informational fallback.

## B.3. Minecraft Bedrock loot-table reference

Source:

`https://learn.microsoft.com/en-us/minecraft/creator/reference/content/loottablereference/examples/loottablecomponents/loot_entry?view=minecraft-bedrock-stable`

Подтверждает shipped separation:

- conditions;
- pools;
- rolls;
- entries;
- explicit `empty`.

Применение:

```text
gate/budget
≠ positive item
```

Не копируются loot weights, RNG или item catalogs.

## B.4. No Man’s Sky continuous world generation

Source:

`https://www.gdcvault.com/play/1024265/`

Подтверждает shipped feasibility:

- content generated continuously/on demand;
- supporting technical representation/pipeline;
- generation proceeds to population/simulation stages;
- large scale does not require storing every possible concrete object.

Не является аналогом LLM ordinary semantics и не доказывает anti-wish behavior.

## B.5. Maleki & Zhao, PCG + LLM survey

Source:

`https://doi.org/10.1609/aiide.v20i1.31877`

Подтверждает:

- LLM is one PCG method among several;
- combined methods are a first-class design category;
- content type/representation/control matter;
- research gaps remain.

Применение:

```text
authoring/policies + code validation + LLM proposal
```

## B.6. Design conclusion

Наиболее устойчивый pattern для проекта:

```text
authoritative authored envelope
+ code-owned policy/basis
+ minimal independent seed
+ targeted LLM proposal
+ valid absent/no_change
+ exact domain handoff
+ atomic persistence
+ profile-specific eval
```

Внешняя сверка не обосновывает:

- positive answer from player wording;
- arbitrary LLM numbers;
- whole-location inventory generation;
- universal paraphrase identity;
- removing authoritative candidate paths;
- giant synchronized activation.

# Приложение C. GitHub normative/code basis, проверенный для этой редакции

**Repository:** `PavelSlaven/Novgorod1230`  
**Branch:** `main`  
**Checked HEAD:** `2a6ce7ab72a515ae1d240ca99eb4fc5dd4795b58`  
**Date:** 2026-08-16

## C.1. Нормативы и module surfaces

Проверены:

- `AGENTS.md`;
- `MODULE_INDEX.md`;
- `packages/turn/MODULE.md`;
- `packages/items-property/MODULE.md`;
- `packages/materialization/MODULE.md`;
- `packages/world-processes/MODULE.md`;
- `packages/party-store/MODULE.md`;
- `apps/game-server/MODULE.md`;
- `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
- `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md`;
- `data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md`;
- `data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt`;
- `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`.

## C.2. Turn code

Проверены:

- `packages/turn/src/turn-step-contracts/constants.js`;
- `packages/turn/src/turn-step-contracts/operations.js`;
- `packages/turn/src/turn-step-actor-step.js`;
- `packages/turn/src/turn-step-admission.js`;
- `packages/turn/src/turn-step-execution.js`;
- `packages/turn/src/turn-step-loop.js`;
- `packages/turn/src/first-entry-materialization.js`;
- relevant test directory surfaces.

Подтверждено:

1. active direct operations:
   `create_entity`, `move_entity`, `change_entity_facts`,
   `set_entity_mechanics`, `retire_entity`, `apply_body_event`;
2. active domain operations:
   `request_discovery`, `request_container_access`, `request_movement`,
   `request_item_use`, `request_activity`, `emit_interaction`,
   `request_combat`;
3. operation sets duplicated across validators/admission/actor-step;
4. loop maintains working projection and revalidates base state;
5. accepted plan is not a durable precommit record;
6. first-entry helper calls materializer inside transaction.

## C.3. Items/property code

Проверены:

- `packages/items-property/src/ordinary-runtime-result.js`;
- `packages/items-property/src/runtime-instance-mechanics.js`;
- `packages/items-property/src/runtime-item-transition.js`;
- `packages/items-property/src/index.js`;
- item/property module contract.

Подтверждено:

1. current ordinary result admission requires one exact approved candidate;
2. facts must match approved texts;
3. origin kinds:
   `direct_partition`, `ambient_ordinary`, `crafted`;
4. snapshot source kind:
   `ordinary_direct_action_result`;
5. snapshot requires root turn/step provenance;
6. runtime container mechanics are not represented (`container = null`);
7. authored profile and runtime snapshot are mutually exclusive mechanics sources;
8. checked runtime item transition surfaces handle placement/inventory recalculation but do not prove a general partial mass/quantity consumption transition. F1 therefore uses whole-unit retirement in v1.

## C.4. World-process code

Проверен `packages/world-processes/src/index.js`.

Подтверждено:

- current API is pure remote catch-up;
- `fire` is one remote propagation kind;
- profiles require code-owned interval and finite lifetime;
- current DTO is not local scene fire state;
- additive local-exact API can stay in same owner without changing remote semantics.

## C.5. Persistence/schema surfaces

Проверены party-db schema/catalog surfaces and party-store ownership.

Подтверждено:

- concrete party items/relations have existing storage concepts;
- no checked active contract proves a ready ordinary seed/groups/resolution aggregate;
- O1 therefore requires explicit repository/schema decision and tests;
- physical transaction remains server-owned.

## C.6. Главные active conflicts

До profile cutover production не разрешает:

1. pre-existing template-less ordinary world presence;
2. ordinary-world admission without exact candidate policy;
3. world/system provenance mechanics snapshot;
4. template-less runtime container;
5. unresolved ordinary capability in player-safe contract;
6. local-exact fire;
7. `request_world_process`.

Эти conflicts не исправляются prompt-only change.

## C.7. Что архитектурно совместимо

Target сохраняет:

- `@rus/turn` as model orchestration owner;
- `@rus/materialization` as pure code owner;
- `@rus/items-property` as exact physical owner;
- immutable spatial topology baseline;
- current authored/significant/hidden/informational fail-closed path;
- one logical write plan and one physical commit owner;
- current remote world-process API;
- current direct-action path until A1 cutover.

## C.8. Итог GitHub-сверки

Рекомендуемый first implementation target:

```text
O1 common ordinary items/groups
through existing request_discovery
with explicit ledger, supporting basis,
new items admission/provenance,
model call outside transaction,
and committed exact-key no-reroll.
```

Это наиболее маленький slice, который реально улучшает свободный ordinary world и не требует одновременно менять spatial/NPC generation или local processes.
