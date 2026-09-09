# Independent verification — oily or fatty skin-film candidate

**Candidate commit:** `1ff05f837ea5f8ab1691240135d7fd3864ea7449`
**Candidate file:** `production-v1/place-skin-fat-context-v1.json`
**Author:** `/root/place07_ecology_dye_research`
**Reviewer:** `/root/place06_verify_publish`
**Review basis:** separate review of frozen claim, its RU/EN localizations,
evidence and exclusions. Reviewer did not author or alter candidate material.

## Source access actually checked

[DermNet, *Emollients and moisturisers*](https://dermnetnz.org/topics/emollients-and-moisturisers)
was opened and read through official-page fallback. The page names Dr Libby
Whittaker (2022) and dermatologist Dr Amanda Oakley (2016), and says that
occlusive agents provide a hydrophobic/lipophilic oil layer on skin, forming a
protective barrier that reduces evaporative water loss from the stratum corneum.
It separately says emollients can contain oily substances and lists defined
occlusive ingredients/products. It also documents product-specific risks and
does not identify arbitrary fats/oils as universally suitable occlusives.

Local `browser-harness` was attempted first but Chrome CDP required user
approval for remote debugging. Official-page fallback was used; no paid/cloud
browser was used. `/root/place06_verify_publish/dermnet_navigation` supplied
navigation only; no source passage or verdict is attributed to it.

## Verdict

### `claim:place-skin-oily-or-fatty-surface-film-can-reduce-evaporative-water-loss` — APPROVE

**Evidence checked:** `evidence:place-skin-fat-context-oily-film`.

DermNet directly supports the physical mechanism for an occlusive,
hydrophobic/lipophilic oil layer. The candidate makes the necessary composition
and continuity condition explicit: an oily or fatty application must actually
remain as a continuous hydrophobic surface film. This prevents the source from
being misread as a classification of all fats/oils as emollients or as a
treatment claim. `medium` / `inferred` is appropriate because the source
describes defined occlusive agents and formulated products, while the candidate
states a conditional physical transfer to an ordinary application.

Limits: no claim that any particular fat, oil, wax, or homemade preparation
forms or retains such a film; no emollient classification, tolerability,
hydration of a particular person, clinical treatment, cure, diagnosis,
historical medicine, recipe, dosage, lesion outcome, burn care, weeping-skin
use, infection management, antimicrobial action or current world state.

## Decision

The exact frozen claim and RU/EN texts are **APPROVE** within these limits.
Promotion still requires the existing machine-readable verification record
bound to this candidate commit and current claim digest; this report adds no
ledger, descriptor, runtime bundle or activation.
