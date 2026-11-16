// SUNFALL YARD — map data: solids (collision + visuals), sites, spawns, waypoints.
// Coordinates: x east/west, z north/south, y up. Attackers spawn south (+z),
// defenders north (-z). Site A sits in the west panel array, site B in the east yard.
export const MAP = {
  bounds: { x: 34, z: 24 },
  // Solids: axis-aligned boxes. kind picks the material in world.js.
  solids: [
    // Perimeter walls.
    { x: 0, z: -25, w: 72, d: 1, h: 4, kind: 'wall' },
    { x: 0, z: 25, w: 72, d: 1, h: 4, kind: 'wall' },
    { x: -35, z: 0, w: 1, d: 52, h: 4, kind: 'wall' },
    { x: 35, z: 0, w: 1, d: 52, h: 4, kind: 'wall' },
    // Solar panel rows (west array). Gaps between segments are lanes.
    { x: -27, z: -16, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -21, z: -16, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -15, z: -16, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -27, z: -9, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -21, z: -9, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -15, z: -9, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -27, z: -2, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -21, z: -2, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -15, z: -2, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -27, z: 5, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -21, z: 5, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    { x: -15, z: 5, w: 4.5, d: 1.4, h: 2.2, kind: 'panel' },
    // Mid road cover.
    { x: 0, z: 2, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: -2.5, z: -1, w: 1.4, d: 1.4, h: 1.2, kind: 'crate' },
    { x: 2.5, z: -2, w: 1.4, d: 1.4, h: 1.2, kind: 'crate' },
    { x: -4.5, z: 6, w: 1, d: 1, h: 3.4, kind: 'concrete' },
    { x: 4.5, z: -6, w: 1, d: 1, h: 3.4, kind: 'concrete' },
    { x: 0, z: 10, w: 5, d: 0.8, h: 1.1, kind: 'barrier' },
    // East maintenance yard.
    { x: 14, z: 2, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: 17, z: 5, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
    { x: 22, z: 0, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: 26, z: -3, w: 1.6, d: 1.6, h: 1.2, kind: 'crate' },
    { x: 27, z: 7, w: 4, d: 4, h: 5, kind: 'tank' },
    { x: 25, z: -16, w: 10, d: 7, h: 5, kind: 'building' },
    { x: 17, z: -15, w: 4, d: 3, h: 2.2, kind: 'building' },
    { x: 12, z: -6, w: 4, d: 0.8, h: 1.1, kind: 'barrier' },
    // West rocks and barriers.
    { x: -30, z: 14, w: 3, d: 2, h: 1.6, kind: 'rock' },
    { x: -8, z: -18, w: 2, d: 2, h: 1.4, kind: 'rock' },
    { x: -10, z: -6, w: 4, d: 0.8, h: 1.1, kind: 'barrier' },
    { x: -26, z: 10, w: 4, d: 0.8, h: 1.1, kind: 'barrier' },
    // Spawn cover.
    { x: -5, z: 16, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: 5, z: 17, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: -5, z: -17, w: 2, d: 2, h: 1.2, kind: 'crate' },
    { x: 5, z: -18, w: 2, d: 2, h: 1.2, kind: 'crate' },
  ],
  sites: {
    A: { center: [-20, -12], radius: 6 },
    B: { center: [20, -10], radius: 6 },
  },
  spawns: {
    att: [[-4, 21], [0, 22], [4, 21], [-2, 19], [2, 19]],
    def: [[-4, -21], [0, -22], [4, -21], [-2, -19], [2, -19]],
  },
  // Waypoint graph for bot navigation (BFS in bots.js).
  waypoints: [
    [0, 20], [-6, 16], [6, 16], [0, 10], [0, 2], [0, -6], [-8, 6], [-16, 4],
    [-22, -4], [-20, -12], [-14, -16], [8, 6], [16, 2], [22, -4], [20, -10],
    [14, -14], [0, -14], [-6, -20], [6, -20], [-28, -8], [28, -6], [-10, -10],
    [10, -8], [0, 16],
  ],
  edges: [
    [0, 1], [0, 2], [0, 23], [1, 6], [2, 11], [23, 3], [3, 4], [4, 5], [5, 16],
    [6, 7], [7, 8], [8, 9], [8, 19], [9, 10], [10, 21], [21, 5], [21, 16],
    [11, 12], [12, 13], [13, 14], [13, 20], [14, 15], [15, 22], [22, 5],
    [22, 16], [16, 17], [16, 18], [17, 10], [18, 15], [4, 6], [4, 11],
    [3, 6], [3, 11], [19, 9], [20, 14],
  ],
  // Non-colliding decoration: lamp poles and scattered rocks.
  lamps: [[-8, 12], [8, 12], [-8, -8], [8, -8], [-20, 0], [20, 8]],
};
