# Independent verification — ceramic and stone prerequisites

**Scope:** verification of CSP-01–CSP-04 in
`research/population-ceramic-stone-prerequisites.md`. This is not production
authoring. It does not materialize a pot, wheel, kiln, clay, stone blank,
tool, abrasive, water, craft worker, workshop or finished transformation.

## Independently opened sources

1. A. V. Artsikhovskii, [*Основы археологии*, ch. 12 “Русь IX–XIII вв.”
   (1955)](http://historic.ru/books/item/f00/s00/z0000204/st013.shtml), full
   HTML. The pottery paragraph explicitly states: «В IX–X вв. в Киеве,
   Смоленске и Новгороде она делалась уже на гончарном кругу.»
2. Elisabeth H. West, [“Jade: Its Character and
   Occurrence”](https://www.penn.museum/sites/expedition/jade/), *Expedition*
   5(2), 1963, University of Pennsylvania Museum, full HTML. The relevant
   section separately describes reconstructed Mesoamerican jade work and
   archaeological reconstruction for British Columbia/Alaska. It says that
   sawing with thin bone saws plus water and sand was *possible*, records that
   hard-stone pieces were ground/rubbed into shape, and calls the Alaska
   drilling reconstruction *possible*. The article is not evidence for Rus,
   any undifferentiated rock, or a particular medieval toolkit.

## Candidate verdicts

| ID | Verdict | Checked basis | Approved wording (RU / EN) and limits |
| --- | --- | --- | --- |
| CSP-01 | **APPROVE_WITH_LIMITS** | Artsikhovskii directly places wheel-made pottery in ninth–tenth-century Novgorod. The source is an archaeological synthesis, not a 1230 workshop report. | **Новгородская керамика IX–X вв. изготовлялась на гончарном круге.** / **Pottery in ninth–tenth-century Novgorod was made on a potter’s wheel.** Use for 1100–1300 only as inferred/medium technology compatibility. It creates no 1230 wheel, potter, kiln, fuel, clay source, vessel form, output, or rule that every pot was wheel-made. |
| CSP-02 | **APPROVE_WITH_LIMITS after narrowing** | West’s jade examples say Mesoamerican sawing was *probably* done with a metal tool and abrasive; for British Columbia/Alaska, thin bone saws with water and sand were *possible*. These are hard-stone/jade methods, not a universal result for all rocks or blades. | **Подходящая заготовка из твёрдого камня может распиливаться режущим носителем вместе с совместимым абразивом.** / **A suitable hard-stone blank can be sawn with a cutting carrier and a compatible abrasive.** This is an inferred/medium conditional physical possibility, not direct/high universal fact. It requires a known suitable material and actual compatible means; it supplies no arbitrary knife, saw, abrasive, water, time, rate, safety, Rus’ availability or finished cut. |
| CSP-03 | **APPROVE_WITH_LIMITS after narrowing** | West reports hard-stone pieces ground into shape with other stones, and slabs smoothed by rubbing on flat stone covered with sand; the Mesoamerican jade discussion limits rubbing to slight shape modification. | **Подходящая заготовка из твёрдого камня может сглаживаться или ограниченно изменять форму шлифованием/трением по твёрдой поверхности с совместимым абразивом.** / **A suitable hard-stone blank can be smoothed or undergo limited shaping by grinding or rubbing on a hard surface with a compatible abrasive.** Inferred/medium conditional physical possibility. It does not promise that any grit or stone works, efficiency, major reshaping, a blank, grindstone, sand, labour, know-how, intended form or finish. |
| CSP-04 | **NEEDS_EVIDENCE for production as written** | West says the Alaska drilling method was «possibly carried out with flint, or with a stick with water and sand». The same article reports solid reed/bamboo/bird-bone drills in its Mesoamerican jade reconstruction, but it does not establish a universal relation that any hard stone can be perforated with an abrasive medium. | Do not author the submitted universal `hard stone → can be perforated → suitable drill and abrasive` claim. A non-promotable research note may say: **West tentatively reconstructs drilling of some jade/hard-stone material in an Alaska context with flint or a stick plus water and sand.** / **West tentatively reconstructs drilling of some jade/hard-stone material in an Alaska context with flint or a stick plus water and sand.** This is neither a Rus fact nor an empirical guarantee; a material-specific source is required for a general transformation relation. |

## Boundary

CSP-01 is a limited earlier-Novgorod historical technology relation. CSP-02
and CSP-03 are conditional physical-process relations inferred from
hard-stone/jade examples. CSP-04 remains unpromoted: the source’s “possibly”
cannot be normalized into a guaranteed drilling capability. None replaces the
existing clay drying/firing or ceramic-response evidence.

## Exact normalization check

**Verdict: APPROVE_WITH_LIMITS passed.**

* `production-v1/woodwork-ceramics.json` correctly normalizes CSP-01 as
  `claim:ceramic-novgorod-wheel`: Artsikhovskii is the cited scholarly source,
  the source/evidence note preserves its ninth–tenth-century statement, and
  applicability is 1100–1300 / `region_novgorod_land` with
  `attested` / medium / inferred and `domain_internal_only`. The structured
  object and RU/EN runtime text make clear that the 1100–1300 use is an
  inference, not a wheel, potter, kiln, fuel, clay source or compulsory vessel
  method.
* `production-v1/physical-interaction.json` correctly normalizes CSP-02 and
  CSP-03 as `claim:hard-stone-abrasive-sawing` and
  `claim:hard-stone-abrasive-shaping`. Both cite West through
  `evidence:hard-stone-abrasive-working`, use universal scope with
  `attested` / medium / inferred / internal-only qualifiers, and retain
  “suitable hard-stone blank,” compatible means, and limited shaping in their
  structured objects and RU/EN text. They do not promise every rock, knife,
  grit, outcome, rate, finish or Rus’ availability.
* No drilling claim was authored. The West evidence note explicitly retains
  the probable/possible basis and excludes drilling.

Both JSON shards parse and the normalized content matches the independent
verdict without a registry, schema or mapping change.
