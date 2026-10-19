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
static int64_t p3_pickup_uid = 0;

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
    const item_location backpack = you.i_add( item( itype_id( "backpack" ) ) );
    if( !you.wear( backpack, false ).has_value() ) {
        throw std::runtime_error( "NOVGOROD_TEST_BACKPACK_SETUP_FAILED" );
    }
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
    you.i_add( flashlight );
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

void write_npc_physical_projections( JsonOut &out, const avatar &observer, map &here )
{
    out.member( "npc_projections" );
    out.start_array();
    for( const npc &guy : g->all_npcs() ) {
        if( !observer.sees( here, guy.pos_bub() ) ) {
            continue;
        }
        out.start_object();
        out.member( "actor_id", std::to_string( guy.getID().get_value() ) );
        out.member( "position", position_of( guy.pos_bub() ) );
        out.member( "native_turn", to_turn<int>( calendar::turn ) );
        out.member( "activity_id", guy.activity.id().str() );
        out.member( "activity_moves_left", guy.activity.moves_left );
        out.member( "assignment_id", guy.novgorod_semantic_assignment_id() );
        out.member( "assignment_status", guy.novgorod_semantic_status() );
        out.member( "progress", guy.novgorod_semantic_progress() );
        out.member( "interrupt_cause", guy.novgorod_semantic_interrupt_cause() );
        out.member( "visible_actors" );
        out.start_array();
        if( guy.sees( here, static_cast<const Creature &>( observer ) ) ) {
            out.start_object();
            out.member( "actor_id", std::to_string( observer.getID().get_value() ) );
            out.member( "position", position_of( observer.pos_bub() ) );
            out.end_object();
        }
        for( const npc &other : g->all_npcs() ) {
            if( other.getID() == guy.getID() || !guy.sees( here, static_cast<const Creature &>( other ) ) ) {
                continue;
            }
            out.start_object();
            out.member( "actor_id", std::to_string( other.getID().get_value() ) );
            out.member( "position", position_of( other.pos_bub() ) );
            out.end_object();
        }
        out.end_array();
        out.member( "visible_items" );
        out.start_array();
        for( const tripoint_bub_ms &pos : here.points_in_radius( guy.pos_bub(), 1 ) ) {
            if( !guy.sees( here, pos ) ) {
                continue;
            }
            for( const item &it : here.i_at( pos ) ) {
                out.start_object();
                out.member( "item_ref", "item:" + std::to_string( it.uid().get_value() ) );
                out.member( "item_uid", std::to_string( it.uid().get_value() ) );
                out.member( "type", it.typeId().str() );
                out.member( "position", position_of( pos ) );
                out.end_object();
            }
        }
        out.end_array();
        out.member( "visible_targets" );
        out.start_array();
        for( const tripoint_bub_ms &pos : here.points_in_radius( guy.pos_bub(), 1 ) ) {
            if( !guy.sees( here, pos ) ) {
                continue;
            }
            out.start_object();
            out.member( "target_ref", p3_target_ref( pos ) );
            out.member( "position", position_of( pos ) );
            out.member( "terrain", here.ter( pos ).id().str() );
            out.member( "openable", here.open_door( guy, pos, !here.is_outside( pos ), true ) );
            out.end_object();
        }
        out.end_array();
        out.end_object();
    }
    out.end_array();
}

void write_current_snapshot( JsonOut &out );

void write_p3_observation()
{
    avatar &you = get_avatar();
    map &here = get_map();
    here.update_visibility_cache( you.posz() );
    write_to_file( p3_observation_path(), [&]( std::ostream &stream ) {
        JsonOut out( stream );
        out.start_object();
        out.member( "schema", "p3_native_observation_v1" );
        out.member( "turn", to_turn<int>( calendar::turn ) );
        out.member( "revision", to_turn<int>( calendar::turn ) );
        out.member( "actors" );
        out.start_array();
        out.start_object();
        out.member( "actor_ref", "avatar" );
        out.member( "visible", true );
        out.member( "actor_id", std::to_string( you.getID().get_value() ) );
        out.member( "position", position_of( you.pos_bub() ) );
        out.end_object();
        for( const npc &guy : g->all_npcs() ) {
            if( !you.sees( here, guy.pos_bub() ) ) {
                continue;
            }
            out.start_object();
            out.member( "actor_ref", "npc:" + std::to_string( guy.getID().get_value() ) );
            out.member( "visible", true );
            out.member( "actor_id", std::to_string( guy.getID().get_value() ) );
            out.member( "position", position_of( guy.pos_bub() ) );
            out.end_object();
        }
        out.end_array();
        write_npc_physical_projections( out, you, here );
        out.member( "items" );
        out.start_array();
        for( const item *it : you.items_with( []( const item & ) { return true; } ) ) {
            out.start_object();
            out.member( "item_ref", "item:" + std::to_string( it->uid().get_value() ) );
            out.member( "item_uid", std::to_string( it->uid().get_value() ) );
            out.member( "type", it->typeId().str() );
            out.member( "use_methods" );
            out.start_array();
            for( const auto &method : it->type->use_methods ) {
                out.write( method.first );
            }
            out.end_array();
            out.member( "holder", std::to_string( you.getID().get_value() ) );
            out.end_object();
        }
        for( const tripoint_bub_ms &p : here.points_in_radius( you.pos_bub(), 1 ) ) {
            if( !you.sees( here, p ) ) {
                continue;
            }
            for( const item &it : here.i_at( p ) ) {
                out.start_object();
                out.member( "item_ref", "item:" + std::to_string( it.uid().get_value() ) );
                out.member( "item_uid", std::to_string( it.uid().get_value() ) );
                out.member( "type", it.typeId().str() );
                out.member( "use_methods" );
                out.start_array();
                for( const auto &method : it.type->use_methods ) {
                    out.write( method.first );
                }
                out.end_array();
                out.member( "position", position_of( p ) );
                out.end_object();
            }
        }
        out.end_array();
        out.member( "targets" );
        out.start_array();
        for( const tripoint_bub_ms &p : here.points_in_radius( you.pos_bub(), 1 ) ) {
            if( p == you.pos_bub() || !you.sees( here, p ) ) {
                continue;
            }
            out.start_object();
            out.member( "target_ref", p3_target_ref( p ) );
            out.member( "position", position_of( p ) );
            out.member( "terrain", here.ter( p ).id().str() );
            out.member( "openable", here.open_door( you, p, !here.is_outside( p ), true ) );
            out.end_object();
        }
        out.end_array();
        out.member( "native_snapshot" );
        write_current_snapshot( out );
        out.end_object();
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

void write_p3_readback( const std::string &operation_id, const std::string &status,
                        const std::string &reason, const native_snapshot &before,
                        const std::string &primitive, const std::string &actor_id,
                        const std::string &utterance, const std::string &native_sound,
                        const std::vector<std::pair<std::string, bool>> &listeners,
                        const std::string &terrain_before, const std::string &terrain_after,
                        const std::string &furniture_before, const std::string &furniture_after )
{
    write_to_file( p3_readback_path(), [&]( std::ostream &stream ) {
        const native_snapshot after = take_snapshot();
        const bool native_effect_changed = before.world_signature != after.world_signature;
        if( primitive == "pickup" && status == "applied" && p3_pickup_uid > 0 ) {
            const bool selected_uid_in_inventory = std::any_of( after.inventory.begin(), after.inventory.end(),
            [&]( const item_fact &fact ) { return fact.uid == p3_pickup_uid; } );
            if( !selected_uid_in_inventory ) {
                write_to_file( PATH_INFO::user_dir() + "p3-pickup-diagnostic.json", [&]( std::ostream &diagnostic ) {
                    JsonOut diag( diagnostic );
                    diag.start_object();
                    diag.member( "selected_uid", p3_pickup_uid );
                    diag.member( "avatar_inventory" );
                    diag.start_array();
                    for( const item *it : get_avatar().items_with( []( const item & ) { return true; } ) ) {
                        diag.start_object(); diag.member( "uid", it->uid().get_value() );
                        diag.member( "type", it->typeId().str() ); diag.end_object();
                    }
                    diag.end_array();
                    diag.member( "ground" ); diag.start_array();
                    for( const tripoint_bub_ms &p : get_map().points_in_radius( get_avatar().pos_bub(), 4 ) ) {
                        for( const item &it : get_map().i_at( p ) ) {
                            diag.start_object(); diag.member( "uid", it.uid().get_value() );
                            diag.member( "type", it.typeId().str() ); diag.member( "position", position_of( p ) ); diag.end_object();
                        }
                    }
                    diag.end_array();
                    diag.member( "npc_inventory" ); diag.start_array();
                    for( const npc &guy : g->all_npcs() ) {
                        for( const item *it : guy.items_with( []( const item & ) { return true; } ) ) {
                            diag.start_object(); diag.member( "npc_id", guy.getID().get_value() );
                            diag.member( "npc_position", position_of( guy.pos_bub() ) );
                            diag.member( "uid", it->uid().get_value() ); diag.member( "type", it->typeId().str() ); diag.end_object();
                        }
                    }
                    diag.end_array(); diag.end_object();
                } );
            }
            REQUIRE( std::any_of( after.inventory.begin(), after.inventory.end(), [&]( const item_fact &fact ) {
                return fact.uid == p3_pickup_uid;
            } ) );
            REQUIRE( std::all_of( before.ground.begin(), before.ground.end(), [&]( const item_fact &fact ) {
                return fact.uid == p3_pickup_uid || std::any_of( after.ground.begin(), after.ground.end(),
                [&]( const item_fact &remaining ) { return remaining.uid == fact.uid; } );
            } ) );
            REQUIRE( std::none_of( after.ground.begin(), after.ground.end(), [&]( const item_fact &fact ) {
                return fact.uid == p3_pickup_uid;
            } ) );
            p3_pickup_uid = 0;
        }
        const bool activity_progressing = after.activity != "ACT_NULL" && after.activity_moves_left > 0;
        std::string goal_result = "not_achieved";
        std::string effect_status = "none";
        if( status != "applied" ) {
            goal_result = "refused";
            effect_status = "refused";
        } else if( primitive == "npc_move" ) {
            const auto subject = std::find_if( after.npcs.begin(), after.npcs.end(), [&]( const auto &fact ) {
                return std::get<0>( fact ) == actor_id && !std::get<2>( fact ).empty();
            } );
            if( subject != after.npcs.end() && std::get<3>( *subject ) == "completed" ) {
                goal_result = "achieved";
                effect_status = "confirmed";
            } else if( subject != after.npcs.end() ) {
                goal_result = "in_progress";
                effect_status = "progressing";
            }
        } else if( primitive == "speak" && native_sound.find( utterance ) != std::string::npos ) {
            if( activity_progressing ) {
                goal_result = "in_progress";
                effect_status = "progressing";
            } else {
                goal_result = "achieved";
                effect_status = "confirmed";
            }
        } else if( primitive == "wait" ) {
            if( activity_progressing ) {
                goal_result = "in_progress";
                effect_status = "progressing";
            } else if( calendar::turn > before.native_time ) {
                goal_result = "achieved";
                effect_status = "confirmed";
            }
        } else if( primitive == "use_item" && activity_progressing && after.activity != before.activity ) {
            goal_result = "in_progress";
            effect_status = "progressing";
        } else if( native_effect_changed ) {
            goal_result = "achieved";
            effect_status = "confirmed";
        } else if( activity_progressing && after.activity != before.activity ) {
            goal_result = "in_progress";
            effect_status = "progressing";
        }
        if( primitive == "pickup" || primitive == "use_item" ) {
            REQUIRE( ( goal_result != "achieved" || native_effect_changed ) );
            REQUIRE( ( effect_status != "confirmed" || native_effect_changed ) );
        }
        JsonOut out( stream );
        out.start_object();
        out.member( "schema", "p3_native_operation_readback_v1" );
        out.member( "operation_id", operation_id );
        out.member( "status", status );
        out.member( "goal_result", goal_result );
        out.member( "before" );
        write_snapshot( out, before );
        out.member( "after" );
        write_snapshot( out, after );
        write_npc_physical_projections( out, get_avatar(), get_map() );
        out.member( "native_effect" );
        out.start_object();
        out.member( "primitive", primitive );
        out.member( "actor_id", actor_id );
        out.member( "effect_status", effect_status );
        out.member( "world_changed", native_effect_changed );
        const int elapsed_seconds = to_seconds<int>( after.native_time - before.native_time );
        REQUIRE( ( status != "applied" || primitive != "speak" || elapsed_seconds == 3 ) );
        out.member( "elapsed_seconds", elapsed_seconds );
        out.member( "elapsed_turns", after.turn - before.turn );
        out.member( "elapsedSeconds", elapsed_seconds );
        if( !utterance.empty() ) {
            out.member( "speakerId", actor_id );
            out.member( "actualHeardListenerIds" );
            out.start_array();
            for( const auto &listener : listeners ) {
                if( listener.second ) {
                    out.write( listener.first );
                }
            }
            out.end_array();
        }
        out.member( "activity_before", before.activity );
        out.member( "activity_after", after.activity );
        out.member( "activity_moves_left_before", before.activity_moves_left );
        out.member( "activity_moves_left_after", after.activity_moves_left );
        if( primitive == "open" || primitive == "move" ) {
            out.member( "terrain_before", terrain_before );
            out.member( "terrain_after", terrain_after );
            out.member( "furniture_before", furniture_before );
            out.member( "furniture_after", furniture_after );
        }
        if( !utterance.empty() ) {
            out.member( "speaker_actor_id", actor_id );
            out.member( "utterance", utterance );
            out.member( "native_sound", native_sound );
            out.member( "listeners" );
            out.start_array();
            for( const auto &listener : listeners ) {
                out.start_object();
                out.member( "actor_id", listener.first );
                out.member( "heard", listener.second );
                out.end_object();
            }
            out.end_array();
        }
        out.end_object();
        if( !reason.empty() ) {
            out.member( "refusal" );
            out.start_object();
            out.member( "code", reason );
            out.end_object();
        }
        out.end_object();
    } );
}

std::string move_action( const int x, const int y )
{
    if( x == 1 && y == 0 ) return action_ident( ACTION_MOVE_RIGHT );
    if( x == -1 && y == 0 ) return action_ident( ACTION_MOVE_LEFT );
    if( x == 0 && y == -1 ) return action_ident( ACTION_MOVE_FORTH );
    if( x == 0 && y == 1 ) return action_ident( ACTION_MOVE_BACK );
    if( x == 1 && y == -1 ) return action_ident( ACTION_MOVE_FORTH_RIGHT );
    if( x == -1 && y == -1 ) return action_ident( ACTION_MOVE_FORTH_LEFT );
    if( x == 1 && y == 1 ) return action_ident( ACTION_MOVE_BACK_RIGHT );
    if( x == -1 && y == 1 ) return action_ident( ACTION_MOVE_BACK_LEFT );
    throw std::runtime_error( "NOVGOROD_INVALID_MOVE_DIRECTION" );
}

std::vector<int> request_direction( const TextJsonObject &args )
{
    return args.has_member( "direction" ) ? args.get_int_array( "direction" ) :
           args.get_int_array( "target_direction" );
}

npc &visible_npc_by_id( const std::string &actor_id )
{
    avatar &you = get_avatar();
    map &here = get_map();
    here.update_visibility_cache( you.posz() );
    for( npc &guy : g->all_npcs() ) {
        if( std::to_string( guy.getID().get_value() ) == actor_id && you.sees( here, guy.pos_bub() ) ) {
            return guy;
        }
    }
    throw std::runtime_error( "NOVGOROD_STALE_OR_INVISIBLE_NPC_ACTOR" );
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
    if( mode != "apply" ) {
        reset_p3_fixture();
    }
    std::ifstream request_stream( p3_request_path() );
    REQUIRE( request_stream.good() );
    TextJsonIn input( request_stream, p3_request_path() );
    TextJsonObject request = input.get_object();
    request.allow_omitted_members();
    REQUIRE( request.get_string( "schema" ) == "p3_native_operation_request_v1" );
    const std::string operation_id = request.get_string( "operation_id" );
    REQUIRE_FALSE( operation_id.empty() );
    const std::string actor_id = request.get_string( "actor_id" );
    const std::string avatar_id = std::to_string( get_avatar().getID().get_value() );
    TextJsonObject expected = request.get_object( "expected_native_observation" );
    expected.allow_omitted_members();
    TextJsonObject args = request.get_object( "args" );
    args.allow_omitted_members();
    const std::string primitive = request.get_string( "primitive" );
    avatar &you = get_avatar();
    const native_snapshot before = take_snapshot();
    std::string status = "applied";
    std::string refusal;
    std::string utterance;
    std::string native_sound;
    std::string terrain_before;
    std::string terrain_after;
    std::string furniture_before;
    std::string furniture_after;
    tripoint_bub_ms effect_target;
    std::vector<std::pair<std::string, bool>> listeners;
    bool deaf_fixture_seen = false;
    bool deaf_fixture_heard = false;

    try {
        if( expected.get_string( "actor_id" ) != actor_id ) {
            throw std::runtime_error( "NOVGOROD_STALE_ACTOR_ID" );
        }
        const TextJsonValue revision = expected.has_member( "turn" ) ?
                                       expected.get_member( "turn" ) : expected.get_member( "revision" );
        const int expected_turn = revision.test_int() ? revision.get_int() :
                                  std::stoi( revision.get_string() );
        if( expected_turn != to_turn<int>( calendar::turn ) ) {
            throw std::runtime_error( "NOVGOROD_STALE_NATIVE_OBSERVATION" );
        }
        if( primitive == "move" ) {
            if( actor_id != avatar_id ) throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
            const std::vector<int> direction = request_direction( args );
            if( direction.size() != 2 ) throw std::runtime_error( "NOVGOROD_MOVE_DIRECTION_REQUIRED" );
            effect_target = you.pos_bub() + tripoint_rel_ms( direction[0], direction[1], 0 );
            terrain_before = get_map().ter( effect_target ).id().str();
            furniture_before = get_map().furn( effect_target ).id().str();
            g->set_test_action_queue( { move_action( direction[0], direction[1] ),
                                        action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "open" ) {
            if( actor_id != avatar_id ) throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
            const std::vector<int> direction = request_direction( args );
            if( direction.size() != 2 ) throw std::runtime_error( "NOVGOROD_TARGET_DIRECTION_REQUIRED" );
            tripoint_bub_ms target = you.pos_bub() + tripoint_rel_ms( direction[0], direction[1], 0 );
            if( !you.sees( get_map(), target ) ) throw std::runtime_error( "NOVGOROD_TARGET_NOT_OBSERVED" );
            TextJsonObject references = request.get_object( "references" );
            references.allow_omitted_members();
            TextJsonObject target_ref = references.get_object( "targets" );
            target_ref.allow_omitted_members();
            if( target_ref.get_string( "id" ) != p3_target_ref( target ) ) {
                throw std::runtime_error( "NOVGOROD_TARGET_REFERENCE_MISMATCH" );
            }
            if( !get_map().open_door( you, target, !get_map().is_outside( target ), true ) ) {
                throw std::runtime_error( "NOVGOROD_TARGET_NOT_OPENABLE" );
            }
            terrain_before = get_map().ter( target ).id().str();
            furniture_before = get_map().furn( target ).id().str();
            effect_target = target;
            set_novgorod_test_adjacent_selection( get_avatar().getID().get_value(), you.pos_bub(),
                    tripoint_rel_ms( direction[0], direction[1], 0 ) );
            g->set_test_action_queue( { action_ident( ACTION_OPEN ), action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "pickup" ) {
            if( actor_id != avatar_id ) throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
            TextJsonObject references = request.get_object( "references" );
            TextJsonObject item_ref = references.get_object( "items" );
            const int64_t uid = std::stoll( item_ref.get_string( "id" ) );
            p3_pickup_uid = uid;
            g->set_test_pickup_uid( uid );
            g->set_test_action_queue( { action_ident( ACTION_PICKUP ),
                                        action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "use_item" ) {
            if( actor_id != avatar_id ) throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
            TextJsonObject references = request.get_object( "references" );
            references.allow_omitted_members();
            TextJsonObject item_ref = references.get_object( "items" );
            item_ref.allow_omitted_members();
            const int64_t uid = std::stoll( item_ref.get_string( "id" ) );
            bool observed_inventory_item = false;
            for( const item *candidate : you.items_with( []( const item & ) { return true; } ) ) {
                observed_inventory_item = observed_inventory_item || candidate->uid().get_value() == uid;
            }
            if( !observed_inventory_item ) throw std::runtime_error( "NOVGOROD_ITEM_NOT_OBSERVED_IN_INVENTORY" );
            g->set_test_item_use( uid, args.get_string( "method" ) );
            if( args.has_member( "target_direction" ) ) {
                const std::vector<int> direction = args.get_int_array( "target_direction" );
                if( direction.size() != 2 ) throw std::runtime_error( "NOVGOROD_TARGET_DIRECTION_REQUIRED" );
                const tripoint_bub_ms target = you.pos_bub() + tripoint_rel_ms( direction[0], direction[1], 0 );
                if( !you.sees( get_map(), target ) ) throw std::runtime_error( "NOVGOROD_TARGET_NOT_OBSERVED" );
                TextJsonObject target_ref = references.get_object( "targets" );
                target_ref.allow_omitted_members();
                if( target_ref.get_string( "id" ) != p3_target_ref( target ) ) {
                    throw std::runtime_error( "NOVGOROD_TARGET_REFERENCE_MISMATCH" );
                }
                set_novgorod_test_adjacent_selection( get_avatar().getID().get_value(), you.pos_bub(),
                        tripoint_rel_ms( direction[0], direction[1], 0 ) );
            }
            g->set_test_action_queue( { action_ident( ACTION_USE ), action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "npc_move" ) {
            npc &subject = visible_npc_by_id( actor_id );
            const std::vector<int> direction = request_direction( args );
            if( direction.size() != 2 ) throw std::runtime_error( "NOVGOROD_NPC_DIRECTION_REQUIRED" );
            const tripoint_bub_ms target = subject.pos_bub() + tripoint_rel_ms( direction[0], direction[1], 0 );
            if( !you.sees( get_map(), target ) ) throw std::runtime_error( "NOVGOROD_NPC_TARGET_NOT_OBSERVED" );
            const std::string assignment_id = args.get_string( "assignment_id" );
            const std::string intent = args.get_string( "intent" );
            subject.set_novgorod_semantic_intent( assignment_id, intent, get_map().get_abs( target ) );
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "speak" ) {
            utterance = args.has_member( "utterance" ) ? args.get_string( "utterance" ) :
                        args.get_string( "content" );
            if( utterance.empty() ) throw std::runtime_error( "NOVGOROD_UTTERANCE_REQUIRED" );
            Character *speaker = nullptr;
            npc *npc_speaker = nullptr;
            if( actor_id == avatar_id ) {
                speaker = &you;
            } else {
                npc_speaker = &visible_npc_by_id( actor_id );
                speaker = npc_speaker;
            }
            you.assign_activity( wait_activity_actor( 3_seconds ) );
            if( npc_speaker == nullptr ) {
                sounds::sound( you.pos_bub(), 6, sounds::sound_t::speech, utterance, false, "speech" );
            } else {
                npc_speaker->say( utterance );
            }
            const tripoint_bub_ms speaker_position = speaker->pos_bub();
            const std::vector<tripoint_bub_ms> emitted_sound_locations =
                sounds::get_monster_sounds().first;
            if( std::find( emitted_sound_locations.begin(), emitted_sound_locations.end(), speaker_position ) !=
                emitted_sound_locations.end() ) {
                native_sound = utterance;
            }
            sounds::process_sound_markers( speaker );
            sounds::process_sounds();
            for( npc &listener : g->all_npcs() ) {
                if( npc_speaker == nullptr || listener.getID() != npc_speaker->getID() ) {
                    const bool heard = listener.can_hear( speaker_position, npc_speaker == nullptr ? 6 :
                                         npc_speaker->indoor_voice() );
                    if( !heard && !you.sees( get_map(), listener.pos_bub() ) ) {
                        continue;
                    }
                    const std::string listener_id = std::to_string( listener.getID().get_value() );
                    listeners.emplace_back( listener_id, heard );
                    if( listener.is_deaf() ) {
                        deaf_fixture_seen = true;
                        deaf_fixture_heard = heard;
                    }
                }
            }
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
        } else if( primitive == "wait" ) {
            if( actor_id != avatar_id ) throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
            you.assign_activity( wait_activity_actor( 3_seconds ) );
            g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
        } else {
            status = "refused";
            refusal = "NOVGOROD_UNSUPPORTED_NATIVE_PRIMITIVE";
        }
        if( status == "applied" ) {
            if( primitive == "speak" || primitive == "wait" || primitive == "pickup" ) {
                if( primitive == "pickup" ) {
                    g->do_turn();
                }
                for( int turn = 0; turn < 10 && !you.activity.is_null(); ++turn ) {
                    const int previous_moves_left = you.activity.moves_left;
                    const time_point previous_turn = calendar::turn;
                    g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
                    g->do_turn();
                    if( you.activity.is_null() || you.activity.moves_left <= 0 ||
                        ( calendar::turn == previous_turn && you.activity.moves_left >= previous_moves_left ) ) {
                        break;
                    }
                }
                if( primitive == "pickup" && !you.activity.is_null() ) {
                    status = "refused";
                    refusal = "NOVGOROD_NATIVE_PICKUP_DID_NOT_COMPLETE";
                }
                if( primitive == "speak" || primitive == "wait" ) {
                    for( int turn = 0; turn < 4 && calendar::turn - before.native_time < 3_seconds; ++turn ) {
                        g->set_test_action_queue( { action_ident( ACTION_PAUSE ) } );
                        g->do_turn();
                    }
                }
            } else {
                g->do_turn();
            }
            const native_snapshot after = take_snapshot();
            if( primitive == "move" ) {
                terrain_after = get_map().ter( effect_target ).id().str();
                furniture_after = get_map().furn( effect_target ).id().str();
                if( after.position == before.position && terrain_after == terrain_before &&
                    furniture_after == furniture_before ) {
                    status = "refused";
                    refusal = "NOVGOROD_NATIVE_MOVEMENT_NOT_APPLIED";
                }
            } else if( primitive == "open" ) {
                if( !get_map().passable( effect_target ) ) {
                    status = "refused";
                    refusal = "NOVGOROD_NATIVE_OPEN_NOT_APPLIED";
                }
                terrain_after = get_map().ter( effect_target ).id().str();
                furniture_after = get_map().furn( effect_target ).id().str();
            }
        }
    } catch( const std::exception &err ) {
        status = "refused";
        refusal = err.what();
    }

    if( mode == "apply" ) {
        REQUIRE( g->save() );
    }
    if( primitive == "use_item" && args.has_member( "method" ) &&
        args.get_string( "method" ) == "__novgorod_invalid_method_probe__" ) {
        REQUIRE( status == "refused" );
        REQUIRE( refusal == "NOVGOROD_TEST_ITEM_USE_METHOD_UNKNOWN" );
    }
    if( status == "applied" && primitive == "npc_move" ) {
        npc &subject = visible_npc_by_id( actor_id );
        REQUIRE( ( subject.novgorod_semantic_progress() > 0 ||
                   subject.novgorod_semantic_status() == "interrupted_waiting_for_semantic_decision" ) );
    }
    if( primitive == "npc_move" || primitive == "speak" || primitive == "wait" ) {
        INFO( "Native semantic request status: " << status << ", refusal: " << refusal );
        REQUIRE( status == "applied" );
    }
    if( primitive == "move" && take_snapshot().position == before.position &&
        terrain_after == terrain_before && furniture_after == furniture_before ) {
        REQUIRE( status == "refused" );
        REQUIRE( refusal == "NOVGOROD_NATIVE_MOVEMENT_NOT_APPLIED" );
    }
    if( status == "applied" && primitive == "speak" ) {
        REQUIRE( native_sound.find( utterance ) != std::string::npos );
        REQUIRE( std::any_of( listeners.begin(), listeners.end(), []( const auto &listener ) {
            return listener.second;
        } ) );
        REQUIRE( deaf_fixture_seen );
        REQUIRE_FALSE( deaf_fixture_heard );
        REQUIRE( to_seconds<int>( calendar::turn - before.native_time ) == 3 );
    }
    if( status == "applied" && primitive == "wait" ) {
        const native_snapshot after = take_snapshot();
        REQUIRE( to_seconds<int>( after.native_time - before.native_time ) > 0 );
    }
    write_p3_readback( operation_id, status, refusal, before, primitive, actor_id, utterance, native_sound,
                       listeners, terrain_before, terrain_after, furniture_before, furniture_after );
    CHECK( ( status == "applied" || !refusal.empty() ) );
}

TEST_CASE( "Novgorod RLE preserves distinct item identities", "[novgorod_semantic][json][item]" )
{
    cata::colony<item> original;
    original.insert( item( itype_id( "backpack" ) ) );
    original.insert( item( itype_id( "backpack" ) ) );
    auto first = original.begin();
    first->put_in( item( itype_id( "rock" ) ), pocket_type::CONTAINER );
    auto second = std::next( first );
    second->put_in( item( itype_id( "rock" ) ), pocket_type::CONTAINER );

    std::vector<int64_t> original_uids;
    for( const item &entry : original ) {
        original_uids.push_back( entry.uid().get_value() );
        for( const item *nested : entry.all_items_ptr() ) {
            original_uids.push_back( nested->uid().get_value() );
        }
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
        for( const item *nested : entry.all_items_ptr() ) {
            restored_uids.push_back( nested->uid().get_value() );
        }
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
