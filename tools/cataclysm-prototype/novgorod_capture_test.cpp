#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <optional>
#include <stdexcept>
#include <string>
#include <system_error>
#include <utility>
#include <vector>

#include "action.h"
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "creature.h"
#include "effect.h"
#include "game.h"
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "map_helpers.h"
#include "mapdata.h"
#include "npc.h"
#include "novgorod_capture.h"
#include "player_activity.h"
#include "player_helpers.h"
#include "type_id.h"

namespace
{
static constexpr tripoint_bub_ms capture_test_center( 60, 60, 0 );
static const efftype_id capture_test_sleep( "sleep" );
static const furn_str_id capture_test_chair( "f_chair" );
static const ter_str_id capture_test_floor( "t_floor" );

int set_capture_directory( const std::string *path )
{
#if defined( _WIN32 )
    return _putenv_s( "NOVGOROD_CAPTURE_DIR", path ? path->c_str() : "" );
#else
    return path ? setenv( "NOVGOROD_CAPTURE_DIR", path->c_str(), 1 ) :
           unsetenv( "NOVGOROD_CAPTURE_DIR" );
#endif
}

class capture_output
{
    public:
        capture_output()
        {
            if( const char *current = std::getenv( "NOVGOROD_CAPTURE_DIR" ) ) {
                previous_directory = current;
            }
            novgorod_capture::clear_attention();
            novgorod_capture::finish();
            novgorod_capture::visible( {} );
            directory = std::filesystem::temp_directory_path() /
                        ( "novgorod-capture-test-" + std::to_string(
                              std::chrono::steady_clock::now().time_since_epoch().count() ) );
            std::filesystem::create_directories( directory );
            const std::string path = directory.string();
            if( set_capture_directory( &path ) != 0 ) {
                std::error_code error;
                std::filesystem::remove_all( directory, error );
                throw std::runtime_error( "NOVGOROD_CAPTURE_TEST_ENV_FAILED" );
            }
        }

        capture_output( const capture_output & ) = delete;
        capture_output &operator=( const capture_output & ) = delete;

        ~capture_output()
        {
            novgorod_capture::clear_attention();
            novgorod_capture::finish();
            novgorod_capture::visible( {} );
            set_capture_directory( previous_directory ? &*previous_directory : nullptr );
            std::error_code error;
            std::filesystem::remove_all( directory, error );
        }

        const std::filesystem::path &path() const
        {
            return directory;
        }

        void start_with_empty_visibility()
        {
            novgorod_capture::visible( {} );
            novgorod_capture::start();
            novgorod_capture::turn( false, R"({"sounds":[]})" );
        }

        // The capture keeps the highest request it has answered for the whole process.
        void input_poll()
        {
            static int request = 1000000;
            std::ofstream( directory / "input-request" ) << ++request;
            novgorod_capture::input_boundary();
        }

    private:
        std::optional<std::string> previous_directory;
        std::filesystem::path directory;
};

struct captured_npc_state
{
    bool activity_is_null = true;
    std::string activity_id;
    std::string verb;
    std::string tool;
    std::string material;
    std::string posture;
    std::string attention;
};

std::optional<captured_npc_state> latest_npc_state( const std::filesystem::path &directory,
        const npc &who )
{
    std::ifstream input( directory / "perception.jsonl" );
    const std::string id = std::to_string( who.getID().get_value() );
    std::string line;
    std::optional<captured_npc_state> latest;
    while( std::getline( input, line ) ) {
        JsonValue event_value = json_loader::from_string( line );
        JsonObject event = event_value.get_object();
        event.allow_omitted_members();
        const JsonObject frame = event.get_object( event.get_string( "kind" ) == "full" ?
                                 "frame" : "changes" );
        frame.allow_omitted_members();
        if( !frame.has_member( "creatures" ) ) {
            continue;
        }
        for( const JsonValue raw : frame.get_array( "creatures" ) ) {
            JsonObject creature = raw.get_object();
            creature.allow_omitted_members();
            if( creature.get_string( "kind", "" ) != "npc" || creature.get_string( "id", "" ) != id ) {
                continue;
            }
            captured_npc_state state;
            const JsonValue activity = creature.get_member( "activity" );
            state.activity_is_null = activity.test_null();
            if( !state.activity_is_null ) {
                JsonObject activity_object = activity.get_object();
                activity_object.allow_omitted_members();
                state.activity_id = activity_object.get_string( "id" );
                state.verb = activity_object.get_string( "verb" );
                const JsonValue tool = activity_object.get_member( "tool" );
                if( !tool.test_null() ) {
                    state.tool = tool.get_string();
                }
                const JsonValue material = activity_object.get_member( "material" );
                if( !material.test_null() ) {
                    state.material = material.get_string();
                }
            }
            state.posture = creature.get_string( "posture" );
            state.attention = creature.get_string( "attention" );
            latest = std::move( state );
        }
    }
    return latest;
}

void reset_capture_test_world()
{
    static bool loop_started = false;
    if( !loop_started ) {
        g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
        g->do_turn();
        loop_started = true;
    }
    clear_avatar();
    clear_map();
    clear_npcs();
    avatar &you = get_avatar();
    map &here = get_map();
    calendar::turn = calendar::turn_zero + 12_hours;
    g->reset_light_level();
    you.setpos( here, capture_test_center );
    you.set_moves( 1000 );
    for( const tripoint_bub_ms &point : here.points_on_zlevel( 0 ) ) {
        here.ter_set( point, capture_test_floor );
        here.i_clear( point );
    }
}

void refresh_capture_test_visibility()
{
    map &here = get_map();
    here.invalidate_map_cache( get_avatar().posz() );
    here.build_map_cache( get_avatar().posz() );
    here.update_visibility_cache( get_avatar().posz() );
}
}

TEST_CASE( "Native capture fields use native NPC state without a model", "[novgorod_capture]" )
{
    capture_output output;
    reset_capture_test_world();
    map &here = get_map();
    const tripoint_bub_ms chair_position = capture_test_center + tripoint_rel_ms( 1, 0, 0 );
    npc &subject = spawn_npc( point_bub_ms( chair_position.xy() ), "NPC_debug" );
    subject.death_eocs.clear();
    subject.set_attitude( NPCATT_NULL );
    REQUIRE( here.furn_set( chair_position, capture_test_chair ) );
    refresh_capture_test_visibility();
    REQUIRE( subject.sees( here, static_cast<const Creature &>( get_avatar() ) ) );

    output.start_with_empty_visibility();
    novgorod_capture::visible( { &subject } );
    calendar::turn += 1_turns;
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    auto state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->activity_is_null );
    CHECK( state->posture == "sitting" );

    const itype_id tool( "hatchet" );
    const itype_id material( "log" );
    subject.assign_activity( chop_planks_activity_actor( 100, tool, material ) );
    subject.set_mission( NPC_MISSION_ACTIVITY );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    REQUIRE_FALSE( state->activity_is_null );
    CHECK( state->activity_id == "ACT_CHOP_PLANKS" );
    CHECK_FALSE( state->verb.empty() );
    CHECK( state->tool == tool.str() );
    CHECK( state->material == material.str() );

    subject.assign_activity( player_activity{} );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->activity_is_null );

    subject.set_attitude( NPCATT_NULL );
    const tripoint_bub_ms away_position = chair_position + tripoint_rel_ms( 0, 1, 0 );
    subject.setpos( here, away_position );
    subject.setpos( here, chair_position );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->posture == "standing" );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->posture == "standing" );
    calendar::turn += 1_turns;
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->posture == "sitting" );

    subject.add_effect( capture_test_sleep, 10_minutes );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->posture == "prone" );
    CHECK( state->attention == "unaware" );

    subject.remove_effect( capture_test_sleep );
    subject.set_attitude( NPCATT_NULL );
    novgorod_capture::addressed( subject );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention == "unaware" );
    output.input_poll();
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention != "attends" );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention == "attends" );
    novgorod_capture::clear_attention();
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention == "attends" );
    output.input_poll();
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention != "attends" );
    novgorod_capture::turn( false, R"({"sounds":[]})" );
    state = latest_npc_state( output.path(), subject );
    REQUIRE( state.has_value() );
    CHECK( state->attention == "notices" );
}
