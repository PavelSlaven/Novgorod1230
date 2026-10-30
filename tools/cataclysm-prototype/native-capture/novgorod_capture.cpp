#include "novgorod_capture.h"
#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include "activity_actor_definitions.h"
#include "avatar.h"
#include "calendar.h"
#include "character.h"
#include "creature.h"
#include "display.h"
#include "field.h"
#include "game.h"
#include "item.h"
#include "item_location.h"
#include "itype.h"
#include "json.h"
#include "json_loader.h"
#include "messages.h"
#include "submap.h"
#include "level_cache.h"
#include "lightmap.h"
#include "line.h"
#include "map.h"
#include "mapdata.h"
#include "monster.h"
#include "mtype.h"
#include "npc.h"
#include "novgorod_semantic.h"
#include "output.h"
#include "overmapbuffer.h"
#include "overmap.h"
#include "player_activity.h"
#include "trap.h"
#include "units.h"
#include "vehicle.h"
#include "weather.h"
#include "weather_type.h"

namespace novgorod_capture {
namespace {
static const json_character_flag json_flag_SEESLEEP( "SEESLEEP" );
bool started = false;
int sequence = 0;
int last_request = 0;
std::set<const Creature *> seen_creatures;
std::map<std::int64_t, int> last_moved_turn;
std::set<std::int64_t> pending_attention_ids;
// Hearing happens inside a turn; an input poll inside that turn must not show it before the turn frame.
std::set<std::int64_t> attending_ids;
int movement_probe_depth = 0;
struct captured_input { std::string action; std::vector<int> keys; std::string text; };
struct captured_message { std::string text; int type; bool hidden; int turn; };
struct captured_sound {
    std::vector<int> position;
    std::string description;
    int category;
    int volume;
    bool ambient;
    int turn;
};
std::vector<captured_input> captured_inputs;
std::vector<captured_message> captured_messages;
std::vector<captured_sound> captured_sounds;
std::set<std::string> described;
std::map<std::string,std::string> previous;
std::string last_sounds = "[]";
const char *directory() { return std::getenv( "NOVGOROD_CAPTURE_DIR" ); }
std::string json( const std::function<void(JsonOut &)> &write ) {
    std::ostringstream stream; JsonOut out( stream ); write( out ); return stream.str();
}
std::vector<int> absolute( const tripoint_bub_ms &p ) {
    const tripoint_abs_ms a = get_map().get_abs( p ); return { a.x(), a.y(), a.z() };
}
std::string direction( const tripoint_bub_ms &p ) {
    return direction_name( direction_from( get_avatar().pos_bub().raw(), p.raw() ) );
}
void description( const std::string &kind, const std::string &type,
                  const std::string &label, const std::string &text, const std::string &source ) {
    if( !described.insert( kind + ":" + type ).second ) return;
    std::ofstream f( std::string(directory()) + "/descriptions.jsonl", std::ios::app );
    f << json([&](JsonOut &o) { o.start_object(); o.member("kind",kind); o.member("type",type);
        o.member("label",label); o.member("text",text); o.member("source",source);
        o.member("native_turn",to_turn<int>(calendar::turn)); o.end_object(); }) << '\n';
}
void capture_journal() {
    if(!directory())return;
    std::ofstream f(std::string(directory())+"/native-messages.json");
    JsonOut o(f);o.start_object();Messages::serialize(o);o.end_object();
}
void item_data( JsonOut &o, const item &it, bool owner ) {
    o.start_object(); o.member("uid",std::to_string(it.uid().get_value()));
    o.member("type",it.typeId().str()); o.member("name",it.tname());
    if( owner ) { o.member("owner",it.get_owner_name()); }
    o.end_object();
    description("item",it.typeId().str(),it.type_name(),it.type->description.translated(),"itype::description (native flavor text)");
}
void location( JsonOut &o, const tripoint_bub_ms &p ) {
    o.member("position",absolute(p)); o.member("distance",rl_dist(get_avatar().pos_bub(),p));
    o.member("direction",direction(p));
}
void write_activity( JsonOut &o, const npc &who ) {
    if( who.activity.is_null() ) { o.write_null(); return; }
    o.start_object();
    o.member("id",who.activity.id().str());
    o.member("verb",who.get_current_activity());
    const auto *chop=dynamic_cast<const chop_planks_activity_actor *>(who.activity.actor.get());
    const itype_id *tool=chop?&chop->selected_tool_type():nullptr;
    const itype_id *material=chop?&chop->input_material_type():nullptr;
    o.member("tool");
    if(tool&&!tool->is_null()) o.write(tool->str()); else o.write_null();
    o.member("material");
    if(material&&!material->is_null()) o.write(material->str()); else o.write_null();
    o.end_object();
}
std::string posture( const npc &who ) {
    if( who.in_sleep_state() || who.is_prone() ) return "prone";
    if( who.is_crouching() ) return "crouching";
    const map &here=get_map();
    const auto moved=last_moved_turn.find(who.getID().get_value());
    if( (moved==last_moved_turn.end() || moved->second!=to_turn<int>(calendar::turn)) &&
        (here.has_flag_ter(ter_furn_flag::TFLAG_CAN_SIT,who.pos_bub()) ||
         here.has_flag_furn(ter_furn_flag::TFLAG_CAN_SIT,who.pos_bub())) ) return "sitting";
    return "standing";
}
std::string attention( const npc &who, const avatar &you ) {
    if( attending_ids.count(who.getID().get_value())>0 ) return "attends";
    const bool sleeping=who.in_sleep_state()&&!who.has_flag(json_flag_SEESLEEP);
    const bool sees_player=who.sees(get_map(),you);
    if( !sleeping && who.get_attitude()==NPCATT_TALK && sees_player ) return "attends";
    if( sleeping || !sees_player ) return "unaware";
    return "notices";
}
struct group { int count=0; int nearest=100000; std::string direction; std::string name;
    std::vector<std::vector<int>> positions; };
void groups( JsonOut &o, const std::map<std::string,group> &g ) {
    o.start_array(); for(const auto &pair:g) { o.start_object();o.member("type",pair.first);
        o.member("name",pair.second.name);o.member("count",pair.second.count);
        o.member("nearest_distance",pair.second.nearest);o.member("nearest_direction",pair.second.direction);
        o.member("positions",pair.second.positions);o.end_object(); } o.end_array();
}
std::map<std::string,std::string> frame() {
    const avatar &you=get_avatar(); const map &here=get_map(); const tripoint_bub_ms pos=you.pos_bub();
    const level_cache &cache=here.get_cache_ref(pos.z());
    const visibility_variables &visibility=here.get_visibility_variables_cache();
    const weather_manager &weather=get_weather_const();
    std::map<std::string,std::string> f;
    f["journal"]=json([&](JsonOut &o){o.start_object();Messages::serialize(o);o.end_object();});
    f["sounds"]=last_sounds;
    f["place"]=json([&](JsonOut &o){o.start_object();o.member("name",display::current_position_text(you.pos_abs_omt()));
        const tripoint_abs_omt omt=you.pos_abs_omt();o.member("overmap_position",std::vector<int>{omt.x(),omt.y(),omt.z()});
        o.member("outside",cache.outside_cache[pos.x()][pos.y()]);o.member("roofed",here.is_roofed(pos));o.member("z",pos.z());o.end_object();});
    f["position"]=json([&](JsonOut &o){o.write(absolute(pos));});
    const float light=cache.lm[pos.x()][pos.y()].max();
    f["light"]=json([&](JsonOut &o){o.start_object();o.member("ambient",light);
        o.member("label",get_light_level(std::max(1.0f,LIGHT_AMBIENT_LIT-light+1.0f)).first);
        o.member("sight_range",you.sight_range(light));o.member("unimpaired_range",you.unimpaired_range());
        o.member("vision_threshold",visibility.vision_threshold);o.end_object();});
    f["sky_diagnostic"]=json([&](JsonOut &o){o.start_object();o.member("sun_light",sun_light_at(calendar::turn));
        o.member("moon_light",moon_light_at(calendar::turn));o.member("sun_moon_light",sun_moon_light_at(calendar::turn));
        o.member("moon_phase",static_cast<int>(get_moon_phase(calendar::turn)));
        o.member("natural_light_cached",cache.natural_light_level_cache);
        o.member("sun_light_at_tile_cached",cache.sun_lm[pos.x()][pos.y()].max());
        o.member("weather_light_multiplier",weather.weather_id->light_multiplier);
        o.member("weather_light_modifier",weather.weather_id->light_modifier);
        o.member("weather_sun_multiplier",weather.weather_id->sun_multiplier);
        o.member("weather_sight_penalty",weather.weather_id->sight_penalty);
        o.member("weather_sound_attenuation",weather.weather_id->sound_attn);o.end_object();});
    f["clock"]=json([&](JsonOut &o){o.start_object();o.member("date_time",to_string(calendar::turn));
        o.member("time",to_string_time_of_day(calendar::turn));o.member("time_of_day",display::time_approx());
        o.member("hour",hour_of_day<int>(calendar::turn));o.member("night",is_night(calendar::turn));o.end_object();});
    f["weather"]=json([&](JsonOut &o){o.start_object();o.member("type",weather.weather_id.str());
        o.member("name",weather.weather_id->name.translated());o.member("temperature_c",units::to_celsius(weather.temperature));
        auto temp=weather.temperature_cache.find(pos);o.member("local_temperature_c");
        if(temp==weather.temperature_cache.end())o.write_null();else o.write(units::to_celsius(temp->second));
        o.member("wind_speed_mph",weather.windspeed);o.member("wind_direction_degrees",weather.winddirection);
        o.member("wind_label",get_wind_desc(weather.windspeed));o.member("wind_direction_label",get_dirstring(weather.winddirection));
        o.member("precipitation",static_cast<int>(weather.weather_id->precip));o.member("rains",weather.weather_id->rains);o.end_object();});
    std::map<std::string,group> terrain, furniture;
    std::vector<tripoint_bub_ms> cells;
    for(int y=0;y<MAPSIZE_Y;++y)for(int x=0;x<MAPSIZE_X;++x) {
        tripoint_bub_ms p(x,y,pos.z());
        if(here.get_visibility(cache.visibility_cache[x][y],visibility)!=visibility_type::CLEAR)continue;
        cells.push_back(p);
        const ter_t &t=here.ter(p).obj();auto &g=terrain[here.ter(p).id().str()];++g.count;g.name=t.name();g.positions.push_back(absolute(p));
        const int d=rl_dist(pos,p);if(d<g.nearest){g.nearest=d;g.direction=direction(p);}
        description("terrain",here.ter(p).id().str(),t.name(),t.description.translated(),"map_data_common_t::description (LOOK terrain prose)");
        if(here.has_furn(p)) {const furn_t &t=here.furn(p).obj();auto &g=furniture[here.furn(p).id().str()];++g.count;
            g.name=t.name();g.positions.push_back(absolute(p));if(d<g.nearest){g.nearest=d;g.direction=direction(p);}
            description("furniture",here.furn(p).id().str(),t.name(),t.description.translated(),"map_data_common_t::description (LOOK furniture prose)");}
    }
    f["visible_terrain"]=json([&](JsonOut &o){groups(o,terrain);});
    f["visible_furniture"]=json([&](JsonOut &o){groups(o,furniture);});
    f["objects"]=json([&](JsonOut &o){o.start_array();for(const auto &p:cells) {
        const ter_t &t=here.ter(p).obj();
        bool door=t.has_flag(ter_furn_flag::TFLAG_DOOR),window=t.has_flag(ter_furn_flag::TFLAG_WINDOW);
        if(door||window) {o.start_object();o.member("kind",door?"door":"window");location(o,p);
            o.member("type",here.ter(p).id().str());o.member("name",t.name());o.member("open_to",t.open.str());o.member("close_to",t.close.str());
            o.member("state",!t.close.is_null()?"open":!t.open.is_null()?"closed":"other_native_state");o.end_object();}
        if(here.has_furn(p)){o.start_object();o.member("kind","furniture");location(o,p);o.member("type",here.furn(p).id().str());o.member("name",here.furn(p).obj().name());o.end_object();}
        if(here.sees_some_items(p,you)){for(const item &it:here.maptile_at(p).get_items()){o.start_object();o.member("kind","ground_item");location(o,p);o.member("item");item_data(o,it,true);o.end_object();}}
        const field &fields=here.field_at(p);for(const auto &entry:fields){const field_entry &e=entry.second;
            if(e.name().empty())continue;o.start_object();o.member("kind","field");location(o,p);o.member("type",e.get_field_type().id().str());o.member("name",e.name());o.member("intensity",e.get_field_intensity());o.end_object();}
        if(here.can_see_trap_at(p,you)){const trap &tr=here.tr_at(p);if(!tr.is_null()){o.start_object();o.member("kind","known_trap");location(o,p);o.member("name",tr.name());o.end_object();}}
        const optional_vpart_position vp=here.veh_at(p);if(vp){o.start_object();o.member("kind","vehicle_part");location(o,p);o.member("vehicle_name",vp->vehicle().name);o.end_object();}
    }o.end_array();});
    f["creatures"]=json([&](JsonOut &o){o.start_array();for(Creature &c:g->all_creatures()){
        if(!seen_creatures.count(&c)||&c==&you)continue;
        o.start_object();location(o,c.pos_bub());o.member("name",c.get_name());
        if(const npc *n=dynamic_cast<const npc*>(&c)) {
            o.member("kind","npc");o.member("id",std::to_string(n->getID().get_value()));o.member("type",n->idz.str());
            o.member("status",n->get_current_status());
            const auto &att=Creature::get_attitude_ui_data(n->attitude_to(you));o.member("attitude",att.first.translated());
            o.member("worn");o.start_array();for(const item_location &it:n->get_visible_worn_items())item_data(o,*it,false);o.end_array();
            o.member("wielded");if(n->is_armed())item_data(o,*n->get_wielded_item(),false);else o.write_null();
            o.member("activity");write_activity(o,*n);o.member("posture",posture(*n));o.member("attention",attention(*n,you));
            std::string text;for(const auto &line:n->extended_description())text+=line+"\n";
            description("npc",n->idz.str(),n->get_name(),text,"npc::extended_description (native LOOK extended description)");
        } else if(const monster *m=dynamic_cast<const monster*>(&c)) {
            o.member("kind","creature");o.member("type",m->type->id.str());o.member("attitude",m->get_attitude().first);
            description("creature",m->type->id.str(),m->name(),m->type->get_description(),"mtype::get_description (native creature prose)");
        } else {o.member("kind","other_creature");}
        o.end_object();}o.end_array();});
    f["inventory"]=json([&](JsonOut &o){o.start_array();for(const item *it:you.items_with([](const item &){return true;}))item_data(o,*it,false);o.end_array();});
    f["player_state"]=json([&](JsonOut &o){o.start_object();o.member("pain_label",display::pain_text_color(you).first);
        o.member("hunger_label",display::hunger_text_color(you).first);o.member("thirst_label",display::thirst_text_color(you).first);
        o.member("sleepiness_label",display::sleepiness_text_color(you).first);o.member("weariness_label",display::weariness_text_color(you).first);
        o.member("warmth_label",display::temp_text_color(you).first);o.member("activity_label",display::activity_text_color(you).first);
        o.member("weight_label",display::weight_text_color(you).first);o.member("pain",you.get_perceived_pain());
        o.member("carried_weight_grams");auto weight=you.capture_cached_weight();if(weight)o.write(units::to_gram(*weight));else o.write_null();
        o.member("carry_capacity_grams",units::to_gram(you.weight_capacity()));o.member("stamina",you.get_stamina());
        o.member("wetness_label");o.write_null();o.member("body_parts");o.start_array();for(const auto &bp:you.get_all_body_parts()){
            o.start_object();o.member("id",bp.id().str());o.member("wetness",you.get_part_wetness(bp));o.member("wetness_percent",you.get_part_wetness_percentage(bp));
            o.member("temperature_c",units::to_celsius(you.get_part_temp_cur(bp)));o.end_object();}o.end_array();
        o.member("wielded");if(you.is_armed())item_data(o,*you.get_wielded_item(),false);else o.write_null();
        o.member("activity_id",you.activity.id().str());o.end_object();});
    return f;
}
void write( const std::string &reason, bool full, int input_number=0 ) {
    if(!directory())return;
    const auto current=frame();++sequence;
    full=full||previous.empty()||to_turn<int>(calendar::turn)%60==0;
    std::ofstream file(std::string(directory())+"/perception.jsonl",std::ios::app);
    file<<"{\"sequence\":"<<sequence<<",\"native_turn\":"<<to_turn<int>(calendar::turn)
        <<",\"reason\":"<<json([&](JsonOut &o){o.write(reason);})<<",\"input_number\":"<<input_number
        <<",\"kind\":\""<<(full?"full":"delta")<<"\",\""<<(full?"frame":"changes")<<"\":{";
    bool comma=false;for(const auto &p:current){if(!full&&previous[p.first]==p.second)continue;
        if(comma)file<<',';comma=true;file<<json([&](JsonOut &o){o.write(p.first);})<<':'<<p.second;}
    file<<"}}\n";previous=current;
}
}
void visible(const std::vector<Creature *> &creatures){
    if(!directory())return;seen_creatures.clear();seen_creatures.insert(creatures.begin(),creatures.end());
}
void start(){if(!started&&directory()){started=true;write("initial",true);}}
void turn(bool input,const std::string &legacy){
    if(!started)return;
    JsonObject object=json_loader::from_string(legacy).get_object();object.allow_omitted_members();
    last_sounds=json([&](JsonOut &o){o.start_array();for(const JsonObject sound:object.get_array("sounds")){
        sound.allow_omitted_members();std::vector<int> position;sound.read("position",position);
        o.start_object();o.member("position",position);o.member("description",sound.get_string("description"));
        o.member("category",sound.get_int("category"));o.member("heard_volume",sound.get_int("heard_volume"));
        o.member("ambient",sound.get_bool("ambient"));o.member("native_turn",sound.get_int("native_turn"));o.end_object();}o.end_array();});
    attending_ids=pending_attention_ids;
    write("turn",input);
}
void capture_initial(){
    static bool done=false;
    if(done||!directory())return;
    done=true;
    std::ofstream f(std::string(directory())+"/initial-observation.json");
    JsonOut o(f);novgorod_semantic::write_observation(o);
    capture_journal();
    start();
}
void capture_input(const std::string &action,const std::vector<int> &keys,const std::string &text){
    if(directory()&&action!="TIMEOUT")captured_inputs.push_back({action,keys,text});
}
void capture_message(const std::string &text,int type,bool hidden){
    if(directory())captured_messages.push_back({text,type,hidden,to_turn<int>(calendar::turn)});
}
void capture_sound(const tripoint_bub_ms &position,const std::string &description,int category,
                   int volume,bool ambient){
    if(directory())captured_sounds.push_back({absolute(position),description,category,volume,ambient,
                                              to_turn<int>(calendar::turn)});
}
void capture_turn(){
    if(!directory())return;
    std::ostringstream buffer;
    JsonOut o(buffer);
    o.start_object();
    o.member("native_turn",to_turn<int>(calendar::turn));
    o.member("game_datetime",to_string(calendar::turn));
    o.member("game_time",to_string_time_of_day(calendar::turn));
    o.member("player_position",absolute(get_avatar().pos_bub()));
    const tripoint_abs_ms player_absolute=get_avatar().pos_abs();
    o.member("player_absolute_position",std::vector<int>{player_absolute.x(),player_absolute.y(),player_absolute.z()});
    o.member("had_player_input",!captured_inputs.empty());
    o.member("inputs");
    o.start_array();
    for(const captured_input &input:captured_inputs){
        o.start_object();o.member("action",input.action);o.member("key_codes",input.keys);
        o.member("text",input.text);o.end_object();
    }
    o.end_array();
    o.member("observation");
    novgorod_semantic::write_observation(o);
    o.member("messages");
    o.start_array();
    for(const captured_message &message:captured_messages){
        o.start_object();o.member("text",message.text);o.member("type",message.type);
        o.member("cooldown_hidden",message.hidden);o.member("native_turn",message.turn);o.end_object();
    }
    o.end_array();
    o.member("sounds");
    o.start_array();
    for(const captured_sound &sound:captured_sounds){
        o.start_object();o.member("position",sound.position);o.member("description",sound.description);
        o.member("category",sound.category);o.member("heard_volume",sound.volume);
        o.member("ambient",sound.ambient);o.member("native_turn",sound.turn);o.end_object();
    }
    o.end_array();
    o.end_object();
    std::ofstream f(std::string(directory())+"/turns.jsonl",std::ios::app);
    f<<buffer.str()<<'\n';
    turn(!captured_inputs.empty(),buffer.str());
    captured_inputs.clear();
    captured_messages.clear();
    captured_sounds.clear();
    capture_journal();
}
void finish(){if(started){write("exit",true);started=false;}}
void input_boundary(){
    if(!started||!directory())return;
    int request=0;std::ifstream file(std::string(directory())+"/input-request");file>>request;
    if(request<=last_request)return;last_request=request;write("input",true,request);
    std::ofstream ack(std::string(directory())+"/input-ack");ack<<request<<" "<<sequence<<" "<<to_turn<int>(calendar::turn);
}
void npc_moved( const npc &who ) {
    if( started && directory() && movement_probe_depth == 0 )
        last_moved_turn[who.getID().get_value()]=to_turn<int>(calendar::turn);
}
void movement_probe( bool active ) {
    if( active ) ++movement_probe_depth;
    else if( movement_probe_depth > 0 ) --movement_probe_depth;
}
void addressed( const npc &who ) {
    if( !started || !directory() ) return;
    pending_attention_ids.insert(who.getID().get_value());
}
void clear_attention() {
    pending_attention_ids.clear();
    attending_ids.clear();
}
}
