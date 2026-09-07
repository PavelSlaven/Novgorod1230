# Independent verification — young bird and poultry handling candidate

**Candidate commit:** `b274091285cc4e0e650fa158c9712a7f781bf41c`
**Candidate file:** `production-v1/place-young-bird-poultry-handling-v1.json`
**Author:** `/root` using research by `/root/place08_fauna_research`
**Reviewer:** `/root/place08_verify_birds`

## Source access actually checked

The reviewer independently read the Wildlife Center of Virginia, WERC, and
Merck official pages. Browser Harness could not attach because Chrome required
local remote-debugging permission; the official-page fallback was therefore
used. Penn State's page itself returned 403 through that fallback, but its
official indexed transcript was available and was read; it identifies Emily
Shoop and gives the stated whole-body and wing-restraint guidance.

- Wildlife Center of Virginia, *Baby Bird Season Is Here: What to Do When You
  Find a Young Bird* (29 April 2026), “Fledglings: Meant to be on the ground”
  and “Nestlings: Help them get back home”: fully feathered birds able to hop
  or flutter may be fledglings; few- or no-feather nestlings may be returned to
  a located, safely reachable nest.
- Wildlife Education and Rehabilitation Center, *Found A Baby Bird*, “Baby
  Birds”: bare/barely feathered nestlings may be put back; a feathered
  fledgling is left alone unless injured, and nearby cats may be removed or the
  bird moved within a 20-foot radius.
- Yuko Sato, *Physical Examination of Backyard Poultry*, Merck Veterinary
  Manual (reviewed November 2024): folded wings close to the body, breast/body
  support, no breast compression; the listed emergency signs are acute
  hemorrhage, head trauma, seizures or other neurologic signs, open fractures,
  extreme respiratory difficulty, and weakness.
- Emily Shoop, *Handling Poultry*, Penn State Extension, “Handling
  demonstration”: restrain wings, lift the whole body rather than wings alone,
  support with one arm and cover wings with the other.

## Verdicts

### `claim:place-feathered-mobile-young-bird-on-ground-can-be-a-fledgling` — APPROVE

The Wildlife Center directly supports the bounded combination of fully
feathered, hopping or fluttering, and likely fledgling. Ground presence alone
does not establish orphaning or injury. It does not identify species, current
health, parents, nest, abandonment, or outcome.

### `claim:place-young-bird-plumage-and-immediate-danger-bound-intervention` — APPROVE

The two sources support returning a nearly bare or sparsely feathered nestling
only to an accessible known nest if possible, and WERC's cat-specific choice
to remove cats or move a feathered fledgling nearby. The claim and both
localizations now preserve the cat limitation: they are not a general-danger,
handling, feeding, treatment, distance, parent-response, or survival rule.

### `claim:place-brief-domestic-fowl-examination-supports-body-and-folded-wings-without-chest-compression` — APPROVE

Merck and Penn State support whole-body support with wings restrained close to
the body; Merck directly supports avoiding breast compression because it
compromises breathing. This remains qualitative: no species-specific protocol,
force, duration, diagnosis, treatment, or safety guarantee is supplied. The
final RU/EN wording correctly limits the breathing point to avoiding
interference rather than inventing a separate procedure.

### `claim:place-poultry-observable-emergency-signs-bound-casual-examination` — APPROVE

Merck directly lists the six retained observable emergency-sign categories.
The claim correctly treats them as reasons to stop casual examination and
recognize an emergency-care need; it does not diagnose cause, promise care,
assert specialist availability, prescribe treatment, or promise an outcome.

## Decision

All four claims, their evidence, source metadata, and RU/EN localizations are
**APPROVE** for the exact candidate SHA above. The two earlier
`REQUEST_CHANGES` verdicts for `d9168c3c32259294d2d71d3c00c5ffc71badec1bdd`
and `5b9c3c32259294d2d71d3c00c5ffc71badec1bdd` are superseded by the corrected
candidate. This review adds no ledger, production-data edit, runtime artifact,
vector, commit, or push.
