#include <fstream>
#include <cstdlib>
#include <algorithm>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <tuple>
#include <vector>

#ifndef _WIN32
#include <cstring>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

#include "action.h"
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "character.h"
#include "coordinates.h"
#include "debug.h"
#include "display.h"
#include "faction.h"
#include "field.h"
#include "field_type.h"
#include "flag.h"
#include "game.h"
#include "game_constants.h"
#include "input_context.h"
#include "item.h"
#include "item_location.h"
#include "json.h"
#include "json_loader.h"
#include "lightmap.h"
#include "map.h"
#include "map_helpers.h"
#include "map_selector.h"
#include "math_parser_diag_value.h"
#include "messages.h"
#include "npc.h"
#include "npc_class.h"
#include "npctalk.h"
#include "novgorod_semantic.h"
#include "output.h"
#include "path_info.h"
#include "player_helpers.h"
#include "player_activity.h"
#include "translations.h"
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
static const efftype_id p3_bleed( "bleed" );

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
    for( npc &subject : g->all_npcs() ) {
        subject.death_eocs.clear();
    }
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
        g->find_npc( id )->death_eocs.clear();
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
    request.allow_omitted_members();
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
    readback.allow_omitted_members();
    CHECK( readback.get_string( "operation_id" ) == request.get_string( "operation_id" ) );
    if( result.applied && primitive == "speak" ) {
        const JsonObject effect = readback.get_object( "native_effect" );
        effect.allow_omitted_members();
        const JsonObject args = request.get_object( "args" );
        args.allow_omitted_members();
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
                          const std::string &utterance = "", const std::vector<int> &direction = {},
                          const std::string &delivery = "", const std::string &addressees = "" )
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
    if( !delivery.empty() ) {
        out.member( "delivery" );
        *out.get_stream() << delivery;
        out.set_need_separator();
    }
    if( !direction.empty() ) out.member( "direction", direction );
    out.end_object();
    if( !addressees.empty() ) {
        out.member( "references" ); out.start_object();
        out.member( "actors" );
        *out.get_stream() << addressees;
        out.set_need_separator();
        out.end_object();
    }
    out.end_object();
    return stream.str();
}

novgorod_semantic::operation_result run_live_request( const std::string &json )
{
    const JsonObject request = json_loader::from_string( json ).get_object();
    request.allow_omitted_members();
    auto result = novgorod_semantic::apply_operation( request );
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

const std::string memory_key = "novgorod_conversation_memory";

struct memory_record {
    std::string kind;
    std::string speaker_ref;
    std::string listener_ref;
    std::string text;
    int turn = 0;
};

std::string json_string( const std::string &text )
{
    std::ostringstream stream;
    JsonOut out( stream );
    out.write( text );
    return stream.str();
}

std::string raw_request( const std::string &primitive, const std::string &actor_id,
                         const std::string &args_json, const std::string &actors_json = "" )
{
    std::string json = "{\"schema\":\"p3_native_operation_request_v1\",\"operation_id\":\"focused-live\","
                       "\"actor_id\":" + json_string( actor_id ) + ",\"primitive\":" + json_string( primitive ) +
                       ",\"expected_native_observation\":{\"actor_id\":" + json_string( actor_id ) +
                       ",\"turn\":" + std::to_string( to_turn<int>( calendar::turn ) ) + "},\"args\":" + args_json;
    if( !actors_json.empty() ) {
        json += ",\"references\":{\"actors\":" + actors_json + "}";
    }
    return json + "}";
}

JsonObject parse_object( const std::string &json )
{
    const JsonObject object = json_loader::from_string( json ).get_object();
    object.allow_omitted_members();
    return object;
}

std::string id_text( const Character &guy )
{
    return std::to_string( guy.getID().get_value() );
}

std::string npc_ref( const Character &guy )
{
    return "npc:" + id_text( guy );
}

npc &npc_by_id( const character_id &id )
{
    npc *guy = g->find_npc( id );
    REQUIRE( guy != nullptr );
    return *guy;
}

std::vector<character_id> fixture_ids()
{
    std::vector<character_id> ids;
    for( npc &guy : g->all_npcs() ) {
        ids.push_back( guy.getID() );
    }
    return ids;
}

character_id make_npc( int x, int y )
{
    npc &guy = spawn_npc( point_bub_ms( x, y ), p3_talker.str() );
    guy.death_eocs.clear();
    guy.set_attitude( NPCATT_NULL );
    guy.assign_activity( wait_activity_actor( 1_hours ) );
    return guy.getID();
}

std::vector<memory_record> memory_from_array( const JsonArray &array )
{
    std::vector<memory_record> records;
    for( const JsonObject record : array ) {
        record.allow_omitted_members();
        records.push_back( { record.get_string( "kind" ), record.get_string( "speaker_ref" ),
                             record.get_string( "listener_ref" ), record.get_string( "text" ),
                             record.get_int( "turn" ) } );
    }
    return records;
}

std::string memory_raw( const npc &guy )
{
    const diag_value *value = guy.maybe_get_value( memory_key );
    return value == nullptr ? std::string() : value->str();
}

std::vector<memory_record> memory_of( const npc &guy )
{
    const std::string raw = memory_raw( guy );
    if( raw.empty() ) {
        return {};
    }
    const JsonValue value = json_loader::from_string( raw );
    return memory_from_array( value.get_array() );
}

void check_record( const memory_record &record, const std::string &kind,
                   const std::string &speaker_ref, const std::string &listener_ref,
                   const std::string &text, int turn )
{
    CHECK( record.kind == kind );
    CHECK( record.speaker_ref == speaker_ref );
    CHECK( record.listener_ref == listener_ref );
    CHECK( record.text == text );
    CHECK( record.turn == turn );
}

std::string message_log()
{
    std::string log;
    for( const auto &message : Messages::recent_messages( 500 ) ) {
        log += message.second;
        log += '\n';
    }
    return log;
}

void process_all_sounds()
{
    for( npc &guy : g->all_npcs() ) {
        sounds::process_sound_markers( &guy );
    }
    sounds::process_sound_markers( &get_avatar() );
}

novgorod_semantic::operation_result complete_operation()
{
    if( g->has_novgorod_actions() ) {
        g->do_turn();
    }
    for( int turn = 0; turn < 20 && !get_avatar().activity.is_null(); ++turn ) {
        g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
        g->do_turn();
    }
    return novgorod_semantic::finish_operation();
}

novgorod_semantic::operation_result run_npc_request( const std::string &json )
{
    auto result = novgorod_semantic::apply_operation( parse_object( json ) );
    if( result.applied ) {
        process_all_sounds();
        result = complete_operation();
    }
    return result;
}

novgorod_semantic::operation_result run_instant_avatar_speech( const std::string &utterance,
        const std::string &addressees, int loudness = 3 )
{
    avatar &you = get_avatar();
    you.set_moves( 1000 );
    sounds::reset_sounds();
    const std::string delivery = "{\"loudness\":" + std::to_string( loudness ) +
                                 ",\"duration_class\":\"instant\"}";
    auto result = novgorod_semantic::apply_operation( parse_object( live_request( "speak",
                  id_text( you ), utterance, {}, delivery, addressees ) ) );
    if( result.applied ) {
        for( npc &listener : g->all_npcs() ) {
            sounds::process_sound_markers( &listener );
        }
        result = novgorod_semantic::finish_operation();
    }
    return result;
}

std::vector<std::string> heard_ids( const std::string &readback_json )
{
    const JsonObject effect = parse_object( readback_json ).get_object( "native_effect" );
    effect.allow_omitted_members();
    return effect.get_string_array( "actualHeardListenerIds" );
}

bool contains( const std::vector<std::string> &values, const std::string &value )
{
    return std::find( values.begin(), values.end(), value ) != values.end();
}
} // namespace

TEST_CASE( "Novgorod live observation excludes diagnostic and legacy intent state", "[novgorod_live]" )
{
    reset_p3_fixture();
    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = json_loader::from_string( stream.str() ).get_object();
    observation.allow_omitted_members();
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
    std::string addressees;
    std::string expected_sound = utterance;
    SECTION( "avatar" ) {}
    SECTION( "NPC" ) {
        for( npc &guy : g->all_npcs() ) {
            if( !guy.is_deaf() ) {
                actor = std::to_string( guy.getID().get_value() );
                addressees = "[\"avatar\"]";
                expected_sound = string_format( _( "%1$s saying \"%2$s\"" ), guy.get_name(), utterance );
                break;
            }
        }
    }
    sounds::reset_sounds();
    you.set_moves( 0 );
    const auto result = run_live_request( live_request( "speak", actor, utterance, {}, "", addressees ) );
    REQUIRE( result.applied );
    const JsonObject readback = json_loader::from_string( result.json ).get_object();
    readback.allow_omitted_members();
    const JsonObject effect = readback.get_object( "native_effect" );
    effect.allow_omitted_members();
    CHECK( effect.get_string( "utterance" ) == utterance );
    CHECK( effect.get_string( "native_sound" ) == expected_sound );
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

TEST_CASE( "Novgorod speech delivery uses native volume and duration", "[novgorod_live][novgorod_delivery]" )
{
    for( int loudness = 1; loudness <= 4; ++loudness ) {
        for( const std::string duration : { "instant", "brief", "sustained" } ) {
            CAPTURE( loudness, duration );
            reset_p3_fixture();
            avatar &you = get_avatar();
            const native_snapshot before = take_snapshot();
            const int native_cost = you.get_speed();
            const int native_volume = loudness == 1 ? Character::minimum_voice_volume :
                                      loudness == 2 ? you.indoor_voice() : you.get_shout_volume();
            const std::string delivery = "{\"loudness\":" + std::to_string( loudness ) +
                                         ",\"duration_class\":\"" + duration + "\"}";
            const std::string request = live_request( "speak", std::to_string( you.getID().get_value() ),
                                        "one exact native emission", {}, delivery );
            sounds::reset_sounds();
            auto result = novgorod_semantic::apply_operation( json_loader::from_string( request ).get_object() );
            CHECK( result.applied == ( duration != "sustained" ) );
            CHECK( sounds::get_monster_sounds().first.size() == ( result.applied ? 1 : 0 ) );
            if( result.applied ) {
                if( duration == "instant" ) {
                    CHECK( you.activity.is_null() );
                    CHECK( you.get_moves() == before.moves - native_cost );
                    for( npc &listener : g->all_npcs() ) sounds::process_sound_markers( &listener );
                } else {
                    REQUIRE_FALSE( you.activity.is_null() );
                    CHECK( you.activity.moves_left == to_moves<int>( 3_seconds ) );
                    for( int turn = 0; turn < 20 && !you.activity.is_null(); ++turn ) {
                        g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
                        g->do_turn();
                    }
                    REQUIRE( you.activity.is_null() );
                }
                result = novgorod_semantic::finish_operation();
                const JsonObject readback = json_loader::from_string( result.json ).get_object();
                readback.allow_omitted_members();
                const JsonObject effect = readback.get_object( "native_effect" );
                effect.allow_omitted_members();
                CHECK( effect.get_int( "sound_volume" ) == native_volume );
                CHECK( effect.get_string( "native_sound" ) == "one exact native emission" );
                if( duration == "instant" ) CHECK( effect.get_int( "elapsed_seconds" ) == 0 );
                else CHECK( effect.get_int( "elapsed_seconds" ) >= 3 );
            } else {
                CHECK( result.json.find( "NOVGOROD_SUSTAINED_SPEECH_UNSUPPORTED" ) != std::string::npos );
                CHECK( take_snapshot().world_signature == before.world_signature );
                CHECK( calendar::turn == before.native_time );
                CHECK( you.get_moves() == before.moves );
                CHECK( you.activity.is_null() );
            }
        }
    }
}

TEST_CASE( "Novgorod malformed speech delivery refuses before emission", "[novgorod_live][novgorod_delivery]" )
{
    reset_p3_fixture();
    const native_snapshot before = take_snapshot();
    for( const std::string delivery : {
             "null", "[]", "{}", "{\"loudness\":2}", "{\"duration_class\":\"brief\"}",
             "{\"loudness\":\"2\",\"duration_class\":\"brief\"}",
             "{\"loudness\":2.5,\"duration_class\":\"brief\"}",
             "{\"loudness\":true,\"duration_class\":\"brief\"}",
             "{\"loudness\":0,\"duration_class\":\"brief\"}",
             "{\"loudness\":5,\"duration_class\":\"brief\"}",
             "{\"loudness\":2,\"duration_class\":null}",
             "{\"loudness\":2,\"duration_class\":\"brief\",\"extra\":true}",
             "{\"loudness\":2,\"duration_class\":\"unknown\"}" } ) {
        CAPTURE( delivery );
        sounds::reset_sounds();
        const auto result = run_live_request( live_request( "speak",
                            std::to_string( get_avatar().getID().get_value() ), "must not emit", {}, delivery ) );
        CHECK_FALSE( result.applied );
        CHECK( sounds::get_monster_sounds().first.empty() );
        CHECK( take_snapshot().world_signature == before.world_signature );
        CHECK( calendar::turn == before.native_time );
        CHECK( get_avatar().get_moves() == before.moves );
        CHECK( get_avatar().activity.is_null() );
    }
}

TEST_CASE( "Novgorod live movement shares native dispatch and bounds", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::string actor = std::to_string( you.getID().get_value() );
    SECTION( "unseen equivalent diagonal" ) {
        const tripoint_abs_ms before = you.pos_abs();
        const auto result = run_live_request( live_request( "move", actor, "", { -1, -1 } ) );
        REQUIRE( result.applied );
        CHECK( you.pos_abs() == before + tripoint_rel_ms( -1, -1, 0 ) );
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

namespace
{
std::string boundary_request( const std::string &primitive, const std::string &args_json,
                              const std::string &references_json )
{
    const std::string actor = std::to_string( get_avatar().getID().get_value() );
    const std::string turn = std::to_string( to_turn<int>( calendar::turn ) );
    return "{\"schema\":\"p3_native_operation_request_v1\",\"operation_id\":\"focused-live\","
           "\"expected_native_observation\":{\"turn\":" + turn + ",\"revision\":" + turn +
           ",\"actor_id\":\"" + actor + "\",\"references\":" + references_json + "},"
           "\"actor_id\":\"" + actor + "\",\"primitive\":\"" + primitive + "\",\"args\":" + args_json +
           ",\"references\":" + references_json + "}";
}

std::string carried_item_uid( const itype_id &type )
{
    std::string id;
    for( const item *it : get_avatar().items_with( [&]( const item &candidate ) {
    return candidate.typeId() == type;
} ) ) {
        id = std::to_string( it->uid().get_value() );
    }
    REQUIRE_FALSE( id.empty() );
    return id;
}

std::string carried_item_reference( const itype_id &type )
{
    const std::string id = carried_item_uid( type );
    return "{\"items\":{\"ref\":\"item:" + id + "\",\"id\":\"" + id + "\"}}";
}

std::string target_ref( const tripoint_bub_ms &p )
{
    return std::to_string( p.x() ) + "," + std::to_string( p.y() ) + "," + std::to_string( p.z() );
}
} // namespace

TEST_CASE( "Novgorod live item and target references carry ref and id", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    map &here = get_map();
    novgorod_semantic::operation_result result;
    SECTION( "carried item" ) {
        const std::string references = carried_item_reference( itype_id( "flashlight" ) );
        CHECK( capture_debugmsg_during( [&]() {
            result = run_live_request( boundary_request( "use_item", "{\"method\":\"transform\"}",
                                       references ) );
        } ) == "" );
        REQUIRE( result.applied );
        CHECK( you.items_with( []( const item & it ) {
            return it.typeId() == itype_id( "flashlight_on" );
        } ).size() == 1 );
    }
    SECTION( "adjacent target" ) {
        const tripoint_bub_ms door = you.pos_bub() + tripoint_rel_ms( 1, 0, 0 );
        const std::string target = target_ref( door );
        CHECK( capture_debugmsg_during( [&]() {
            result = run_live_request( boundary_request( "open", "{\"direction\":[1,0]}",
                                       "{\"targets\":{\"ref\":\"" + target + "\",\"id\":\"" + target + "\"}}" ) );
        } ) == "" );
        REQUIRE( result.applied );
        CHECK( here.ter( door ) == ter_str_id( "t_door_o" ) );
    }
    SECTION( "carried item and adjacent target together" ) {
        const tripoint_bub_ms kindling = you.pos_bub() + tripoint_rel_ms( -1, 0, 0 );
        const std::string id = carried_item_uid( itype_id( "crude_firestarter" ) );
        const std::string target = target_ref( kindling );
        CHECK( capture_debugmsg_during( [&]() {
            result = run_live_request( boundary_request( "use_item",
                                       "{\"method\":\"firestarter\",\"target_direction\":[-1,0]}",
                                       "{\"items\":{\"ref\":\"item:" + id + "\",\"id\":\"" + id + "\"},"
                                       "\"targets\":{\"ref\":\"" + target + "\",\"id\":\"" + target + "\"}}" ) );
        } ) == "" );
        REQUIRE( result.applied );
        CHECK( ( here.get_field( kindling, fd_fire ) != nullptr ||
                 you.activity.id() == activity_id( "ACT_START_FIRE" ) ) );
    }
}

TEST_CASE( "Novgorod live references that disagree with their id are refused", "[novgorod_live]" )
{
    reset_p3_fixture();
    const std::string id = carried_item_uid( itype_id( "flashlight" ) );
    const std::string other = carried_item_uid( itype_id( "crude_firestarter" ) );
    const std::string door = target_ref( get_avatar().pos_bub() + tripoint_rel_ms( 1, 0, 0 ) );
    const std::string wall = target_ref( get_avatar().pos_bub() + tripoint_rel_ms( 0, -1, 0 ) );
    const std::string use = "{\"method\":\"transform\"}";
    const std::string open = "{\"direction\":[1,0]}";
    std::string primitive;
    std::string args;
    std::string references;
    std::string code;
    SECTION( "item ref without the item prefix" ) {
        primitive = "use_item";
        args = use;
        references = "{\"items\":{\"ref\":\"" + id + "\",\"id\":\"" + id + "\"}}";
        code = "NOVGOROD_ITEM_REFERENCE_MISMATCH";
    }
    SECTION( "item ref naming another item" ) {
        primitive = "use_item";
        args = use;
        references = "{\"items\":{\"ref\":\"item:" + other + "\",\"id\":\"" + id + "\"}}";
        code = "NOVGOROD_ITEM_REFERENCE_MISMATCH";
    }
    SECTION( "item ref missing" ) {
        primitive = "use_item";
        args = use;
        references = "{\"items\":{\"id\":\"" + id + "\"}}";
    }
    SECTION( "target ref differing from its id" ) {
        primitive = "open";
        args = open;
        references = "{\"targets\":{\"ref\":\"" + wall + "\",\"id\":\"" + door + "\"}}";
        code = "NOVGOROD_TARGET_REFERENCE_MISMATCH";
    }
    SECTION( "target naming another tile" ) {
        primitive = "open";
        args = open;
        references = "{\"targets\":{\"ref\":\"" + wall + "\",\"id\":\"" + wall + "\"}}";
        code = "NOVGOROD_TARGET_REFERENCE_MISMATCH";
    }
    CAPTURE( primitive, references );
    const native_snapshot before = take_snapshot();
    novgorod_semantic::operation_result result;
    CHECK( capture_debugmsg_during( [&]() {
        result = run_live_request( boundary_request( primitive, args, references ) );
    } ) == "" );
    CHECK_FALSE( result.applied );
    if( !code.empty() ) CHECK( result.json.find( code ) != std::string::npos );
    CHECK( take_snapshot().world_signature == before.world_signature );
    CHECK( calendar::turn == before.native_time );
    CHECK( get_avatar().get_moves() == before.moves );
}

TEST_CASE( "Novgorod live item use without a needed adjacent target is refused", "[novgorod_live]" )
{
    reset_p3_fixture();
    const std::string references = carried_item_reference( itype_id( "crude_firestarter" ) );
    const native_snapshot before = take_snapshot();
    const std::string log_before = message_log();
    novgorod_semantic::operation_result result;
    REQUIRE_NOTHROW( result = run_live_request( boundary_request( "use_item",
                              "{\"method\":\"firestarter\"}", references ) ) );
    CHECK_FALSE( result.applied );
    CHECK( result.json.find( "NOVGOROD_ADJACENT_TARGET_MISSING" ) != std::string::npos );
    CHECK( take_snapshot().world_signature == before.world_signature );
    CHECK( get_avatar().activity.is_null() );
    CHECK( message_log() == log_before );
}

TEST_CASE( "Novgorod live avatar speech enters the native message log", "[novgorod_live]" )
{
    reset_p3_fixture();
    const std::string actor = std::to_string( get_avatar().getID().get_value() );
    Messages::clear_messages();
    const auto result = run_live_request( live_request( "speak", actor, "Здравствуй, мастер." ) );
    REQUIRE( result.applied );
    CHECK( message_log().find( "You yell \"Здравствуй, мастер.\"" ) != std::string::npos );
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

#ifndef _WIN32
namespace
{
struct live_peer {
    std::string path = "/tmp/novgorod-client-" + std::to_string( getpid() ) + ".sock";
    std::string old_socket;
    std::string old_timeout;
    bool had_socket = std::getenv( "NOVGOROD_P3_SOCKET" ) != nullptr;
    bool had_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" ) != nullptr;
    int listener = -1;
    pid_t child = -1;

    explicit live_peer( bool timeout, const std::string &expected_target = "",
                        const std::string &result_message = "" ) {
        if( had_socket ) old_socket = std::getenv( "NOVGOROD_P3_SOCKET" );
        if( had_timeout ) old_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" );
        sockaddr_un address {};
        address.sun_family = AF_UNIX;
        std::strcpy( address.sun_path, path.c_str() );
        unlink( path.c_str() );
        listener = socket( AF_UNIX, SOCK_STREAM, 0 );
        REQUIRE( listener >= 0 );
        REQUIRE( bind( listener, reinterpret_cast<sockaddr *>( &address ), sizeof( address ) ) == 0 );
        REQUIRE( listen( listener, 2 ) == 0 );
        setenv( "NOVGOROD_P3_SOCKET", path.c_str(), 1 );
        setenv( "NOVGOROD_P3_TIMEOUT_MS", "120000", 1 );
        child = fork();
        REQUIRE( child >= 0 );
        if( child != 0 ) return;
        std::string previous_id = "foreign";
        for( int attempt = 0; attempt < ( timeout ? 1 : 2 ); ++attempt ) {
            pollfd pending { listener, POLLIN, 0 };
            if( poll( &pending, 1, 5000 ) <= 0 ) _exit( 2 );
            const int peer = accept( listener, nullptr, nullptr );
            if( peer < 0 ) _exit( 3 );
            std::string line;
            char ch;
            while( recv( peer, &ch, 1, 0 ) == 1 && ch != '\n' ) line += ch;
            const JsonObject frame = json_loader::from_string( line ).get_object();
            frame.allow_omitted_members();
            const std::string id = frame.get_string( "id" );
            const JsonObject observation = frame.get_object( "observation" );
            observation.allow_omitted_members();
            if( frame.get_string( "intent" ) != "literal intent" ||
                observation.has_member( "native_snapshot" ) ) _exit( 4 );
            if( frame.get_string( "target_actor_ref", "" ) != expected_target ||
                frame.has_member( "target_actor_ref" ) != !expected_target.empty() ) _exit( 8 );
            const std::string response = timeout ?
                "{\"type\":\"role_phase\",\"id\":\"" + id + "\",\"timeout_ms\":1}\n" :
                "{\"type\":\"operation\",\"id\":\"" + previous_id + "\",\"request\":{}}\n" +
                "{\"type\":\"result\",\"id\":\"" + id + "\"" +
                ( result_message.empty() ? "" :
                  ",\"status\":\"refused\",\"code\":\"TURN_NPC_CONVERSATION_CONTRACT_FAILURE\",\"category\":\"semantic\",\"message\":\"" +
                  result_message + "\"" ) + "}\n";
            if( send( peer, response.data(), response.size(), MSG_NOSIGNAL ) !=
                static_cast<ssize_t>( response.size() ) ) _exit( 5 );
            pollfd completion { peer, POLLIN, 0 };
            if( poll( &completion, 1, 5000 ) <= 0 ) _exit( 6 );
            char unexpected;
            if( recv( peer, &unexpected, 1, 0 ) != 0 ) _exit( 7 );
            previous_id = id;
            shutdown( peer, SHUT_WR );
            close( peer );
        }
        _exit( 0 );
    }

    ~live_peer() {
        if( child > 0 ) {
            kill( child, SIGKILL );
            waitpid( child, nullptr, 0 );
        }
        if( listener >= 0 ) close( listener );
        unlink( path.c_str() );
        if( had_socket ) setenv( "NOVGOROD_P3_SOCKET", old_socket.c_str(), 1 );
        else unsetenv( "NOVGOROD_P3_SOCKET" );
        if( had_timeout ) setenv( "NOVGOROD_P3_TIMEOUT_MS", old_timeout.c_str(), 1 );
        else unsetenv( "NOVGOROD_P3_TIMEOUT_MS" );
    }

    void completed() {
        int status = 0;
        REQUIRE( waitpid( child, &status, 0 ) == child );
        child = -1;
        REQUIRE( WIFEXITED( status ) );
        CHECK( WEXITSTATUS( status ) == 0 );
    }
};
}

TEST_CASE( "Novgorod real live client reconnects and discards foreign replies", "[novgorod_live]" )
{
    reset_p3_fixture();
    const native_snapshot before = take_snapshot();
    live_peer peer( false );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
    peer.completed();
    CHECK( take_snapshot().world_signature == before.world_signature );
    CHECK( calendar::turn == before.native_time );
    CHECK( get_avatar().get_moves() == before.moves );
    CHECK( get_avatar().activity.is_null() );
}

TEST_CASE( "Novgorod refused coordinator result stays out of native messages", "[novgorod_live]" )
{
    reset_p3_fixture();
    Messages::clear_messages();
    const native_snapshot before = take_snapshot();
    const std::string marker = "SERVICE_MARKER";
    live_peer peer( false, "", marker );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
    peer.completed();
    CHECK( message_log().find( marker ) == std::string::npos );
    CHECK( take_snapshot().world_signature == before.world_signature );
}

TEST_CASE( "Novgorod native CHAT selection reaches real intent frame", "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    const Creature *target = nullptr;
    std::string expected_target;
    SECTION( "sole NPC candidate" ) {
        npc &subject = spawn_npc( point_bub_ms( 60, 62 ), p3_talker.str() );
        subject.death_eocs.clear();
        get_map().update_visibility_cache( get_avatar().posz() );
        target = select_chat_target();
        REQUIRE( target == &subject );
        expected_target = "npc:" + std::to_string( subject.getID().get_value() );
    }
    SECTION( "empty selection" ) {
        target = select_chat_target();
        REQUIRE( target == nullptr );
    }
    SECTION( "non NPC target" ) {
        target = &get_avatar();
    }
    live_peer peer( false, expected_target );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent", target ) );
    REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent", target ) );
    peer.completed();
}

TEST_CASE( "Novgorod real live client timeout leaves native world unchanged", "[novgorod_live]" )
{
    reset_p3_fixture();
    const native_snapshot before = take_snapshot();
    live_peer peer( true );
    CHECK_THROWS_WITH( novgorod_semantic::submit_live_intent( "literal intent" ),
                       "NOVGOROD_COORDINATOR_TIMEOUT" );
    peer.completed();
    CHECK( take_snapshot().world_signature == before.world_signature );
    CHECK( calendar::turn == before.native_time );
    CHECK( get_avatar().get_moves() == before.moves );
    CHECK( get_avatar().activity.is_null() );
}
#endif

TEST_CASE( "Novgorod semantic NPC speech shares native CHAT candidates", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    npc &subject = *g->all_npcs().begin();
    const std::string actor = std::to_string( subject.getID().get_value() );
    bool expected_eligible = true;
    SECTION( "visible nearby" ) {}
    SECTION( "dead NPC excluded by native creature traversal" ) {
        expected_eligible = false;
        subject.die( &get_map(), nullptr );
    }
    SECTION( "sleep remains eligible" ) {
        subject.add_effect( efftype_id( "sleep" ), 1_hours );
    }
    SECTION( "beyond CHAT radius" ) {
        expected_eligible = false;
        subject.setpos( get_map(), you.pos_bub() + tripoint_rel_ms( SEEX * 2 + 1, 0, 0 ) );
    }
    SECTION( "other level" ) {
        expected_eligible = false;
        subject.setpos( get_map(), you.pos_bub() + tripoint_rel_ms( 0, 0, 1 ) );
    }
    SECTION( "behind wall" ) {
        expected_eligible = false;
        subject.setpos( get_map(), you.pos_bub() + tripoint_rel_ms( 0, -2, 0 ) );
    }
    get_map().invalidate_map_cache( you.posz() );
    get_map().build_map_cache( you.posz() );
    get_map().update_visibility_cache( you.posz() );
    const auto candidates = chat_available_creatures();
    const bool eligible = std::find( candidates.begin(), candidates.end(), &subject ) != candidates.end();
    CHECK( eligible == expected_eligible );
    const auto result = novgorod_semantic::apply_operation( json_loader::from_string(
                            live_request( "speak", actor, "literal speech", {}, "", "[\"avatar\"]" ) ).get_object() );
    CHECK( result.applied == eligible );
    if( result.applied ) {
        const auto finished = novgorod_semantic::finish_operation();
        CHECK( finished.applied );
        you.cancel_activity();
    }
}

TEST_CASE( "Novgorod empty native CHAT selection keeps ordinary avatar speech", "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    CHECK( chat_available_creatures().empty() );
    CHECK( select_chat_target() == nullptr );
    const auto result = run_live_request( live_request( "speak",
                        std::to_string( get_avatar().getID().get_value() ), "ordinary speech" ) );
    CHECK( result.applied );
}

TEST_CASE( "Novgorod sole native CHAT candidate is selected automatically", "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    npc &subject = spawn_npc( point_bub_ms( 60, 62 ), p3_talker.str() );
    subject.death_eocs.clear();
    get_map().update_visibility_cache( get_avatar().posz() );
    REQUIRE( chat_available_creatures().size() == 1 );
    CHECK( select_chat_target() == &subject );
}

TEST_CASE( "Novgorod real operation frame projects expected observation metadata", "[novgorod_live]" )
{
    reset_p3_fixture();
    const std::string actor = std::to_string( get_avatar().getID().get_value() );
    const npc &listener = *g->all_npcs().begin();
    const std::string listener_id = std::to_string( listener.getID().get_value() );
    std::string expected_actor = actor;
    int expected_turn = to_turn<int>( calendar::turn );
    std::string refusal;
    SECTION( "current references and both clock fields" ) {}
    SECTION( "stale actor still refused" ) {
        expected_actor = "missing-actor";
        refusal = "NOVGOROD_STALE_ACTOR_ID";
    }
    SECTION( "stale observation still refused" ) {
        --expected_turn;
        refusal = "NOVGOROD_STALE_NATIVE_OBSERVATION";
    }
    const std::string references = "{\"actors\":[{\"ref\":\"npc:" + listener_id +
                                   "\",\"id\":\"" + listener_id + "\"}]}";
    const std::string frame = "{\"type\":\"operation\",\"request\":{"
                              "\"schema\":\"p3_native_operation_request_v1\","
                              "\"operation_id\":\"live-1\",\"expected_native_observation\":{"
                              "\"turn\":" + std::to_string( expected_turn ) +
                              ",\"revision\":" + std::to_string( expected_turn ) +
                              ",\"actor_id\":\"" + expected_actor + "\",\"references\":" + references +
                              "},\"actor_id\":\"" + actor + "\",\"primitive\":\"speak\","
                              "\"args\":{\"utterance\":\"Exact literal speech\"},\"references\":" + references +
                              "},\"id\":\"1\"}";
    const JsonObject wire = json_loader::from_string( frame ).get_object();
    wire.allow_omitted_members();
    const native_snapshot before = take_snapshot();
    auto result = novgorod_semantic::apply_operation( wire.get_object( "request" ) );
    if( refusal.empty() ) {
        REQUIRE( result.applied );
        result = novgorod_semantic::finish_operation();
        get_avatar().cancel_activity();
        const JsonObject readback = json_loader::from_string( result.json ).get_object();
        readback.allow_omitted_members();
        const JsonObject effect = readback.get_object( "native_effect" );
        effect.allow_omitted_members();
        CHECK( effect.get_string( "utterance" ) == "Exact literal speech" );
    } else {
        CHECK_FALSE( result.applied );
        CHECK( result.json.find( refusal ) != std::string::npos );
        CHECK( take_snapshot().world_signature == before.world_signature );
        CHECK( get_avatar().activity.is_null() );
    }
    CHECK( calendar::turn == before.native_time );
    CHECK( get_avatar().get_moves() == before.moves );
}

namespace
{
void refresh_visibility()
{
    map &here = get_map();
    const int z = get_avatar().posz();
    here.invalidate_map_cache( z );
    here.build_map_cache( z );
    here.update_visibility_cache( z );
}

std::string replace_token( std::string text, const std::string &token, const std::string &value )
{
    for( size_t at = text.find( token ); at != std::string::npos;
         at = text.find( token, at + value.size() ) ) {
        text.replace( at, token.size(), value );
    }
    return text;
}

struct item_row {
    std::string ref;
    std::string type;
    std::string label;
    std::string placement;
    bool ground;
    std::vector<int> position;
    std::string owner;
};

std::string uid_ref( const item &it )
{
    return "item:" + std::to_string( it.uid().get_value() );
}
} // namespace

TEST_CASE( "Novgorod NPC speech keeps native variable tags literal", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::vector<character_id> ids = fixture_ids();
    REQUIRE( ids.size() == 4 );
    const character_id far_id = make_npc( 125, 62 );
    refresh_visibility();
    const std::string secret = "SECRET_9_VALUE";
    for( npc &guy : g->all_npcs() ) {
        guy.set_value( "task04_secret", secret );
    }
    you.set_value( "task04_secret", secret );
    npc &speaker = npc_by_id( ids[0] );
    npc &hearer = npc_by_id( ids[1] );
    const std::string utterance = "<npc_val:task04_secret> <u_val:task04_secret> %s [x] — как есть";
    Messages::clear_messages();
    sounds::reset_sounds();
    you.set_moves( 0 );
    const auto result = run_npc_request( raw_request( "speak", id_text( speaker ),
                                         "{\"utterance\":" + json_string( utterance ) + "}", "[\"avatar\"]" ) );
    REQUIRE( result.applied );
    CHECK( result.json.find( secret ) == std::string::npos );
    const JsonObject effect = parse_object( result.json ).get_object( "native_effect" );
    effect.allow_omitted_members();
    CHECK( effect.get_string( "utterance" ) == utterance );
    CHECK( effect.get_string( "native_sound" ) ==
           string_format( _( "%1$s saying \"%2$s\"" ), speaker.get_name(), utterance ) );
    const std::vector<std::string> heard = effect.get_string_array( "actualHeardListenerIds" );
    CHECK( contains( heard, id_text( hearer ) ) );
    CHECK_FALSE( contains( heard, id_text( npc_by_id( far_id ) ) ) );
    const std::string log = message_log();
    CHECK( log.find( secret ) == std::string::npos );
    CHECK( log.find( "<npc_val:task04_secret>" ) != std::string::npos );
    for( npc &guy : g->all_npcs() ) {
        CHECK( memory_raw( guy ).find( secret ) == std::string::npos );
    }
    const std::vector<memory_record> said = memory_of( speaker );
    REQUIRE( said.size() == 1 );
    CHECK( said[0].kind == "said" );
    CHECK( said[0].text == utterance );

    Messages::clear_messages();
    sounds::reset_sounds();
    speaker.say( "<npc_val:task04_secret> end" );
    process_all_sounds();
    const std::string native_log = message_log();
    CHECK( native_log.find( secret + " end" ) != std::string::npos );
    CHECK( native_log.find( "<npc_val" ) == std::string::npos );
}

TEST_CASE( "Novgorod NPC silence is visible behaviour without sound", "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::vector<character_id> ids = fixture_ids();
    npc &speaker = npc_by_id( ids[0] );
    refresh_visibility();
    const std::string behavior = "молчит, поджав губы 100% %s";
    const std::string args = "{\"contribution_kind\":\"silence\",\"visible_behavior\":" +
                             json_string( behavior ) + "}";
    SECTION( "visible NPC" ) {
        Messages::clear_messages();
        sounds::reset_sounds();
        you.set_moves( 0 );
        const int applied_turn = to_turn<int>( calendar::turn );
        auto result = novgorod_semantic::apply_operation( parse_object( raw_request( "speak",
                      id_text( speaker ), args, "[\"avatar\"]" ) ) );
        REQUIRE( result.applied );
        CHECK( sounds::get_monster_sounds().first.empty() );
        CHECK( sounds::get_monster_sounds().second.empty() );
        result = complete_operation();
        REQUIRE( result.applied );
        const JsonObject readback = parse_object( result.json );
        CHECK( readback.get_string( "status" ) == "applied" );
        const JsonObject effect = readback.get_object( "native_effect" );
        effect.allow_omitted_members();
        CHECK( effect.get_bool( "world_changed" ) );
        CHECK( effect.get_string( "contribution_kind" ) == "silence" );
        CHECK( effect.get_string( "speakerId" ) == id_text( speaker ) );
        CHECK( effect.get_string( "visible_behavior" ) == behavior );
        CHECK( effect.get_string_array( "actualHeardListenerIds" ).empty() );
        CHECK_FALSE( effect.has_member( "utterance" ) );
        CHECK_FALSE( effect.has_member( "native_sound" ) );
        CHECK( message_log().find( behavior ) != std::string::npos );
        const std::vector<memory_record> records = memory_of( speaker );
        REQUIRE( records.size() == 1 );
        check_record( records[0], "silence", npc_ref( speaker ), "avatar", "", applied_turn );
        for( const npc &guy : g->all_npcs() ) {
            if( guy.getID() != speaker.getID() ) {
                CHECK( memory_raw( guy ).empty() );
            }
        }
    }
    SECTION( "NPC the player cannot see" ) {
        speaker.setpos( get_map(), you.pos_bub() + tripoint_rel_ms( 0, -2, 0 ) );
        refresh_visibility();
        const std::string log_before = message_log();
        sounds::reset_sounds();
        const auto result = novgorod_semantic::apply_operation( parse_object( raw_request( "speak",
                            id_text( speaker ), args, "[\"avatar\"]" ) ) );
        CHECK_FALSE( result.applied );
        CHECK( result.json.find( "NOVGOROD_STALE_OR_INVISIBLE_NPC_ACTOR" ) != std::string::npos );
        CHECK( message_log() == log_before );
        CHECK( memory_raw( speaker ).empty() );
    }
}

TEST_CASE( "Novgorod speech refusals leave the native world unchanged", "[novgorod_live]" )
{
    struct refusal_case {
        std::string name;
        bool npc_actor;
        bool mute;
        std::string args;
        std::string actors;
        std::string code;
    };
    const std::string silence = "{\"contribution_kind\":\"silence\",\"visible_behavior\":\"молчит\"}";
    const std::string say = "{\"utterance\":\"слово\"}";
    const std::vector<refusal_case> cases = {
        { "avatar silence", false, false, silence, "", "NOVGOROD_SILENCE_REQUIRES_NPC" },
        { "silence without behavior", true, false, "{\"contribution_kind\":\"silence\"}", "[\"avatar\"]",
          "NOVGOROD_SILENCE_BEHAVIOR_REQUIRED" },
        { "silence with empty behavior", true, false,
          "{\"contribution_kind\":\"silence\",\"visible_behavior\":\"\"}", "[\"avatar\"]",
          "NOVGOROD_SILENCE_BEHAVIOR_REQUIRED" },
        { "silence with utterance", true, false,
          "{\"contribution_kind\":\"silence\",\"visible_behavior\":\"молчит\",\"utterance\":\"слово\"}",
          "[\"avatar\"]", "NOVGOROD_SPEECH_ARGS_INVALID" },
        { "kind speech", false, false, "{\"utterance\":\"слово\",\"contribution_kind\":\"speech\"}", "",
          "NOVGOROD_SPEECH_ARGS_INVALID" },
        { "kind whisper", false, false, "{\"utterance\":\"слово\",\"contribution_kind\":\"whisper\"}", "",
          "NOVGOROD_SPEECH_ARGS_INVALID" },
        { "reason on speech", false, false, "{\"utterance\":\"слово\",\"reason\":\"потому\"}", "",
          "NOVGOROD_SPEECH_ARGS_INVALID" },
        { "reason on silence", true, false,
          "{\"contribution_kind\":\"silence\",\"visible_behavior\":\"молчит\",\"reason\":\"потому\"}",
          "[\"avatar\"]", "NOVGOROD_SPEECH_ARGS_INVALID" },
        { "NPC speech without references", true, false, say, "", "NOVGOROD_SPEECH_ADDRESSEE_REQUIRED" },
        { "NPC speech with empty addressees", true, false, say, "[]", "NOVGOROD_SPEECH_ADDRESSEE_REQUIRED" },
        { "NPC speech with two addressees", true, false, say, "[\"avatar\",\"npc:%L\"]",
          "NOVGOROD_SPEECH_ADDRESSEE_REQUIRED" },
        { "NPC silence without references", true, false, silence, "", "NOVGOROD_SPEECH_ADDRESSEE_REQUIRED" },
        { "unknown NPC addressee", false, false, say, "[\"npc:99999\"]", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "malformed addressee", false, false, say, "[\"bogus\"]", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "duplicate addressee", false, false, say, "[\"avatar\",\"avatar\"]",
          "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "hidden NPC addressee", false, false, say, "[\"npc:%H\"]", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "numeric addressee", false, false, say, "[5]", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "null addressee", false, false, say, "[null]", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "addressees not an array", false, false, say, "\"avatar\"", "NOVGOROD_SPEECH_ADDRESSEE_INVALID" },
        { "NPC speech with delivery", true, false,
          "{\"utterance\":\"слово\",\"delivery\":{\"loudness\":2,\"duration_class\":\"brief\"}}",
          "[\"avatar\"]", "NOVGOROD_NPC_SPEECH_DELIVERY_UNSUPPORTED" },
        { "mute NPC", true, true, say, "[\"avatar\"]", "NOVGOROD_NATIVE_SPEAKER_CANNOT_SPEAK" },
    };
    for( const refusal_case &c : cases ) {
        CAPTURE( c.name );
        reset_p3_fixture();
        avatar &you = get_avatar();
        const std::vector<character_id> ids = fixture_ids();
        const character_id hidden_id = make_npc( 60, 58 );
        refresh_visibility();
        npc &speaker = npc_by_id( ids[0] );
        if( c.mute ) {
            item mask( itype_id( "hat_knit" ) );
            mask.set_flag( flag_MUTE );
            speaker.wear_item( mask, false );
            REQUIRE( speaker.is_mute() );
        }
        const std::string actor = c.npc_actor ? id_text( speaker ) : id_text( you );
        std::string actors = replace_token( c.actors, "%L", id_text( npc_by_id( ids[1] ) ) );
        actors = replace_token( actors, "%H", id_text( npc_by_id( hidden_id ) ) );
        const native_snapshot before = take_snapshot();
        const std::string log_before = message_log();
        sounds::reset_sounds();
        const auto result = novgorod_semantic::apply_operation( parse_object( raw_request( "speak", actor,
                            c.args, actors ) ) );
        CHECK_FALSE( result.applied );
        CHECK( result.json.find( c.code ) != std::string::npos );
        CHECK( sounds::get_monster_sounds().first.empty() );
        CHECK( take_snapshot().world_signature == before.world_signature );
        CHECK( calendar::turn == before.native_time );
        CHECK( you.get_moves() == before.moves );
        CHECK( you.activity.is_null() );
        CHECK( message_log() == log_before );
        for( const npc &guy : g->all_npcs() ) {
            CHECK( memory_raw( guy ).empty() );
        }
    }
}

TEST_CASE( "Novgorod conversation memory records what was heard said and kept silent",
           "[novgorod_live]" )
{
    reset_p3_fixture();
    avatar &you = get_avatar();
    const std::vector<character_id> ids = fixture_ids();
    REQUIRE( ids.size() == 4 );
    refresh_visibility();
    npc &speaker = npc_by_id( ids[0] );
    npc &listener = npc_by_id( ids[1] );
    npc &deaf_one = npc_by_id( ids[2] );
    npc &deaf_two = npc_by_id( ids[3] );
    const std::string utterance = "Слушай, <come_here> 100% %s";
    SECTION( "avatar speech to an NPC" ) {
        const int turn = to_turn<int>( calendar::turn );
        const auto result = run_instant_avatar_speech( utterance, "[\"npc:" + id_text( listener ) + "\"]" );
        REQUIRE( result.applied );
        const std::vector<std::string> heard = heard_ids( result.json );
        CHECK( contains( heard, id_text( speaker ) ) );
        CHECK( contains( heard, id_text( listener ) ) );
        const std::vector<memory_record> speaker_records = memory_of( speaker );
        REQUIRE( speaker_records.size() == 1 );
        check_record( speaker_records[0], "heard", "avatar", npc_ref( listener ), utterance, turn );
        const std::vector<memory_record> listener_records = memory_of( listener );
        REQUIRE( listener_records.size() == 1 );
        check_record( listener_records[0], "heard", "avatar", npc_ref( listener ), utterance, turn );
        CHECK( memory_raw( deaf_one ).empty() );
        CHECK( memory_raw( deaf_two ).empty() );
        CHECK( you.maybe_get_value( memory_key ) == nullptr );
    }
    SECTION( "avatar speech without addressee writes no heard record" ) {
        const auto result = run_instant_avatar_speech( utterance, "" );
        REQUIRE( result.applied );
        CHECK( contains( heard_ids( result.json ), id_text( listener ) ) );
        for( const npc &guy : g->all_npcs() ) {
            CHECK( memory_raw( guy ).empty() );
        }
    }
    SECTION( "records accumulate in order" ) {
        const std::string addressee = "[\"npc:" + id_text( listener ) + "\"]";
        REQUIRE( run_instant_avatar_speech( "первое", addressee ).applied );
        calendar::turn += 5_seconds;
        REQUIRE( run_instant_avatar_speech( "второе", addressee ).applied );
        const std::vector<memory_record> records = memory_of( listener );
        REQUIRE( records.size() == 2 );
        CHECK( records[0].text == "первое" );
        CHECK( records[1].text == "второе" );
        CHECK( records[1].turn == records[0].turn + 5 );
    }
    SECTION( "NPC speech to the avatar" ) {
        sounds::reset_sounds();
        you.set_moves( 0 );
        const int turn = to_turn<int>( calendar::turn );
        auto result = novgorod_semantic::apply_operation( parse_object( raw_request( "speak",
                      id_text( speaker ), "{\"utterance\":" + json_string( utterance ) + "}",
                      "[\"avatar\"]" ) ) );
        REQUIRE( result.applied );
        process_all_sounds();
        const std::vector<memory_record> said = memory_of( speaker );
        REQUIRE( said.size() == 1 );
        check_record( said[0], "said", npc_ref( speaker ), "avatar", utterance, turn );
        const std::vector<memory_record> heard = memory_of( listener );
        REQUIRE( heard.size() == 1 );
        check_record( heard[0], "heard", npc_ref( speaker ), "avatar", utterance, turn );
        CHECK( memory_raw( deaf_one ).empty() );
        CHECK( memory_raw( deaf_two ).empty() );
        result = complete_operation();
        REQUIRE( result.applied );
        CHECK( memory_of( speaker ).size() == 1 );
        CHECK( memory_of( listener ).size() == 1 );
    }
}

TEST_CASE( "Novgorod frame exports NPC identity opinion memory and visible items", "[novgorod_live]" )
{
    const bool male = GENERATE( true, false );
    CAPTURE( male );
    reset_p3_fixture();
    clear_npcs();
    avatar &you = get_avatar();
    map &here = get_map();
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.i_clear( p );
    }
    const faction_id merchants( "free_merchants" );
    const faction_id followers( "your_followers" );
    const character_id guy_id = make_npc( 60, 62 );
    npc &guy = npc_by_id( guy_id );
    clear_character( guy, true );
    guy.setpos( here, tripoint_bub_ms( 60, 62, 0 ) );
    guy.male = male;
    guy.set_fac( merchants );
    guy.personality.aggression = 3;
    guy.personality.bravery = -2;
    guy.personality.collector = 5;
    guy.personality.altruism = 7;
    guy.op_of_u.trust = 4;
    guy.op_of_u.fear = 2;
    guy.op_of_u.value = 6;
    guy.op_of_u.anger = 1;
    item held( itype_id( "rock" ) );
    held.set_owner( merchants );
    guy.set_wielded_item( held );
    item pack( itype_id( "backpack" ) );
    REQUIRE( pack.put_in( item( itype_id( "stick" ) ), pocket_type::CONTAINER ).success() );
    REQUIRE( guy.wear_item( pack, false ).has_value() );

    const item &first = here.add_item( tripoint_bub_ms( 64, 63, 0 ), item( itype_id( "rock" ) ) );
    const std::string first_ref = uid_ref( first );
    item owned( itype_id( "stick" ) );
    owned.set_owner( followers );
    const item &second = here.add_item( tripoint_bub_ms( 61, 65, 0 ), owned );
    const std::string second_ref = uid_ref( second );
    const item &third = here.add_item( tripoint_bub_ms( 62, 62, 0 ), item( itype_id( "stick" ) ) );
    const std::string third_ref = uid_ref( third );
    const std::string rock_label = item( itype_id( "rock" ) ).type_name();
    const std::string stick_label = item( itype_id( "stick" ) ).type_name();
    for( const tripoint_bub_ms &wall : here.points_in_radius( tripoint_bub_ms( 80, 70, 0 ), 1 ) ) {
        here.ter_set( wall, p3_ter_wall );
    }
    here.ter_set( tripoint_bub_ms( 80, 70, 0 ), p3_ter_floor );
    here.add_item( tripoint_bub_ms( 80, 70, 0 ), item( itype_id( "rock" ) ) );
    refresh_visibility();
    REQUIRE( you.sees( here, guy.pos_bub() ) );

    std::vector<item_row> expected;
    const item *wielded = guy.get_wielded_item().get_item();
    REQUIRE( wielded != nullptr );
    expected.push_back( { uid_ref( *wielded ), "rock", wielded->type_name(), "wielded", false, {},
                          "free_merchants" } );
    int worn_count = 0;
    std::vector<const item *> worn_items;
    guy.worn.inv_dump( worn_items );
    for( const item *worn_ptr : worn_items ) {
        const item &worn_item = *worn_ptr;
        ++worn_count;
        expected.push_back( { uid_ref( worn_item ), "backpack", worn_item.type_name(), "worn", false, {},
                              worn_item.get_owner().str() } );
        for( const item *inner : worn_item.all_items_top() ) {
            expected.push_back( { uid_ref( *inner ), "stick", inner->type_name(), "carried", false, {},
                                  inner->get_owner().str() } );
        }
    }
    REQUIRE( worn_count == 1 );
    REQUIRE( expected.size() == 3 );
    expected.push_back( { first_ref, "rock", rock_label, "ground", true, { 64, 63, 0 }, "" } );
    expected.push_back( { second_ref, "stick", stick_label, "ground", true, { 61, 65, 0 }, "your_followers" } );
    expected.push_back( { third_ref, "stick", stick_label, "ground", true, { 62, 62, 0 }, "" } );

    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = parse_object( stream.str() );
    bool found = false;
    for( const JsonObject projection : observation.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) != id_text( guy ) ) {
            continue;
        }
        found = true;
        CHECK( projection.get_string( "name" ) == guy.get_name() );
        CHECK( projection.get_string( "template_id" ) == guy.idz.str() );
        CHECK( projection.get_string( "template_id" ) == "NPC_debug" );
        CHECK( projection.get_string( "gender" ) == ( male ? "male" : "female" ) );
        const JsonObject personality = projection.get_object( "personality" );
        personality.allow_omitted_members();
        CHECK( personality.get_int( "aggression" ) == 3 );
        CHECK( personality.get_int( "bravery" ) == -2 );
        CHECK( personality.get_int( "collector" ) == 5 );
        CHECK( personality.get_int( "altruism" ) == 7 );
        CHECK( projection.get_string( "faction_id" ) == "free_merchants" );
        const JsonObject opinion = projection.get_object( "opinion_of_avatar" );
        opinion.allow_omitted_members();
        CHECK( opinion.get_int( "trust" ) == 4 );
        CHECK( opinion.get_int( "fear" ) == 2 );
        CHECK( opinion.get_int( "value" ) == 6 );
        CHECK( opinion.get_int( "anger" ) == 1 );
        CHECK( projection.get_array( "conversation_memory" ).empty() );
        const JsonArray items = projection.get_array( "visible_items" );
        REQUIRE( items.size() == expected.size() );
        size_t index = 0;
        for( const JsonObject row : items ) {
            row.allow_omitted_members();
            const item_row &want = expected[index++];
            CAPTURE( want.ref );
            CHECK( row.get_string( "item_ref" ) == want.ref );
            CHECK( "item:" + row.get_string( "item_uid" ) == want.ref );
            CHECK( row.get_string( "type" ) == want.type );
            CHECK( row.get_string( "label" ) == want.label );
            CHECK( row.get_string( "placement" ) == want.placement );
            CHECK( row.get_string( "owner_faction_id" ) == want.owner );
            if( want.ground ) {
                CHECK( row.get_int_array( "position" ) == want.position );
            } else {
                CHECK( row.has_null( "position" ) );
            }
        }
    }
    CHECK( found );
    bool avatar_entry = false;
    bool npc_entry = false;
    for( const JsonObject actor : observation.get_array( "actors" ) ) {
        actor.allow_omitted_members();
        if( actor.get_string( "actor_ref" ) == npc_ref( guy ) ) {
            npc_entry = true;
            CHECK( actor.get_string( "name" ) == guy.get_name() );
        } else if( actor.get_string( "actor_ref" ) == "avatar" ) {
            avatar_entry = true;
            CHECK_FALSE( actor.has_member( "name" ) );
        }
    }
    CHECK( npc_entry );
    CHECK( avatar_entry );

    you.set_moves( 0 );
    const auto result = run_npc_request( raw_request( "speak", id_text( guy ), "{\"utterance\":\"слово\"}",
                                         "[\"avatar\"]" ) );
    REQUIRE( result.applied );
    std::ostringstream later_stream;
    JsonOut later_out( later_stream );
    novgorod_semantic::write_observation( later_out );
    const JsonObject later = parse_object( later_stream.str() );
    bool exported_found = false;
    for( const JsonObject projection : later.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) != id_text( guy ) ) {
            continue;
        }
        exported_found = true;
        const std::vector<memory_record> exported =
            memory_from_array( projection.get_array( "conversation_memory" ) );
        const std::vector<memory_record> stored = memory_of( guy );
        REQUIRE( stored.size() == 1 );
        REQUIRE( exported.size() == 1 );
        check_record( exported[0], stored[0].kind, stored[0].speaker_ref, stored[0].listener_ref,
                      stored[0].text, stored[0].turn );
        CHECK( exported[0].kind == "said" );
    }
    CHECK( exported_found );
}

TEST_CASE( "Novgorod NPC sees only visible contents of furniture containers", "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    map &here = get_map();
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.i_clear( p );
    }
    const character_id guy_id = make_npc( 60, 62 );
    npc &guy = npc_by_id( guy_id );
    clear_character( guy, true );
    guy.setpos( here, tripoint_bub_ms( 60, 62, 0 ) );
    const tripoint_bub_ms distant_oven( 62, 62, 0 );
    const tripoint_bub_ms sealed_crate( 60, 63, 0 );
    const tripoint_bub_ms adjacent_oven( 59, 62, 0 );
    REQUIRE( here.furn_set( distant_oven, furn_str_id( "f_clay_oven" ) ) );
    REQUIRE( here.furn_set( sealed_crate, furn_str_id( "f_crate_c" ) ) );
    REQUIRE( here.furn_set( adjacent_oven, furn_str_id( "f_clay_oven" ) ) );
    const std::string firewood_ref = uid_ref( here.add_item( distant_oven,
                                     item( itype_id( "firewood" ) ) ) );
    const std::string stick_ref = uid_ref( here.add_item( sealed_crate,
                                  item( itype_id( "stick" ) ) ) );
    const std::string rock_ref = uid_ref( here.add_item( adjacent_oven,
                                 item( itype_id( "rock" ) ) ) );
    REQUIRE( here.has_items( distant_oven ) );
    REQUIRE( here.has_items( sealed_crate ) );
    REQUIRE( here.has_items( adjacent_oven ) );
    refresh_visibility();
    REQUIRE( guy.sees( here, distant_oven ) );
    REQUIRE( guy.sees( here, sealed_crate ) );
    REQUIRE( guy.sees( here, adjacent_oven ) );
    REQUIRE_FALSE( here.sees_some_items( distant_oven, guy ) );
    REQUIRE_FALSE( here.sees_some_items( sealed_crate, guy ) );
    REQUIRE( here.sees_some_items( adjacent_oven, guy ) );

    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = parse_object( stream.str() );
    bool found = false;
    bool firewood_seen = false;
    bool stick_seen = false;
    bool rock_seen = false;
    for( const JsonObject projection : observation.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) != id_text( guy ) ) {
            continue;
        }
        found = true;
        for( const JsonObject row : projection.get_array( "visible_items" ) ) {
            row.allow_omitted_members();
            const std::string ref = row.get_string( "item_ref" );
            firewood_seen |= ref == firewood_ref;
            stick_seen |= ref == stick_ref;
            if( ref == rock_ref ) {
                rock_seen = true;
                CHECK( row.get_string( "placement" ) == "ground" );
            }
        }
    }
    REQUIRE( found );
    CHECK_FALSE( firewood_seen );
    CHECK_FALSE( stick_seen );
    CHECK( rock_seen );
}

TEST_CASE( "Novgorod NPC sees lit distant items without seeing dark distant items", "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    map &here = get_map();
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.i_clear( p );
    }
    const character_id guy_id = make_npc( 60, 62 );
    npc &guy = npc_by_id( guy_id );
    clear_character( guy, true );
    guy.setpos( here, tripoint_bub_ms( 60, 62, 0 ) );
    const auto previous_turn = calendar::turn;
    calendar::turn = calendar::turn_zero;
    g->reset_light_level();
    const tripoint_bub_ms rock_pos( 72, 62, 0 );
    const tripoint_bub_ms dark_pos( 60, 82, 0 );
    const std::string rock_ref = uid_ref( here.add_item( rock_pos,
                                 item( itype_id( "rock" ) ) ) );
    const std::string dark_ref = uid_ref( here.add_item( dark_pos,
                                 item( itype_id( "stick" ) ) ) );
    REQUIRE( here.add_field( rock_pos + tripoint_rel_ms( 0, 1, 0 ), fd_fire, 1 ) );
    refresh_visibility();
    REQUIRE( rl_dist( guy.pos_bub(), rock_pos ) >
             guy.sight_range( here.ambient_light_at( guy.pos_bub() ) ) );
    REQUIRE( guy.sees( here, rock_pos ) );
    REQUIRE_FALSE( guy.sees( here, dark_pos ) );

    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = parse_object( stream.str() );
    bool found = false;
    bool rock_seen = false;
    bool dark_seen = false;
    for( const JsonObject projection : observation.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) != id_text( guy ) ) {
            continue;
        }
        found = true;
        for( const JsonObject row : projection.get_array( "visible_items" ) ) {
            row.allow_omitted_members();
            const std::string ref = row.get_string( "item_ref" );
            if( ref == rock_ref ) {
                rock_seen = true;
                CHECK( row.get_string( "placement" ) == "ground" );
            }
            dark_seen |= ref == dark_ref;
        }
    }
    REQUIRE( found );
    CHECK( rock_seen );
    CHECK_FALSE( dark_seen );
    calendar::turn = previous_turn;
    g->reset_light_level();
}

TEST_CASE( "Novgorod frame exports native labels of the observed avatar, scene and NPC work",
           "[novgorod_live]" )
{
    const bool wet = GENERATE( true, false );
    CAPTURE( wet );
    reset_p3_fixture();
    clear_npcs();
    avatar &you = get_avatar();
    map &here = get_map();
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.i_clear( p );
    }
    you.male = wet;
    REQUIRE( you.wear_item( item( itype_id( "tshirt" ) ), false ).has_value() );
    you.set_wielded_item( item( itype_id( "rock" ) ) );
    for( const bodypart_id &bp : you.get_all_body_parts() ) {
        you.set_part_wetness( bp, 0 );
    }
    if( wet ) {
        you.set_part_wetness( body_part_torso, 50 );
    }
    you.add_effect( p3_bleed, 10_minutes, body_part_arm_l );
    const item &ground = here.add_item( you.pos_bub() + tripoint_rel_ms( 1, 0, 0 ),
                                        item( itype_id( "stick" ) ) );
    const std::string ground_uid = std::to_string( ground.uid().get_value() );
    const character_id guy_id = make_npc( 60, 62 );
    npc &guy = npc_by_id( guy_id );
    guy.myclass = npc_class_id( "NC_NONE" );
    const character_id idle_id = make_npc( 62, 61 );
    npc &idle = npc_by_id( idle_id );
    idle.myclass = npc_class_id( "NC_DOCTOR" );
    refresh_visibility();
    REQUIRE( guy.sees( here, static_cast<const Creature &>( you ) ) );
    REQUIRE( you.sees( here, static_cast<const Creature &>( idle ) ) );

    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = parse_object( stream.str() );
    observation.allow_omitted_members();

    const JsonObject environment = observation.get_object( "environment" );
    CHECK( environment.get_int( "hour" ) == hour_of_day<int>( calendar::turn ) );
    CHECK( environment.get_bool( "is_night" ) == is_night( calendar::turn ) );
    CHECK( environment.get_string( "time_label" ) == display::time_approx() );
    CHECK( environment.get_string( "light_label" ) == get_light_level( std::max( 1.0,
            LIGHT_AMBIENT_LIT - here.ambient_light_at( you.pos_bub() ) + 1.0 ) ).first );
    CHECK( environment.get_string( "weather_label" )
           == get_weather().weather_id->name.translated() );
    CHECK_FALSE( environment.has_member( "light_level" ) );

    bool wielded_row = false;
    bool ground_row = false;
    for( const JsonObject row : observation.get_array( "items" ) ) {
        row.allow_omitted_members();
        if( row.get_string( "item_uid" ) == std::to_string(
                you.get_wielded_item()->uid().get_value() ) ) {
            wielded_row = true;
            CHECK( row.get_string( "label" ) == you.get_wielded_item()->type_name() );
        } else if( row.get_string( "item_uid" ) == ground_uid ) {
            ground_row = true;
            CHECK( row.get_string( "label" ) == ground.type_name() );
        }
    }
    CHECK( wielded_row );
    CHECK( ground_row );

    bool guy_found = false;
    bool idle_found = false;
    for( const JsonObject projection : observation.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) == id_text( idle ) ) {
            idle_found = true;
            CHECK( projection.get_string( "job_description" ) == idle.myclass->get_job_description() );
            CHECK( projection.get_string( "job_description" ) != guy.myclass->get_job_description() );
            continue;
        }
        if( projection.get_string( "actor_id" ) != id_text( guy ) ) {
            continue;
        }
        guy_found = true;
        CHECK( projection.get_string( "job_description" ) == guy.myclass->get_job_description() );
        CHECK_FALSE( projection.get_string( "job_description" ).empty() );
        bool avatar_seen = false;
        for( const JsonObject actor : projection.get_array( "visible_actors" ) ) {
            actor.allow_omitted_members();
            if( actor.get_string( "actor_id" ) != std::to_string( you.getID().get_value() ) ) {
                continue;
            }
            avatar_seen = true;
            const JsonObject look = actor.get_object( "appearance" );
            std::vector<std::string> worn;
            for( const JsonObject worn_row : look.get_array( "worn_items" ) ) {
                worn_row.allow_omitted_members();
                worn.push_back( worn_row.get_string( "label" ) );
            }
            std::vector<std::string> visible;
            bool tshirt_shown = false;
            for( const item_location &worn_item : you.get_visible_worn_items() ) {
                visible.push_back( worn_item->type_name() );
                tshirt_shown = tshirt_shown || worn_item->typeId() == itype_id( "tshirt" );
            }
            CHECK( worn == visible );
            CHECK( tshirt_shown );
            const JsonObject held = look.get_object( "wielded_item" );
            CHECK( held.get_string( "label" ) == you.get_wielded_item()->type_name() );
            CHECK( held.get_string( "item_uid" ) == std::to_string(
                       you.get_wielded_item()->uid().get_value() ) );
            CHECK( look.get_bool( "wet" ) == wet );
            CHECK( look.get_string( "sex_label" ) == ( wet ? _( "Male" ) : _( "Female" ) ) );
            JsonArray wounds = look.get_array( "visible_wounds" );
            REQUIRE( wounds.size() == 1 );
            const JsonObject wound = wounds.next_object();
            CHECK( wound.get_string( "body_part_id" ) == "arm_l" );
            CHECK( wound.get_string( "label" )
                   == you.get_effect( p3_bleed, body_part_arm_l ).disp_name() );
        }
        CHECK( avatar_seen );
    }
    CHECK( guy_found );
    CHECK( idle_found );
}

TEST_CASE( "Novgorod whispered avatar speech is heard only as far as native sound reaches",
           "[novgorod_live]" )
{
    reset_p3_fixture();
    clear_npcs();
    const character_id near_id = make_npc( 59, 61 );
    const character_id far_id = make_npc( 125, 60 );
    refresh_visibility();
    const int loudness = GENERATE( 1, 2 );
    CAPTURE( loudness );
    const std::string near_text = id_text( npc_by_id( near_id ) );
    const auto result = run_instant_avatar_speech( "тихо", "[\"npc:" + near_text + "\"]", loudness );
    REQUIRE( result.applied );
    const std::vector<std::string> heard = heard_ids( result.json );
    CHECK_FALSE( contains( heard, id_text( npc_by_id( far_id ) ) ) );
    if( loudness == 1 ) {
        CHECK( heard.empty() );
    } else {
        CHECK( heard == std::vector<std::string>{ near_text } );
    }
}


struct novgorod_input_test_access {
    struct queue_snapshot {
        std::vector<std::string> actions;
        size_t index;
        bool enabled;
    };

    static queue_snapshot clear_queue( game &state ) {
        queue_snapshot previous{ state.test_action_queue, state.test_action_index,
                                 state.test_action_queue_enabled };
        state.test_action_queue.clear();
        state.test_action_index = 0;
        state.test_action_queue_enabled = false;
        return previous;
    }

    static void restore_queue( game &state, const queue_snapshot &previous ) {
        state.test_action_queue = previous.actions;
        state.test_action_index = previous.index;
        state.test_action_queue_enabled = previous.enabled;
    }

    static void read( game &state, std::string &action ) {
        static_cast<void>( state.get_player_input( action ) );
    }
};

TEST_CASE( "Novgorod leaves native input untouched without a pending live operation",
           "[novgorod_input]" )
{
    SECTION( "active native activity" ) {
        const char *id = GENERATE( "ACT_CRAFT", "ACT_READ", "ACT_WAIT", "ACT_TRY_SLEEP" );
        reset_p3_fixture();
        clear_novgorod_test_adjacent_selection();
        REQUIRE( test_mode );
        avatar &you = get_avatar();
        const player_activity prior_activity = you.activity;
        const novgorod_input_test_access::queue_snapshot prior_queue =
            novgorod_input_test_access::clear_queue( *g );
        you.activity = player_activity( activity_id( id ), 100 );
        REQUIRE_FALSE( you.activity.is_null() );
        std::string action;
        std::string result;
        try {
            novgorod_input_test_access::read( *g, action );
            result = "returned " + action;
        } catch( const std::exception &error ) {
            result = error.what();
        }
        you.activity = prior_activity;
        novgorod_input_test_access::restore_queue( *g, prior_queue );
        clear_novgorod_test_adjacent_selection();
        CAPTURE( id, result );
        CHECK( result == "input_manager::get_input_event called in test mode" );
    }

    SECTION( "adjacent selection" ) {
        reset_p3_fixture();
        clear_novgorod_test_adjacent_selection();
        REQUIRE( test_mode );
        std::string result;
        try {
            choose_adjacent( "Select an adjacent cell" );
        } catch( const std::exception &error ) {
            result = error.what();
        }
        clear_novgorod_test_adjacent_selection();
        CAPTURE( result );
        CHECK( result == "input_manager::get_input_event called in test mode" );
    }
}


#ifndef _WIN32
namespace
{
struct saved_input_queue {
    game &state;
    novgorod_input_test_access::queue_snapshot previous;

    explicit saved_input_queue( game &state ) : state( state ),
        previous( novgorod_input_test_access::clear_queue( state ) ) {}

    ~saved_input_queue() {
        novgorod_input_test_access::restore_queue( state, previous );
    }

    void clear() {
        novgorod_input_test_access::clear_queue( state );
    }
};

struct pending_activity_peer {
    std::string path = "/tmp/novgorod-pending-" + std::to_string( getpid() ) + ".sock";
    std::string old_socket;
    std::string old_timeout;
    bool had_socket = std::getenv( "NOVGOROD_P3_SOCKET" ) != nullptr;
    bool had_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" ) != nullptr;
    int listener = -1;
    pid_t child = -1;

    static bool read_line( int fd, std::string &line ) {
        pollfd pending{ fd, POLLIN, 0 };
        if( poll( &pending, 1, 30000 ) <= 0 ) return false;
        line.clear();
        for( size_t size = 0; size < 4 * 1024 * 1024; ++size ) {
            char ch;
            if( recv( fd, &ch, 1, 0 ) != 1 ) return false;
            if( ch == '\n' ) return true;
            line.push_back( ch );
        }
        return false;
    }

    static bool send_all( int fd, const std::string &message ) {
        size_t sent = 0;
        while( sent < message.size() ) {
            const ssize_t n = send( fd, message.data() + sent, message.size() - sent, MSG_NOSIGNAL );
            if( n <= 0 ) return false;
            sent += static_cast<size_t>( n );
        }
        return true;
    }

    explicit pending_activity_peer( const std::string &request ) {
        if( had_socket ) old_socket = std::getenv( "NOVGOROD_P3_SOCKET" );
        if( had_timeout ) old_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" );
        sockaddr_un address{};
        address.sun_family = AF_UNIX;
        std::strcpy( address.sun_path, path.c_str() );
        unlink( path.c_str() );
        listener = socket( AF_UNIX, SOCK_STREAM, 0 );
        REQUIRE( listener >= 0 );
        REQUIRE( bind( listener, reinterpret_cast<sockaddr *>( &address ), sizeof( address ) ) == 0 );
        REQUIRE( listen( listener, 1 ) == 0 );
        setenv( "NOVGOROD_P3_SOCKET", path.c_str(), 1 );
        setenv( "NOVGOROD_P3_TIMEOUT_MS", "120000", 1 );
        child = fork();
        REQUIRE( child >= 0 );
        if( child != 0 ) return;

        pollfd pending{ listener, POLLIN, 0 };
        if( poll( &pending, 1, 30000 ) <= 0 ) _exit( 2 );
        const int peer = accept( listener, nullptr, nullptr );
        if( peer < 0 ) _exit( 3 );
        close( listener );
        std::string line;
        if( !read_line( peer, line ) ) _exit( 4 );
        std::string id;
        try {
            const JsonObject frame = json_loader::from_string( line ).get_object();
            frame.allow_omitted_members();
            id = frame.get_string( "id" );
            if( frame.get_string( "type" ) != "intent" || frame.get_string( "intent" ) != "literal intent" ||
                id.empty() || !frame.has_member( "observation" ) ) _exit( 4 );
        } catch( const std::exception & ) {
            _exit( 4 );
        }

        const std::string operation = "{\"type\":\"operation\",\"id\":\"" + id +
                                      "\",\"request\":" + request + "}\n";
        if( !send_all( peer, operation ) ) _exit( 5 );
        if( !read_line( peer, line ) ) _exit( 6 );
        try {
            const JsonObject frame = json_loader::from_string( line ).get_object();
            frame.allow_omitted_members();
            if( frame.get_string( "type" ) != "readback" || frame.get_string( "id" ) != id ) _exit( 7 );
            const JsonObject readback = frame.get_object( "readback" );
            readback.allow_omitted_members();
            if( readback.get_string( "status" ) != "applied" ||
                readback.get_string( "operation_id" ) != "focused-live" ) _exit( 7 );
        } catch( const std::exception & ) {
            _exit( 7 );
        }
        const std::string result = "{\"type\":\"result\",\"id\":\"" + id + "\"}\n";
        if( !send_all( peer, result ) ) _exit( 8 );
        shutdown( peer, SHUT_WR );
        close( peer );
        _exit( 0 );
    }

    ~pending_activity_peer() {
        if( child > 0 ) {
            kill( child, SIGKILL );
            waitpid( child, nullptr, 0 );
        }
        if( listener >= 0 ) close( listener );
        unlink( path.c_str() );
        if( had_socket ) setenv( "NOVGOROD_P3_SOCKET", old_socket.c_str(), 1 );
        else unsetenv( "NOVGOROD_P3_SOCKET" );
        if( had_timeout ) setenv( "NOVGOROD_P3_TIMEOUT_MS", old_timeout.c_str(), 1 );
        else unsetenv( "NOVGOROD_P3_TIMEOUT_MS" );
    }

    void completed() {
        int status = 0;
        REQUIRE( waitpid( child, &status, 0 ) == child );
        child = -1;
        REQUIRE( WIFEXITED( status ) );
        CHECK( WEXITSTATUS( status ) == 0 );
    }
};
}

TEST_CASE( "Novgorod pending live activity alone bypasses native input", "[novgorod_input]" )
{
    SECTION( "wait and brief speech" ) {
        const char *primitive = GENERATE( "wait", "speak" );
        reset_p3_fixture();
        avatar &you = get_avatar();
        REQUIRE( you.activity.is_null() );
        saved_input_queue queue( *g );
        clear_novgorod_test_adjacent_selection();
        const std::string actor = std::to_string( you.getID().get_value() );
        const std::string request = live_request( primitive, actor,
                                    std::string( primitive ) == "speak" ? "Exact spoken words" : "" );
        pending_activity_peer peer( request );
        REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
        REQUIRE( novgorod_semantic::has_pending_live_activity() );
        REQUIRE_FALSE( you.activity.is_null() );
        REQUIRE_FALSE( g->has_novgorod_actions() );

        std::string action;
        REQUIRE_NOTHROW( novgorod_input_test_access::read( *g, action ) );
        CHECK( action == action_ident( ACTION_NULL ) );

        for( int turn = 0; turn < 20 && !you.activity.is_null(); ++turn ) {
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
            g->do_turn();
        }
        REQUIRE( you.activity.is_null() );
        queue.clear();
        std::string result;
        try {
            g->do_turn();
        } catch( const std::exception &error ) {
            result = error.what();
        }
        CAPTURE( primitive, result );
        CHECK( result == "input_manager::get_input_event called in test mode" );
        peer.completed();
        CHECK_FALSE( novgorod_semantic::has_pending_live_activity() );
        CHECK( you.activity.is_null() );
    }

    SECTION( "cleared avatar activity" ) {
        reset_p3_fixture();
        avatar &you = get_avatar();
        REQUIRE( you.activity.is_null() );
        saved_input_queue queue( *g );
        clear_novgorod_test_adjacent_selection();
        const std::string actor = std::to_string( you.getID().get_value() );
        pending_activity_peer peer( live_request( "wait", actor ) );
        REQUIRE_NOTHROW( novgorod_semantic::submit_live_intent( "literal intent" ) );
        REQUIRE( novgorod_semantic::has_pending_live_activity() );
        REQUIRE_FALSE( you.activity.is_null() );
        you.activity.set_to_null();
        CHECK_FALSE( novgorod_semantic::has_pending_live_activity() );

        std::string action;
        std::string result;
        try {
            novgorod_input_test_access::read( *g, action );
            result = "returned " + action;
        } catch( const std::exception &error ) {
            result = error.what();
        }
        CAPTURE( result );
        CHECK( result == "input_manager::get_input_event called in test mode" );
        peer.completed();
        CHECK_FALSE( novgorod_semantic::has_pending_live_activity() );
        CHECK( you.activity.is_null() );
    }
}
#endif
