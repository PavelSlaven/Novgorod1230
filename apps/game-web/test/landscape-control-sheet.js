import { renderLandscapeCanvas } from
  '../src/features/landscape/canvas.js';

const BASE = Object.freeze({
  environment: Object.freeze({
    profile_id: 'env.local_variable',
    node_category: 'spatial.g3.natural_feature',
    facts: Object.freeze([])
  }),
  day_part: 'day',
  weather: 'clear'
});

export const LANDSCAPE_CONTROL_SHEET_CASES = Object.freeze([
  entry('A', 'env.main_river_channel', 'day', 'clear'),
  entry('B', 'env.main_river_channel', 'night', 'fog'),
  entry('C', 'env.forest_track', 'evening', 'cloudy'),
  entry('D', 'env.wetland', 'dawn', 'fog'),
  entry('E', 'env.land_path', 'night', 'snow'),
  entry('F', 'env.shore_transition', 'dusk', 'rain'),
  entry('G', 'env.offroad', 'morning', 'overcast'),
  entry('H', 'env.side_channel', 'day', 'clear'),
  entry('I', 'env.local_variable', 'dawn', 'clear'),
  entry('J', 'env.main_river_channel', 'morning', 'cloudy'),
  entry('K', 'env.side_channel', 'evening', 'rain'),
  entry('L', 'env.land_path', 'day', 'overcast'),
  entry('M', 'env.forest_track', 'night', 'clear'),
  entry('N', 'env.wetland', 'dusk', 'snow'),
  entry('O', 'env.offroad', 'evening', 'fog'),
  entry('P', 'env.shore_transition', 'morning', 'cloudy'),
  entry('Q', 'env.land_path', 'day', 'clear', 'spatial.g3.settlement'),
  entry('R', 'env.offroad', 'dusk', 'overcast', 'spatial.g3.built_site')
]);

export function renderLandscapeControlSheet(document, root) {
  if (!document?.createElement || !root?.replaceChildren) {
    throw new TypeError('Control sheet requires a DOM root.');
  }
  const fragment = document.createDocumentFragment();
  for (const item of LANDSCAPE_CONTROL_SHEET_CASES) {
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    canvas.dataset.landscapeControlCase = item.id;
    const caption = document.createElement('figcaption');
    caption.textContent = `${item.id}: ${
      item.screen.visible_context.environment.profile_id
    } · ${item.screen.visible_context.day_part} · ${
      item.screen.visible_context.weather
    }`;
    figure.append(canvas, caption);
    fragment.append(figure);
    renderLandscapeCanvas(canvas, item.screen);
  }
  root.replaceChildren(fragment);
  return LANDSCAPE_CONTROL_SHEET_CASES.length;
}

function entry(id, profile, dayPart, weather,
  nodeCategory = 'spatial.g3.natural_feature') {
  return Object.freeze({
    id,
    screen: Object.freeze({
      visible_context: Object.freeze({
        ...BASE,
        environment: Object.freeze({
          ...BASE.environment,
          profile_id: profile,
          node_category: nodeCategory
        }),
        day_part: dayPart,
        weather
      })
    })
  });
}
