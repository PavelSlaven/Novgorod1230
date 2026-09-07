# Independent verification — fodder-practices candidates

**Scope:** FP-01--FP-03 in `research/population-fodder-practices.md` only.
This review does not create a horse, hay, pasture, ration, stable, owner,
season, storage arrangement or feeding action in a scene.

## Sources independently opened

- HSE / Institute for Slavic Studies RAS, [Novgorod birchbark letter
  no. 986](https://gramoty.ru/birchbark/document/show/novgorod/986/).  I read
  its catalogue record and surviving text: it is a fragmentary Novgorod
  household/business record from the Troitsky excavation, conditionally
  1180–1200 (with possible earlier shift), stratigraphically 1160s–mid-1190s,
  and externally placed in the last quarter of the XII–first quarter of the
  XIII century.  The corpus’s Russian translation of the surviving account
  contains the `за сено две резаны` entry.
- Nettie R. Liburt, [“Feeding Practices in Horses and Other
  Equids”](https://www.merckvetmanual.com/management-and-nutrition/nutrition-horses/feeding-practices-in-horses-and-other-equids), *Merck Veterinary Manual*, professional version, reviewed/updated February 2026.  The opening statement was read: most healthy horses should have access to hay and/or pasture forages, with stated modern management qualifications.

| Candidate | Verdict | Production-safe wording (RU / EN) | Checked basis and limits |
|---|---|---|---|
| FP-01 | **APPROVE_WITH_LIMITS** | **Сено упомянуто в фрагментарной новгородской хозяйственной записи, датируемой поздним XII — ранним XIII веком. / Hay is mentioned in a fragmentary Novgorod household record dated to the late twelfth–early thirteenth century.** | Letter 986 directly supports a dated hay/account context, not a haymaking, pasture, fodder-storage, price system, quantity, owner, animal or current object. Its date is a range with a stated possible earlier shift; it is not an exact 1230 record. |
| FP-02 | **APPROVE_WITH_LIMITS** | **Сено и пастбищный фураж являются кормом для здоровых лошадей. / Hay and pasture forage are feeds for healthy horses.** | Merck’s opening statement supports the universal biological feed relation. Exclude its modern “free access,” fresh water, salt, concentrate, dry-matter, acreage, health-management and numeric advice; it is not evidence of medieval Novgorod husbandry or of a specific horse’s diet. |
| FP-03 | **NEEDS_EVIDENCE** as a standalone production claim | **Do not normalize separately.** The only safe use is a planner-side composition: historically dated hay context + an independently materialized horse context + FP-02 may make a proposed hay-feeding attempt physically/historically compatible. | This is an inference assembled from separate premises, not a source-attested Novgorod practice. It must not become a fact that horses were fed hay, especially in winter, nor create animal, hay, possession, ration or outcome. A dated source explicitly linking animal care to fodder is required for such a historical-practice claim. |

## Approval boundary

FP-01 and FP-02 are separately production-eligible only in the narrow wording
above.  They may coexist compositionally when code/world state has already
supplied actual hay and a horse, but neither grants access to either nor fixes
animal care mechanics.  FP-03 is an inference boundary, not a third factual
record.

## Exact normalization check — `production-v1/agriculture-fauna.json`

**Verdict: APPROVE_WITH_LIMITS passed.** I read the two new source, evidence,
concept, claim and RU/EN localization records.

| Claim ref | Exact-review result |
|---|---|
| `claim:fodder-hay-account` | Approved: `source:novgorod-letter-986` and its translation/date anchor correctly retain the fragmentary late-XII/early-XIII Novgorod account.  The 1100–1300 regional envelope is medium/inferred, and the bilingual text explicitly excludes haymaking, feeding, winter storage, price, quantity and present stock. |
| `claim:fodder-healthy-horse-forage` | Approved: `source:merck-equine-feeding` correctly anchors the universal biology relation.  The record is universal/common/high/direct and internal-only; its bilingual limits exclude medieval practice, individual diet/health, material presence, access, ration and outcome. |

FP-03 was correctly not imported.  No production correction is required.
