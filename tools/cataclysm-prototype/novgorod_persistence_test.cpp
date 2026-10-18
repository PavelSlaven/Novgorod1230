// Native P4 protocol for the disposable Cataclysm staging world.
// Run cata_test with NOVGOROD_P4_MODE=create|apply|read and
// NOVGOROD_P4_WORLD=<world name>; apply also accepts
// NOVGOROD_P4_OPERATION=pickup_rock|pickup_stick|move_east|partial_hacksaw
// (default pickup_rock).  create writes the deterministic fixture; apply loads
// it, executes one native transition, then saves; read strictly reloads and
// reports the saved state.  Every process uses the same --user-dir.  The
// coordinator owns immutable generations; this test touches only that staging
// user directory.  NOVGOROD_P4_FAILPOINT=after_effect pauses after an apply
// transition; =mid_save pauses after player data is written, before the rest of
// game::save.  Both emit and flush NOVGOROD_P4_FAILPOINT_REACHED:<name> before
// waiting to be killed by the coordinator.

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#if defined(_WIN32)
#include <io.h>
#else
#include <unistd.h>
#endif

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
#include "map.h"
#include "map_helpers.h"
#include "npc.h"
#include "player_activity.h"
#include "player_helpers.h"
#include "rng.h"
#include "path_info.h"
#include "zzip.h"
#include "worldfactory.h"
#include "type_id.h"

extern double novgorod_p4_bootstrap_ms;
extern double novgorod_p4_load_ms;
extern double novgorod_p4_core_data_ms;

static const std::vector<itype_id> p4_fixture_items = {
    itype_id( "rock" ), itype_id( "stick" ), itype_id( "2x4" ),
    itype_id( "string_36" ), itype_id( "rope_6" ), itype_id( "nail" )
};
static constexpr tripoint_bub_ms p4_center( 60, 60, 0 );
static constexpr tripoint_bub_ms p4_cut_target( 60, 61, 0 );

static std::string p4_env( const char *name, const char *fallback = "" )
{
    const char *value = std::getenv( name );
    return value ? value : fallback;
}

static void p4_emit_stdout( const std::string &line );

static void p4_failpoint( const std::string &name )
{
    if( p4_env( "NOVGOROD_P4_FAILPOINT" ) != name ) {
        return;
    }
    p4_emit_stdout( "NOVGOROD_P4_FAILPOINT_REACHED:" + name + "\n" );
    for( ;; ) {
        std::this_thread::sleep_for( std::chrono::milliseconds( 100 ) );
    }
}

static void p4_emit_stdout( const std::string &line )
{
    const char *data = line.data();
    size_t remaining = line.size();
    while( remaining > 0 ) {
#if defined(_WIN32)
        const int written = _write( _fileno( stdout ), data, static_cast<unsigned int>( remaining ) );
#else
        const ssize_t written = ::write( STDOUT_FILENO, data, remaining );
#endif
        if( written <= 0 ) {
            return;
        }
        data += written;
        remaining -= static_cast<size_t>( written );
    }
}

static std::string p4_snapshot()
{
    const avatar &u = get_avatar();
    std::ostringstream out;
    out << "{\"position\":[" << u.pos_abs().x() << ',' << u.pos_abs().y() << ',' << u.pos_abs().z()
        << "],\"turn\":" << to_turn<int>( calendar::turn )
        << ",\"elapsed_seconds\":"
        << to_seconds<int>( calendar::turn - calendar::turn_zero )
        << ",\"moves\":" << u.get_moves()
        << ",\"activity\":\"" << u.activity.id().str() << "\",\"activity_moves_left\":"
        << ( u.activity ? u.activity.moves_left : 0 ) << ",\"items\":[";

    std::vector<std::string> items;
    for( const item *it : u.items_with( []( const item & ) { return true; } ) ) {
        std::ostringstream entry;
        const item_location wielded = u.get_wielded_item();
        const bool is_wielded = wielded && wielded.get_item() == it;
        entry << "{\"uid\":" << it->uid().get_value() << ",\"type\":\"" << it->typeId().str()
              << "\",\"count\":" << it->count() << ",\"location\":\""
              << ( is_wielded ? "wielded" : "inventory" ) << "\"}";
        items.push_back( entry.str() );
    }
    for( const tripoint_bub_ms &where : { p4_center, p4_cut_target } ) {
        for( const item &it : get_map().i_at( where ) ) {
            std::ostringstream entry;
            entry << "{\"uid\":" << it.uid().get_value() << ",\"type\":\"" << it.typeId().str()
                  << "\",\"count\":" << it.count() << ",\"location\":["
                  << where.x() << ',' << where.y() << ',' << where.z() << "]}";
            items.push_back( entry.str() );
        }
    }
    std::sort( items.begin(), items.end() );
    for( size_t i = 0; i < items.size(); ++i ) {
        out << ( i ? "," : "" ) << items[i];
    }
    out << "],\"cut_target_terrain\":\"" << get_map().ter( p4_cut_target ).obj().id.str()
        << "\",\"npcs\":[";
    std::vector<std::string> npcs;
    for( const npc &guy : g->all_npcs() ) {
        std::ostringstream entry;
        const tripoint_abs_ms pos = guy.pos_abs();
        entry << "{\"id\":" << guy.getID().get_value() << ",\"position\":["
              << pos.x() << ',' << pos.y() << ',' << pos.z() << "]}";
        npcs.push_back( entry.str() );
    }
    std::sort( npcs.begin(), npcs.end() );
    for( size_t i = 0; i < npcs.size(); ++i ) {
        out << ( i ? "," : "" ) << npcs[i];
    }
    // The stream operator observes the engine without advancing it.
    out << "],\"rng_state\":\"" << rng_get_engine() << "\"}";
    return out.str();
}

static std::vector<int> p4_disk_type_uids( const std::string &type )
{
    const std::filesystem::path archive_path = ( PATH_INFO::player_base_save_path() + SAVE_EXTENSION +
            zzip_suffix ).get_unrelative_path();
    const std::optional<zzip> archive = zzip::load( archive_path );
    if( !archive ) {
        return {};
    }
    std::filesystem::path save_entry;
    for( const std::filesystem::path &entry : archive->get_entries() ) {
        if( entry.extension() == SAVE_EXTENSION ) {
            save_entry = entry;
            break;
        }
    }
    if( save_entry.empty() ) {
        return {};
    }
    const std::vector<std::byte> bytes = archive->get_file( save_entry );
    const std::string json( reinterpret_cast<const char *>( bytes.data() ), bytes.size() );
    std::vector<int> result;
    size_t pos = 0;
    const std::string type_needle = "\"typeid\"";
    while( ( pos = json.find( type_needle, pos ) ) != std::string::npos ) {
        const size_t type_end = json.find( "\"uid\"", pos );
        if( type_end == std::string::npos ) {
            break;
        }
        const size_t type_value = json.find( type, pos );
        if( type_value == std::string::npos || type_value > type_end + 64 ) {
            pos = type_end + 5;
            continue;
        }
        const size_t uid_colon = json.find( ':', type_end );
        if( uid_colon == std::string::npos ) {
            break;
        }
        char *uid_end = nullptr;
        const long uid = std::strtol( json.c_str() + uid_colon + 1, &uid_end, 10 );
        if( uid_end != json.c_str() + uid_colon + 1 ) {
            result.push_back( static_cast<int>( uid ) );
        }
        pos = static_cast<size_t>( uid_end - json.c_str() );
    }
    return result;
}

static std::vector<std::string> p4_actions( std::initializer_list<action_id> ids )
{
    std::vector<std::string> result;
    for( const action_id id : ids ) {
        result.push_back( action_ident( id ) );
    }
    return result;
}

static void p4_create_fixture()
{
    // Start the real game loop before constructing the deterministic map state.
    g->set_test_action_queue( p4_actions( { ACTION_PAUSE } ) );
    REQUIRE_FALSE( g->do_turn() );
    clear_avatar();
    clear_map();
    avatar &u = get_avatar();
    map &here = get_map();
    calendar::turn = calendar::turn_zero + 12_hours;
    u.setpos( here, p4_center );
    u.set_moves( 1000 );
    u.set_desired_movement_mode( move_mode_id( "walk" ) );
    u.worn.wear_item( u, item( itype_id( "debug_backpack" ) ), false, false );
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.ter_set( p, ter_str_id( "t_dirt" ) );
    }
    for( int x = 56; x <= 72; ++x ) {
        for( int y = 58; y <= 64; ++y ) {
            here.ter_set( tripoint_bub_ms( x, y, 0 ), x <= 62 || x >= 67 ?
                          ter_str_id( "t_floor" ) : ter_str_id( "t_dirt" ) );
            here.i_clear( tripoint_bub_ms( x, y, 0 ) );
        }
    }
    for( int x = 63; x <= 66; ++x ) {
        here.ter_set( tripoint_bub_ms( x, 60, 0 ), ter_str_id( "t_floor" ) );
    }
    here.ter_set( tripoint_bub_ms( 63, 60, 0 ), ter_str_id( "t_door_c" ) );
    here.ter_set( tripoint_bub_ms( 60, 59, 0 ), ter_str_id( "t_wall" ) );
    here.ter_set( p4_cut_target, ter_str_id( "t_chainfence" ) );
    item saw( itype_id( "hacksaw" ) );
    REQUIRE( u.wield( saw ) );
    for( const itype_id &type : p4_fixture_items ) {
        here.add_item( p4_center, item( type ) );
    }
    const std::vector<point_bub_ms> npc_positions = {
        point_bub_ms( 64, 60 ), point_bub_ms( 65, 62 ), point_bub_ms( 63, 64 )
    };
    for( const point_bub_ms &pos : npc_positions ) {
        here.place_npc( pos, npc_template_id( "test_talker" ) );
    }
    g->load_npcs();
    for( const npc &guy : g->all_npcs() ) {
        g->find_npc( guy.getID() )->set_attitude( NPCATT_NULL );
    }
}

static void p4_prepare_operation( const std::string &operation )
{
    if( operation == "pickup_rock" || operation == "pickup_stick" ) {
        const itype_id type( operation == "pickup_rock" ? "rock" : "stick" );
        item *target = nullptr;
        for( item &it : get_map().i_at( p4_center ) ) {
            if( it.typeId() == type ) {
                target = &it;
                break;
            }
        }
        REQUIRE( target != nullptr );
        std::vector<item_location> targets = {
            item_location( map_cursor( get_map().get_abs( p4_center ) ), target )
        };
        get_avatar().assign_activity( pickup_activity_actor( targets, { 0 }, p4_center, false ) );
        return;
    }
    if( operation == "partial_hacksaw" ) {
        const item_location wielded = get_avatar().get_wielded_item();
        REQUIRE( wielded );
        REQUIRE( wielded.get_item()->typeId() == itype_id( "hacksaw" ) );
        REQUIRE( get_map().ter( p4_cut_target ) == ter_str_id( "t_chainfence" ) );
        get_avatar().assign_activity( hacksaw_activity_actor( p4_cut_target, wielded ) );
        REQUIRE( get_avatar().activity );
        return;
    }
    if( operation == "move_east" ) {
        return;
    }
    FAIL( "unknown NOVGOROD_P4_OPERATION: " << operation );
}

static int p4_count_item( const itype_id &type, bool inventory )
{
    int total = 0;
    if( inventory ) {
        for( const item *it : get_avatar().items_with( [&]( const item &candidate ) {
            return candidate.typeId() == type;
        } ) ) {
            total += it->count();
        }
    }
    if( !inventory ) {
        for( const item &it : get_map().i_at( p4_center ) ) {
            if( it.typeId() == type ) {
                total += it.count();
            }
        }
    }
    return total;
}

static void p4_run_operation( const std::string &operation )
{
    const tripoint_abs_ms old_pos = get_avatar().pos_abs();
    const int rock_before = p4_count_item( itype_id( "rock" ), true );
    const int stick_before = p4_count_item( itype_id( "stick" ), true );
    const int rock_ground_before = p4_count_item( itype_id( "rock" ), false );
    const int stick_ground_before = p4_count_item( itype_id( "stick" ), false );
    const int activity_before = get_avatar().activity ? get_avatar().activity.moves_left : 0;
    g->set_test_action_queue( operation == "move_east" ?
                              p4_actions( { ACTION_MOVE_RIGHT, ACTION_PAUSE } ) :
                              p4_actions( { ACTION_PAUSE } ) );
    REQUIRE_FALSE( g->do_turn() );
    if( operation == "move_east" ) {
        const tripoint_abs_ms new_pos = get_avatar().pos_abs();
        CHECK( new_pos.x() == old_pos.x() + 1 );
        CHECK( new_pos.y() == old_pos.y() );
        CHECK( new_pos.z() == old_pos.z() );
    } else if( operation == "pickup_rock" ) {
        CHECK( p4_count_item( itype_id( "rock" ), true ) == rock_before + 1 );
        CHECK( p4_count_item( itype_id( "rock" ), false ) == rock_ground_before - 1 );
    } else if( operation == "pickup_stick" ) {
        CHECK( p4_count_item( itype_id( "stick" ), true ) == stick_before + 1 );
        CHECK( p4_count_item( itype_id( "stick" ), false ) == stick_ground_before - 1 );
    } else if( operation == "partial_hacksaw" ) {
        CHECK( get_avatar().activity );
        CHECK( get_avatar().activity.moves_left < activity_before );
        CHECK( get_map().ter( p4_cut_target ) == ter_str_id( "t_chainfence" ) );
    }
}

TEST_CASE( "Novgorod native save and resume probe", "[.][novgorod_persistence]" )
{
    const std::string mode = p4_env( "NOVGOROD_P4_MODE" );
    const std::string operation = p4_env( "NOVGOROD_P4_OPERATION", "pickup_rock" );
    REQUIRE(( mode == "create" || mode == "apply" || mode == "read" ));
    std::string before = "null";
    std::string after;
    double save_ms = 0.0;
    if( mode == "create" ) {
        p4_create_fixture();
        const auto start = std::chrono::steady_clock::now();
        REQUIRE( g->save() );
        save_ms = std::chrono::duration<double, std::milli>(
                      std::chrono::steady_clock::now() - start ).count();
    } else if( mode == "apply" ) {
        p4_prepare_operation( operation );
        before = p4_snapshot();
        p4_run_operation( operation );
        p4_failpoint( "after_effect" );
        const auto start = std::chrono::steady_clock::now();
        REQUIRE( g->save() );
        save_ms = std::chrono::duration<double, std::milli>(
                      std::chrono::steady_clock::now() - start ).count();
    }
    REQUIRE( std::filesystem::is_regular_file(
                 ( PATH_INFO::world_base_save_path() / "novgorod_rng_state" ).get_unrelative_path() ) );
    after = p4_snapshot();
    const std::vector<int> disk_rock_uids = p4_disk_type_uids( "rock" );
    std::ostringstream disk_rock_json;
    disk_rock_json << "[";
    for( size_t i = 0; i < disk_rock_uids.size(); ++i ) {
        disk_rock_json << ( i ? "," : "" ) << disk_rock_uids[i];
    }
    disk_rock_json << "]";
    std::ostringstream result;
    result << "{\"p4\":true,\"mode\":\"" << mode << "\",\"operation\":\""
              << operation << "\",\"world\":\"" << p4_env( "NOVGOROD_P4_WORLD" )
              << "\",\"before\":" << before << ",\"after\":" << after
              << ",\"save_ms\":" << save_ms << ",\"load_ms\":" << novgorod_p4_load_ms
              << ",\"core_data_ms\":" << novgorod_p4_core_data_ms
              << ",\"bootstrap_ms\":" << novgorod_p4_bootstrap_ms
              << ",\"disk_rock_uids\":" << disk_rock_json.str() << "}\n";
    p4_emit_stdout( result.str() );
}
