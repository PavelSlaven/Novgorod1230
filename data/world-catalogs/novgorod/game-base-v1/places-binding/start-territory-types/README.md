# Стартовая территория: land-use и place types — кандидатный пакет

**Статус:** `candidate`, не approval, не import/activation и не runtime readback. Утверждает Opus/data owner.
**Scope:** 32 G4 и 195 canonical G5 низовьев Северной Двины (Вихтуй/Заостровье).

## Состав

- `matrix.csv` — 70 типов из закреплённого regional PF inventory: 31 land-use + 39 place; причинная оценка, региональный selector status, PF links, точные G4/G5 candidate refs или gap, manifestation и источники.
- `candidates.csv` — 38 типов с условной/правдоподобной причинной применимостью. G4/G5 IDs машинно выделены в отдельных столбцах. Все refs — кандидаты; `scope_evidence_class=context_only_no_type_or_pf_binding` означает только географический контекст, без PF/type binding. `candidate_compatibility_exceptions` хранит только адресные пары узел/измерение с причиной и source refs.
- `typed-gaps.csv` — оставшиеся 32: 25 «нет точного основания» и 7 «не применим по имеющимся данным», каждый с причиной и условием закрытия; ни одна строка не означает `false`.
- `selector-reconciliation.csv` — предложение по четырём LU, отсутствующим в selector и не указанным как explicit exclusions. Это рекомендация для ревьюера, не изменение regional-environment.
- `validate.mjs` — read-only deterministic validator; автоматический тест — `../../scripts/start-territory-types.test.mjs`.

## Деноминаторы и статус

70 = каталог типов, закреплённый в `places-binding/inputs/m2c-nature-coverage-entries.json` (31 LU/39 place). 38/32 — разбиение этого пакета по предварительной причинной применимости, а не региональное одобрение. Текущий selector региональной кандидатуры содержит 24 LU/37 place. Пять из разницы 7+2 явно записаны как `explicit_exclusions` (`lu_open_field_strip_cultivation`, `lu_fishpond_aquaculture`, `lu_watermill_water_management`, `pt_watermill_site`, `pt_shipyard_boatyard`); остальные четыре LU перечислены в `selector-reconciliation.csv` как невыбранные, но не explicit exclusion. Selector не менялся; песок остаётся gap без предложения о promotion.

Старый региональный PF manifest хранит тип→PF соответствие, но candidate PF overlap не доказывает точное присутствие типа на узле. В текущих Spatial v3 node bindings нет прямых `land_use_template_id`/`place_template_id`; используются существующие node facets/PF. `presence_rules` остаются `scope_kind=place_family`; пакет не добавляет presence rules, людей, предметы, права, доступ, сезонность или topology. За сезонностью, запасом/ресурсом и работой стоит обращаться к отдельным источникам и владельцам.

Совместимость проверяется по непустым `compatible_landscape_template_ids` и `compatible_water_body_template_ids`; G5 при пустом значении берёт значение родителя G4. Каждое несовпадение требует точного исключения с причиной и разрешимыми ссылками. Исключение остаётся кандидатной редакционной оценкой и не меняет template vocabulary или active Spatial binding.

## Четыре невыбранных LU: рекомендация

Четыре типа остаются невыбранными в selector до решения owner: красильные/лекарственные посадки, торф, песок, каменоломня. Песок остаётся typed gap; selector promotion не предлагается. Закрытие — local evidence о ручном сборе/use. Для каменоломни исключение не рекомендуется без положительного геологического источника. Это предложения, не изменение regional-environment.

## Открытые вопросы владельцу

- **Shipyard:** подтверждать ли дальнейшую смену selector exclusion, если появится источник о постройке судов? Сейчас `pt_shipyard_boatyard` остаётся gap: вытаскивание лодок и обслуживание малых судов (zaostrovye_landing_boat_drawing) не равны верфи.
- **Ручной сбор песка:** оставить selector без promotion до локального источника? Текущий пакет фиксирует gap и не рекомендует promotion.
- **Сад и бортничество:** достаточно ли сохранять editorial неопределённость как «нет точного основания», или заказать локальное WK-исследование по Двине? «Не применим» не утверждается.
- **Каменоломня:** заказывать ли позднее локальный геологический источник? Сейчас gap без явного исключения и без геологического задания.

## Источники и неопределённость после REVIEW-start-types-6

- `book:755331 §725`: «Гончарные глины, пригодные для изготовления посуды, имеются в Восточной Европе повсеместно». Общая пригодность глины не локализует конкретную выработку.
- `book:622242 §1354` упоминает яблоки в древнерусских источниках; `book:622242 §1500–1501` описывает бортничество в древнерусской деревне. Эти свидетельства не доказывают сад или бортничество в низовьях Двины.
- Сад и бортничество имеют статус «нет точного основания»: климат ~64,5° с.ш. и северная граница ареала пчелы — editorial premises, локального источника и доказательства физической невозможности нет; закрытие — местный источник по Двине. Для торфа не используется неподтверждённый порог «с XVIII века»: кандидатный слой сам по себе не доказывает добычу топлива, а точного совместимого торфяного ландшафта на старте не выявлено.
- Кандидат болотной руды означает только экологически правдоподобную среду, не наличие руды, выработки или плавильни. Каменоломня остаётся gap; без источника о коренной геологии явное исключение не предлагается.
- Брод опирается на существующий `tributary_mouth_crossing`; сезонные варианты не гарантируют глубину и проходимость. Строка `pt_shipyard_boatyard` сохраняет gap и конфликт `zaostrovye_landing_boat_drawing` с активным региональным exclusion для решения owner.

## Проверки и дальнейшая спецификация

Запуск: `node data/world-catalogs/novgorod/game-base-v1/places-binding/start-territory-types/validate.mjs`. Валидатор сверяет каждую file:line-ссылку, G4/G5 уровень refs, PF IDs, template inventory и совместимость G4/G5 landscape/water с template allowlists; повторяемость причин проверяет эвристикой `reason-dupes` (порог 20%).
`npm run test:game-base` автоматически подхватывает `game-base-v1/scripts/*.test.mjs`, включая тест пакета.

Будущая matrix acceptance после data approval должна связать pinned regional selector → approved exact node/facet/PF → существующий reader/presence и проверять gaps/negative cases. Отдельная замена `tools/spatial-v3/report-m2c-nature-coverage.py` должна считать exact approved applicability, а legacy template-ref coverage показывать отдельной метрикой. Код runtime reader, DDL и новый presence owner этим пакетом не предлагаются.
