# Branch and evidence limitations

The exact local branch/PR containing the stated P00–P27 implementation was not available in this environment. The observed canonical `main` SHA was `9f2a8c1477793e3baac376d558a64b1b2272cc4a`, but this package is not presented as proof that the later implementation branch accepts the bundle unchanged.

Consequently:

- the package resolves and approves the requested source catalogues;
- it supplies a formal target compilation pipeline and strict validators;
- it does not claim that branch-specific DTOs, migrations or importer adapters were executed;
- it does not claim a PostgreSQL import, runtime readback, new-game E2E or composition switch;
- it does not fabricate signed P27 evidence or fresh-checkout evidence.

A mismatch between this package and the actual branch contracts is `p12_branch_contract_mismatch` and remains a hard block until corrected in the one existing PR.
