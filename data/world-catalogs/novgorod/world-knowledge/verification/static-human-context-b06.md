# Independent source review — static-human-context-b06

Reviewer: `/root/context_b06_b2`
Author reviewed: `/root/human_context_sources_b06`
Scope: source/claim fidelity only. No machine verdict, runtime change, or
historical-medieval institutional inference.

Published candidate: `git:51fb61efc5c99540b50c2099cc21ca08e7630e8f:data/world-catalogs/novgorod/world-knowledge/production-v1/static-human-context-b06.json`.
Candidate claims and RU/EN localizations were compared to that SHA. The four
verification digests were computed with `worldKnowledgeClaimDigest` on the
1319-claim assembled pack specified for this candidate.

## Per-claim result

- **APPROVE — `claim:static-repeated-skin-friction-can-cause-blistering`.**
  NHS says blisters are mostly caused by friction and protect damaged skin.
  The claim's direct/high qualifier and exclusions of concrete wound, severity,
  infection, time, and individual state match the source.

- **APPROVE — `claim:static-reducing-repeat-friction-and-covering-blister-is-protective-context`.**
  NHS advises covering a blister and not using shoes or equipment that caused it
  until healing. The claim remains qualitative protective context; it does not
  prescribe a dressing material, treatment protocol, or outcome.

- **APPROVE — `claim:static-post-head-injury-warning-observations-warrant-urgent-qualified-help`.**
  NHS lists inability to stay awake and seizure after head injury for immediate
  help; University Hospitals Sussex lists vomiting more than once, difficult
  waking, and seizure for urgent medical attention. The claim is conditional
  on an already established head injury and explicitly avoids diagnosis, cause,
  and outcome.

- **APPROVE — `claim:static-dim-light-reading-can-tire-eyes-without-harming-them`.**
  NHS links long unbroken screen viewing to dry-eye risk and recommends visual
  breaks; NEI's *Healthy Vision* states that dim-light reading may tire eyes
  without harming them. `inferred`/`medium` fits the composed near-work wording,
  whose localization excludes acuity, threshold, duration, and scene visibility.

## Source checks

- [NHS — Blisters](https://www.nhs.uk/conditions/blisters/)
- [NHS — Head injury and concussion](https://www.nhs.uk/conditions/head-injury-and-concussion/)
- [University Hospitals Sussex — Adult Head Injury A&E leaflet](https://www.uhsussex.nhs.uk/resources/copy-of-adult-head-injury-ed-leaflet/)
- [NHS — Dry eyes](https://www.nhs.uk/symptoms/dry-eyes/)
- [National Eye Institute — Healthy Vision](https://www.nei.nih.gov/sites/default/files/2019-06/NEI_Healthy-Vision_booklet_WEB_508%20%281%29.pdf)
