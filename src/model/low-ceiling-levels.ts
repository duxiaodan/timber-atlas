// Inferred levels relative to column top, in metres. Liang 417/450/439/502
// support the F2 -> rear dou -> F3 sequence; these are not surveyed dou heights.
const ling = .4095 + 3 * .441;
const humpTop = .4095 + 2 * .441 + .315 / 2;
const humpFoot = .85 + .441 / 2;
const headHeight = .19;
const headCenter = ling + .23;
export const LOW_CEILING = {
  ling, humpTop, humpFoot,
  humpCenter: (humpTop + humpFoot) / 2,
  humpHeight: humpTop - humpFoot,
  baseHeight: (ling - .315 / 2 - humpTop) / .56,
  headHeight, headCenter,
  frameBottom: headCenter + .08 * headHeight,
  frameCenter: headCenter + .08 * headHeight + .08,
};
