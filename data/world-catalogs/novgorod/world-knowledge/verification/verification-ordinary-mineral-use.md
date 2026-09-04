# Independent verification — ordinary mineral use

**Scope:** OMU-01–02 only.  This is a source-verification verdict, not
production authoring or evidence of a present stone, abrasive, workshop, or
iron tool.

## Source independently checked

- B. A. Kolchin, [*Chernaia metallurgiia i metalloobrabotka v drevnei Rusi
  (domongol'skii period)*](https://archaeolog.ru/media/series/mia/MIA_32.pdf),
  *Materialy i issledovaniia po arkheologii SSSR* 32, Moscow, 1953, chapter
  “Tekhnika metalloobrabotki,” printed pp. 109–110.  I reopened the official
  IA RAS PDF and independently read the matching local PDF text.  Page 109
  says metal was ground with wheels and bars made of natural stone, naming
  sandstone, emery, and corundum among archaeological examples.  Page 110
  says the frequently found small whetstone bars could only serve to sharpen
  blades dulled in use, including knives, shears, scythes, and similar tools.

## Verdict

| Candidate | Verdict | Admissible formulation | Limits |
| --- | --- | --- | --- |
| OMU-01 | **APPROVE_WITH_LIMITS** | **RU:** Малый оселок в описанном древнерусском археологическом контексте мог служить для заточки затупившейся режущей кромки. **EN:** In the described Old Rus archaeological context, a small whetstone bar could serve to sharpen a dulled cutting edge. | Direct for Kolchin’s functional interpretation; broad pre-Mongol Rus corpus.  Compatibility with Novgorod Land 1100–1300 is inferred/medium only.  Do not convert it into a particular local find, any stone, an edge-maintenance outcome, skill, abrasion rate, ownership, access, or present tool. |
| OMU-02 | **APPROVE_WITH_LIMITS** | **RU:** В описанном древнерусском археологическом материале точильные круги и бруски из натурального камня использовались для обточки металла. **EN:** In the described Old Rus archaeological material, natural-stone grinding wheels and bars were used for metal grinding. | Direct for the reported material/function association; broad pre-Mongol Rus corpus, Novgorod Land 1100–1300 inferred/medium.  Sandstone, emery, and corundum are examples in that archaeological corpus—not interchangeable local supplies.  No claim that every rock abrades iron, that a resource is available, or that a wheel/bar, workshop, power drive, time, or successful finish exists. |

## Normalization boundary

The two facts may provide historical compatibility only after a real
whetstone/grinding implement and an actual edge-maintenance attempt are
otherwise grounded.  They do not replace the existing conditional physical
abrasion relations and must not materialize stone or mineral stock.

## Post-normalization check (481)

Checked `production-v1/historical-processes.json` after root normalization:

| Production record | Verdict |
| --- | --- |
| `claim:stone-whetstone-edge-maintenance` | **MATCHES_APPROVAL.** Reuses `wk:material_culture:stone` with `supported_fact` literal limited to Kolchin’s small-whetstone/dulled-edge relation.  The 1100–1300 `region_novgorod_land` envelope is marked inferred/medium, and `domain_internal_only` prevents it becoming default actor knowledge.  RU/EN runtime text retains the limits against any stone, local find, present implement, or successful sharpening. |
| `claim:stone-grinding-metal-use` | **MATCHES_APPROVAL.** Its literal retains natural-stone wheels/bars and metal grinding rather than an arbitrary-rock property.  The same 1100–1300 regional inferred/medium and internal-only limits are present.  RU/EN runtime text correctly excludes a local mineral stock, wheel, workshop, and finished result. |
| `evidence:kolchin-stone-abrasives` | **MATCHES_APPROVAL.** It reuses `source:ha-firesteel` for Kolchin MIA 32, anchors printed pp. 109–110 and names the pre-Mongol-Rus versus inferred Novgorod boundary. |

No production change was made in this verification pass.
