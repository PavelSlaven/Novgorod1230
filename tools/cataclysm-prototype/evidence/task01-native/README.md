# Task01 native verification

Native UI ran from one Windows command against a fresh copy of the P1 fixture:
`run-p1-curses.ps1 -Smoke`. The game loaded, accepted several actions, saved and
quit to its main menu, then exited through the main-menu Quit flow. Process exit
was 0; avatar save, dimension save and RNG file hashes changed.

`native-result.json` records the pinned upstream revision, final binary hashes,
11 focused cases / 98 assertions, P3 speech create/apply results, and the curses
save/exit result. `source-identity.json` contains per-file hashes for 31 files:
the minimal tree rebuilt from upstream plus the six patches matched the native
build copy and all six repo C++ test sources byte-for-byte.

The dated logs and save readback live under
`artifacts/2026-10-19/task01/`. Existing item/JSON/pickup controls were omitted
from the final run; use `native-smoke.ps1 -Controls` to opt in to them.
