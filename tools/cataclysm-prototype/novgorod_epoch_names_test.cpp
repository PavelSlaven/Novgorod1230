#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "action.h"
#include "avatar.h"
#include "bodypart.h"
#include "calendar.h"
#include "cata_catch.h"
#include "effect.h"
#include "game.h"
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "map_helpers.h"
#include "npc.h"
#include "novgorod_semantic.h"
#include "path_info.h"
#include "player_helpers.h"
#include "translations.h"
#include "type_id.h"
#include "widget.h"

namespace
{
std::string canonical_json( const JsonValue &value, bool omit_root_name = false )
{
    std::ostringstream stream;
    JsonOut out( stream );
    if( value.test_object() ) {
        const JsonObject object = value.get_object();
        object.allow_omitted_members();
        std::map<std::string, std::string> members;
        for( const JsonMember member : object ) {
            if( !omit_root_name || member.name() != "name" ) {
                members.emplace( member.name(), canonical_json( member ) );
            }
        }
        out.start_object();
        for( const auto &member : members ) {
            out.member( member.first, member.second );
        }
        out.end_object();
    } else if( value.test_array() ) {
        out.start_array();
        for( const JsonValue element : value.get_array() ) {
            out.write( canonical_json( element ) );
        }
        out.end_array();
    } else if( value.test_string() ) {
        out.write( value.get_string() );
    } else if( value.test_bool() ) {
        out.write( value.get_bool() );
    } else if( value.test_int() ) {
        out.write( value.get_int64() );
    } else if( value.test_number() ) {
        out.write( value.get_float() );
    } else {
        REQUIRE( value.test_null() );
        out.write_null();
    }
    return stream.str();
}

JsonValue bleed_entry( const std::string &path )
{
    CAPTURE( path );
    std::ifstream stream( path );
    REQUIRE( stream.good() );
    std::ostringstream content;
    content << stream.rdbuf();
    const JsonValue root = json_loader::from_string( content.str() );
    std::vector<JsonValue> entries;
    for( const JsonValue value : root.get_array() ) {
        const JsonObject object = value.get_object();
        object.allow_omitted_members();
        if( object.get_string( "type" ) == "effect_type" &&
            object.get_string( "id", "" ) == "bleed" ) {
            entries.push_back( value );
        }
    }
    REQUIRE( entries.size() == 1 );
    return entries.front();
}

std::string wound_label( const std::string &phrase )
{
    return phrase + " (" + body_part_name( body_part_arm_l ) + ")";
}

void reset_observation_fixture()
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
    calendar::turn = calendar::turn_zero + 12_hours;
    map &here = get_map();
    get_avatar().setpos( here, tripoint_bub_ms( 60, 60, 0 ) );
    for( const tripoint_bub_ms &point : here.points_on_zlevel( 0 ) ) {
        here.ter_set( point, ter_str_id( "t_floor" ) );
        here.i_clear( point );
    }
}
}

TEST_CASE( "Novgorod bleeding override preserves every native field except its root name",
           "[novgorod_epoch_names]" )
{
    const JsonValue native = bleed_entry( PATH_INFO::datadir() + "json/effects.json" );
    const JsonValue mod = bleed_entry( PATH_INFO::datadir() +
                                      "mods/novgorod_dev_world/epoch-names.json" );
    CHECK( canonical_json( mod, true ) == canonical_json( native, true ) );
}

TEST_CASE( "Novgorod bleeding names match all five approved intensity boundaries",
           "[novgorod_epoch_names]" )
{
    const efftype_id bleed( "bleed" );
    const std::vector<std::pair<int, std::string>> boundaries = {
        { 1, "кровь сочится" }, { 5, "кровь сочится" },
        { 6, "кровь течёт" }, { 10, "кровь течёт" },
        { 11, "кровь льётся" }, { 20, "кровь льётся" },
        { 21, "кровь льётся ручьём" }, { 30, "кровь льётся ручьём" },
        { 31, "кровь хлещет" }, { 40, "кровь хлещет" }
    };
    for( const auto &boundary : boundaries ) {
        CAPTURE( boundary.first );
        clear_avatar();
        avatar &you = get_avatar();
        you.add_effect( bleed, 10_minutes, body_part_arm_l.id() );
        you.get_effect( bleed, body_part_arm_l.id() ).set_intensity( boundary.first );
        const effect &wound = you.get_effect( bleed, body_part_arm_l.id() );
        REQUIRE( wound.get_id() == bleed );
        REQUIRE( wound.get_intensity() == boundary.first );
        CHECK( wound.disp_name() == wound_label( boundary.second ) );
    }
}

TEST_CASE( "Novgorod torso headings use the approved body word",
           "[novgorod_epoch_names]" )
{
    CHECK( body_part_name_as_heading( body_part_torso, 1 ) == "тело" );
    CHECK( body_part_name_as_heading( body_part_torso, 2 ) == "тело" );
}

TEST_CASE( "Novgorod status widgets retain approved torso text and layout padding",
           "[novgorod_epoch_names]" )
{
    clear_avatar();
    const widget_id torso_id( "bodypart_torso_status_text" );
    REQUIRE( torso_id.is_valid() );
    widget torso = torso_id.obj();
    CHECK( torso.text_cond() == "ТЕЛО" );
    REQUIRE( torso._clauses.size() == 7 );
    for( const char *clause_id : { "bleedingAndBitten3", "bleedingAndBitten12",
                                         "bleeding3", "bleeding2", "bleeding1",
                                         "infected", "bitten" } ) {
        CAPTURE( clause_id );
        CHECK( widget_clause::get_text_for_id( clause_id, torso_id,
                                               true ).translated() == "ТЕЛО" );
    }
    for( const char *layout_id : { "status_hpg_layout_rarm",
                                         "status_hpg_layout_rleg" } ) {
        CAPTURE( layout_id );
        const widget_id id( layout_id );
        REQUIRE( id.is_valid() );
        const widget &layout = id.obj();
        CHECK( layout._padding == 1 );
        CHECK( layout.explicit_padding );
    }
}

TEST_CASE( "Novgorod observation exports approved bleeding labels at both extremes",
           "[novgorod_epoch_names]" )
{
    const int intensity = GENERATE( 1, 40 );
    CAPTURE( intensity );
    const efftype_id bleed( "bleed" );
    reset_observation_fixture();
    avatar &you = get_avatar();
    map &here = get_map();
    you.add_effect( bleed, 10_minutes, body_part_arm_l.id() );
    you.get_effect( bleed, body_part_arm_l.id() ).set_intensity( intensity );
    REQUIRE( you.get_effect( bleed, body_part_arm_l.id() ).get_id() == bleed );
    REQUIRE( you.get_effect( bleed, body_part_arm_l.id() ).get_intensity() == intensity );
    npc &observer = spawn_npc( point_bub_ms( 60, 62 ), "NPC_debug" );
    observer.death_eocs.clear();
    observer.set_attitude( NPCATT_NULL );
    here.invalidate_map_cache( 0 );
    here.build_map_cache( 0 );
    here.update_visibility_cache( 0 );
    REQUIRE( observer.sees( here, static_cast<const Creature &>( you ) ) );

    std::ostringstream stream;
    JsonOut out( stream );
    novgorod_semantic::write_observation( out );
    const JsonObject observation = json_loader::from_string( stream.str() ).get_object();
    observation.allow_omitted_members();
    const std::string expected = wound_label( intensity == 1 ? "кровь сочится" :
                                 "кровь хлещет" );
    const JsonValue native = bleed_entry( PATH_INFO::datadir() + "json/effects.json" );
    const JsonObject native_object = native.get_object();
    native_object.allow_omitted_members();
    const JsonArray native_names = native_object.get_array( "name" );
    REQUIRE( native_names.size() >= static_cast<size_t>( intensity ) );
    translation old_name;
    old_name.deserialize( native_names[intensity - 1] );
    const std::string old_phrase = old_name.translated();
    REQUIRE_FALSE( old_phrase.empty() );
    bool observer_found = false;
    bool avatar_found = false;
    for( const JsonObject projection : observation.get_array( "npc_projections" ) ) {
        projection.allow_omitted_members();
        if( projection.get_string( "actor_id" ) !=
            std::to_string( observer.getID().get_value() ) ) {
            continue;
        }
        observer_found = true;
        for( const JsonObject actor : projection.get_array( "visible_actors" ) ) {
            actor.allow_omitted_members();
            if( actor.get_string( "actor_id" ) != std::to_string( you.getID().get_value() ) ) {
                continue;
            }
            avatar_found = true;
            const JsonObject appearance = actor.get_object( "appearance" );
            appearance.allow_omitted_members();
            const JsonArray wounds = appearance.get_array( "visible_wounds" );
            REQUIRE( wounds.size() == 1 );
            const JsonObject wound = wounds.get_object( 0 );
            wound.allow_omitted_members();
            CHECK( wound.get_string( "body_part_id" ) == "arm_l" );
            const std::string label = wound.get_string( "label" );
            CHECK( label == expected );
            CHECK( label.find( old_phrase ) == std::string::npos );
        }
    }
    CHECK( observer_found );
    CHECK( avatar_found );
}
