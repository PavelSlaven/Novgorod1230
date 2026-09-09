# NPC and social readiness audit — 420-claim delta

Independent read-only assessment on 2026-09-04. Scope is the current compiled
production-v1 pack (420 claims / 378 concepts), matrix NPC
`status-family`/`occupations`/`knowledge`/`routines` cells and social
`property`/`exchange`/`norms`/`law`/`religion`/`literacy` cells. It is not a
source verification, pipeline acceptance, state/profile audit or PR verdict.

## Boundary applied

Active NPC/social profiles are production for their declared purposes.
`common_cultural` facts are available to actor-facing purposes;
`domain_internal_only` claims are intentionally excluded from
`npc_decision`/conversation/narration and remain available to semantic or
materialization reasoning. World Knowledge cannot establish an NPC's present
role, belief, kinship, literacy, expertise, schedule, inventory, debt,
property title, authority, price, completed transaction or legal outcome.
Those are committed state and their existing owners, not coverage gaps.

## Unseen Core probes

Year 1230 / `region_novgorod_land`, no focus refs, bounded relevant domains:

- hiring carpenter/smith/fisher retrieves `claim:occupation-smith-role`,
  `claim:occupation-smith-specialisation` and
  `claim:social-hired-work-relates-business-record`;
- borrowing grain with guarantor/accounting retrieves
  `claim:social-debt-records-accounting-amount`,
  `claim:social-guarantor-relates-transaction-obligation`,
  `claim:household-barley-commodity`, `claim:household-rye-commodity` and
  `claim:occupation-directed-grain-procurement`;
- a trusted-goods/acquisition/compensation dispute retrieves
  `claim:rp-entrusted-goods-claim-relates-reference`,
  `claim:rp-market-purchase-relates-proof-participant`,
  `claim:rp-merchant-credit-relates-third-party-goods` and
  `claim:social-settlement-demand-reports-court-choice`;
- practical letter/dispatch probe retrieves dispute, authority, kin-request,
  loan-request and settlement-letter claims;
- an ordinary request for family hospitality/help returns `unresolved`.

## Findings

### `wk:npc:knowledge` — COVERED recommendation, P1 unchanged

`claim:resource-occupation-needs-setting`, carpenter/smith role context and
document/accounting facts provide the required general boundary: role/context
does not manufacture a particular skill, knowledge or belief. This is the
correct open-world result until a committed NPC profile supplies actual
competence. Do not add a catalogue of assigned skills or infer literacy from a
role.

### Remaining `partial` cells

- `wk:npc:status-family` (P1): kin requests, spousal complaint and office
  address are isolated documentary contexts, not a historical envelope for
  ordinary household/dependent/status relations. Research path: dated Novgorod
  household/kinship and dependency evidence with qualified relationship
  contexts, never a rule assigning family to an NPC.
- `wk:npc:occupations` (P0): fishing, smithing, carpentry, boat/storage work
  and hired work are grounded, but ordinary trade, agricultural/service,
  authority and religious work remain materially absent. Research path:
  source-backed role-to-practice/tool/context relations across those open
  classes; no closed profession list or assigned occupation.
- `wk:npc:routines` (P0): code owns current activities/times, but evidence
  still lacks a broad qualified seasonal/work/household-obligation envelope.
  Work/net/tillage/boat examples and `claim:work-intensity-duration` do not
  cover it. Research path: seasonal and ordinary-work contexts linked to
  established role/place/resource, without fixed schedules.
- `wk:social:property` (P1): acquisition-chain, entrusted-goods and complaint
  examples support bounded disputes only; possession/transfer/return claim
  practice is not covered as a family. Research path: contemporaneous property
  and custody dispute documents, preserving no automatic title/remedy.
- `wk:social:exchange` (P0): grain, debt records, loan and guarantor relations
  support a limited credit/accounting envelope, but ordinary exchange/sale,
  market practice and measures/money context remain too sparse. Exact price,
  rate, stock and individual obligation are explicitly not required. Research
  path: dated Novgorod trade/accounting documents or archaeology yielding
  qualified transaction/measure practice without inventing prices.
- `wk:social:norms` (P1): explicit hospitality/help probe is unresolved;
  promises and marital complaint cannot supply broad obligation, household,
  age/gender/status norms. Research path: bounded local social-practice
  evidence; do not turn it into mandatory NPC behaviour.
- `wk:social:law` (P1): market proof and court-choice examples do not cover
  jurisdiction, triggers, witnesses, procedure, sanctions or remedies. The
  comparative Русская Правда claims remain non-automatic for Novgorod 1230.
  Research path: appropriately dated local legal/practice records, preserving
  uncertainty where procedure is not evidenced.
- `wk:social:religion` (P1): calendar text, priest correspondence, name list
  and prayer support only textual contexts, not institutions, observance,
  burial/custom or belief. Research path: locally/time-qualified practice and
  institution evidence; never infer personal belief or a present church.
- `wk:social:literacy` (P1): practical genres/letters establish document
  contexts but not general literacy, stable address forms or institutional
  roles. Research path: dated correspondence/document-practice evidence;
  retain individual read/write ability as state.

## Verdict

One closure recommendation: `wk:npc:knowledge` → `covered`, P1 unchanged.
All other audited cells remain their present `partial` status/criticality for
the concrete historical-practice gaps above. No matrix/code/data changes; the
in-progress main pipeline/debt regression is not claimed resolved here.
