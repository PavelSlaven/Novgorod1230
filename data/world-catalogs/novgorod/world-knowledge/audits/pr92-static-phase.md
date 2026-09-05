# PR92 — static coverage checkpoint, 2026-09-05

## Status: integration checked; offline context acceptance pending

The user's clarified requirement permits plausible reconstruction from
neighbouring periods/settings and practical reasoning. WK contract §0.2
requires useful context about work, clothing, tools, household, means,
status and behaviour, not direct attestation of every ordinary detail.
Reviewed reconstruction remains distinguishable from attested knowledge.

The integrated corpus contains **1,392 approved claims, 899 concepts,
505 sources and 1,007 evidence records**. This includes 156 independently
reviewed premises using editorial-reconstruction sources; 166 claims have
editorial directness overall, including editorial composition of external sources.
Earlier reconstruction milestones include `9e59d01` (ordinary/human), `6210be8`
(practical), `6dff36d` (public) and `1a96aea` (healer practice). Existing per-claim verification bindings
validate against the full assembled authoring input. No new approval system
or runtime owner was introduced.

Cartography has **182 supported families and 49 retained partial need
records**. The latter contain earlier direct-source-oriented limitations
and newly linked reconstruction support. They are not 49 independently
confirmed current P1 blockers, nor automatically closed P2 details: their
game-useful significance was independently reassessed on the 1,278-claim
bundle: no substantial residual family gap was confirmed under the approved
reconstruction criterion; bounded limits remain in the macro-gap audit.
Counts and a filled matrix
do not prove completeness of the map or world.

All 1,497 archive files retain their dispositions. The expanded vector
package contains **4,582 x 1,024 float32 entries (18,767,872 bytes)** and
uses the existing `wk-embedding:giga-480m-0826:v1` profile. No model or
dependency version changed.

## Checks actually completed on the 1,392-claim corpus

- Compiler: all 1,392 claims and independent approval bindings validate.
- Category-cartography and open place-first structural validation pass.
  Structure is not evidence of environmental completeness.
- Focused authoring/runtime/population/foundation/cartography tests:
  **95/95 pass**: 47 authoring/runtime/foundation/fauna/cartography checks,
  then 48 population checks after vector generation, including exact
  candidate, independent approval and vector alignment.
  Earlier knowledge-source/RAG checks remain **26/26 pass** on unchanged canonical inputs.
- **320-case** gameplay retrieval benchmark: hybrid Recall@10 **0.996354**,
  Recall@20 **0.997917**, gate PASS.
- Unchanged **133-case** baseline: hybrid Recall@10/20 **0.969925**, gate PASS.
- Both retain hard-constraint recall and applicability precision **1.0**.
  No gate, model, dependency or runtime owner changed.
- Knowledge-source generation/check and documentation/activation checks pass
  after synchronizing the changed contract/index and existing retrieval-policy pin.
- Category/place-first tests were rerun after the 41-environment map merge.
  Every published integration must pass its own exact-HEAD CI; the live
  result is recorded on PR92 rather than inferred from this pre-push report.

The mixed ordinary-dispute probe still misses two relevant soft premises in
top 20; an aggregate pass is not perfect recall. Three new positive probes
initially omitted required material/moisture/temperature/process context.
Their fixtures now supply that stated hypothetical context and also test
rejection when it is absent; neither production filters nor claims were
changed to force retrieval. A kinship probe's
incorrect widow-claim expectation was corrected to the actual kin-help
premise after reading the claim text; neither corpus nor gate was changed
to force that result.

The latest confirmed green CI checkpoint is
`5f04867590c5b463f0eaa02e654672f910d67964` (run 33966291360).
Earlier checkpoints `869a6273` and `effe3f52` failed full CI. The first exposed
a broad storage/fish/grain top-12 probe whose fish-as-food premise fell to
rank 13 after corpus growth; the latter also exposed the stale normative
retrieval-policy manifest pin after the mixed-sampling contract edit.
The storage and food needs now have separate bounded acceptance queries:
all original claim assertions remain, with no larger budget, injected refs,
ranking change or gameplay-owner repair. Independent Contract Auditor
`/root/mixed_sampling_contract_audit` confirmed PASS for that decomposition.
The existing policy pin was synchronized with the actual manifest; its
fail-closed check was not weakened. Local bridge tests pass 11/11 and
knowledge-source tests pass 40/40; documentation and diff checks pass.
The full local npm test rerun passed on the 1,319-claim state, with seven
reported skips; full CI passed on exact checkpoint 6179c39e. The subsequent
1,322-claim integration passed the 85 focused tests, 11 bridge tests and
both retrieval benchmarks. Its run 33958500338 was cancelled by the next
checkpoint push, not reported green. The B10 candidate checkpoint
`f164358f3b451d4d03904f0e41ee0fc1f616215f` had run 33959027728 cancelled by a later push.
The 1,330-claim integration passed its focused checks; run 33959687474
was cancelled, not green. The 1,365-claim place-first integration passed
full CI at a680ccbc. The 1,374-claim integration passed full CI at 84acd120.
The 1,384-claim integration passed full CI at 5f048675. The later 1,392-claim
integration has the same exact-HEAD CI requirement, tracked separately on the PR.
An earlier green checkpoint does not certify a later
candidate or merge readiness.

## Offline context acceptance — not live gameplay

**Current method:** 75 stratified cases plus 25 independently generated
free/adversarial cases per hundred. The free generator sees no domain list,
corpus, cartography, prior examples or stratified inputs. Reviewers assign
open-ended domains only after free inputs are fixed; unfamiliar domains
must not be discarded or coerced into the old twenty. Stratified areas and
their granularity rotate, with at least 60 practical/natural/physical cases
in the controlled 75. Both sampling components and actual domain findings
are reported. Earlier fully stratified batches are retained as diagnostic
baselines, not mixed-method acceptance. The mixed clean streak is **0 of 3**.

Independent Contract Auditor `/root/mixed_sampling_contract_audit` returned
`PASS_WITH_NOTES` for this method change: no new runtime owner, whitelist,
authority or gameplay activation. Its required manifest/derived-document
synchronization was completed; knowledge-source and documentation checks
were rerun. Batch inputs and post-generation classifications remain ordinary
offline artifacts, not a new runtime framework or integrity ledger.

Two independent generators supplied 50 unseen situations each for batch 01,
covering diverse people, work, places, relations and circumstances. This is
stochastic LLM sampling, not a seeded uniform statistical world sample.

The original template-based batch-01 review was rejected and replaced by
four concrete 25-case independent reads. They identified one substantial
gap, ordinary healer work, now addressed by six independently approved
editorial premises and three retrieval probes. The apparent requirement
for exact ski-fragment behaviour was correctly treated as unspecified
contact geometry, not a missing special-case fact; no ski handler or
fixture-specific production claim was added.

Batch 02's four independent reads cover 100 further cases and report no
substantial gap. **Neither batch 01 nor batch 02 counts toward acceptance**:
they predate explicit discipline-balanced sampling, and many cases place
technical objects in social dilemmas without testing the underlying process.
They remain useful diagnostic records, not whole-world coverage evidence.

Batches 03–08 used 20 declared primary knowledge
areas with five cases each: 80 practical/natural/physical and 20 social or
institutional. Each case records its actual knowledge need. Reviewers must
check substantive diversity, not merely labels or objects mentioned.
The partition controls sampling only; it is not a closed world vocabulary.

Batch 03 now has 100 unique cases and 100 independent case reviews. A
structural check confirmed all 20 declared areas have five cases, all cases
state a knowledge need, and every cited claim exists in the reviewed
1,228-claim bundle. The substantive review nevertheless rejected seven
primary labels: `b03b-037`, `039`, `041`, `042`, `043`, `046`, `048` are
primarily structural, physiological or acoustic questions despite their
institutional, family or religious setting. **Batch 03 is diagnostic, not
a clean acceptance batch.** Future generators must make the required
knowledge central to the question, not just count people, objects or tags.

Reviewers reported 36 raw gap cases. These are leads, not 36 proven missing
families: secondary full-bundle reads already recover drying, wood repair,
wet-ground support, cooking, snow cooling, wedge splitting and plant
identification from general premises. Conversely, measurement/tare,
grain comminution, sound propagation and conditional independent trials
needed new general knowledge. The candidate-only checkpoint
`ce8f135152accb0fe35ed488371a4c9846f64b25` contains 32 proposed premises
across process, food/biology and measurement/sound/milling fragments. They
and 18 further practical/household/cleaning premises are now independently
approved and included above. The latter candidates are `17077c7` (corrected
practical and household bindings) and `c2f0c69` (cleaning mechanisms).
Independent source review corrected two bibliographic attributions,
beresta section anchors, an unclear plaster term and overbroad trauma
evidence/qualifiers before promotion. Unchanged premises were not sent
through redundant review chains.

The 36 raw leads resolve into 13 compositional/over-specific questions and
23 cases addressed by the newly reviewed general knowledge. In particular,
ambiguous smoke does not require a unique colour diagnosis; fresh fish
does not require an exact price or guaranteed shelf life; a cracked loaded
foundation does not require a guaranteed in-place repair. No special-case
recipe or gameplay handler was added. This is diagnostic gap disposition,
not an unseen acceptance result.

Batch 04 has two new independent 50-case inputs under the same stratified
rules and 100 WK-only context reviews against the 1,278-claim corpus.
All 20 declared areas contain five cases; reviewers report no substantive
domain mismatch. IDs and cited refs were checked. However, initial gap
reports falsely claimed existing lever, sharpening, wool, lime and
fermentation knowledge was absent. Those findings were corrected against
the full bundle, not used to add duplicate facts. Independent secondary
review by `/root/context_review_b01` resolved the nine remaining practical
leads through existing premises and cautious composition. The attributed
case answers retain limits; neither special recipes nor guaranteed outcomes
are required. The corpus was unchanged throughout this batch.
**Batch 04 is the first clean acceptance batch: 100 cases, no substantial
new gap after full-bundle triage.** This does not prove whole-world coverage.

Batch 05 contains another 100 independently generated, stratified cases.
Four reviewers read 25 each. Review quality checks corrected three answers
that initially described the wrong input circumstances and rejected several
false absence findings by looking up existing general premises. Genuine
remaining needs include wet-ground support, equine digestive distress,
large-ungulate track differentiation and plant-material/contact context.
Source investigation produced 17 premises in three fragments, now separately
verified and included in the descriptor/runtime. Candidates are `a2548c2`
(animal/plant) and `5a9d969` (corrected ground/material). The independent
review rejected two initially overbroad compound claims: birch chemistry
is now limited to studied Betula pendula material, and fibre/alkali behaviour
to the comparative study, not an assertion of safe cleaning.

The final eight raw case leads cover wet-ground passage and flooded ground,
groundwater in an excavation, bark/fuel context, alkaline textile response,
hoof-trace comparison, equine digestive distress and plant contact/bedding.
The new general premises supply those missing relationships. Observation
of a vanished channel, a guaranteed safe route or a fixed fresh-bark ignition
result still cannot be inferred from an underspecified scene; these are not
new recipes or local facts. **Batch 05 is diagnostic and resets the streak
to 0**, not acceptance after its gaps were used to fill the corpus.

Batch 06's two generators were blind to the corpus and previous samples.
Their new 100 inputs were not used to author the 17 additions. Independent
WK-only reviews use the frozen 1,295-claim bundle. Structural checks confirm
100 unique inputs/reviews, 20 primary areas with five cases each, valid cited
refs and no reported substantive domain mismatch. After full-bundle triage,
reviewers report 85 covered cases and 15 remaining raw gap leads, principally
animal observation, plant care/storage, human physiology and weather cues.
These are investigation leads, not 15 proven missing families. Source work
produced 24 general premises in animal, plant, human and weather/trace
fragments. Their candidate commit is `51fb61efc5c99540b50c2099cc21ca08e7630e8f`;
four separate source/domain reviewers approved them before runtime inclusion.
Review narrowed a frost statement to the crops actually studied, restricted
mushroom disturbance to supported habitat damage, and corrected a source
title and a Russian consciousness term. General relations remain distinct
from exact diagnosis, specimen identification, crop-specific frost thresholds,
weather forecasts or local state. The source-filled batch remains diagnostic,
not retrospective unseen acceptance. It does not increase the clean streak.

Batch 07 has another two blind 50-case inputs under the same diversity rule.
Those inputs were not used to author the 24 additions. Independent WK-only
reviews used the frozen 1,319-claim bundle. All 100 cases are covered after
full-bundle triage, with 20 primary areas of five cases and valid cited refs.
Seven initial absence findings were corrected against existing metal,
fibre, bond-contact, fermentation and beaver-sign premises; their initial
statuses remain in the review records. The public-work coordination case
was reassessed as a social/public-safety need, not a mechanics calculation.
No corpus change followed these reviews. **Batch 07 was clean under the
former fully stratified method**, not the subsequent mixed acceptance rule.

Batch 08's fixed-strata inputs had already been generated when the user
identified the closed-test blind spot. They are retained without WK review;
they cannot count toward the new series. Batch 09 starts the mixed method.
Its generated inputs contain 75 controlled cases across ten independently
chosen, unevenly sized strata and 25 free/adversarial cases from a separate
generator. Counts, distinct IDs and the controlled 60 practical/natural/
physical cases were checked. The free inputs have no preassigned domain or
knowledge-need fields. All 100 now have WK-only reviews: 74/75 controlled
and 25/25 free cases are covered under the permitted reconstruction rule.
The free reviewer froze open-ended classifications before reading WK.
These are case labels, not automatic discoveries of missing cartography
families. Root triage corrected unsafe priorities, overclaimed inscription
identity and an assumed mill-gate direction in the review answers without
changing inputs, classifications, corpus or game owners.
One substantive controlled-case need was found: the qualitative effect and
limits of smoke during honeybee colony handling (`b09core-054`). Narrow
source-backed candidates in commit 6636736d received separate source/domain
approval from `/root/mixed_sampling_contract_audit`. All three are now
integrated with existing per-claim bindings, the invertebrate family and
aligned vectors; two new bilingual retrieval probes pass. Separate
Arizona and Tufts evidence records support the two parts of the handling
limit. Batch 09 remains diagnostic, not unseen acceptance after its fix.

Batch 10 contains a newly chosen uneven 75-case core (62 practical/natural/
physical, 13 social/institutional) and 25 independent free cases. Its four
reviews cover all 100 frozen inputs against 1,322 claims. After full-bundle
triage, 96 are covered and four substantive needs remain: rendering animal
fat, lightning-storm precautions, wet parchment/ink preservation, and
thermal-burn care. Of 28 raw leads, 24 required existing general premises
or permitted practical reconstruction, not a new named-case rule, exact
local norm or guaranteed outcome. Initial findings and triage notes remain
in the review files. Eight independently verified premises now cover those
four needs in the 1,330-claim corpus, with candidate commit `f164358f`
and separate source/domain reviewers. The overbroad generic wet-record
claim was removed before candidate publication; the UMN rendering source
was independently read through its primary-PDF search extract after a
direct-access 403. Batch 10 remains diagnostic, not unseen after its fix.

Batch 11 freezes another 75-case core (63 practical, 12 social, seven
unequal strata) and 25 independently generated free cases before review.
The free classifications were frozen before WK lookup and remain unchanged.
All 100 cases were reviewed on 1,330 claims: 97 covered, three substantial
needs retained: ruminant bloat after legume forage, mould/mycotoxin feed
risk, and mollusc/animal-material bait suitability. Thirteen raw leads
were triaged: ten needed existing general premises rather than a named
rescue procedure, guaranteed result, impossible diagnosis or exact local
norm. Initial findings and attributed reasoning remain in the reviews.
Conditional frame cautions for inn terminology, a donkey and unspecified
letter carrier are retained, not silently rewritten as historical facts.
Targeted source work continues; mixed clean streak remains 0/3.

Contract §0.3 requires three consecutive diverse independent mixed batches
of at least 100 cases with
no substantial new gap; a gap resets the streak. Replayed or imbalanced
cases cannot count as unseen acceptance. Missing exact names, figures,
legal powers or equally plausible ordinary variants are not by themselves
substantial gaps.

## Boundaries preserved

This work is static authoring, verification, cartography and offline WK
retrieval/context evaluation. It starts no live gameplay campaign and
repairs no inventory, ownership, materialization, persistence, body, combat,
NPC, narration or spatial owner. WK remains read-only grounding; it does
not create current state, canonical authority or exact mechanics.

The Gameplay Gap Auditor remains the target architecture for a separately
authorized gameplay-testing phase. Offline context sampling is not gameplay
saturation and cannot certify it. Earlier readiness snapshots and verdicts
are superseded; their history remains in Git.

## Future-testing finding: unowned ordinary item -> action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair
  scope.
- Prior trace: `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`.
  Local retained reports are not published evidence.
- Symptom: an unowned ordinary runtime item was excluded by the ownership
  join before action-production commit. No compression, shaping, placement
  or narration result committed.
- Correct owner: action-production / items-property and persistence
  handoff, not World Knowledge or retrieval.
- Disposition: retain for a separately authorized gameplay-testing task;
  do not repair or replay it within this static phase.

## Place-first static pass — open, not accepted

Contract §0.4 adds an independent place-first need-map rather than an object
whitelist or a second materializer. A blind author first mapped 37 settings;
independent/root review added dwelling and church interiors, an ordinary
workshop and a grain-drying shed distinct from the threshing floor.
The present map has **41 environmental families and 167 facets**:
110 bounded supported and 57 partial on the 1,392-claim corpus.
Twelve stale residuals were resolved against existing full-text premises
and independently checked by /root/place_scene_b; the drying/heat facet
now links the separately approved process premises. Partial facets retain
specific remaining relations; an approved link alone did not close them.
These are provisional mapping assessments, not a place-completeness verdict.
The map remains open to new families and cross-place composition.

A subsequent independent full-text review by `/root/place02_publish`
confirmed five more bounded closures using existing premises: wharf work
signals, lake-shore use/traces, hay drying, dwelling warmth/damp and indoor
biota. It rejected closing the whole winter-perception facet: drift,
visibility, twilight and overwritten tracks are linked, but qualitative
snow-surface sound and visible cold-breath cues remain a narrow P2 need.
No new claim, exact threshold or scene state was invented for these closures.

The independent content review found that a courtyard does not cover a
dwelling interior, and a churchyard does not cover an interior. Root also
rejected premature support from generic waste/paving refs and removed
current people, stocks, depths, access and maintenance history from factual
gap requirements. Remaining gaps concern general environmental relations;
scene-state limits do not excuse missing knowledge of how a place works.

Candidate `818d85f72e350624a91162a30cd3ad78d5c26663` supplied 28 explicitly
editorial premises for outdoor conditions, interiors and work environments.
Independent reviewer `/root/place_premise_verifier` approved all 28.
Compiler validation then caught four interior domain/applicability mismatches;
metadata-only candidate `fbdeb1cb205a6edc7deae3b416be25f4d0a28c1f` corrected
them and received the same reviewer's separate narrow approval. No claim
text or evidence changed during that correction. All 28 bindings now pass
on the assembled production input and are included in the 1,365 count.

Two blind generators froze 75 controlled inputs (71 labelled practical)
and 25 free inputs in `60b12063f93411b5308e741498e9d9b6cd2ccdec`. Four WK-only
reads now cover all 100 IDs: 96 covered and four retained knowledge leads.
The free domains were recorded after generation and before corpus lookup.
This is a diagnostic batch, not a clean acceptance hundred; the streak is
still 0/3. Root rejected advice-only/givens-only coverage and requested
fuller environment grounding. A reported mill gap was resolved against
existing approved relations, with its initial finding retained.

The first batch's retained leads were: `place01-core-010` hide washing/working effluent;
`place01-core-015` birch-tar pit process/environment;
`place01-core-055` drying-shed heat, sheaf placement and air path;
`place01-core-061` smoking fish versus drying/heating/salting.
Exact recipes, fixed layouts and present stocks are not required to close
these relations. Nine independently checked premises now address these
four needs: wet-hide washing/residues and water separation, combined fish
smoking, birch-tar heating/collection, and drying-shed heat/air/sheaf layout.
The poorly worded threshing/dust sentence was corrected and independently
reviewed; no gameplay owner was changed.
Candidate 71199d0 received eight new-claim approvals and the changed drying
approval. The hide-preparation claim was initially rejected for insufficient
bound evidence; f4a9f01b binds the checked EPA primary source and received
a narrow approval. d89f2004 limits the water-separation premise to its
Novgorod 1200–1300 editorial context and received metadata-only approval.
All current per-claim bindings and generated bundle validate. Replaying
these known cases does not turn the first batch into a clean unseen sample.
Inputs with questionable specific props retain frame caveats rather than
silently becoming historical availability evidence. Earlier general batches
and the unfinished general B12 work do not replace this place-first pass.
No live gameplay was run.

## Second place-first unseen batch — diagnostic

Inputs were frozen at `d89f2004f5d55e7262f60192c932e260d5a85c1c` before
WK-only review against the 1,374-claim bundle. Independent blind generators
supplied 75 controlled cases and 25 free cases. The controlled set contains
60 practical/natural/physical and 15 social/institutional needs: agriculture,
craft, food, storage, construction, transport, materials, water, heat,
weather, plants, animals and bodily constraints occur alongside social life.
Its 75 primary labels are open sampling annotations, not 75 proved domains
or a replacement whitelist. Free domains were classified after input freeze,
before review-specific corpus lookup; no social quota was imposed on them.

Three independent reconstruction agents completed the controlled cases;
one also reconstructed the separately generated free set. Final controlled
results are 71 covered and four retained process needs; free results are
25 covered. Full-scene answers, practical interactions, variation and actual
claim references are retained in the four `place-batch-02-*-review.json`
files. These are qualitative compositional checks, not statistical proof
that every environment or variation is covered.

The remaining leads are `place02-core-006` (orchard pruning/injury and
seasonal care), `015` (wet cut peat, working faces and drying), `024`
(milk curd formation and straining), and `055` (dye-bath cooling and
dye uptake/fixation/evenness). They require qualitative process relations,
not guaranteed outcomes, exact safe limits, recipes or diagnosis of a
particular scene. Initial kiln, charcoal, well, mill, wax and masonry
findings were narrowed or resolved against existing full-text knowledge;
the corpus was not changed during review to force a clean result.

Root spot-checks also corrected irrelevant citations and distinguished
hypothetical input props from historical prevalence. Counts do not excuse
unsupported scene statements. This second hundred is diagnostic: new
substantial leads leave the clean unseen streak at **0/3**. No live gameplay
or gameplay-owner repair was performed.

## Orchard, peat, milk and dye follow-up

Ten useful process premises were independently approved by
`/root/place02_publish`: six milk/dye claims frozen at
`5bcfb2d6776e39ea31c68dc6913c9c87d20e7e1c`, and four orchard/peat claims at
`355305bb4707f744e7e9e1a51777ae506c88c6a6`. Authors were
`/root/place03_milk_dye` and `/root/place03_plants_peat`, with root editorial
integration. Existing verification notes and bindings record source access,
qualifiers and limits; the peat reviewer read the official indexed USGS
excerpt after the full PDF fetch failed. No additional approval mechanism
was introduced.

The additions explain acid/enzyme curd formation, curd–whey separation and
permeable straining; preparation, bath-to-fibre transfer and distributed
contact in dyeing; branch-collar protection, conditional pruning windows
and staged canopy renovation; and exposing already-cut peat by turning or
loose stacking during drying. Tautological state/weather claims and a
duplicate cooling disclaimer were removed before candidate freeze.
The material and process qualifiers do not establish a local peat industry,
a medieval chemical recipe, a universal seasonal calendar or a safe outcome.

Independent WK-only known-case replay by `/root/place02_scene_a` found the
four retained batch-02 needs composable on the 1,384-claim bundle:
006 uses the three orchard premises; 015 combines the peat-drying premise
with hydric-soil and wet-ground trafficability; 024 composes the three milk
premises; 055 combines dye application with transfer, preparation and
distributed contact. The original 96/4 unseen results are unchanged.
This is regression evidence, not another unseen hundred: the streak stays 0/3.

## Third place-first unseen batch — diagnostic

Two independent generators froze `place-batch-03-core.json` (75:
60 practical, 15 social) and `place-batch-03-free.json` (25 blind free)
at `5f04867590c5b463f0eaa02e654672f910d67964`. Before freeze, the original
generators corrected nested axes and insufficient means/wealth detail
without reading WK or matching answers. Core strata have 75 open labels,
12 overlapping the preceding core's labels; these are sampling annotations,
not proved world domains. Root classified the 25 free cases before WK lookup;
all concern practical/natural/physical situations, without an imposed quota.

Three independent agents reconstructed the controlled set using only the
frozen 1,384-claim WK; root reconstructed the independently generated free
set. All 100 concrete scene/interaction/variation answers and valid claim
references are retained in the four `place-batch-03-*-review.json` files.
Final diagnostic results are **92 covered and eight retained knowledge gaps**:
030 hoop/stave fit, 045 settling/cloth filtration, 050 wick/soot,
066 funeral carrying/passage, 068 established monastic distribution,
070 household goods during family formation, 071 requested convoy inspection,
and 075 a locally agreed temporary watch. Initial findings and grounding
corrections are preserved. Existing combustion, clay/lime and ordinary queue
coordination resolved other leads without adding unnecessary facts.

Five bounded editorial community premises at
`d5f59193a450415492c23b938faa6850ebe29828` and three modern-source practical
premises at `a7fd3e4c2941cf07e7efa25f9647df5d3c179378` were independently
approved by `/root/place02_publish`. Actual source-access limitations and
reconstruction limits remain in the verification notes. The earlier
`35036257` community candidate had an invalid domain and is not an approval
basis; the valid corrected candidate is used in every binding.

These additions do not establish a ritual, entitlement, official authority,
present stock, medieval recipe, safe water, universal wick setting or
successful repair. They support useful ordinary composition through the
existing WK owner. Known-case replay is separate regression evidence and
cannot change the original 92/8 result or the **0/3** unseen clean streak.
No live gameplay or repair of other gameplay owners occurred.

Independent WK-only replay by `/root/place04_gap_replay` reconstructed all
eight known scenes on the 1,392-claim bundle, with practical interaction,
environmental variation and bounded approved references. Its separate
`place-batch-03-known-gap-replay.json` records 8/8 covered; it is explicitly
not unseen evidence. Root corrected three reference/wording mismatches
through the original reviewer without changing the corpus or result.

A separate semantic map check replaced weak bridge/road/village references,
removed irrelevant curd and crop-specific frost citations, and linked these
new process/community premises. Stale wall-edge and river-signal residuals
were closed through existing knowledge; winter breath/snow sound, generic
garden frost response and other bounded residuals remain explicit. The map
now contains **41 open environmental families, 167 facets: 110 supported and
57 partial**. These counts describe a revisable map, not a completeness proof.

Two blind generators prepared the next 75 controlled and 25 free inputs in
`place-batch-04-core.json` and `place-batch-04-free.json`. Before freeze they
normalized IDs and changed maintenance advice/actions into descriptions of
actual upkeep, without reading WK or adapting situations to answers. These
inputs are frozen with this checkpoint; classification of the free set and
all new WK-only reconstructions follow separately. No clean result is claimed.
