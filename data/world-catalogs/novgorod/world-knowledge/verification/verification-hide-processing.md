# Independent verification — hide processing

**Scope:** HLP-04–05 only.  HLP-01–03 are outside the current gap and are not
reviewed or imported by this verdict.

## Source independently opened

- Lina Falcão and Maria Eduarda M. Araújo, [“Vegetable Tannins Used in the
  Manufacture of Historic Leathers”](https://pmc.ncbi.nlm.nih.gov/articles/PMC6099987/),
  *Molecules* 23 (2018), 1081, §1 “Introduction.”  Full PMC text was opened
  on 2026-09-04.  It calls tannins vegetal polyphenolic compounds that can
  precipitate proteins; says their technological application is stabilization
  of animal-skin protein against putrefaction; describes vegetable tanning as
  treatment of a previously prepared skin with crushed vegetal material or
  vegetal liquor/maceration, infusion, decoction, or extract; and attributes
  the result to chemical bonds between collagen and vegetal tannins.  The
  source’s historical examples are European; it is not evidence for Rus' or
  Novgorod practice.

## Verdict

| Candidate | Verdict | Admissible formulation | Limits |
| --- | --- | --- | --- |
| HLP-04 | **APPROVE_WITH_LIMITS — universal process only** | **RU:** Растительное дубление обрабатывает предварительно подготовленную шкуру растительным материалом или раствором, содержащим дубильные вещества. **EN:** Vegetable tanning treats a previously prepared skin with plant material or a liquor containing tannins. | §1 directly supports this process class.  The source’s list of washed/limed/dehaired/fleshed/delimed stages describes its succinct account, **not** a universal mandatory recipe or an ordered action list for every hide.  Do not localize it to Novgorod/Rus, supply a plant/bark, vessel, pit, water, duration, concentration, worker, access, or a successful output.  A separate historical source is required for any 1100–1300 Novgorod compatibility claim. |
| HLP-05 | **APPROVE_WITH_LIMITS — universal chemistry only** | **RU:** При растительном дублении химические связи между коллагеном шкуры и растительными дубильными веществами стабилизируют материал, делая полученную кожу более устойчивой к гниению. **EN:** In vegetable tanning, chemical bonds between hide collagen and vegetable tannins stabilize the material, making the resulting leather more resistant to putrefaction. | §1 supports the collagen/tannin mechanism and stable, non-putrescible leather result.  It does not establish that every leather was vegetable-tanned, prove a particular hide finished tanning, or provide duration, ratio, water resistance, mechanical durability, named plant availability, actor knowledge, or historical Rus'/Novgorod use.  Keep it `domain_internal_only`; elapsed time, resource consumption, spoilage and outcomes remain state/mechanics. |

## Separation rule

These are universal physical/chemical relations and can compose only after a
real prepared hide and appropriate tannin-bearing treatment are otherwise
grounded.  European historical discussion in Falcão/Araújo does not create a
Novgorod tanning context.  Rawhide drying, alum tawing, vegetable tanning,
leather cutting, and fur dressing remain distinct processes.

## Post-normalization check (484)

Checked `production-v1/leather-plant-fibre-water.json` after normalization.

| Production record | Verdict |
| --- | --- |
| `claim:vegetable-tanning-prepared-hide` | **MATCHES_APPROVAL.** It uses the existing `wk:material_culture:vegetable-tanned-leather` with a conditional `requires_condition` literal for prepared hide plus tannin-bearing plant material/liquor. Universal/high/direct and `domain_internal_only` correctly keep this as chemistry/process, without a Rus'/Novgorod time-place envelope. RU/EN text retains the non-recipe, no-plant/vessel/stock/access/duration/result, and distinct-process limits. |
| `claim:vegetable-tanning-collagen-stabilization` | **MATCHES_APPROVAL.** Its `responds_to` literal confines the relation to collagen–vegetable-tannin stabilization against putrefaction; universal/high/direct and internal-only are correct. RU/EN text retains no all-leather inference, no completed hide, no water-resistance/strength/duration/ratio/plant/knowledge/history claim. |
| `evidence:vegetable-tanning-collagen` | **MATCHES_APPROVAL.** The Falcão/Araújo source and §1 anchor are exact, and the evidence note preserves universal-only status and rejects both Rus'/Novgorod attestation and a mandatory preparation recipe. |

No production change was made in this check.
