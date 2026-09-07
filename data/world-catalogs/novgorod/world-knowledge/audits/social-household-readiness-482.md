# Social/household readiness audit — compiled 482

Independent read-only audit of `wk:npc:status-family`, `wk:npc:routines`,
`wk:social:property` and `wk:social:norms`. Current claims and exact-focus
Core slices were assessed as category compositions, not as a count of letters.
No slice establishes a present kinship, dependant, role, schedule, property,
obligation, legal result or personal belief.

## Actual Core unseen-equivalent slices

At 1230 / `region_novgorod_land`, `materialization_support` is `supported`:

| Probe | Returned core claims |
|---|---|
| Kin/spouse/child status context | priest-child-baptism; kin protection request; contingent kin return request; spousal-treatment complaint. |
| Work/season context | rural agriculture role; net and boat work; hired boatman; pre-1300 cold-extreme context; photoperiod-dependent plant seasonality. |
| Entrusted/lost goods claim | written compensation complaint; entrusted-goods reference; acquisition-chain inquiry; settlement-or-court choice. |
| Bounded social request/assurance | conditional pochestie assurance; kin protection/return requests; spousal complaint. |

## Findings

| Cell | Verdict | Assembly / one concrete residual |
|---|---|---|
| `wk:npc:status-family` (P1), `demography_household_family_status_dependants` | **PARTIAL** | Kin, spousal and child-related textual contexts prevent treating family as absent. Missing one qualified Novgorod/Rus household/dependant relation beyond a request, complaint or rite. Unseen probe: reason about ordinary responsibility for an already-established dependant in a household. This does not assign a family or dependant to an NPC. |
| `wk:npc:routines` (P0), `workplace_activities_routines_schedules_seasonal_work_obligations_relationships` | **PARTIAL** | Agriculture/fishing/boat/hired work and environmental seasonality ground work contexts, while current schedules remain code-owned. Missing one dated seasonal work or household-obligation practice relation joining an activity to an historically qualified cycle. Unseen probe: explain why an already-established worker changes ordinary work with season; no clock, roster or compulsory outcome follows. |
| `wk:social:property` (P1), `property_possession_claims` | **COVERED recommendation** | Entrusted-goods reference, acquisition-chain inquiry, written compensation claim and settlement/court choice compose possession/claim/return-dispute category context. Exchange closure supplies transfer context where relevant. Actual holder, title, delivery, witness, jurisdiction and remedy remain state/law owners. |
| `wk:social:norms` (P1), `social_obligations_hospitality_family_gender_age_status_norms` | **PARTIAL** | Existing kin protection/return, spousal-treatment complaint and conditional assurance give bounded relation/obligation contexts. Missing one qualified local ordinary household or mutual-aid obligation practice, without converting it into mandatory hospitality. Unseen probe: ask an already-established neighbour/kin household for routine help; response still depends on NPC context and decision. |

## Decision

Recommend property category closure only. Keep status-family, routines and
norms partial for their stated single factual premises. No matrix, production
or code change follows.

## Compiled 491 follow-up: conditional dependant-care texts

Current 491 adds three exact HHO premises in `family-social-context.json`:
`rp-minor-children-conditional-care`, `rp-caretaker-principal-goods`, and
`rp-mother-household-care-succession`. Exact-focus
`materialization_support` returns the latter two tested claims as `supported`;
the first shares their conditional dependant-care subject. They distinguish
minor-child care/house goods, principal goods versus gain linked to feeding and
care, and maternal household-care succession.

This is deliberately a narrow conditional Extended-Pravda textual model,
with inferred comparative Novgorod compatibility. It is not a universal care
obligation, enacted Novgorod law, present kin/dependant/household, property
title, duration, procedure or outcome. Crucially, direct queries for those
claims return **zero** facts for `npc_decision`, `conversation` and
`narration`; they are `domain_internal_only`, preserving actor-safe boundary.

**491 reassessment:**

- `wk:npc:status-family` remains **PARTIAL P1**. HHO improves its dependent
  branch but cannot alone cover demography/household/status for NPC-facing
  purposes. Residual remains one qualified non-text-scoped local
  household/dependant relation usable as an NPC-safe contextual premise, not
  an assigned family or compulsory guardian.
- `wk:social:norms` remains **PARTIAL P1**. HHO gives conditional textual
  distinctions, not ordinary mutual-aid/hospitality/family-obligation practice
  for conversation/NPC decision. Residual is unchanged: one qualified local
  ordinary household or mutual-aid obligation relation with non-mandatory
  semantics.
- `wk:npc:routines` is unchanged **PARTIAL P0**. Maternal/child care text does
  not ground a workplace/seasonal routine cycle, roster or current schedule.

No matrix edit follows.

## Game-boundary diagnostic: HHO residuals

Actual early-game flow is `turn_step_request_v1 → turn_step_plan_v1` followed
by code-owned state/mechanics; an NPC response is a separate semantic decision
on NPC-safe committed context. Household/kinship, schedules and relations are
persisted world state, not facts inferred from a source text.

Example NPC line, when the relation is already committed: “Ты мой брат; я
помогу донести мешок до двора, если сначала закончу сеть.” This needs no new
objective fact beyond the current kin relation, current work and NPC’s free
decision. It does **not** assert “brothers are obligated to help,” or that a
Pravda rule is operative. A request to a relative may likewise be refused.

Therefore prior proposed residuals must not be read as a requirement for a
general norm merely to permit ordinary family dialogue or aid. A real missing
source class would arise only if runtime asserts an objective custom/law, for
example “the nearest relative must maintain this dependant” or a mandatory
inheritance result. That would require a qualified local-period
customary/legal obligation claim; HHO’s conditional, domain-internal text is
not it.

No automatic status change follows: remaining `status-family` and `norms`
partial verdicts require whole-family review, but their prior “NPC-safe norm
needed for ordinary request” rationale is withdrawn. If a case lacks kinship,
dependant, authority or schedule, blocker is committed actor/profile/world
context, not a new general historical premise.

## Final completeness verdict after HHO boundary check

Rechecked approved composition, not query emptiness: kin-directed protection
and contingent-return requests, spousal-treatment complaint, minor-child
conditional care, caretaker goods/care distinction, maternal household-care
succession, and existing priest/occupation contexts together cover the
category-level family/dependant/status envelope. They remain contextual and
conditional; none creates a demographic instance, household, kin relation,
guardian, gender role, office or enforceable law.

The same set grounds the declared norms category only as bounded relation and
obligation contexts. No other concrete P0/P1 factual premise is needed for an
ordinary NPC response: a request for help, hospitality or care can be accepted,
negotiated or refused from committed relationship/context and free NPC
decision. Requiring a source for a universal duty would itself invent the
wrong contract. A probe which says “a relative **must** support a dependant”
or “a household **must** host a stranger” is correctly unresolved unless a
specific objective custom/law is later sourced; that uncertainty is part of
the model, not a readiness gap.

**Recommendation:** mark `wk:npc:status-family` **COVERED** and
`wk:social:norms` **COVERED** at these bounds. This is not automatic matrix
closure and does not alter `wk:npc:routines`, whose historical
seasonal/work-cycle gap is separate.
