# Trapping and non-woody plant use — bounded source check

## Scope and result

This pass sought historical, XII–XIII-century-compatible Novgorod/Rus
relations for a trap process or for the gathering and use of non-woody
grass, reed, or shrub material.  It does **not** turn an animal, a trap, or
a plant stand into a present-world object.  No new promotable atomic claim
was found.  The two nearest direct fishing-trap records are demonstrably
fourteenth-century, while the opened plant evidence establishes remains and
gathering context rather than a reed/grass/shrub material-use process.

## Sources opened

1. E. A. Rybina, [«Промыслы в средневековом Новгороде по археологическим
   материалам»](https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam),
   *Новгород и Новгородская земля. История и археология*, 2015, pp. 211–231;
   p. 220, section on fishing gear.  The article says that birch-bark letter
   no. 248 mentions a *верша*, defined there as a special conical device for
   catching fish, and that no. 965 mentions a *яз* (a river set-net/barrier).
2. HSE / Institute of Slavic Studies, [Birch-bark letter no.
   965](https://gramoty.ru/birchbark/document/show/novgorod/965/), metadata
   and text.  Opened record: Novgorod, conventional date 1340–1360 (with
   possible shift later), stratigraphic date 1340s–1360s; content: fragment
   mentioning a fishing *яз*.
3. Existing approved source rechecked for novelty: M. Monk and P. Johnston,
   [*Perspectives on non-wood plants in the sampled assemblage from the
   Troitsky excavations of medieval Novgorod*](https://www.researchgate.net/publication/333793675_PERSPECTIVES_ON_NON_WOOD_PLANTS_IN_THE_SAMPLED_ASSEMBLAGE_FROM_THE_TROITSKY_EXCAVATIONS_OF_MEDIEVAL_NOVGOROD),
   2012, pp. 283–320.  It is already represented in
   `production-v1/environment-ecology.json` as local-source, gathered-plant,
   and bilberry-context claims.

## Candidate audit

| ID | Proposed relation | Finding and limit | Disposition |
| --- | --- | --- | --- |
| TPU-01 | *верша* → conical fish-catching device | Rybina p. 220 supplies the form/function statement, but the article does not give a XII–XIII date for letter no. 248 in the opened passage.  No independently opened compatible-date primary record was established in this pass. | **NEEDS_EVIDENCE** — do not use as a 1230-compatible trap premise. |
| TPU-02 | *яз* → fishing barrier/set in a river | Rybina p. 220 gives the terminology.  The primary catalogue dates its cited letter no. 965 to 1340–1360. | **REJECT for target period** — late evidence cannot be silently back-projected to 1230. |
| TPU-03 | non-woody plant remains → local/gathered resource context | Already compiled as `claim:troitsky-nonwood-plant-remains-probably-local`, `claim:troitsky-gathered-plants-probably-link-to-southern-deciduous-woodland`, and `claim:troitsky-bilberry-incidence-indicates-northern-heath-clearing-exploitation`. | **DUPLICATE** — no new relation. |
| TPU-04 | reed/grass/shrub → gathered material → ordinary crafted use | The inspected historical plant source does not itself establish this material/process chain for a date-compatible Novgorod context.  Species ecology alone is not historical harvest or use. | **NEEDS_EVIDENCE** — no universal-to-historical leap. |

## Boundaries for a later pass

The useful next source must give both (1) an explicit trap or plant-material
process and (2) a local or broadly Rus XII–XIII date.  A later artefact or a
modern statement that reeds, grasses, or shrubs can be used for something is
not enough.  Existing fishing gear, bow-hunting, borts, hay, hemp, and the
already compiled non-wood-plant context should not be re-authored as new
coverage.

## Follow-up: hunting-device class, and the remaining trapping gap

### Sources actually re-read

1. E. A. Rybina, [«Промыслы в средневековом Новгороде (по археологическим
   материалам)»](https://cyberleninka.ru/article/n/promysly-v-srednevekovom-novgorode-po-arheologicheskim-materialam), *Исторические исследования* 3 (2015), printed pp. 219, 228–231. The full article was re-opened and read. On p. 219 the author says that finds characterising fishing and hunting number in the tens and hundreds, including “various devices for hunting and catching fish.” On pp. 228–231 she treats hunting as a major occupation, then describes archaeological hunting arrows and the distinction from children’s toy arrows. This is an academic synthesis of the Novgorod excavation collection, not a specification of a trap.
2. The official [Birch-bark letter no. 248/249 catalogue
   record](https://gramoty.ru/birchbark/document/show/novgorod/248) was
   re-sought directly; the current route returned HTTP 404, but the catalogue’s
   Google-indexed result exposes its conventional date **1380–1400** and
   stratigraphic date in the 1380s–1390s. Thus it cannot repair the target-date
   gap for the *верша* cited in the earlier pass.

| ID | Candidate relation | Period / region / directness | Evidence and production-safe scope | Disposition |
|---|---|---|---|---|
| TPU-05 | **Охотничьи приспособления → представлены в археологическом материале → средневекового Новгорода.** / **Hunting implements → are represented in the archaeological material → of medieval Novgorod.** | Medieval Novgorod; direct/medium for Rybina’s collection-level synthesis; only inferred/medium as a 1100–1300 compatibility envelope. | Rybina 2015, p. 219 explicitly names numerous hunting devices; pp. 228–231 make clear that the following material concerns hunting and archaeological arrows. This is a category/context premise, narrower and less specific than a trap type. | **CANDIDATE, but not a trap fact.** It can support an independently established historical hunting context without materialising an implement, hunter, quarry, ownership, skill or result. It must not be labelled `trap`, `snare`, `deadfall`, `net`, or any particular mechanism. Check against existing bow and hunting-economy rows before any normalization. |
| TPU-06 | ***верша* → fish-catching device → target-period Novgorod/Rus.** / **A *versha* → fish-catching device → target-period Novgorod/Rus.** | Proposed 1100–1300 envelope is unsupported. | Rybina p. 220 defines the word but relies on no. 248; the independently rechecked catalogue date is 1380–1400. | **REJECT for target period.** Do not promote the terminology/form as c.1230-compatible from this record. |

### Concrete unresolved boundary

No fully read source in this bounded follow-up provided a dated XI–XIII
Novgorod/Rus **trap mechanism** (snare, spring trap, enclosure, deadfall,
trap-net, etc.). Rybina’s collection-level hunting-device sentence is useful
only as the broader historical class above; it cannot be silently narrowed to
trapping. The remaining factual gap is therefore a *specific* dated
trap-method attestation, not permission to infer an ordinary scene’s animal,
trap, bait, placement, legality, ownership, skill or successful catch.

## Follow-up: early-Rus `ловища` / `перевесища` as a qualified trapping class

### Sources independently opened and read

1. S. V. Yushkov, [*Нариси з історії виникнення і початкового розвитку
   феодалізму в Київській Русі*, chapter 2, section I.1](http://litopys.org.ua/yushkov2/yush10.htm)
   (Kyiv, 1939; public scholarly-text reproduction). The full chapter page
   was opened. It reproduces the chronicle passage on Olga: after the
   Novgorod/Msta and Luga dues passage, it names `ловища`, then `перевесища`
   by the Dnieper and Desna. In its discussion, Yushkov places `рибні тоні`,
   beekeeping, `ловища`, and `перевесища` among resource contexts associated
   with early princely estates. This is a historical-text/interpretive source,
   not an excavated trap or proof of a Novgorod installation.
2. G. Dyachenko, [*Полный церковнославянский словарь*, entry
   `Перевесы, перевесь, перевесище, перевесье`](https://dhonorare.ru/dict/dyachenko/?q=%D0%BF%D0%B5%D1%80%D0%B5%D0%B2%D0%B5%D1%81),
   full entry opened in the DHonorare scholarly-dictionary reproduction. The
   entry defines the term as a bird-and-beast catching device made from ropes
   and nets and separately quotes the earlier Rus textual vocabulary. Its
   detailed physical example is a **1604** record, not evidence of a 1230
   construction.

| ID | Candidate relation (RU / EN) | Period, region, directness | Exact evidence and admissible use | Hard limits |
|---|---|---|---|---|
| TPU-07 | **`Ловища` и `перевесища` → названы как → раннерусские категории промысловых угодий/ловчих устройств. / `Lovishcha` and `perevesishcha` → are named as → early-Rus categories of hunting-resource grounds / trapping equipment.** | Early-Rus chronicle tradition, with a passage explicitly including a Novgorod/Msta–Luga administrative setting but locating the named `перевесища` on the Dnieper/Desna. Direct/high for the terms in the textual tradition; 1100–1300 Novgorod-Land compatibility is **inferred / medium**. | Yushkov, chapter 2.I.1, quotes the chronicle wording `ловища ... по всей земли` and `по Днепру перевесища и по Десне`; his surrounding discussion groups them with fish grounds and beekeeping as resource contexts. Dyachenko's lexical entry independently identifies `перевесь/перевесище` as a catching category. Useful only as a broad historical subsistence/trapping **class** after a separate actual source, access, and scene context exist. | Does not prove a current trap, net, rope, post, tree, bait, hunting ground, animal, capture, owner, right, princely estate, staff, or Novgorod site. It does not make the chronicle's Dnieper/Desna places part of Novgorod geography. |
| TPU-08 | **`Перевесь` → в лексикографическом описании → связывается с верёвками и сетями для ловли птиц/зверей. / `Pereves` → in the lexicographic description → is associated with ropes and nets for catching birds/beasts.** | The lexical meaning is directly stated; date-specific configuration is not. For a 1100–1300 mechanism this is **NEEDS_EVIDENCE**, not a direct historical assertion. | Dyachenko entry: `ловушка птиц и зверей, состоящая из веревок и сетей`; the entry's concrete arrangement is explicitly illustrated by a 1604 document. | **Do not normalize as a 1230 rope/net prerequisite or recipe without an independent XI–XIII technical attestation.** No spring action, loop, trigger, placement, target species, trapping success, material availability, or actor skill follows. Retained only to prevent a later verifier from mistaking the lexical definition for target-period physical evidence. |

### Result and remaining gap

TPU-07 supplies a cautious historical **class** relation that the earlier
pass lacked. TPU-08 deliberately remains non-promotable: it isolates the
chronology fault in the tempting rope-and-net reconstruction. A dated
XI–XIII Novgorod/Rus technical source is still needed for any specific trap
mechanism; no current trap or subsistence result may be inferred from either
row. Independent verification is required before authoring.
