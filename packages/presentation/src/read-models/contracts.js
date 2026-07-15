import { deepFreeze } from '@rus/kernel';

export const FIRST_GAME_SCREEN_SCHEMA = 'first_game_screen';
export const TURN_SCREEN_SCHEMA = 'turn_screen';
export const PANEL_SCHEMA = 'presentation_panel';
export const INVENTORY_PANEL_SCHEMA = 'inventory_panel';
export const TRAVEL_PANEL_SCHEMA = 'travel_panel';
export const PRESENTATION_VERSION = 1;
export const PANEL_KINDS = deepFreeze([
  'character',
  'inventory',
  'people',
  'route',
  'map',
  'journal',
  'diagnostic'
]);
