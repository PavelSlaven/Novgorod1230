# Stage 13 — g5-materialization

Code-only Stage 13 materializes G5 from the G4-scoped immutable projection of
the exact verified runtime import, approved profiles/rules and versioned RNG.
Its trace stores the domain pin as `catalog_digest` and the G5 projection as
`catalog_bundle_digest`; the allowed template set is preserved as auxiliary
artifact 1300 for Stage 14 exact-pin audit. It never calls an LLM materializer
and blocks on missing required candidates. LLM may run only the separate
Stage 14 audit.
