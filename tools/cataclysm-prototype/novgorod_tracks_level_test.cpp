#include <string>
#include <vector>

#include "action.h"
#include "avatar.h"
#include "cata_catch.h"
#include "coordinates.h"
#include "effect.h"
#include "field.h"
#include "game.h"
#include "map.h"
#include "map_helpers.h"
#include "map_helpers_tests.h"
#include "mtype.h"
#include "monster.h"
#include "npc.h"
#include "player_helpers.h"
#include "type_id.h"
#include "units.h"

namespace
{
constexpr tripoint_bub_ms tracks_center( 66, 66, 0 );
const ter_str_id t_dirt( "t_dirt" );
const ter_str_id t_floor( "t_floor" );

std::vector<std::string> pause_action()
{
    return { action_ident( ACTION_PAUSE ) };
}

void reset_tracks_level_scene()
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
    avatar &you = get_avatar();
    you.set_pos_abs_only( here.get_abs( tracks_center ) );
    you.set_moves( 1000 );
    here.build_map_cache( 0 );
}

const field_entry *find_field( const map &here, const tripoint_bub_ms &where,
                               const std::string &id )
{
    const field &fields = here.field_at( where );
    for( const auto &entry : fields ) {
        if( entry.first.id().str() == id ) {
            return &entry.second;
        }
    }
    return nullptr;
}

void check_player_step( const tripoint_rel_ms &delta, const char *expected_human_direction,
                        bool bloody_feet = false )
{
    reset_tracks_level_scene();
    map &here = get_map();
    avatar &you = get_avatar();
    here.ter_set( tracks_center, t_dirt );
    REQUIRE( here.has_flag( "SOFT_GROUND", tracks_center ) );
    const tripoint_abs_ms old_abs = here.get_abs( tracks_center );
    const tripoint_bub_ms destination = tracks_center + delta;
    here.ter_set( destination, t_floor );
    here.clear_fields( tracks_center );
    here.build_map_cache( 0 );
    here.build_map_cache( destination.z() );
    if( bloody_feet ) {
        you.add_effect( efftype_id( "bloody_feet" ), 1_turns, true );
        REQUIRE( you.has_effect( efftype_id( "bloody_feet" ) ) );
    }

    const point_rel_sm shift = g->place_player( destination, true );
    ( void )shift;
    REQUIRE( you.pos_abs() == tripoint_abs_ms( old_abs.x() + delta.x(),
             old_abs.y() + delta.y(), old_abs.z() + delta.z() ) );

    const tripoint_bub_ms old_tile = here.get_bub( old_abs );
    for( const char *family : { "human", "bird", "animal" } ) {
        for( const char *direction : { "n", "w", "s", "e" } ) {
            const bool expected = std::string( family ) == "human" &&
                                  expected_human_direction != nullptr &&
                                  std::string( direction ) == expected_human_direction;
            const std::string id = std::string( "fd_" ) + family + "_footprint_" + direction;
            CHECK( ( find_field( here, old_tile, id ) != nullptr ) == expected );
        }
    }

    if( bloody_feet ) {
        for( const char *direction : { "n", "w", "s", "e" } ) {
            const bool expected = std::string( direction ) == "s";
            const std::string id = std::string( "fd_blood_footprint_" ) + direction;
            CHECK( ( find_field( here, old_tile, id ) != nullptr ) == expected );
        }
    }
}

void check_animal_step( const tripoint_rel_ms &delta, const char *expected_direction )
{
    reset_tracks_level_scene();
    map &here = get_map();
    here.ter_set( tracks_center, t_dirt );
    const tripoint_bub_ms destination = tracks_center + delta;
    here.ter_set( destination, t_floor );
    here.clear_fields( tracks_center );
    here.build_map_cache( 0 );
    here.build_map_cache( destination.z() );

    REQUIRE( here.inbounds( tracks_center ) );
    REQUIRE( here.has_floor( tracks_center ) );
    REQUIRE( here.has_flag( "SOFT_GROUND", tracks_center ) );
    REQUIRE( here.inbounds( destination ) );
    REQUIRE( here.has_floor( destination ) );

    avatar &you = get_avatar();
    you.set_pos_abs_only( here.get_abs( tracks_center + tripoint_rel_ms( 20, 20, 0 ) ) );
    monster &animal = spawn_test_monster( "mon_novgorod_tracks_animal_a", tracks_center );
    REQUIRE( animal.in_species( species_id( "MAMMAL" ) ) );
    REQUIRE_FALSE( animal.in_species( species_id( "HUMAN" ) ) );
    REQUIRE_FALSE( animal.in_species( species_id( "BIRD" ) ) );
    REQUIRE_FALSE( animal.has_flag( mon_flag_FLIES ) );

    const tripoint_abs_ms old_abs = animal.pos_abs();
    const tripoint_abs_ms expected_abs = here.get_abs( destination );
    CAPTURE( delta.x(), delta.y(), delta.z(), old_abs.x(), old_abs.y(), old_abs.z(),
             expected_abs.x(), expected_abs.y(), expected_abs.z() );
    REQUIRE( animal.move_to( destination, true ) );
    REQUIRE( animal.pos_abs() == expected_abs );

    const tripoint_bub_ms old_tile = here.get_bub( old_abs );
    REQUIRE( here.inbounds( old_tile ) );
    REQUIRE( here.has_floor( old_tile ) );
    REQUIRE( here.has_flag( "SOFT_GROUND", old_tile ) );
    for( const char *family : { "human", "bird", "animal" } ) {
        for( const char *direction : { "n", "w", "s", "e" } ) {
            const std::string id = std::string( "fd_" ) + family + "_footprint_" + direction;
            const bool expected = std::string( family ) == "animal" &&
                                  std::string( direction ) == expected_direction;
            CAPTURE( id, old_tile.x(), old_tile.y(), old_tile.z() );
            CHECK( ( find_field( here, old_tile, id ) != nullptr ) == expected );
        }
    }
}
}

TEST_CASE( "vertical movement keeps footprint direction on the horizontal projection",
           "[novgorod_tracks][novgorod_tracks_level]" )
{
    SECTION( "diagonal climb" ) {
        check_animal_step( tripoint_rel_ms( 1, -1, 1 ), "e" );
    }

    SECTION( "diagonal descent" ) {
        check_animal_step( tripoint_rel_ms( 1, 1, -1 ), "e" );
    }

    SECTION( "pure climb leaves no ordinary footprint" ) {
        check_player_step( tripoint_rel_ms( 0, 0, 1 ), nullptr );
    }

    SECTION( "pure descent leaves no ordinary footprint" ) {
        check_player_step( tripoint_rel_ms( 0, 0, -1 ), nullptr );
    }

    SECTION( "pure climb keeps the southern bloody footprint" ) {
        check_player_step( tripoint_rel_ms( 0, 0, 1 ), nullptr, true );
    }

    SECTION( "pure descent keeps the southern bloody footprint" ) {
        check_player_step( tripoint_rel_ms( 0, 0, -1 ), nullptr, true );
    }
}
