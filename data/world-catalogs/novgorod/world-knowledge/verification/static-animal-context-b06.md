# Static animal context B06 — independent source/domain review

Candidate: `git:51fb61efc5c99540b50c2099cc21ca08e7630e8f:data/world-catalogs/novgorod/world-knowledge/production-v1/static-animal-context-b06.json` (author: `/root/animal_context_sources_b06`). Candidate flags `approved` are not a verifier verdict.

## Source and domain findings

| Claim | Verdict | Source finding and limits |
|---|---|---|
| `british-insectivorous-bats-use-echolocation-at-night` | APPROVE_WITH_LIMITS | Bromley explicitly says British bats are nocturnal, use echolocation, and are insectivorous. Keep British taxon/geography in claim; this modern UK relation is not 1230 Novgorod presence, species, count, roost, or local prey evidence. |
| `british-bat-winter-hibernation-sites-need-low-disturbance` | APPROVE_WITH_LIMITS | Bromley explicitly names safe undisturbed winter hibernation sites for British bats. No all-bat calendar, Novgorod season, concrete roost, or historical habitat claim. |
| `roost-disturbance-can-cause-abandonment-or-hibernation-arousal` | APPROVE_WITH_LIMITS | USFS says many species abandon roosts after minimal disturbance and noise/light can arouse hibernating bats. “Can” and `many` preserve conditionality; do not predict mortality, exact response, or later occupancy. |
| `bat-roost-entries-and-exits-can-be-observed-from-outside` | APPROVE_WITH_LIMITS | USFS explicitly permits outside observation of entries/exits while minimizing disturbance. This is a modern observation alternative, not access, required procedure, or medieval practice. |
| `indoor-bat-can-locate-an-exit-and-leave-on-its-own` | APPROVE_WITH_LIMITS | CDFW says in most cases a single bat inside a structure will try to locate an exit and leave. Keep singular/qualified wording; no removal method, guaranteed departure, species identity, or 1230-building inference. |
| `equine-gait-change-or-reduced-performance-does-not-identify-cause` | APPROVE | APHIS states gait/performance change can be noticed by caregivers, while cause usually needs veterinary examination and may be pain, mechanical, or neurologic. `inferred/high` is justified by that direct source relation; no diagnosis, lesion, severity, treatment, or outcome. |
| `animal-welfare-indicators-require-species-context` | APPROVE_WITH_LIMITS | USDA NAL requires species-specific welfare indicators in assessment protocols. The no-cross-species-diagnosis conclusion is a valid `inferred/medium` boundary, limited to assessment; it creates no score or physiological rule for any concrete animal. |
| `heat-humidity-work-and-transport-contextualize-equine-heat-strain-signs` | APPROVE_WITH_LIMITS | UConn directly lists these heat-strain contexts and possible horse signs. It supports contextualization only: no threshold, diagnosis, dehydration, required water, injury, or outcome. |
| `perceived-threat-can-prompt-horse-flight` | APPROVE_WITH_LIMITS | Rutgers identifies flight as horse primary survival response and notes fast response to perceived predator/threat. No proof of a perceived object, fear state, intent, injury, or scene outcome. |

## Coverage and duplicate check

- Checked all nine claim propositions against current 1295-record `runtime-bundle.json`. No semantic duplicate found.
- Related but non-duplicate existing premise: general sympathetic stress after a perceived threat. It does not subsume horse flight behavior.
- Source domain is modern British/US animal biology and welfare guidance. It may support general conditional context only; it does not establish 1230 Novgorod fauna, a local animal, legal/handling practice, exact thresholds, diagnosis, or causal result.

## Machine gate

`APPROVE` records written for these nine claims only. `worldKnowledgeClaimDigest` ran against `loadWorldKnowledgeAuthoringInput(authoring.json)` plus the six authoring arrays from the four B06 fragments (`static-animal`, `static-human`, `static-plant`, `static-weather-traces`): 1319 claims. `git show` claim/localization content matched the candidate SHA. No payload, runtime bundle, descriptor, approval flag, or commit was changed by this review.
