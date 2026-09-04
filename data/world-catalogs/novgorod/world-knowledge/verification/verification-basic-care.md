# Independent verification — basic care and sanitation

**Scope:** BC-01–02 only.  This is a source-faithfulness verdict, not medical
advice, a treatment protocol, a historical-practice finding, or approval of a
production record.

## Sources independently opened

- U.S. Centers for Disease Control and Prevention, [“Preventing
  Diabetes-Related Amputations”](https://www.cdc.gov/diabetes/diabetes-complications/preventing-diabetes-related-amputations.html),
  “What to do when you get a cut on your foot,” full page opened on
  2026-09-04.  The instruction is: apply direct pressure to the wound with a
  clean bandage or cloth **to control bleeding**.  The surrounding page is
  diabetes-related foot care; it supplies neither a diagnosis nor a guarantee
  that pressure stops every bleed.
- U.S. Centers for Disease Control and Prevention, [“Guidelines for Personal
  Hygiene During an Emergency”](https://www.cdc.gov/water-emergency/safety/guidelines-for-personal-hygiene-during-an-emergency.html),
  “Protect wounds,” full page opened on 2026-09-04.  It says that open wounds
  exposed to contaminated water can become infected and directs: cover a clean,
  open wound with a **waterproof** bandage to reduce the chance of infection.
  The section is explicitly emergency/contaminated-water guidance.

## Verdict

| Candidate | Verdict | Admissible formulation | Limits |
| --- | --- | --- | --- |
| BC-01 | **APPROVE_WITH_LIMITS — universal conditional mechanism** | **RU:** Прямое давление чистой тканью или повязкой на уже кровоточащую рану может помогать контролировать наружное кровотечение. **EN:** Direct pressure with a clean cloth or bandage on an already bleeding wound can help control external bleeding. | The source directly supports the relation, with an existing wound and bleeding as conditions.  This is a general physical/first-aid relation, not historical compatibility or a diabetes condition for an actor.  It does not establish severity, body location, force, duration, a tourniquet, medical assessment, successful stoppage, healing, survival, clean-material availability, competence, or a historical Rus'/Novgorod practice. |
| BC-02 | **APPROVE_WITH_LIMITS — contamination-specific protective relation** | **RU:** Для чистой открытой раны при релевантном контакте с загрязнённой водой водонепроницаемая повязка может снизить вероятность инфекции. **EN:** For a clean open wound where contaminated-water exposure is relevant, a waterproof bandage can reduce the chance of infection. | Preserve all three bounds: clean/open wound, waterproof bandage, and contaminated-water exposure.  “Can reduce the chance” is not prevention, immunity, healing, sterility, or a guaranteed outcome.  It does not establish present contamination, a bandage or other material stock, wound diagnosis, disease identity, treatment, actor skill, or historical Rus'/Novgorod practice. |

## Boundary

Both rows are non-historical, conditional causal premises.  They may inform a
grounded attempted action only after the wound, relevant clean material or
waterproof cover, access, and exposure conditions are independently present.
They cannot materialize any of those conditions or produce a health outcome.

## Exact normalization re-check

Read-only check of `production-v1/biology-physiology.json` after the BC
normalization:

| Claim ref | Verdict | Exactness and retained limits |
| --- | --- | --- |
| `claim:care-direct-pressure-bleeding` | **APPROVE_WITH_LIMITS** | `tissue-injury-response → responds_to → clean_cloth_or_bandage_direct_pressure_can_help_control_external_bleeding` is the approved conditional relation.  Both RU/EN runtime texts retain “может помогать/can help,” an already bleeding wound, and every exclusion from BC-01.  Universal applicability correctly denotes a non-historical general relation; it does not create care supplies or actor competence. |
| `claim:care-waterproof-wound-cover` | **APPROVE_WITH_LIMITS** | `tissue-injury-response → responds_to → waterproof_bandage_on_clean_open_wound_can_reduce_infection_chance_from_contaminated_water_exposure` retains the indispensable waterproof, clean/open-wound, contaminated-water, and probability bounds.  Both RU/EN texts correctly reject guarantee, sterility, healing, present exposure, stock, diagnosis, skill, and historical practice. |

Both records use the existing `responds_to` predicate, direct/high qualifiers,
`domain_internal_only` access, and the exact CDC evidence anchors.  No new
concept, predicate, owner, or historical-compatibility assertion is introduced.
