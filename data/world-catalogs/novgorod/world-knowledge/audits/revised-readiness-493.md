# Revised readiness audit — current 493

Independent read-only reclassification of the remaining 3 P0 and 9 P1 matrix
cells against current claims, ordinary materialization, committed profile/state
and free NPC/player flow. A missing actor, route, item, skill, schedule,
permission, source stock or outcome is not a factual gap. Free ordinary action
uses semantic composition and code-owned mechanics; a new historical recipe
is needed only when runtime asserts an objective historical class/practice.

## Cell verdicts

| Cell | Current need / examined composition | Verdict and severity rationale |
|---|---|---|
| `space:settlement-types` P1 | Urban buildings, rural agriculture, river/landing, storage, fishing and workshop contexts already ground urban/rural/riverbank type reasoning. Particular site is ordinary materialization/state. | **COVERED recommendation.** No concrete class premise missing. |
| `space:defences-public` P1 | Rampart/timber-earth defence, public market/assembly, paving and river-market contexts support defence/public-place play. Gate/tower presence/form belongs authored topology or ordinary state, not a mandatory general premise for every public interaction. | **COVERED recommendation.** |
| `material:fibre-textile` P1 | Linen/hemp/wool forms, weaving, cordage, flax breaking/hackling and garments compose use/repair. | **PARTIAL P1:** dated dye-material/application relation remains; unseen dye an already-present thread requires an objective source/process class, not stock/recipe. |
| `material:leather-fur` P1 | Leather forms, rawhide/leather responses, tanning chemistry, sheepskin and fur exchange. | **PARTIAL P1:** fur-bearing pelt preparation/preservation; raw pelt→usable fur is otherwise invented. |
| `material:binding-substances` P1 | Resin, glue, bast, wax, pigments and joining mechanics are grounded. | **PARTIAL P1:** dated oil/fat protective/binding material relation for declared branch; no current oil stock implied. |
| `process:fibre-leather` P1 | Weaving, sewing, hemp/flax break-clean substrate and tanning support bounded attempts. | **PARTIAL P1:** flax/wool preparation-to-spinning and dye application; fur-pelt preparation when fur branch asserted. |
| `process:subsistence` P0 | Cultivation, husbandry, fishing, hunting, borts, harvest and feed biology are grounded. | **PARTIAL P1 recommendation, not P0:** only trapping process lacks a historical relation. Trap/bait/game/current hunt are state; isolated trapping does not block major subsistence loop. |
| `items:institutional` P1 | Exchange, church, law and military contextual texts do not materialize an institutional item or its official function. | **PARTIAL P1:** dated material class/function relation for an ordinary trade, religious or military institutional item. Free-made token/item cannot gain official status. |
| `npc:occupations` P0 | Craft, agriculture, fishing, boat/hired work and bounded clergy context cover ordinary early-game work. | **PARTIAL P1 recommendation:** qualified authority/military/temporary-service role→practice envelope remains. Current role/skill is profile state; gap matters only when such NPC is semantically invoked. |
| `npc:routines` P0 | Current activities/schedules are code-owned; work and seasonal biological contexts exist. | **COVERED recommendation.** No objective historical premise is needed for a committed NPC to work, rest, negotiate or change task; no fixed cycle is asserted. |
| `social:law` P1 | Claim/acquisition, market proof, custody, complaint, conditional ecclesiastical context exist. | **PARTIAL P1:** qualified local-period procedure/jurisdiction envelope before runtime states an authority must decide/remedy a case. Free complaint/answer needs none. |
| `social:religion` P1 | Calendar, prayer, clergy category and conditional baptism contexts exist. | **PARTIAL P1:** dated ordinary observance or burial-practice relation if runtime asserts either as an objective practice. Belief/current rite stays state. |

## Minimal major-domain backlog

Keep only: fibre dye/spinning; fur pelt preparation; oil/fat binding branch;
institutional item function; authority/military/temporary role practice; local
legal procedure; ordinary observance/burial. Trapping is a real but isolated
P1 process branch. Remove settlement type, defence/public and routine barriers
as composition/state-owned rather than absent historical premises.

This is a readiness recommendation, not a matrix edit or a claim that every
optional historical speciality is implemented.

## Evidence addendum — the three proposed closures

This addendum tests only the three proposed closures above.  Claim refs below
are independently approved entries in the compiled active pack
`production-v1/runtime-bundle.json`; the ordinary-presence owner is
`apps/game-server/src/runtime/lower-dvina-trace-ordinary-discovery.js`, its
grounding boundary is `apps/game-server/src/runtime/world-knowledge-grounding.js`,
and the autonomous NPC semantic boundary is
`apps/game-server/src/runtime/lower-dvina-trace-autonomous-llm.js`.  Exact
profiled schedule state, where a scenario has it, is code-owned by
`apps/game-server/src/runtime/lower-dvina-trace-phase-7-contracts.js`.

### `space:settlement-types`

Approved class facts are `claim:settlement-log-building-form` (Novgorod land,
1000–1300: a timber dwelling has the attested log-structure form),
`claim:settlement-workshop-street`, and
`claim:agriculture-rural-role-context`; the compiled pack also exposes the
river-landing/market context.  They compose urban, rural, workshop and
riverbank *types*, while the ordinary-discovery owner materializes only an
ordinary physical detail in the already committed visible scope.

Unseen probe: “At the known riverside working area, look for an ordinary
log-built dwelling or work/store area before asking the people there for
directions to the landing.”  This asks for a compatible ordinary type, not a
pre-existing named household, route, stock or person.  The class facts plus
ordinary-presence owner supply the factual envelope; topology and the actual
materialized instance remain state.  Thus the proposed closure does not turn a
single known settlement into proof of every building or landing.

### `space:defences-public`

Approved class facts are `claim:civic-wood-earth-wall`,
`claim:civic-earth-rampart`, `claim:civic-defence-log-courses`,
`claim:civic-public-market`, and `claim:civic-public-assembly` (each scoped to
Novgorod land, 1100–1300, with its recorded directness/limits).  Together they
provide timber-earth defence and public market/assembly categories; they do
not assert a gate, tower, guard, entrance, or any particular enclosure in the
active scene.

Unseen probe: “At an already established timber-earth enclosure, inspect the
rampart and seek the public area outside it.”  The historical class composition
grounds what a defence/public-place type can be.  Whether that enclosure has a
gate or tower, whether it is passable, and its exact route are authored
topology/current-state questions handled outside this factual family.  A
materializable compatible type/function is therefore covered without
materializing a gate/tower by assertion.

### `npc:routines` — boundary correction

The current approved seasonal premises are concrete but narrow:
`claim:seasonal-plant-development-depends-on-photoperiod` (universal
photoperiod-responsive plant development),
`claim:environment-p1-wildfowl-season` (Novgorod land, 1000–1500: much wild
bird hunting seasonal, with poultry/mallard limits), and
`claim:seasonal-bird-migration-affects-seasonal-food-climate-exposure`.
`claim:population-net-work`, `claim:population-boat-work`, and
`claim:agriculture-rural-role-context` additionally ground occupation/process
contexts, not a calendar.  The active schedule owner above can run a committed
NPC schedule; that code is not evidence that a given occupation historically
worked at a particular hour or season.

Unseen probe: “When spring conditions change, an already committed fisher
chooses whether to mend a net, rest, or seek other work.”  Such a choice needs
the committed NPC/state and the grounded fishing context; it does not need a
universal duty or an asserted traditional calendar.  An arbitrary active
schedule (for example, a particular NPC resting at noon) is therefore not a
historical-premise gap.  Conversely, a narration such as “fishers normally
begin net work in this named month” would require a missing dated
occupation-to-season relation.  The listed biological facts do **not** supply
that relation.  Accordingly, the earlier routines COVERED proposal holds only
for state-driven open routines; for the full matrix family if it promises
objective seasonal work obligations, retain **PARTIAL P1** pending that exact
relation.  This is a scope correction, not a matrix/PASS change.

### `material:leather-fur` — current 499 closure

`claim:population-processes-fur-exchange` supplies the dated (1000–1300,
Novgorod land) historical fur material/exchange class.  The independently
approved universal FPP facts, `claim:flayed-skin-processing-purpose` and
`claim:fur-skin-cooling-cleansing`, then supply the relevant causal substrate:
post-flaying processing aims at cleansing/preventing putrefaction, and prompt
cooling plus thorough cleansing can limit bacterial growth that can loosen
hair.  The existing leather/tanning material facts remain a distinct branch.

Unseen probe: given an already committed fresh fur pelt and accessible
water/cooling means, the actor promptly cleans and cools it to mitigate
bacterial hair-loosening.  The pelt, access, means and resulting state are
owned by ordinary materialization/current state and code; the two universal
facts qualify the physical preservation attempt.  No recipe, exact
temperature/deadline, guarantee, historical local technique, or pelt
materialization is inferred.  Therefore the former qualified fur-pelt
preparation/preservation P1 has no remaining causal-premise gap and this
material-family closure is recommended.  This does not affect the separate
fibre dye-source/practice or spin-readiness residuals.

### `material:binding-substances` — current 502 oil/fat check

The new universal relations `claim:oil-rawhide-moisture-resistance`,
`claim:oil-fat-vegetable-leather-flexibility`, and
`claim:oil-tanning-crosslinking-fibres` qualify the material response of
already established oil/fat, rawhide or leather.  They do not provide a
Novgorod/Rus oil or fat material class, production, exchange, binding use, or
scene supply.  Targeted review of the existing historical fragments finds
historical resin/bast (`claim:construction-pine-resin-surfaces`,
`claim:construction-pine-resin-bast`) and wax
(`claim:agriculture-fauna-borts-wax`, `claim:social-daily-wax-commodity-context`),
but no approved historical oil/fat context.

Unseen probe: “Use this already committed pot of animal fat to soften the
already committed hard vegetable-tanned leather.”  The new universal
flexibility relation makes its conditional physical result grounded and the
pot/access/amount are state-owned; it does not authorize materializing the
fat.  Hence the universal response closes the mechanics **after** oil/fat is
present, but the declared oil/fat binding-material branch remains **PARTIAL
P1**: it needs one dated regional historical premise that oil or animal fat
formed an available material/maintenance or binding context.  That premise
must remain category-level and must not assert a current stock or a complete
recipe.

### Current 506 — textile colourants and fibre process

The four approved Nahlik analytical claims now supply a historical
Novgorod-land textile-colourant context: `claim:textile-ellagic-acid-analysis`,
`claim:textile-chrysin-analysis` (1100–1300 inferred-medium),
`claim:textile-indigo-yellow-analysis` (1200–1300 direct-high), and
`claim:textile-lac-dye-analysis` (1200–1300 inferred-medium).  Composed with
the universal `claim:textile-dye-application` and
`claim:textile-dye-mordant-fixation`, they close the former historical
dye-material/application deficit for `material:fibre-textile`.  This is a
category context, not a claim that any source plant, indigo, lac, mordant,
dyebath, worker or coloured stock exists in the current scene.

Unseen material probe: with a committed textile and a separately committed
colourant, attempt to colour the textile.  The historical colourant envelope
and universal application mechanics qualify the attempt; exact input, access,
method and result remain code/state.  **`material:fibre-textile`: COVERED
recommendation**—no remaining P1 causal material premise.

`process:fibre-leather` remains **PARTIAL P1**, now for one narrower reason.
Flax breaking/hackling (`claim:fibre-flax-breaker-shive`,
`claim:fibre-hackle-removes-shive`), hemp fibre/tow and weaving-thread/output
facts compose preparation, fibre and weaving, but none states that prepared
flax/hemp/wool fibre is spun into thread.  Unseen process probe: given an
already committed cleaned flax or hemp fibre bundle and a spindle, spin it into
thread for the attested weaving branch.  The actual tool, skill and outcome
are state/mechanics, but an asserted historical fibre-to-spinning/thread
relation is still the missing causal premise.  No dye-source, bath or colour
stock premise remains in this cell.

#### 506 fibre-to-thread composition check

The P1 is not a demand for a redundant dated recipe.  Existing dated bases are
`claim:household-spindle-whorl` (clay spindle whorl used in spinning,
Novgorod land 1100–1300), `claim:agriculture-fauna-flax-hemp-cultivation`,
the flax breaker/hackle relations, and hemp fibre/tow.  The only nearby
universal bridge, `claim:material-water-linen-flax-origin`, says linen textile
is made from flax fibre.  Its approved wording is an origin/classification
fact: it explicitly does not prescribe a process and contains neither
spinning, twisting nor yarn/thread output.  The current corpus contains no
universal `prepared spinning fibre → twisted yarn/thread` relation.

Thus the existing facts establish endpoints and a spindle's historical
function, but not the causal transformation in the unseen probe.  One
universal direct relation that spinning twists/draws suitable prepared textile
fibres into yarn/thread would fill this P1 when composed with the existing
dated Novgorod fibre and spindle bases; no further dated fibre-to-spinning
recipe would then be necessary.  Until that bridge exists, its content cannot
be inferred merely from coexisting fibre, linen and a spindle.

### Current 508 — yarn bridge and recorded `maslo`

`claim:textile-fibres-twist-yarn` is the formerly absent universal direct
bridge: textile fibres can be twisted together into yarn.  Composed with the
existing dated Novgorod-land spindle use, flax/hemp material/preparation and
weaving-thread facts, it closes the fibre-to-thread causal branch without
requiring a second dated spinning recipe.  Unseen probe: with a committed
bundle of textile fibres and a committed spindle, twist the fibres into yarn
for an already grounded weaving attempt.  The bundle, spindle, access, skill,
degree of twist and outcome remain state/mechanics.  **`process:fibre-leather`:
COVERED recommendation**; the separate hide branch was already covered and no
P1 causal premise remains in this process family.

`claim:maslo-birchbark-718-account` now supplies a limited historical
Novgorod-Land 1200–1300 material context: letter 718 records a pot of `maslo`,
with a conditional 1220–1240 date and later-date caveat.  Together with the
existing universal oil/fat response relations, it fills the previously absent
historical material-class side of the oil/fat binding branch.  Unseen probe:
with a committed pot whose resolved material identity is oil/fat-compatible
and committed hard vegetable-tanned leather, try working the material into
the leather for flexibility.  The universal relation qualifies the conditional
response; pot quantity, access and result remain state/code.

The letter does **not** identify `maslo` as animal or plant derived, establish
a treatment/maintenance use, make it a default household supply, or
materialize a pot.  Those are limits on narration and current state, not a
remaining category-level causal gap: the historical material mention plus
universal conditional response is sufficient.  **`material:binding-substances`:
COVERED recommendation.**

### Pre-import ORP/BOP boundary check

If normalized exactly as verified, ORP-01/02 may extend
`npc:occupations` only with a source-qualified **possible** authority/military
activity envelope: the named 1224/1228 posadnik episodes show particular
officeholders participating in conflict.  They must not be worded as a
posadnik's ordinary duty, command power, boating practice, permission, crew,
enemy or current role.  The current P1 cannot be removed before the records
are actually imported; after import they fill this military/authority subcase,
not an asserted universal occupation rule.

BOP-01/02 describe nailed plank-coffin examples and BOP-03 a hollowed-log
container in the preliminary, child-biased early-XII Il'inskii II complex,
with only inferred-medium 1100–1300 Novgorod-land compatibility.  Thus they
can ground alternative ordinary burial-container material forms for a
separately committed burial context.  They establish neither a mandatory
container nor calendar observance, Christian rite, clergy, prayer,
orientation, kin duty, cemetery topology or current grave.

Accordingly, pre-import `social:religion` remains **PARTIAL P1**: BOP can
remove a narrow container-material subgap, but the actual residual is a dated
ordinary observance/practice relation if runtime narrates one as objective
historical custom.  `items:institutional` also remains **PARTIAL P1**.  A
coffin/log is not thereby an official trade, religious or military item and
BOP assigns it no institutional function; the missing premise is still a
dated material-class → institutional-function relation.  Neither closure may
be inferred merely from future normalization.

### Current 513 — post-import P1 reassessment

**`npc:occupations`: COVERED recommendation.**  The imported,
source-qualified `claim:posadnik-fedor-conflict-1224` and
`claim:posadnik-volodislav-pursuit-1228` fill the previously missing
authority/military possible-activity subcase.  Together with existing craft,
agriculture/fishing, hired/boat/auxiliary work, exchange and clergy/priest
contexts, they form the declared open occupation envelope.  They are not an
officeholder's duty, power, current conflict, vessel, crew or another NPC's
conduct.  A role, tools, competence, service request and actual decision are
committed-state/NPC-choice questions, not missing historical premises.

The other P1s are not closed by treating conditional examples as universal
rules:

- **`npc:routines`: PARTIAL P1.** `research/population-seasonal-work.md`
  confirms that the corpus has biological seasonality and work contexts but no
  verified dated medieval Novgorod/Rus activity-to-season relation.  A
  committed NPC may still work, rest, negotiate or change task under the
  schedule/decision owner; that is not the gap.  One qualified historical
  activity-in-season example (not a universal duty/calendar) is needed only
  for objective narration of seasonal work.
- **`social:law`: PARTIAL P1.** Market-proof, complaint and
  text-scoped ecclesiastical adjudication relations support speaking,
  alleging and choosing to seek resolution, but not an asserted local
  authority's jurisdiction/procedure, evidence sufficiency, sanction or
  remedy.  The missing premise is one qualified local-period
  procedure/jurisdiction relation; a current court, claimant or outcome is
  state, not evidence.
- **`social:religion`: PARTIAL P1.** Imported BOP container examples now
  cover a narrow material alternative in a separately established burial, not
  observance, rite or calendar.  The remaining premise is a dated ordinary
  observance/practice relation if runtime presents it as an objective custom;
  no universal religious obligation or present belief is required.
- **`items:institutional`: PARTIAL P1.** Documentary/accounting and calendar
  contexts, plus BOP containers, do not provide a material item with a dated
  institutional trade/religious/military function.  The remaining premise is
  one such class-to-function relation; current stock, authority and use remain
  state-owned.

### Clarification — trapping mechanics and qualified legal procedure

The prior trapping P1 was too broad if it meant a missing generic physical
mechanism.  For a source-qualified trapping class (TPU-07 once normalized),
the existing `claim:force-contact-geometry`, `claim:dry-friction`,
`claim:population-physics-static-friction`, and material bend/fracture
relations already let the ordinary action owner assess an actor-built
restraint/enclosure from actual geometry, contact, force direction, support,
material and failure.  They do not whitelist a snare, net, deadfall or
`lovishcha`; nor does TPU-07 identify any of those.  The target animal's
existence, body/route geometry, movement and escape attempt are committed
state/body/spatial or NPC/animal-decision inputs.  They are not a missing world
knowledge fact.  Thus no new tautological “effective restraint works” claim
or dated trap recipe is required: the only historical factual absence is the
unimported TPU-07 class itself.  An unseen probe may use committed materials
to build an unspecified enclosure/restraint against a committed animal; it
may fail from the existing mechanics and creates neither animal nor capture.

**`social:law`: COVERED recommendation (correction).**  The current
`claim:rp-property-claim-relates-acquisition-chain`,
`claim:rp-market-purchase-relates-proof-participant`,
`claim:rp-entrusted-goods-claim-relates-reference`, and
`claim:rp-merchant-credit-relates-third-party-goods` already compose a
conditional legal-procedure envelope under the Tikhomirov early-XIII
Novgorod-origin argument: 1200–1300 Novgorod-land inferred-medium,
domain-internal only.  Articles 29/32/45/50 supply acquisition-chain,
proof/witness-oath, deposit/oath, and differentiated loss/repayment contexts.
They cannot establish enacted universal local law, a current court,
officeholder jurisdiction, proof sufficiency, sanction or outcome—but those
are correctly state/authority-decision questions.  Requiring those facts to
close the category would be an erroneous demand for automatic enforcement,
not a genuine missing premise.

### Current 515 — winter movement and RPO-03 pre-import test

`claim:transport-winter-sledge-1220` is already normalized and supplies the
required qualified activity-to-season example: a named winter-1220 Novgorod
movement on sledges.  It composes with the existing nonwinter sledge-cargo
context without becoming a timetable, general medical practice, route,
traction rule or current vehicle.  This is enough for the narrow factual
seasonal-context requirement: **`npc:routines`: COVERED recommendation**.
Committed schedules and free NPC task choice remain independently state-owned.

RPO-03 is independently approved research, not current production.  Its
source-locked wording—an otherwise unprovenanced pre-Mongol XII–XIII bowl,
with a cross on its base, **most likely** a travel chalice used for communion—
is sufficient *if normalized with exactly those limits* to fill the two
remaining functional envelopes.  It provides an item form → probable
communion function for `items:institutional`, and a qualified religious-use
example for `social:religion`; neither requires a named metal, specific
substance, findspot or a universal rite.  Its missing material identification
is not a causal gap because the claim is form/function, not a materials
recipe.

It would still establish no local Novgorod presence, chalice/communion event,
church, clergy, consecration, wine, access, belief, current institution or
ordinary mandatory observance.  Those are either excluded historical claims
or state/choice questions.  Therefore **before import** `items:institutional`
and `social:religion` remain P1 solely because RPO-03 is absent from the
current corpus; no additional factual premise is needed after a correctly
limited normalization.  Do not close either cell from this future candidate.

### Current 516 — post-import four-cell closure delta

All four formerly residual matrix cells now have their required bounded
premise in the current corpus:

- **`wk:process:subsistence`: COVERED recommendation.**
  `claim:early-rus-hunting-ground-terms` supplies the source-qualified
  trapping/resource-ground class.  With the already present
  contact/geometry, friction and material-failure substrate, an actor may make
  an open restraint/enclosure attempt from committed inputs.  It does not
  name a `lovishcha` mechanism, net, bait, animal, site, ownership or catch.
- **`wk:npc:routines`: COVERED recommendation.**
  `claim:transport-winter-sledge-1220` is the one named winter transport
  example required for a qualified seasonal context, while existing nonwinter
  sledge transport prevents a false all-season exclusivity reading.  It is not
  an annual schedule or a duty for any NPC.
- **`wk:items:institutional`: COVERED recommendation.**
  `claim:probable-travel-chalice-communion` supplies a cautious item-form →
  probable religious function.  A named metal/material is not required for a
  functional class; the claim remains an unprovenanced broad Old-Rus analogue,
  not a current institutional object or official authenticity.
- **`wk:social:religion`: COVERED recommendation.**  The same probable
  communion-use example joins existing calendar, clergy/baptism and burial
  container contexts to provide a qualified practice envelope.  It neither
  guarantees communion, proves a uniform rite or belief, nor creates a church,
  cleric, consecration, wine, access or current observance.

Together with the earlier `social:law` correction, this scoped 62-cell
readiness audit now has **no remaining P0/P1 factual-premise backlog**.  This
is a matrix-closure recommendation only—not a claim of global start PASS:
active start profiles, unseen production probes and the current pipeline still
need their own end-to-end audit.

### Current 516 — independent global start/early audit

This is the previously deferred audit beyond the 62-cell matrix.  The active
consumer is revision 32: `phase-1b-v27/publication-binding.json` selects
`phase-1a-v23/manifest.json` and
`phase-m20-content/definition.json`.  It has four actual early locations
(`wreck_shore`, `fishing_camp`, `old_drying_shed`, `zhdanko_storehouse`) and
five participant families (Onisim/boat worker; Eremey and background fishers;
Ratsha and Zhdanko/storage work).  Candidate sets require the named profiles
or two distinct background-fisher instances; they are not empty optional
placeholders.

**Locations and materialization.**  The current corpus maps those profiles to
`riverbank-workspace`, `fishing-workspace`, `drying-workspace`, and
`storage-workspace`.  Their contextual support is respectively
`claim:population-river-work`, `claim:population-fishing-workspace`,
`claim:population-drying-workspace`,
`claim:population-household-storage` and
`claim:population-storage-vessels`.  The active scene presentation's concrete
objects remain committed authored state, not purported stock generated from
these claims.  The first-entry path is explicitly bounded from wreck shore to
camp, then to drying shed; S1 allows only one unimportant local structure in
the fishing-camp envelope.  Thus no missing historical fact is being hidden
as a required candidate, route, quantity, ownership or access condition.

**NPCs and early routines.**  The participant mappings compose with
`claim:population-net-work`, `claim:population-boat-work` and
`claim:population-storage-role`; the current schedule's repair/laying nets,
boat/cargo work and stock work are concrete committed activities, not an
asserted universal duty or all-year timetable.  Prior 515/516 conclusions
still apply: winter sledge transport supplies bounded seasonal context, while
the schedule owner supplies present timing.  No individual skill, wage,
property title, task completion, current catch, store or access is inferred.

**Unseen ordinary requests.**  The active O2b profile limits ordinary contents
of the already-existing player pouch; A1 permits a bounded physical
transformation only of visible, accessible real items; F1 has exact fuel and
ignition; S1 permits one ordinary local structure only in the existing camp.
Their required historical/material substrate is therefore composition of the
above workspace/occupation claims, existing fibre/wood/boat/fishing facts and
the already audited universal mechanics.  An unseen request such as using an
actually visible branch and cordage to make a nonworking drying-frame repair,
or opening the existing pouch for an ordinary compact road-kit item, neither
requires a historical recipe nor invents pre-existing material.  Missing
current item, water, fuel, access, capacity, tool or favourable result is a
state/mechanics outcome, not a factual-premise gap.

The executable `lower-dvina-trace-world-knowledge-bridge` preflight was run
against the current corpus: all 11 tests passed.  It exercises the real
revision-32 location/participant premise families and fails closed for absent,
expired, universal-only, source-less, excluded or disputed support.

**Verdict: independent factual global-start PASS — no P0/P1.**  The apparent
"Lower Dvina" wording does not itself create a new geography gap in this
audit: the active definition, dossier and bridge query each use the declared
`region_novgorod_land`/`gn_nov_g1_xp017_yp026` applicability envelope, and
the mapped claims are qualified for that same envelope.  This does not certify
a separate real-world Lower-Dvina provenance, nor the whole runtime/LLM/UI
pipeline; either would be a distinct scope.  It certifies only that every
actual start/early factual consumer and its allowed unseen materialization
branch has a current bounded factual substrate, without treating state or
authoring choices as missing history.
