# Task03: launcher stage 2

Working HEAD: `16892a689b07328e2d73a8e5066274354568ae63`; launcher changes not
committed by executor. No Qwen requests, source/build mutations, mod trimming,
`--noverify`, finalize changes, or warm host changes were performed.

## Runtime and Node installation

Own runtime: `/home/slaven/cataclysm-recovery/task03-dev`, `findmnt -T`:
`/`, `ext4`, `/dev/sdd`. `runtime/data`, `runtime/gfx`, `runtime/data/gfx` and
fixture contain no symlinks. Data/gfx were copied from the ext4 M3 diagnostic
runtime. `data/cache` was copied too: this is a warm native disk cache, not a
new cache mechanism. Original sources/builds/worlds remained read-only inputs.

Initial curses binary copied from
`/home/slaven/cataclysm-recovery/build-clang-release/src/cataclysm`:
SHA256 `971de2d236fab277a82f9d80224764cae388b33aba78bf8cd0ac3a1e1d4a48c9`.
This is the old baseline, not the forthcoming live build.

Installed Node **v22.23.3**, Linux x64, under
`/home/slaven/.local/share/novgorod/node-v22.23.3-linux-x64/` without sudo.
The repository pins major 22 in `.github/workflows/test.yml:49` and permits
`>=22` in `package.json:234`; it has no exact patch pin. The official
`https://nodejs.org/dist/index.json` selected this 22.x archive at installation:
`https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz`.
`SHASUMS256.txt` came from the same official release directory.
`sha256sum -c` passed before extraction:
`df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de`.
The installed executable returned `v22.23.3`. Temporary download files were
removed; the installation is retained for the dev launcher.

## Launcher contract

PowerShell calls WSL Bash, which starts the actual curses binary on inherited
terminal stdin/stdout, without the smoke driver. Default runtime is the root
above. `-NativeOnly` skips coordinator. `-Reset` moves the previous userdir to
`userdir-before-reset-*`; it does not delete the previous saved world.
First launch copies `fixture/save` into `userdir/save`; later launches reuse it.
An ext4 session lock prevents two writers and stays held by the native child.

Full mode starts the installed WSL Node once with
`p3-live-coordinator.mjs --socket <runtime>/run/p3.sock`, passing
`RUS_LLM_SETTINGS_PATH` via WSLENV path conversion without printing settings.
Readiness is an empty AF_UNIX connection, with no application/model request.
Native receives `NOVGOROD_P3_SOCKET` and `NOVGOROD_P3_TIMEOUT_MS=120000`.
Only an owned stale Unix socket is removed; a listening socket or unknown file
stops launch. Exit/TERM/INT cleanup terminates owned native/coordinator children.
Full real coordinator/native integration is not established by launcher mocks.

## Checks actually run

- PowerShell AST parse: PASS, no parse errors.
- `bash -n tools/cataclysm-prototype/run-p3-dev.sh`: PASS.
- `python3 -m py_compile .../dev_curses_probe.py`: PASS.
- `python3 .../test_dev_launcher.py`: PASS, 10 tests. Real Bash on WSL ext4;
  fake executable/coordinator only for launcher lifecycle. Cases cover first
  seed, saved changes on restart, explicit reset with retained backup, lock,
  broken userdir, external data symlink, readiness, owned child cleanup, stale
  versus listening/unknown socket, and TERM cleanup of owned native process.
- `git diff --check`: PASS.

## Real native probe: FAIL retained

Command:
`python3 tools/cataclysm-prototype/dev_curses_probe.py --runtime-root /home/slaven/cataclysm-recovery/task03-dev --evidence /home/slaven/cataclysm-recovery/task03-dev/probe-baseline-1`

The copied fixture source was
`/home/slaven/cataclysm-recovery-evidence/p3-clean-fixture-20261019/world-primary/save/p3-clean-fixture-primary-20261019`,
copied into `fixture/save/novgorod-dev`. This is a technical room with debug NPC
and test objects, including modern equipment, not an authored historical world.
`mods.json` remains `["dda", "test_data"]`.

The actual curses process began loading directly with `--world` and one avatar;
it did not require main-menu input. Native loading stopped at its error dialog:
`DEBUG : item_location UID not found in container contents`;
`REPORTING FUNCTION : void item_location::deserialize(const JsonObject &)`.
Raw failure log remains
`/home/slaven/cataclysm-recovery/task03-dev/probe-baseline-1/run-1.pty`.
The probe terminated its process and deleted only its copied temporary userdir.
Original fixture and runtime seed were not repaired or rewritten to bypass this.

The harness was corrected for direct `--world` load, and future runs write an
explicit PASS/FAIL report. This does not change the first failed evidence.
Warm curses start, native movement/item/save/reload acceptance and the actual
interactive Windows launch remain unverified until a compatible binary is built.
The earlier cata_test cold `20.028 s` FAIL and warm `14.756–15.404 s` diagnostics
remain separate; they are not a curses timing result.
