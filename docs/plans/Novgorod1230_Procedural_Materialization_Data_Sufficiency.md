# M2c / M3 procedural materialization data sufficiency

## M2c nature/material completeness benchmark (2026-09-24)

Reproduce with `python tools/spatial-v3/report-m2c-nature-coverage.py --output data/world-catalogs/novgorod/m2c-nature-coverage.json`. The generated [coverage report](../../data/world-catalogs/novgorod/m2c-nature-coverage.json) records every one of the 128 archived regional template links, its exact seed-template source fields (normalized with Unicode NFKC, case folding and whitespace folding), regional source refs and status, exact G4 profile refs where present, and a side-by-side reference/current-layer comparison for each of the 32 G4 profiles. It also records distinct World Knowledge fauna claims and three bounded Troitsky flora context claims. It is a benchmark, not an approved authoring bundle or runtime binding.

| Regional type | Archive links | Exact M2c G4 template bindings | No exact M2c binding |
|---|---:|---:|---:|
| Landscape | 34 | 7 | 27 |
| Water body | 24 | 4 | 20 |
| Land use | 31 | 0 | 31 |
| Place | 39 | 0 | 39 |

The 7 bound landscapes cover all 32 exact G4 profiles; the 4 bound water types cover 28 profiles. Of the other 4 G4, 2 reference water types outside these Novgorod regional links (`wb_estuary`, `wb_nearshore_sea`) and 2 have no water-template ref. All archived regional links remain `draft` and permit G1–G3 scales only. Absence of an exact M2c binding for a regional type therefore is not evidence that an existing G4 is missing a layer. Land-use and place types have no exact key in the current natural profile; joining them by similar labels would invent applicability.

The current 32 M2c natural profiles have 13 broad layers and no fauna layer. They carry zero taxon claims, including for trees. World Knowledge contains 42 explicitly named fauna concepts, **136 distinct claims** and 44 distinct cited source refs in this source map. The earlier count of 272 double-counted source fragments and their copies in `runtime-bundle.json`; the report now deduplicates by `claim_ref`. All 136 claims have universal context scope; none is an exact regional template/G4 presence assertion. The benchmark therefore does not promote those facts into local species, animal sightings, sounds, traces or finite stocks.

For flora, `environment-ecology.json` records three bounded claims from Monk and Johnston's medieval Troitsky assemblage: probable local origin of sampled non-wood plants, probable southern deciduous source of several gathered plants, and inferred use of northern heath clearings from bilberry remains. Their applicability is 1000–1400 and Novgorod-land archaeological context, not any exact G4, season, living plant, or stock. Modern Valdai flora and modern fauna biology remain unsuitable as a historical presence bridge. The archived landscape fields supply broad vegetation and substrate descriptions but no complete per-type 1230 taxa/material incidence reference. The side-by-side comparison exposes what is already authored without treating seed vocabulary as species evidence.

The report separately indexes flora/fungi, soil/geology/material and medieval regional context shards by concept, claim scope and source. It marks species materialization as a typed gap on each of the 32 exact G4 rows. The 31 land-use and 39 place links have no exact G4 selector in the natural baseline and remain `unresolved_for_m2c_g4`; similarity of type names is insufficient. Closure requires (1) period-screened, geographically bounded primary or archaeological evidence for taxa/material associations and seasonal ecology; (2) editorial provenance explaining each inferred or analogical G4/type transfer, including exclusions; (3) bounded selection weights approved as game design rather than misreported source frequencies; (4) separately reviewed natural baseline/presentation/acoustic candidate and deterministic import/readback. Until then, current broad categories are the code-only baseline and each taxon/animal decision stays a typed data gap.

**Remaining typed gaps:** `m2c_nature_type_reference_required` (historically checked, geographically bounded flora, fauna and material incidence with season and source anchors for each applicable G4 type); `m2c_nature_fauna_layer_authoring_required` (separately approved fauna presence/trace/acoustic descriptors through the existing natural baseline and presentation owners); `m2c_nature_exact_applicability_required` (source-backed land-use/place applicability to G4/G5). No production import or database write occurred in this benchmark.

### Nature-richness authoring candidate

`m2c-natural/nature-richness-candidate-v1.json` records conditional flora, fauna, decomposer-fungal, substrate and ordinary-material alternatives for all 32 exact G4 profiles across seven landscape types. Run `node scripts/generate-m2c-nature-richness-coverage.mjs` to regenerate the exact-G4 [comparison](../../data/world-catalogs/novgorod/m2c-natural/nature-richness-coverage-report-v1.json), or pass `--check` to verify it. The report places each alternative beside its current broad natural layer. It records 34 layer gaps: fauna is absent at every G4, and willow is inapplicable at two bare riverbank G4. Fungal rows describe decomposer substrate processes only; there is no named fungus, fruiting body or edible mushroom.

The candidate separates early-thirteenth-century Ryurik Gorodishche wet-ground pollen and regional archaeological wood/fauna context from contemporary Valdai habitat analogies and exact spatial templates. The pollen does not attest *Phragmites*, and none of these sources establishes a living taxon at an exact G4. Every transferred taxon is low-confidence `inferred` or `analogical`, with season and source limits. The shared version-1 category mapping (dominant/common/occasional/rare = 8/4/2/1) is an editorial preference among later eligible alternatives, never a measured historical frequency, biological abundance or encounter chance. Independent historical and contract approval remains pending. Neither candidate nor report changes active baselines, adds fauna presence, creates stock or permits import.

Status: authoring/readiness input for PR #98. Source files, candidate bundles,
approved records and records activated under the exact runtime pin are distinct.
Only the last class is executable runtime data.

## M2c — step 1: Data Sufficiency Report

M2c authors the missing G4 expansion profiles and G5 generation templates,
limits, slots, slot templates, terminal policies and continuation-length rules
for the 32 approved G4 in the target catalog. Workflow step 6 and the owner's explicit task
authorization classify this as an expected authoring step, not a blocking
external data gap. Reusable profile families are selected from each G4's
landscape × land-use × function data. The exact authoring pin is
`novgorod_spatial_v3_target_contract_approval_001`: 32 G4 at version 1 with
86 approved directional exits. The separate Spatial-v3 production-v6 candidate
is a delta with different G4 versions and is supplementary source evidence,
not the expansion pin. Canonical G0–G4, routes and exits stay
fixed; generated G5 may attach only through existing directional exits.

| Requirement | Source/catalog | Reader/compiler | Materializer | Persisted state | Projector | Sufficiency |
|---|---|---|---|---|---|---|
| G4 membership, topology, routes and directional exits | Exact target catalog `novgorod_spatial_v3_target_contract_approval_001`; `spatial_v3_nodes.json`, `spatial_v3_g4_directional_exits.json`, `spatial_v3_g4_traversal_profiles.json` | Pinned Spatial-v3 reader plus exact G4→expansion-profile binding reader | Existing frontier resolver | Canonical `world_base` rows and party spatial tables | Existing spatial/perception readers | 32 G4@1 and 86 exits retained unchanged; exact active production readback pending |
| Select expansion family from G4 landscape × land-use × function | Approved M2c expansion bundle: 25 reusable families, 32 exact G4 bindings, 86 exit slots | Exact approved closure reader | Existing frontier resolver | Existing Spatial-v3 catalog and party G5 owners | Existing spatial/perception readers | Sol high independently approved exact authoring SHA; isolated PostgreSQL import/readback passed; production import pending |
| Generate G5 within limits and continue/terminate | Approved M2c G5 templates, limits, slots, terminal, continuation and successor rules | Exact closure and scene-rule readers | Generated first-entry composer and P16 atomic commit owner | Party G5, G6, position, frontier and capacity rows | Generated destination factual projection | First-entry and rollback/replay tests pass; public traversal, conditional availability and destination factual supplier remain incomplete |
| Natural layers, season, night, light and weather | Approved M2c natural baseline, presentation and placement; Temporal v4 | Exact natural/Temporal readers | Spatial scene materialization and environment owners | Scene baseline, natural and environment rows | Canonical initial P22 natural projection | Canonical start PostgreSQL acceptance passes. Landscape openness→stable-cover candidate is data-approved at exact SHA `5b2fc71f25042e64ea5de8b3256caa33f264baeac4712af49207982a7f1ae41b`, without current source presence or activation. Generated destination current P22 and entity visibility still need authoritative inputs. |
| Current visibility modifiers | No current `visibility_modifier` writer in P16 or another owner; no M2c effect policy | Current visibility reader | Existing visibility/perception owners | Verified current modifier set | Player-safe current projection | Verified empty active set means no modifiers; a nonempty set requires the typed `visibility_modifier_effect_policy_required` gap. M2c acceptance remains applicable to current scenes without modifiers. |
| Functional things and finite stocks | Approved M2c item/property authoring, finite capability scopes and finite-only ordinary base | Exact item/property readers and natural first-entry owner | Stage 16, ordinary first-entry and finite-resource transition owners | Items, containers and `party_resource_nodes` | Player-safe item/scene projection | Four finite source classes scoped to five G4; Sol high approved the finite-only base data separately. Isolated successor item-catalog activation/readback and first-entry/P16 PostgreSQL checks passed; live production import remains pending. No stock is invented for other G4. |
| NPC composition and equipment | Approved regional/canonical NPC composition, runtime profiles, appearance and applicable item/Temporal data | Exact NPC, actor and appearance readers | Actor materialization, Stage 16 and NPC runtime | Actor/body/item/activity/clock state | P12/P22 people projection | Canonical NPC materialization and real PostgreSQL start pass; source-specific visibility/recognition remains unresolved, so co-location alone cannot project a person |
| First-screen delivery | Committed spatial, natural, item and NPC refs | Current factual reader and visibility/knowledge owners | Opening Stage 22/23 and narration | Presentation delivery state | Player-visible opening | Direct official-root start/replay/ACK and isolated public HTTP+Chromium start/ACK/one free observation/replay/reload passed. Generated-G5 entry and rich current entity/exit visibility remain unaccepted. |

Current production visibility is partial. The generated-G5 adapter and saved-connection traversal are wired into v17 composition; ordinary UI, Contract Audit and final CI acceptance remain pending.

Regional template-link source inventory (members inside
`data/world-base-sources/rus13-base-v1.tar.gz`):

| Regional type | Exact archive member | Rows | Source status | G4 applicability |
|---|---|---:|---|---|
| Landscape | `nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_landscape_templates.tsv` | 34 | all `draft` | none; allowed scales are G1–G3 |
| Water body | `nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_water_body_templates.tsv` | 24 | all `draft` | none; allowed scales are G2–G3 |
| Land use | `nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_land_use_templates.tsv` | 31 | all `draft` | none; allowed scales are G1–G3 |
| Place | `nov_region_audit/novgorod_region_template_links_v1_full_pack_EXTRACTED/novgorod_region_place_templates.tsv` | 39 | all `draft` | none; allowed scales are G3 |
| **Total** |  | **128** | **all `draft`** | **0 G4-applicable bindings** |

These archived regional TSV rows are source evidence, not approved or active
runtime bindings. Current general `world_base` seed catalogs contain 70
landscape, 41 water-body, 45 land-use and 64 place templates. Separately, the
existing M3 regional-environment candidate proposes 33 landscape, 21 water,
24 land-use and 37 place rows; those counts describe its audited intersection,
not the full four-TSV source inventory and not G4 expansion profiles.

| Data state | M2c status |
|---|---|
| Source | The approved target catalog has 32 G4@1 and 86 exits. Spatial-v3 v6 is separate supplementary evidence; world-base seed catalogs are available. The four regional-link TSVs above are in the tracked source archive and remain `draft`. |
| Candidate | M2c expansion, natural, item/property, NPC, appearance, target-start, target-runtime, scene-edge and finite-only ordinary-base bundles are authored with provenance and exact scope. Route condition sets and current entity perception inputs remain unresolved. |
| Approved | `m2c-sol-data-approval.json` records independent `gpt-6-sol/high` approval for exact expansion, natural, item/property, NPC, appearance, start, runtime and scene-edge candidates. Separate high review approved the exact landscape openness→stable-cover candidate SHA above and three nonportal site-connection `@2` profiles with null availability; these are data approvals with stated exclusions. |
| Active | Isolated PostgreSQL import/readback and direct official-root start have passed for bounded target fixtures. The old live schema v2 was applied and read back; its P12 data dry-run rolled back after finding 939 conflicting primary keys. Separate v17 world/party databases were created and their full schemas read back. P12 dry-run on the new empty world database passed and rolled back; no P12 COMMIT or M2c runtime activation occurred. Gate1 bootstrap must precede a newly approved P12 request. |

The owner rejected an immutable successor over occupied v16 keys and approved a
separate v17 database pair in the same managed cluster. The [fresh schema
request](../../data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-review-request.md)
has an independent approval and [execution readback](../../data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-execution-attestation.json):
208 empty world tables, 208 `world_reader` grants, 36 party migrations and no
parties; old database row counts were unchanged. The approved P12 request for
an empty database was not committed. Gate1's approved full-table seed closure
requires Gate1 import first; P12 then needs a new request bound to Gate1
readback and a new independent approval.

Data-sufficiency decision: **continue M2c integration** using the approved
authoring and existing owners. Missing G4 profiles were the intended authoring
output and are now independently reviewed by Sol high. Production import and
activation require the remaining current-state suppliers, complete traversal,
the approved separate v17 databases, Gate1 and P12 operational approval/readback
and Contract Audit; fixture success and live DDL alone are not production activation.

The approved 68-edge scene-movement candidate is a mechanical authoring input,
not an imported replacement. P12 is append-only by exact row key, while the
existing 17 scene templates already have version-1 edge keys. Those keys cannot
be rewritten with capacity and reverse refs. A full new scene-template closure
would require repinning many dependent profiles. A separate versioned Spatial
eligibility/capacity adjunct now checks two existing directed edges without
changing their one-way semantics. Sol high independently approved its raw and
mapped data; isolated P12 import/readback and recheck PostgreSQL tests passed.
The adjunct is not release-selected or activated in production. The historical
S1 first-entry path remains pinned to version 1. Local movement remains closed
without a real current-visibility supplier and exact release selection.

### Open typed data gaps

```text
DATA GAP: visibility_modifier_effect_policy_required
required capability: apply a nonempty active visibility_modifier set to current visibility
correct owner: first visibility_modifier writer (smoke, cover or concealment by action) and the visibility/perception reader
missing authoring data: independently Sol high approved versioned effect policy for that writer's modifiers
existing nearest data: current reader verifies an empty active set; night, light and weather are supplied through Temporal/light/weather; landscape-level stable natural-source cover has data-only approval, while current source presence remains owner-pending
why it is insufficient: no owner currently writes visibility_modifier, so no effect semantics can be inferred for a nonempty set
minimum data delta: introduce the first writer together with its independently approved versioned effect policy; do not create a policy in M2c before a writer exists
affected acceptance test: current visibility when an active modifier first exists; present M2c scenes have no modifiers and remain in scope
```

```text
DATA GAP
required capability: player-safe initial/current NPC, ground-item and exit visibility in canonical and generated G5
correct owner: Spatial-v3 perception/P22 current factual reader and exact entity source authoring
missing authoring data: per-entity stable cover, dynamic occlusion, concealment and recognition evidence; current visible-exit disclosure
existing nearest data: approved scene geometry and NPC placement; target initial natural visual state; data-approved landscape-level stable-cover candidate; m2c-initial-entity-perception/candidate.json records their limits
why it is insufficient: co-location, clear air and an active edge do not establish each entity's observed state or player knowledge
minimum data delta: approved exact initial/current source conditions and owner-backed observation rules, with transactional current-state readback
affected acceptance test: rich first screen; local departure and generated destination player-safe projection
```

```text
DATA GAP: current_water_source_state_owner_required
required capability: decide acoustic water-source presence for each natural layer from committed current state
correct owner: current water-source state writer and acoustic/perception reader
existing nearest data: approved acoustic baseline and natural visual projection
why it is insufficient: authored water context alone cannot establish a current audible source for each layer; visual water remains available independently
minimum data delta: owner-backed current source state and per-layer acoustic readback
affected acceptance test: current acoustic projection without suppressing valid visual water
```

```text
DATA GAP
required capability: evaluate generated G5 site-connection availability before selection and again in P16
correct owner: Spatial-v3 condition-set authoring and current-state availability evaluator
missing authoring data: applicable route condition sets and their committed-state dependencies for `ground_flood_snow`, `water_ice`, `wetland` and `shore`
existing nearest data: three data-approved nonportal site-connection `@2` successors use null availability; route segments still carry conditional refs
why it is insufficient: null removes the unsupported condition from those three nonportal profiles, but route refs alone cannot decide or recheck whether a passage is open
minimum data delta: independently approved route condition sets and an evaluator over committed state
affected acceptance test: generated G5 cross-site movement, rollback on changed availability and replay
```

## Earlier M3 authoring inventory

The sections below record the earlier three-family authoring candidates and
their original activation limits. They are not an M2c coverage or approval
claim for all Novgorod place types.

## Owner map

| Requirement | Canonical owner data | Reader/compiler | Persisted/runtime owner | Current state |
|---|---|---|---|---|
| G4/G5/G6 topology | Spatial-v3 v6 closure | existing Spatial-v3 reader | existing spatial materializer/committer | executable |
| landscape/water/land use/place function | `world_base` template and regional-binding tables | procedural profile compiler | compiled profile is not activated yet | source exists; runtime activation unproved |
| work items/containers/finite stock | approved item-container-120 V5 normalized rows | runtime-catalog reader + compiler | Stage 16/items-property/resource nodes | authoring approval PASS; activation `not_requested`; runtime use forbidden |
| ordinary NPC basis | approved enriched occupations/social roles/legal/social-position maps; approved demographic/appearance | actor/role/occupation readers + compiler | Stage 15/16, NPC runtime | schedules, knowledge, behavior/goals and appearance are usable; concrete clothing/tools still blocked by inactive item catalog |
| light/weather/activity/body-time | approved Temporal v4 datasets | existing temporal/environment/body owners | existing temporal persistence | executable; derive current state, never author strings in scene profile |
| presentation | committed entity/group/item/NPC refs | existing perception/opening projection | existing presentation owner | Historical M3 finding resolved: first-entry scene items now reach `initial.visible_objects`; full M2c presentation acceptance remains pending |

## Compiler boundary

`compileProceduralSceneProfile` consumes only exact approved owner records and a
binding containing refs. Output components retain owner table/id, category,
source field, exact quantity bounds and selection weight. It does not author
physical nouns, prose, probabilities or default quantities.

- required components bypass RNG;
- optional candidate choice may use only source weights;
- source weight is never interpreted as presence probability;
- absent explicit presence policy means `optional_presence_policy: null`;
- every declared applicable required layer must be covered or compilation
  returns `PROCEDURAL_SCENE_PROFILE_DATA_GAP`.

## NPC clothing and occupation-equipment candidate

`procedural-scene-v2/npc-equipment-v1` contains a deterministic two-level
authoring candidate and a separate independent-review request. It does not
import or activate data and creates no item/container instance.

- social/basic clothing is role/status/body/season scoped, not NPC- or
  display-name scoped. It requests exact
  `garment.equipment_slot.base_garment` and
  `garment.equipment_slot.outer_garment` bindings for linen shirt and wool
  outerwear, respectively. Current-v6 carry-forward supplies both exact
  approved candidate bindings, from which the authoring profile derives only
  `base_garment` and `outer_garment`; its authoring-only independent approval
  resolves the slot dependency, while this equipment candidate remains
  `pending_independent_review`, `executable=false` and grants no runtime use;
- V5 footwear exists and is approved by the immutable all-120 promotion, but
  current Stage 16 has no active footwear slot, so footwear remains the typed
  `FOOTWEAR_SLOT_NOT_ACTIVE` gap instead of receiving an invented slot;
- occupation equipment resolves exact approved enriched role/occupation and
  legal/social-position sources; active fishing requires exactly one
  code-functional net bound to `activity_assist_fishing_net_v1`, while boatman
  rope remains optional and no absent oar/pole mapping is invented;
- the optional fisher basket is present only because the exact promoted V5
  `carrying_basket -> content_fish -> allowed` relation exists; boatman
  container applicability remains explicitly `not_applicable`;
- quantity, inventory, profile-entry, source, property/access and
  owner/holder/controller kinds are inherited unchanged from exact promoted V5
  rows. Concrete owner, holder and controller assignment remains a later
  materialization responsibility.

Candidate status is `pending_independent_review`; `import_authorized=false`,
`activation_authorized=false`, `activation_request=null`. Unknown, ambiguous,
pending or source-mismatched role/occupation rows fail closed. Raw V5 rows stay
`draft` in their immutable source bundle and are usable here only through the
exact digest-bound `approve_all_120` promotion; candidate entries expose this
as `approved_by_exact_promotion`, never as a rewritten source status.
The separate exact-subject attestation approves only
`npc_equipment_authoring_only`. Runtime, ownership assignment, import,
activation, default selection, deploy and rematerialization remain explicitly
unauthorized; the attestation does not mutate the sealed candidate or request.
Season applicability is pinned to the approved Temporal v4 weather/calendar
record and uses only `spring`, `summer`, `autumn`, `winter`; scenario schedule
labels such as `spring_rasputitsa` do not become season vocabulary.

## Regional environment authoring candidate

`regional-environment/candidates/novgorod-1230-1250-v1` is a new immutable,
not-imported authoring revision built from the tracked `rus13-base-v1` archive
and current universal seed rows. It proposes approved universal + regional
rows only for the audited intersection: 33 landscape, 21 water, 24 land-use
and 37 place rows. Weights, common/dominant flags, allowed scales/node types,
sources, limits and confidence remain source-exact; only approval fields and
audit-required regional context guards change.

The audit selected 34 landscape rows, but its
`lt_sparse_forest_woodland` selector has no prepared regional row in the exact
tracked archive. That archive contains `lt_wet_ravine_gully` instead. Candidate
therefore records `AUDIT_SELECTOR_PREPARED_MEMBERSHIP_MISMATCH`, approves
neither a fabricated sparse-forest row nor the wet-ravine substitute, and
requires a second authoring audit for the missing exact regional row. The M3
minimum (`lt_low_alluvial_riverbank`, `wb_small_river`,
`lu_inland_capture_fishing`, `pt_fishing_station`) is complete.

New `pt_drying_storage_workspace` and its Novgorod binding are separate
`needs_review` rows, `is_allowed=false`, bound only to exact current old-shed
G5 context. They describe drying, temporary storage and household processing
compatibility; dormant/active state remains process-owned, and the rows create
no fire, fuel, material, container, tool, NPC or process. Import, activation
and production authority remain false. Existing combined procedural import
pack is explicitly stale/intermediate and unchanged.

## Immutable v6 authoring overlay

`procedural-scene-v2/authoring-overlay.json` revision 3 contains three new
route-free candidate rows compiled from approved WK claim/evidence refs and the
exact Spatial-v3 v6 scene/G5/parent/G6 closure. It does not promote or copy the
old draft landscape/water/land-use/place rows and contains no quantity or
capacity.

The paired artifact is an approval **request**, not an attestation. The three
route-free rows now have separate row-scoped authoring attestations, while
`import_authorized=false`, `activation_authorized=false`, and no activation
request/event exists. Candidate rows are not executable runtime data.

## Functional mapping candidate

`procedural-scene-v2/functional-mapping-v1` adds one versioned, deterministic
functional-layer candidate and a separate approval request. It is not
self-approved and defines mappings only: no runtime item, container, stock,
place group or event is created.

- fishing `tool` selects only independently usable trap/net/spear alternatives
  by exact V5 profile/category IDs; `work_material` is a separate finite spare
  line/float/sinker component group, without claiming a compatible repair
  operation; both retain V5 entry weight, quantity, inventory, category and
  source refs and require a committed runtime source;
- fishing `storage` and `work_zone`, plus dormant drying `storage` and
  `work_zone`, are persistent place-function groups over exact approved G6
  slots, not item/container claims;
- natural shore remains a typed owner-context group without local taxon or
  resource presence; wreck material requires a separate committed wreck/source;
- one committed material source cannot appear in two functional item layers or
  count as both unrevealed stock and a created item.

The remaining typed gaps are fishing container compatibility, active drying
tool/material and conditional container ownership, and conditional finite wreck
source identity. Functional mapping candidate is independently authoring-approved
for `authoring_mapping_only`; import and activation remain forbidden.

## Combined disposable import pack

`procedural-scene-v2/import-pack-v1` deterministically combines exact overlay
rows, three row attestations, approved functional mappings, V5 approval/target
pins and Spatial-v3 v6 compatibility tuple. Candidate, promotion manifest,
approval request and pre-approval ledger have sealed digests. Rows, statuses,
forbidden implications, materialization limits and all five remaining gaps stay
byte-equivalent to approved upstream artifacts.

Compiler emits eleven normalized generated-cache records: three profiles,
seven mappings and one approval/limits/gaps record. Generic catalog membership
inserts them into `world_base.procedural_scene_compiled_records`; payloads omit
authoring evidence prose/source descriptors and contain no runtime instances,
stock, containers, processes or operations. Table is append-only and is the
existing runtime-catalog readback owner, not a second persistence path.

Request asks only `approve_disposable_local_authoring_import` for a disposable
local PR-candidate database. It grants no operator, production, activation,
default, deploy or rematerialization authority. Ledger deliberately has no
approval attestation yet, no runtime capability, and zero activation events.
Safe wrapper refuses import until a separate exact independent attestation is
provided, then uses existing baseline registration and catalog import owners;
it never creates an activation request or event.

## Current family gaps

| Family | Existing nearest data | Blocking gap |
|---|---|---|
| natural shore | approved route-free row plus approved typed natural-layer authoring mapping | landing/access/safety/local taxon/stock remain forbidden; conditional wreck material requires separate committed source |
| inland fishing worksite | approved route-free row plus approved tool/work-material/place-function authoring mappings | container compatibility remains typed conditional gap; no station/catch/route or runtime stock implied |
| drying/storage workspace | approved editorial place row plus approved dormant storage/work-zone authoring mappings | dormant variant implies no object/process/NPC; active tool/material and conditional container remain process-owned gaps |

## DATA GAP: executable activation

- required capability: compile three exact current-v6 families from approved imported rows;
- correct owner: runtime-catalog activation and world-base authoring workflow;
- missing proof: independent approval attestation and completed disposable-DB
  execution of baseline registration plus no-activation import/readback for the
  exact v6 tuple; integration test is present but was skipped locally because
  Docker was unavailable;
- nearest data: source archive, item candidate bundle and v6 spatial manifest;
- why insufficient: candidates/manifests do not prove active rows;
- minimum delta: independently approve or reject exact combined import request;
  if approved, run baseline registration plus import/readback in disposable DB.
  Activation remains a separate forbidden step;
- acceptance: unknown/draft/missing/ambiguous record hard-blocks before runtime.

## DATA GAP: finite resources

- required capability: source-owned quantities and ambient policy for each
  material category used by baseline/remainder;
- correct owner: item/resource profile plus existing `party_resource_nodes`;
- missing data: the mapping preserves existing V5 quantity/mechanics refs, but
  no runtime stock or source instance exists; natural origin is not an infinite
  policy;
- minimum delta: exact quantity/profile refs and explicit ambient policies only
  where authoring data says conditional abundance;
- acceptance: depletion, reload, CAS concurrency and rollback with one shared
  remainder across synonyms/positions/request IDs.

Until these gaps close, no compiled artifact is eligible for production loading
and no gameplay/model acceptance run may claim procedural baseline coverage.

### Explicit status decisions

- item-container-120 V5 authoring approval is PASS and immutable; building/layout/
  content profiles and G4/item rules remain `NOT ACTIVE`. This overlay reads them
  only as approved authoring evidence and does not consume them as runtime truth;
- enriched occupations/social roles plus approved legal/social-position seeds:
  usable for NPC schedule, property, knowledge, behavior, relationships and goals;
- actor demographic/appearance owner and `materializeActorBaseAppearance`:
  implementation is usable, but exact current-v6 active readback contains no
  applicable entries because the appearance candidate activation is false;
  runtime wiring therefore remains blocked instead of falling back to candidate data;
- Temporal v4 daylight/weather/activity/body-time/remote-catchup/propagation:
  usable through existing owners; initial environment derivation is implemented
  and tested, but production loading remains gated on exact profile pins in the
  compiled scene artifact;
- draft name pools: not usable; ordinary unrecognized label remains player-safe
  until a name has approved/authored basis.
