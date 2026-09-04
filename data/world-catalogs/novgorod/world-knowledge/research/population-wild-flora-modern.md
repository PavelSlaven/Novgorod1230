# Дикорастущая флора: современные premises для Новгородской области

**Статус:** research only; не production и не self-approval. Этот пакет
закрывает современные экологические и safety prerequisites для
`wk:env:wild-flora`. Он **не** переносит современный Валдай в 1230 год:
исторический мост остаётся только у уже одобренных троицких
археоботанических claims.

## Уже покрыто — не дублируется

`environment-ecology.json` уже связывает средневековые остатки Троицкого
раскопа с местным источником, лиственным лесом (лещина, земляника, малина,
яблоко, дикий хмель) и верещатниками на полянах (черника). Это не доказывает
современную видовую инвентаризацию, а современные страницы ниже не доказывают
присутствие, съедобность, запас или право сбора в исторической сцене.

## Полностью прочитанные современные первичные источники

1. ФГБУ [Национальный парк «Валдайский», «Природа»](https://www.valdaypark.ru/nature),
   полный публичный HTML. Страница описывает современный парк в Новгородской
   области: еловые, сосновые и берёзовые леса, северные дубравы с лещиной,
   верховые болота и суходольные луга.
2. ФГБУ [Национальный парк «Валдайский», «Растительный мир»](https://www.valdaypark.ru/flora),
   полный публичный HTML. В разделах «Растительный мир» и «Грибы» приведены
   современная структура лесных/болотных сообществ, роль грибов, а также
   прямое предупреждение, что отличить съедобный шляпочный гриб от ядовитого
   по внешнему виду непросто.
3. И. Г. Хмельщикова, старший научный сотрудник Валдайского парка,
   [«Растительность верховых болот»](https://www.valdaypark.ru/tpost/d0je9zrn21-rastitelnost-verhovih-bolot),
   30 May 2023, полный публичный HTML. Страница называет клюкву, голубику и
   морошку среди ягодных кустарничков верхового болота, описывает сфагновую
   подушку, сезонное цветение и уязвимость болотной растительности.
4. И. Г. Хмельщикова, [«Похожие ягоды. Надо разобраться»](https://www.valdaypark.ru/tpost/cz3zea5421-pohozhie-yagodi-nado-razobratsya),
   1 June 2024, полный публичный HTML. Страница прямо сравнивает совместно
   растущие толокнянку и бруснику, их различимые признаки и пределы
   безопасного употребления.

## Атомарные factual candidates

| ID | Relation (RU / EN) | Source anchor / directness | Applicability, limits, gameplay use |
|---|---|---|---|
| WFM-01 | **Современная Валдайская флора → включает местообитания → хвойных и смешанных лесов, верховых болот и суходольных лугов. / Modern Valdai flora → includes habitats of → coniferous/mixed forests, raised bogs, and dry meadows.** | S1, «Флора»; S2, opening community classification. Direct/high contemporary regional ecology. | Modern Valdai/Novgorod-Oblast context only; not a 1230 map, local patch, plant, route, access or stock. Supports choosing habitat-specific candidates only after scene location is known. |
| WFM-02 | **В описанном современном Валдайском верховом болоте → среди кустарничков названы → клюква, голубика и морошка. / The described modern Valdai raised bog → names among its dwarf shrubs → cranberry, blueberry, and cloudberry.** | S3, opening two paragraphs and listed plants. Direct/high contemporary Valdai observation. | `Голубика` here is **blueberry**, not bilberry. This is neither universal bog ecology nor historical presence; it gives no ripeness, reachability, ownership, harvest or stock. |
| WFM-03 | **В описании современного верхового болота → пушица цветёт весной при неполном сходе снега, а кустарнички — позднее. / In the modern raised-bog description → cottongrass flowers in spring while snow remains, and dwarf shrubs flower afterwards.** | S3, paragraph beginning «Весной, когда еще не весь снег сошел…». Direct/high for described modern bog plants. | No fixed calendar date, fruiting date, yield or historical schedule follows. It must not be rewritten as flowering only *after* snowmelt. |
| WFM-04 | **Болотная растительность → при повреждении → может долго восстанавливаться. / Bog vegetation → when damaged → can take a long time to recover.** | S3, warning: «Болотная растительность легко травмируется и долго восстанавливается». Direct/high contemporary management observation. | Qualitative condition only: no damage amount, recovery duration, current bog or legal restriction follows. Supports consequences of a committed disturbance, not free resource depletion. |
| WFM-05 | **Шляпочный гриб → нельзя надёжно признать съедобным → только по общем внешнем сходстве. / A cap mushroom → cannot be reliably treated as edible → from general visual resemblance alone.** | S2, «Шляпочные съедобные и ядовитые грибы»: edible and poisonous caps occur; distinguishing them by appearance is difficult; consume only specimens one is sure of. Direct/high safety premise. | Does not identify any mushroom, poison, symptom, dose, preparation, or edible specimen. In a game, unresolved identification must remain a knowledge/data gap rather than become food. |
| WFM-06 | **У большинства грибов → питание обеспечивается → сетью гиф, проходящей через субстрат и поглощающей питательные вещества. / Most fungi → obtain nutrients through → a hyphal network penetrating the substrate and absorbing nutrients.** | S2, «Грибы», first two paragraphs. Direct/high general biology. | The source says **most**, not all fungi. No scene fungus, substrate safety, fruiting body, amount or collection outcome follows. |
| WFM-07 | **Грибы-разлагатели → расщепляют органическое вещество → возвращая минеральные вещества в почву. / Decomposer fungi → break down organic matter → returning mineral substances to soil.** | S2, «Почвенные грибы», first paragraph. Direct/high general ecology. | No claim about a particular decay state, soil fertility, species, rate, usable compost, or current mushroom. This is environmental process, not a food source. |
| WFM-08 | **Листья и ягоды толокнянки → сходны с → листьями и ягодами брусники; одного сходства недостаточно для определения. / Bearberry leaves and berries → resemble → lingonberry leaves and berries; resemblance alone does not identify the plant.** | S4, paragraphs 1–3. Direct/high morphological comparison. | Do not convert source’s local «часто растут вместе» observation into universal co-occurrence. No 1230 presence, recognition skill or edibility follows. |
| WFM-09 | **Толокнянка → при употреблении в большом количестве → может быть опасна. / Bearberry → when consumed in large quantities → can be dangerous.** | S4, paragraph beginning «Ягоды толокнянки…». Direct/high source warning. | Species-specific modern warning; no dosage, treatment, symptom, poisoning check or historical medicinal use. Do not generalize to all berries. |
| WFM-10 | **Волчеягодник обыкновенный → содержит ядовитый сок → во всех частях растения. / Mezereon → contains poisonous sap → in all parts of the plant.** | S2, «Волчеягодник обыкновенный». Direct/high contemporary Valdai observation. | Species-specific hazard only. No current shrub, identification, dose, remedy or general rule that red berries are poisonous. It is a reason not to infer edibility from appearance. |

## Composition boundary

- Historical plant remains may establish a qualified medieval regional source
  context; the modern habitat and safety relations above can then constrain
  observation, gathering and consumption semantics.
- Neither layer establishes an exact scene plant, fruiting state, mushroom,
  ownership, permission, collection tool, amount, edible result or actor
  identification competence.
- `WFM-01`–`WFM-04` are modern regional ecology, not
  `historically_attested`; `WFM-05`–`WFM-07` are general biology/safety;
  `WFM-08`–`WFM-10` are modern species-specific warnings. Any future authoring
  must preserve those separate applicability and knowledge-access boundaries.

## Post-verification disposition

**Promoted only:** WFM-05, WFM-06, WFM-08 and WFM-10. Their exact narrowed
wording is normalized in `production-v1/wild-flora.json` as universal,
`domain_internal_only` safety/biology premises. They remain limits on inference,
not a flora atlas or a permission to materialize/consume anything.

**Research-only modern observations:** WFM-01–04 and WFM-09. They are useful
for a future location-qualified modern ecology pass, but are not production
facts in this PR and do not become medieval availability.

**Duplicate, not promoted:** WFM-07; existing
`claim:fungal-decomposition-affects-nutrient-recycling` already owns the
decomposition/recycling relation.

## Independent verification focus

Check each source page directly and confirm that authoring never upgrades a
modern Valdai observation to medieval presence or uses a safety premise to
invent diagnosis, dosing or treatment. Candidate count: **10**; promoted
universal limits: **4**; modern observations retained research-only: **5**;
duplicate: **1**; historical claims added: **0**.
