# Tools inventory

Tools are autonomous and are not imported by production runtime.

| Tool | Responsibility | Runtime side effects |
|---|---|---|
| `@rus/map-maker` | Import approved graph contracts, create separate layout sidecars and previews | No canonical DB writes |
| `@rus/db-tools` | Build and validate dry-run/approval packages | No SQL execution |
| `@rus/docs-tools` | Documentation graph/RAG helpers and deterministic generated references | Writes generated documentation only through explicit CLI |
| `@rus/audit-tools` | Safe release/audit tree manifests | Read-only source scan |
| `@rus/shadow-run` | Execute allowlisted old/new parity corpus and classify differences | Runs test processes and writes dated reports; no provider/DB/cutover |
| `@rus/cutover` | Execute versioned 13-step cutover with repeated gates and import proof | Writes cutover evidence only; no live environment mutation |
| `@rus/finalization` | Aggregate release evidence and separate automated completion from manual owner gates | Writes finalization evidence only; no secrets, deployment mutation or deletion |

`@rus/finalization` owns `rus.finalization_plan.v1` and `rus.finalization_report.v1`. Missing operator evidence produces `automation_complete_manual_hold`, never implicit approval.
