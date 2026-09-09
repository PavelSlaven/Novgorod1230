# Independent verification — fur-bearing pelt processing

**Scope:** FPP-01--03 in `research/population-fur-pelt-processing.md` only.
This is an independent source check, not production authoring, a historical
Novgorod claim, or evidence that a pelt, animal, worker, material, tool,
facility, or process is present in a scene.

## Source independently read

Carole Dignard and Janet Mason, [*Caring for leather, skin and fur*](https://www.canada.ca/en/conservation-institute/services/preventive-conservation/guidelines-collections/caring-leather-skin-fur.html),
Canadian Conservation Institute. The complete live page, including **“Skin
structure and processing,” “Rawhide,”** and **“Furs,”** was opened through
browser-harness on 2026-09-04. It is direct for general material/preservation
relations, not archaeological evidence of an Old-Rus technique or supply.

| Candidate | Verdict | Production-safe wording | Exact basis and limits |
| --- | --- | --- | --- |
| FPP-01 | **APPROVE_WITH_LIMITS** | **Обработка шкуры после снятия с животного направлена на её очистку и предотвращение гниения. / Processing a skin after flaying is directed toward cleansing the skin and preventing putrefaction.** | CCI says processing is carried out after removal from a flayed animal “in order to cleanse the skin and prevent putrefaction.” Universal purpose relation only. It prescribes no ordered recipe, universal success, processing method, worker, pelt, water, time, access, historical availability, or resulting object. |
| FPP-02 | **APPROVE_WITH_LIMITS** | **Быстрое охлаждение и своевременная тщательная очистка меховой шкуры могут предотвращать бактериальный рост, который способен ослабить удержание волоса. / Quick cooling and prompt thorough cleansing of a fur-skin can prevent bacterial growth that can loosen the hair.** | CCI **“Furs”** lists quick cooling and prompt thorough cleansing as factors critical for preserving hairs, specifically to prevent bacterial growth risking hair loosening. Keep both `can` qualifiers: no temperature, deadline, cooling method, guarantee, present fresh pelt, or medieval practice follows. |
| FPP-03 | **APPROVE_WITH_REWORDING** | **Физическое повреждение волос при соскабливании или разминании меховой шкуры может препятствовать сохранению волоса. / Physical damage to hairs during scraping or manipulation of a fur-skin can compromise hair preservation.** | CCI says avoiding physical damage to hairs during scraping/manipulation is critical for preserving hairs. The proposed research wording “избегают / is avoided” reads as a general normative procedure; the causal risk wording above preserves the source without making scraping/manipulation mandatory, or supplying a tool, competence, method, outcome, or current pelt. |

## Boundary

All three eligible relations are universal and `domain_internal_only`. They can
qualify an already-established handling or preservation attempt, but cannot
materialize an animal or pelt, determine a tanning route, create a historical
Novgorod recipe, establish a season or facility, or override code-owned time,
resources, access, state and outcomes. The separate rawhide route remains
distinct; it must not be generalized to hair-bearing pelts.

## Exact normalization check — compiled 499

**Verdict: APPROVE_WITH_LIMITS.** The two normalized records in
`production-v1/biology-physiology.json` match the approved FPP-01 and FPP-02
wording and limits exactly.

| Claim ref | Exact-review result |
| --- | --- |
| `claim:flayed-skin-processing-purpose` | Approved. The `supported_fact` literal on `wk:biology_physiology:flayed-skin-preservation` preserves the post-flaying cleansing/anti-putrefaction purpose. RU/EN keep it non-guaranteed and non-sequential, with no method, pelt, actor, material, time, access, historical availability or output. |
| `claim:fur-skin-cooling-cleansing` | Approved. The second literal preserves both qualified measures and the bacterial-growth/hair-loosening pathway. RU/EN retain `могут / can`; no temperature, deadline, cooling technology, guarantee, present fresh pelt, tool, worker or medieval practice is added. |

Both records are universal, `unknown` typicality, high/direct and
`domain_internal_only`, as required for this technical substrate. The existing
CCI source is reused through `evidence:cci-flayed-skin-processing`; it adds no
source, schema, owner, profile or historical-use assertion. FPP-03 was not
normalized and remains an optional, separately reworded candidate.
