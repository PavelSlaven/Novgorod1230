from pathlib import Path
import difflib

repo = Path(__file__).resolve().parents[4]
base = repo / "artifacts/2026-10-19/nativebuild/cataclysm-source"
dest = repo / "artifacts/2026-10-19/task02/startup-native-source"
changes = {}


def edit(path, old, new):
    text = changes.get(path, (base / path).read_text())
    assert text.count(old) == 1, (path, old, text.count(old))
    changes[path] = text.replace(old, new)


for path, signature, label in [
    ("src/game.cpp", "void game::setup()", "setup"),
    ("src/game_io.cpp", "void game::load_core_data()", "core_data"),
    ("src/game_io.cpp", "void game::load_world_modfiles()", "load_world_modfiles"),
    ("src/game_io.cpp", "void game::load_packs( const std::string &msg, const std::vector<mod_id> &packs )", "load_packs"),
    ("src/init.cpp", "void DynamicDataLoader::finalize_loaded_data()", "finalize_loaded_data"),
    ("src/init.cpp", "void DynamicDataLoader::check_consistency()", "check_consistency"),
]:
    edit(path, signature + "\n{", signature + '\n{\n    cata_timer diagnostic_timer( "diagnostic.' + label + '" );')

edit("src/init.cpp", '#include "init.h"', '#include "init.h"\n#include "perf.h"')
for path in ["tests/test_main.cpp", "tests/novgorod_persistence_test.cpp"]:
    edit(path, '#include "game.h"', '#include "game.h"\n#include "perf.h"')

edit("src/game_io.cpp", "    cata_timer::print_stats();\n", "")
edit("src/game_io.cpp", "    load_mod_data_from_dir( PATH_INFO::world_base_save_path() / \"mods\", \"custom\" );\n    load_mod_interaction_data_from_dir( PATH_INFO::world_base_save_path() / \"mods\" /\n                                        \"mod_interactions\", \"custom\" );", "    {\n        cata_timer diagnostic_timer( \"diagnostic.world_custom_mods\" );\n        load_mod_data_from_dir( PATH_INFO::world_base_save_path() / \"mods\", \"custom\" );\n        load_mod_interaction_data_from_dir( PATH_INFO::world_base_save_path() / \"mods\" /\n                                            \"mod_interactions\", \"custom\" );\n    }")
edit("src/game_io.cpp", "bool game::load( const save_t &name )\n{", "bool game::load( const save_t &name )\n{\n    cata_timer diagnostic_timer( \"diagnostic.native_world_load\" );")
edit("src/init.cpp", '        loading_ui::show( _( "Finalizing" ), e.first );\n        e.second();', '        cata_timer diagnostic_step( "finalize." + e.first );\n        loading_ui::show( _( "Finalizing" ), e.first );\n        e.second();')
edit("tests/test_main.cpp", "    const auto bootstrap_start = std::chrono::steady_clock::now();", '    cata_timer diagnostic_init( "diagnostic.init_global_game_state" );\n    const auto bootstrap_start = std::chrono::steady_clock::now();\n    {\n        cata_timer diagnostic_paths( "diagnostic.paths_options_init" );')
edit("tests/test_main.cpp", "    init_colors();\n\n    g =", "    init_colors();\n    }\n\n    g =")
edit("tests/test_main.cpp", "    g->load_static_data();", '    {\n        cata_timer diagnostic_static( "diagnostic.static_data" );\n        g->load_static_data();\n    }')
edit("tests/test_main.cpp", "        world_generator->init();", '        {\n            cata_timer diagnostic_metadata( "diagnostic.metadata" );\n            world_generator->init();\n        }')
edit("tests/novgorod_persistence_test.cpp", 'TEST_CASE( "Novgorod native save and resume probe", "[.][novgorod_persistence]" )\n{', 'TEST_CASE( "Novgorod native save and resume probe", "[.][novgorod_persistence]" )\n{\n    {\n    cata_timer diagnostic_readback( "diagnostic.readback_test_body" );')
edit("tests/novgorod_persistence_test.cpp", "    p4_emit_stdout( result.str() );\n}", "    p4_emit_stdout( result.str() );\n    }\n    cata_timer::print_stats();\n}")

patch = []
for path, text in changes.items():
    (dest / path).parent.mkdir(parents=True, exist_ok=True)
    (dest / path).write_text(text)
    patch.extend(difflib.unified_diff((base / path).read_text().splitlines(True), text.splitlines(True), fromfile="a/" + path, tofile="b/" + path, n=0))
(Path(__file__).parent / "startup-timers.patch").write_bytes("".join(patch).encode())
print("Prepared", len(changes), "diagnostic source files")
