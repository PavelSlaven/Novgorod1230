# P12 dependency closure v1

Status: `PROPOSED_FOR_P12_DEPENDENCY_CLOSURE`; independent reapproval is pending.

This bundle materializes only the exact approved dependencies required by P12 V1.1. The G1 import row is pinned to the target-standard convention `grid_east_north_v1`. The prior approval evidence applies only to the superseded subject tree and is not reused. See `REAPPROVAL_REQUEST.json` for the exact changed contract and required evidence sequence.

This package does not activate production, P28, or spatial runtime v3. Historical geometry remains topological unless explicitly marked as a technical G1 grid cell.

Regenerate from repository root with:

```powershell
node scripts/generate-p12-dependency-closure.mjs
node data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/scripts/validate-bundle.mjs
```
