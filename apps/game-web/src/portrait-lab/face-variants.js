import {
  cubicPoints,
  joinPointSets,
  quadraticPoints
} from './handmade.js';

export function noseLines(variant, nose) {
  const { axis, top, middle, bottom, noseWidth: width } = nose;
  const bases = [
    quadraticPoints(
      [axis - width, bottom],
      [axis, bottom + 7],
      [axis + width, bottom - 1], 11
    ),
    quadraticPoints(
      [axis - width * .8, bottom + 1],
      [axis + 4, bottom + 10],
      [axis + width, bottom], 10
    ),
    quadraticPoints(
      [axis - width * 1.2, bottom],
      [axis, bottom + 9],
      [axis + width * 1.2, bottom], 12
    ),
    quadraticPoints(
      [axis - width * .75, bottom],
      [axis, bottom + 7],
      [axis + width, bottom - 3], 10
    ),
    [
      [axis - 8, bottom - 7],
      [axis + 5, bottom + 1],
      [axis + width * .75, bottom - 3]
    ],
    [
      [axis - width * .8, bottom + 1],
      [axis + 2, bottom + 5],
      [axis + width, bottom]
    ],
    cubicPoints(
      [axis - width, bottom],
      [axis - width * .5, bottom + 8],
      [axis + width * .5, bottom - 5],
      [axis + width, bottom + 1], 10
    )
  ];
  const bridges = [
    cubicPoints(
      [axis - 2, top],
      [axis - 10, middle * .5],
      [axis - 12, middle],
      [axis - 5, bottom - 5], 15
    ),
    cubicPoints(
      [axis + 3, top - 8],
      [axis - 8, middle],
      [axis - 13, bottom - 2],
      [axis + 6, bottom + 3], 17
    ),
    quadraticPoints(
      [axis - 1, top],
      [axis - 8, middle],
      [axis - 3, bottom - 8], 13
    ),
    cubicPoints(
      [axis - 4, top],
      [axis - 1, middle * .72],
      [axis - 18, bottom - 13],
      [axis + 7, bottom + 1], 17
    ),
    quadraticPoints(
      [axis - 2, middle * .18],
      [axis - 10, middle],
      [axis - 7, bottom - 9], 10
    ),
    [
      [axis, top],
      [axis - width * .65, bottom - 2],
      [axis + 2, bottom + 5]
    ],
    joinPointSets(
      quadraticPoints(
        [axis + 1, top],
        [axis - 5, middle * .62],
        [axis - 3, middle], 8
      ),
      quadraticPoints(
        [axis - 4, middle + 10],
        [axis - 13, bottom - 5],
        [axis + 3, bottom + 2], 9
      )
    )
  ];
  return [bridges[variant], bases[variant]];
}
