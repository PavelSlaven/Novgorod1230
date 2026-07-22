# Evidence signature and fresh-checkout policy

## P27 signed audit evidence

Valid evidence must be produced by the independent critic for the exact integration commit. It must bind the commit SHA, verdict, audit payload digest, changed-file manifest and test-result digests, and carry a verifiable signature from an identified key. A copied report, unsigned JSON, assistant-authored signature or placeholder is invalid.

## Fresh-checkout evidence

Valid evidence must be generated from a newly created checkout of the exact commit. It must record clean status before and after, tool versions, dependency installation, RAG and Graphify readiness, targeted validators, isolated database dry-run/import/readback/rollback, full tests and resulting digests.

## Fail-closed rule

Missing, malformed, stale, differently pinned or unverifiable evidence keeps P28 blocked. The evidence templates in this package have `status=template_not_evidence` and are designed to fail activation verification.
