#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <optional>
#include <string>
#include <vector>

#include "action.h"
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "cata_scope_helpers.h"
#include "creature.h"
#include "faction.h"
#include "game.h"
#include "item.h"
#include "json.h"
#include "level_cache.h"
#include "lightmap.h"
#include "map.h"
#include "map_helpers.h"
#include "npc.h"
#include "novgorod_capture.h"
#include "novgorod_semantic.h"
#include "options_helpers.h"
#include "path_info.h"
#include "pathfinding.h"
#include "player_helpers.h"
#include "shadowcasting.h"
#include "stomach.h"
#include "type_id.h"
#include "weather.h"
#include "weather_type.h"

namespace
{
static constexpr tripoint_bub_ms npc_talk_center( 60, 60, 0 );
static const ter_str_id npc_talk_floor( "t_floor" );
static const ter_str_id npc_talk_wall( "t_wall_metal" );
static const ter_str_id npc_talk_reinforced_glass_wall( "t_reinforced_glass_shutter_open" );
static const npc_template_id npc_talk_template( "novgorod_dev_master" );
static const weather_type_id npc_talk_sunny( "sunny" );

std::string npc_talk_output_dir()
{
    return ( std::filesystem::path( PATH_INFO::user_dir() ) / "npc-talk" ).string();
}

std::string npc_talk_raw_frame_path( const std::string &case_id )
{
    return ( std::filesystem::path( npc_talk_output_dir() ) / ( case_id + ".json" ) ).string();
}

std::string npc_talk_movement_oracle_path()
{
    return ( std::filesystem::path( npc_talk_output_dir() ) / "movement-oracle.json" ).string();
}

int set_npc_talk_capture_directory( const std::string *path )
{
#if defined( _WIN32 )
    return _putenv_s( "NOVGOROD_CAPTURE_DIR", path ? path->c_str() : "" );
#else
    return path ? setenv( "NOVGOROD_CAPTURE_DIR", path->c_str(), 1 ) :
           unsetenv( "NOVGOROD_CAPTURE_DIR" );
#endif
}

class npc_talk_capture_output
{
    public:
        explicit npc_talk_capture_output( const std::string &case_id )
        {
            if( const char *current = std::getenv( "NOVGOROD_CAPTURE_DIR" ) ) {
                previous_directory = current;
            }
            novgorod_capture::clear_attention();
            novgorod_capture::finish();
            novgorod_capture::visible( {} );
            directory = std::filesystem::path( npc_talk_output_dir() ) / "capture" / case_id;
            std::filesystem::create_directories( directory );
            const std::string path = directory.string();
            REQUIRE( set_npc_talk_capture_directory( &path ) == 0 );
        }

        npc_talk_capture_output( const npc_talk_capture_output & ) = delete;
        npc_talk_capture_output &operator=( const npc_talk_capture_output & ) = delete;

        ~npc_talk_capture_output()
        {
            novgorod_capture::clear_attention();
            novgorod_capture::finish();
            novgorod_capture::visible( {} );
            set_npc_talk_capture_directory( previous_directory ? &*previous_directory : nullptr );
        }

        void start_with_empty_visibility()
        {
            novgorod_capture::visible( {} );
            novgorod_capture::start();
            novgorod_capture::turn( false, R"({"sounds":[]})" );
        }

        const std::filesystem::path &path() const
        {
            return directory;
        }

    private:
        std::optional<std::string> previous_directory;
        std::filesystem::path directory;
};

std::vector<int> npc_talk_position( const tripoint_bub_ms &point )
{
    return { point.x(), point.y(), point.z() };
}

void reset_npc_talk_fixture()
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
    you.setpos( here, npc_talk_center );
    you.set_moves( 1000 );
    for( const tripoint_bub_ms &point : here.points_on_zlevel( 0 ) ) {
        here.ter_set( point, npc_talk_floor );
        here.i_clear( point );
    }
}

npc &spawn_npc_talk_actor( const tripoint_bub_ms &position )
{
    npc &subject = spawn_npc( point_bub_ms( position.x(), position.y() ), npc_talk_template.str() );
    subject.death_eocs.clear();
    subject.set_attitude( NPCATT_NULL );
    subject.assign_activity( wait_activity_actor( 1_hours ) );
    return subject;
}

void refresh_npc_talk_map()
{
    map &here = get_map();
    here.invalidate_map_cache( get_avatar().posz() );
    here.build_map_cache( get_avatar().posz() );
    here.update_visibility_cache( get_avatar().posz() );
}

void write_npc_talk_observation( const std::string &case_id )
{
    std::filesystem::create_directories( npc_talk_output_dir() );
    std::ofstream stream( npc_talk_raw_frame_path( case_id ), std::ios::binary );
    REQUIRE( stream.good() );
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    stream.flush();
    REQUIRE( stream.good() );
}

struct npc_talk_retreat_target
{
    tripoint_bub_ms position;
    bool reachable;
};

struct npc_talk_movement_case
{
    std::string id;
    std::string actor_ref;
    std::string actor_id;
    tripoint_bub_ms actor_position;
    tripoint_bub_ms target_position;
    int target_radius;
    bool reachable;
    std::vector<npc_talk_retreat_target> retreat_targets;
};

bool npc_talk_reachable( const npc &subject, const tripoint_bub_ms &target, int radius )
{
    const pathfinding_target destination = radius == 1 ? pathfinding_target::adjacent( target ) :
                                            pathfinding_target::point( target );
    return !get_map().route( subject, destination ).empty();
}

npc_talk_movement_case make_npc_talk_movement_case( const std::string &id, const npc &subject,
        const avatar &target, int radius )
{
    return { id,
             "npc:" + std::to_string( subject.getID().get_value() ),
             std::to_string( subject.getID().get_value() ),
             subject.pos_bub(),
             target.pos_bub(),
             radius,
             npc_talk_reachable( subject, target.pos_bub(), radius ),
             {} };
}

void write_npc_talk_movement_oracle( const std::vector<npc_talk_movement_case> &cases )
{
    std::filesystem::create_directories( npc_talk_output_dir() );
    std::ofstream stream( npc_talk_movement_oracle_path(), std::ios::binary );
    REQUIRE( stream.good() );
    JsonOut out( stream );
    out.start_object();
    out.member( "schema", "p3_native_npc_movement_oracle_v1" );
    out.member( "cases" );
    out.start_array();
    for( const npc_talk_movement_case &entry : cases ) {
        out.start_object();
        out.member( "id", entry.id );
        out.member( "frame", entry.id + ".json" );
        out.member( "actorRef", entry.actor_ref );
        out.member( "npcActorId", entry.actor_id );
        out.member( "actorPosition", npc_talk_position( entry.actor_position ) );
        out.member( "targetPosition", npc_talk_position( entry.target_position ) );
        out.member( "targetRadius", entry.target_radius );
        out.member( "reachable", entry.reachable );
        out.member( "retreatTargets" );
        out.start_array();
        for( const npc_talk_retreat_target &retreat : entry.retreat_targets ) {
            out.start_object();
            out.member( "targetPosition", npc_talk_position( retreat.position ) );
            out.member( "targetRadius", 0 );
            out.member( "reachable", retreat.reachable );
            out.end_object();
        }
        out.end_array();
        out.end_object();
    }
    out.end_array();
    out.end_object();
    stream.flush();
    REQUIRE( stream.good() );
}

void test_npc_talk_source_light_states()
{
    struct source_record {
        std::string id;
        std::string actor_ref;
        std::string actor_id;
        std::string name;
        std::string template_id;
        int native_turn;
    };
    struct light_record {
        std::string id;
        std::string frame;
        std::string capture;
        std::string actor_id;
        int native_turn;
        int light;
        std::string light_name;
        float ambient_light;
        int visibility;
        bool actor_present_visible;
        bool details_clear;
        std::string shirt_name;
        std::string held_name;
    };

    scoped_weather_override sunny_weather( npc_talk_sunny );
    std::vector<source_record> records;
    auto capture_case = [&]( const std::string &id, npc &subject ) {
        write_npc_talk_observation( id );
        npc_talk_capture_output capture( id );
        capture.start_with_empty_visibility();
        novgorod_capture::visible( { &subject } );
        novgorod_capture::turn( false, R"({"sounds":[]})" );
        records.push_back( { id,
                             "npc:" + std::to_string( subject.getID().get_value() ),
                             std::to_string( subject.getID().get_value() ),
                             subject.get_name(),
                             subject.idz.str(),
                             to_turn<int>( calendar::turn ) } );
    };
    auto count_items = []( map &here, const tripoint_bub_ms &position ) {
        int count = 0;
        for( const item &entry : here.i_at( position ) ) {
            count += entry.count();
        }
        return count;
    };

    reset_npc_talk_fixture();
    map &stack_map = get_map();
    npc &stack_npc = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    const tripoint_bub_ms stack_position = npc_talk_center + tripoint_rel_ms( 0, 1, 0 );
    for( int index = 0; index < 49; ++index ) {
        stack_map.add_item( stack_position, item( itype_id( "log" ) ) );
    }
    refresh_npc_talk_map();
    REQUIRE( stack_npc.sees( stack_map, stack_position ) );
    const int stack_count_before = count_items( stack_map, stack_position );
    REQUIRE( stack_count_before == 49 );
    map_stack logs_before = stack_map.i_at( stack_position );
    REQUIRE_FALSE( logs_before.empty() );
    const map_stack &read_logs = logs_before;
    const map_stack::const_iterator first_log = read_logs.begin();
    REQUIRE( first_log != read_logs.end() );
    const std::string log_type = first_log->typeId().str();
    const std::string log_name = first_log->tname();
    const std::string log_label = first_log->type_name();
    const int stack_turn = to_turn<int>( calendar::turn );
    capture_case( "source-stack-before", stack_npc );
    stack_map.i_rem( stack_position, first_log );
    const int stack_count_after = count_items( stack_map, stack_position );
    REQUIRE( stack_count_after == 48 );
    REQUIRE( to_turn<int>( calendar::turn ) == stack_turn );
    capture_case( "source-stack-after", stack_npc );
    REQUIRE( records[0].actor_id == records[1].actor_id );
    REQUIRE( records[0].name == records[1].name );
    REQUIRE( records[0].template_id == records[1].template_id );
    REQUIRE( records[0].native_turn == records[1].native_turn );

    reset_npc_talk_fixture();
    npc &activity_npc = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    activity_npc.assign_activity( chop_planks_activity_actor( 100, itype_id( "hatchet" ),
                                  itype_id( "log" ) ) );
    activity_npc.set_mission( NPC_MISSION_ACTIVITY );
    refresh_npc_talk_map();
    const std::string activity_id = activity_npc.activity.id().str();
    const std::string activity_verb = activity_npc.get_current_activity();
    REQUIRE_FALSE( activity_id.empty() );
    REQUIRE_FALSE( activity_verb.empty() );
    capture_case( "source-activity", activity_npc );

    reset_npc_talk_fixture();
    avatar &faction_avatar = get_avatar();
    npc &faction_npc = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    const tripoint_bub_ms member_position = npc_talk_center + tripoint_rel_ms( 4, 0, 0 );
    const tripoint_bub_ms member_wall_position = npc_talk_center + tripoint_rel_ms( 3, 0, 0 );
    const ter_str_id membership_wall( "t_wall_metal" );
    get_map().ter_set( member_wall_position, membership_wall );
    const npc_template_id member_template( "NPC_debug" );
    npc &faction_member = spawn_npc( point_bub_ms( member_position.x(), member_position.y() ),
                                     member_template.str() );
    faction_member.death_eocs.clear();
    faction_member.set_attitude( NPCATT_NULL );
    const character_id member_id = faction_member.getID();
    const std::string member_actor_id = std::to_string( member_id.get_value() );
    REQUIRE( faction_member.get_name() != faction_npc.get_name() );
    refresh_npc_talk_map();
    REQUIRE_FALSE( faction_npc.sees( get_map(), static_cast<const Creature &>( faction_member ) ) );
    REQUIRE_FALSE( faction_avatar.sees( get_map(), static_cast<const Creature &>( faction_member ) ) );
    const faction_id membership_faction_id = faction_npc.get_fac_id();
    REQUIRE_FALSE( membership_faction_id.is_null() );
    REQUIRE( membership_faction_id == faction_npc.get_fac_id() );
    faction *membership_faction = g->faction_manager_ptr->get( membership_faction_id );
    REQUIRE( membership_faction != nullptr );
    const std::string membership_faction_name = membership_faction->get_name();
    const std::string faction_id_before = faction_npc.get_fac_id().str();
    const std::string faction_subject_name = faction_npc.get_name();
    const std::string faction_subject_template = faction_npc.idz.str();
    membership_faction->remove_member( member_id );
    membership_faction->add_to_membership( member_id, faction_member.get_name(), true );
    REQUIRE( membership_faction_id == faction_npc.get_fac_id() );
    REQUIRE( faction_npc.get_fac_id().str() == faction_id_before );
    REQUIRE( faction_npc.get_name() == faction_subject_name );
    REQUIRE( faction_npc.idz.str() == faction_subject_template );
    const auto native_member = membership_faction->members.find( member_id );
    const bool membership_added = native_member != membership_faction->members.end();
    REQUIRE( membership_added );
    const std::string membership_member_name = native_member->second.first;
    REQUIRE( membership_member_name == faction_member.get_name() );
    refresh_npc_talk_map();
    capture_case( "source-faction-member", faction_npc );
    membership_faction->remove_member( member_id );
    const bool membership_removed = membership_faction->members.count( member_id ) == 0;
    REQUIRE( membership_removed );
    REQUIRE( membership_faction_id == faction_npc.get_fac_id() );
    REQUIRE( faction_npc.get_fac_id().str() == faction_id_before );
    REQUIRE( faction_npc.get_name() == faction_subject_name );
    REQUIRE( faction_npc.idz.str() == faction_subject_template );
    capture_case( "source-faction-removed", faction_npc );
    const size_t faction_record_start = records.size() - 2;
    REQUIRE( records[faction_record_start].actor_id == records[faction_record_start + 1].actor_id );
    REQUIRE( records[faction_record_start].name == records[faction_record_start + 1].name );
    REQUIRE( records[faction_record_start].template_id ==
             records[faction_record_start + 1].template_id );
    REQUIRE( records[faction_record_start].native_turn ==
             records[faction_record_start + 1].native_turn );

    reset_npc_talk_fixture();
    npc &meal_npc = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    refresh_npc_talk_map();
    const time_point meal_capture_time = calendar::turn_zero + 12_hours;
    calendar::turn = calendar::turn_zero + 8_hours;
    meal_npc.stomach.ate();
    calendar::turn = meal_capture_time;
    const int early_time_since_ate = to_turns<int>( meal_npc.stomach.time_since_ate() );
    capture_case( "source-last-ate-early", meal_npc );
    calendar::turn = calendar::turn_zero + 10_hours;
    meal_npc.stomach.ate();
    calendar::turn = meal_capture_time;
    const int late_time_since_ate = to_turns<int>( meal_npc.stomach.time_since_ate() );
    REQUIRE( early_time_since_ate != late_time_since_ate );
    REQUIRE( to_turn<int>( calendar::turn ) == to_turn<int>( meal_capture_time ) );
    capture_case( "source-last-ate-late", meal_npc );
    const size_t meal_record_start = records.size() - 2;
    REQUIRE( records[meal_record_start].actor_id == records[meal_record_start + 1].actor_id );
    REQUIRE( records[meal_record_start].name == records[meal_record_start + 1].name );
    REQUIRE( records[meal_record_start].template_id == records[meal_record_start + 1].template_id );
    REQUIRE( records[meal_record_start].native_turn == records[meal_record_start + 1].native_turn );

    reset_npc_talk_fixture();
    avatar &light_avatar = get_avatar();
    map &light_map = get_map();
    npc &light_npc = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    item shirt( itype_id( "tshirt" ) );
    const std::string shirt_name = shirt.type_name();
    REQUIRE( light_avatar.wear_item( shirt, false ).has_value() );
    item held_item( itype_id( "rock" ) );
    const std::string held_name = held_item.type_name();
    light_avatar.wield( held_item );
    REQUIRE( light_avatar.is_armed() );

    std::vector<light_record> light_cases;
    auto record_light = [&]( const std::string &id, const time_point &turn, bool low_threshold ) {
        calendar::turn = turn;
        g->reset_light_level();
        light_map.build_map_cache( light_avatar.posz(), false );
        if( low_threshold ) {
            level_cache &cache = light_map.access_cache( light_avatar.posz() );
            cache.lm.fill( four_quadrants( LIGHT_AMBIENT_LOW ) );
            light_map.invalidate_visibility_cache();
        } else if( turn == calendar::turn_zero ) {
            level_cache &cache = light_map.access_cache( light_avatar.posz() );
            cache.lm.fill( four_quadrants( 0.0f ) );
            light_map.invalidate_visibility_cache();
        }
        light_map.update_visibility_cache( light_avatar.posz() );
        const tripoint_bub_ms target = light_npc.pos_bub();
        const level_cache &cache = light_map.access_cache( target.z() );
        const visibility_variables &visibility = light_map.get_visibility_variables_cache();
        const lit_level apparent = light_map.apparent_light_at( target, visibility );
        const visibility_type detail = light_map.get_visibility( apparent, visibility );
        const lit_level native_light = light_map.light_at( target );
        const std::string light_name = native_light == lit_level::DARK ? "DARK" :
                                       native_light == lit_level::LOW ? "LOW" :
                                       native_light == lit_level::LIT ? "LIT" : "BRIGHT";
        const bool actor_visible = light_npc.sees( light_map,
                                    static_cast<const Creature &>( light_avatar ) );
        REQUIRE( light_avatar.sees( light_map, static_cast<const Creature &>( light_npc ) ) );
        REQUIRE( actor_visible );
        if( low_threshold ) {
            REQUIRE( light_map.ambient_light_at( target ) == LIGHT_AMBIENT_LOW );
            REQUIRE( cache.sm[target.x()][target.y()] < LIGHT_SOURCE_BRIGHT );
            REQUIRE( native_light == lit_level::LOW );
            REQUIRE( detail == visibility_type::CLEAR );
        } else if( turn == calendar::turn_zero ) {
            REQUIRE( cache.sm[target.x()][target.y()] < LIGHT_SOURCE_BRIGHT );
            REQUIRE( light_map.ambient_light_at( target ) == 0.0f );
            REQUIRE( native_light == lit_level::DARK );
            REQUIRE( detail != visibility_type::CLEAR );
        } else {
            REQUIRE( detail == visibility_type::CLEAR );
        }
        const lit_level light_before_capture = light_map.light_at( target );
        const visibility_type details_before_capture = light_map.get_visibility(
                    light_map.apparent_light_at( target, visibility ), visibility );
        const float ambient_before_capture = light_map.ambient_light_at( target );
        REQUIRE( light_before_capture == native_light );
        REQUIRE( details_before_capture == detail );
        capture_case( id, light_npc );
        const lit_level light_after_capture = light_map.light_at( target );
        const visibility_type details_after_capture = light_map.get_visibility(
                    light_map.apparent_light_at( target, visibility ), visibility );
        REQUIRE( light_after_capture == light_before_capture );
        REQUIRE( details_after_capture == details_before_capture );
        REQUIRE( light_map.ambient_light_at( target ) == ambient_before_capture );
        light_cases.push_back( { id, id + ".json",
                                 "capture/" + id + "/perception.jsonl",
                                 std::to_string( light_npc.getID().get_value() ),
                                 to_turn<int>( calendar::turn ), static_cast<int>( native_light ),
                                 light_name, light_map.ambient_light_at( target ),
                                 static_cast<int>( detail ), actor_visible,
                                 detail == visibility_type::CLEAR, shirt_name, held_name } );
    };
    record_light( "light-day", calendar::turn_zero + 10_hours, false );
    record_light( "light-low", calendar::turn_zero, true );
    record_light( "light-dark", calendar::turn_zero, false );
    const size_t light_record_start = records.size() - 3;
    for( size_t offset = 1; offset < 3; ++offset ) {
        REQUIRE( records[light_record_start].actor_id ==
                 records[light_record_start + offset].actor_id );
        REQUIRE( records[light_record_start].name ==
                 records[light_record_start + offset].name );
        REQUIRE( records[light_record_start].template_id ==
                 records[light_record_start + offset].template_id );
    }

    const std::filesystem::path oracle_path = std::filesystem::path( npc_talk_output_dir() ) /
                                              "source-light-oracle.json";
    std::ofstream stream( oracle_path, std::ios::binary );
    REQUIRE( stream.good() );
    JsonOut out( stream );
    out.start_object();
    out.member( "schema", "p3_native_npc_source_light_oracle_v1" );
    out.member( "records" );
    out.start_array();
    for( const source_record &record : records ) {
        out.start_object();
        out.member( "id", record.id );
        out.member( "frame", record.id + ".json" );
        out.member( "capture", "capture/" + record.id + "/perception.jsonl" );
        out.member( "actorRef", record.actor_ref );
        out.member( "npcActorId", record.actor_id );
        out.member( "name", record.name );
        out.member( "templateId", record.template_id );
        out.member( "nativeTurn", record.native_turn );
        out.end_object();
    }
    out.end_array();
    out.member( "stack" );
    out.start_object();
    out.member( "type", log_type );
    out.member( "tname", log_name );
    out.member( "label", log_label );
    out.member( "before", stack_count_before );
    out.member( "beforeFrame", "source-stack-before.json" );
    out.member( "after", stack_count_after );
    out.member( "afterFrame", "source-stack-after.json" );
    out.end_object();
    out.member( "activity" );
    out.start_object();
    out.member( "frame", "source-activity.json" );
    out.member( "id", activity_id );
    out.member( "nativeVerb", activity_verb );
    out.end_object();
    out.member( "factionMembership" );
    out.start_object();
    out.member( "factionId", membership_faction_id.str() );
    out.member( "factionName", membership_faction_name );
    out.member( "memberActorId", member_actor_id );
    out.member( "memberName", membership_member_name );
    out.member( "npcFactionId", faction_id_before );
    out.member( "memberFrame", "source-faction-member.json" );
    out.member( "memberPresent", membership_added );
    out.member( "removedFrame", "source-faction-removed.json" );
    out.member( "memberRemoved", membership_removed );
    out.end_object();
    out.member( "lastAte" );
    out.start_object();
    out.member( "captureTurn", to_turn<int>( meal_capture_time ) );
    out.member( "earlyFrame", "source-last-ate-early.json" );
    out.member( "earlyTimeSinceAteTurns", early_time_since_ate );
    out.member( "lateFrame", "source-last-ate-late.json" );
    out.member( "lateTimeSinceAteTurns", late_time_since_ate );
    out.end_object();
    out.member( "light" );
    out.start_array();
    for( const light_record &record : light_cases ) {
        out.start_object();
        out.member( "id", record.id );
        out.member( "frame", record.frame );
        out.member( "capture", record.capture );
        out.member( "npcActorId", record.actor_id );
        out.member( "nativeTurn", record.native_turn );
        out.member( "light", record.light );
        out.member( "lightName", record.light_name );
        out.member( "ambientLight", record.ambient_light );
        out.member( "visibility", record.visibility );
        out.member( "actorPresentVisible", record.actor_present_visible );
        out.member( "detailsClear", record.details_clear );
        out.member( "shirtName", record.shirt_name );
        out.member( "heldItemName", record.held_name );
        out.end_object();
    }
    out.end_array();
    out.end_object();
    stream.flush();
    REQUIRE( stream.good() );
}
}

TEST_CASE( "NPC talk native movement states", "[novgorod_p3_npc_frame]" )
{
    scoped_weather_override sunny_weather( npc_talk_sunny );
    std::vector<npc_talk_movement_case> cases;

    reset_npc_talk_fixture();
    avatar &near_you = get_avatar();
    map &near_map = get_map();
    npc &near_subject = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 1, 0, 0 ) );
    std::vector<tripoint_bub_ms> retreat_positions;
    for( int dx = -1; dx <= 1; ++dx ) {
        for( int dy = -1; dy <= 1; ++dy ) {
            if( dx == 0 && dy == 0 ) {
                continue;
            }
            const tripoint_bub_ms point = near_subject.pos_bub() + tripoint_rel_ms( dx, dy, 0 );
            if( point == near_you.pos_bub() ) {
                continue;
            }
            near_map.ter_set( point, npc_talk_wall );
            retreat_positions.push_back( point );
        }
    }
    refresh_npc_talk_map();
    REQUIRE( rl_dist( near_subject.pos_bub().xy(), near_you.pos_bub().xy() ) == 1 );
    REQUIRE( near_you.sees( near_map, static_cast<const Creature &>( near_subject ) ) );
    npc_talk_movement_case near_entry = make_npc_talk_movement_case(
                                           "movement-blocked-near", near_subject, near_you, 1 );
    for( const tripoint_bub_ms &point : retreat_positions ) {
        near_entry.retreat_targets.push_back( { point, npc_talk_reachable( near_subject, point, 0 ) } );
        REQUIRE_FALSE( near_entry.retreat_targets.back().reachable );
    }
    write_npc_talk_observation( near_entry.id );
    cases.push_back( std::move( near_entry ) );

    reset_npc_talk_fixture();
    avatar &glass_you = get_avatar();
    map &glass_map = get_map();
    const tripoint_bub_ms glass_position = npc_talk_center + tripoint_rel_ms( 5, 0, 0 );
    npc &glass_subject = spawn_npc_talk_actor( glass_position );
    for( int dx = -1; dx <= 1; ++dx ) {
        for( int dy = -1; dy <= 1; ++dy ) {
            if( dx != 0 || dy != 0 ) {
                glass_map.ter_set( glass_position + tripoint_rel_ms( dx, dy, 0 ),
                                   npc_talk_reinforced_glass_wall );
            }
        }
    }
    refresh_npc_talk_map();
    REQUIRE( rl_dist( glass_subject.pos_bub().xy(), glass_you.pos_bub().xy() ) > 1 );
    REQUIRE( glass_you.sees( glass_map, static_cast<const Creature &>( glass_subject ) ) );
    for( int dx = -1; dx <= 1; ++dx ) {
        for( int dy = -1; dy <= 1; ++dy ) {
            if( dx == 0 && dy == 0 ) {
                continue;
            }
            const tripoint_bub_ms point = glass_position + tripoint_rel_ms( dx, dy, 0 );
            REQUIRE( glass_map.is_transparent( point ) );
            REQUIRE_FALSE( glass_map.passable( point ) );
            REQUIRE( glass_map.bash_resistance( point ) >= 40 );
            REQUIRE( glass_map.bash_rating( glass_subject.get_pathfinding_settings().bash_strength,
                                            point ) < 1 );
        }
    }
    REQUIRE_FALSE( npc_talk_reachable( glass_subject, glass_you.pos_bub(), 1 ) );
    write_npc_talk_observation( "movement-far-no-route" );
    cases.push_back( make_npc_talk_movement_case(
                         "movement-far-no-route", glass_subject, glass_you, 1 ) );

    reset_npc_talk_fixture();
    avatar &reachable_you = get_avatar();
    map &reachable_map = get_map();
    npc &reachable_subject = spawn_npc_talk_actor( npc_talk_center + tripoint_rel_ms( 4, 0, 0 ) );
    refresh_npc_talk_map();
    REQUIRE( rl_dist( reachable_subject.pos_bub().xy(), reachable_you.pos_bub().xy() ) > 1 );
    REQUIRE( reachable_you.sees( reachable_map, static_cast<const Creature &>( reachable_subject ) ) );
    REQUIRE( npc_talk_reachable( reachable_subject, reachable_you.pos_bub(), 1 ) );
    npc_talk_movement_case reachable_entry = make_npc_talk_movement_case(
                "movement-far-reachable", reachable_subject, reachable_you, 1 );
    write_npc_talk_observation( reachable_entry.id );
    cases.push_back( std::move( reachable_entry ) );

    write_npc_talk_movement_oracle( cases );
}

TEST_CASE( "NPC talk native source and light states", "[novgorod_p3_npc_frame]" )
{
    test_npc_talk_source_light_states();
}
