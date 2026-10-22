#include "novgorod_semantic.h"

#include <algorithm>
#include <chrono>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#ifndef _WIN32
#include <cerrno>
#include <fcntl.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#endif

#include "action.h"
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "cached_options.h"
#include "character.h"
#include "display.h"
#include "effect.h"
#include "field.h"
#include "game.h"
#include "game_constants.h"
#include "item.h"
#include "itype.h"
#include "input.h"
#include "mapdata.h"
#include "translations.h"
#include "item_location.h"
#include "json.h"
#include "json_loader.h"
#include "lightmap.h"
#include "map.h"
#include "map_scale_constants.h"
#include "messages.h"
#include "npc.h"
#include "npc_class.h"
#include "npctalk.h"
#include "output.h"
#include "popup.h"
#include "sounds.h"
#include "string_input_popup.h"
#include "ui_manager.h"
#include "weather.h"
#include "weather_type.h"

static const efftype_id effect_bandaged( "bandaged" );
static const efftype_id effect_bite( "bite" );
static const efftype_id effect_bleed( "bleed" );

namespace novgorod_semantic
{
namespace
{
std::vector<int> position_of( const tripoint_bub_ms &p )
{
    return { p.x(), p.y(), p.z() };
}

std::string p3_target_ref( const tripoint_bub_ms &p )
{
    return std::to_string( p.x() ) + "," + std::to_string( p.y() ) + "," +
           std::to_string( p.z() );
}

const std::string memory_key = "novgorod_conversation_memory";

struct memory_record {
    std::string kind;
    std::string speaker_ref;
    std::string listener_ref;
    std::string text;
    int turn = 0;
};

std::vector<memory_record> read_memory( const Creature &guy )
{
    std::vector<memory_record> records;
    const diag_value *stored = guy.maybe_get_value( memory_key );
    if( stored == nullptr ) {
        return records;
    }
    const JsonValue parsed = json_loader::from_string( stored->str() );
    for( const JsonObject record : parsed.get_array() ) {
        record.allow_omitted_members();
        records.push_back( { record.get_string( "kind" ), record.get_string( "speaker_ref" ),
                             record.get_string( "listener_ref" ), record.get_string( "text" ),
                             record.get_int( "turn" ) } );
    }
    return records;
}

void write_memory( JsonOut &out, const std::vector<memory_record> &records )
{
    out.start_array();
    for( const memory_record &record : records ) {
        out.start_object();
        out.member( "kind", record.kind );
        out.member( "speaker_ref", record.speaker_ref );
        out.member( "listener_ref", record.listener_ref );
        out.member( "text", record.text );
        out.member( "turn", record.turn );
        out.end_object();
    }
    out.end_array();
}

void append_memory( Creature &guy, const memory_record &record )
{
    std::vector<memory_record> records = read_memory( guy );
    records.push_back( record );
    std::ostringstream stream;
    JsonOut out( stream );
    write_memory( out, records );
    guy.set_value( memory_key, stream.str() );
}

struct frame_item {
    const item *it;
    std::string placement;
    std::optional<tripoint_bub_ms> position;
};

void add_item_with_contents( std::vector<frame_item> &items, const item &it,
                             const std::string &placement )
{
    items.push_back( { &it, placement, std::nullopt } );
    for( const item *inner : it.all_items_top() ) {
        items.push_back( { inner, "carried", std::nullopt } );
    }
}

std::vector<frame_item> npc_visible_items( const npc &guy, map &here )
{
    std::vector<frame_item> items;
    if( const item *wielded = guy.get_wielded_item().get_item() ) {
        add_item_with_contents( items, *wielded, "wielded" );
    }
    std::vector<const item *> worn_items;
    guy.worn.inv_dump( worn_items );
    for( const item *worn_item : worn_items ) {
        add_item_with_contents( items, *worn_item, "worn" );
    }
    std::vector<frame_item> ground;
    for( const tripoint_bub_ms &pos : here.points_in_radius( guy.pos_bub(), MAX_VIEW_DISTANCE ) ) {
        if( !here.inbounds( pos ) || !here.sees_some_items( pos, guy ) || !guy.sees( here, pos ) ) {
            continue;
        }
        for( const item &it : here.i_at( pos ) ) {
            ground.push_back( { &it, "ground", pos } );
        }
    }
    std::sort( ground.begin(), ground.end(), []( const frame_item &a, const frame_item &b ) {
        return a.it->uid().get_value() < b.it->uid().get_value();
    } );
    items.insert( items.end(), ground.begin(), ground.end() );
    return items;
}

struct frame_world_feature {
    std::string kind;
    std::string type;
    std::string label;
    tripoint_bub_ms position;
    tripoint_abs_ms absolute_position;
};

std::vector<frame_world_feature> npc_visible_world_features( const npc &guy, map &here )
{
    std::vector<frame_world_feature> features;
    std::set<std::string> represented_terrain;
    for( const tripoint_bub_ms &pos : closest_points_first( guy.pos_bub(), MAX_VIEW_DISTANCE ) ) {
        if( !here.inbounds( pos ) ) {
            continue;
        }
        const bool has_furniture = here.has_furn( pos );
        const std::string terrain_type = here.ter( pos ).id().str();
        const bool needs_terrain = represented_terrain.find( terrain_type ) == represented_terrain.end();
        if( !has_furniture && !needs_terrain ) {
            continue;
        }
        if( !guy.sees( here, pos ) ) {
            continue;
        }
        const tripoint_abs_ms absolute_position = here.get_abs( pos );
        if( has_furniture ) {
            features.push_back( { "furniture", here.furn( pos ).id().str(), here.furnname( pos ),
                                  pos, absolute_position } );
        }
        if( needs_terrain ) {
            features.push_back( { "terrain", terrain_type, here.tername( pos ),
                                  pos, absolute_position } );
            represented_terrain.insert( terrain_type );
        }
    }
    return features;
}

void write_frame_item( JsonOut &out, const frame_item &entry )
{
    out.start_object();
    out.member( "item_ref", "item:" + std::to_string( entry.it->uid().get_value() ) );
    out.member( "item_uid", std::to_string( entry.it->uid().get_value() ) );
    out.member( "type", entry.it->typeId().str() );
    out.member( "label", entry.it->type_name() );
    out.member( "placement", entry.placement );
    out.member( "position" );
    if( entry.position ) {
        out.write( position_of( *entry.position ) );
    } else {
        out.write_null();
    }
    out.member( "owner_faction_id", entry.it->get_owner().is_null() ? "" : entry.it->get_owner().str() );
    out.end_object();
}

void write_item_label( JsonOut &out, const item &it )
{
    out.start_object();
    out.member( "item_uid", std::to_string( it.uid().get_value() ) );
    out.member( "label", it.type_name() );
    out.end_object();
}

void write_appearance( JsonOut &out, const Character &who )
{
    out.member( "appearance" );
    out.start_object();
    out.member( "worn_items" );
    out.start_array();
    for( const item_location &worn : who.get_visible_worn_items() ) {
        write_item_label( out, *worn );
    }
    out.end_array();
    out.member( "wielded_item" );
    if( who.is_armed() ) {
        write_item_label( out, *who.get_wielded_item() );
    } else {
        out.write_null();
    }
    const std::vector<bodypart_id> parts = who.get_all_body_parts();
    out.member( "wet", std::any_of( parts.begin(), parts.end(), [&who]( const bodypart_id & bp ) {
        return who.get_part_wetness( bp ) > 0;
    } ) );
    out.member( "sex_label", who.male ? _( "Male" ) : _( "Female" ) );
    out.member( "visible_wounds" );
    out.start_array();
    for( const effect &eff : who.get_effects() ) {
        const efftype_id &id = eff.get_id();
        if( id != effect_bleed && id != effect_bite && id != effect_bandaged ) {
            continue;
        }
        const std::string label = eff.disp_name();
        if( label.empty() ) {
            continue;
        }
        out.start_object();
        out.member( "body_part_id", eff.get_bp().id().str() );
        out.member( "label", label );
        out.end_object();
    }
    out.end_array();
    out.end_object();
}

void write_environment( JsonOut &out, const tripoint_bub_ms &pos, map &here )
{
    out.member( "environment" );
    out.start_object();
    out.member( "hour", hour_of_day<int>( calendar::turn ) );
    out.member( "is_night", is_night( calendar::turn ) );
    out.member( "time_label", display::time_approx() );
    out.member( "light_label", get_light_level( std::max( 1.0,
                LIGHT_AMBIENT_LIT - here.ambient_light_at( pos ) + 1.0 ) ).first );
    out.member( "weather_label", get_weather().weather_id->name.translated() );
    out.end_object();
}

void write_npc_physical_projections( JsonOut &out, const avatar &observer, map &here )
{
    out.member( "npc_projections" );
    out.start_array();
    for( const npc &guy : g->all_npcs() ) {
        if( !observer.sees( here, static_cast<const Creature &>( guy ) ) ) {
            continue;
        }
        out.start_object();
        out.member( "actor_id", std::to_string( guy.getID().get_value() ) );
        out.member( "name", guy.get_name() );
        out.member( "template_id", guy.idz.str() );
        out.member( "gender", guy.male ? "male" : "female" );
        out.member( "personality" );
        out.start_object();
        out.member( "aggression", static_cast<int>( guy.personality.aggression ) );
        out.member( "bravery", static_cast<int>( guy.personality.bravery ) );
        out.member( "collector", static_cast<int>( guy.personality.collector ) );
        out.member( "altruism", static_cast<int>( guy.personality.altruism ) );
        out.end_object();
        out.member( "faction_id", guy.get_fac_id().is_null() ? "" : guy.get_fac_id().str() );
        out.member( "opinion_of_avatar" );
        out.start_object();
        out.member( "trust", guy.op_of_u.trust );
        out.member( "fear", guy.op_of_u.fear );
        out.member( "value", guy.op_of_u.value );
        out.member( "anger", guy.op_of_u.anger );
        out.end_object();
        out.member( "conversation_memory" );
        write_memory( out, read_memory( guy ) );
        out.member( "position", position_of( guy.pos_bub() ) );
        out.member( "native_turn", to_turn<int>( calendar::turn ) );
        out.member( "activity_id", guy.activity.id().str() );
        out.member( "activity_moves_left", guy.activity.moves_left );
        const std::string job_description = guy.myclass.is_valid()
                                            ? guy.myclass->get_job_description() : std::string();
        if( !job_description.empty() ) {
            out.member( "job_description", job_description );
        }
        out.member( "visible_actors" );
        out.start_array();
        if( guy.sees( here, static_cast<const Creature &>( observer ) ) ) {
            out.start_object();
            out.member( "actor_id", std::to_string( observer.getID().get_value() ) );
            out.member( "position", position_of( observer.pos_bub() ) );
            write_appearance( out, observer );
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
        for( const frame_item &entry : npc_visible_items( guy, here ) ) {
            write_frame_item( out, entry );
        }
        out.end_array();
        out.member( "visible_world_features" );
        out.start_array();
        for( const frame_world_feature &feature : npc_visible_world_features( guy, here ) ) {
            out.start_object();
            out.member( "kind", feature.kind );
            out.member( "type", feature.type );
            out.member( "label", feature.label );
            out.member( "target_ref", p3_target_ref( feature.position ) );
            out.member( "position", position_of( feature.position ) );
            out.member( "absolute_position", std::vector<int> { feature.absolute_position.x(),
                        feature.absolute_position.y(), feature.absolute_position.z() } );
            out.end_object();
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

} // namespace

void write_observation( JsonOut &out )
{
    avatar &you = get_avatar();
    map &here = get_map();
    here.update_visibility_cache( you.posz() );
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
        if( !you.sees( here, static_cast<const Creature &>( guy ) ) ) {
            continue;
        }
        out.start_object();
        out.member( "actor_ref", "npc:" + std::to_string( guy.getID().get_value() ) );
        out.member( "visible", true );
        out.member( "actor_id", std::to_string( guy.getID().get_value() ) );
        out.member( "name", guy.get_name() );
        out.member( "position", position_of( guy.pos_bub() ) );
        out.end_object();
    }
    out.end_array();
    write_environment( out, you.pos_bub(), here );
    write_npc_physical_projections( out, you, here );
    out.member( "items" );
    out.start_array();
    for( const item *it : you.items_with( []( const item & ) { return true; } ) ) {
        out.start_object();
        out.member( "item_ref", "item:" + std::to_string( it->uid().get_value() ) );
        out.member( "item_uid", std::to_string( it->uid().get_value() ) );
        out.member( "type", it->typeId().str() );
        out.member( "label", it->type_name() );
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
            out.member( "label", it.type_name() );
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
    out.end_object();
}

namespace
{
struct local_fact {
    tripoint_bub_ms position;
    time_point time;
    int moves;
    std::string activity;
    int activity_moves_left;
};

local_fact current_fact()
{
    const avatar &you = get_avatar();
    return { you.pos_bub(), calendar::turn, you.get_moves(), you.activity.id().str(),
             you.activity.moves_left };
}

void write_fact( JsonOut &out, const local_fact &fact )
{
    out.start_object();
    out.member( "position", position_of( fact.position ) );
    out.member( "turn", to_turn<int>( fact.time ) );
    out.member( "moves", fact.moves );
    out.member( "activity", fact.activity );
    out.member( "activity_moves_left", fact.activity_moves_left );
    out.member( "clock" );
    out.start_object();
    out.member( "native_turn", to_turn<int>( fact.time ) );
    out.member( "seconds_since_world_start", to_seconds<int64_t>( fact.time - calendar::turn_zero ) );
    out.end_object();
    out.end_object();
}

struct operation_evidence {
    std::string id;
    std::string primitive;
    std::string actor_id;
    local_fact before;
    tripoint_bub_ms target;
    std::string terrain;
    std::string furniture;
    int64_t item_uid = 0;
    std::string item_type;
    int charges = 0;
    bool active = false;
    std::string local_map_before;
    std::string utterance;
    std::string sound_description;
    std::string contribution_kind;
    std::string visible_behavior;
    std::string speaker_ref;
    std::vector<std::string> addressees;
    bool npc_speaker = false;
    int sound_volume = 0;
    tripoint_bub_ms speaker_position;
    std::vector<std::string> heard;
    std::string refusal;
};

std::optional<operation_evidence> evidence;

const item *carried_item( int64_t uid )
{
    for( const item *it : get_avatar().items_with( []( const item & ) { return true; } ) ) {
        if( it->uid().get_value() == uid ) {
            return it;
        }
    }
    return nullptr;
}

std::string local_map_fact( const tripoint_bub_ms &center )
{
    map &here = get_map();
    std::ostringstream out;
    for( const tripoint_bub_ms &pos : here.points_in_radius( center, 1 ) ) {
        out << pos.x() << ',' << pos.y() << ',' << pos.z() << ':'
            << here.ter( pos ).id().str() << ':' << here.furn( pos ).id().str();
        for( const auto &entry : here.field_at( pos ) ) {
            out << ':' << entry.first.id().str() << '=' << entry.second.get_field_intensity();
        }
        for( const item &it : here.i_at( pos ) ) {
            out << ':' << it.uid().get_value() << '=' << it.typeId().str() << '=' << it.charges;
        }
        out << ';';
    }
    return out.str();
}

std::string move_action( int x, int y )
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

tripoint_rel_ms request_direction( const JsonObject &args )
{
    const std::vector<int> direction = args.has_member( "direction" ) ?
                                       args.get_int_array( "direction" ) : args.get_int_array( "target_direction" );
    if( direction.size() != 2 || direction[0] < -1 || direction[0] > 1 ||
        direction[1] < -1 || direction[1] > 1 || ( direction[0] == 0 && direction[1] == 0 ) ) {
        throw std::runtime_error( "NOVGOROD_INVALID_MOVE_DIRECTION" );
    }
    return tripoint_rel_ms( direction[0], direction[1], 0 );
}

npc &visible_npc_by_id( const std::string &actor_id )
{
    for( Creature *candidate : chat_available_creatures() ) {
        npc *guy = candidate->as_npc();
        if( guy && std::to_string( guy->getID().get_value() ) == actor_id ) {
            return *guy;
        }
    }
    throw std::runtime_error( "NOVGOROD_STALE_OR_INVISIBLE_NPC_ACTOR" );
}

std::vector<std::string> read_addressees( const JsonObject &request, const std::string &avatar_id )
{
    const char *invalid = "NOVGOROD_SPEECH_ADDRESSEE_INVALID";
    std::vector<std::string> refs;
    if( !request.has_member( "references" ) ) {
        return refs;
    }
    const JsonObject references = request.get_object( "references" );
    references.allow_omitted_members();
    if( !references.has_member( "actors" ) ) {
        return refs;
    }
    JsonValue actors = references.get_member( "actors" );
    if( !actors.test_array() ) {
        throw std::runtime_error( invalid );
    }
    avatar &you = get_avatar();
    map &here = get_map();
    for( JsonValue entry : actors.get_array() ) {
        std::string ref;
        std::optional<std::string> declared_id;
        if( entry.test_string() ) {
            ref = entry.get_string();
        } else if( entry.test_object() ) {
            const JsonObject described = entry.get_object();
            described.allow_omitted_members();
            if( !described.has_string( "ref" ) ) {
                throw std::runtime_error( invalid );
            }
            ref = described.get_string( "ref" );
            if( described.has_member( "id" ) ) {
                if( !described.has_string( "id" ) ) {
                    throw std::runtime_error( invalid );
                }
                declared_id = described.get_string( "id" );
            }
        } else {
            throw std::runtime_error( invalid );
        }
        std::string id;
        if( ref == "avatar" ) {
            id = avatar_id;
        } else if( ref.rfind( "npc:", 0 ) == 0 ) {
            id = ref.substr( 4 );
            bool visible = false;
            for( const npc &guy : g->all_npcs() ) {
                visible = visible || ( std::to_string( guy.getID().get_value() ) == id &&
                                       you.sees( here, static_cast<const Creature &>( guy ) ) );
            }
            if( !visible ) {
                throw std::runtime_error( invalid );
            }
        } else {
            throw std::runtime_error( invalid );
        }
        if( ( declared_id && *declared_id != id ) ||
            std::find( refs.begin(), refs.end(), ref ) != refs.end() ) {
            throw std::runtime_error( invalid );
        }
        refs.push_back( ref );
    }
    return refs;
}

std::string reference_id( const JsonObject &request, const std::string &kind,
                          const std::string &ref_prefix, const char *mismatch )
{
    const JsonObject references = request.get_object( "references" );
    references.allow_omitted_members();
    const JsonObject reference = references.get_object( kind );
    const std::string id = reference.get_string( "id" );
    if( reference.get_string( "ref" ) != ref_prefix + id ) {
        throw std::runtime_error( mismatch );
    }
    return id;
}

void check_target( const JsonObject &request, const tripoint_bub_ms &target )
{
    if( !get_avatar().sees( get_map(), target ) ) {
        throw std::runtime_error( "NOVGOROD_TARGET_NOT_OBSERVED" );
    }
    const char *mismatch = "NOVGOROD_TARGET_REFERENCE_MISMATCH";
    if( reference_id( request, "targets", "", mismatch ) != p3_target_ref( target ) ) {
        throw std::runtime_error( mismatch );
    }
}
} // namespace

operation_result apply_operation( const JsonObject &request )
{
    request.allow_omitted_members();
    if( evidence ) {
        throw std::logic_error( "NOVGOROD_NATIVE_OPERATION_ALREADY_ACTIVE" );
    }
    avatar &you = get_avatar();
    map &here = get_map();
    here.update_visibility_cache( you.posz() );
    operation_evidence next;
    next.before = current_fact();
    next.target = you.pos_bub();
    evidence = next;
    try {
        operation_evidence &op = *evidence;
        op.id = request.get_string( "operation_id" );
        op.primitive = request.get_string( "primitive" );
        op.actor_id = request.get_string( "actor_id" );
        const std::string avatar_id = std::to_string( you.getID().get_value() );
        if( request.get_string( "schema" ) != "p3_native_operation_request_v1" || op.id.empty() ) {
            throw std::runtime_error( "NOVGOROD_INVALID_OPERATION_REQUEST" );
        }
        const JsonObject expected = request.get_object( "expected_native_observation" );
        expected.allow_omitted_members();
        if( expected.get_string( "actor_id" ) != op.actor_id ) {
            throw std::runtime_error( "NOVGOROD_STALE_ACTOR_ID" );
        }
        const JsonValue revision = expected.has_member( "turn" ) ?
                                   expected.get_member( "turn" ) : expected.get_member( "revision" );
        const int expected_turn = revision.test_int() ? revision.get_int() : std::stoi( revision.get_string() );
        if( expected_turn != to_turn<int>( calendar::turn ) ) {
            throw std::runtime_error( "NOVGOROD_STALE_NATIVE_OBSERVATION" );
        }
        const JsonObject args = request.get_object( "args" );
        if( op.primitive != "speak" && op.actor_id != avatar_id ) {
            throw std::runtime_error( "NOVGOROD_AVATAR_ACTOR_REQUIRED" );
        }
        std::vector<std::string> actions;
        if( op.primitive == "move" || op.primitive == "open" ) {
            const tripoint_rel_ms direction = request_direction( args );
            op.target = you.pos_bub() + direction;
            if( !you.sees( here, op.target ) ) {
                throw std::runtime_error( "NOVGOROD_TARGET_NOT_OBSERVED" );
            }
            op.terrain = here.ter( op.target ).id().str();
            op.furniture = here.furn( op.target ).id().str();
            if( op.primitive == "move" ) {
                actions.push_back( move_action( direction.x(), direction.y() ) );
            } else {
                check_target( request, op.target );
                if( !here.open_door( you, op.target, !here.is_outside( op.target ), true ) ) {
                    throw std::runtime_error( "NOVGOROD_TARGET_NOT_OPENABLE" );
                }
                set_novgorod_adjacent_selection( you.getID().get_value(), you.pos_bub(), direction );
                actions.push_back( action_ident( ACTION_OPEN ) );
            }
        } else if( op.primitive == "pickup" || op.primitive == "use_item" ) {
            const std::string uid = reference_id( request, "items", "item:",
                                                  "NOVGOROD_ITEM_REFERENCE_MISMATCH" );
            size_t parsed = 0;
            op.item_uid = std::stoll( uid, &parsed );
            if( parsed != uid.size() || op.item_uid <= 0 ) {
                throw std::runtime_error( "NOVGOROD_ITEM_UID_INVALID" );
            }
            if( op.primitive == "pickup" ) {
                bool observed = false;
                for( const tripoint_bub_ms &pos : here.points_in_radius( you.pos_bub(), 1 ) ) {
                    if( !you.sees( here, pos ) ) continue;
                    for( const item &candidate : here.i_at( pos ) ) {
                        observed = observed || candidate.uid().get_value() == op.item_uid;
                    }
                }
                if( !observed ) throw std::runtime_error( "NOVGOROD_ITEM_NOT_OBSERVED_ON_GROUND" );
                g->set_novgorod_pickup_uid( op.item_uid );
                actions.push_back( action_ident( ACTION_PICKUP ) );
            } else {
                const item *it = carried_item( op.item_uid );
                if( !it ) throw std::runtime_error( "NOVGOROD_ITEM_NOT_OBSERVED_IN_INVENTORY" );
                const std::string method = args.get_string( "method" );
                if( it->type->use_methods.find( method ) == it->type->use_methods.end() ) {
                    throw std::runtime_error( "NOVGOROD_TEST_ITEM_USE_METHOD_UNKNOWN" );
                }
                op.item_type = it->typeId().str();
                op.charges = it->charges;
                op.active = it->active;
                op.local_map_before = local_map_fact( you.pos_bub() );
                if( args.has_member( "target_direction" ) ) {
                    const tripoint_rel_ms direction = request_direction( args );
                    op.target = you.pos_bub() + direction;
                    check_target( request, op.target );
                    set_novgorod_adjacent_selection( you.getID().get_value(), you.pos_bub(), direction );
                }
                g->set_novgorod_item_use( op.item_uid, method );
                actions.push_back( action_ident( ACTION_USE ) );
            }
        } else if( op.primitive == "wait" || op.primitive == "speak" ) {
            bool brief = true;
            if( op.primitive == "speak" ) {
                args.allow_omitted_members();
                op.npc_speaker = op.actor_id != avatar_id;
                op.speaker_ref = op.npc_speaker ? "npc:" + op.actor_id : "avatar";
                const bool silent = args.has_member( "contribution_kind" ) &&
                                    args.has_string( "contribution_kind" ) &&
                                    args.get_string( "contribution_kind" ) == "silence";
                if( args.has_member( "reason" ) ||
                    ( args.has_member( "contribution_kind" ) && !silent ) ||
                    ( silent && ( args.has_member( "utterance" ) || args.has_member( "content" ) ) ) ) {
                    throw std::runtime_error( "NOVGOROD_SPEECH_ARGS_INVALID" );
                }
                if( silent ) {
                    if( !op.npc_speaker ) {
                        throw std::runtime_error( "NOVGOROD_SILENCE_REQUIRES_NPC" );
                    }
                    if( !args.has_string( "visible_behavior" ) ||
                        args.get_string( "visible_behavior" ).empty() ) {
                        throw std::runtime_error( "NOVGOROD_SILENCE_BEHAVIOR_REQUIRED" );
                    }
                    op.visible_behavior = args.get_string( "visible_behavior" );
                    op.contribution_kind = "silence";
                }
                if( op.npc_speaker && args.has_member( "delivery" ) ) {
                    throw std::runtime_error( "NOVGOROD_NPC_SPEECH_DELIVERY_UNSUPPORTED" );
                }
                int loudness = 2;
                if( args.has_member( "delivery" ) ) {
                    const JsonObject delivery = args.get_object( "delivery" );
                    delivery.allow_omitted_members();
                    if( delivery.size() != 2 || !delivery.has_int( "loudness" ) ||
                        !delivery.has_string( "duration_class" ) ) {
                        throw std::runtime_error( "NOVGOROD_SPEECH_DELIVERY_INVALID" );
                    }
                    loudness = delivery.get_int( "loudness" );
                    const std::string duration = delivery.get_string( "duration_class" );
                    if( loudness < 1 || loudness > 4 ||
                        ( duration != "instant" && duration != "brief" && duration != "sustained" ) ) {
                        throw std::runtime_error( "NOVGOROD_SPEECH_DELIVERY_INVALID" );
                    }
                    if( duration == "sustained" ) {
                        throw std::runtime_error( "NOVGOROD_SUSTAINED_SPEECH_UNSUPPORTED" );
                    }
                    brief = duration == "brief";
                }
                if( !silent ) {
                    op.utterance = args.has_member( "utterance" ) ? args.get_string( "utterance" ) :
                                   args.get_string( "content" );
                    if( op.utterance.empty() ) throw std::runtime_error( "NOVGOROD_UTTERANCE_REQUIRED" );
                }
                Character *speaker = &you;
                if( op.npc_speaker ) {
                    speaker = &visible_npc_by_id( op.actor_id );
                }
                op.addressees = read_addressees( request, avatar_id );
                if( op.npc_speaker && op.addressees.size() != 1 ) {
                    throw std::runtime_error( "NOVGOROD_SPEECH_ADDRESSEE_REQUIRED" );
                }
                if( !silent && ( speaker->is_mute() || speaker->is_hallucination() ) ) {
                    throw std::runtime_error( "NOVGOROD_NATIVE_SPEAKER_CANNOT_SPEAK" );
                }
                op.speaker_position = speaker->pos_bub();
                if( silent ) {
                    add_msg_if_player_sees( *speaker, op.visible_behavior );
                    append_memory( *speaker, { "silence", op.speaker_ref, op.addressees.front(), "",
                                               to_turn<int>( calendar::turn ) } );
                } else if( op.npc_speaker ) {
                    op.sound_description = static_cast<npc *>( speaker )->say_formatted( op.utterance,
                                           sounds::sound_t::speech );
                    if( op.sound_description.empty() ) {
                        throw std::runtime_error( "NOVGOROD_NATIVE_SPEAKER_CANNOT_SPEAK" );
                    }
                    append_memory( *speaker, { "said", op.speaker_ref, op.addressees.front(), op.utterance,
                                               to_turn<int>( calendar::turn ) } );
                } else {
                    op.sound_volume = loudness == 1 ? Character::minimum_voice_volume :
                                       loudness == 2 ? speaker->indoor_voice() : speaker->get_shout_volume();
                    op.sound_description = op.utterance;
                    add_msg( _( "You yell %s" ), string_format( _( "\"%s\"" ), op.utterance ) );
                    sounds::sound( op.speaker_position, op.sound_volume, sounds::sound_t::speech,
                                   op.utterance, false, "speech" );
                    if( !brief ) you.mod_moves( -you.get_speed() );
                }
            }
            if( brief ) you.assign_activity( wait_activity_actor( 3_seconds ) );
        } else {
            throw std::runtime_error( "NOVGOROD_UNSUPPORTED_NATIVE_PRIMITIVE" );
        }
        if( !actions.empty() ) {
            if( test_mode ) actions.push_back( action_ident( ACTION_PAUSE ) );
            g->set_novgorod_action_queue( std::move( actions ) );
        }
        return { true, "" };
    } catch( const std::exception &error ) {
        evidence->refusal = error.what();
        clear_novgorod_test_adjacent_selection();
        return finish_operation();
    }
}

void observe_heard_speech( const Character &listener, const tripoint_bub_ms &source,
                           const std::string &description )
{
    if( !evidence || evidence->sound_description.empty() || evidence->speaker_position != source ||
        evidence->sound_description != description ) return;
    const std::string id = std::to_string( listener.getID().get_value() );
    if( id == evidence->actor_id ||
        std::find( evidence->heard.begin(), evidence->heard.end(), id ) != evidence->heard.end() ) {
        return;
    }
    evidence->heard.push_back( id );
    npc *guy = listener.is_npc() ? g->find_npc( listener.getID() ) : nullptr;
    if( guy == nullptr || evidence->addressees.empty() ) return;
    const std::string own_ref = "npc:" + id;
    const bool addressed = std::find( evidence->addressees.begin(), evidence->addressees.end(),
                                      own_ref ) != evidence->addressees.end();
    append_memory( *guy, { "heard", evidence->speaker_ref,
                           addressed ? own_ref : evidence->addressees.front(), evidence->utterance,
                           to_turn<int>( calendar::turn ) } );
}

bool refuse_operation( const std::string &code )
{
    if( !evidence ) return false;
    evidence->refusal = code;
    return true;
}

operation_result finish_operation()
{
    if( !evidence ) throw std::logic_error( "NOVGOROD_NO_NATIVE_OPERATION" );
    clear_novgorod_test_adjacent_selection();
    operation_evidence op = std::move( *evidence );
    evidence.reset();
    const local_fact after = current_fact();
    const int elapsed = to_seconds<int>( after.time - op.before.time );
    bool changed = false;
    if( op.primitive == "move" || op.primitive == "open" ) {
        changed = after.position != op.before.position || op.terrain != get_map().ter( op.target ).id().str() ||
                  op.furniture != get_map().furn( op.target ).id().str();
        if( op.refusal.empty() && !changed ) op.refusal = op.primitive == "move" ?
                    "NOVGOROD_NATIVE_MOVEMENT_NOT_APPLIED" : "NOVGOROD_NATIVE_OPEN_NOT_APPLIED";
    } else if( op.primitive == "pickup" ) {
        changed = carried_item( op.item_uid ) != nullptr;
    } else if( op.primitive == "use_item" ) {
        const item *it = carried_item( op.item_uid );
        changed = !it || it->typeId().str() != op.item_type || it->charges != op.charges || it->active != op.active ||
                  op.local_map_before != local_map_fact( op.before.position );
    } else if( op.primitive == "speak" ) {
        changed = op.refusal.empty() && ( !op.utterance.empty() || op.contribution_kind == "silence" );
    } else if( op.primitive == "wait" ) {
        changed = elapsed >= 3;
    }
    const bool applied = op.refusal.empty();
    const bool progressing = applied && after.activity != "ACT_NULL" && after.activity_moves_left > 0;
    const std::string effect = !applied ? "refused" : changed ? "confirmed" : progressing ? "progressing" : "none";
    const std::string goal = !applied ? "refused" : changed ? "achieved" : progressing ? "in_progress" : "not_achieved";
    std::ostringstream stream;
    JsonOut out( stream );
    out.start_object();
    out.member( "schema", "p3_native_operation_readback_v1" );
    out.member( "operation_id", op.id );
    out.member( "status", applied ? "applied" : "refused" );
    out.member( "goal_result", goal );
    out.member( "before" ); write_fact( out, op.before );
    out.member( "after" ); write_fact( out, after );
    out.member( "native_effect" );
    out.start_object();
    out.member( "primitive", op.primitive );
    out.member( "actor_id", op.actor_id );
    out.member( "effect_status", effect );
    out.member( "world_changed", changed );
    out.member( "elapsed_seconds", elapsed );
    out.member( "elapsedSeconds", elapsed );
    out.member( "activity_before", op.before.activity );
    out.member( "activity_after", after.activity );
    if( op.contribution_kind == "silence" ) {
        out.member( "speakerId", op.actor_id );
        out.member( "contribution_kind", "silence" );
        out.member( "visible_behavior", op.visible_behavior );
        out.member( "actualHeardListenerIds", op.heard );
    } else if( !op.utterance.empty() ) {
        out.member( "speakerId", op.actor_id );
        out.member( "contribution_kind", "speech" );
        out.member( "utterance", op.utterance );
        out.member( "native_sound", applied ? op.sound_description : "" );
        if( !op.npc_speaker ) {
            out.member( "sound_volume", op.sound_volume );
        }
        out.member( "actualHeardListenerIds", op.heard );
    }
    out.end_object();
    if( !applied ) {
        out.member( "refusal" ); out.start_object();
        out.member( "code", op.refusal ); out.end_object();
    }
    out.end_object();
    return { applied, stream.str() };
}

#ifndef _WIN32
namespace
{
int live_fd = -1;
uint64_t intent_counter = 0;
std::string live_id;
std::string incoming;
bool awaiting_native = false;
using steady_clock = std::chrono::steady_clock;
steady_clock::time_point deadline;

void disconnect()
{
    if( live_fd >= 0 ) close( live_fd );
    live_fd = -1;
    incoming.clear();
    awaiting_native = false;
    live_id.clear();
}

void reset_deadline( int timeout_ms )
{
    if( timeout_ms <= 0 ) throw std::runtime_error( "NOVGOROD_INVALID_ROLE_TIMEOUT" );
    deadline = steady_clock::now() + std::chrono::milliseconds( timeout_ms );
}

void wait_socket( short events )
{
    std::optional<static_popup> wait_popup;
    if( !test_mode ) wait_popup.emplace().on_top( true ).wait_message( "%s", "Qwen думает…" );
    for( ;; ) {
        if( steady_clock::now() >= deadline ) throw std::runtime_error( "NOVGOROD_COORDINATOR_TIMEOUT" );
        if( !test_mode ) {
            ui_manager::redraw();
            refresh_display();
            inp_mngr.pump_events();
        }
        pollfd descriptor { live_fd, events, 0 };
        const int ready = poll( &descriptor, 1, 100 );
        if( ready < 0 && errno != EINTR ) throw std::runtime_error( "NOVGOROD_COORDINATOR_POLL_FAILED" );
        if( ready > 0 ) {
            if( descriptor.revents & events ) return;
            if( descriptor.revents & ( POLLHUP | POLLERR | POLLNVAL ) ) {
                throw std::runtime_error( "NOVGOROD_COORDINATOR_DISCONNECTED" );
            }
        }
    }
}

void send_line( const std::string &json )
{
    const std::string line = json + "\n";
    size_t sent = 0;
    while( sent < line.size() ) {
        const ssize_t count = send( live_fd, line.data() + sent, line.size() - sent, MSG_NOSIGNAL );
        if( count > 0 ) sent += static_cast<size_t>( count );
        else if( count < 0 && ( errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR ) ) wait_socket( POLLOUT );
        else throw std::runtime_error( "NOVGOROD_COORDINATOR_SEND_FAILED" );
    }
}

std::string receive_line()
{
    for( ;; ) {
        const size_t end = incoming.find( '\n' );
        if( end != std::string::npos ) {
            std::string line = incoming.substr( 0, end );
            incoming.erase( 0, end + 1 );
            return line;
        }
        wait_socket( POLLIN );
        char buffer[8192];
        const ssize_t count = recv( live_fd, buffer, sizeof( buffer ), 0 );
        if( count > 0 ) incoming.append( buffer, static_cast<size_t>( count ) );
        else if( count < 0 && ( errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR ) ) continue;
        else throw std::runtime_error( "NOVGOROD_COORDINATOR_DISCONNECTED" );
    }
}

std::string observation_message( const std::string &type, const std::string &intent = "",
                                 const std::string &target_actor_ref = "" )
{
    std::ostringstream stream;
    JsonOut out( stream );
    out.start_object();
    out.member( "type", type );
    out.member( "id", live_id );
    if( type == "intent" ) {
        out.member( "intent", intent );
        if( !target_actor_ref.empty() ) out.member( "target_actor_ref", target_actor_ref );
    }
    out.member( "observation" );
    write_observation( out );
    out.end_object();
    return stream.str();
}

void send_readback( const operation_result &result )
{
    // live_id is generated locally as a decimal counter, never remote JSON text.
    send_line( "{\"type\":\"readback\",\"id\":\"" + live_id + "\",\"readback\":" + result.json + "}" );
}

void await_coordinator()
{
    for( ;; ) {
        const JsonObject message = json_loader::from_string( receive_line() ).get_object();
        message.allow_omitted_members();
        if( message.get_string( "id", "" ) != live_id ) continue;
        const std::string type = message.get_string( "type" );
        if( type == "role_phase" ) {
            reset_deadline( message.get_int( "timeout_ms" ) );
        } else if( type == "observe" ) {
            send_line( observation_message( "observation" ) );
        } else if( type == "operation" ) {
            const operation_result result = apply_operation( message.get_object( "request" ) );
            if( result.applied ) {
                awaiting_native = true;
                return;
            }
            send_readback( result );
        } else if( type == "result" ) {
            const std::string text = message.get_string( "message", "" );
            if( !text.empty() ) add_msg( "%s", text );
            disconnect();
            return;
        } else {
            throw std::runtime_error( "NOVGOROD_COORDINATOR_MESSAGE_INVALID" );
        }
    }
}

void connect_coordinator()
{
    const char *path = std::getenv( "NOVGOROD_P3_SOCKET" );
    sockaddr_un address {};
    address.sun_family = AF_UNIX;
    if( path == nullptr || *path == '\0' || std::strlen( path ) >= sizeof( address.sun_path ) ) {
        throw std::runtime_error( "NOVGOROD_COORDINATOR_SOCKET_REQUIRED" );
    }
    std::strcpy( address.sun_path, path );
    live_fd = socket( AF_UNIX, SOCK_STREAM, 0 );
    if( live_fd < 0 || connect( live_fd, reinterpret_cast<const sockaddr *>( &address ), sizeof( address ) ) < 0 ) {
        throw std::runtime_error( "NOVGOROD_COORDINATOR_CONNECT_FAILED" );
    }
    const int flags = fcntl( live_fd, F_GETFL, 0 );
    if( flags < 0 || fcntl( live_fd, F_SETFL, flags | O_NONBLOCK ) < 0 ) {
        throw std::runtime_error( "NOVGOROD_COORDINATOR_SOCKET_FLAGS_FAILED" );
    }
}
} // namespace
#endif

void submit_live_intent( const std::string &intent, const std::string &target_actor_ref )
{
#ifndef _WIN32
    try {
        if( live_fd >= 0 ) throw std::logic_error( "NOVGOROD_NATIVE_INTENT_ALREADY_ACTIVE" );
        connect_coordinator();
        live_id = std::to_string( ++intent_counter );
        const char *configured_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" );
        if( configured_timeout == nullptr ) throw std::runtime_error( "NOVGOROD_ROLE_TIMEOUT_REQUIRED" );
        reset_deadline( std::stoi( configured_timeout ) );
        send_line( observation_message( "intent", intent, target_actor_ref ) );
        await_coordinator();
    } catch( ... ) {
        disconnect();
        throw;
    }
#endif
}

void submit_live_intent( const std::string &intent, const Creature *target )
{
    const npc *subject = target ? target->as_npc() : nullptr;
    submit_live_intent( intent, subject ? "npc:" + std::to_string( subject->getID().get_value() ) : "" );
}

void live_input()
{
#ifdef _WIN32
    add_msg( "%s", "Живая dev-проба запускается в WSL." );
#else
    const std::string intent = string_input_popup().title( "Свободное действие (dev-проба)" ).query_string();
    if( intent.find_first_not_of( " \t\r\n" ) == std::string::npos ) return;
    try {
        submit_live_intent( intent, select_chat_target() );
    } catch( const std::exception &error ) {
        disconnect();
        add_msg( "%s: %s", "Dev-проба: связь прервана", error.what() );
    }
#endif
}

void on_input_boundary()
{
#ifndef _WIN32
    if( !awaiting_native || g->has_novgorod_actions() ) return;
    if( evidence && ( evidence->primitive == "wait" || evidence->primitive == "speak" ) &&
        !get_avatar().activity.is_null() ) return;
    awaiting_native = false;
    try {
        const operation_result result = finish_operation();
        const char *configured_timeout = std::getenv( "NOVGOROD_P3_TIMEOUT_MS" );
        if( configured_timeout == nullptr ) throw std::runtime_error( "NOVGOROD_ROLE_TIMEOUT_REQUIRED" );
        reset_deadline( std::stoi( configured_timeout ) );
        send_readback( result );
        await_coordinator();
    } catch( const std::exception &error ) {
        disconnect();
        add_msg( "%s: %s", "Действие уже исполнено; связь прервана", error.what() );
    }
#endif
}

} // namespace novgorod_semantic
