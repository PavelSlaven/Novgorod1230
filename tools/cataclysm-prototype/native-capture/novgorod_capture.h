#pragma once
#include <vector>
#include <string>
#include "coordinates.h"
class Creature;
class npc;
namespace novgorod_capture {
void start();
void turn( bool input, const std::string &legacy );
void capture_initial();
void capture_input( const std::string &action, const std::vector<int> &keys, const std::string &text );
void capture_message( const std::string &text, int type, bool hidden );
void capture_sound( const tripoint_bub_ms &position, const std::string &description, int category,
                    int volume, bool ambient );
void capture_turn();
void finish();
void input_boundary();
void visible( const std::vector<Creature *> &creatures );
void npc_moved( const npc &who );
void movement_probe( bool active );
void addressed( const npc &who );
void clear_attention();
}
