# Cataclysm P4 baseline evidence — 2026-10-18

Repository HEAD: `fd0c252e76fffaa45aae4053a7418139b4aa1e9f` (`codex/cataclysm-p4-recovery`). Native upstream HEAD: `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.

## Accepted P2 baseline

Applied `native-input.patch`, then `native-persistence.patch`; copied `novgorod_slice_test.cpp` and `novgorod_persistence_test.cpp`. Both source `cmp` checks passed before and after build (`pre-build-cmp.txt`, `post-build-cmp.txt`). Clang 19.1.1 Release / Ninja / TILES=OFF / CURSES=ON / TESTS=ON / BUILD_TESTING=ON / CATA_CCACHE=OFF build linked `tests/cata_test` after 787/787 actions. `[novgorod_slice]` exit 0, 541 assertions, 4 cases passed. See `cmake-configure.log`, `build.log`, `build.exit`, `slice.raw.log`, `slice.exit`, `slice.summary.txt`.

## P4 UID reproduction

The first attempted create was accidentally run from `/home/slaven`, not the native root. It exited 139 after a missing relative `lang/mo/` warning. This failure is preserved unchanged in `p4-create.raw.log`, `p4-create.exit`, and `run-p4.sh`; it was not used as a result, and its userdir was retained.

Corrected run used cwd `/home/slaven/cataclysm-recovery`, fresh userdir `/home/slaven/cataclysm-recovery-evidence/baseline/p4-userdir-cwd-root`, world `baseline_p4_uid_retry`, and the already-built binary. Both native source `cmp` checks passed again (`sourcecmp.txt`). Exact create/apply/read commands are in `p4-retry-commands.txt`; cwd is in `p4-cwd.txt`; each raw log and exit are in `p4-retry-{create,apply,read}.{raw.log,exit}`. All three modes exited 0 and emitted exactly one valid JSON record; extracted records are `p4-retry-{create,apply,read}.json`.

UID mismatch reproduced for `pickup_rock`: fixture rock UID 3585160; apply recorded inventory rock UID 3589059 (also present in `disk_rock_uids` after reload); fresh read process reports inventory rock UID 3590329. See `p4-uid-comparison.json`. No native source fix was made.