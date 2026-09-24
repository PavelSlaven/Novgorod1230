# M2c / M3 procedural materialization data sufficiency

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
| Natural layers and seasonal state | Approved M2c natural baseline, presentation and placement; Temporal v4 | Exact natural/Temporal readers | Spatial scene materialization and environment owners | Scene baseline, natural and environment rows | Canonical initial P22 natural projection | Canonical start PostgreSQL acceptance passes; generated destination current P22 and entity visibility still need authoritative inputs |
| Functional things and finite stocks | Approved M2c item/property authoring, finite capability scopes and finite-only ordinary base | Exact item/property readers and natural first-entry owner | Stage 16, ordinary first-entry and finite-resource transition owners | Items, containers and `party_resource_nodes` | Player-safe item/scene projection | Four finite source classes scoped to five G4; Sol high approved the finite-only base data separately. Runtime integration, production import/readback and decrement acceptance remain pending; no stock invented for other G4 |
| NPC composition and equipment | Approved regional/canonical NPC composition, runtime profiles, appearance and applicable item/Temporal data | Exact NPC, actor and appearance readers | Actor materialization, Stage 16 and NPC runtime | Actor/body/item/activity/clock state | P12/P22 people projection | Canonical NPC materialization and real PostgreSQL start pass; source-specific visibility/recognition remains unresolved, so co-location alone cannot project a person |
| First-screen delivery | Committed spatial, natural, item and NPC refs | Current factual reader and visibility/knowledge owners | Opening Stage 22/23 and narration | Presentation delivery state | Player-visible opening | Direct official-root start/replay/ACK PostgreSQL acceptance passed; first-screen gameplay report and full generated-G5 acceptance pending |

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
| Candidate | M2c expansion, natural, item/property, NPC, appearance, target-start, target-runtime, scene-edge and finite-only ordinary-base bundles are authored with provenance and exact scope. Conditional connection availability and current entity perception inputs remain unresolved. |
| Approved | `m2c-sol-data-approval.json` records independent `gpt-6-sol/high` approval for exact expansion, natural, item/property, NPC, appearance, start, runtime and scene-edge candidates. This is data approval; each entry states its exclusions. |
| Active | Isolated PostgreSQL import/readback and direct official-root start have passed for bounded target fixtures. No production operator import/activation or exact live readback has been performed for the complete M2c closure. |

Data-sufficiency decision: **continue M2c integration** using the approved
authoring and existing owners. Missing G4 profiles were the intended authoring
output and are now independently reviewed by Sol high. Production import and
activation require the remaining current-state suppliers, complete traversal,
operational approval/readback and Contract Audit; fixture success alone is not
production activation.

The approved 68-edge scene-movement candidate is a mechanical authoring input,
not an imported replacement. P12 is append-only by exact row key, while the
existing 17 scene templates already have version-1 edge keys. Applying capacity
and reverse refs requires new complete scene-template versions and repinned
scene materialization candidates/profiles. The canonical target start must use
its version-aware owner; the historical S1 first-entry path remains pinned to
version 1. Until that closure is independently approved, imported and read
back, local movement cannot use the candidate rows.

### Open typed data gaps

```text
DATA GAP
required capability: player-safe initial/current NPC, ground-item and exit visibility in canonical and generated G5
correct owner: Spatial-v3 perception/P22 current factual reader and exact entity source authoring
missing authoring data: per-entity stable cover, dynamic occlusion, concealment and recognition evidence; current visible-exit disclosure
existing nearest data: approved scene geometry and NPC placement; target initial natural visual state; m2c-initial-entity-perception/candidate.json records their limits
why it is insufficient: co-location, clear air and an active edge do not establish each entity's observed state or player knowledge
minimum data delta: approved exact initial/current source conditions and owner-backed observation rules, with transactional current-state readback
affected acceptance test: rich first screen; local departure and generated destination player-safe projection
```

```text
DATA GAP
required capability: evaluate generated G5 site-connection availability before selection and again in P16
correct owner: Spatial-v3 condition-set authoring and current-state availability evaluator
missing authoring data: body, applicability and state dependencies for availability.local_state_conditional@1
existing nearest data: three approved canonical G5 connection profiles carry only the opaque versioned ref
why it is insufficient: a ref alone cannot decide or recheck whether a specific committed passage is open
minimum data delta: independently approved condition set with exact three-profile scope and an evaluator over committed state
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
