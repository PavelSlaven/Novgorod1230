#include <chrono>
#include <ctime>
#include <fstream>
#include <iostream>
#include <iterator>
#include <string>
#include <thread>
#include <vector>

#include "action.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "cata_utility.h"
#include "event.h"
#include "event_bus.h"
#include "event_subscriber.h"
#include "game.h"
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "map_helpers.h"
#include "options.h"
#include "options_helpers.h"
#include "path_info.h"
#include "player_helpers.h"
#include "type_id.h"
#include "worldfactory.h"
#include "zzip.h"

namespace
{

struct autosave_observer : event_subscriber {
    using event_subscriber::notify;

    struct save_event {
        int turn;
        std::time_t real_time;
    };

    std::vector<save_event> saves;

    autosave_observer() {
        get_event_bus().subscribe( this );
    }

    void notify( const cata::event &event ) override {
        if( event.type() == event_type::game_save ) {
            saves.push_back( { to_turn<int>( calendar::turn ), std::time( nullptr ) } );
        }
    }
};

int saved_turn()
{
    const cata_path path = PATH_INFO::player_base_save_path() + SAVE_EXTENSION;
    std::string contents;
    if( world_generator->active_world->has_compression_enabled() ) {
        const auto archive = zzip::load( ( path + zzip_suffix ).get_unrelative_path() );
        REQUIRE( archive );
        const auto bytes = archive->get_file( path.get_unrelative_path().filename() );
        REQUIRE_FALSE( bytes.empty() );
        contents.assign( reinterpret_cast<const char *>( bytes.data() ), bytes.size() );
    } else {
        std::ifstream stream( path.get_unrelative_path() );
        REQUIRE( stream.good() );
        contents.assign( std::istreambuf_iterator<char>( stream ), std::istreambuf_iterator<char>() );
    }
    const JsonObject saved = json_loader::from_string( contents ).get_object();
    saved.allow_omitted_members();
    return saved.get_int( "turn" );
}

void pause_turn()
{
    get_avatar().set_moves( 100 );
    g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
    REQUIRE_FALSE( g->do_turn() );
}

void prepare_autosave_fixture()
{
    const override_option disabled( "AUTOSAVE", "false" );
    pause_turn();
    clear_avatar();
    clear_map();
    clear_npcs();
    calendar::turn = calendar::turn_zero + 13_hours - 3_turns;
    get_avatar().setpos( get_map(), tripoint_bub_ms( 60, 60, -1 ) );
    get_map().ter_set( get_avatar().pos_bub(), ter_str_id( "t_floor" ) );
    pause_turn();
    REQUIRE( g->get_moves_since_last_save() > 0 );
}

}

TEST_CASE( "Novgorod autosave accepts one game hour", "[novgorod_autosave][option]" )
{
    const override_option enabled( "AUTOSAVE", "true" );
    const override_option turns( "AUTOSAVE_TURNS", "3600" );
    const override_option minutes( "AUTOSAVE_MINUTES", "5" );

    CHECK( get_option<bool>( "AUTOSAVE" ) );
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 3600 );
    CHECK( get_option<int>( "AUTOSAVE_MINUTES" ) == 5 );

    get_options().get_option( "AUTOSAVE_TURNS" ).setNext();
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 10 );
    get_options().get_option( "AUTOSAVE_TURNS" ).setPrev();
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 3600 );
}

TEST_CASE( "Novgorod autosave writes at the native game hour boundary",
           "[novgorod_autosave][slow]" )
{
    const override_option enabled( "AUTOSAVE", "true" );
    const override_option turns( "AUTOSAVE_TURNS", "3600" );
    const override_option minutes( "AUTOSAVE_MINUTES", "5" );
    restore_on_out_of_scope restore_turn( calendar::turn );
    prepare_autosave_fixture();
    autosave_observer observer;
    g->quicksave();
    REQUIRE( observer.saves.size() == 1 );
    const int baseline = to_turn<int>( calendar::turn );
    REQUIRE( saved_turn() == baseline );
    const auto eligible_at = std::chrono::steady_clock::now() + std::chrono::seconds( 301 );
    std::cout << "Native autosave: waiting 301 real seconds for the five-minute gate.\n" << std::flush;
    std::this_thread::sleep_until( eligible_at );

    pause_turn();
    REQUIRE( calendar::turn == calendar::turn_zero + 13_hours - 1_turns );
    CHECK( observer.saves.size() == 1 );
    CHECK( saved_turn() == baseline );
    REQUIRE( g->get_moves_since_last_save() > 0 );

    pause_turn();
    REQUIRE( calendar::turn == calendar::turn_zero + 13_hours );
    REQUIRE( observer.saves.size() == 2 );
    CHECK( observer.saves.back().real_time - observer.saves.front().real_time >= 300 );
    CHECK( observer.saves.back().turn == to_turn<int>( calendar::turn ) );
    CHECK( saved_turn() == to_turn<int>( calendar::turn ) );
}

TEST_CASE( "Novgorod eight hours of native sleep respect five real minutes between saves",
           "[novgorod_autosave][slow]" )
{
    const override_option enabled( "AUTOSAVE", "true" );
    const override_option turns( "AUTOSAVE_TURNS", "3600" );
    const override_option minutes( "AUTOSAVE_MINUTES", "5" );
    restore_on_out_of_scope restore_turn( calendar::turn );
    prepare_autosave_fixture();
    autosave_observer observer;
    g->quicksave();
    REQUIRE( observer.saves.size() == 1 );
    REQUIRE( saved_turn() == to_turn<int>( calendar::turn ) );
    pause_turn();
    REQUIRE( g->get_moves_since_last_save() > 0 );

    avatar &you = get_avatar();
    you.set_sleepiness( 10000 );
    you.fall_asleep( 8_hours + 1_turns );
    const time_point start = calendar::turn;
    const auto real_start = std::chrono::steady_clock::now();
    for( int tick = 0; tick < to_turns<int>( 8_hours ); ++tick ) {
        REQUIRE( you.in_sleep_state() );
        const size_t before = observer.saves.size();
        REQUIRE_FALSE( g->do_turn() );
        REQUIRE( calendar::turn == start + ( tick + 1 ) * 1_turns );
        if( observer.saves.size() != before ) {
            REQUIRE( observer.saves.size() == before + 1 );
            CHECK( observer.saves.back().real_time - observer.saves[before - 1].real_time >= 300 );
            CHECK( saved_turn() == observer.saves.back().turn );
        }
    }
    CHECK( calendar::turn - start == 8_hours );
    CHECK( saved_turn() == observer.saves.back().turn );
    const double elapsed = std::chrono::duration<double>(
                               std::chrono::steady_clock::now() - real_start ).count();
    if( std::time( nullptr ) - observer.saves.front().real_time < 300 ) {
        CHECK( observer.saves.size() == 1 );
        CHECK( g->get_moves_since_last_save() > 0 );
    }
    std::cout << "Native sleep: 28800 turns in " << elapsed << " real seconds, "
              << observer.saves.size() - 1 << " autosaves after the baseline quicksave.\n" << std::flush;
}
