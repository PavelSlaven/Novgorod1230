#include "cata_catch.h"
#include "options.h"
#include "options_helpers.h"

TEST_CASE( "Novgorod autosave accepts one game hour", "[novgorod_autosave][option]" )
{
    const override_option enabled( "AUTOSAVE", "true" );
    const override_option turns( "AUTOSAVE_TURNS", "3600" );
    const override_option minutes( "AUTOSAVE_MINUTES", "5" );

    CHECK( get_option<bool>( "AUTOSAVE" ) );
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 3600 );
    CHECK( get_option<int>( "AUTOSAVE_MINUTES" ) == 5 );

    get_options().get_option( "AUTOSAVE_TURNS" ).setNext();
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 10 );
    get_options().get_option( "AUTOSAVE_TURNS" ).setPrev();
    CHECK( get_option<int>( "AUTOSAVE_TURNS" ) == 3600 );
}
