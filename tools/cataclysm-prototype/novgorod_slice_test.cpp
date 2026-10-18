#include <algorithm>
#include <chrono>
#include <functional>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/resource.h>
#include <vector>

#include "action.h"
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "character.h"
#include "game.h"
#include "item.h"
#include "item_location.h"
#include "item_uid.h"
#include "player_activity.h"
#include "map.h"
#include "map_selector.h"
#include "map_helpers.h"
#include "monster.h"
#include "npc.h"
#include "player_helpers.h"
#include "type_id.h"

static const ter_str_id ter_t_dirt( "t_dirt" );
static const ter_str_id ter_t_floor( "t_floor" );
static const ter_str_id ter_t_wall( "t_wall" );
static const ter_str_id ter_t_door_c( "t_door_c" );
static const mtype_id mon_zombie( "mon_zombie" );
static const npc_template_id npc_template_test_talker( "test_talker" );
static const std::vector<itype_id> fixture_items = {
    itype_id( "rock" ), itype_id( "stick" ), itype_id( "2x4" ),
    itype_id( "string_36" ), itype_id( "rope_6" ), itype_id( "nail" )
};
static constexpr tripoint_bub_ms fixture_center( 60, 60, 0 );

void set_novgorod_test_input_observer( std::function<void()> observer );

struct reset_input_observer {
    ~reset_input_observer() {
        set_novgorod_test_input_observer( {} );
    }
};

static int ground_count( const itype_id &type, const tripoint_bub_ms &where );

static int64_t carried_uid( const itype_id &type )
{
    const auto items = get_avatar().items_with( [&]( const item &it ) { return it.typeId() == type; } );
    REQUIRE( items.size() == 1 );
    return items.front()->uid().get_value();
}

static std::string player_json()
{
    const avatar &u = get_avatar();
    std::ostringstream out;
    out << "{\"position\":[" << u.pos_bub().x() << ',' << u.pos_bub().y() << ',' << u.pos_bub().z()
        << "],\"absolute_position\":[" << u.pos_abs().x() << ',' << u.pos_abs().y() << ',' << u.pos_abs().z()
        << "],\"moves\":" << u.get_moves() << ",\"turn\":" << to_turn<int>( calendar::turn )
        << ",\"elapsed_seconds\":" << to_seconds<int>( calendar::turn - ( calendar::turn_zero + 12_hours ) )
        << ",\"activity\":\"" << u.activity.id().str() << "\",\"items\":[";
    bool first = true;
    for( const itype_id &type : fixture_items ) {
        if( !first ) {
            out << ',';
        }
        first = false;
        out << "{\"type\":\"" << type.str() << "\",\"count\":" << u.amount_of( type )
            << ",\"ground_count\":" << ground_count( type, fixture_center ) << '}';
    }
    out << "],\"inventory_items\":[";
    first = true;
    for( const item *it : u.items_with( []( const item & ) { return true; } ) ) {
        if( !first ) {
            out << ',';
        }
        first = false;
        out << "{\"uid\":" << it->uid().get_value() << ",\"type\":\""
            << it->typeId().str() << "\",\"count\":" << it->count() << '}';
    }
    out << "],\"ground_items\":[";
    first = true;
    for( const item &it : get_map().i_at( fixture_center ) ) {
        if( !first ) {
            out << ',';
        }
        first = false;
        out << "{\"uid\":" << it.uid().get_value() << ",\"type\":\""
            << it.typeId().str() << "\",\"count\":" << it.count() << '}';
    }
    out << "],\"npcs\":[";
    first = true;
    for( const npc &guy : g->all_npcs() ) {
        if( !first ) {
            out << ',';
        }
        first = false;
        out << "{\"id\":" << guy.getID().get_value() << ",\"position\":["
            << guy.pos_bub().x() << ',' << guy.pos_bub().y() << ',' << guy.pos_bub().z()
            << "],\"moves\":" << guy.get_moves()
            << ",\"activity\":\"" << guy.activity.id().str() << "\"}";
    }
    out << "]}";
    return out.str();
}

static int ground_count( const itype_id &type, const tripoint_bub_ms &where )
{
    int count = 0;
    for( const item &it : get_map().i_at( where ) ) {
        if( it.typeId() == type ) {
            count += it.count();
        }
    }
    return count;
}

static void emit_transition( const std::string &name, const std::string &before, const std::string &details = std::string() )
{
    std::cout << "{\"scenario\":\"" << name << "\",\"before\":" << before
              << ",\"after\":" << player_json() << details << "}\n";
}

static std::vector<std::string> actions( std::initializer_list<action_id> ids )
{
    std::vector<std::string> result;
    for( const action_id id : ids ) {
        result.push_back( action_ident( id ) );
    }
    return result;
}

static void reset_scene()
{
    // Finish the engine's new-game bootstrap before any measured before snapshot.
    static bool loop_started = false;
    if( !loop_started ) {
        g->set_test_action_queue( actions( { ACTION_PAUSE } ) );
        REQUIRE_FALSE( g->do_turn() );
        loop_started = true;
    }
    clear_avatar();
    clear_map();
    avatar &u = get_avatar();
    map &here = get_map();
    calendar::turn = calendar::turn_zero + 12_hours;
    u.setpos( here, fixture_center );
    u.set_moves( 1000 );
    u.set_desired_movement_mode( move_mode_id( "walk" ) );
    u.worn.wear_item( u, item( itype_id( "debug_backpack" ) ), false, false );
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.ter_set( p, ter_t_dirt );
    }
    for( int x = 56; x <= 72; ++x ) {
        for( int y = 58; y <= 64; ++y ) {
            here.ter_set( tripoint_bub_ms( x, y, 0 ), x <= 62 || x >= 67 ? ter_t_floor : ter_t_dirt );
            here.i_clear( tripoint_bub_ms( x, y, 0 ) );
        }
    }
    for( int x = 63; x <= 66; ++x ) {
        here.ter_set( tripoint_bub_ms( x, 60, 0 ), ter_t_floor );
    }
    here.ter_set( tripoint_bub_ms( 60, 59, 0 ), ter_t_wall );
    here.ter_set( tripoint_bub_ms( 63, 60, 0 ), ter_t_door_c );
}

static void run_actions( const std::string &name, std::vector<std::string> queued )
{
    g->set_test_action_queue( std::move( queued ) );
    const std::string before = player_json();
    REQUIRE_FALSE( g->do_turn() );
    emit_transition( name, before );
}

TEST_CASE( "Novgorod native fixture has truthful entity readback", "[novgorod_slice][fixture]" )
{
    reset_scene();
    map &here = get_map();
    const std::vector<point_bub_ms> npc_positions = {
        point_bub_ms( 64, 60 ), point_bub_ms( 65, 62 ), point_bub_ms( 63, 64 )
    };
    std::vector<character_id> npc_ids;
    for( const point_bub_ms &pos : npc_positions ) {
        npc_ids.push_back( here.place_npc( pos, npc_template_test_talker ) );
    }
    g->load_npcs();
    for( const character_id &id : npc_ids ) {
        g->find_npc( id )->set_attitude( NPCATT_NULL );
    }
    std::vector<int64_t> item_ids;
    for( const itype_id &type : fixture_items ) {
        item &placed = here.add_item( fixture_center, item( type ) );
        item_ids.push_back( placed.uid().get_value() );
    }
    const std::string readback = player_json();
    std::cout << "{\"scenario\":\"P1_fixture\",\"before\":{},\"after\":" << readback
              << ",\"native_item_uids\":[";
    for( size_t i = 0; i < item_ids.size(); ++i ) {
        std::cout << ( i ? "," : "" ) << item_ids[i];
    }
    std::cout << "],\"native_npc_ids\":[";
    for( size_t i = 0; i < npc_ids.size(); ++i ) {
        std::cout << ( i ? "," : "" ) << npc_ids[i].get_value();
    }
    std::cout << "]}\n";
    REQUIRE( npc_ids.size() == 3 );
    REQUIRE( item_ids.size() == 6 );
    for( size_t i = 0; i < item_ids.size(); ++i ) {
        CHECK( item_ids[i] > 0 );
        for( size_t j = 0; j < i; ++j ) {
            CHECK( item_ids[i] != item_ids[j] );
        }
    }
    for( const character_id &id : npc_ids ) {
        CHECK( g->find_npc( id ) != nullptr );
    }
    for( const itype_id &type : fixture_items ) {
        CHECK( ground_count( type, fixture_center ) == 1 );
    }
    CHECK( here.ter( tripoint_bub_ms( 63, 60, 0 ) ) == ter_t_door_c );
    CHECK( here.ter( tripoint_bub_ms( 60, 59, 0 ) ) == ter_t_wall );
}

TEST_CASE( "Novgorod native turn scenarios use handle_action and do_turn", "[novgorod_slice]" )
{

    reset_scene();
    const int east_moves_before = get_avatar().get_moves();
    const time_point east_time_before = calendar::turn;
    run_actions( "T01_east", actions( { ACTION_MOVE_RIGHT, ACTION_PAUSE } ) );
    CHECK( get_avatar().pos_bub() == fixture_center + tripoint::east );
    CHECK( get_avatar().get_moves() != east_moves_before );
    CHECK( calendar::turn > east_time_before );

    reset_scene();
    const int diagonal_moves_before = get_avatar().get_moves();
    const time_point diagonal_time_before = calendar::turn;
    const tripoint_abs_ms diagonal_position_before = get_avatar().pos_abs();
    run_actions( "T01_unseen_northeast", actions( { ACTION_MOVE_FORTH_RIGHT, ACTION_PAUSE } ) );
    CHECK( get_avatar().pos_abs() == diagonal_position_before + tripoint( 1, -1, 0 ) );
    CHECK( get_avatar().get_moves() != diagonal_moves_before );
    CHECK( calendar::turn > diagonal_time_before );

    reset_scene();
    get_map().ter_set( fixture_center + tripoint::north, ter_t_wall );
    const std::string wall_before = player_json();
    g->set_test_action_queue( actions( { ACTION_MOVE_FORTH, ACTION_PAUSE } ) );
    REQUIRE_FALSE( g->do_turn() );
    emit_transition( "T02_wall", wall_before );
    CHECK( get_avatar().pos_bub() == fixture_center );
    CHECK( get_map().impassable( fixture_center + tripoint::north ) );
    CHECK( get_avatar().sees( get_map(), fixture_center + tripoint::north ) );

    reset_scene();
    item &rock = get_map().add_item( fixture_center, item( fixture_items.front() ) );
    const int64_t rock_uid = rock.uid().get_value();
    const std::vector<item_location> targets = {
        item_location( map_cursor( get_avatar().pos_abs() ), &rock )
    };
    get_avatar().assign_activity( pickup_activity_actor( targets, { 0 }, fixture_center, false ) );
    run_actions( "T03_pickup_rock", actions( { ACTION_PAUSE } ) );
    CHECK( get_avatar().amount_of( fixture_items.front() ) == 1 );
    CHECK( ground_count( fixture_items.front(), fixture_center ) == 0 );
    CHECK( rock_uid > 0 );
    CHECK( carried_uid( fixture_items.front() ) > 0 );
    CHECK( carried_uid( fixture_items.front() ) != rock_uid );

    reset_scene();
    get_map().add_item( fixture_center, item( fixture_items[1] ) );
    item &stick = *get_map().i_at( fixture_center ).begin();
    const int64_t stick_uid = stick.uid().get_value();
    const std::vector<item_location> stick_target = {
        item_location( map_cursor( get_avatar().pos_abs() ), &stick )
    };
    get_avatar().assign_activity( pickup_activity_actor( stick_target, { 0 }, fixture_center, false ) );
    run_actions( "T03_unseen_pickup_stick", actions( { ACTION_PAUSE } ) );
    CHECK( get_avatar().amount_of( fixture_items[1] ) == 1 );
    CHECK( stick_uid > 0 );
    CHECK( carried_uid( fixture_items[1] ) > 0 );
    CHECK( carried_uid( fixture_items[1] ) != stick_uid );
    CHECK( ground_count( fixture_items[1], fixture_center ) == 0 );

    reset_scene();
    const std::vector<point_bub_ms> npc_positions = {
        point_bub_ms( 64, 60 ), point_bub_ms( 65, 62 ), point_bub_ms( 63, 64 )
    };
    std::vector<character_id> npc_ids;
    for( const point_bub_ms &pos : npc_positions ) {
        npc_ids.push_back( get_map().place_npc( pos, npc_template_test_talker ) );
    }
    g->load_npcs();
    for( const character_id &id : npc_ids ) {
        g->find_npc( id )->set_attitude( NPCATT_NULL );
    }
    npc *autonomous = g->find_npc( npc_ids.front() );
    REQUIRE( autonomous != nullptr );
    const int npc_moves_before = autonomous->get_moves();
    const time_point time_before = calendar::turn;
    const tripoint_bub_ms cutting_target = fixture_center + tripoint::south;
    const ter_str_id fence( "t_chainfence" );
    const itype_id pipe( "pipe" );
    get_map().ter_set( cutting_target, fence );
    item hacksaw( itype_id( "hacksaw" ) );
    REQUIRE( get_avatar().wield( hacksaw ) );
    const item_location saw = get_avatar().get_wielded_item();
    REQUIRE( saw );
    const std::string activity_before = player_json();
    get_avatar().assign_activity( hacksaw_activity_actor( cutting_target, saw ) );
    REQUIRE( get_avatar().activity );
    REQUIRE( get_map().ter( cutting_target ) == fence );
    const int activity_moves_before = get_avatar().activity.moves_left;
    int activity_ticks = 0;
    g->set_test_action_queue( actions( { ACTION_PAUSE } ) );
    REQUIRE_FALSE( g->do_turn() );
    ++activity_ticks;
    REQUIRE( get_avatar().activity );
    CHECK( get_avatar().activity.moves_left < activity_moves_before );
    CHECK( get_map().ter( cutting_target ) == fence );
    while( get_avatar().activity && activity_ticks < 1000 ) {
        g->set_test_action_queue( actions( { ACTION_PAUSE } ) );
        REQUIRE_FALSE( g->do_turn() );
        ++activity_ticks;
    }
    int pipes = ground_count( pipe, cutting_target ) + get_avatar().amount_of( pipe );
    for( const npc &guy : g->all_npcs() ) {
        pipes += guy.amount_of( pipe );
    }
    emit_transition( "T04_hacksaw_activity_and_npc", activity_before,
                     ",\"native_activity_moves\":" + std::to_string( activity_moves_before ) +
                     ",\"ticks\":" + std::to_string( activity_ticks ) +
                     ",\"pipe_count\":" + std::to_string( pipes ) +
                     ",\"final_terrain\":\"" + get_map().ter( cutting_target ).id().str() + "\"" );
    autonomous = g->find_npc( npc_ids.front() );
    REQUIRE( autonomous != nullptr );
    CHECK( calendar::turn > time_before );
    CHECK( autonomous->get_moves() != npc_moves_before );
    CHECK( activity_ticks > 1 );
    CHECK( activity_ticks < 1000 );
    CHECK_FALSE( get_avatar().activity );
    CHECK( get_map().ter( cutting_target ) == ter_t_dirt );
    CHECK( pipes == 6 );
    reset_scene();
    g->safe_mode = SAFE_MODE_ON;
    get_avatar().set_desired_movement_mode( move_mode_id( "run" ) );
    get_avatar().set_movement_mode( move_mode_id( "run" ) );
    REQUIRE( get_avatar().is_running() );
    REQUIRE( get_avatar().is_run_mode_desired() );
    get_map().ter_set( fixture_center + tripoint::east, ter_t_dirt );
    get_map().ter_set( fixture_center + tripoint( 1, -1, 0 ), ter_t_dirt );
    get_map().ter_set( fixture_center + tripoint( 1, 1, 0 ), ter_t_wall );
    monster *zombie = g->place_critter_at( mon_zombie, fixture_center + tripoint( 3, 2, 0 ) );
    REQUIRE( zombie != nullptr );
    get_map().build_map_cache( 0 );
    get_map().update_visibility_cache( 0 );
    const bool initially_visible = get_avatar().sees( get_map(), *zombie );
    REQUIRE_FALSE( initially_visible );
    const std::string danger_before = player_json();
    std::string stopped_readback;
    int observed_inputs = 0;
    bool stopped = false;
    bool visible_at_stop = false;
    tripoint_bub_ms stopped_position;
    set_novgorod_test_input_observer( [&]() {
        std::cout << "{\"scenario\":\"T05_input_boundary\",\"index\":" << observed_inputs
                  << ",\"visible\":" << get_avatar().sees( get_map(), *zombie )
                  << ",\"safe_mode\":" << static_cast<int>( g->safe_mode )
                  << ",\"x\":" << get_avatar().pos_abs().x()
                  << ",\"y\":" << get_avatar().pos_abs().y() << "}\n";
        // Third input follows the rejected second move, before acknowledging the threat.
        if( observed_inputs++ == 2 ) {
            stopped_readback = player_json();
            stopped = g->safe_mode == SAFE_MODE_STOP;
            stopped_position = get_avatar().pos_bub();
            visible_at_stop = get_avatar().sees( get_map(), *zombie );
        }
    } );
    const reset_input_observer observer_guard;
    g->set_test_action_queue( actions( { ACTION_MOVE_RIGHT, ACTION_MOVE_FORTH,
                                       ACTION_IGNORE_ENEMY, ACTION_PAUSE } ) );
    REQUIRE_FALSE( g->do_turn() );
    emit_transition( "T05_safe_mode_interrupt", danger_before,
                     ",\"initial_threat_visible\":" + std::string( initially_visible ? "true" : "false" ) +
                     ",\"final_threat_visible\":" + std::string( get_avatar().sees( get_map(), *zombie ) ? "true" : "false" ) +
                     ",\"stop_readback\":" + stopped_readback +
                     ",\"native_stop_observed\":" + std::string( stopped ? "true" : "false" ) );
    CHECK( observed_inputs == 4 );
    CHECK( stopped_position == fixture_center + tripoint::east );
    CHECK( stopped );
    CHECK( visible_at_stop );
    CHECK( get_avatar().pos_bub() == fixture_center + tripoint::east );
    CHECK( get_avatar().sees( get_map(), *zombie ) );
}

TEST_CASE( "Novgorod test input exhaustion is explicit", "[novgorod_slice]" )
{

    reset_scene();
    g->set_test_action_queue( actions( { ACTION_PAUSE } ) );
    bool exhausted = false;
    try {
        REQUIRE_FALSE( g->do_turn() );
        g->do_turn();
    } catch( const std::runtime_error &err ) {
        exhausted = std::string( err.what() ).find( "NOVGOROD_TEST_INPUT_EXHAUSTED" ) != std::string::npos;
    }
    CHECK( exhausted );
}

TEST_CASE( "Novgorod native tick and action budgets", "[novgorod_slice][metrics]" )
{

    reset_scene();
    std::vector<double> tick_ms;
    for( int i = 0; i < 105; ++i ) {
        g->set_test_action_queue( actions( { ACTION_PAUSE } ) );
        const auto start = std::chrono::steady_clock::now();
        REQUIRE_FALSE( g->do_turn() );
        const double elapsed = std::chrono::duration<double, std::milli>(
                                   std::chrono::steady_clock::now() - start ).count();
        if( i >= 5 ) {
            tick_ms.push_back( elapsed );
        }
    }
    std::sort( tick_ms.begin(), tick_ms.end() );
    const double p50 = tick_ms[( tick_ms.size() - 1 ) * 50 / 100];
    const double p95 = tick_ms[( tick_ms.size() - 1 ) * 95 / 100];
    struct rusage usage = {};
    getrusage( RUSAGE_SELF, &usage );
    const double rss_gib = usage.ru_maxrss / ( 1024.0 * 1024.0 );
    std::cout << "{\"scenario\":\"P2_metrics\",\"warmup\":5,\"samples\":" << tick_ms.size()
              << ",\"p50_ms\":" << p50 << ",\"p95_ms\":" << p95
              << ",\"ticks_100_ms\":";
    double total = 0;
    for( double value : tick_ms ) {
        total += value;
    }
    std::cout << total << ",\"rss_gib\":" << rss_gib << "}\n";
    CHECK( tick_ms.size() == 100 );
    CHECK( p95 <= 250.0 );
    CHECK( total <= 2000.0 );
    CHECK( rss_gib <= 8.0 );

    std::vector<double> action_ms;
    for( int i = 0; i < 105; ++i ) {
        const bool east = i % 2 == 0;
        const tripoint_abs_ms before = get_avatar().pos_abs();
        g->set_test_action_queue( actions( { east ? ACTION_MOVE_RIGHT : ACTION_MOVE_LEFT, ACTION_PAUSE } ) );
        const auto start = std::chrono::steady_clock::now();
        int ticks = 0;
        do {
            REQUIRE_FALSE( g->do_turn() );
            ++ticks;
        } while( get_avatar().pos_abs() == before && ticks < 10 );
        const double elapsed = std::chrono::duration<double, std::milli>(
                                   std::chrono::steady_clock::now() - start ).count();
        CHECK( get_avatar().pos_abs() == before + ( east ? tripoint::east : tripoint::west ) );
        if( i >= 5 ) {
            action_ms.push_back( elapsed );
        }
    }
    std::sort( action_ms.begin(), action_ms.end() );
    const double action_p95 = action_ms[94];
    std::cout << "{\"scenario\":\"P2_move_metrics\",\"warmup\":5,\"samples\":100,\"p50_ms\":"
              << action_ms[49] << ",\"p95_ms\":" << action_p95 << "}\n";
    CHECK( action_p95 <= 250.0 );
}
