# Static exposure mechanisms v1 — bounded candidate research

Candidate only. It is outside `authoring.json`, has no verification ledger and is not runtime data. Independent per-claim review is required before any inclusion or production promotion.

## Residual reconciliation

Already active authoring and runtime bundle cover fuel combustion producing CO (`claim:research-fuel-combustion-can-produce-carbon-monoxide`), possible indoor CO accumulation (`claim:research-carbon-monoxide-can-accumulate-indoors`), cold-water immersion causing immersion hypothermia (`claim:research-cold-water-immersion-can-cause-immersion-hypothermia`), outdoor smoke transport/inversion, smoke optical obscuration, and airflow reducing condensation. They do not state CO's sensory limit, source capture/exhaust, cold-water functional impairment, or buoyant indoor smoke layering.

## Candidate claims and anchors

- `claim:research-carbon-monoxide-is-colorless-and-odorless` — [CPSC, *What You Need to Know About Carbon Monoxide*](https://www.cpsc.gov/s3fs-public/pdfs/blk_media_coguide.pdf), section “Carbon monoxide is a colorless, odorless gas”.
- `claim:research-local-exhaust-can-remove-contaminated-air-from-a-room` — [CDC/NIOSH, *Control of Formaldehyde during Embalming Procedures*](https://www.cdc.gov/niosh/engcontrols/ecd/detail17.html), “Description of control”. This establishes an airflow mechanism only; it does not establish a functional vent, CO, or a safe concentration.
- `claim:research-cold-water-immersion-can-impair-muscle-control` — [National Weather Service, *Cold Water Hazards and Safety*](https://www.weather.gov/safety/coldwater), “Stages of Cold Water Immersion”. No temperature, duration, diagnosis, treatment or deterministic functional result retained.
- `claim:research-fire-plume-can-transfer-combustion-products-to-an-upper-layer` — [NIST CFAST Technical Reference Guide, Volume 1](https://raw.githubusercontent.com/firemodels/cfast/master/Manuals/CFAST_Tech_Ref/CFAST_Tech_Ref.tex), “The Basic Transport Equations” and “Species Transport”. It explicitly describes a fire plume transferring entrained mass and heat from lower to upper layer, and combustion species accumulating in layers. No layer height, concentration, visibility, exposure, or safe location retained.

## Reuse and limits

CO production/accumulation, cold-water hypothermia, outdoor smoke transport/inversion, general thermal exchange, and ventilation/condensation are deliberately reused rather than duplicated. Candidate omits diagnoses, thresholds, treatment, comparative air-versus-water rates, room-specific outcomes, and any runtime, descriptor, vector, or gameplay change.
