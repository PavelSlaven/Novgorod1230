#pragma once
#ifndef CATA_SRC_NOVGOROD_SEMANTIC_H
#define CATA_SRC_NOVGOROD_SEMANTIC_H

#include <string>

#include "coords_fwd.h"

class Character;
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
void observe_heard_speech( const Character &listener, const tripoint_bub_ms &source,
                           const std::string &description );
void live_input();
void on_input_boundary();
}

#endif
