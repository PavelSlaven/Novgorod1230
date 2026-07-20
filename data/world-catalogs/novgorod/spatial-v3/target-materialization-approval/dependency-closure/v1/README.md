# P12 dependency closure v1

Status: `PROPOSED_FOR_P12_DEPENDENCY_CLOSURE`.

This bundle materializes only the exact approved dependencies required by P12 V1.1. It does not activate production, P28, or spatial runtime v3. Historical geometry remains topological unless explicitly marked as a technical G1 grid cell.

Regenerate from repository root with:

```powershell
node scripts/generate-p12-dependency-closure.mjs
node data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/scripts/validate-bundle.mjs
```
