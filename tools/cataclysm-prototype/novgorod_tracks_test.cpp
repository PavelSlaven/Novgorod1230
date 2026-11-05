#include <array>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "action.h"
#include "avatar.h"
#include "calendar.h"
#include "cata_catch.h"
#include "coordinates.h"
#include "effect.h"
#include "field.h"
#include "field_type.h"
#include "game.h"
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "mapbuffer.h"
#include "map_helpers.h"
#include "map_helpers_tests.h"
#include "mtype.h"
#include "monster.h"
#include "npc.h"
#include "options_helpers.h"
#include "player_helpers.h"
#include "submap.h"
#include "type_id.h"
#include "units.h"
#include "weather.h"
#include "weather_type.h"

namespace
{
constexpr tripoint_bub_ms tracks_center( 66, 66, 0 );
const ter_str_id t_dirt( "t_dirt" );
const ter_str_id t_floor( "t_floor" );
const ter_str_id t_pavement( "t_pavement" );
const ter_str_id t_open_air( "t_open_air" );
const ter_str_id t_water_sh( "t_water_sh" );
const ter_str_id test_soft_a( "t_novgorod_tracks_soft_a" );
const ter_str_id test_soft_b( "t_novgorod_tracks_soft_b" );
const mtype_id test_animal_a( "mon_novgorod_tracks_animal_a" );
const mtype_id test_animal_b( "mon_novgorod_tracks_animal_b" );
const npc_template_id test_npc( "NPC_debug" );
const vproto_id test_vehicle( "handjack" );
const field_type_str_id blood_field( "fd_blood" );

struct direction_case {
    const char *name;
    const char *suffix;
    tripoint_rel_ms delta;
};

const std::array<direction_case, 8> all_directions = {{
        { "north", "n", tripoint_rel_ms( 0, -1, 0 ) },
        { "northwest", "w", tripoint_rel_ms( -1, -1, 0 ) },
        { "west", "w", tripoint_rel_ms( -1, 0, 0 ) },
        { "southwest", "w", tripoint_rel_ms( -1, 1, 0 ) },
        { "south", "s", tripoint_rel_ms( 0, 1, 0 ) },
        { "southeast", "e", tripoint_rel_ms( 1, 1, 0 ) },
        { "east", "e", tripoint_rel_ms( 1, 0, 0 ) },
        { "northeast", "e", tripoint_rel_ms( 1, -1, 0 ) }
    }};

const std::array<direction_case, 4> cardinal_directions = {{
        all_directions[0], all_directions[2], all_directions[4], all_directions[6]
    }};

std::vector<std::string> pause_action()
{
    return { action_ident( ACTION_PAUSE ) };
}

void reset_tracks_scene()
{
    static bool loop_started = false;
    if( !loop_started ) {
        g->set_test_action_queue( pause_action() );
        REQUIRE_FALSE( g->do_turn() );
        loop_started = true;
    }

    clear_avatar();
    clear_map();
    clear_npcs();
    map &here = get_map();
    calendar::turn = calendar::turn_zero + 12_hours;
    get_weather().snow_depth_map.clear();
    for( const tripoint_bub_ms &p : here.points_on_zlevel( 0 ) ) {
        here.ter_set( p, t_dirt );
        here.i_clear( p );
        here.clear_fields( p );
    }
    avatar &you = get_avatar();
    you.set_pos_abs_only( here.get_abs( tracks_center ) );
    you.set_moves( 1000 );
    here.build_map_cache( 0 );
    here.build_map_cache( 1 );
}

std::string footprint_id( const std::string &family, const char *direction )
{
    return "fd_" + family + "_footprint_" + direction;
}

const field_entry *find_field_string( const map &here, const tripoint_bub_ms &where,
                                      const std::string &expected_id )
{
    const field &fields = here.field_at( where );
    for( const auto &entry : fields ) {
        if( entry.first.id().str() == expected_id ) {
            return &entry.second;
        }
    }
    return nullptr;
}

const field_entry *find_footprint( const map &here, const tripoint_bub_ms &where,
                                   const std::string &family, const char *direction )
{
    return find_field_string( here, where, footprint_id( family, direction ) );
}

const field_entry *require_footprint( const map &here, const tripoint_bub_ms &where,
                                      const std::string &family, const char *direction )
{
    const field_entry *track = find_footprint( here, where, family, direction );
    REQUIRE( track != nullptr );
    const std::string expected_name = family == "human" ? "след человека" :
                                      family == "bird" ? "след птицы" : "след животного";
    CHECK( track->name() == expected_name );
    CHECK( track->get_field_intensity() == 1 );
    CHECK( track->get_field_type().obj().half_life == 6_hours );
    CHECK( track->get_field_type().obj().linear_half_life );
    return track;
}

void check_no_ordinary_tracks( const map &here, const tripoint_bub_ms &where )
{
    for( const char *family : { "human", "bird", "animal" } ) {
        for( const char *direction : { "n", "w", "s", "e" } ) {
            CHECK( find_footprint( here, where, family, direction ) == nullptr );
        }
    }
}

void check_only_footprint( const map &here, const tripoint_bub_ms &where,
                           const std::string &expected_id )
{
    for( const char *family : { "human", "bird", "animal" } ) {
        for( const char *direction : { "n", "w", "s", "e" } ) {
            const std::string candidate = footprint_id( family, direction );
            if( candidate != expected_id ) {
                CHECK( find_field_string( here, where, candidate ) == nullptr );
            }
        }
    }
}

void process_track_cycle( map &here )
{
    const time_point before = calendar::turn;
    calendar::turn += 1_turns;
    handle_weather_effects( get_weather().weather_id );
    here.process_fields();
    REQUIRE( calendar::turn == before + 1_turns );
}

void set_weather_and_require( const weather_type_id &expected )
{
    get_weather().update_weather();
    REQUIRE( get_weather().weather_id == expected );
}

void set_snow_depth( const map &here, const tripoint_bub_ms &where, double depth_mm )
{
    const tripoint_abs_omt omt = project_to<coords::omt>( here.get_abs( where ) );
    get_weather().snow_depth_map.clear();
    get_weather().snow_depth_map[omt] = omt_snow_state{ depth_mm, calendar::turn };
}

void set_roof( map &here, const tripoint_bub_ms &where )
{
    here.ter_set( where + tripoint_rel_ms( 0, 0, 1 ), t_floor );
    here.build_map_cache( 0 );
    here.build_map_cache( 1 );
}

void move_avatar_away_from( const map &here )
{
    get_avatar().set_pos_abs_only( here.get_abs( tracks_center + tripoint_rel_ms( 20, 20, 0 ) ) );
}

void move_player_from( const direction_case &direction )
{
    const point_rel_sm shift = g->place_player( tracks_center + direction.delta, true );
    ( void )shift;
    REQUIRE( get_avatar().pos_bub() == tracks_center + direction.delta );
}

void check_player_trace( const direction_case &direction, const std::string &family )
{
    reset_tracks_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_player_from( direction );
    require_footprint( here, tracks_center, family, direction.suffix );
}

void check_chicken_trace( const direction_case &direction )
{
    reset_tracks_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    monster &chicken = spawn_test_monster( "mon_chicken", tracks_center );
    REQUIRE( chicken.in_species( species_id( "BIRD" ) ) );
    REQUIRE_FALSE( chicken.has_flag( mon_flag_FLIES ) );
    REQUIRE( chicken.move_to( tracks_center + direction.delta, true ) );
    REQUIRE( chicken.pos_bub() == tracks_center + direction.delta );
    require_footprint( here, tracks_center, "bird", direction.suffix );
}

void check_animal_trace( const direction_case &direction, const mtype_id &type )
{
    reset_tracks_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    monster &animal = spawn_test_monster( type.str(), tracks_center );
    REQUIRE( animal.in_species( species_id( "MAMMAL" ) ) );
    REQUIRE_FALSE( animal.has_flag( mon_flag_FLIES ) );
    REQUIRE( animal.move_to( tracks_center + direction.delta, true ) );
    REQUIRE( animal.pos_bub() == tracks_center + direction.delta );
    require_footprint( here, tracks_center, "animal", direction.suffix );
}

void check_blood_age( const weather_type_id &weather, time_duration &result )
{
    reset_tracks_scene();
    scoped_weather_override weather_override( weather );
    set_weather_and_require( weather );
    map &here = get_map();
    here.ter_set( tracks_center, t_pavement );
    here.build_map_cache( 0 );
    REQUIRE( here.is_outside( tracks_center ) );
    REQUIRE_FALSE( here.is_roofed( tracks_center ) );
    REQUIRE( here.add_field( tracks_center, blood_field, 1 ) );
    for( int i = 0; i < 12; ++i ) {
        process_track_cycle( here );
    }
    const field_entry *blood = find_field_string( here, tracks_center, "fd_blood" );
    REQUIRE( blood != nullptr );
    result = blood->get_field_age();
}

void check_covered_lifetime( const weather_type_id &weather )
{
    reset_tracks_scene();
    scoped_weather_override weather_override( weather );
    set_weather_and_require( weather );
    map &here = get_map();
    here.ter_set( tracks_center, test_soft_a );
    set_roof( here, tracks_center );
    REQUIRE( here.is_roofed( tracks_center ) );
    const time_point born = calendar::turn;
    move_player_from( all_directions[0] );
    require_footprint( here, tracks_center, "human", "n" );

    for( int i = 0; i < to_turns<int>( 5_hours + 59_minutes ); ++i ) {
        process_track_cycle( here );
    }
    const field_entry *track = require_footprint( here, tracks_center, "human", "n" );
    CHECK( track->is_field_alive() );
    CHECK( calendar::turn == born + 5_hours + 59_minutes );
    for( int i = 0; i < 59; ++i ) {
        process_track_cycle( here );
    }
    track = require_footprint( here, tracks_center, "human", "n" );
    CHECK( track->is_field_alive() );
    CHECK( calendar::turn == born + 6_hours - 1_turns );

    process_track_cycle( here );
    track = find_footprint( here, tracks_center, "human", "n" );
    REQUIRE( track != nullptr );
    CHECK_FALSE( track->is_field_alive() );
    process_track_cycle( here );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
    for( int i = 0; i < 59; ++i ) {
        process_track_cycle( here );
    }
    CHECK( calendar::turn == born + 6_hours + 1_minutes );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
}
} // namespace

TEST_CASE( "A1 HUMAN+BIRD monster leaves only the human trace", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    monster &subject = spawn_test_monster( "mon_novgorod_tracks_human_bird", tracks_center );
    REQUIRE( subject.in_species( species_id( "HUMAN" ) ) );
    REQUIRE( subject.in_species( species_id( "BIRD" ) ) );
    REQUIRE( subject.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );
    require_footprint( here, tracks_center, "human", "n" );
    check_only_footprint( here, tracks_center, footprint_id( "human", "n" ) );
}

TEST_CASE( "A2 flying BIRD at ground level leaves no ordinary trace", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    monster &bird = spawn_test_monster( "mon_crow", tracks_center );
    REQUIRE( bird.in_species( species_id( "BIRD" ) ) );
    REQUIRE( bird.has_flag( mon_flag_FLIES ) );
    REQUIRE( bird.posz() == 0 );
    REQUIRE( bird.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );
    check_no_ordinary_tracks( here, tracks_center );
}

TEST_CASE( "A3 t_dirt to t_floor leaves a trace on the old dirt", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    here.ter_set( tracks_center + tripoint_rel_ms( 0, -1, 0 ), t_floor );
    move_player_from( all_directions[0] );
    require_footprint( here, tracks_center, "human", "n" );
}

TEST_CASE( "A4 t_floor to t_dirt does not leave an ordinary trace", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_floor );
    here.ter_set( tracks_center + tripoint_rel_ms( 0, -1, 0 ), t_dirt );
    move_player_from( all_directions[0] );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
}

TEST_CASE( "A4 each listed dry hard surface rejects an ordinary trace",
           "[novgorod_tracks][guard]" )
{
    static const std::array<const char *, 6> hard_surfaces = {{
            "t_floor", "t_rock_floor", "t_rock_floor_no_roof", "t_pavement",
            "t_dirtfloor", "t_glassed_sand"
        }};
    for( const char *terrain : hard_surfaces ) {
        DYNAMIC_SECTION( "A4 dry " << terrain ) {
            reset_tracks_scene();
            scoped_weather_override sunny( weather_type_id( "sunny" ) );
            set_weather_and_require( weather_type_id( "sunny" ) );
            map &here = get_map();
            here.ter_set( tracks_center, ter_str_id( terrain ) );
            move_player_from( all_directions[0] );
            check_no_ordinary_tracks( here, tracks_center );
        }
    }
}

TEST_CASE( "A5 each planned soft terrain accepts a trace", "[novgorod_tracks]" )
{
    static const std::array<const char *, 14> soft_terrains = {{
            "t_dirt", "t_dirtmound", "t_mud", "t_sand", "t_sandmound", "t_clay",
            "t_claymound", "t_grass", "t_grass_dead", "t_grass_long", "t_grass_tall",
            "t_forestfloor", "t_moss", "t_palisade_gate_o"
        }};
    for( const char *terrain : soft_terrains ) {
        DYNAMIC_SECTION( "A5 " << terrain ) {
            reset_tracks_scene();
            scoped_weather_override sunny( weather_type_id( "sunny" ) );
            set_weather_and_require( weather_type_id( "sunny" ) );
            map &here = get_map();
            here.ter_set( tracks_center, ter_str_id( terrain ) );
            move_player_from( all_directions[0] );
            require_footprint( here, tracks_center, "human", "n" );
        }
    }
}

TEST_CASE( "A5 custom SOFT_GROUND remains soft under a roof at both snow depths",
           "[novgorod_tracks]" )
{
    const std::array<std::pair<ter_str_id, double>, 4> surfaces = {{
            { test_soft_a, 0.0 }, { test_soft_a, 12.0 },
            { test_soft_b, 0.0 }, { test_soft_b, 12.0 }
        }};
    for( const auto &[terrain, depth] : surfaces ) {
        DYNAMIC_SECTION( "A5 " << terrain.str() << " roof snow=" << depth ) {
            reset_tracks_scene();
            scoped_weather_override sunny( weather_type_id( "sunny" ) );
            set_weather_and_require( weather_type_id( "sunny" ) );
            map &here = get_map();
            here.ter_set( tracks_center, terrain );
            set_roof( here, tracks_center );
            set_snow_depth( here, tracks_center, depth );
            REQUIRE( here.is_roofed( tracks_center ) );
            if( depth > 0.0 ) {
                REQUIRE( get_weather().get_snow_depth_mm(
                             project_to<coords::omt>( here.get_abs( tracks_center ) ) ) > 0.0 );
            }
            move_player_from( all_directions[0] );
            require_footprint( here, tracks_center, "human", "n" );
        }
    }
}

TEST_CASE( "A5 snow needs exposed supported ground and positive depth", "[novgorod_tracks]" )
{
    SECTION( "exposed pavement with snow accepts a trace" ) {
        reset_tracks_scene();
        scoped_weather_override snow( weather_type_id( "snowing" ) );
        set_weather_and_require( weather_type_id( "snowing" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_pavement );
        here.build_map_cache( 0 );
        set_snow_depth( here, tracks_center, 12.0 );
        REQUIRE( here.is_outside( tracks_center ) );
        REQUIRE_FALSE( here.is_roofed( tracks_center ) );
        REQUIRE( here.has_floor( tracks_center ) );
        move_player_from( all_directions[0] );
        require_footprint( here, tracks_center, "human", "n" );
    }

    SECTION( "zero depth does not accept a snow trace" ) {
        reset_tracks_scene();
        scoped_weather_override snow( weather_type_id( "snowing" ) );
        set_weather_and_require( weather_type_id( "snowing" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_pavement );
        here.build_map_cache( 0 );
        get_weather().snow_depth_map.clear();
        REQUIRE( get_weather().get_snow_depth_mm(
                     project_to<coords::omt>( here.get_abs( tracks_center ) ) ) == 0.0 );
        move_player_from( all_directions[0] );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "roof blocks snow on otherwise supported pavement" ) {
        reset_tracks_scene();
        scoped_weather_override snow( weather_type_id( "snowing" ) );
        set_weather_and_require( weather_type_id( "snowing" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_pavement );
        set_roof( here, tracks_center );
        set_snow_depth( here, tracks_center, 12.0 );
        REQUIRE( here.is_roofed( tracks_center ) );
        move_player_from( all_directions[0] );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "water is not a snow support surface" ) {
        reset_tracks_scene();
        scoped_weather_override snow( weather_type_id( "snowing" ) );
        set_weather_and_require( weather_type_id( "snowing" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_water_sh );
        set_snow_depth( here, tracks_center, 12.0 );
        REQUIRE_FALSE( here.is_roofed( tracks_center ) );
        REQUIRE( here.has_flag( "SWIMMABLE", tracks_center ) );
        move_player_from( all_directions[0] );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "open air does not support a snow trace" ) {
        reset_tracks_scene();
        scoped_weather_override snow( weather_type_id( "snowing" ) );
        set_weather_and_require( weather_type_id( "snowing" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_open_air );
        set_snow_depth( here, tracks_center, 12.0 );
        REQUIRE_FALSE( here.has_floor( tracks_center ) );
        move_player_from( all_directions[0] );
        check_no_ordinary_tracks( here, tracks_center );
    }
}

TEST_CASE( "A6 avatar, NPC, chicken, and new animals use native move paths",
           "[novgorod_tracks]" )
{
    for( const direction_case &direction : all_directions ) {
        DYNAMIC_SECTION( "A6 avatar " << direction.name ) {
            check_player_trace( direction, "human" );
        }
        DYNAMIC_SECTION( "A6 chicken " << direction.name ) {
            check_chicken_trace( direction );
        }
        DYNAMIC_SECTION( "A6 animal A " << direction.name ) {
            check_animal_trace( direction, test_animal_a );
        }
    }

    DYNAMIC_SECTION( "A6 NPC native move_to north" ) {
        reset_tracks_scene();
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        move_avatar_away_from( here );
        npc &subject = spawn_npc( tracks_center.xy(), test_npc.str() );
        const tripoint_bub_ms destination = tracks_center + tripoint_rel_ms( 0, -1, 0 );
        subject.move_to( destination, true );
        REQUIRE( subject.pos_bub() == destination );
        require_footprint( here, tracks_center, "human", "n" );
    }

    DYNAMIC_SECTION( "A6 animal B native move_to east" ) {
        check_animal_trace( cardinal_directions[3], test_animal_b );
    }
}

TEST_CASE( "A6 each added animal and SOFT_GROUND terrain pair works together",
           "[novgorod_tracks]" )
{
    const std::array<std::pair<ter_str_id, mtype_id>, 2> fixture_pairs = {{
            { test_soft_a, test_animal_a }, { test_soft_b, test_animal_b }
        }};
    for( const auto &[terrain, animal_type] : fixture_pairs ) {
        DYNAMIC_SECTION( "A6 " << terrain.str() << " with " << animal_type.str() ) {
            reset_tracks_scene();
            scoped_weather_override sunny( weather_type_id( "sunny" ) );
            set_weather_and_require( weather_type_id( "sunny" ) );
            map &here = get_map();
            here.ter_set( tracks_center, terrain );
            REQUIRE( here.has_flag( "SOFT_GROUND", tracks_center ) );
            REQUIRE_FALSE( here.has_flag( "DIGGABLE", tracks_center ) );
            move_avatar_away_from( here );
            monster &animal = spawn_test_monster( animal_type.str(), tracks_center );
            REQUIRE( animal.in_species( species_id( "MAMMAL" ) ) );
            REQUIRE_FALSE( animal.in_species( species_id( "HUMAN" ) ) );
            REQUIRE_FALSE( animal.in_species( species_id( "BIRD" ) ) );
            REQUIRE_FALSE( animal.has_flag( mon_flag_FLIES ) );
            REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );
            const field_entry *track = require_footprint( here, tracks_center, "animal", "n" );
            check_only_footprint( here, tracks_center, footprint_id( "animal", "n" ) );
            CHECK( track->get_field_intensity() == 1 );
        }
    }
}

TEST_CASE( "A7 a vehicle part at the destination does not suppress the old soil trace",
           "[novgorod_tracks]" )
{
    reset_tracks_scene();
    map &here = get_map();
    const tripoint_bub_ms destination = tracks_center + tripoint_rel_ms( 1, 0, 0 );
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    REQUIRE( here.add_vehicle( test_vehicle, destination, 0_degrees ) != nullptr );
    REQUIRE_FALSE( static_cast<bool>( here.veh_at( tracks_center ) ) );
    REQUIRE( static_cast<bool>( here.veh_at( destination ) ) );
    monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
    REQUIRE( animal.move_to( destination, true ) );
    require_footprint( here, tracks_center, "animal", "e" );
}

TEST_CASE( "A8 a vehicle part on the old tile prevents an ordinary trace", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    map &here = get_map();
    const tripoint_bub_ms destination = tracks_center + tripoint_rel_ms( 1, 0, 0 );
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    REQUIRE( here.add_vehicle( test_vehicle, tracks_center, 0_degrees ) != nullptr );
    REQUIRE( static_cast<bool>( here.veh_at( tracks_center ) ) );
    REQUIRE_FALSE( static_cast<bool>( here.veh_at( destination ) ) );
    monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
    REQUIRE( animal.move_to( destination, true ) );
    check_no_ordinary_tracks( here, tracks_center );
}

TEST_CASE( "A9 a bird trace does not refresh an older human trace", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_player_from( all_directions[0] );
    process_track_cycle( here );
    const field_entry *human = require_footprint( here, tracks_center, "human", "n" );
    REQUIRE( human->get_field_age() > 0_turns );
    const time_duration old_human_age = human->get_field_age();

    get_avatar().set_pos_abs_only( here.get_abs( tracks_center + tripoint_rel_ms( 5, 0, 0 ) ) );
    monster &chicken = spawn_test_monster( "mon_chicken", tracks_center );
    REQUIRE( chicken.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );
    const field_entry *bird = require_footprint( here, tracks_center, "bird", "n" );
    CHECK( bird->get_field_age() == 0_turns );
    human = require_footprint( here, tracks_center, "human", "n" );
    CHECK( human->get_field_age() == old_human_age );
}

TEST_CASE( "A10 a matching repeat refreshes only its own direction", "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    move_avatar_away_from( here );
    monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
    REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );
    animal.setpos( here, tracks_center );
    REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 1, 0, 0 ), true ) );
    process_track_cycle( here );

    const field_entry *north = require_footprint( here, tracks_center, "animal", "n" );
    const field_entry *east = require_footprint( here, tracks_center, "animal", "e" );
    const time_duration east_age_before_refresh = east->get_field_age();
    animal.setpos( here, tracks_center );
    REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 0, -1, 0 ), true ) );

    north = require_footprint( here, tracks_center, "animal", "n" );
    east = require_footprint( here, tracks_center, "animal", "e" );
    CHECK( north->get_field_age() == 0_turns );
    CHECK( east->get_field_age() == east_age_before_refresh );
    process_track_cycle( here );
    north = require_footprint( here, tracks_center, "animal", "n" );
    east = require_footprint( here, tracks_center, "animal", "e" );
    CHECK( north->get_field_age() == 1_turns );
    CHECK( east->get_field_age() == east_age_before_refresh + 1_turns );
}

TEST_CASE( "A11 dry exposed trace follows the native six-hour decay boundary",
           "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    here.build_map_cache( 0 );
    REQUIRE( here.is_outside( tracks_center ) );
    REQUIRE_FALSE( here.is_roofed( tracks_center ) );
    const time_point born = calendar::turn;
    move_player_from( all_directions[0] );
    const field_entry *track = require_footprint( here, tracks_center, "human", "n" );
    CHECK( track->get_field_type().obj().half_life == 6_hours );
    CHECK( track->get_field_type().obj().linear_half_life );

    process_track_cycle( here );
    track = require_footprint( here, tracks_center, "human", "n" );
    const time_point first_decay_boundary = calendar::turn - track->get_field_age() + 6_hours;
    CHECK( first_decay_boundary == born + 6_hours );
    for( int i = 0; i < to_turns<int>( 5_hours + 59_minutes ) - 1; ++i ) {
        process_track_cycle( here );
    }
    track = require_footprint( here, tracks_center, "human", "n" );
    CHECK( track->is_field_alive() );
    CHECK( calendar::turn == born + 5_hours + 59_minutes );
    for( int i = 0; i < 59; ++i ) {
        process_track_cycle( here );
    }
    track = require_footprint( here, tracks_center, "human", "n" );
    CHECK( track->is_field_alive() );
    CHECK( calendar::turn == first_decay_boundary - 1_turns );

    process_track_cycle( here );
    track = find_footprint( here, tracks_center, "human", "n" );
    REQUIRE( track != nullptr );
    CHECK_FALSE( track->is_field_alive() );
    process_track_cycle( here );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
    for( int i = 0; i < 59; ++i ) {
        process_track_cycle( here );
    }
    CHECK( calendar::turn == born + 6_hours + 1_minutes );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
}

TEST_CASE( "A11 roofed trace keeps the same lifetime in sunny rain and snowing",
           "[novgorod_tracks]" )
{
    SECTION( "A11 roofed sunny" ) {
        check_covered_lifetime( weather_type_id( "sunny" ) );
    }
    SECTION( "A11 roofed rain" ) {
        check_covered_lifetime( weather_type_id( "rain" ) );
    }
    SECTION( "A11 roofed snowing" ) {
        check_covered_lifetime( weather_type_id( "snowing" ) );
    }
}

TEST_CASE( "A12 precipitation accelerates exposed traces but not roofed or dry controls",
           "[novgorod_tracks]" )
{
    for( const char *precipitation : { "rain", "snowing" } ) {
        DYNAMIC_SECTION( "A12 " << precipitation ) {
            reset_tracks_scene();
            const weather_type_id weather( precipitation );
            scoped_weather_override weather_override( weather );
            set_weather_and_require( weather );
            map &here = get_map();
            const tripoint_bub_ms roofed = tracks_center + tripoint_rel_ms( 4, 0, 0 );
            here.ter_set( tracks_center, t_dirt );
            here.ter_set( roofed, t_dirt );
            set_roof( here, roofed );
            here.build_map_cache( 0 );
            REQUIRE( here.is_outside( tracks_center ) );
            REQUIRE_FALSE( here.is_roofed( tracks_center ) );
            REQUIRE( here.is_roofed( roofed ) );
            const time_point both_traces_born = calendar::turn;
            move_player_from( all_directions[0] );
            REQUIRE( calendar::turn == both_traces_born );
            monster &under_roof = spawn_test_monster( test_animal_a.str(), roofed );
            REQUIRE( under_roof.move_to( roofed + tripoint_rel_ms( 0, -1, 0 ), true ) );
            REQUIRE( calendar::turn == both_traces_born );

            const field_entry *exposed_track = require_footprint( here, tracks_center, "human", "n" );
            const field_entry *roofed_track = require_footprint( here, roofed, "animal", "n" );
            process_track_cycle( here );
            exposed_track = require_footprint( here, tracks_center, "human", "n" );
            roofed_track = require_footprint( here, roofed, "animal", "n" );
            CHECK( exposed_track->get_field_age() == 1_turns );
            process_track_cycle( here );
            exposed_track = require_footprint( here, tracks_center, "human", "n" );
            CHECK( exposed_track->get_field_age() == 13_turns );
            for( int i = 0; i < 31 * 60 - 2; ++i ) {
                process_track_cycle( here );
            }
            CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
            roofed_track = require_footprint( here, roofed, "animal", "n" );
            CHECK( roofed_track->get_field_age() == 31_minutes );
        }
    }

    SECTION( "A12 exposed dry control still exists after 31 minutes" ) {
        reset_tracks_scene();
        scoped_weather_override sunny( weather_type_id( "sunny" ) );
        set_weather_and_require( weather_type_id( "sunny" ) );
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        here.build_map_cache( 0 );
        REQUIRE( here.is_outside( tracks_center ) );
        REQUIRE_FALSE( here.is_roofed( tracks_center ) );
        move_player_from( all_directions[0] );
        require_footprint( here, tracks_center, "human", "n" );
        for( int i = 0; i < 31 * 60; ++i ) {
            process_track_cycle( here );
        }
        CHECK( find_footprint( here, tracks_center, "human", "n" ) != nullptr );
    }
}

TEST_CASE( "A13 every field cycle advances exactly one turn after verified weather setup",
           "[novgorod_tracks][guard]" )
{
    for( const char *weather_name : { "sunny", "rain", "snowing" } ) {
        DYNAMIC_SECTION( "A13 weather " << weather_name ) {
            reset_tracks_scene();
            const weather_type_id expected( weather_name );
            scoped_weather_override weather_override( expected );
            set_weather_and_require( expected );
            const time_point before = calendar::turn;
            process_track_cycle( get_map() );
            CHECK( calendar::turn == before + 1_turns );
        }
    }
}

TEST_CASE( "A13 native fd_blood age stays unchanged across dry rain and snow ticks",
           "[novgorod_tracks][guard]" )
{
    time_duration dry_age;
    time_duration rain_age;
    time_duration snow_age;
    check_blood_age( weather_type_id( "sunny" ), dry_age );
    check_blood_age( weather_type_id( "rain" ), rain_age );
    check_blood_age( weather_type_id( "snowing" ), snow_age );
    CHECK( rain_age == dry_age );
    CHECK( snow_age == dry_age );
}

TEST_CASE( "A14 submap store and load preserve a trace age and remaining lifetime",
           "[novgorod_tracks]" )
{
    reset_tracks_scene();
    scoped_weather_override sunny( weather_type_id( "sunny" ) );
    set_weather_and_require( weather_type_id( "sunny" ) );
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    const time_point born = calendar::turn;
    move_player_from( all_directions[0] );
    require_footprint( here, tracks_center, "human", "n" );
    for( int i = 0; i < to_turns<int>( 2_hours ); ++i ) {
        process_track_cycle( here );
    }

    const field_entry *before = require_footprint( here, tracks_center, "human", "n" );
    const std::string expected_id = before->get_field_type().id().str();
    const time_duration expected_age = before->get_field_age();
    const int expected_intensity = before->get_field_intensity();
    const tripoint_abs_sm expected_coordinates = project_to<coords::sm>( here.get_abs( tracks_center ) );
    submap *live_submap = MAPBUFFER.lookup_submap( expected_coordinates );
    REQUIRE( live_submap != nullptr );

    std::stringstream encoded;
    {
        JsonOut output( encoded );
        output.start_object();
        output.member( "version", savegame_version );
        output.member( "coordinates" );
        output.start_array();
        output.write( expected_coordinates.x() );
        output.write( expected_coordinates.y() );
        output.write( expected_coordinates.z() );
        output.end_array();
        live_submap->store( output );
        output.end_object();
    }
    const time_point before_load = calendar::turn;
    JsonValue encoded_value = json_loader::from_string( encoded.str() );
    JsonObject wrapper = encoded_value.get_object();
    const int version = wrapper.get_int( "version" );
    JsonArray coordinates = wrapper.get_array( "coordinates" );
    const tripoint_abs_sm loaded_coordinates{ coordinates.next_int(), coordinates.next_int(),
                                coordinates.next_int() };
    REQUIRE( loaded_coordinates == expected_coordinates );
    submap loaded;
    for( JsonMember member : wrapper ) {
        const std::string name = member.name();
        if( name != "version" && name != "coordinates" ) {
            loaded.load( member, name, version );
        }
    }
    before = nullptr;
    *live_submap = std::move( loaded );
    here.invalidate_map_cache( 0 );
    here.invalidate_map_cache( 1 );
    here.build_map_cache( 0 );
    here.build_map_cache( 1 );
    CHECK( calendar::turn == before_load );

    const field_entry *after = require_footprint( here, tracks_center, "human", "n" );
    CHECK( after->get_field_type().id().str() == expected_id );
    CHECK( after->get_field_age() == expected_age );
    CHECK( after->get_field_intensity() == expected_intensity );
    CHECK( expected_age == 2_hours );

    for( int i = 0; i < to_turns<int>( 4_hours ) - 1; ++i ) {
        process_track_cycle( here );
    }
    after = require_footprint( here, tracks_center, "human", "n" );
    CHECK( after->is_field_alive() );
    CHECK( calendar::turn == born + 6_hours - 1_turns );
    process_track_cycle( here );
    after = find_footprint( here, tracks_center, "human", "n" );
    REQUIRE( after != nullptr );
    CHECK_FALSE( after->is_field_alive() );
    process_track_cycle( here );
    CHECK( find_footprint( here, tracks_center, "human", "n" ) == nullptr );
}

TEST_CASE( "native movement guards do not create ordinary traces", "[novgorod_tracks][guard]" )
{
    SECTION( "no-op player placement" ) {
        reset_tracks_scene();
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        g->place_player( tracks_center, true );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "gliding monster" ) {
        reset_tracks_scene();
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        move_avatar_away_from( here );
        monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
        animal.add_effect( efftype_id( "gliding" ), 1_turns, true );
        REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 1, 0, 0 ), true ) );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "fake monster" ) {
        reset_tracks_scene();
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        move_avatar_away_from( here );
        monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
        animal.set_fake( true );
        REQUIRE( animal.move_to( tracks_center + tripoint_rel_ms( 1, 0, 0 ), true ) );
        check_no_ordinary_tracks( here, tracks_center );
    }

    SECTION( "pure vertical move" ) {
        reset_tracks_scene();
        map &here = get_map();
        here.ter_set( tracks_center, t_dirt );
        const tripoint_bub_ms above( tracks_center.x(), tracks_center.y(), 1 );
        here.ter_set( above, t_floor );
        here.build_map_cache( 1 );
        move_avatar_away_from( here );
        monster &animal = spawn_test_monster( test_animal_a.str(), tracks_center );
        REQUIRE( animal.move_to( above, true ) );
        check_no_ordinary_tracks( here, tracks_center );
    }
}
