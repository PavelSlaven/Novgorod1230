#include <fstream>
#include <cstdlib>
#include <algorithm>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <tuple>
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
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "map_helpers.h"
#include "map_selector.h"
#include "npc.h"
#include "novgorod_semantic.h"
#include "path_info.h"
#include "player_helpers.h"
#include "type_id.h"
#include "sounds.h"

namespace
{
static constexpr tripoint_bub_ms p3_fixture_center( 60, 60, 0 );
static const ter_str_id p3_ter_floor( "t_floor" );
static const ter_str_id p3_ter_wall( "t_wall" );
static const ter_str_id p3_ter_door_c( "t_door_c" );
static const npc_template_id p3_talker( "NPC_debug" );
static const efftype_id p3_deaf( "deaf" );

void reset_p3_fixture()
{
    clear_novgorod_test_adjacent_selection();
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
    you.setpos( here, p3_fixture_center );
    you.set_moves( 1000 );
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.ter_set( p, p3_ter_floor );
        here.i_clear( p );
    }
    here.ter_set( p3_fixture_center + tripoint_rel_ms( 0, -1, 0 ), p3_ter_wall );
    here.ter_set( p3_fixture_center + tripoint_rel_ms( 1, 0, 0 ), p3_ter_door_c );
    here.add_item( p3_fixture_center, item( itype_id( "rock" ) ) );
    here.add_item( p3_fixture_center, item( itype_id( "stick" ) ) );
    here.add_item( p3_fixture_center + tripoint_rel_ms( -1, 0, 0 ), item( itype_id( "stick" ) ) );
    item_location backpack = you.i_add( item( itype_id( "backpack" ) ) );
    item firestarter( itype_id( "crude_firestarter" ) );
    item battery( itype_id( "light_battery_cell" ) );
    battery.ammo_set( battery.ammo_default(), 100 );
    firestarter.put_in( battery, pocket_type::MAGAZINE_WELL );
    you.i_add( firestarter );
    item flashlight( itype_id( "flashlight" ) );
    item medium_battery( itype_id( "medium_battery_cell" ) );
    medium_battery.ammo_set( medium_battery.ammo_default(), 56 );
    if( !flashlight.put_in( medium_battery, pocket_type::MAGAZINE_WELL ).success() ) {
        throw std::runtime_error( "NOVGOROD_TEST_FLASHLIGHT_SETUP_FAILED" );
    }
    if( flashlight.magazine_current() == nullptr || flashlight.ammo_remaining() < 1 ) {
        throw std::runtime_error( "NOVGOROD_TEST_FLASHLIGHT_BATTERY_NOT_LOADED" );
    }
    if( !backpack->put_in( flashlight, pocket_type::CONTAINER ).success() ) {
        throw std::runtime_error( "NOVGOROD_TEST_FLASHLIGHT_CONTAINER_SETUP_FAILED" );
    }
    if( !you.wear( backpack, false ).has_value() ) {
        throw std::runtime_error( "NOVGOROD_TEST_BACKPACK_SETUP_FAILED" );
    }
    character_id p3_speaker_id = spawn_npc( point_bub_ms( 60, 62 ), p3_talker.str() ).getID();
    character_id p3_listener_id = spawn_npc( point_bub_ms( 61, 62 ), p3_talker.str() ).getID();
    character_id deaf_listener_id = spawn_npc( point_bub_ms( 58, 61 ), p3_talker.str() ).getID();
    character_id second_deaf_listener_id = spawn_npc( point_bub_ms( 62, 61 ), p3_talker.str() ).getID();
    for( const character_id &id : { p3_speaker_id, p3_listener_id, deaf_listener_id,
                                    second_deaf_listener_id } ) {
        g->find_npc( id )->set_attitude( NPCATT_NULL );
    }
    g->find_npc( deaf_listener_id )->add_effect( p3_deaf, 1_hours, false, 3 );
    g->find_npc( second_deaf_listener_id )->add_effect( p3_deaf, 1_hours, false, 3 );
    for( const character_id &id : { p3_speaker_id, p3_listener_id, deaf_listener_id,
                                    second_deaf_listener_id } ) {
        g->find_npc( id )->assign_activity( wait_activity_actor( 1_hours ) );
    }
    std::vector<std::tuple<std::string, int, int, int>> fixture_ground_items;
    for( const tripoint_bub_ms &p : here.points_in_radius( you.pos_bub(), 1 ) ) {
        for( const item &it : here.i_at( p ) ) {
            fixture_ground_items.emplace_back( it.typeId().str(), p.x(), p.y(), p.z() );
        }
    }
    std::sort( fixture_ground_items.begin(), fixture_ground_items.end() );
    std::vector<std::tuple<std::string, int, int, int>> expected_ground_items = {
        { "rock", 60, 60, 0 },
        { "stick", 60, 60, 0 },
        { "stick", 59, 60, 0 }
    };
    std::sort( expected_ground_items.begin(), expected_ground_items.end() );
    if( fixture_ground_items != expected_ground_items ) {
        throw std::runtime_error( "NOVGOROD_P3_FIXTURE_GROUND_ITEMS_UNEXPECTED" );
    }
}

std::string p3_request_path()
{
    return PATH_INFO::user_dir() + "novgorod-p3-operation.json";
}

std::string p3_readback_path()
{
    return PATH_INFO::user_dir() + "novgorod-p3-operation-readback.json";
}

std::string p3_observation_path()
{
    return PATH_INFO::user_dir() + "novgorod-p3-observation.json";
}

std::string p3_target_ref( const tripoint_bub_ms &p )
{
    return std::to_string( p.x() ) + "," + std::to_string( p.y() ) + "," +
           std::to_string( p.z() );
}

std::vector<int> position_of( const tripoint_bub_ms &p );

void write_current_snapshot( JsonOut &out );

void write_p3_observation()
{
    write_to_file( p3_observation_path(), [&]( std::ostream &stream ) {
        std::ostringstream actor_safe;
        JsonOut out( actor_safe );
        novgorod_semantic::write_observation( out );
        std::string observation = actor_safe.str();
        observation.pop_back();
        stream << observation << ",\"native_snapshot\":";
        JsonOut diagnostic( stream );
        write_current_snapshot( diagnostic );
        stream << "}";
    } );
}

std::vector<int> position_of( const tripoint_bub_ms &p )
{
    return { p.x(), p.y(), p.z() };
}

struct item_fact {
    int64_t uid;
    std::string type;
    int charges;
    int count;
    std::string location;
};

struct native_snapshot {
    std::vector<int> position;
    int moves;
    int turn;
    time_point native_time;
    std::string activity;
    int activity_moves_left;
    std::string world_signature;
    std::vector<item_fact> inventory;
    std::vector<item_fact> ground;
    std::vector<std::tuple<std::string, std::vector<int>, std::string, std::string, int, std::string>> npcs;
};

native_snapshot take_snapshot()
{
    const avatar &you = get_avatar();
    native_snapshot result;
    result.position = position_of( you.pos_bub() );
    result.moves = you.get_moves();
    result.turn = to_turn<int>( calendar::turn );
    result.native_time = calendar::turn;
    result.activity = you.activity.id().str();
    result.activity_moves_left = you.activity.moves_left;
    map &here = get_map();
    here.update_visibility_cache( you.posz() );
    std::ostringstream signature;
    for( const npc &guy : g->all_npcs() ) {
        if( you.sees( here, guy.pos_bub() ) ) {
            result.npcs.emplace_back( std::to_string( guy.getID().get_value() ),
                                      position_of( guy.pos_bub() ),
                                      guy.novgorod_semantic_assignment_id(), guy.novgorod_semantic_status(),
                                      guy.novgorod_semantic_progress(), guy.novgorod_semantic_interrupt_cause() );
        }
    }
    for( const item *it : you.items_with( []( const item & ) { return true; } ) ) {
        result.inventory.push_back( { it->uid().get_value(), it->typeId().str(), it->charges, it->count(), "inventory" } );
        signature << "inv:" << it->uid().get_value() << ':' << it->typeId().str() << ':' << it->charges << ':'
                  << it->count() << ':' << it->active << ';';
    }
    for( const tripoint_bub_ms &p : here.points_in_radius( you.pos_bub(), 1 ) ) {
        if( !you.sees( here, p ) ) continue;
        signature << "tile:" << p3_target_ref( p ) << ':' << here.ter( p ).id().str() << ':'
                  << here.furn( p ).id().str() << ':' << sounds::sound_at( p ) << ';';
        for( const item &it : here.i_at( p ) ) {
            result.ground.push_back( { it.uid().get_value(), it.typeId().str(), it.charges, it.count(),
                                       p3_target_ref( p ) } );
            signature << "ground:" << it.uid().get_value() << ':' << it.typeId().str() << ':' << it.charges << ':'
                      << it.count() << ':' << it.active << ':' << p3_target_ref( p ) << ';';
        }
    }
    result.world_signature = signature.str();
    return result;
}

void write_snapshot( JsonOut &out, const native_snapshot &snapshot )
{
    out.start_object();
    out.member( "position", snapshot.position );
    out.member( "moves", snapshot.moves );
    out.member( "turn", snapshot.turn );
    out.member( "activity", snapshot.activity );
    out.member( "activity_moves_left", snapshot.activity_moves_left );
    out.member( "clock" );
    out.start_object();
    out.member( "native_turn", snapshot.turn );
    out.member( "seconds_since_world_start", to_seconds<int64_t>( snapshot.native_time - calendar::turn_zero ) );
    out.end_object();
    out.member( "inventory_items" );
    out.start_array();
    for( const item_fact &item : snapshot.inventory ) {
        out.start_object();
        out.member( "uid", item.uid );
        out.member( "type", item.type );
        out.member( "charges", item.charges );
        out.member( "count", item.count );
        out.member( "location", item.location );
        out.member( "holder", std::to_string( get_avatar().getID().get_value() ) );
        out.end_object();
    }
    out.end_array();
    out.member( "ground_items" );
    out.start_array();
    for( const item_fact &item : snapshot.ground ) {
        out.start_object();
        out.member( "uid", item.uid );
        out.member( "type", item.type );
        out.member( "charges", item.charges );
        out.member( "count", item.count );
        out.member( "position_ref", item.location );
        out.end_object();
    }
    out.end_array();
    out.member( "visible_npcs" );
    out.start_array();
    for( const auto &fact : snapshot.npcs ) {
        out.start_object();
        out.member( "actor_id", std::get<0>( fact ) );
        out.member( "position", std::get<1>( fact ) );
        out.member( "assignment_id", std::get<2>( fact ) );
        out.member( "assignment_status", std::get<3>( fact ) );
        out.member( "progress", std::get<4>( fact ) );
        out.member( "interrupt_cause", std::get<5>( fact ) );
        out.end_object();
    }
    out.end_array();
    out.end_object();
}

void write_current_snapshot( JsonOut &out )
{
    write_snapshot( out, take_snapshot() );
}

} // namespace

TEST_CASE( "Novgorod semantic request uses native avatar primitives", "[novgorod_semantic]" )
{
    const char *mode_value = std::getenv( "NOVGOROD_P4_MODE" );
    const std::string mode = mode_value == nullptr ? "" : mode_value;
    if( mode == "create" ) {
        reset_p3_fixture();
        REQUIRE( g->save() );
        write_p3_observation();
        return;
    }
    if( mode == "read" ) {
        write_p3_observation();
        return;
    }
    if( mode != "apply" ) reset_p3_fixture();
    std::ifstream request_stream( p3_request_path() );
    REQUIRE( request_stream.good() );
    std::string request_json( ( std::istreambuf_iterator<char>( request_stream ) ),
                              std::istreambuf_iterator<char>() );
    const JsonObject request = json_loader::from_string( request_json ).get_object();
    const std::string primitive = request.get_string( "primitive" );
    novgorod_semantic::operation_result result = novgorod_semantic::apply_operation( request );
    if( result.applied ) {
        if( g->has_novgorod_actions() ) g->do_turn();
        for( int turn = 0; turn < 20 && !get_avatar().activity.is_null(); ++turn ) {
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
            g->do_turn();
        }
        result = novgorod_semantic::finish_operation();
    }
    const JsonObject readback = json_loader::from_string( result.json ).get_object();
    CHECK( readback.get_string( "operation_id" ) == request.get_string( "operation_id" ) );
    if( result.applied && primitive == "speak" ) {
        const JsonObject effect = readback.get_object( "native_effect" );
        const JsonObject args = request.get_object( "args" );
        CHECK( effect.get_string( "utterance" ) == args.get_string( "utterance", args.get_string( "content", "" ) ) );
        CHECK( effect.get_int( "elapsed_seconds" ) >= 0 );
    }
    if( mode == "apply" ) REQUIRE( g->save() );
    write_to_file( p3_readback_path(), [&]( std::ostream &stream ) {
        stream << result.json;
    } );
}

namespace
{
std::string live_request( const std::string &primitive, const std::string &actor_id,
                          const std::string &utterance = "", const std::vector<int> &direction = {} )
{
    std::ostringstream stream;
    JsonOut out( stream );
    out.start_object();
    out.member( "schema", "p3_native_operation_request_v1" );
    out.member( "operation_id", "focused-live" );
    out.member( "actor_id", actor_id );
    out.member( "primitive", primitive );
    out.member( "expected_native_observation" ); out.start_object();
    out.member( "actor_id", actor_id );
    out.member( "turn", to_turn<int>( calendar::turn ) ); out.end_object();
    out.member( "args" ); out.start_object();
    if( primitive == "speak" ) out.member( "utterance", utterance );
    if( !direction.empty() ) out.member( "direction", direction );
    out.end_object();
    out.end_object();
    return stream.str();
}

novgorod_semantic::operation_result run_live_request( const std::string &json )
{
    auto result = novgorod_semantic::apply_operation( json_loader::from_string( json ).get_object() );
    if( result.applied ) {
        if( g->has_novgorod_actions() ) g->do_turn();
        for( int turn = 0; turn < 20 && !get_avatar().activity.is_null(); ++turn ) {
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
            g->do_turn();
        }
        result = novgorod_semantic::finish_operation();
    }
    return result;
}
} // namespace

TEST_CASE( "Novgorod live observation excludes diagnostic and legacy intent state", "[novgorod_live]" )
{
    reset_p3_fixture();
    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = json_loader::from_string( stream.str() ).get_object();
    CHECK_FALSE( observation.has_member( "native_snapshot" ) );
    CHECK( stream.str().find( "assignment_id" ) == std::string::npos );
    CHECK( stream.str().find( "interrupt_cause" ) == std::string::npos );
}

TEST_CASE( "Novgorod live stale request leaves native state unchanged", "[novgorod_live]" )
{
    reset_p3_fixture();
    const std::string actor = std::to_string( get_avatar().getID().get_value() );
    const std::string request = live_request( "wait", actor );
    calendar::turn += 1_seconds;
    const native_snapshot before = take_snapshot();
    const auto result = run_live_request( request );
    CHECK_FALSE( result.applied );
    CHECK( result.json.find( "NOVGOROD_STALE_NATIVE_OBSERVATION" ) != std::string::npos );
    CHECK( take_snapshot().world_signature == before.world_signature );
    CHECK( calendar::turn == before.native_time );
    CHECK( get_avatar().get_moves() == before.moves );
    CHECK( get_avatar().activity.is_null() );
}

TEST_CASE( "Novgorod live speech preserves tags and uses actual native hearing", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::string utterance = "<come_here> [literal] %s — Я сказал ровно это.";
    std::string actor = std::to_string( you.getID().get_value() );
    SECTION( "avatar" ) {}
    SECTION( "NPC" ) {
        for( npc &guy : g->all_npcs() ) {
            if( !guy.is_deaf() ) {
                actor = std::to_string( guy.getID().get_value() );
                break;
            }
        }
    }
    sounds::reset_sounds();
    you.set_moves( 0 );
    const auto result = run_live_request( live_request( "speak", actor, utterance ) );
    REQUIRE( result.applied );
    const JsonObject readback = json_loader::from_string( result.json ).get_object();
    const JsonObject effect = readback.get_object( "native_effect" );
    CHECK( effect.get_string( "utterance" ) == utterance );
    CHECK( effect.get_string( "native_sound" ) == utterance );
    CHECK( effect.get_int( "elapsed_seconds" ) >= 3 );
    const std::vector<std::string> heard = effect.get_string_array( "actualHeardListenerIds" );
    CHECK_FALSE( heard.empty() );
    for( const npc &guy : g->all_npcs() ) {
        const std::string id = std::to_string( guy.getID().get_value() );
        if( guy.is_deaf() || id == actor ) {
            CHECK( std::find( heard.begin(), heard.end(), id ) == heard.end() );
        }
    }
    CHECK( std::find( heard.begin(), heard.end(), actor ) == heard.end() );
}

TEST_CASE( "Novgorod live movement shares native dispatch and bounds", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::string actor = std::to_string( you.getID().get_value() );
    SECTION( "unseen equivalent diagonal" ) {
        const auto result = run_live_request( live_request( "move", actor, "", { -1, -1 } ) );
        REQUIRE( result.applied );
        CHECK( you.pos_bub() == p3_fixture_center + tripoint_rel_ms( -1, -1, 0 ) );
    }
    SECTION( "outside local radius" ) {
        const native_snapshot before = take_snapshot();
        const auto result = run_live_request( live_request( "move", actor, "", { 2, 0 } ) );
        CHECK_FALSE( result.applied );
        CHECK( result.json.find( "NOVGOROD_INVALID_MOVE_DIRECTION" ) != std::string::npos );
        CHECK( take_snapshot().world_signature == before.world_signature );
        CHECK( calendar::turn == before.native_time );
    }
}

TEST_CASE( "Novgorod ACTION_USE preserves nested carried item location", "[novgorod_semantic][item]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    item_location selected;
    you.visit_items( [&]( const item_location &candidate ) {
        if( candidate->typeId() == itype_id( "flashlight" ) ) {
            selected = candidate;
            return VisitResponse::ABORT;
        }
        return VisitResponse::NEXT;
    } );
    REQUIRE( selected );
    REQUIRE( selected.where() == item_location::type::container );
    const int64_t uid = selected->uid().get_value();
    const item_location parent = selected.parent_item();
    REQUIRE( parent );
    const int64_t parent_uid = parent->uid().get_value();
    item_pocket *const parent_pocket = selected.parent_pocket();
    REQUIRE( parent_pocket != nullptr );

    const auto find_selected = [&]() {
        item_location current;
        you.visit_items( [&]( const item_location &candidate ) {
            if( candidate->uid().get_value() == uid ) {
                current = candidate;
                return VisitResponse::ABORT;
            }
            return VisitResponse::NEXT;
        } );
        return current;
    };
    const auto use_and_check = [&]( const itype_id &expected_type ) {
        g->set_test_item_use( uid, "transform" );
        g->set_test_action_queue( { action_ident( ACTION_USE ), action_ident( ACTION_PAUSE ) } );
        g->do_turn();
        const item_location current = find_selected();
        REQUIRE( current );
        CHECK( current->typeId() == expected_type );
        CHECK( current.where() == item_location::type::container );
        REQUIRE( current.parent_item() );
        CHECK( current.parent_item()->uid().get_value() == parent_uid );
        CHECK( current.parent_pocket() == parent_pocket );
    };
    use_and_check( itype_id( "flashlight_on" ) );
    use_and_check( itype_id( "flashlight" ) );
}
TEST_CASE( "Novgorod RLE preserves distinct item identities", "[novgorod_semantic][json][item]" )
{
    cata::colony<item> original;
    original.insert( item( itype_id( "test_rag" ) ) );
    original.insert( item( itype_id( "test_rag" ) ) );
    auto first = original.begin();
    auto second = std::next( first );
    REQUIRE( first->all_items_ptr().empty() );
    REQUIRE( second->all_items_ptr().empty() );
    REQUIRE( first->same_for_rle( *second ) );
    REQUIRE( first->uid() != second->uid() );

    std::vector<int64_t> original_uids;
    for( const item &entry : original ) {
        original_uids.push_back( entry.uid().get_value() );
    }

    std::ostringstream serialized;
    JsonOut output( serialized );
    output.write( original );
    JsonValue input = json_loader::from_string( serialized.str() );
    cata::colony<item> restored;
    REQUIRE( input.read( restored ) );
    REQUIRE( restored.size() == original.size() );

    std::vector<int64_t> restored_uids;
    for( const item &entry : restored ) {
        restored_uids.push_back( entry.uid().get_value() );
    }
    CHECK( restored_uids == original_uids );
}

TEST_CASE( "Novgorod whole pickup preserves nested identities", "[novgorod_semantic][pickup]" )
{
    clear_avatar();
    clear_map_without_vision();
    avatar &you = get_avatar();
    map &here = get_map();
    const item_location storage = you.i_add( item( itype_id( "backpack" ) ) );
    REQUIRE( you.wear( storage, false ).has_value() );
    const tripoint_bub_ms ground = you.pos_bub();
    const int64_t unrelated_uid = you.i_add( item( itype_id( "rock" ) ) )->uid().get_value();

    item package( itype_id( "backpack" ) );
    package.put_in( item( itype_id( "rock" ) ), pocket_type::CONTAINER );
    here.add_item( ground, package );
    item &source = here.i_at( ground ).only_item();
    std::vector<int64_t> source_uids;
    source_uids.push_back( source.uid().get_value() );
    for( const item *nested : source.all_items_ptr() ) {
        source_uids.push_back( nested->uid().get_value() );
    }
    item_location source_location( map_cursor( ground ), &source );
    const drop_locations selection = { std::make_pair( source_location, 0 ) };
    you.pick_up( selection );
    process_activity( you );

    const int64_t source_root_uid = source_uids.front();
    const std::vector<item *> carried_roots = you.items_with( [&]( const item &carried ) {
        return carried.uid().get_value() == source_root_uid;
    } );
    REQUIRE( carried_roots.size() == 1 );
    std::vector<int64_t> carried_uids{ carried_roots.front()->uid().get_value() };
    for( const item *nested : carried_roots.front()->all_items_ptr() ) {
        carried_uids.push_back( nested->uid().get_value() );
    }
    CHECK( carried_uids == source_uids );
    CHECK( you.items_with( [&]( const item &carried ) {
        return carried.uid().get_value() == unrelated_uid;
    } ).size() == 1 );
}

TEST_CASE( "Novgorod pickup preserves identities on partial and merged stacks", "[novgorod_semantic][pickup]" )
{
    clear_avatar();
    clear_map_without_vision();
    avatar &you = get_avatar();
    map &here = get_map();
    const item_location storage = you.i_add( item( itype_id( "backpack" ) ) );
    REQUIRE( you.wear( storage, false ).has_value() );
    const tripoint_bub_ms ground = you.pos_bub();
    const itype_id nails( "nail" );

    SECTION( "partial pickup leaves the source UID on the ground" ) {
        item source( nails );
        source.charges = 5;
        here.add_item( ground, source );
        const int64_t original_uid = here.i_at( ground ).only_item().uid().get_value();
        item_location loc( map_cursor( ground ), &here.i_at( ground ).only_item() );
        const drop_locations selection = { std::make_pair( loc, 2 ) };
        you.pick_up( selection );
        process_activity( you );
        REQUIRE( !here.i_at( ground ).empty() );
        CHECK( here.i_at( ground ).only_item().uid().get_value() == original_uid );
        const std::vector<item *> carried = you.items_with( [&]( const item &it ) {
            return it.typeId() == nails;
        } );
        REQUIRE( carried.size() == 1 );
        CHECK( carried.front()->uid().get_value() != original_uid );
    }

    SECTION( "merge does not transfer the source UID" ) {
        item existing( nails );
        existing.charges = 2;
        item_location existing_location = you.i_add( existing );
        const int64_t existing_uid = existing_location->uid().get_value();
        item source( nails );
        source.charges = 4;
        here.add_item( ground, source );
        const int64_t source_uid = here.i_at( ground ).only_item().uid().get_value();
        item_location loc( map_cursor( ground ), &here.i_at( ground ).only_item() );
        const drop_locations selection = { std::make_pair( loc, 0 ) };
        you.pick_up( selection );
        process_activity( you );
        const std::vector<item *> carried = you.items_with( [&]( const item &it ) {
            return it.typeId() == nails;
        } );
        REQUIRE( carried.size() == 1 );
        CAPTURE( existing_uid );
        CAPTURE( source_uid );
        CHECK( carried.front()->uid().get_value() != source_uid );
        CHECK( carried.front()->charges == 6 );
    }
}

TEST_CASE( "Novgorod rejected identity transfer leaves both trees unchanged", "[novgorod_semantic][pickup]" )
{
    item destination( itype_id( "backpack" ) );
    item source( itype_id( "rock" ) );
    const int64_t destination_uid = destination.uid().get_value();
    const int64_t source_uid = source.uid().get_value();
    CHECK_FALSE( destination.transfer_identity_from( source ) );
    CHECK( destination.uid().get_value() == destination_uid );
    CHECK( source.uid().get_value() == source_uid );
}

TEST_CASE( "Novgorod identity transfer checks full pocket tree shape", "[novgorod_semantic][pickup]" )
{
    item destination( itype_id( "backpack" ) );
    item source( itype_id( "backpack" ) );
    item destination_first( itype_id( "backpack" ) );
    item destination_second( itype_id( "backpack" ) );
    item source_first( itype_id( "backpack" ) );
    item source_second( itype_id( "backpack" ) );
    REQUIRE( destination_first.put_in( item( itype_id( "rock" ) ), pocket_type::CONTAINER ).success() );
    REQUIRE( source_second.put_in( item( itype_id( "rock" ) ), pocket_type::CONTAINER ).success() );
    REQUIRE( destination.put_in( destination_first, pocket_type::CONTAINER ).success() );
    REQUIRE( destination.put_in( destination_second, pocket_type::CONTAINER ).success() );
    REQUIRE( source.put_in( source_first, pocket_type::CONTAINER ).success() );
    REQUIRE( source.put_in( source_second, pocket_type::CONTAINER ).success() );

    const int64_t destination_uid = destination.uid().get_value();
    const int64_t source_uid = source.uid().get_value();
    const auto tree_uids = []( const item &root ) {
        std::vector<int64_t> result{ root.uid().get_value() };
        for( const item *nested : root.all_items_ptr() ) {
            result.push_back( nested->uid().get_value() );
        }
        return result;
    };
    const std::vector<int64_t> destination_tree = tree_uids( destination );
    const std::vector<int64_t> source_tree = tree_uids( source );
    CHECK( destination.all_items_ptr().size() == source.all_items_ptr().size() );
    CHECK_FALSE( destination.transfer_identity_from( source ) );
    CHECK( destination.uid().get_value() == destination_uid );
    CHECK( source.uid().get_value() == source_uid );
    CHECK( tree_uids( destination ) == destination_tree );
    CHECK( tree_uids( source ) == source_tree );
}

TEST_CASE( "Novgorod identity transfer preserves nested UIDs across pocket types", "[novgorod_semantic][pickup]" )
{
    item destination( itype_id( "mask_gas" ) );
    item source( itype_id( "mask_gas" ) );
    REQUIRE( destination.put_in( item( itype_id( "gasfilter_med" ) ), pocket_type::MAGAZINE_WELL ).success() );
    REQUIRE( source.put_in( item( itype_id( "gasfilter_med" ) ), pocket_type::MAGAZINE_WELL ).success() );
    REQUIRE( destination.put_in( item( itype_id( "outsert_clear" ) ), pocket_type::CONTAINER ).success() );
    REQUIRE( source.put_in( item( itype_id( "outsert_clear" ) ), pocket_type::CONTAINER ).success() );
    const int64_t expected_root_uid = source.uid().get_value();
    const std::vector<int64_t> expected_nested_uids = [&]() {
        std::vector<int64_t> values;
        for( const item *nested : source.all_items_ptr() ) {
            values.push_back( nested->uid().get_value() );
        }
        return values;
    }();
    REQUIRE( destination.transfer_identity_from( source ) );
    CHECK( destination.uid().get_value() == expected_root_uid );
    std::vector<int64_t> actual_nested_uids;
    for( const item *nested : destination.all_items_ptr() ) {
        actual_nested_uids.push_back( nested->uid().get_value() );
    }
    CHECK( actual_nested_uids == expected_nested_uids );
}
