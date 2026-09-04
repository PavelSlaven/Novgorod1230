# Practices readiness audit — compiled 442

## Scope and method

Read-only completeness audit of `production-v1/runtime-bundle.json`, active
`world_knowledge_platform_implementation_contract.md`, `@rus/world-knowledge`
module contract, and the declared cells in `archive-v1/coverage-matrix.json`.
This is not source verification.  The stated TRC-05, CPP-03, AFP-10 and SDP-04
records are treated as independently approved inputs.

`@rus/world-knowledge` exact-focus checks at year 1230 / `region_novgorod_land`
returned supported slices for the 442 additions: flax/hemp cultivation,
tree-bort honey/wax, handmade local-clay/temper vessels, and stone-filled
log cribs. They prove those premises are available; they do not turn a
bounded premise into whole-family coverage. Production path remains planner →
hybrid retrieval → semantic reasoning, rather than raw lexical wording.

Scene stock, access, a currently present NPC role, or an action outcome are
not counted as missing historical premises: their owners remain runtime world
state and domain mechanics.

## Findings

| Cell | Verdict | Production-shaped unseen request | Available factual basis | Concrete historical gap |
|---|---|---|---|---|
| `wk:env:crops` | PARTIAL | «Когда и как убрать и сохранить урожай льна/пеньки?» | `claim:agriculture-fauna-flax-hemp-cultivation`, hemp stem/fibre/tow, rye/barley, orchard and tillage/scythe context | dated local harvest and post-harvest storage/handling premise. Cultivation compatibility and fibre processing are now present; field, yield and season remain state/mechanics. |
| `wk:env:shrubs-grasses` | PARTIAL | «Срежу прибрежный камыш и свяжу им кровлю/циновку.» | woodland-meadow landscape; bilberry and gathered-plant qualified contexts | reed/grass occurrence and a dated local gathering/use relation; existing berry evidence cannot supply it. |
| `wk:env:animals` | PARTIAL | «Как обычно кормят и содержат скот зимой?» | cattle/pig/sheep-goat/horse, wild-mammal use; `claim:agriculture-fauna-hunting-economic-context` and ash hunting bow | historical husbandry/care or fodder-cycle premise. Hunting economic context and bow now cover bounded hunt context; animal health, herd and outcome remain state. |
| `wk:env:birds-fish-insects` | COVERED_WITH_LIMITS | «Есть ли практический местный контекст для рыбы, птиц и насекомых?» | fishing/net context, bird taxa and wildfowl season, pollination; `claim:agriculture-fauna-rural-tree-borts`, borts-honey/wax and climbing hooks | None at declared factual-family level. Borts close practical insects as rural tree practice, not a household hive; pest severity, current swarm/catch and species remain state/assessment. |
| `wk:material:clay-ceramic` | PARTIAL | «Слеплю и обожгу обычный горшок.» | clay response, ceramic vessel/tar pot, `claim:pottery-handmade-local-clay`, `claim:pottery-handmade-temper`, construction pottery products | dated ordinary firing/workflow premise. Local-clay choice and temper compatibility now exist; no particular deposit, workshop or vessel outcome follows. |
| `wk:material:stone-soil` | PARTIAL | «Возьму песок/грунт для хозяйственной работы.» | stone weight; `claim:construction-rjaz-stone-fill`, quarry procurement and specialist masonry/plinth facts | ordinary soil/sand material-use relation. Specialist stone construction is not a household soil/sand envelope; exact source/access/stock remain state. |
| `wk:process:subsistence` | PARTIAL | «Содержу скот и ставлю ловушки, чтобы прокормиться.» | agriculture, fishing/net, `claim:agriculture-fauna-hunting-economic-context`, ash hunting bow, tree-bort outputs | husbandry/fodder-cycle and trapping-process premises. Do not repeat hunting as gap: bounded hunting context is now present. |
| `wk:social:exchange` | PARTIAL | «Совершу обычную сделку с мерой товара на рынке.» | debt/loan/guarantor/grivna, procurement, hired work; `claim:social-daily-economic-activities`, `claim:social-daily-fur-sale-accounting`, honey/wax commodity context | contemporaneous measure/ordinary market-exchange practice beyond one fur-sale lot and accounting. Price, rate, stock, title and completed transaction remain state, not missing facts. |
| `wk:npc:occupations` | PARTIAL | «Попрошу перевозчика, священника или стражника о работе.» | fishing, carpenter, smith, boat/storage, hired work; `claim:social-daily-economic-activities` and agriculture/hunting/bort contexts | historical transport, religious, military/authority and temporary/service role-to-practice context. Facts never assign a current NPC role. |

## Verdict

`wk:env:birds-fish-insects` is `COVERED_WITH_LIMITS`: fish, birds and a
bounded practical insect practice each have a factual premise. The remaining
eight cells stay `PARTIAL` for the exact residual premises above. This is a
coverage finding only; it does not block open-world semantic handling of
requests absent from the pack, and it does not prescribe recipe or occupation
whitelists.
