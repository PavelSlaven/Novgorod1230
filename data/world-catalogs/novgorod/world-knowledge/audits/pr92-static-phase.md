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
