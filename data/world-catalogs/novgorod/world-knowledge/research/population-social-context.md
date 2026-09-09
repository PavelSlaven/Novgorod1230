# Population research: social, legal, economic and Christian context

**Status:** factual research candidates only. No row is self-approved or a
runtime rule. The scope is practical social context for Novgorod c. 1230:
exchange, debt, claims, work and ordinary Christian textual/calendar context.
A historically compatible relation never establishes a particular NPC’s debt,
property, literacy, belief, occupation, authority, witness, claim, document or
successful remedy.

## Source register

- **S1 — Birch-bark letter no. 73,** [Old Russian Birch-Bark Documents
  corpus](https://gramoty.ru/birchbark/document/show/novgorod/73/). Novgorod,
  conventional date 1220–1240; stratigraphic date 1220s–1230s; business record,
  debt record. The corpus supplies edition metadata and the text/translation
  (“Semen and his brother owe 3 grivnas”). Direct local evidence.
- **S2 — Letter no. 224,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/224/).
  Novgorod, conventional and stratigraphic 1220s–1230s; business-record
  fragment classified as a debt list/record. Direct local evidence, but
  fragmentary and untranslated.
- **S3 — Letter no. 510,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/510/).
  Novgorod, conventional 1220–1240; stratigraphic late XII–first half XIII,
  preferably no later than the 1230s. Classified as an official judicial
  record; its translation names a complaint, guarantor, sale of a settlement,
  people/cattle/mares/rye, debt and demanded compensation. Direct but single
  dispute record.
- **S4 — Letter no. 600,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/600/).
  Novgorod, conventional 1220–1240; stratigraphic 1210s–1240s; private letter
  about a river lawsuit and two men sent in connection with it. Direct evidence
  of a particular communication, not a procedural code.
- **S5 — Letter no. 76,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/76/).
  Novgorod, 1200–1220, stratigraphically late XII–first quarter XIII; business
  fragment classified as mentioning a hired worker. Near-period local evidence,
  not a contract form or status taxonomy.
- **S6 — Letter no. 524,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/524/).
  Novgorod, c. 1160–1180; a private letter classified as a loan request. Broad
  medieval-Novgorod compatibility only, not direct 1230 evidence.
- **S7 — Letter no. 545,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/545/).
  Novgorod, conventionally 1180–1200 and stratigraphically extending into the
  early XIII century; ecclesiastical text, commemoration/name list and/or icon
  order. Near-period, interpretation explicitly disjunctive.
- **S8 — Letter no. 913,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/913/).
  Novgorod, 1050–1075; ecclesiastical calendar record listing autumn/early
  winter feasts. It proves an earlier local calendar-text context, not the
  exact calendar use of 1230.
- **S9 — Letter no. 507,** [same corpus](https://gramoty.ru/birchbark/document/show/novgorod/507/).
  Novgorod, 1200–1220; classified as an exegetical fragment on the Lord’s
  Prayer. Near-period evidence of Christian textual context, not proof of any
  person’s piety or literacy.

## Atomic compositional candidates

| ID | Candidate — RU / EN | Suggested typed relation | Period, applicability and directness | Evidence | Limits, exclusions and gameplay use |
| --- | --- | --- | --- | --- | --- |
| SOC-01 | **Долговая запись фиксирует должников и счётную величину. / A debt record fixes debtors and an accounting amount.** | `debt_record → records → {debtor_party, amount, unit}` | Novgorod 1220s–1230s; direct. | S1, corpus metadata and translation. | No interest, due date, collateral, enforcement or present debt. Supports a materialized obligation record with parties and unit. |
| SOC-02 | **Долговой список — засвидетельствованный деловой тип записи. / A debt list is an attested business-record type.** | `written_business_record → may_record → multiple_debt_entries` | Novgorod 1220s–1230s; direct classification, text fragmentary. | S2. | Does not establish the entries’ amounts, creditor, validity or universal literacy. Supports a document category only. |
| SOC-03 | **Просьба о займе засвидетельствована в новгородском письме. / A request for a loan is attested in a Novgorod letter.** | `person → may_request → loan_or_advance` | Broad medieval-Novgorod envelope, c. 1160–1180; inferred medium for c.1230 compatibility. | S6, metadata and translation. | Not a local-1230 loan law, credit entitlement, interest rule or actual available lender. |
| SOC-04 | **Гарант/поручитель упомянут в споре о сделке с селом. / A guarantor/surety is mentioned in a dispute over a settlement transaction.** | `guarantor_claim → may_relate_to → transaction_and_obligation` | Novgorod 1220–1240; direct, one record. | S3, lines 29–40 / Russian translation. | Not a universal surety rule, entrusted-custody doctrine, or authority to seize property. A concrete guarantee needs its own committed parties/terms. |
| SOC-05 | **Письменное обвинение могло связывать сделку, долг, имущество и требование возмещения. / A written complaint could link a transaction, debt, property and requested compensation.** | `legal_complaint_record → may_assert → {transaction, debt, property, compensation_claim}` | Novgorod c.1220–1240; direct document contents. | S3. | It records an allegation/demand, not a verified title, court outcome, tariff or sanction. Enables competing claims, not automatic adjudication. |
| SOC-06 | **В данном споре перечислены люди, скот, кобылы и рожь как затронутые объекты. / The record names people, cattle, mares and rye as items affected in the dispute.** | `dispute_record → may_reference → people_and_moveable_or_produce_assets` | Novgorod c.1220–1240; direct but case-specific. | S3, lines 30–37. | Do not treat persons as property categories, infer a household inventory, or create animals/grain. The source reports one party’s complaint. |
| SOC-07 | **Тяжба могла быть предметом сообщения и направления людей. / A lawsuit could be the subject of communication and dispatch of people.** | `dispute_context → may_involve → message_or_representative_dispatch` | Novgorod 1220s–1240s; direct case communication, inferred medium as generic relation. | S4, lines 22–36. | These are not attested legal witnesses, mandatory summonses, court officers or a fixed procedure. A messenger/representative needs scene-specific authority. |
| SOC-08 | **Упоминание наёмного работника есть в деловой записи раннего XIII века. / A hired worker is mentioned in an early-13th-century business record.** | `hired_work_relation → historically_attested_in → novgorod_business_context` | Novgorod 1200–1220; near-period direct corpus classification. | S5, lines 8–19. | No wage rate, term, task, free/dependent legal status, competence or worker NPC is implied. |
| SOC-09 | **Гривна служит счётной единицей в долговых/заёмных записях. / The grivna functions as an accounting unit in debt/loan records.** | `accounting_unit.grivna → occurs_in → debt_or_loan_record` | S1 direct c.1230; S6 comparative earlier local record. | S1 lines 21–30; S6 lines 23–32. | Not a coin, fixed silver mass, exchange rate, price list or inventory item. Store a value with its unit and transaction context. |
| REL-01 | **Списки имён связаны с церковным поминанием и/или заказом икон. / Name lists are associated with church commemoration and/or icon orders.** | `name_list → may_have_ecclesiastical_context → commemoration_or_icon_order` | Novgorod, late XII–early XIII stratigraphic envelope; direct classification with explicit alternative. | S7, lines 8–20. | No named church, feast, clergy, ritual performance, icon or participant is created. Keep the “and/or” uncertainty. |
| REL-02 | **В Новгороде засвидетельствована календарная запись церковных праздников. / A calendar record of church feasts is attested in Novgorod.** | `church_calendar_record → lists → feast_days` | Local XI-century evidence; broad inherited Christian-context compatibility for 1230 only, inferred medium. | S8, lines 8–19 and text. | Do not import exact dates, fast rules, obligations, attendance or a 1230 local liturgical calendar without a target-period source. |
| REL-03 | **Христианский экзегетический текст присутствует в ранне-XIII-вековой городской письменности. / A Christian exegetical text occurs in early-13th-century urban writing.** | `christian_textual_context → historically_attested_in → novgorod_early_13c` | Novgorod 1200–1220; direct corpus classification. | S9, lines 8–20. | This is not a test of belief, clergy status, doctrine knowledge or literacy of an actor. |

## Evidence boundary and unresolved gaps

The sources above provide **local documents**, not a full Novgorod legal code.
No candidate establishes an exact sanction, court composition, testimony rule,
oath, custody/bailment rule, land title, inheritance rule, coin rate, wage,
or a universal status hierarchy. In particular, S4 records people sent about a
lawsuit, but does **not** prove a witness procedure; S3’s `поручитель` is a
guarantor in one dispute, not evidence for a general custody doctrine.

The *Russkaya Pravda* tradition can be a research lead for wider Rus legal
vocabulary, but this shard does not promote it as local Novgorod-1230 authority
because no directly readable primary-text anchor was recovered in this pass.
Later Novgorod court charters are excluded as anachronistic for 1230.

## Statistics and limitations

| Measure | Count |
| --- | ---: |
| Atomic candidates | 12 |
| Direct c.1220–1240 Novgorod candidates | 7 |
| Near/broader medieval Novgorod candidates | 5 |
| Exact legal sanctions, coin rates or modern-law claims | 0 |

**Research limit:** these relations support compositional scene reasoning only:
an actual debt, claim, labour arrangement, messenger, document, calendar,
commemoration or religious object still needs independent causal basis,
authority, identity and persisted state. No candidate is an action list,
recipe, profile, permission or evidence for a specific NPC.
