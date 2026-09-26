# Источниковая основа авторинга трёх семейств procedural scene

Статус: исследовательский материал для human authoring review. Этот файл не
утверждает строки каталогов, не создаёт runtime ID, не активирует overlay и не
доказывает наличие предмета, постройки, запаса или маршрута в партии.

## 1. Рамка решения

Проверялись три семейства: природный речной берег/берег крушения, рыболовное
рабочее место и старая сушильня как человеческое ремесленно-складское место.
Требовалась не энциклопедия, а достаточная основа для versioned profile rows:
применимые слои природы, функция места, функциональные категории, конечные
источники, несовместимости и сезонность.

Степени опоры:

- **direct** — источник прямо сообщает исторический, археологический или
  физический факт;
- **inferred** — ограниченное соединение прямых фактов, явно не выдаваемое за
  раскопанный конкретный объект;
- **analogical** — перенос общей/сравнительной формы с сохранённой границей;
- **editorial reconstruction** — правдоподобное заполнение ordinary-сцены,
  которое требует отдельного human approval и не создаёт authority;
- **open** — данных недостаточно; строка должна остаться блокирующей.

Текущее состояние уже блокирует все три семейства. Все выбранные
landscape/water/land-use/place rows имеют `draft`; fishing содержит семь
необязательных item alternatives и ни одного container rule; shed содержит
пятнадцать необязательных craft alternatives и один необязательный container
rule. Это зафиксировано в
`docs/plans/Novgorod1230_Procedural_Materialization_Data_Sufficiency.md:32-65`
и `data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json:18-182,654-707`.
Approval attestation разрешает только authoring audit, не import/activation, и
оставляет functional/storage/source gaps открытыми
(`data/world-catalogs/novgorod/procedural-scene-v2/approval-attestation.json:1-58`).

## 2. Проверенные источники и пределы

### 2.1. Историческая и археологическая основа

1. Е. А. Рыбина, «Промыслы в средневековом Новгороде (по археологическим
   материалам)», *Исторические исследования* 3 (2015), с. 219–235,
   [официальный HTML журнала исторического факультета МГУ](http://www.historystudies.msu.ru/ojs2/index.php/ISIS/article/view/48/131),
   раздел «Рыболовство», рис. 1–9.

   **Direct/high:** рыболовные принадлежности представлены в новгородских
   слоях разных периодов; на Троицком раскопе сетевой промысел представлен
   заметно шире индивидуальной ловли. Прямо названы сети и их фрагменты,
   приспособления для плетения, поплавки, каменные грузила, крючки и остроги;
   материалы — дерево/кора, камень и железо. Описано вытаскивание сетей на
   берег или в лодку. Упомянуты сушёная, малосольная и солёная рыба.

   **Предел:** это доказывает региональную совместимость промысла, снастей,
   материалов, береговой/лодочной работы и обработки рыбы. Не доказывает
   конкретный стан, маршрут, сарай, контейнер, текущий улов, количество или
   право доступа. Репозиторий уже нормализовал эти границы: прямые gear/material
   claims и inferred workspace/drying claims находятся в
   `data/world-catalogs/novgorod/world-knowledge/production-v1/historical-population.json:231-301,997-1029,1649-1928`;
   независимый review особо запрещает выводить exact shed или canonical route
   (`data/world-catalogs/novgorod/world-knowledge/research/verification-population-historical-context.md:20-40`).

2. B. A. Колчин, *Новгородские древности. Деревянные изделия* (1968),
   [электронная библиотека Института археологии РАН](https://archaeolog.ru/el-bib/el-cat/el-series/svod-arch/sai-e1-55_1968).

   **Direct/high для открытых категорий:** официальный каталог описывает
   новгородские деревянные орудия труда, детали механизмов и судов, мебель,
   утварь и посуду, способы изготовления и применения. Это подтверждает
   историческую допустимость категорий `tool`, `container`, `vessel` и
   деревянного рабочего материала.

   **Предел:** общий каталог не делает конкретный container обязательным для
   рыболовного стана или сушильни. Exact template/capacity/quantity остаются у
   V5 owner data; источник не даёт игровых масс, количеств или scene stock.

3. Б. А. Колчин в *Трудах Новгородской археологической экспедиции. Т. II*
   (МИА 65, 1959), [официальная карточка и издание ИА РАН](https://archaeolog.ru/el-bib/el-cat/el-series/mia/mia-65).

   **Direct/high:** стратифицированные новгородские железные инструменты дают
   основу для исторической допустимости craft-tool categories.

   **Предел:** наличие отдельного типа инструмента не делает его функционально
   обязательным в drying/storage place. Нельзя превращать весь craft profile в
   обязательный набор сушильни.

4. M. Hamilton-Dyer, M. Brisbane, M. Maltby, “Fish, feather, fur and forest:
   Exploitation of wild animals in medieval Novgorod and its territory”,
   *Quaternary International* 460 (2017), 97–107,
   [DOI](https://doi.org/10.1016/j.quaint.2016.04.024),
   [author/institutional copy](https://eprints.bournemouth.ac.uk/24537/).

   **Direct/high на региональном масштабе:** Новгород расположен на Волхове у
   Ильменя; окружающий ландшафт включает лес и сезонно затапливаемые луга;
   археологические выборки содержат значимый рыбный материал.

   **Предел:** broad regional setting не доказывает форму конкретного берега,
   растительную группу, доступный запас рыбы, крушение, нанос или обломок в
   текущей сцене. Для Lower-Dvina-like scene это только regional/analogical
   applicability, пока exact regional binding не утверждён.

5. UNESCO, [Historic Monuments of Novgorod and Surroundings](https://whc.unesco.org/en/list/604/),
   Outstanding Universal Value.

   **Direct/high:** водонасыщенный анаэробный городской cultural layer хорошо
   сохраняет органику.

   **Предел:** это городской археологический слой, не default-свойство обычного
   речного берега. Его нельзя использовать для обязательного «болота» или
   археологических находок в каждой shoreline scene.

6. M. N. Tikhomirov, *Древнерусские города*, изд. 2 (1956), с. 45–46,
   [электронный текст](http://rusarch.ru/tihomirov1.htm). Репозиторий независимо
   проверил reading Устава: новгородские `вымолы` трактуются как речные
   пристани, а от торговой площади к ним вели `мостовые`
   (`data/world-catalogs/novgorod/world-knowledge/verification/verification-river-landing.md:7-50`).

   **Direct для изложенного Тихомировым urban/documentary case; inferred/medium
   для c. 1230 regional category:** допустима категория river landing и связь
   landing–approach.

   **Предел:** источник не создаёт route для выбранной rural/Lower-Dvina scene,
   не определяет материал, состояние, ширину, проходность или право доступа.

7. M. Brisbane, N. Makarov, E. Nosov (eds.), *The Archaeology of Medieval
   Novgorod in Context* (2012),
   [academic publisher description](https://www.oxbowbooks.com/9781842172780/the-archaeology-of-medieval-novgorod-in-context/).

   **Direct для общего archaeological setting:** structural remains, properties,
   buildings, household production, workshops and specialised settlements are
   normal parts of medieval Novgorod archaeology.

   **Предел:** отдельный riverside drying shed XIII века этим не засвидетельствован.
   Его функция и форма остаются **editorial reconstruction**, не archaeological
   fact.

### 2.2. Общая физика/экология, уже одобренная в репозитории

- USGS support о riparian vegetation, floodwater energy и sediment deposition
  принят как universal qualitative premise, но прямо исключает вывод о
  стабильности, проходимости, глубине или материале конкретного берега
  (`data/world-catalogs/novgorod/world-knowledge/production-v1/final-nature-gap-closure-v1.json:7,19,37-38`).
- EUFORGEN/European Forest Institute support для *Salix alba* — direct/high
  species ecology, но не local presence
  (`data/world-catalogs/novgorod/world-knowledge/production-v1/environment-biology.json:7-15,44`).
- Эти universal rows разрешают свойства уже выбранного natural context. Они не
  заменяют region landscape/water/vegetation approval.

## 3. Семейство: речной берег / берег крушения

### 3.1. Что можно авторить

Предлагаемая запись — только conceptual fields/category refs:

| Field | Proposed authoring meaning | Basis / confidence |
|---|---|---|
| `family` | natural river-bank scene; wreck aspect requires separate authoritative wreck/source ref | shore direct; wreck editorial unless authored |
| `applicability` | authoritative flowing-water adjacency plus approved regional landscape binding | exact binding open |
| `required.surface` | bank substrate category selected by landscape owner; no assumed item/resource | universal physical support; exact local form open |
| `required.relief` | bank/terrace relief category from spatial owner | must come from exact spatial closure |
| `required.water` | flowing freshwater category from water owner | generic direct; exact row still draft |
| `required.environment` | season-derived wetness/flood/freeze-thaw/erosion state, only where Temporal/environment owners say so | direct/inferred qualitative |
| `required.vegetation` | riparian functional vegetation group, with no taxon unless a regional record supplies it | universal support; local presence open |
| `place_function` | natural shore; optional landing/water-access function only with exact route-nearby proof | landing category inferred/medium |
| `finite_source_basis` | wreck timber from a committed wreck entity; deposited debris/reeds/mud only from committed resource nodes | current scene evidence required |

Current seed’s nearest combination describes a low seasonal alluvial bank, a
small river and a landing, but all three are `draft`
(`infra/world-base/landscape_templates.seed.json:1220-1246`,
`infra/world-base/water_body_templates.seed.json:163-193`,
`infra/world-base/place_templates.seed.json:1220-1280`). The scientific basis
is sufficient to review a generic natural template; it is not sufficient to
promote the exact regional rows without region-binding review.

### 3.2. Несовместимости и сезонность

- `water nearby` не означает ford, ferry, bridge, safe footing или fish stock.
- A natural shore does not imply landing. Landing is a human place function.
- A wreck label does not create wreck debris. Every removable part needs a
  committed parent/source and a finite remainder.
- Willow/reed/driftwood are not required nouns. Taxon/material appears only
  through approved regional vegetation or a persisted source.
- Winter ice, spring flood, thawed mud and low-water exposure are state variants,
  not parallel baseline layers. Temporal/environment owners choose the current
  variant; no exact dates are authored here.

### 3.3. Open blocker: `route_nearby`

Landing seed requires a nearby route. V6 spatial nodes classify the selected
landing terrace and fishing approach as reviewed `route_site`
(`data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/datasets/spatial_v3_nodes.json:5,8`),
but current v6 datasets contain no exact compatible route-template relation.
Tikhomirov’s urban market approaches cannot fill that missing exact relation.

**Verdict:** historical plausibility is supported; route proof remains open.
Human authoring must bind the selected scene to an existing approved water/path/
road route owner record, or must choose a place function that does not claim a
landing. A class label alone is not sufficient proof.

## 4. Семейство: рыболовное рабочее место

### 4.1. Place function and natural layers

Rybina directly supports Novgorod fishing, net work, shore/boat handling and
the material categories of gear. A particular camp/workspace is an
**inferred/medium** ordinary reconstruction; repository claim
`population-fishing-workspace` preserves exactly this limit
(`data/world-catalogs/novgorod/world-knowledge/production-v1/historical-population.json:1850-1888`).

Conceptual profile:

| Field | Proposed authoring meaning | Basis / confidence |
|---|---|---|
| `family` | active inland fishing worksite; dormant/off-season state is a separate state variant | inferred/medium |
| `required.natural_layers` | surface, relief, water, environment and vegetation inherited from the approved shore context | exact rows open |
| `required.work_zone` | accessible shore/boat handling zone | direct process; exact placement code-owned |
| `required.place_function` | preparation/use/maintenance of fishing gear and processing of catch | inferred/medium |
| `required.tool_group` | at least one usable primary fishing-gear category, selected from approved owner templates | direct category; exact member authoring-reviewed |
| `required.storage` | one real storage function for gear/material; container only if exact owner mapping requires it | general storage inferred |
| `required.work_material` | one finite gear component/repair stock or actual catch-processing batch, with source ref | materials direct; scene stock editorial |
| `container_group` | conditional until a source-reviewed fishing-specific content/compatibility mapping exists | open |
| `npc_basis` | fisher role may be compatible; presence/schedule remains NPC/Temporal-owned | direct occupation context, not mandatory person |

The existing fishing land-use row already states water adjacency, fishing
season factors and “no guaranteed catch”, but remains `draft`
(`infra/world-base/land_use_templates.seed.json:1220-1264`). The current place
row also requires both water and route and remains `draft`
(`infra/world-base/place_templates.seed.json:999-1078`).

### 4.2. Functional categories

**Tool — authoring gap can be closed at category-group level.** Seven V5
fishing alternatives are individually optional; setting all seven required
would overfit the archaeological list. The minimal authoring delta is one
required functional group such as `primary_capture_gear`, with exact candidate
refs limited to the already approved V5 fishing templates. Existing template
quantity/inventory mechanics remain authoritative; do not replace them with
historical guesses. See
`data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json:173-240`
and `data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_profile_entries.json:233-288`.

**Work material — broad category can be closed, exact stock cannot.** Rybina
directly supplies wood/bark, stone, iron and cord/net component relations. A
versioned mapping may therefore require a finite `gear_component_or_repair_stock`
category for an active worksite. Actual item/resource refs and remaining amount
must come from owner data. If an approved V5 item template already carries a
quantity profile, reuse that profile (for example the existing fishing-template
quantity rows in
`data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_template_quantity_profiles.json:451-534`);
do not author a new number from source prose.

**Storage/container — still open.** General Novgorod vessels and household
storage are historically compatible, but repository review labels their
composition inferred and rejects a generic source/access/container policy as
historical fact
(`data/world-catalogs/novgorod/world-knowledge/production-v1/historical-population.json:1930-2008`;
`data/world-catalogs/novgorod/world-knowledge/research/verification-population-historical-context.md:38-40`).
Fishing has zero container rules. No checked source makes a basket, tub, cask,
box or other specific form universally required at a fishing station.

To close this blocker, human authoring must approve one exact functional
mapping with:

- content category and fail-closed compatibility;
- causal purpose (`catch`, `gear components` or another reviewed purpose);
- required/optional status;
- reference to existing approved container capacity/inventory mechanics;
- no source-derived quantity, capacity or weight unless that owner record
  already owns it.

### 4.3. Finite sources and seasonality

- Gear and repair components are finite item/resource instances.
- Catch is not materialized from the land-use label. It requires the fishing/
  fauna/process owner and a committed result.
- River water may be treated by existing policy as ambient at world scale;
  every extracted portion becomes finite. This report does not set that policy.
- Spawning, ice, flood and fish-run conditions in the draft land-use row are
  qualitative applicability dimensions, not exact calendars or guaranteed
  availability. Temporal/environment state can switch an active-capture scene
  to maintenance/storage activity without rematerializing a new place.

### 4.4. Open blocker: route

The selected v6 parent is a reviewed `route_site`, but no exact compatible
route record is linked in the examined v6 dataset. Shore/boat work in Rybina
supports an access mode, not canonical topology. **Route-nearby remains open**
until the route owner supplies an exact relation.

## 5. Семейство: старая сушильня / ремесленно-складское место

### 5.1. Current pairing must be rejected

The current overlay combines `dry meadow` with `forest work camp`
(`data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json:654-696`).
This is internally incompatible:

- dry meadow is open, non-forest land
  (`infra/world-base/landscape_templates.seed.json:639-665`);
- forest work camp requires land use and lists only forest/woodland landscapes,
  not dry meadow
  (`infra/world-base/place_templates.seed.json:872-946`);
- v6 scene parent is a reviewed `resource_site`, while G6 includes an open
  approach and an enclosed interior, not proof of a forest camp
  (`data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/datasets/spatial_v3_nodes.json:10-15`;
  `data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/datasets/spatial_v3_g6_template_slots.json:41-42`).

Changing status from `draft` to `approved` would not repair this semantic
mismatch.

### 5.2. Defensible conceptual record

| Field | Proposed authoring meaning | Basis / confidence |
|---|---|---|
| `family` | ordinary enclosed/roofed drying-and-storage workspace with open approach | structural setting direct; exact shed editorial |
| `place_function` | drying/storage of already-established fish, netting or other approved work material | process compatibility inferred/medium |
| `landscape_binding` | inherit exact approved scene landscape; do not force meadow or forest camp | owner-required |
| `required.storage` | storage surface/fixture/function; exact container only through approved mapping | inferred/medium |
| `required.work_material` | finite batch only in active-use state | source and amount code-owned |
| `required.tool_group` | process-specific handling/drying means, not generic carpenter/smith inventory | exact mapping open |
| `container_group` | conditional/source-reviewed; not implied by the word “shed” | open |
| `activity_state` | active drying, maintenance/storage, dormant/old | editorial state split, Temporal-owned transition |
| `heat_mode` | none/air-drying unless a separate authored heated process owns fire/fuel | source boundary |

Rybina supports dried fish and fishing/drying workspace only as historical
compatibility. Independent review states that no excavated c. 1230 riverside
shed is proved, and that fuel is not required for every drying process
(`data/world-catalogs/novgorod/world-knowledge/research/verification-population-historical-context.md:27-29,40`).
Therefore the separate old shed, its plan, age, fittings, heat source and
contents are **editorial reconstruction**, requiring explicit approval.

### 5.3. Tool, storage, material and container disposition

- All 15 craft entries are optional; their profile is a broad urban craft-work
  context, not a drying-shed functional set
  (`data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json:698-722,1566-1600`).
- The one craft container rule is an optional needle-case rule, not general
  shed storage
  (`data/knowledge-source/imports/item-container-120-v5/candidate/tables/g4_container_materialization_rules.json:3-29`).
- Requiring one arbitrary axe, adze, file, tongs or needle would be a false
  closure. Either author a process-specific handling/drying category from
  approved owner templates, or remove `tool` from the required layers of the
  dormant storage variant.
- `work_material` is required only for an active process variant. An old empty
  shed may remain a valid place with optional persisted remnants; “old” does
  not create scraps, fish, netting or fuel.
- A storage function does not itself create a container. If a container is a
  hard acceptance requirement, its exact functional mapping remains a human
  authoring task.

## 6. Gap disposition

| Audit blocker | Evidence-backed disposition |
|---|---|
| All selected landscape/water/land-use/place rows are draft | Generic facts and conceptual envelopes are supported; exact regional status promotion remains open and requires owner review/import proof. |
| Wreck shore `route_nearby` proof missing | Open. `route_site` class and urban historical analogy are insufficient; attach exact approved route relation or remove landing function. |
| Fishing station `route_nearby` proof missing | Open. Shore/boat work supports access semantics, not canonical topology. |
| `dry meadow` + `forest work camp` | Close by rejecting the pairing and authoring a drying/storage place family over the exact scene landscape. Exact replacement row still needs approval. |
| Seven fishing V5 entries all optional | Closeable: require one functional fishing-tool group, not every named alternative; reuse approved V5 mechanics. |
| Fishing container-rule count is zero | Open: sources support vessels generally, not an exact required fishing container/content mapping. |
| Fishing `work_material` missing | Broad category closeable from direct gear-material evidence; exact resource/item source and quantity remain open. |
| Fifteen craft V5 entries all optional | Not closeable by flipping a generic tool required. Specialize active drying/handling categories or drop tool requirement for dormant variant. |
| Shed tool/material mapping absent | Open until process-specific functional mapping and active/dormant state are authored. |
| Exact quantities, weights, capacity, replenishment | Not supplied by historical sources. Reuse V5 quantity/inventory/container mechanics or keep gap open. |
| Runtime import/activation | Outside this research; still forbidden by current attestation. |

## 7. Human approval checklist

- [ ] Exact regional landscape, water, land-use and place rows reviewed; no
  `draft`/unknown row enters compiled profile.
- [ ] River-bank natural layers come from landscape/water/environment owners;
  archaeological cultural-layer evidence is not used as a generic bank default.
- [ ] Any landing/fishing-place `route_nearby` requirement points to an exact
  approved compatible route relation.
- [ ] Fishing tool requirement is one reviewed functional group; the seven V5
  examples remain alternatives, not a closed vocabulary.
- [ ] Fishing storage/container mapping names purpose and content compatibility;
  no generic vessel is made mandatory from broad historical compatibility.
- [ ] Every `work_material` has a committed finite source or process result;
  land-use/place labels do not mint stock.
- [ ] Wreck material has a parent wreck/source ref and one shared remainder
  across positions/synonyms.
- [ ] Shed uses a drying/storage place function, not forest-work-camp semantics,
  unless an independently approved forest land-use/landscape binding exists.
- [ ] Active drying, maintenance/storage and dormant-old states are distinct;
  required tool/material/NPC layers match the chosen state.
- [ ] Air drying does not imply hearth, fuel, smoke or chimney; heated variants
  require their own authored process and finite fuel.
- [ ] Historical `direct`, `inferred`, `analogical` and `editorial` labels are
  persisted with confidence and limits.
- [ ] Exact mass/count/capacity comes only from approved item/container quantity
  and inventory profiles; no number is copied from narrative source prose.
- [ ] Approval remains authoring-only until disposable-DB import/readback and
  separate activation authorization are completed.

## 8. Research verdict

Evidence is sufficient to author the **shape** of all three families without a
noun whitelist:

- river shore: natural layers and conditional hazards;
- fishing worksite: fishing function, one required gear group and a finite
  material basis;
- drying/storage place: a bounded ordinary reconstruction with active/dormant
  variants.

Evidence is **not** sufficient to approve the current exact owner rows, infer
routes, require a specific fishing container, populate exact stocks, or call a
specific XIII-century Novgorod riverside drying shed archaeologically attested.
Those gaps must remain typed blockers until human authoring supplies the exact
owner mappings and approval.
