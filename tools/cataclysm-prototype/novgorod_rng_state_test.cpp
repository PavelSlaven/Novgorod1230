// Native-owned RNG continuation checks for the opt-in P4 test world.

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include "cata_catch.h"
#include "debug.h"
#include "game.h"
#include "path_info.h"
#include "rng.h"
#include "worldfactory.h"

bool novgorod_p4_strict_load( const save_t &name );

static std::string novgorod_rng_env( const char *name )
{
    const char *value = std::getenv( name );
    return value == nullptr ? std::string() : std::string( value );
}

static std::filesystem::path novgorod_rng_state_path()
{
    return ( PATH_INFO::world_base_save_path() / "novgorod_rng_state" ).get_unrelative_path();
}

TEST_CASE( "Novgorod native RNG state round-trips without advancing", "[.][novgorod_rng_state]" )
{
    cata_default_random_engine &engine = rng_get_engine();
    const cata_default_random_engine before = engine;
    const std::string p4_mode = novgorod_rng_env( "NOVGOROD_P4_MODE" );
    const bool legacy_missing = novgorod_rng_env( "NOVGOROD_RNG_EXPECT_LEGACY" ) == "1";

    if( p4_mode == "apply" || p4_mode == "read" ) {
        const bool present = std::filesystem::exists( novgorod_rng_state_path() );
        REQUIRE( present == !legacy_missing );
        if( present ) {
            cata_default_random_engine continuation = engine;
            std::cout << "NOVGOROD_RNG_CONTINUATION:" << continuation() << '\n' << std::flush;
        }
    }

    cata_default_random_engine expected = before;
    const auto expected_next = expected();
    std::ostringstream saved;
    rng_serialize_engine( saved );

    engine.seed( 777 );
    std::istringstream first_read( saved.str() );
    REQUIRE( rng_unserialize_engine( first_read ) );
    CHECK( engine == before );

    std::istringstream repeated_read( saved.str() );
    REQUIRE( rng_unserialize_engine( repeated_read ) );
    CHECK( engine == before );
    cata_default_random_engine readback = engine;
    CHECK( readback() == expected_next );

    const cata_default_random_engine unchanged = engine;
    std::istringstream malformed( "not-an-engine\n" );
    CHECK_FALSE( rng_unserialize_engine( malformed ) );
    CHECK( engine == unchanged );

    std::istringstream trailing_garbage( saved.str() + "garbage\n" );
    CHECK_FALSE( rng_unserialize_engine( trailing_garbage ) );
    CHECK( engine == unchanged );

    engine = before;
}

TEST_CASE( "Novgorod native RNG sidecar write failure fails save", "[.][novgorod_rng_state]" )
{
    if( novgorod_rng_env( "NOVGOROD_RNG_TEST_SAVE_FAILURE" ) != "1" ) {
        SUCCEED( "Set NOVGOROD_RNG_TEST_SAVE_FAILURE=1 to exercise the isolated save failure." );
        return;
    }

    const std::filesystem::path sidecar = novgorod_rng_state_path();
    REQUIRE( ( std::filesystem::remove( sidecar ) || !std::filesystem::exists( sidecar ) ) );
    REQUIRE( std::filesystem::create_directory( sidecar ) );
    bool saved = true;
    const std::string captured = capture_debugmsg_during( [&]() {
        saved = g->save();
    } );
    debug_reset_error_observed();
    CHECK_FALSE( saved );
    CHECK_THAT( captured, Catch::Matchers::Contains( "game not saved: could not save native RNG state" ) );
    CHECK( std::filesystem::remove( sidecar ) );
}

TEST_CASE( "Novgorod native load rejects malformed RNG sidecar", "[.][novgorod_rng_state]" )
{
    if( novgorod_rng_env( "NOVGOROD_RNG_TEST_MALFORMED_LOAD" ) != "1" ) {
        SUCCEED( "Set NOVGOROD_RNG_TEST_MALFORMED_LOAD=1 to exercise strict native reload." );
        return;
    }

    REQUIRE( world_generator != nullptr );
    REQUIRE( world_generator->active_world != nullptr );
    REQUIRE_FALSE( world_generator->active_world->world_saves.empty() );
    std::ofstream malformed( novgorod_rng_state_path(), std::ios::trunc );
    REQUIRE( malformed.good() );
    malformed << "123 trailing-garbage\n";
    malformed.close();
    REQUIRE( malformed.good() );
    bool loaded = true;
    const std::string captured = capture_debugmsg_during( [&]() {
        loaded = novgorod_p4_strict_load( world_generator->active_world->world_saves.front() );
    } );
    debug_reset_error_observed();
    CHECK_FALSE( loaded );
    CHECK_THAT( captured, Catch::Matchers::Contains( "could not restore native RNG state" ) );
}

TEST_CASE( "Novgorod native load accepts a legacy save without RNG sidecar", "[.][novgorod_rng_state]" )
{
    if( novgorod_rng_env( "NOVGOROD_RNG_TEST_LEGACY_LOAD" ) != "1" ) {
        SUCCEED( "Set NOVGOROD_RNG_TEST_LEGACY_LOAD=1 to exercise legacy save loading." );
        return;
    }

    REQUIRE( world_generator != nullptr );
    REQUIRE( world_generator->active_world != nullptr );
    REQUIRE_FALSE( world_generator->active_world->world_saves.empty() );
    const std::filesystem::path sidecar = novgorod_rng_state_path();
    REQUIRE( std::filesystem::remove( sidecar ) );
    bool loaded = false;
    const std::string captured = capture_debugmsg_during( [&]() {
        loaded = novgorod_p4_strict_load( world_generator->active_world->world_saves.front() );
    } );
    CHECK( loaded );
    CHECK( captured.empty() );
    CHECK_FALSE( std::filesystem::exists( sidecar ) );
}
