# Executed checks

The following checks were actually executed in the artifact-construction environment:

- semantic package validation: PASS;
- source-snapshot reproduction and exact source coverage: PASS;
- JSON parsing for every JSON file: PASS;
- JSON Schema validation for six principal catalogues: PASS;
- CSV row-count validation: PASS;
- Markdown code-fence structural validation: PASS;
- Python syntax compilation for package scripts: PASS;
- evidence-template negative test: PASS because the templates were correctly rejected;
- manifest size/digest/coverage verification: PASS.

Not executed here:

- checkout of the user's P00–P27 implementation branch;
- project RAG/Graphify rebuild for that branch;
- npm test or branch-specific tests;
- PostgreSQL migration/import/readback/rollback;
- runtime new-game, persistence or first-turn tests;
- independent P27 signature generation;
- P28 production activation.

These omissions are represented as external hard gates and are not reported as completed.
