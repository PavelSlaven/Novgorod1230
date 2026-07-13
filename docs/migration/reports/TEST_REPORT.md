# Test report — 0.22.0-migration.22

Дата: 2026-07-12

## Full regression suite

| Suite | Passed | Failed |
|---|---:|---:|
| Module tests | 217 | 0 |
| Domain/package tests | 30 | 0 |
| Application tests | 11 | 0 |
| Tool tests | 29 | 0 |
| Shadow tests | 6 | 0 |
| Cutover tests | 4 | 0 |
| Production integration | 3 | 0 |
| Chromium E2E | 1 | 0 |
| **Total** | **301** | **0** |

`npm test`: passed.

## Finalization

- finalization tool tests: 4/4;
- automated finalization gates: 11/11;
- manual gates: 0/4, intentionally pending;
- decision: `automation_complete_manual_hold`;
- automatic legacy deletion: forbidden.

## Additional gates

- `npm run docs:check`: passed;
- `npm run architecture:check`: passed;
- `npm run release:check`: passed; clean candidate archive restore and full 301/301 regression: passed.
