# Verification: population social context

Independent re-open: 2026-09-03. Evidence is the institutional Old Russian
Birch-Bark Documents corpus (HSE / Institute of Slavic Studies RAS), not
Wikipedia or a secondary summary. “Attested” below is document-context only;
it never materializes a current debt, document, claimant, messenger, status,
authority, currency, or remedy.

| Candidate | Verdict | Production-safe wording and exact limit | Checked primary URL |
| --- | --- | --- | --- |
| SOC-01 | APPROVE | A Novgorod debt record dated 1220–1240 records an accounting amount. It establishes neither a current debt nor its parties, terms, enforcement, interest, or collateral. | [№73](https://gramoty.ru/birchbark/document/show/novgorod/73/) — metadata: Novgorod, 1220–1240 / stratigraphic 1220s–1230s, business debt-list/record. |
| SOC-02 | APPROVE | A 1220–1240 Novgorod fragment is classified as a debt-list/record. It supports a document-type with debt entries, not any entry’s content, creditor, validity, or literacy rate. | [№224](https://gramoty.ru/birchbark/document/show/novgorod/224/) — metadata: fragment, business records, debt-list/record. |
| SOC-03 | APPROVE_WITH_LIMITS | №524 directly attests a 1160–1180 Novgorod loan request. It supports only an inferred-medium, broad 1100–1300 historical compatibility of loan/advance requests; never a 1230 lender, entitlement, rate, terms, or current loan. | [№524](https://gramoty.ru/birchbark/document/show/novgorod/524/) |
| SOC-04 | APPROVE_WITH_LIMITS | One 1220–1240 Novgorod judicial record mentions a guarantor in a transaction-and-obligation context. It is not a general surety, custody, seizure, or enforcement rule. | [№510](https://gramoty.ru/birchbark/document/show/novgorod/510/) — official judicial record; text includes `поручнь` and a transaction/debt context. |
| SOC-05 | APPROVE_WITH_LIMITS | One 1220–1240 judicial record contains an accusation and compensation demand. A demand is not verified title, judgment, tariff, sanction, or outcome. | [№510](https://gramoty.ru/birchbark/document/show/novgorod/510/) |
| SOC-06 | REJECT | №510 names people, livestock, mares, and rye in one accusation, but that does not yield a generic asset taxonomy; in particular it must not make persons a property category or create inventory. | [№510](https://gramoty.ru/birchbark/document/show/novgorod/510/) |
| SOC-07 | APPROVE_WITH_LIMITS | A first-half-13th-century private letter reports sending two men in connection with a river dispute. It does not establish a witness procedure, summons, official, representative authority, or fixed legal process. | [№600](https://gramoty.ru/birchbark/document/show/novgorod/600/) — metadata and surviving text. |
| SOC-08 | APPROVE_WITH_LIMITS | №76 directly attests a 1200–1220 business-fragment category mentioning a hired worker. It supports an inferred-medium broad 1100–1300 hired-work category, never a wage, term, task, status, or NPC worker. | [№76](https://gramoty.ru/birchbark/document/show/novgorod/76/) |
| SOC-09 | APPROVE | In the 1220–1240 debt record, grivna occurs as an accounting unit. It is not a coin, silver mass, exchange rate, price list, or money present in inventory. | [№73](https://gramoty.ru/birchbark/document/show/novgorod/73/) |
| REL-01 | APPROVE_WITH_LIMITS | №545 directly gives the disjunctive category “church commemorations and/or icon order.” It supports only an inferred-medium broad 1100–1300 documentary category; it establishes no 1230 rite, church, person, icon, or clerical role. | [№545](https://gramoty.ru/birchbark/document/show/novgorod/545/) |
| REL-02 | APPROVE_WITH_LIMITS | №913 directly attests a Novgorod church-calendar text listing feast names. It supports only an inferred-medium broad calendar-text category, never exact 1230 calendar dates, fasts, duties, attendance, or code-owned calendar projection. | [№913](https://gramoty.ru/birchbark/document/show/novgorod/913/) |
| REL-03 | APPROVE_WITH_LIMITS | №507 directly attests an early-13th-century Novgorod Christian exegetical fragment. It supports only an inferred-medium broad Christian textual context, never an actor’s belief, literacy, doctrine knowledge, or status. | [№507](https://gramoty.ru/birchbark/document/show/novgorod/507/) |

## Approved integration surface

`production-v1/social-context.json` implements SOC-01–05, SOC-07–09 and
REL-01–03, with SOC-03/08 and REL-01–03 explicitly inferred-medium broad
1100–1300 compatibility rather than a 1230 census. It reuses approved
`source/evidence` records for №73 and №510 from `foundation.json`; it adds
primary-text records for №224, №600, №524, №76, №545, №913, and №507. All
claims use typed concept-ref objects and no `supported_fact` or policy
placeholder.

## Counts and boundary

- Candidates re-opened: 12.
- APPROVE: 3; APPROVE_WITH_LIMITS: 8; REJECT: 1.
- Added typed claims: 11; new sources: 7; reused sources: 2.

No source supports a procedural code, court composition, oath, title,
inheritance, wage, exchange rate, universal hierarchy, calendar observance,
or any pre-existing scene fact.
