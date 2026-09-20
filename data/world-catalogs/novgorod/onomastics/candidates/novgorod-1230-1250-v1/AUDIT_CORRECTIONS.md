# Onomastic candidate audit corrections

Status: candidate notes only. This appendix does not approve, import, or activate the pack.

## Applied corrections

- Old `tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json` stays draft and is not an input to compilation.
- Compiled subset contains only exact evidence-bound `A1`/`A2` entries. `B1` remains contextual authoring-only; `B2`, `X`, pending and rejected entries are excluded.
- Four roles absent from the research mapping were restored from the canonical role map: `nov_role_boyar_man`, `nov_role_boyar_house_mistress`, `nov_role_foreign_guest`, `nov_role_smerd_householder`. Generated coverage is 71/71 roles and 30/30 social positions.
- `Ростислав (Михаил)` is rejected: the cited 1230 passage identifies Михаил as Ростислав's father, not a baptismal-name pair.
- `Мстислав (Георгий)` remains `needs_review`; no compiled pairing.
- `Иголанд`, Turkic names, out-of-window names, and Baltic-West names stay rare contextual authoring inputs. Unknown ethnic origins return a typed gap; no Russian fallback.
- `Rolf` is not attributed a merchant role and remains `needs_review`.
- `Марена`, `Милуша`, and `Милослава` are rejected as unsupported by supplied evidence.
- `Ольга` and `Елена` are `B2 needs_review`, not marked historically impossible.
- Corpus occurrence counts remain evidence notes only. Every compiled tradition has explicit editorial weight `1`; variants share one weighted entry.
- Social position and occupation may change form or priority, never first-name eligibility. Dynastic and monastic state are explicit admissions.
- Patronymic requires a committed father relation and is projected only through actor knowledge. Tonsure preserves the prior name.

## Approval boundary

`approval-request.json` requests independent per-entry review. Candidate author cannot self-approve. Runtime import and activation remain `false`.
