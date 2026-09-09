# Independent verification — static exposure and water candidates v1

## Scope and method

This is an independent source and domain review of the five claims in
`git:ac49d74220b81ef338701a98d045579a9858c3de:data/world-catalogs/novgorod/world-knowledge/research/static-exposure-water-candidates-v1.json`.
The reviewer did not author the candidate. The three CDC/NIOSH pages below
were opened directly with the required browser harness on 2026-09-04. This
report neither activates the research fragment nor establishes scene state,
historical practice, exposure, diagnosis, or outcome.

## Source anchors checked

- CDC, [About Carbon Monoxide](https://www.cdc.gov/carbon-monoxide/about/index.html), “What it is” and “Reducing risk.” It says CO occurs in fumes when fuel is burned, and that it can build up indoors. This supports only the two qualitative CO relations.
- CDC/NIOSH, [Cold-related Illnesses in Workers](https://www.cdc.gov/niosh/cold-stress/about/related-illness.html), “Immersion hypothermia from cold water.” It identifies cold-water immersion as causing immersion hypothermia. Its comparison with ordinary hypothermia is not retained.
- CDC, [Household Water Treatment](https://www.cdc.gov/global-water-sanitation-hygiene/about/about-household-water-treatment.html), “Ways to make water safe — Boiling” and overview. It says boiling/heating can kill disease-causing viruses, bacteria, and parasites; it also distinguishes fuel/toxic-chemical contamination as not made safe by the listed household methods.

## Per-claim verdicts

| Candidate | Verdict | Basis and strict limit |
| --- | --- | --- |
| `claim:research-fuel-combustion-can-produce-carbon-monoxide` | APPROVE | Direct CDC support. No particular fuel, fire, production rate, indoor setting, exposure, symptom, or result follows. |
| `claim:research-carbon-monoxide-can-accumulate-indoors` | APPROVE | Direct CDC support. “Indoors” does not establish an actual enclosure, ventilation, concentration, duration, person, or poisoning event. |
| `claim:research-cold-water-immersion-can-cause-immersion-hypothermia` | APPROVE | Direct CDC/NIOSH support. No water temperature, duration, clothing, body state, impairment, injury, survival, treatment, or comparison is supplied. |
| `claim:research-heating-water-can-kill-disease-causing-germs` | REJECT | The CDC wording supports the sentence, but it is not a needed separate production premise: active `claim:heating-reduces-microbial-viability` already covers the qualitative heating-to-microbial-viability relation with no safety guarantee. The candidate’s water/pathogen wording adds no operationally independent rule; do not promote a duplicate. |
| `claim:research-boiling-does-not-make-fuel-or-toxic-chemical-water-drinkable` | NEEDS_REVIEW | CDC supplies household-water-treatment safety guidance: boiling does not establish potability for water with the named contaminant classes. The candidate instead reads as a universal physical impossibility for every toxic chemical, concentration, and process. A revised committed candidate must say that boiling alone does not establish potability and that contaminant-specific removal/process evidence is required. |

## Reconciliation

The three APPROVE records are source-anchored qualitative premises, marked
`domain_internal_only`, and retain their candidate exclusions. The rejected
heating claim is a duplicate-control decision, not a finding that the CDC
source is inaccurate. NS05 needs a narrowed candidate before reconsideration;
the present review does not approve it. `claim:foundations-life-44-pathogen-transport`
concerns possible transport modes and is related context, not evidence for the
heating claim.

## Production relocation — a1ffc1e1f132854d367ac19ec267ee5b00605900

The three approved records were compared byte-for-byte at their claim,
source, evidence, concept, and RU/EN-localization dependencies against the
reviewed `ac49d74220b81ef338701a98d045579a9858c3de` research candidate. They
are unchanged in
`data/world-catalogs/novgorod/world-knowledge/production-v1/static-exposure-v1.json`.
Their digests in the merged production predicate context are unchanged:

- `claim:research-fuel-combustion-can-produce-carbon-monoxide` — `ce596c26fe6f3a1a3fa19b565be61fd9d09b1733a6506c815d92f53d8640016e`
- `claim:research-carbon-monoxide-can-accumulate-indoors` — `99c16784bc0c8a637353ad7b4f9c3e75a50cdeb1c87c1436295c1ca14b1765ca`
- `claim:research-cold-water-immersion-can-cause-immersion-hypothermia` — `e5993f9a6d9c84d74f18c5d5d4817585b9f819a1fed0bcb78affabf38dcce288`

The production verification fragment below therefore approves only these
unchanged three. NS04 and NS05 remain solely in the research review with their
REJECT and NEEDS_REVIEW verdicts; neither is relocated or approved.

Metadata refresh: `a060f68f0fcfe030ddd6dbdeca682c362c06a8f9` changes only
the stale lifecycle prefix in evidence notes; reviewed claim semantics and
localizations are unchanged. The production ledger is rebound to that commit.
