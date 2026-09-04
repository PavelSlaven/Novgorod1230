# Independent verification: social daily-practice candidates

Independently checked the full-text source named in
`research/population-social-daily-practices.md`: Е. А. Рыбина, «Промыслы в
средневековом Новгороде (по археологическим материалам)», *Исторические
исследования* 3 (2015), pp. 219–234, [full-text PDF](https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam/pdf).
The article's exact text for pp. 220–221 says that letters 831 and 219 record
fish as obrok among other collections, including money and grain. For the
letter-420 anchor, I also checked the [primary document record](https://gramoty.ru/birchbark/document/show/novgorod/420/): it translates the sale as forty beavers for ten grivnas of silver and dates the stratum to the 1230s–1260s.

This is an independent source verdict, not approval of a production record,
concept, profile, or runtime behaviour.

| Candidate | Verdict | Verified scope and required limits |
| --- | --- | --- |
| SDP-01 | APPROVE_WITH_LIMITS | Rybina p. 219 directly calls fishing, hunting and beekeeping, together with agriculture, craft and trade, components of medieval Novgorod's economy. It supports only a historical economic-context relation for Novgorod land, conventionally compatible with 1100–1300 at inferred/medium confidence. It does **not** establish a current occupation, household, market, stock, trade route, or participant. |
| SDP-02 | REUSE_EXISTING | The source directly supports the limited documentary observation: in letters 831 and 219 fish obrok occurs among money and grain. It does not establish a tax system, rate, liable population, current payment, or that fish and money were interchangeable. The safe generic need—one record can contain accounting and commodity entries—is already covered by `claim:social-payment-register-records-entry` (with its own 1220–1240 evidence and no-current-duty limit). Do not add a duplicate broad `levy/payment` category; a future narrowly authored fish-obrok exemplar would need its own historical-only wording and inferred/medium compatibility. |
| SDP-03 | APPROVE_WITH_LIMITS | Letter 420 directly records one sale: forty beavers for ten grivnas of silver. It may support a historical, internal-only example that a written sale record can specify a commodity lot and an accounting amount. Its date is a thirteenth-century document (stratigraphically 1230s–1260s), so general compatibility with a 1220–1240 scenario is inferred/medium, not a direct fact about 1230. It establishes neither a price schedule, conversion, coin weight, seller authority, credit term, ownership, nor a current fur stock. |
| SDP-04 | APPROVE_WITH_LIMITS | Rybina pp. 233–234 reports honey in debt lists and in-kind tribute/payment material, including letter 718; this supports a historical documentary/commodity-context possibility only. The corpus span does not make a 1230 obligation direct: any 1220–1240 use must remain inferred/medium. It creates no bees, honey, debtor, creditor, tribute, entitlement, amount, or enforceable obligation in a scene. Existing debt-record claims remain the correct reuse where the question needs only a record or accounting amount. |
| SDP-05 | APPROVE_WITH_LIMITS | Rybina pp. 233–234 identifies wax as a product of bortevoi beekeeping and names it among major Novgorod export commodities, with wax also mentioned as a commodity in letters. It supports an historical commodity/exchange context, not a wax source, a bortevoi tree, a beekeeper, a merchant, a route, a sale, or material present now. Compatibility is historical/inferred-medium; do not turn the article's regional evidence into an actor's ordinary inventory. |

## Directness, date, and category boundary

The source gives direct evidence for its individual documentary statements.
It does not supply a universal rule of daily life, a current-world fact, or a
general legal/economic mechanism. A production normalization must therefore
keep the individual record as `attested` where appropriate and mark any
1100–1300 or 1220–1240 applicability extension as `inferred` with medium
confidence. In particular, letter 420 cannot silently become a 1230 market
price or a mandatory sale procedure.

The audit deliberately keeps the candidates in a safe historical
credit/commodity envelope. It rejects unbounded categories such as a generic
`levy/payment system`, an actor's profession, or a present household
inventory. Existing claims should be reused where they already express the
needed record-level fact; they are not evidence for adding a second generic
claim under a new label.

## Exact anchors checked

- Rybina p. 219: agriculture, craft and trade alongside the listed promysly as
  parts of the Novgorod economy.
- Rybina pp. 220–221: letters 831 (mid-twelfth century) and 219 (turn of the
  twelfth/thirteenth centuries), fish obrok among money and grain.
- Rybina p. 230 and letter 420: forty beavers, ten grivnas of silver.
- Rybina pp. 233–234: honey in debts/tribute material; wax as a bortevoi
  product and commodity/export context.

None of these anchors supplies a current object, amount, person, payment,
right, duty, procedure, or outcome.

## Exact normalization — compiled 442

**PASS_WITH_LIMITS.** Checked the four `claim:social-daily-*` records in
`production-v1/social-context.json`. They use the existing `supported_fact`
signature, approved Rybina evidence anchors, `domain_internal_only`, and
1220–1240 Novgorod-Land applicability with `attested` / `medium` /
`inferred` qualifiers. Both RU and EN projections preserve the historical,
non-current boundary.

- `social-daily-economic-activities` retains a regional context only.
- `social-daily-fur-sale-accounting` retains one thirteenth-century record,
  not a 1230 rate or transaction.
- `social-daily-honey-documentary-entry` and
  `social-daily-wax-commodity-context` retain documentary/commodity context
  only.

SDP-02 remains intentionally represented by existing
`claim:social-payment-register-records-entry`; no broad duplicate
`levy/payment` claim was introduced.
