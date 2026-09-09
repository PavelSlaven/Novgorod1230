# Macro causal gap closure v2 — candidate research

Status: candidate-only. This note and its paired fragment neither activate gameplay behavior nor establish an actor's condition, diagnosis, exposure, route, material availability, historical practice, time, direction, location, or outcome.

## Candidate set

| Area | Candidate claims | Bounded use |
| --- | ---: | --- |
| Sun and shadow | 1 | Qualitative cue only; no compass, clock, route, position, weather, or navigation result. |
| Carbon monoxide | 1 | Mechanism and exposure-dependent hazard only; no exposure finding, diagnosis, severity, or outcome. |
| Water boiling | 1 | Microorganism control and limits only; no present water quality or historical practice. |
| Ordinary functional burden | 3 | Injury, tooth pain, and parasite burden as general relations; no diagnosis, presence, route, severity, or outcome. |
| Toxic exposure | 1 | General pathways and context-sensitive effects; no substance, dose, exposure, or outcome in a scene. |

## Sources and extraction limits

- [NOAA — Solar Position Calculator](https://gml.noaa.gov/grad/solcalc/azel.html), National Oceanic and Atmospheric Administration: solar azimuth/elevation are functions of supplied location and time. The qualitative cue is an inference from that relation; no exact estimate follows.
- [CDC — Clinical Guidance for Carbon Monoxide Poisoning Following Disasters and Severe Weather](https://www.cdc.gov/carbon-monoxide/hcp/clinical-guidance/index.html): CO toxicity impairs oxygen delivery and also cellular oxygen use; source history and elapsed time matter to assessment.
- [EPA — Emergency Disinfection of Drinking Water](https://www.epa.gov/ground-water-and-drinking-water/emergency-disinfection-drinking-water): boiling kills pathogenic bacteria, viruses and protozoa, while boiling/disinfection does not destroy heavy metals, salts, or most chemicals; clean covered storage remains required. The recontamination limit is an explicitly marked inference from the clean-storage instruction.
- [MedlinePlus — Broken bone](https://medlineplus.gov/ency/article/000001.htm) and [MedlinePlus — Dislocation](https://medlineplus.gov/ency/article/000014.htm), U.S. National Library of Medicine: both pages directly describe limited movement/use or weight bearing as possible consequences, without supporting a diagnosis for an actor.
- [NIDCR — Tooth Decay](https://www.nidcr.nih.gov/health-info/tooth-decay), National Institute of Dental and Craniofacial Research, and [NHS — Toothache](https://www.nhs.uk/symptoms/toothache/): advanced decay and cracked teeth can cause pain. Interference with chewing is a bounded functional inference, not a diagnosis.
- [ATSDR — Overview of the Exposure Pathway Evaluation](https://www.atsdr.cdc.gov/pha-guidance/conducting_scientific_evaluations/exposure_pathways/overview_of_the_exposure_pathway_evaluation.html), Agency for Toxic Substances and Disease Registry: exposure can occur through dermal contact, inhalation, or ingestion, while health effects depend on contaminant properties, concentration, duration/frequency, route, and individual context. The candidate establishes no scene exposure or outcome.
- [CDC — About Parasites](https://www.cdc.gov/parasites/about/index.html): distinct parasitic classes, routes and human burdens vary. It supports only a general possible burden, not parasite presence, route, or burden for an actor.

## Explicit non-claims

- No fact diagnoses poisoning, fracture, dislocation, tooth disease, parasitic infection, or any actor's ability.
- No fact chooses treatment, dose, test, medical role, recovery, probability, severity, or outcome.
- No fact identifies a substance, water condition, pathogen, parasite, exposure route, source, time, direction, position, route, or weather in a game state.
- No fact makes a modern public-health practice historically available in 1230.

## Verification handoff

`production-v1/macro-causal-gap-closure-v2.json` contains seven candidate claims, ten evidence records, and nine authoritative sources. It is intentionally absent from `authoring.json` and has no verification ledger entry; independent per-claim review remains required before inclusion.
