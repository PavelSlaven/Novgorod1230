# PR92 — static coverage phase, 2026-09-04

## Governing scope clarification

The user's September 4 phase clarification supersedes the prior task's live
exploration/repair loop and three-unseen-campaign acceptance requirement for
this phase. Current work: architecture contract, need-first cartography,
maximum systematic static source-backed corpus, independent per-claim
verification, aligned indexes/vectors and retrieval benchmarks. Gameplay Gap
Auditor remains target development/testing architecture for a separate phase.

No further live campaigns, saturation attempts or gameplay-owner repairs are
authorized by this static phase. Existing runtime integration and already
published fixes are not silently reverted. Exact final HEAD CI remains a merge
gate. Earlier audit reports are historical snapshots, not current acceptance.

Baseline at `047c10247059b324f9ef3c1ded958b06f8ae7410`: 906 production claims,
120 classified families, 14 broad need-map dimensions. These counts do not
prove completeness. Current priority is to find missing families independently
of those inventories, including potential open-RPG consumers not implemented
in the present scenario. Static readiness is not yet declared.

## First static expansion

The existing cartography now records 25 additional need families: seven
natural-science gaps from independent source-oriented research and eighteen
social/historical/household/craft needs from a separate need-first review.
The latter are `partial` pending claim-level reconciliation, not assertions
that all related facts are missing. Existing family support is linked, but
related support alone does not close the new need. `potential:` consumer refs
are explicitly design contexts, not active runtime bindings or new APIs.

This adds no production claims and changes no vectors or retrieval inputs.
The first exposure/water research candidates remain outside the production
descriptor until committed-candidate independent source/domain verification.
Cartography structural test passes; it is not a completeness verdict.

Independent reconciliation of the first six social/economic needs found
substantial existing support, not six empty corpus areas:

- Possession/title: `claim:rp-property-claim-relates-acquisition-chain`,
  `claim:rp-market-purchase-relates-proof-participant` and
  `claim:rp-entrusted-goods-claim-relates-reference` cover bounded textual cases,
  not a universal or locally activated title rule.
- Credit/debt: `claim:debt-needs-parties-and-basis`,
  `claim:social-loan-request-relates-loan` and
  `claim:social-guarantor-relates-transaction-obligation` support documented
  obligations; general pledge/default terms remain a distinct research need.
- Procedure: the market/deposit claims above and
  `claim:social-authority-letter-relates-theft-inquiry` support narrow cases,
  not a universal proof hierarchy or Novgorod-1230 court procedure.
- Locality/status: `claim:later-novgorod-judicial-charter` expressly excludes
  using a later charter as a procedure source for 1230. Missing local evidence
  cannot be filled from that document or modern law.
- Exchange: `claim:social-grivna-accounting-unit`,
  `claim:social-daily-fur-sale-accounting` and
  `claim:social-payment-register-records-entry` support accounting context,
  not commodity prices, conversion ratios or transaction finality.
- Seasonal logistics: `claim:transport-winter-sledge-1220`,
  `claim:transport-sledge-summer-cargo`,
  `claim:transport-boat-cargo-dispatch` and
  `claim:stored-grain-condition-depends-on-temperature-moisture` support
  bounded transport/storage relations, not a universal provisioning calendar.

The next authoring step must isolate residual factual relations. Actual title,
debt balance, testimony, judgment, prices, inventory, route condition and
dispatch schedules remain code/state questions, not new corpus facts.

## Static exposure and household increment — checkpoint d872afdc

The next production increment contains six independently approved premises:
fuel combustion can produce carbon monoxide; CO can accumulate indoors;
cold-water immersion can cause hypothermia; stitching can support weakened
textile; failed stitching can separate components of a leather assembly; and
household boiling alone does not establish drinkability of chemically
contaminated water. The last premise is a treatment-evidence boundary, not a
universal physical impossibility of removing every chemical.

The corpus now has 912 claims, 703 concepts, 297 sources and 585 evidence
records. Cartography classifies 124 families across 15 broad need dimensions.
These are inventory counts, not a completeness verdict. General aquatic
temperature/oxygen relations are compositionally closed by existing claims;
taxon-specific requirements are not claimed to be exhaustive. There remain
33 missing/partial need families requiring reconciliation or further research.

Verification reports are `verification/static-exposure-water-v1.md` and
`verification/static-household-water-v1.md`. The compiler consumes one
independent APPROVE per promoted claim, bound to committed candidates. The
metadata-only removal of stale draft prefixes is separately rebound against
candidate `a060f68f0fcfe030ddd6dbdeca682c362c06a8f9`; it does not alter the
scientific premises or their translations.

Not promoted:

- A heating-water/microbial-inactivation candidate duplicates
  `claim:heating-reduces-microbial-viability`.
- The earlier absolute boiling/chemical-removal wording is NEEDS_REVIEW and
  is superseded only by the separately verified narrower candidate.
- Raw-food transfer via hands/utensils remains NEEDS_REVIEW: the independent
  reviewer could not retrieve the full USDA anchor. This is a source-access
  limitation, not proof that the relation is false.
- At that checkpoint, five environment proposals were research-only. Their
  subsequent independent verification is recorded in the next increment below.

The static retrieval benchmark adds nine bilingual probes to the existing
12-query coverage set. These are offline retrieval queries, not live gameplay
campaigns, replay or saturation evidence. Final exact-HEAD CI and full static
completeness acceptance are still separate gates; this increment does not
declare the PR ready to merge.

Increment checks: strict compilation and 138 focused tests passed across WK
authoring, production approval bindings, archive dispositions, cartography,
runtime retrieval and documentation retrieval. Production checks resolve each
candidate Git object and verify the exact compiled bundle and embedding-entry
list. Documentation/knowledge-source checks and `git diff --check` passed.
The flat index was rebuilt with the unchanged pinned model: 3,230 entries,
1,024 dimensions, 13,230,080 bytes. This test set is not the full CI suite.

## Static environment, memory and physiology increment

All five environment candidates from committed candidate `d872afdc` now have
independent APPROVE entries in `verification-static-environment-v1.json`.
Three USGS premises were checked by `/root/claim_verifier/troitsky_primary`;
two NWS premises were independently checked by `/root/smoke_source_verifier`.
The earlier NWS NEEDS_REVIEW was a source-extraction limitation, superseded by
the exact glossary and PDF passages, not bypassed or silently treated as approval.
See `verification/static-environment-v1.md` and
`research/static-smoke-independent-verification-v1.md`.

The environmental additions are sediment freeze–thaw, flood-mark types,
porous-stain corroboration, atmospheric smoke transport and surface-inversion
smoke retention. They do not establish any current bank, flood, measured level,
weather, plume, concentration, exposure or safe location.

Candidate checkpoint `d4b5568245c6ed4708deb49f01d2706e11705003` separately
contains six physiology and three memory/group-work candidates. All nine now
have independent APPROVE entries and are included in the descriptor. The
orienting-response source publication year was corrected in candidate
`b6244d51bb7b83cd86e5a30687ddd26dd06158e5`; its verifier approves that version.
See `verification/static-human-physiology-v1.md` and
`verification/static-memory-social-v1.md`. Each claim retains one independent
approval; no additional approval tier is introduced.

The corpus contains 926 claims, 714 concepts, 309 sources and 599 evidence
records. Strict compilation and cartography validation pass. Current work
follows the user's game-focused evidence standard:
reliable source, useful factual relation, clear applicability limits and one
independent verification, without additional proof layers or formal re-audits.

Need-first ecology reconciliation identified three additional residual families:
general fauna-trace interpretation, scoped animal infection/behaviour relations,
and general plant-herbivory effects. These are now open cartography needs, not
approved claims. See `research/static-ecology-need-reconciliation-v1.md`.
Current cartography contains 125 supported families and 36 missing/partial
families; an increased need count is discovery, not reduced data quality.

All new probes remain offline retrieval checks. No gameplay campaign, replay,
saturation attempt or other gameplay-owner repair was run for this increment.

Checkpoint checks: 138 focused tests PASS; documentation/generated artifacts,
knowledge-source controls and `git diff --check` PASS. The unchanged pinned
CPU encoder rebuilt 3,280 × 1,024 float32 entries (13,434,880 bytes).
The 133-query baseline benchmark passes with hybrid Recall@10 0.95990;
the expanded 35-query coverage benchmark passes with hybrid Recall@10 0.98571,
lexical Recall@10 0.90000, applicability precision 1.0 and hard-constraint
recall 1.0. Both retain their existing gates without threshold changes.

## Static retrieval correction after checkpoint 2663c4fa

The compound probe `water_fire_smoke_ru` exposed a lexical-admission defect:
enabling vector recall tightened the lexical tail threshold from 0.5 to 0.75,
discarding the optical-visibility premise before ranking despite available
candidate capacity. Hybrid recall now uses the same lexical admission threshold
as lexical-only retrieval. Vector recall supplements rather than narrows it.
Filters, ranking, budgets, corpus, aliases and the pinned model are unchanged.

A generic regression test failed before the correction and passes afterward;
it also checks that the candidate budget remains bounded. Both required fire/
smoke premises now occur in the compound result. The unchanged 133-query
benchmark passes with hybrid Recall@10 0.96992 and noise 0.57538. The unchanged
35-query benchmark passes with hybrid Recall@10 1.0 and noise 0.72141 (gate
0.75); applicability precision and hard-constraint recall remain 1.0. This
trades some precision for recovered lexical candidates within existing gates.
No query wording, relevance set or threshold was adjusted to hide the miss.

The combined authoring/compiler, archive, approval, cartography, vector,
runtime, knowledge-source, turn and server-grounding checks pass: 163 tests.
These are static checks, not live gameplay or full CI. No vector rebuild is
needed because the 926-claim corpus and embedding inputs did not change.
Full exact-HEAD CI remains required before merge.

## Static ecology, plant use and indoor moisture increment

The corpus now contains 937 claims, 724 concepts, 319 sources and 611 evidence
records. Eleven independently approved premises are included: footprint/substrate
interpretation, infection-associated vertebrate behaviour, conditional herbivory
effects, two indoor-moisture relations and six named plant food/contact
properties. Ecology candidates are bound to `fd555608709bc9e11647a85383f8d4bf10e825f1`;
indoor and plant candidates to `cd68250993d8be235389dd6d747578483d9e8a98`.
The existing verifier format and compiler gate are unchanged. See the three
`verification/static-{ecology-relations,indoor-moisture,plant-use}-v1.md` reports.

The plant increment concerns nettle, lingonberry, hazel, raspberry and wild
apple. Taxon/part support is not identification by resemblance, local presence
or a guarantee that a concrete specimen is safe. A North American strawberry
candidate was excluded as unhelpful for this regional need. Modern science is
not evidence of a Novgorod-1230 installation, custom or distribution.

Cartography now has 128 supported families and 29 missing/partial entries.
Seven stale entries were removed from the missing list: two newly grounded
ecological relations, aquatic functional form, basic shelter functions, storage
conditions, riparian debris and Class-A water cooling. Their supported families
and scene-state boundaries remain mapped; this is not deletion of a gameplay
need or a completeness claim. Footprint interpretation beyond substrate,
additional plant taxa and historical applicability remain bounded partial needs.
Eight additional offline probes exercise the new facts; no live campaign runs.

Further read-only need reconciliation finds concrete research directions in
watercraft handling, shelter weatherproofing, waste/contact contamination,
care/dependency and historically applicable religious practice. Existing cargo,
wood/moisture, infection-chain, kin-letter and baptism/calendar claims supply
related support, not automatic closure. Collective-work coordination still needs
separation of general factual premises from task dependencies owned by mechanics.
Speech acts and reputation do not require a universal compliance/reputation
rule: meaning belongs to the semantic boundary, relationships to state, and
asserted local customs to scoped historical evidence. Memory/source confusion
and post-event misinformation already constrain testimony; exact credibility,
knowledge and admissibility are not new universal corpus facts.

Increment checks: strict compilation, cartography validation, 163 focused tests
and `git diff --check` PASS. The unchanged pinned CPU encoder rebuilt 3,322 ×
1,024 float32 entries (13,606,912 bytes) in 261,436 ms. The 133-query baseline
passes with hybrid Recall@10 0.96992. The expanded 43-query benchmark passes
with hybrid Recall@10 0.98837, Recall@20 1.0, noise 0.71696, applicability
precision 1.0 and hard-constraint recall 1.0. Gates and existing queries are
unchanged; no benchmark threshold or relevance set was weakened.

On this larger corpus, `water_fire_smoke_ru` ranks the optical-visibility
premise eleventh. Unlike the earlier admission defect, it is admitted and
returned in the top-20 result but falls outside top ten. The fixed generic
admission regression still passes; the earlier 35-query perfect-recall result
describes its own checkpoint, not this expanded corpus. This bounded ranking
limitation remains visible rather than being hidden by query/alias changes.

These remaining directions are static work, not authorization for gameplay
debugging. Full CI succeeded for prior checkpoint `2663c4fa` (run
`33893098877`); that result does not certify later checkpoints. Read the current
PR checks for their exact commit. No final completeness or exact-final-HEAD CI
verdict is claimed here.

## Follow-up static reconciliation

Two independently approved candidates add raw-animal-food contact transfer
(FDA) and a thirteenth-century monthbook day/commemoration relation. Their
candidate commits are `be39348f` and `11940d7b`; both use existing source/domain
verification, with no new proof layer. Production now contains 939 claims,
726 concepts, 321 sources and 613 evidence records. Both claims fit existing
families: 128 supported families and 29 bounded missing/partial needs remain.
Five added offline probes cover these facts and reused runoff, hull-caulking
and conditional child-care premises. No prior query, relevance set or gate
was weakened.

The proposed waste-to-water gap already has direct support in
`claim:foundations-earth-26-runoff-contaminant-transport`: surface runoff can
carry sewage into rivers/lakes where contaminants are present. Cartography
now links that existing premise and its hydrology family. It is not a new
claim or a new source approval. Food/contact transfer is separately grounded
by the independently approved FDA candidate; actual pollution and illness are
not supplied by these premises. Asserted local sanitation customs remain scoped
historical questions.

Likewise, existing bounded comparative hull-caulking evidence and Extended
Russkaya Pravda care/succession passages already support narrower aspects of
boat maintenance and household dependency. Cartography now links them rather
than demanding duplicate general claims. Neither a universal hull-care routine
nor enacted Novgorod-1230 law follows from this reconciliation.

The requested codebase-design check preserves the existing Interface:
authoring/verification inputs enter the internal compiler, while gameplay
callers and tests use `resolveWorldKnowledge`. Corpus additions do not add
methods, a parallel resolver, a new Adapter or caller-owned evidence logic.
Existing filtering, ranking, access limits and bounded results stay in the
same Module; no architectural refactor is needed for static filling.

Increment checks PASS: strict compilation, 163 focused tests, cartography and
`git diff --check`. Pinned CPU vectors are rebuilt as 3,330 × 1,024 float32
entries (13,639,680 bytes; encoding 256,692 ms). Both unchanged benchmark gates
pass: 48-query coverage Recall@10 0.98958, Recall@20 1.0, noise 0.71311,
applicability and hard-constraint recall 1.0; the 133-query baseline Recall@10
is 0.96992. The smoke-visibility premise remains rank 11 in the mixed probe.
This is a static checkpoint, not final completeness or exact-final-HEAD CI.

## Future-testing finding: unowned ordinary item → action production

- Classification: `CODE_MECHANICS_GAP`, P1, open; outside static WK repair scope.
- Evidence: prior actual trace
  `gameplay-gap-50037af3-6cb8-4e9e-a89e-a3d29b30d2d8:trace:0`;
  local retained report `tmp/gameplay-gap-regression-v3-21/independent-audit.md`
  and raw campaign artifacts. These local paths are not published evidence.
- Symptom: both attempts rejected before commit with
  `ACTION_PRODUCED_ITEM_GAP`; repaired semantic plan retained the held source
  and action. No compression, shaping, placement or narration result committed.
- Read-only DB observation: the O2a-created runtime item exists, active and
  held in the actor's hands, with `legal_status: unowned_ordinary_runtime` and
  no `party_ownership` row. A1 committed-context loading uses an ownership
  inner join and excludes this item. Absence is not proof of an actor owner.
- Correct responsibility: action-production / items-property and persistence
  handoff, not factual corpus or retrieval. Wet-granular premises were delivered.
- Independent contract analysis: O2a public-ground source basis does not grant
  ownership. Never manufacture a character/party/external owner to unblock it.
  Any later repair needs an explicit coherent no-ownership contract and tests
  through loading, admission, output authority and persistence.
- Disposition: retain for a separate gameplay-testing task. No ownership fix or
  replay is performed in the present static phase. This is not evidence of
  gameplay readiness and does not justify expanding PR92's current scope.

Other previously captured live findings remain historical testing material;
their replay/saturation labels are not current static completion requirements.
