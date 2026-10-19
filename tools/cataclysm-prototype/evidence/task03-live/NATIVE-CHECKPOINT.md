# Task03 native verified handoff

HEAD: d285e4bb2a7985c5826f3b448555e263cde84fa8. No commit/push. Root STOP: no addressee feature or further native mechanisms.

Changed owned paths: tools/cataclysm-prototype/native-live-input.patch (untracked), novgorod_semantic.cpp (untracked), novgorod_semantic.h (untracked from prior native stage), novgorod_semantic_test.cpp (modified from prior native stage). Temporary overlay: artifacts/2026-10-19/task03/native-source/src/{action.cpp,handle_action.cpp,game_io.cpp}; common cpp/h and test copied by build worker only.

Current fixes:
- handle_action.cpp:2710 semantic dispatch returns false, skipping native realtime wall-clock move charge, channel break, and post_action for empty/refusal as well as queued semantic action. action.cpp:472 marks semantic UI action non-world-changing, so user_action_counter does not advance before actual native primitive.
- novgorod_semantic.cpp:281 records only radius-1 local terrain/furniture/field type+intensity/ground item facts for use_item readback; item or local map changes count as confirmed. No native_snapshot/live physics copy.
- novgorod_semantic.cpp:717 delays speak/wait readback until ACT_WAIT completes or interrupts. get_player_input returns ACTION_NULL while activity is active, letting outer do_turn/process_activity continue. Native source: do_turn.cpp:622,643-683; handle_action.cpp:349-353 (overlay). Runtime behavior awaits focused build.
- game_io.cpp:134 guards existing debug RNG sidecar load/write with test_mode and NOVGOROD_P4_MODE=create/apply/read. Old RNG patch untouched; normal curses should neither write nor restore debug RNG sidecar.

Actual checks: `git apply --check --directory=.tmp.driveupload/task03/native-patch-check tools/cataclysm-prototype/native-live-input.patch` PASS (baseline copies include game_io.cpp); `git diff --check -- tools/cataclysm-prototype/novgorod_semantic_test.cpp` PASS. CBM list/index/architecture/search/trace/detect_changes/coverage called; new source metadata changed and test parse partial, so conclusions grounded in direct source. No native compile/test/runtime result yet. Build worker /root/task03_build has overlay update and will report separately. No sealed T06-T12, real LLM, Docker, external API run.

Open: compile/focused native tests; ordinary save must show absence of novgorod_rng_state, opt-in RNG regression; actual curses runtime PID/timeout/hearing not yet verified. Root paused scope for addressee design question.
