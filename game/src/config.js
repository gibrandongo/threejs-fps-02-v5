// SUNFALL YARD — shared tuning: teams, weapons, economy, rounds, motion.
// Single source of truth for every module; no other file hard-codes a balance number.
export const TEAMS = { ATT: 'att', DEF: 'def' };
export const TEAM_INFO = {
  att: { name: 'Ember', color: 0xc96a1e, css: '#e08a3c', cloth: 0x8a4a1c },
  def: { name: 'Slate', color: 0x2f7f78, css: '#4fae9d', cloth: 0x274d4a },
};
export const TEAM_NAMES = { att: 'Ember', def: 'Slate' };

// Deterministic PRNG (mulberry32) for map decoration and bot traits.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', slot: 'secondary', price: 0, damage: 26, headMult: 3.0, rpm: 352, mag: 12, reserve: 48, auto: false, spread: 0.012, moveSpread: 0.030, recoil: 0.011, reload: 1.4, range: 45, pellets: 1, zoom: 0 },
  smg: { id: 'smg', name: 'Kestrel-9', slot: 'primary', price: 1500, damage: 22, headMult: 3.0, rpm: 750, mag: 32, reserve: 96, auto: true, spread: 0.030, moveSpread: 0.045, recoil: 0.008, reload: 2.0, range: 35, pellets: 1, zoom: 0 },
  shotgun: { id: 'shotgun', name: 'M870 Breacher', slot: 'primary', price: 1200, damage: 9, headMult: 1.6, rpm: 70, mag: 6, reserve: 24, auto: false, spread: 0.085, moveSpread: 0.05, recoil: 0.030, reload: 2.6, range: 18, pellets: 8, zoom: 0 },
  rifle: { id: 'rifle', name: 'AR-7 Vantage', slot: 'primary', price: 2500, damage: 30, headMult: 3.0, rpm: 600, mag: 30, reserve: 90, auto: true, spread: 0.014, moveSpread: 0.042, recoil: 0.010, reload: 2.2, range: 60, pellets: 1, zoom: 0 },
  sniper: { id: 'sniper', name: 'LW-50 Longshot', slot: 'primary', price: 4000, damage: 95, headMult: 2.0, rpm: 45, mag: 5, reserve: 15, auto: false, spread: 0.055, moveSpread: 0.06, recoil: 0.045, reload: 3.0, range: 90, pellets: 1, zoom: 28, scopedSpread: 0.001 },
};
export const GRENADE_TYPES = {
  he: { id: 'he', name: 'HE Charge', price: 300, damage: 90, radius: 6.0, fuse: 1.6 },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 250, duration: 14, radius: 3.4 },
  flash: { id: 'flash', name: 'Flash Cell', price: 200, radius: 16, blind: 2.6, fuse: 1.4 },
};
export const ECON = {
  start: 800, kill: 300, win: 1400, loss: 900, streakStep: 200, streakMax: 1000,
  max: 16000, armor: 650, kit: 400, plantBonus: 300, defuseBonus: 300,
};
export const ROUND = {
  buyTime: 6, roundTime: 100, bombTime: 35, plantTime: 3.5, defuseTime: 5.0,
  winTarget: 8, maxRounds: 15, swapAt: 7, endTime: 4, pickupRadius: 1.4,
};
export const MOTION = {
  walk: 4.3, crouch: 2.2, sneak: 2.4, accel: 42, friction: 11, jumpVel: 4.8,
  gravity: 12.5, radius: 0.35, height: 1.7, eye: 1.6, crouchEye: 1.1, stepTime: 0.38,
};
export const PALETTE = {
  skyTop: 0x2a2350, skyHorizon: 0xe08a3c, fog: 0xd99a5b, sand: 0xc9a06a,
  sandDark: 0xa8824f, panel: 0x1d3a5f, panelEdge: 0x3a5a7a, rust: 0x8a4a22,
  concrete: 0x9a938a, crate: 0x7a5c33, dark: 0x2b2622, lamp: 0xffd9a0,
};
export const BOT_NAMES = {
  att: ['Dune', 'Cactus', 'Sol', 'Mira'],
  def: ['Rook', 'Fenn', 'Iris', 'Bram', 'Koda'],
};
