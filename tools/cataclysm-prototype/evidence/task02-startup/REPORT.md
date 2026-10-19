# Cold-process start from native save: diagnostic timings

Baseline HEAD at build: `287babfeb7c9d608279ed7f4245fb700529997de`. Diagnostic executable SHA-256: `2e665836e5ff7656b8b5338e382cfcfc60eadfa7e700113d956665c8da0c46ff`. Compiler: Ubuntu Clang 19.1.1, Release flags from the existing Ninja build. Platform: WSL2 Linux 6.6.114.1 on Windows, Intel Core i9-12900K. The executable was linked from five separately compiled diagnostic objects and the remaining objects in the existing Release build; this was not a clean rebuild. Source, build, disposable world, runtime, and temporary files are under `artifacts/2026-10-19/task02/`.

Three successful `read` invocations each started a **new process** against one native saved world. The runtime directory contains symlinks to the unchanged native source `data` and `gfx`; this avoids a multi-minute WSL copy. No system page-cache flush was performed, so these are process-cold starts with the operating-system cache in its ordinary state. The other main-build worker reported no active Ninja/Clang process during the timed reads; it was notified when the quiet window ended. A preceding `create` fixture run took 77.876 s and is excluded from start/recovery timings.

Command, from repository root:

```powershell
wsl.exe -e python3 tools/cataclysm-prototype/evidence/task02-startup/build.py
wsl.exe -e python3 tools/cataclysm-prototype/evidence/task02-startup/measure.py
```

`build.py` reuses unchanged diagnostic objects and executable, or rebuilds them when source/object timestamps require it. The initial five compiles and link completed successfully. Reproduction from an empty diagnostic source first requires `prepare_patch.py`, followed by these two commands. The diagnostic patch uses the upstream `cata_timer` and leaves the main native probe and warm host unchanged. Exact baseline/diagnostic source hashes and executable hash are in `tools/cataclysm-prototype/evidence/task02-startup/build-identity.json`; full command lines in `build-commands.json`.

All times below are seconds. Each cell is one run, not an aggregate or p95. `wall` is Python `perf_counter_ns` around the complete process. Native timers are printed at the end of the probe; their durations exclude timer-printing and process teardown.

| Phase | read-1 | read-2 | read-3 |
|---|---:|---:|---:|
| External wall, entire process | 68.791 | 68.828 | 64.891 |
| `init_global_game_state`, inclusive | 68.203 | 68.183 | 64.272 |
| Paths/options | 0.098 | 0.094 | 0.105 |
| Static data | 0.037 | 0.029 | 0.033 |
| World metadata | 0.050 | 0.041 | 0.050 |
| `setup`, inclusive | 60.610 | 60.830 | 56.626 |
| ↳ Core data | 0.135 | 0.110 | 0.144 |
| ↳ `load_world_modfiles`, inclusive | 60.473 | 60.718 | 56.480 |
| ↳ ↳ `load_packs` | 50.045 | 48.469 | 45.159 |
| ↳ ↳ World custom mods | 0.003 | 0.004 | 0.002 |
| ↳ ↳ Finalize, inclusive | 10.425 | 12.245 | 11.318 |
| ↳ ↳ ↳ Consistency check | 3.787 | 4.137 | 3.996 |
| Native world load after setup | 2.616 | 2.983 | 2.641 |
| Other work inside `init_global_game_state`¹ | 4.791 | 4.206 | 4.818 |
| Outside `init_global_game_state`² | 0.588 | 0.646 | 0.619 |

¹ `init_global_game_state` minus paths/options, static data, metadata, setup and native world load. Includes game construction and other uninstrumented work before/after those stages. ² External wall minus `init_global_game_state`; includes Catch/ELF process setup, the 0.003–0.004 s readback test body, timer output and teardown. These rows are residuals, not additional costs to add to the inclusive parent. `load_world_modfiles` is effectively `load_packs` + custom mods + finalize at displayed precision. `check_consistency` is already inside finalize, and upstream per-pack timers are already inside `load_packs`.

The dominant measured phase is mod pack loading: 45.159–50.045 s of a 64.891–68.828 s entire process. The upstream `Dark Days Ahead pack load time` alone is 43.816–48.837 s; `TESTING DATA pack load time` is 1.206–1.403 s. Finalization takes a further 10.425–12.245 s, including 3.787–4.137 s consistency checks. These are diagnostic observations; no optimization or cache change is part of this task. Native JSON/flexbuffer disk caching already exists, and this evidence does not establish a missing cache layer.

The measured cold-process start/recovery exceeds the existing ≤20 s target in all three runs. These three observations do not establish a p95 or behavior on another host. An earlier ~11.8 s figure belongs to a different measurement and is **not** relabeled as a result of this probe. This work does not establish live-game save ≤5 s or generation ≤512 MiB. The removed operation ≤5 s limit is not used.

Evidence: `measurements.json`, `read-{1,2,3}.{stdout,stderr}.raw.log`, `create.{stdout,stderr}.raw.log`, and the diagnostic patch in `tools/cataclysm-prototype/evidence/task02-startup/`. `measure.py` asserted exit code 0, a probe result, all required native timer phases, positive timer counts, and consistent inclusive timer nesting on all three reads. The five C++ compiles and link succeeded; Python `py_compile` for the three scripts succeeded. The patch regenerated with zero context passed forward `git apply --unidiff-zero --ignore-space-change --check` against the native baseline and reverse check against diagnostic source; `--ignore-space-change` accommodates baseline line endings. One terminal LF was removed from each of four tracked stdout logs to satisfy `git diff --cached --check`; original bytes remain in `artifacts/2026-10-19/task02/timer-original-raw/`. Timer JSON and measurements are unchanged. There was no clean rebuild, host-wide page-cache flush, full integration suite, or statistical percentile estimate.
