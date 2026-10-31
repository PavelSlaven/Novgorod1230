#include <algorithm>
#include <array>
#include <iomanip>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

#include "avatar.h"
#include "basecamp.h"
#include "calendar.h"
#include "cata_catch.h"
#include "cata_scope_helpers.h"
#include "city.h"
#include "clzones.h"
#include "coordinates.h"
#include "creature_tracker.h"
#include "do_turn.h"
#include "effect_on_condition.h"
#include "game.h"
#include "global_vars.h"
#include "item.h"
#include "itype.h"
#include "json.h"
#include "json_loader.h"
#include "map.h"
#include "mapbuffer.h"
#include "map_helpers.h"
#include "map_helpers_tests.h"
#include "map_scale_constants.h"
#include "npc.h"
#include "omdata.h"
#include "options.h"
#include "overmap.h"
#include "overmapbuffer.h"
#include "npc_arbitration.h"
#include "npc_sleep.h"
#include "player_activity.h"
#include "point.h"
#include "rng.h"
#include "scenario.h"
#include "string_id.h"
#include "type_id.h"
#include "units.h"
#include "weather.h"

namespace
{
const activity_id act_chop_planks( "ACT_CHOP_PLANKS" );
const activity_id act_multiple_chop_planks( "ACT_MULTIPLE_CHOP_PLANKS" );
const itype_id log_type( "log" );
const string_id<scenario> scenario_novgorod_dev_courtyard_scenario( "novgorod_dev_courtyard_scenario" );
const itype_id plank_type( "2x4" );
const itype_id splinter_type( "splinter" );
const itype_id fish_type( "dry_fish" );
const skill_id skill_fabrication( "fabrication" );
const faction_id household_faction( "novgorod_dev_master_household" );
const efftype_id effect_sleep( "sleep" );
const efftype_id effect_lying_down( "lying_down" );

struct yard_world {
    npc *master = nullptr;
    npc *watchman = nullptr;
    tripoint_abs_ms yard_low;
    tripoint_abs_ms yard_high;
    tripoint_abs_ms zone_low;
    tripoint_abs_ms zone_high;
    std::optional<tripoint_abs_ms> work;
    std::optional<tripoint_abs_ms> home;
    std::optional<tripoint_abs_ms> izba_low;
    std::optional<tripoint_abs_ms> izba_high;
    time_point start;
};

std::optional<tripoint_abs_ms> yard_place( const std::string &name )
{
    const diag_value *value = get_globals().maybe_get_global_value( name );
    if( value == nullptr || !value->is_tripoint() ) {
        return std::nullopt;
    }
    return value->tripoint();
}

bool in_izba( const yard_world &w, const tripoint_abs_ms &p )
{
    return w.izba_low && w.izba_high && p.z() == w.izba_low->z() &&
           w.izba_low->x() <= p.x() && p.x() <= w.izba_high->x() &&
           w.izba_low->y() <= p.y() && p.y() <= w.izba_high->y();
}

bool on_bed( const map &here, const tripoint_abs_ms &p )
{
    static const std::array<furn_str_id, 6> beds = {
        furn_str_id( "f_bed" ), furn_str_id( "f_bed_down" ),
        furn_str_id( "f_straw_bed" ), furn_str_id( "f_makeshift_bed" ),
        furn_str_id( "f_floor_mattress" ), furn_str_id( "f_down_mattress" )
    };
    const furn_id furniture = here.furn( here.get_bub( p ) );
    return std::any_of( beds.begin(), beds.end(), [&furniture]( const furn_str_id &bed ) {
        return furniture == bed.id();
    } );
}

int count_type( map &here, const tripoint_abs_ms &low, const tripoint_abs_ms &high,
                const itype_id &type )
{
    int total = 0;
    for( int x = low.x(); x <= high.x(); ++x ) {
        for( int y = low.y(); y <= high.y(); ++y ) {
            for( const item &it : here.i_at( here.get_bub( tripoint_abs_ms( x, y, low.z() ) ) ) ) {
                if( it.typeId() == type ) {
                    total += it.count();
                }
            }
        }
    }
    return total;
}

std::optional<basecamp *> yard_camp( const yard_world &w )
{
    return overmap_buffer.find_camp( project_to<coords::omt>( w.yard_low ).xy() );
}

int table_fish( map &here, const yard_world &w )
{
    const tripoint_abs_ms table( w.yard_low.x() + 10, w.yard_low.y() + 10, w.yard_low.z() );
    return count_type( here, table, table, fish_type );
}

bool backlog_has_chop( const npc &guy )
{
    return std::any_of( guy.backlog.begin(), guy.backlog.end(), []( const player_activity & queued ) {
        return queued.id() == act_chop_planks || queued.id() == act_multiple_chop_planks;
    } );
}

bool is_camp_resident( const npc &guy )
{
    return guy.mission == NPC_MISSION_CAMP_RESIDENT ||
           ( guy.mission == NPC_MISSION_ACTIVITY && guy.previous_mission == NPC_MISSION_CAMP_RESIDENT );
}

int zone_logs( map &here, const yard_world &w )
{
    return count_type( here, w.zone_low, w.zone_high, log_type );
}

int yard_planks( map &here, const yard_world &w )
{
    return count_type( here, w.yard_low, w.yard_high, plank_type );
}

std::string point_text( const yard_world &w, const tripoint_abs_ms &p )
{
    std::ostringstream out;
    out << '(' << p.x() - w.yard_low.x() << ',' << p.y() - w.yard_low.y() << ',' << p.z() << ')';
    return out.str();
}

std::string clock_text( const yard_world &w )
{
    const time_duration since_start = calendar::turn - w.start;
    const time_duration clock = time_past_midnight( calendar::turn );
    std::ostringstream out;
    out << 'd' << to_days<int>( since_start + 7_hours ) + 1 << ' ' << std::setfill( '0' )
        << std::setw( 2 ) << to_hours<int>( clock ) << ':' << std::setw( 2 )
        << to_minutes<int>( clock ) % 60 << ':' << std::setw( 2 ) << to_seconds<int>( clock ) % 60;
    return out.str();
}

std::string backlog_text( const npc &guy )
{
    std::ostringstream out;
    out << '[';
    bool first = true;
    for( const player_activity &queued : guy.backlog ) {
        out << ( first ? "" : "," ) << queued.id().str();
        first = false;
    }
    out << ']';
    return out.str();
}

std::string state_text( map &here, const yard_world &w )
{
    std::ostringstream out;
    out << clock_text( w ) << " pos=" << point_text( w, w.master->pos_abs() )
        << " act=" << w.master->activity.id().str() << " backlog=" << backlog_text( *w.master )
        << " logs=" << zone_logs( here, w ) << " 2x4=" << yard_planks( here, w );
    return out.str();
}

std::string trace_text( map &here, const yard_world &w )
{
    const std::optional<tripoint_abs_ms> guard = w.master->get_guard_post();
    std::ostringstream out;
    out << "TRACE " << state_text( here, w )
        << " sleep_state=" << w.master->in_sleep_state()
        << " sleep_effect=" << w.master->has_effect( effect_sleep )
        << " lying_down=" << w.master->has_effect( effect_lying_down )
        << " sleepiness=" << w.master->get_sleepiness()
        << " on_shift=" << w.master->is_on_shift()
        << " guard=" << ( guard ? point_text( w, *guard ) : std::string( "none" ) )
        << std::fixed << std::setprecision( 1 )
        << " air_out=" << units::to_celsius( get_weather().temperature )
        << " air_here=" << units::to_celsius( get_weather().get_temperature( w.master->pos_bub() ) )
        << " torso=" << units::to_celsius( w.master->get_part_temp_cur( bodypart_id( "torso" ) ) );
    return out.str();
}

std::string watch_text( const yard_world &w )
{
    if( !w.watchman ) {
        return "WATCH none";
    }
    const std::optional<tripoint_abs_ms> guard = w.watchman->get_guard_post();
    std::ostringstream out;
    out << "WATCH " << clock_text( w ) << " pos=" << point_text( w, w.watchman->pos_abs() )
        << " act=" << w.watchman->activity.id().str() << " on_shift=" << w.watchman->is_on_shift()
        << " guard=" << ( guard ? point_text( w, *guard ) : std::string( "none" ) );
    return out.str();
}

std::string rest_text( map &here, const yard_world &w )
{
    const npc &guy = *w.master;
    const std::optional<npc_challenger> challenger = guy.rest_interruption();
    const std::optional<tripoint_abs_ms> guard = guy.get_guard_post();
    std::ostringstream out;
    out << "REST " << state_text( here, w ) << " interruption="
        << ( challenger ? challenger->goal + "/" + std::to_string( challenger->selection ) +
             ( challenger->idle ? "/idle" : "" ) : std::string( "none" ) )
        << " phase=" << static_cast<int>( guy.get_sleep_session().phase )
        << " stalled=" << guy.sleep_stalled() << " on_hold=" << guy.sleep_on_hold()
        << " sleepiness=" << guy.get_sleepiness() << " thirst=" << guy.get_thirst()
        << " hunger=" << guy.get_hunger() << " kcal=" << guy.get_stored_kcal()
        << " on_shift=" << guy.is_on_shift() << " hostile=" << guy.sees_hostile_within( rest_watch_radius )
        << " guard=" << ( guard ? point_text( w, *guard ) : std::string( "none" ) );
    return out.str();
}

yard_world build_yard( const point_abs_om &overmap_point )
{
    clear_npcs();
    g->unique_npc_despawn( "novgorod_dev_master" );
    g->unique_npc_despawn( "novgorod_dev_watchman" );
    clear_zones();
    overmap_buffer.clear();
    MAPBUFFER.clear();
    get_map() = map();
    get_avatar().set_pos_abs_only( tripoint_abs_ms::zero );
    const std::vector<const overmap_special *> no_specials;
    overmap_special_batch origin_batch( point_abs_om(), no_specials );
    overmap_buffer.create_custom_overmap( point_abs_om(), origin_batch );
    g->place_player_overmap( tripoint_abs_omt() );
    overmap_buffer.clear();

    calendar::set_season_length( 91 );
    set_scenario( &scenario_novgorod_dev_courtyard_scenario.obj() );
    g->start_calendar();
    yard_world w;
    w.start = calendar::start_of_game;
    set_time( w.start );
    // Advancing the clock regenerates the origin overmap, which registers the unique courtyard special.
    overmap_buffer.clear();
    // The world has no bunker, so the upstream daily bunker event would log an error.
    get_globals().set_global_value( "balthazar_destroyed", 1.0 );

    overmap_special_batch empty_batch( overmap_point, no_specials );
    overmap_buffer.create_custom_overmap( overmap_point, empty_batch );
    overmap *om = overmap_buffer.get_existing( overmap_point );
    REQUIRE( om != nullptr );

    const overmap_special_id yard_id( "novgorod_dev_courtyard_special" );
    REQUIRE( yard_id.is_valid() );
    const overmap_special &yard = *yard_id;
    const tripoint_om_omt local_omt( OMAPX / 2, OMAPY / 2, 0 );
    for( int dx = -1; dx <= 1; ++dx ) {
        for( int dy = -1; dy <= 1; ++dy ) {
            om->ter_set( local_omt + tripoint_rel_omt( dx, dy, 0 ),
                         oter_str_id( "field" ).id() );
        }
    }
    const om_direction::type north = om_direction::type::north;
    REQUIRE( om->can_place_special( yard, local_omt, north, false ) );
    REQUIRE_FALSE( om->place_special( yard, local_omt, north, city(), false, false ).empty() );

    const tripoint_abs_omt yard_omt = om->global_base_point() +
                                       tripoint_rel_omt( OMAPX / 2, OMAPY / 2, 0 );
    map &here = get_map();
    const tripoint_abs_sm map_corner = project_to<coords::sm>( yard_omt ) -
                                        point_rel_sm( HALF_MAPSIZE, HALF_MAPSIZE );
    here.load( map_corner, false, false );
    get_avatar().move_to( here.get_abs( tripoint_bub_ms( HALF_MAPSIZE_X - 25,
                                HALF_MAPSIZE_Y - 25, 0 ) ) );
    g->load_npcs();

    for( npc &resident : g->all_npcs() ) {
        if( resident.get_unique_id() == "novgorod_dev_master" ) {
            w.master = &resident;
        } else if( resident.get_unique_id() == "novgorod_dev_watchman" ) {
            w.watchman = &resident;
        }
    }
    REQUIRE( w.master != nullptr );

    w.yard_low = project_to<coords::ms>( yard_omt );
    w.yard_high = w.yard_low + point( 23, 23 );
    w.work = yard_place( "novgorod_dev_master_Work" );
    w.home = yard_place( "novgorod_dev_master_Home" );
    w.izba_low = yard_place( "novgorod_dev_izba_min" );
    w.izba_high = yard_place( "novgorod_dev_izba_max" );
    REQUIRE( w.work.has_value() );
    REQUIRE( w.home.has_value() );

    const std::vector<zone_data> wood_zones = zone_manager::get_manager().get_zones(
                zone_type_id( "LOOT_WOOD" ), *w.work, w.master->get_fac_id() );
    REQUIRE( wood_zones.size() == 1 );
    const tripoint_abs_ms start_point = wood_zones.front().get_start_point();
    const tripoint_abs_ms end_point = wood_zones.front().get_end_point();
    w.zone_low = tripoint_abs_ms( std::min( start_point.x(), end_point.x() ),
                                  std::min( start_point.y(), end_point.y() ), start_point.z() );
    w.zone_high = tripoint_abs_ms( std::max( start_point.x(), end_point.x() ),
                                   std::max( start_point.y(), end_point.y() ), start_point.z() );

    effect_on_conditions::load_new_character( get_avatar() );
    return w;
}

void advance_turn( map &here, const yard_world &w )
{
    calendar::turn += 1_turns;
    get_weather().clear_temp_cache();
    get_weather().update_weather();
    effect_on_conditions::process_effect_on_conditions( get_avatar() );
    process_npc_turn( here, *w.master );
    if( w.watchman ) {
        process_npc_turn( here, *w.watchman );
    }
}
}

TEST_CASE( "novgorod_post_work_disabled_job_survives_load", "[novgorod_post_work]" )
{
    on_out_of_scope guard{ []()
    {
        set_scenario( scenario::generic() );
        g->start_calendar();
        calendar::start_of_game = calendar::turn_zero;
        calendar::start_of_cataclysm = calendar::turn_zero;
        calendar::turn = calendar::turn_zero;
    } };
    yard_world w = build_yard( point_abs_om( 127, 127 ) );
    npc &master = *w.master;
    master.job.set_task_priority( act_multiple_chop_planks, 0 );
    REQUIRE( master.job.get_priority_of_job( act_multiple_chop_planks ) == 0 );

    std::ostringstream saved;
    {
        JsonOut jsout( saved );
        master.serialize( jsout );
    }
    const JsonObject saved_data = json_loader::from_string( saved.str() ).get_object();
    saved_data.allow_omitted_members();
    REQUIRE( saved_data.get_string( "myclass" ) == "novgorod_dev_master_class" );
    npc fresh;
    fresh.deserialize( saved_data );
    CHECK( fresh.job.get_priority_of_job( act_multiple_chop_planks ) == 0 );
}

TEST_CASE( "novgorod_post_work_master_day_and_night", "[novgorod_post_work]" )
{
    on_out_of_scope guard{ []()
    {
        set_scenario( scenario::generic() );
        g->start_calendar();
        calendar::start_of_game = calendar::turn_zero;
        calendar::start_of_cataclysm = calendar::turn_zero;
        calendar::turn = calendar::turn_zero;
    } };
    yard_world w = build_yard( point_abs_om( 122, 122 ) );
    map &here = get_map();
    npc &master = *w.master;

    const time_point at_12 = w.start + 5_hours;
    const time_point at_19 = w.start + 12_hours;
    const time_point at_20 = w.start + 13_hours;
    const time_point next_05 = w.start + 22_hours;
    const time_point next_07 = w.start + 24_hours;

    const int logs_start = zone_logs( here, w );
    const int planks_start = yard_planks( here, w );
    REQUIRE( logs_start > 0 );
    std::cout << "TRACE yard_low=" << w.yard_low.x() << ',' << w.yard_low.y() << " zone_low="
              << point_text( w, w.zone_low ) << " zone_high=" << point_text( w, w.zone_high )
              << " logs_start=" << logs_start << " 2x4_start=" << planks_start
              << " master_kcal=" << master.get_stored_kcal() << " master_healthy="
              << master.get_healthy_kcal() << " master_fabrication="
              << master.get_skill_level( skill_fabrication ) << " watch_kcal="
              << ( w.watchman ? std::to_string( w.watchman->get_stored_kcal() ) : std::string( "none" ) )
              << " watch_healthy="
              << ( w.watchman ? std::to_string( w.watchman->get_healthy_kcal() ) : std::string( "none" ) )
              << " cataclysm_days="
              << to_days<int>( calendar::start_of_game - calendar::start_of_cataclysm ) << std::endl;

    const int fish_start = table_fish( here, w );
    REQUIRE( fish_start > 0 );
    int fish_at_19 = -1;
    int fish_at_05 = -1;
    int max_night_thirst = -1;
    std::string max_night_thirst_time;
    int max_shift_thirst = -1;
    std::string max_shift_thirst_time;
    int prev_thirst = master.get_thirst();
    int max_settled_thirst = -1;
    std::string max_settled_thirst_time;
    int max_watch_thirst = -1;
    std::string max_watch_thirst_time;
    int prev_watch_thirst = w.watchman ? w.watchman->get_thirst() : 0;
    // A calm NPC drinks only above NPC_THIRST_CONSUME (40, src/npcmove.cpp:240). Thirst read
    // before the turn can be up to 3 lower than at the decision, so a drop from 39 or lower
    // is cleared only by its intake: camp water (src/npcmove.cpp:5531) and terrain water
    // (:6647) put get_thirst() * 5 ml into the stomach at the decision. Food lowers thirst too.
    // A digestion tick moves the stomach water into the body in the same turn
    // (src/character_body.cpp:941-951), so the intake is hidden; a decision above 40 was then
    // possible only if thirst before the turn was at least 41 - G, G being the largest one-turn
    // thirst growth of this NPC in this run on turns without drinking or eating.
    enum class drink_kind { none, low, hidden };
    struct drink_trace {
        int thirst = 0;
        int water = 0;
        std::size_t seen = 0;
        int intake = 0;
        int max_growth = 0;
        std::vector<std::pair<int, std::string>> hidden;
    };
    const auto start_trace = []( const npc & who ) {
        drink_trace trace;
        trace.thirst = who.get_thirst();
        trace.water = units::to_milliliter( who.stomach.get_water() );
        trace.seen = who.consumption_history.size();
        return trace;
    };
    // The tick test of update_stomach (src/character_body.cpp:229) for the 10-second body
    // update of npc::npc_update_body.
    const auto digestion_tick = []() {
        const int now = to_turn<int>( calendar::turn );
        const int tick = to_turns<int>( 5_minutes );
        return calendar::once_every( 10_seconds ) &&
               now / tick - ( now - to_turns<int>( 10_seconds ) ) / tick > 0;
    };
    const auto classify_drink = [&digestion_tick]( const npc & who, drink_trace & trace ) {
        bool consumed = false;
        bool ate_food = false;
        auto it = who.consumption_history.begin();
        std::advance( it, std::min( trace.seen, who.consumption_history.size() ) );
        for( ; it != who.consumption_history.end(); ++it ) {
            const itype *eaten = item::find_type( it->type_id );
            consumed = true;
            ate_food = ate_food || !eaten->comestible || eaten->comestible->comesttype != "DRINK";
        }
        trace.seen = who.consumption_history.size();
        const int now = who.get_thirst();
        const int water = units::to_milliliter( who.stomach.get_water() );
        trace.intake = std::max( 0, water - trace.water );
        drink_kind kind = drink_kind::none;
        if( now < trace.thirst && trace.thirst <= 39 && !ate_food &&
            now + trace.intake / 5 <= 40 ) {
            kind = trace.intake == 0 && digestion_tick() ? drink_kind::hidden : drink_kind::low;
        }
        if( !consumed && trace.intake == 0 ) {
            trace.max_growth = std::max( trace.max_growth, now - trace.thirst );
        }
        trace.thirst = now;
        trace.water = water;
        return kind;
    };
    drink_trace master_drinks = start_trace( master );
    drink_trace watch_drinks = w.watchman ? start_trace( *w.watchman ) : drink_trace{};
    int low_thirst_drinks = 0;
    std::string first_low_thirst_drink;
    const auto note_drink = [&low_thirst_drinks, &first_low_thirst_drink]( const drink_kind kind,
    drink_trace & trace, const int before, const std::string & text ) {
        if( kind == drink_kind::hidden ) {
            trace.hidden.emplace_back( before, text );
        } else if( kind == drink_kind::low && low_thirst_drinks++ == 0 ) {
            first_low_thirst_drink = text;
        }
    };
    bool camp_found = false;
    bool camp_owner_ok = false;
    bool assigned_ok = false;
    bool resident_ok = false;
    std::string camp_state;

    int prev_planks = planks_start;
    bool chop_since_last_gain = false;
    bool chop_before_morning_gain = false;
    int logs_at_12 = logs_start;
    int planks_at_12 = planks_start;
    std::string state_at_12;

    std::optional<std::string> night_gain;
    std::optional<std::string> evening_chop;

    std::optional<std::string> bed_sleep;
    int bed_sleep_turns = 0;

    std::optional<std::string> resumed_chop;
    std::optional<std::string> resumed_gain;

    bool reloaded = false;
    bool reload_window = false;
    int fresh_priority = -1;
    std::string fresh_activity;
    std::string reload_state;
    int logs_at_reload = 0;
    int planks_at_reload = 0;
    int splinters_at_reload = 0;
    std::optional<std::string> reload_log_spent;
    bool reload_chop_resumed = false;
    bool reload_finished = false;
    bool reload_lost = false;

    std::string last_change;
    int change_lines = 0;
    std::string last_rest;
    int rest_lines = 0;

    while( calendar::turn < next_07 ) {
        advance_turn( here, w );
        const int planks = yard_planks( here, w );
        const int logs = zone_logs( here, w );
        const bool chopping = master.activity.id() == act_chop_planks;
        const bool gained = planks > prev_planks;

        if( calendar::once_every( 10_minutes ) ) {
            std::cout << trace_text( here, w ) << std::endl;
            std::cout << watch_text( w ) << std::endl;
        }
        std::ostringstream change;
        change << master.activity.id().str() << backlog_text( master ) << master.in_sleep_state()
               << master.has_effect( effect_sleep ) << master.has_effect( effect_lying_down );
        if( change.str() != last_change && change_lines < 3000 ) {
            last_change = change.str();
            ++change_lines;
            std::cout << "CHANGE " << trace_text( here, w ) << std::endl;
        }
        if( master.has_effect( effect_lying_down ) && !master.has_effect( effect_sleep ) &&
            rest_lines < 1500 ) {
            const std::string rest = rest_text( here, w );
            const std::string rest_key = rest.substr( rest.find( " interruption=" ) );
            if( rest_key != last_rest ) {
                last_rest = rest_key;
                ++rest_lines;
                std::cout << rest << std::endl;
            }
        }

        if( calendar::turn <= at_12 && gained && chop_since_last_gain ) {
            chop_before_morning_gain = true;
        }
        if( calendar::turn == at_12 ) {
            logs_at_12 = logs;
            planks_at_12 = planks;
            state_at_12 = state_text( here, w );
        }

        if( calendar::turn == at_19 ) {
            fish_at_19 = table_fish( here, w );
            const std::optional<basecamp *> camp = yard_camp( w );
            camp_found = camp.has_value();
            camp_owner_ok = camp_found && ( *camp )->get_owner() == household_faction;
            assigned_ok = camp_found && master.assigned_camp &&
                          *master.assigned_camp == ( *camp )->camp_omt_pos();
            resident_ok = is_camp_resident( master );
            std::ostringstream camp_out;
            camp_out << "camp=" << camp_found << " owner_ok=" << camp_owner_ok << " assigned="
                     << master.assigned_camp.has_value() << " mission=" << master.mission
                     << " previous_mission=" << master.previous_mission;
            camp_state = camp_out.str();
        }
        if( calendar::turn == next_05 ) {
            fish_at_05 = table_fish( here, w );
        }
        if( calendar::turn >= at_20 && calendar::turn < next_05 &&
            master.get_thirst() > max_night_thirst ) {
            max_night_thirst = master.get_thirst();
            max_night_thirst_time = clock_text( w );
        }
        if( ( calendar::turn < at_20 || calendar::turn >= next_05 ) &&
            master.get_thirst() > max_shift_thirst ) {
            max_shift_thirst = master.get_thirst();
            max_shift_thirst_time = clock_text( w );
        }
        if( master.get_thirst() < prev_thirst ) {
            std::cout << "DRINK " << clock_text( w ) << " thirst " << prev_thirst << "->"
                      << master.get_thirst() << std::endl;
        }
        const bool master_on_shift = calendar::turn < at_20 || calendar::turn >= next_05;
        const bool watch_on_shift = !master_on_shift;
        if( ( calendar::turn < at_20 || calendar::turn >= next_05 + 1_hours ) &&
            master.get_thirst() > max_settled_thirst ) {
            max_settled_thirst = master.get_thirst();
            max_settled_thirst_time = clock_text( w );
        }
        const drink_kind master_drink = classify_drink( master, master_drinks );
        if( master_on_shift && master_drink != drink_kind::none ) {
            note_drink( master_drink, master_drinks, prev_thirst,
                        "master " + clock_text( w ) + " thirst " + std::to_string( prev_thirst ) + "->" +
                        std::to_string( master.get_thirst() ) + " intake_ml=" +
                        std::to_string( master_drinks.intake ) );
        }
        prev_thirst = master.get_thirst();
        if( w.watchman ) {
            const int watch_thirst = w.watchman->get_thirst();
            if( calendar::turn >= at_20 + 1_hours && calendar::turn < next_05 &&
                watch_thirst > max_watch_thirst ) {
                max_watch_thirst = watch_thirst;
                max_watch_thirst_time = clock_text( w );
            }
            const drink_kind watch_drink = classify_drink( *w.watchman, watch_drinks );
            if( watch_on_shift && watch_drink != drink_kind::none ) {
                note_drink( watch_drink, watch_drinks, prev_watch_thirst,
                            "watchman " + clock_text( w ) + " thirst " +
                            std::to_string( prev_watch_thirst ) + "->" + std::to_string( watch_thirst ) +
                            " intake_ml=" + std::to_string( watch_drinks.intake ) );
            }
            prev_watch_thirst = watch_thirst;
        }

        if( calendar::turn >= at_19 && calendar::turn < next_05 && gained && !night_gain ) {
            night_gain = state_text( here, w );
        }
        if( calendar::turn >= at_19 && calendar::turn < at_20 &&
            ( master.activity.id() == act_chop_planks ||
              master.activity.id() == act_multiple_chop_planks ) && !evening_chop ) {
            evening_chop = state_text( here, w );
        }

        if( calendar::turn >= at_19 && in_izba( w, master.pos_abs() ) &&
            on_bed( here, master.pos_abs() ) && master.in_sleep_state() &&
            master.has_effect( effect_sleep ) ) {
            ++bed_sleep_turns;
            if( !bed_sleep ) {
                bed_sleep = state_text( here, w );
            }
        }

        if( calendar::turn >= next_05 ) {
            if( chopping && !resumed_chop ) {
                resumed_chop = state_text( here, w );
            }
            if( gained && !resumed_gain ) {
                resumed_gain = state_text( here, w );
            }
        }

        if( !reloaded && calendar::turn >= at_12 && calendar::turn < at_19 && chopping ) {
            reloaded = true;
            reload_state = state_text( here, w );
            std::ostringstream saved;
            {
                JsonOut jsout( saved );
                master.serialize( jsout );
            }
            npc fresh;
            fresh.deserialize( json_loader::from_string( saved.str() ).get_object() );
            fresh_priority = fresh.job.get_priority_of_job( act_multiple_chop_planks );
            fresh_activity = fresh.activity.id().str();
            master.setID( character_id(), true );
            master.deserialize( json_loader::from_string( saved.str() ).get_object() );
            logs_at_reload = zone_logs( here, w );
            planks_at_reload = yard_planks( here, w );
            splinters_at_reload = count_type( here, w.yard_low, w.yard_high, splinter_type );
            reload_window = true;
            std::cout << "RELOAD " << trace_text( here, w ) << " fresh_priority=" << fresh_priority
                      << " fresh_act=" << fresh_activity << std::endl;
        } else if( reload_window ) {
            const int splinters = count_type( here, w.yard_low, w.yard_high, splinter_type );
            if( planks > planks_at_reload || splinters > splinters_at_reload ) {
                reload_finished = true;
                reload_window = false;
                std::cout << "RELOAD_FINISH " << state_text( here, w )
                          << " planks_gain=" << planks - planks_at_reload
                          << " splinters_gain=" << splinters - splinters_at_reload << std::endl;
            } else if( chopping ) {
                reload_chop_resumed = true;
                if( logs < logs_at_reload && !reload_log_spent ) {
                    reload_log_spent = state_text( here, w );
                }
            } else if( !backlog_has_chop( master ) ) {
                reload_lost = true;
                reload_window = false;
            }
        }

        chop_since_last_gain = gained ? false : chop_since_last_gain || chopping;
        prev_planks = planks;
    }
    std::cout << trace_text( here, w ) << std::endl;
    std::cout << "TRACE fish_start=" << fish_start << " fish_at_19=" << fish_at_19 << " fish_at_05="
              << fish_at_05 << " max_night_thirst=" << max_night_thirst << " at "
              << max_night_thirst_time << " max_shift_thirst=" << max_shift_thirst << " at "
              << max_shift_thirst_time << " " << camp_state << std::endl;

    {
        INFO( "19:00 camp: " << camp_state );
        CHECK( camp_found );
    }
    {
        INFO( "19:00 camp: " << camp_state );
        CHECK( camp_owner_ok );
    }
    {
        INFO( "19:00 camp: " << camp_state );
        CHECK( assigned_ok );
    }
    {
        INFO( "19:00 camp: " << camp_state );
        CHECK( resident_ok );
    }
    {
        INFO( "dry_fish on the table: 07:00=" << fish_start << " 19:00=" << fish_at_19 << " 05:00="
              << fish_at_05 );
        CHECK( fish_at_05 < fish_at_19 );
    }
    {
        INFO( "max master thirst on shift from its second hour=" << max_settled_thirst << " at "
              << max_settled_thirst_time );
        CHECK( max_settled_thirst <= 60 );
    }
    {
        INFO( "max watchman thirst 21:00-05:00=" << max_watch_thirst << " at "
              << max_watch_thirst_time );
        CHECK( w.watchman != nullptr );
        CHECK( max_watch_thirst <= 60 );
    }
    {
        for( const drink_trace *trace : {
                 &master_drinks, &watch_drinks
             } ) {
            for( const std::pair<int, std::string> &drink : trace->hidden ) {
                if( drink.first + trace->max_growth > 40 ) {
                    std::cout << "TICK_DRINK_NOT_COUNTED " << drink.second << " G="
                              << trace->max_growth << std::endl;
                } else if( low_thirst_drinks++ == 0 ) {
                    first_low_thirst_drink = drink.second + " G=" + std::to_string( trace->max_growth );
                }
            }
        }
        INFO( "drinks on shift at thirst <= 40: " << low_thirst_drinks
              << "; first: " << first_low_thirst_drink );
        CHECK( low_thirst_drinks == 0 );
    }
    {
        INFO( "07:00 -> 12:00: " << state_at_12 << "; logs_start=" << logs_start );
        CHECK( logs_at_12 < logs_start );
    }
    {
        INFO( "07:00 -> 12:00: " << state_at_12 << "; 2x4_start=" << planks_start );
        CHECK( planks_at_12 > planks_start );
    }
    {
        INFO( "ACT_CHOP_PLANKS before the morning gain; " << state_at_12 );
        CHECK( chop_before_morning_gain );
    }
    {
        INFO( "first night gain: " << night_gain.value_or( "none" ) );
        CHECK_FALSE( night_gain.has_value() );
    }
    {
        INFO( "first chop activity 19:00-20:00: " << evening_chop.value_or( "none" ) );
        CHECK_FALSE( evening_chop.has_value() );
    }
    {
        INFO( "first sleep on bed: " << bed_sleep.value_or( "none" ) << "; turns=" << bed_sleep_turns
              << "; final " << state_text( here, w ) );
        CHECK( bed_sleep.has_value() );
    }
    {
        INFO( "first chop after 05:00: " << resumed_chop.value_or( "none" ) );
        CHECK( resumed_chop.has_value() );
    }
    {
        INFO( "first gain after 05:00: " << resumed_gain.value_or( "none" ) << "; final "
              << state_text( here, w ) );
        CHECK( resumed_gain.has_value() );
    }
    {
        INFO( "reload at: " << reload_state );
        REQUIRE( reloaded );
    }
    {
        INFO( "reload at: " << reload_state << "; restored copy act=" << fresh_activity );
        CHECK( fresh_priority > 0 );
    }
    {
        INFO( "reload at: " << reload_state << "; restored copy act=" << fresh_activity );
        CHECK( fresh_activity == act_chop_planks.str() );
    }
    {
        INFO( "reload at: " << reload_state );
        CHECK( reload_chop_resumed );
    }
    {
        INFO( "log spent after reload: " << reload_log_spent.value_or( "none" ) );
        CHECK_FALSE( reload_log_spent.has_value() );
    }
    {
        INFO( "reload at: " << reload_state << "; lost=" << reload_lost );
        CHECK( reload_finished );
    }
}

TEST_CASE( "novgorod_post_work_last_log_not_replaced", "[novgorod_post_work]" )
{
    on_out_of_scope guard{ []()
    {
        set_scenario( scenario::generic() );
        g->start_calendar();
        calendar::start_of_game = calendar::turn_zero;
        calendar::start_of_cataclysm = calendar::turn_zero;
        calendar::turn = calendar::turn_zero;
    } };
    yard_world w = build_yard( point_abs_om( 124, 124 ) );
    map &here = get_map();
    npc &master = *w.master;

    for( int x = w.zone_low.x(); x <= w.zone_high.x(); ++x ) {
        for( int y = w.zone_low.y(); y <= w.zone_high.y(); ++y ) {
            here.i_clear( here.get_bub( tripoint_abs_ms( x, y, w.zone_low.z() ) ) );
        }
    }
    here.add_item( here.get_bub( w.zone_low ), item( log_type, calendar::turn ) );
    REQUIRE( zone_logs( here, w ) == 1 );
    REQUIRE( count_type( here, w.yard_low, w.yard_high, log_type ) == 1 );

    const time_point finish = w.start + 5_hours;
    const int planks_start = yard_planks( here, w );
    int prev_planks = planks_start;
    bool chopped = false;
    std::optional<std::string> processed;
    std::optional<std::string> afterwards_chop;
    std::optional<std::string> afterwards_gain;

    while( calendar::turn < finish ) {
        advance_turn( here, w );
        const int planks = yard_planks( here, w );
        const bool chopping = master.activity.id() == act_chop_planks;
        if( calendar::once_every( 10_minutes ) ) {
            std::cout << trace_text( here, w ) << std::endl;
        }
        chopped |= chopping;
        if( !processed && planks > planks_start && zone_logs( here, w ) == 0 ) {
            processed = state_text( here, w );
        } else if( processed ) {
            if( chopping && !afterwards_chop ) {
                afterwards_chop = state_text( here, w );
            }
            if( planks > prev_planks && !afterwards_gain ) {
                afterwards_gain = state_text( here, w );
            }
        }
        prev_planks = planks;
    }
    std::cout << trace_text( here, w ) << std::endl;

    {
        INFO( "chopped=" << chopped << "; final " << state_text( here, w ) );
        CHECK( chopped );
    }
    {
        INFO( "single log processed: " << processed.value_or( "none" ) << "; final "
              << state_text( here, w ) );
        REQUIRE( processed.has_value() );
    }
    {
        INFO( "chop after the last log: " << afterwards_chop.value_or( "none" ) );
        CHECK_FALSE( afterwards_chop.has_value() );
    }
    {
        INFO( "planks gained after the last log: " << afterwards_gain.value_or( "none" ) );
        CHECK_FALSE( afterwards_gain.has_value() );
    }
}

TEST_CASE( "novgorod_post_work_scenario_start_date", "[novgorod_post_work]" )
{
    REQUIRE( get_option<int>( "SEASON_LENGTH" ) == 91 );
    REQUIRE( scenario_novgorod_dev_courtyard_scenario.is_valid() );
    CHECK( scenario_novgorod_dev_courtyard_scenario->start_of_game() == calendar::turn_zero + 151_days + 7_hours );
    CHECK( scenario_novgorod_dev_courtyard_scenario->start_of_cataclysm() ==
           scenario_novgorod_dev_courtyard_scenario->start_of_game() );
}

TEST_CASE( "novgorod_post_work_camp_residents", "[novgorod_post_work]" )
{
    on_out_of_scope guard{ []()
    {
        set_scenario( scenario::generic() );
        g->start_calendar();
        calendar::start_of_game = calendar::turn_zero;
        calendar::start_of_cataclysm = calendar::turn_zero;
        calendar::turn = calendar::turn_zero;
    } };
    yard_world w = build_yard( point_abs_om( 126, 126 ) );
    map &here = get_map();

    const std::optional<basecamp *> camp = yard_camp( w );
    REQUIRE( camp.has_value() );
    CHECK( ( *camp )->get_owner() == household_faction );

    std::vector<npc *> members = { w.master };
    if( w.watchman ) {
        members.push_back( w.watchman );
    }
    REQUIRE( members.size() == 2 );
    for( const npc *member : members ) {
        INFO( member->get_unique_id() << " mission=" << member->mission );
        REQUIRE( member->assigned_camp.has_value() );
        CHECK( *member->assigned_camp == ( *camp )->camp_omt_pos() );
        CHECK( member->mission == NPC_MISSION_CAMP_RESIDENT );
    }
    for( const npc *member : members ) {
        INFO( member->get_unique_id() << " stored_kcal=" << member->get_stored_kcal()
              << " healthy_kcal=" << member->get_healthy_kcal() );
        CHECK( member->get_stored_kcal() >= member->get_healthy_kcal() );
    }

    const int lowered = w.master->get_healthy_kcal() / 2;
    w.master->set_stored_kcal( lowered );

    const string_id<npc_template> foreign_template( "MILITIA_GUARD1" );
    REQUIRE( foreign_template.is_valid() );
    std::optional<tripoint_abs_ms> free_cell;
    for( int x = w.yard_low.x(); x <= w.yard_high.x() && !free_cell; ++x ) {
        for( int y = w.yard_low.y(); y <= w.yard_high.y() && !free_cell; ++y ) {
            const tripoint_bub_ms bub = here.get_bub( tripoint_abs_ms( x, y, w.yard_low.z() ) );
            if( here.passable( bub ) && here.furn( bub ) == furn_id( "f_null" ) &&
                here.i_at( bub ).empty() && get_creature_tracker().creature_at( bub ) == nullptr ) {
                free_cell = tripoint_abs_ms( x, y, w.yard_low.z() );
            }
        }
    }
    REQUIRE( free_cell.has_value() );
    const character_id foreign_id = here.place_npc( here.get_bub( *free_cell ).xy(),
                                    foreign_template );
    const shared_ptr_fast<npc> foreign = overmap_buffer.find_npc( foreign_id );
    REQUIRE( foreign );
    REQUIRE( foreign->get_fac_id() != household_faction );
    INFO( "foreign faction=" << foreign->get_fac_id().str() << " mission=" << foreign->mission );
    CHECK_FALSE( foreign->assigned_camp.has_value() );
    CHECK( foreign->mission != NPC_MISSION_CAMP_RESIDENT );
    {
        INFO( "master stored_kcal=" << w.master->get_stored_kcal() << " lowered=" << lowered );
        CHECK( w.master->get_stored_kcal() == lowered );
    }
    {
        INFO( "foreign stored_kcal=" << foreign->get_stored_kcal() << " healthy_kcal="
              << foreign->get_healthy_kcal() );
        CHECK( foreign->get_stored_kcal() >= foreign->get_healthy_kcal() );
    }
}
