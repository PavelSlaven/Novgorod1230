// Narrow regression for legacy item::deserialize contents migration.

#include <cstdint>
#include <list>
#include <map>
#include <set>
#include <sstream>
#include <utility>
#include <vector>

#include "cata_catch.h"
#include "item.h"
#include "json.h"
#include "json_loader.h"
#include "type_id.h"

static const itype_id itype_backpack( "backpack" );
static const itype_id itype_rock( "rock" );
static const itype_id itype_glock_19( "glock_19" );
static const itype_id itype_barrel_glock_short( "barrel_glock_short" );
static const itype_id itype_test_load_bearing_vest( "test_load_bearing_vest" );
static const itype_id itype_holster( "holster" );
static const itype_id itype_9mm( "9mm" );
static const itype_id itype_battery( "battery" );

TEST_CASE( "nested_worn_container_item_uids_survive_json_roundtrip", "[novgorod_item_uid]" )
{
    item worn_container( itype_backpack );
    item nested_container( itype_backpack );
    item rock( itype_rock );

    ret_val<item *> nested = nested_container.get_contents().insert_item(
                                 rock, pocket_type::CONTAINER );
    REQUIRE( nested.success() );

    ret_val<item *> worn_contents = worn_container.get_contents().insert_item_preserving_identity(
                                        std::move( nested_container ), pocket_type::CONTAINER );
    REQUIRE( worn_contents.success() );
    const int64_t worn_uid = worn_container.uid().get_value();
    const int64_t nested_container_uid = worn_contents.value()->uid().get_value();
    const int64_t rock_uid = worn_contents.value()->get_contents().only_item().uid().get_value();

    // A worn container is serialized as an item in the player's worn array.
    std::ostringstream serialized;
    JsonOut json( serialized );
    worn_container.serialize( json );

    item loaded;
    JsonValue value = json_loader::from_string( serialized.str() );
    JsonObject object = value;
    loaded.deserialize( object );

    REQUIRE( loaded.get_contents().only_item().get_contents().only_item().uid().is_valid() );
    CHECK( loaded.uid().get_value() == worn_uid );
    CHECK( loaded.get_contents().only_item().uid().get_value() == nested_container_uid );
    CHECK( loaded.get_contents().only_item().get_contents().only_item().uid().get_value() == rock_uid );

    item ordinary_copy( loaded.get_contents().only_item().get_contents().only_item() );
    CHECK( ordinary_copy.uid().is_valid() );
    CHECK( ordinary_copy.uid().get_value() != rock_uid );
}

TEST_CASE( "legacy_mod_and_added_pocket_items_keep_uids", "[novgorod_item_uid]" )
{
    item gun( itype_glock_19 );
    item mod( itype_barrel_glock_short );
    REQUIRE( gun.is_gunmod_compatible( mod ).success() );
    REQUIRE( gun.put_in( mod, pocket_type::MOD ).success() );
    const int64_t mod_uid = gun.get_contents().get_pockets( []( const item_pocket &pocket ) {
        return pocket.is_type( pocket_type::MOD );
    } ).front()->all_items_top().front()->uid().get_value();

    std::ostringstream gun_serialized;
    JsonOut gun_json( gun_serialized );
    gun.serialize( gun_json );
    item loaded_gun;
    JsonValue gun_value = json_loader::from_string( gun_serialized.str() );
    JsonObject gun_object = gun_value;
    loaded_gun.deserialize( gun_object );
    const item_contents &loaded_gun_contents = loaded_gun.get_contents();
    const std::vector<const item_pocket *> mod_pockets = loaded_gun_contents.get_pockets(
                []( const item_pocket &pocket ) {
        return pocket.is_type( pocket_type::MOD );
    } );
    REQUIRE( !mod_pockets.empty() );
    REQUIRE( mod_pockets.front()->all_items_top().size() == 1 );
    CHECK( mod_pockets.front()->all_items_top().front()->uid().get_value() == mod_uid );

    item vest( itype_test_load_bearing_vest );
    vest.get_contents().add_pocket( item( itype_holster ) );
    std::vector<item_pocket *> vest_pockets = vest.get_contents().get_container_pockets();
    REQUIRE( !vest_pockets.empty() );
    item rock( itype_rock );
    REQUIRE( vest_pockets.back()->insert_item( rock ).success() );
    const int64_t rock_uid = vest_pockets.back()->all_items_top().front()->uid().get_value();

    std::ostringstream vest_serialized;
    JsonOut vest_json( vest_serialized );
    vest.serialize( vest_json );
    item loaded_vest;
    JsonValue vest_value = json_loader::from_string( vest_serialized.str() );
    JsonObject vest_object = vest_value;
    loaded_vest.deserialize( vest_object );
    const item_contents &loaded_vest_contents = loaded_vest.get_contents();
    const std::vector<const item_pocket *> loaded_vest_pockets = loaded_vest_contents.get_container_pockets();
    REQUIRE( !loaded_vest_pockets.empty() );
    const std::list<const item *> added_pocket_items = loaded_vest_pockets.back()->all_items_top();
    REQUIRE( added_pocket_items.size() == 1 );
    CHECK( added_pocket_items.front()->uid().get_value() == rock_uid );
}

TEST_CASE( "identity_transfer_keeps_charge_items_separate", "[novgorod_item_uid]" )
{
    item source( itype_backpack );
    item target( itype_backpack );
    item source_ammo( itype_9mm );
    source_ammo.charges = 2;
    item target_ammo( itype_9mm );
    target_ammo.charges = 5;

    source.get_contents().force_insert_item( source_ammo, pocket_type::CONTAINER );
    target.get_contents().force_insert_item( target_ammo, pocket_type::CONTAINER );
    const item_contents &source_contents = source.get_contents();
    const item_contents &target_contents = target.get_contents();
    const std::list<const item *> source_items =
        source_contents.get_container_pockets().front()->all_items_top();
    const std::list<const item *> target_items =
        target_contents.get_container_pockets().front()->all_items_top();
    const int64_t source_uid = source_items.front()->uid().get_value();
    const int64_t target_uid = target_items.front()->uid().get_value();
    REQUIRE( source_uid != target_uid );

    target.get_contents().combine_preserving_identity( std::move( source.get_contents() ), false, true, true );

    const item_contents &restored_contents = target.get_contents();
    const std::list<const item *> after = restored_contents.get_container_pockets().front()->all_items_top();
    REQUIRE( after.size() == 2 );
    std::set<int64_t> restored_uids;
    std::map<int64_t, int> restored_charges;
    int total_charges = 0;
    for( const item *restored : after ) {
        CHECK( restored_uids.insert( restored->uid().get_value() ).second );
        restored_charges[restored->uid().get_value()] = restored->charges;
        total_charges += restored->charges;
    }
    CHECK( restored_uids.find( source_uid ) != restored_uids.end() );
    CHECK( restored_uids.find( target_uid ) != restored_uids.end() );
    CHECK( total_charges == 7 );
    CHECK( restored_charges[target_uid] == 5 );
    CHECK( restored_charges[source_uid] == 2 );
}

TEST_CASE( "identity_transfer_migration_fallback_preserves_uid_charges_and_order", "[novgorod_item_uid]" )
{
    item source( itype_backpack );
    item target( itype_holster );
    item first_displaced( itype_9mm );
    first_displaced.charges = 4;
    item second_displaced( itype_battery );
    second_displaced.charges = 7;
    source.get_contents().force_insert_item( first_displaced, pocket_type::CONTAINER );
    source.get_contents().force_insert_item( second_displaced, pocket_type::CONTAINER );
    const item_contents &source_contents = source.get_contents();
    const std::list<const item *> source_items = source_contents.get_container_pockets().front()->all_items_top();
    REQUIRE( source_items.size() == 2 );
    const int64_t first_source_uid = source_items.front()->uid().get_value();
    const int64_t second_source_uid = source_items.back()->uid().get_value();
    REQUIRE( first_source_uid != second_source_uid );

    REQUIRE( !target.get_contents().get_container_pockets().empty() );
    target.get_contents().combine_preserving_identity( std::move( source.get_contents() ), false, true, true );

    const item_contents &target_contents = target.get_contents();
    const std::vector<const item_pocket *> migration_pockets = target_contents.get_pockets(
                []( const item_pocket &pocket ) {
        return pocket.is_type( pocket_type::MIGRATION );
    } );
    REQUIRE( migration_pockets.size() == 1 );
    const std::list<const item *> migrated = migration_pockets.front()->all_items_top();
    REQUIRE( migrated.size() == 2 );
    CHECK( migrated.front()->uid().get_value() == second_source_uid );
    CHECK( migrated.front()->charges == 7 );
    CHECK( migrated.back()->uid().get_value() == first_source_uid );
    CHECK( migrated.back()->charges == 4 );
}
