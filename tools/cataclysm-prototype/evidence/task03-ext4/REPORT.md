# Task03 M3: native start from save on ext4

Measured checkout HEAD: `dfd248ea282159520230add0d3818ae410a59e58`.
Diagnostic binary: task02 `startup-native-build/cata_test`, SHA-256
`2e665836e5ff7656b8b5338e382cfcfc60eadfa7e700113d956665c8da0c46ff`
before and after copying. No rebuild, runtime patch, game-code edit, or plan edit.

The only writable Linux runtime root was the new
`/home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/`.
`findmnt -T` returned `/`, `ext4`, `/dev/sdd` for runtime `data`, `gfx`, and
`userdir`; `readlink -f` resolved `data` and `gfx` inside that root, with zero
symlinks beneath them. Binary, temporary directory, native cache, and save
copy were there too. Snapshot `C:/Users/Slaven/cdda-src/0d8843f` and task02
sources/build/userdir were read-only inputs, never run in place or changed.

Fixture: copied task02 `startup-userdir/save/startup_diagnostic`, including
its native save. `mods.json` remained `["dda", "test_data"]` before and after.
`data`/`gfx` came from task02's linked native source, copied as regular files.
`rsync --exclude=/cache/` excluded source `data/cache` and userdir `cache`.
Before cold read, both target cache paths were absent. After four reads,
`runtime/data/cache` held 3,464 files (42 MiB) and `userdir/cache` held one
file (12 KiB). Thus cold means a new process with a fresh native disk cache;
warm means new processes reusing the cache produced by the first read.
System page cache was not flushed, and copying files may have warmed it.

Reproduction from the repository root, in order (the target must be absent):

```text
wsl -- mkdir -p /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/runtime/data /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/runtime/gfx /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/userdir /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/tmp
wsl -- rsync -a --exclude=/cache/ /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/artifacts/2026-10-19/nativebuild/cataclysm-source/data/ /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/runtime/data/
wsl -- rsync -a /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/artifacts/2026-10-19/nativebuild/cataclysm-source/gfx/ /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/runtime/gfx/
wsl -- rsync -a --exclude=/cache/ /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/artifacts/2026-10-19/task02/startup-userdir/ /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/userdir/
wsl -- cp /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/artifacts/2026-10-19/task02/startup-native-build/cata_test /home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/cata_test
wsl -- python3 /mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/tools/cataclysm-prototype/evidence/task03-ext4/measure-ext4.py
```

`measure-ext4.py` is a local path/run-list adaptation of task02 `measure.py`:
`task`, `runtime`, `binary`, `userdir`, and raw-log destination point to the
new ext4 root; the old `create + 3 read` list became `1 cold-read + 3 warm-read`
with `mode=read` throughout. The native argv, RNG seed 17, world
`startup_diagnostic`, probe filter, environment filtering, `perf_counter_ns`,
timer parser, and native assertions are otherwise the same. No `create` or
fixture construction is included in start/recovery numbers. Each row is one
complete subprocess, not a percentile. Seconds, rounded to 0.001:

| Phase | Cold read | Warm 1 | Warm 2 | Warm 3 |
|---|---:|---:|---:|---:|
| External wall, entire process | 20.028 | 15.305 | 14.756 | 15.404 |
| `init_global_game_state`, inclusive | 19.691 | 14.529 | 14.471 | 14.627 |
| Paths/options | 0.007 | 0.001 | 0.001 | 0.001 |
| Static data | 0.007 | 0.002 | 0.002 | 0.001 |
| World metadata | 0.002 | 0.000 | 0.000 | 0.000 |
| `setup`, inclusive | 19.231 | 13.599 | 14.130 | 13.606 |
| ↳ Core data | 0.019 | 0.004 | 0.012 | 0.004 |
| ↳ `load_world_modfiles`, inclusive | 19.211 | 13.594 | 14.117 | 13.602 |
| ↳ ↳ `load_packs` | 7.080 | 1.444 | 1.816 | 1.359 |
| ↳ ↳ Finalize, inclusive | 12.131 | 12.150 | 12.301 | 12.243 |
| ↳ ↳ ↳ Consistency check | 4.444 | 5.498 | 4.509 | 5.439 |
| Native world load after setup | 0.314 | 0.912 | 0.301 | 1.005 |
| Other work inside `init_global_game_state`¹ | 0.129 | 0.016 | 0.037 | 0.013 |
| Outside `init_global_game_state`² | 0.338 | 0.776 | 0.285 | 0.777 |

¹ Parent minus listed direct children; ² wall minus parent. Both are
residuals, not additional costs. Finalize includes consistency check;
`load_world_modfiles` includes pack loading and finalize. `TESTING DATA` pack
remained loaded, 0.086/0.048/0.053/0.047 s across the four runs.

All four exits were 0, emitted the probe observation, and captured 121
native timer entries. Harness assertions passed for required phases, positive
counts, and inclusive nesting. `python3 -m py_compile` passed for the adapter.
Original captured stdout/stderr and `measurements.json` remain under the ext4
root's `raw/`; copied logs here have LF and one terminal newline. No host-wide
page-cache flush, Qwen/LLM, Docker, UI, sealed test, or full suite was run.

M3 result: the only cold read exceeded the ≤20 s owner threshold by 0.028 s.
Three warm reads were below 20 s, but they do not turn this cold result into a
pass or establish p95. The older 64.9–68.8 s `/mnt/c` measurements remain
separate task02 observations, not the ext4 D216 result. No mod trimming,
finalize/consistency optimization, new cache, or warm host was attempted in
this measurement step. Startup budget remains unproven on cold native cache.
