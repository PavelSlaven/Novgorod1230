#pragma once
#ifndef CATA_SRC_NOVGOROD_SEMANTIC_H
#define CATA_SRC_NOVGOROD_SEMANTIC_H

#include <string>

#include "coords_fwd.h"

class Character;
class Creature;
class JsonObject;
class JsonOut;

namespace novgorod_semantic
{
struct operation_result {
    bool applied = false;
    std::string json;
};

void write_observation( JsonOut &out );
operation_result apply_operation( const JsonObject &request );
operation_result finish_operation();
bool refuse_operation( const std::string &code );
void observe_heard_speech( const Character &listener, const tripoint_bub_ms &source,
                           const std::string &description );
void submit_live_intent( const std::string &intent, const std::string &target_actor_ref = "" );
void submit_live_intent( const std::string &intent, const Creature *target );
void set_live_input_for_test( const std::string &intent );
void live_input();
bool has_pending_live_activity();
void on_input_boundary();
}

#endif
