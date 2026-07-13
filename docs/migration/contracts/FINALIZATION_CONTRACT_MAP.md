# Finalization contract map

| Contract | Owner | Input | Output |
|---|---|---|---|
| `rus.finalization_plan.v1` | `@rus/finalization` | versioned evidence paths, four manual gates, safety policy | validated immutable plan |
| `rus.finalization_report.v1` | `@rus/finalization` | evidence digests, automated checks, parsed manual checklist | decision and blocking reasons |
| Manual delete checklist | project owner | operator evidence and owner decision | human approval only |

`@rus/finalization` is read-only with respect to runtime, deployment and legacy source. It never consumes secrets and never authorizes automatic deletion.
