# Independent verification — religious practices candidates

**Scope:** `research/population-religious-practices.md`, RP-01 through RP-05
only.  This is source verification, not authoring or a finding about a
present church, cleric, rite, court, institution, or enforcement in Novgorod.

## Sources independently opened

- HSE’s full primary-text transcription, [*Velikokniazheskie ustavy*](https://nnov.hse.ru/ba/law/igpr/churchustavy), was read for the Olenin and Synodal
  redactions of the Vladimir statute and the Extended redaction of the
  Yaroslav statute.  It identifies its edition as *Rossiiskoe zakonodatel'stvo
  X–XX vv.*, vol. 1 (1984).
- The Stolypin Museum’s [Vladimir statute page](http://xn--e1aaejmenocxq.xn--p1ai/node/13619) was read in full.  It says the document has seven redactions,
  that two belong to XII–XIII and others to XIV–XVI, and publishes the
  Olenin text as the oldest; it describes the text underlying surviving
  copies as compiled in the middle or second half of the twelfth century.
- The Museum’s [Yaroslav statute page](http://xn--e1aaejmenocxq.xn--p1ai/node/13620) was read in full.  It says the oldest Extended redaction was composed
  in the twelfth to first quarter of the thirteenth century, after repeated
  reworking.  It also explicitly warns that the stated penalties make actual
  application doubtful.

The attributed princes’ dates are therefore **not** dating evidence for any
candidate.  The only defensible target envelope is an inferred, medium-
confidence Old Rus textual/legal tradition compatible with 1100–1300.  It is
not evidence of local Novgorod enforcement, an officeholder, a tribunal, or
an actor’s status.

| ID | Verdict | Production-safe corrected wording (RU / EN) | Checked anchor and rationale | Limits |
|---|---|---|---|---|
| RP-01 | **APPROVE_WITH_LIMITS** | **В Оленинской редакции Устава Владимира игумен, поп и дьякон перечислены среди «людей церковных». / In the Olenin redaction of the Vladimir statute, an abbot, priest and deacon are listed among “church people.”** | HSE, *Ustav Vladimira*, Olenin §§10–11; Museum Vladimir page §§10–11.  §10 directly lists `игумен`, `поп` and `дьякон` among `митрополичи люди церковныи`; the Museum supplies the relevant redactional dating boundary. | Historical text category only; `1100–1300`, `inferred/medium`.  No local clergy roster, parish, ordination, skill, current authority, or claim that all places or clergy operated identically. |
| RP-02 | **APPROVE_WITH_LIMITS** | **Оленинская редакция Устава Владимира относит разбор вины перечисленных церковных людей к митрополиту и епископам, отдельно от мирян. / The Olenin redaction of the Vladimir statute assigns adjudication of an offence involving its listed church people to the metropolitan and bishops, apart from laypeople.** | HSE and Museum Vladimir page §11: `судити тех митрополиту и епископом опрочи мирян`.  This directly supports the stated textual jurisdiction relation, while the Museum explains its layered redactional history. | Normative-text compatibility only, `1100–1300`, `inferred/medium`.  It establishes no operating court, sentence, coercion, cleric, claim, division of every dispute, or Novgorodian enforcement. |
| RP-03 | **APPROVE_WITH_LIMITS** | **Пространная редакция Устава Ярослава рассматривает крещение детей священником в чужом уезде как регулируемое действие. / The Extended redaction of the Yaroslav statute treats a priest’s baptism of children in another priest’s district as a regulated act.** | HSE and Museum Yaroslav page §48: `Иже поп дети крестить в чюжем уезде иного попа ... а что створить крешеньское не во своем уезде, митрополиту в вине.`  The middle exception phrase appears as `раз пси нижа или при болезни` in both accessible renderings and is not normalized.  The role-to-baptism association is explicit regardless of that corrupt/unclear phrase. | `1100–1300`, `inferred/medium`; no local parish boundary, rite, validity, emergency exception, illness mechanics, consent, competence, date or enforcement.  In particular, **do not** model `при болезни` as medical or hospital behaviour. |
| RP-04 | **NEEDS_EVIDENCE** | No production wording approved. | HSE Synodal Vladimir §§16–17 does contain the list `Манастыреве, болнице, гостинници, странноприимнице`.  However, the independently read Museum dating distinguishes the oldest Olenin text from the other redactions without dating the Synodal wording itself.  Its general statement that two of seven redactions are XII–XIII is not an anchor for this passage. | A redaction-specific scholarly edition/dating anchor is required before treating this institutional list as compatible with 1100–1300.  The text alone never creates a monastery, hospital, guesthouse, hospice, service, staff, admission, charity or building in a scene. |
| RP-05 | **NEEDS_EVIDENCE** | No production wording approved. | HSE Synodal Vladimir §§9–10 enumerates marital/family and church matters under `церковнии суди`.  But, as for RP-04, the independently checked dating source does not demonstrate that this **Synodal** list belongs to the XII–XIII textual layer.  The Olenin text has a narrower marital/kinship list, but that is not the submitted Synodal claim and does not validate its broader wording. | Do not promote as a 1230-compatible court category until a redaction-specific scholarly dating source is opened.  Even then it can only be a bounded normative-text category, never a gameplay legal code, sanction catalogue, marital status, belief, court, or enforcement event. |

## Decision

Only RP-01 through RP-03 are production-eligible, and only in the exact
source-attributed, redaction-bounded language above.  RP-04 and RP-05 remain
outside the eligible set pending direct evidence for the Synodal wording’s
date.  None of these results warrants a general sanitation, hospital, or
legal-mechanics feature.

## Exact production-normalization review

**Verdict: APPROVE_WITH_LIMITS (three exact records).**  I compared the
normalized records in `production-v1/social-institutions.json` against the
approved wording above; no source was reinterpreted.

| Claim ref | Exact-record review |
|---|---|
| `claim:religion-olenin-church-people` | Correctly retains the source-attributed Olenin list of abbot, priest and deacon.  `evidence:religion-olenin-people` anchors §§10–11; `evidence:religion-olenin-dating` supplies the layered-text, inferred/medium 1100–1300 boundary.  RU/EN exclude a local clergy roster, individual capacity and authority. |
| `claim:religion-olenin-adjudication` | Correctly limits adjudication to an offence involving the listed church people, by the metropolitan and bishops apart from laypeople.  The same primary-text and dating evidence are appropriate; RU/EN explicitly exclude an operating court, sanction, universal division of disputes and Novgorod enforcement. |
| `claim:religion-priest-child-baptism` | Correctly states only that the Extended Yaroslav redaction treats a priest baptising children in another priest’s district as regulated.  `evidence:religion-priest-baptism` anchors §48 and expressly leaves its unclear exception uninterpreted; `evidence:religion-yaroslav-dating` preserves the layered XII–first-quarter-XIII source limit.  RU/EN add no illness, hospital, parish, validity, consent, competence or enforcement mechanics. |

All three retain `1100–1300`, `region_novgorod_land`,
`inferred/medium`, and `domain_internal_only`, which are the approved
historical-compatibility boundary rather than evidence of local enforcement.
RP-04 and RP-05 are absent, as required.

## Addendum — RPO-01, museum object function

**Source independently opened.** The State Historical Museum’s complete
[exhibit 1438](https://nav.shm.ru/en/exhibits/1438/) was opened through
browser-harness on 2026-09-04. It identifies mound C-301 at Gnezdovo,
Smolensk Oblast, as a woman's burial of the second half of the tenth century.
The object metadata explicitly reads “Size of the cross worn next to the
skin”; the description identifies a thin silver cross with a fixed hold. The
page's separate historical interpretation calls the burial a rare Christian
burial and discusses elite druzhina contexts, but that interpretation is not
needed to establish the object's stated wear position.

| ID | Verdict | Production-safe corrected wording (RU / EN) | Checked basis and strict limit |
|---|---|---|---|
| RPO-01 | **APPROVE_WITH_LIMITS** | **В комплексе C-301 из Гнёздова (вторая половина X в.) каталог называет крест нательным. / In the C-301 Gnezdovo complex (second half of the tenth century), the catalogue calls the cross next-to-skin.** | Direct/high only for that catalogued object and its stated wear position. It is an earlier Old-Rus comparative example, therefore only **inferred/low–medium** compatibility for Novgorod Land 1100–1300. A normalized relation may express a cross as a possible personal worn object, but must not create a cross, wearer, suspension method, material, wealth, gender, conversion, belief, clergy, church attendance, prayer, burial rite, official authenticity, current possession, or any scene fact. The source does not support a general Christian-practice rule. |

**Usefulness boundary.** This is eligible only as a narrowly source-attributed
personal-object/wear-position relation. It is not an institutional religion
fact and cannot by itself supply a religious action or state. RPO-02's
comparative statement about mixed burial symbols remains a guardrail, not a
production candidate from this review.

## Addendum — RPO-03, probable travel chalice

**Source independently opened.** The Novgorod Museum-Reserve’s complete
[27 August 2024 news page](https://novgorodmuseum.ru/o-muzee-zapovednike/novosti/fondy-novgorodskogo-muzeya-zapovednika-popolnilis-novym-sokrovishchem)
was opened through browser-harness on 2026-09-04. It calls the item a
“домонгольская чаша XII–XIII веков,” says its base bears a flowering Byzantine
cross, and says it “вероятнее всего, служила походным потиром, т.е.
использовалась для причастия.” It also says the museum received it from a
private collector. The page names **no** findspot, manufacture place, owner,
date within the two-century range, church, use event or chain of provenance;
its current holding by a Novgorod museum is not evidence of medieval
Novgorod-Land presence. It names no material.

| ID | Verdict | Production-safe corrected wording (RU / EN) | Checked basis and strict limit |
|---|---|---|---|
| RPO-03 | **APPROVE_WITH_LIMITS** | **Музей описывает домонгольскую чашу XII–XIII вв. с крестом на днище как предмет, который «вероятнее всего» был походным потиром и использовался для причастия. / The museum describes a pre-Mongol twelfth–thirteenth-century bowl with a cross on its base as an item that “most likely” served as a travel chalice and was used for communion.** | Direct/high that the museum makes this **probable**, not certain, functional identification; its factual force is **medium**. It is only a broad Old-Rus XII–XIII material/function analogue, `1100–1300`, `inferred/medium`, with no local-presence basis. A normalisation must preserve `вероятнее всего/most likely`; it must not supply material, findspot, manufacture, owner, clergy, consecration, church, wine, communion event, access, official authenticity, current item or rite. |

**Usefulness boundary.** RPO-03 can support only a cautious historical
material-item/function envelope if a query actually needs that relation. It
does not independently support a Novgorod 1230 religious institution or a
present religious practice, and is unsuitable for any provenance-based
materialisation.

## Exact production-normalization review — RPO-03

**Verdict: MATCHES_APPROVAL.** I compared
`claim:probable-travel-chalice-communion` in
`production-v1/social-institutions.json` with the independent verdict above.
The literal, concept labels and RU/EN runtime text retain the museum's
probability (`вероятнее всего` / “most likely”), rather than turning the cup
into a certain chalice. `1100–1300`, `inferred/medium` and
`domain_internal_only` preserve the broad compatibility envelope. The
evidence note and both runtime texts explicitly say that material, findspot,
manufacture and provenance are unspecified and that the present museum
location is not evidence of medieval Novgorod-Land presence. They add no
clergy, institution, consecration, rite, wine, access or authenticity fact.

The record's `region_novgorod_land` applicability is therefore admissible
only as that explicitly qualified target compatibility envelope; it must not
be read as the find's provenance or as an attestation that such a vessel was
used in medieval Novgorod.
