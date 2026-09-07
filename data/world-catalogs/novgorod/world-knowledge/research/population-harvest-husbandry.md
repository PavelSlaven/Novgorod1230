# Harvest and husbandry: bounded research set

**Status:** research candidates only; not independently approved and not production data.

## Scope and method

This pass targets missing process premises for harvest/post-harvest and animal
husbandry in the Novgorod c. 1230 envelope.  It deliberately does **not** assert
that a particular household, animal, crop, fodder store, tool, or worker is
present.  Existing pack relations for flax/hemp, hemp tow, hunting, borts,
grain-storage conditions, household storage, ploughshares and a scythe-cutting
use were inspected before drafting; they are not re-proposed as new inventory
or scene facts.

The principal source was opened in the Institute of Archaeology RAS electronic
library and read locally from its corresponding PDF/OCR text.  It is an
archaeological and metallographic synthesis of pre-Mongol Rus, rather than a
claim about one named c. 1230 Novgorod household.

* B. A. Kolchin, *Chernaia metallurgiia i metalloobrabotka v Drevnei Rusi
  (Domongol'skii period)*, MIA 32 (1953), pp. 88–98, especially pp. 90–91 and
  97–98.  The IA RAS record supplies the full PDF and bibliographic identity:
  [IA RAS electronic library](https://archaeolog.ru/el-bib/el-cat/el-series/mia/kolchin-1953),
  [PDF](https://archaeolog.ru/media/series/mia/MIA_32.pdf).
* D. S. Serezhnikova, A. Yu. Sergeev & P. G. Gaidukov, “Isporchennoye zerno
  ili sgorevshii solod?”, *Stratum plus* 2025(5), pp. 87–105,
  [publisher record](https://www.e-anthropology.com/Katalog/Arheologia/STM_DWL_doDd_ETd9O4FRFgBv.aspx).
  The opened abstract places its approximately 500-litre carbonised rye deposit
  in a **mid-fourteenth-century** Novgorod Hanseatic yard.  It was not used for
  any c. 1230 candidate: its date and exceptional deposit cannot establish
  ordinary thirteenth-century storage or malting practice.

## Atomic candidate relations

| ID | Candidate (RU / EN) | Suggested typed relation | Period and applicability | Evidence and directness | Limits / exclusions | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| HH-01 | **Серп применялся для уборки хлеба и трав.** / **A sickle was used to harvest grain crops and grasses.** | `sickle → historically_attested_use → harvesting-crops-and-grasses` | Direct source statement for pre-Mongol Rus; compatible with 1100–1300 Novgorod, inferred regional envelope. | Kolchin, p. 90: “К орудиям уборки урожая и трав относятся серпы и косы”; pp. 90–91 discuss excavated Old Rus sickles, including Novgorod-type forms. | Does not make a sickle present, accessible, or required for every harvest; does not prescribe a harvesting action or yield. | high for the broad Old Rus relation; medium for the c.1230 Novgorod compatibility mapping. |
| HH-02 | **Коса применялась для уборки хлеба и трав.** / **A scythe was used to harvest grain crops and grasses.** | `scythe → historically_attested_use → harvesting-crops-and-grasses` | Direct pre-Mongol Rus relation.  An examined scythe from the Novgorod burial group at Sista is dated XI–XII centuries, a regional antecedent rather than a c.1230 installation. | Kolchin, p. 90 gives the shared sickle/scythe harvest use; pp. 97–98 identify the Novgorod-burial specimen and its XI–XII date. | May overlap the existing generic `household-scythe-cutting` relation; merge rather than duplicate if normalized.  No assertion about a specific field, haymaking calendar, or fodder stock. | high for use and dated regional attestation; medium for the 1100–1300 envelope. |
| HH-03 | **У древнерусского серпа черенок мог иметь деревянную рукоять.** / **An Old Rus sickle tang could carry a wooden handle.** | `sickle → may_have_component → wooden-handle` | Pre-Mongol Rus archaeological material; suitable only as a qualified material/construction premise in the 1100–1300 Novgorod envelope. | Kolchin, p. 91: the tang received a wooden handle, and several archaeological sickles retained wooden handles. | “May have” is essential: no universal construction rule, handle dimensions, ownership, or actual tool availability follows.  Not a harvest recipe. | high. |
| HH-04 | **Ножницы для стрижки овец относились к древнерусскому железному сельскохозяйственному инвентарю.** / **Shears for shearing sheep belonged to the Old Rus iron agricultural-tool assemblage.** | `sheep-shears → historically_attested_use → shearing-sheep` | Broad pre-Mongol Rus cultural/technical compatibility, inferred medium for Novgorod 1100–1300. | Kolchin, pp. 88–89, lists “ножницы для стрижки овец” among the iron and steel agricultural and productive implements of ancient Rus in the chapter on agricultural tools. | This supports only a material process category.  It does not prove sheep at a given site, flock size, seasonal husbandry, wool supply, fodder, or that any NPC can shear animals. | medium. |
| HH-05 | **Новгородская коса XI–XII вв. имела железную основу и стальную рабочую часть (исследованный образец).** / **The examined XI–XII-century Novgorod scythe combined an iron body with a steel working edge.** | `scythe → attested_material_construction → iron-body-plus-steel-edge` | Direct for Kolchin’s analysed XI–XII Novgorod burial specimen; only an inferred, qualified antecedent for the c.1230 envelope. | Kolchin, pp. 97–98: Novgorod burial-group scythe (Sista, kurgan 9) dated XI–XII; metallographic discussion describes the multilayer construction and steel strip/edge. | Not a universal requirement for every scythe, a numerical material specification, or proof that a particular forge/tool exists in 1230.  This is optional material-culture grounding, not a needed gameplay mechanic. | medium-high for the specimen; medium for compatibility. |

## What this pass did not establish

No opened, date-appropriate source in this pass demonstrated a Novgorod-land
1230 chain for winter fodder collection, crop-specific threshing/winnowing, or
ordinary grain-storage construction.  Those must remain unasserted rather than
being inferred from the existence of crop-harvest tools or from the later 2025
German-yard grain deposit.  Scene-level questions—where a haystack or animal
is, who owns it, quantities, feed suitability, and access—belong to authored
state/profile and materialization owners, not this world-knowledge substrate.

## Practical use boundary

HH-01–HH-05 can ground qualitative interpretation of a free attempt involving
an already-authorized sickle, scythe, or sheep-shears.  They cannot authorize
materialization of a crop, fodder, animal, tool, worker skill, harvest result,
or storage supply.  Exact time, labour, body effects, quantities and depletion
remain code/state-owned mechanics.
