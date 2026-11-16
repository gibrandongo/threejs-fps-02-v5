// SUNFALL YARD — fixed-step simulation core. Owns the match state and steps
// it at 60 Hz: player actions, bots, grenades, bomb channels, economy hooks.
import { MAP } from './mapdata.js';
import { ROUND, ECON, WEAPONS, GRENADE_TYPES, BOT_NAMES, mulberry32 } from './config.js';
import { makeFighter, moveFighter } from './player.js';
import { updateBot } from './bots.js';
import { fireHitscan, throwGrenade, updateGrenades } from './combat.js';
import { spreadFor, canFire, startReload, finishReload, weaponOf, applyRecoil } from './weapons.js';
import { newRoundState, updateRound } from './rounds.js';

export function createMatch() {
  const rng = mulberry32(20261117);
  const state = {
    fighters: [], solids: MAP.solids, grenades: [], smokes: [], sounds: [], events: [],
    time: 0, rng, round: newRoundState(), matchOver: false, winner: null,
    shake: 0, playerChannel: null, player: null,
  };
  const me = makeFighter('att', 'You', false);
  me.isPlayer = true;
  state.fighters.push(me);
  state.player = me;
  for (const n of BOT_NAMES.att) {
    const b = makeFighter('att', n, true);
    b.skill = 0.45 + rng() * 0.35;
    b.reaction = 0.42 - b.skill * 0.2;
    state.fighters.push(b);
  }
  for (const n of BOT_NAMES.def) {
    const b = makeFighter('def', n, true);
    b.skill = 0.45 + rng() * 0.35;
    b.reaction = 0.42 - b.skill * 0.2;
    state.fighters.push(b);
  }
  return state;
}

function inSite(me) {
  for (const key of ['A', 'B']) {
    const s = MAP.sites[key];
    if (Math.hypot(me.pos.x - s.center[0], me.pos.z - s.center[1]) < s.radius) return key;
  }
  return null;
}

function playerFire(state, me, w) {
  me.mag[me.weapon]--;
  me.lastShot = state.time;
  const spread = spreadFor(me, w);
  for (let p = 0; p < w.pellets; p++) {
    const evt = fireHitscan(state, me, w, spread, Math.random);
    if (evt) state.events.push(evt);
  }
  applyRecoil(me, w, Math.random);
  state.sounds.push({ pos: { x: me.pos.x, z: me.pos.z }, radius: w.id === 'sniper' ? 30 : 22, time: state.time, team: me.team, kind: 'shot' });
  state.events.push({ type: 'muzzle', fighter: me });
}

function updatePlayer(state, me, input, dt) {
  if (!me.alive) return;
  const [dx, dy] = input.consumeLook();
  const sens = me.scope ? 0.0011 : 0.0022;
  me.yaw -= dx * sens;
  me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - dy * sens));
  me.crouch = input.down('ControlLeft') || input.down('KeyC');
  const fwd = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
  const str = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
  const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
  let wx = -sin * fwd + cos * str;
  let wz = -cos * fwd - sin * str;
  if (input.down('ShiftLeft') || input.down('ShiftRight')) { wx *= 0.55; wz *= 0.55; }
  moveFighter(state, me, wx, wz, input.pressed('Space'), dt);
  if (input.pressed('Digit1') && me.primary) { me.weapon = me.primary; me.reloading = false; me.reloadUntil = 0; }
  if (input.pressed('Digit2')) { me.weapon = 'pistol'; me.reloading = false; me.reloadUntil = 0; }
  const w = weaponOf(me);
  me.scope = !!(input.mouseRight && w.zoom);
  const wantFire = w.auto ? input.mouseLeft : input.leftPressed;
  if (wantFire) {
    if (canFire(me, w, state.time)) playerFire(state, me, w);
    else if ((me.mag[me.weapon] || 0) <= 0 && input.leftPressed) {
      state.events.push({ type: 'dryfire' });
      if (startReload(me, w, state.time)) state.events.push({ type: 'reload', fighter: me });
    }
  }
  if (input.pressed('KeyR') && startReload(me, w, state.time)) state.events.push({ type: 'reload', fighter: me });
  if (input.pressed('KeyF')) {
    const order = ['he', 'smoke', 'flash'];
    me.selectedGrenade = order[(order.indexOf(me.selectedGrenade) + 1) % 3];
  }
  if (input.pressed('KeyG')) throwGrenade(state, me, me.selectedGrenade);
}

function updatePlayerChannel(state, me, input, dt) {
  state.playerChannel = null;
  if (!me.alive) return;
  const bomb = state.round.bomb;
  const holding = input.down('KeyE');
  const still = me.speed < 1;
  if (me.hasBomb && bomb.state === 'carried' && me.team === 'att') {
    const siteKey = inSite(me);
    if (siteKey) {
      if (holding && still) {
        me.plantProgress += dt;
        state.playerChannel = { label: `PLANTING BOMB — SITE ${siteKey}`, frac: me.plantProgress / ROUND.plantTime };
        if (me.plantProgress >= ROUND.plantTime) {
          bomb.state = 'planted'; bomb.site = siteKey;
          bomb.pos = { x: me.pos.x, y: 0.1, z: me.pos.z };
          bomb.timer = ROUND.bombTime; bomb.planter = me;
          me.hasBomb = false; me.plantProgress = 0;
          state.events.push({ type: 'planted', site: siteKey, fighter: me });
        }
      } else me.plantProgress = Math.max(0, me.plantProgress - dt * 2);
      return;
    }
  }
  if (bomb.state === 'planted' && me.team === 'def' && bomb.pos) {
    const d = Math.hypot(me.pos.x - bomb.pos.x, me.pos.z - bomb.pos.z);
    if (d < 1.8) {
      const need = me.hasKit ? ROUND.defuseTime / 2 : ROUND.defuseTime;
      if (holding && still) {
        me.defuseProgress += dt;
        state.playerChannel = { label: 'DEFUSING BOMB', frac: me.defuseProgress / need };
        if (me.defuseProgress >= need) {
          bomb.state = 'defused'; me.defuseProgress = 0;
          state.events.push({ type: 'defused', fighter: me });
        }
      } else me.defuseProgress = Math.max(0, me.defuseProgress - dt * 2);
      return;
    }
  }
  me.plantProgress = 0;
  me.defuseProgress = 0;
}

const BUY_KEYS = {
  Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'sniper',
  Digit5: 'armor', Digit6: 'kit', Digit7: 'he', Digit8: 'smoke', Digit9: 'flash',
};

export function buyItem(state, me, id) {
  if (state.round.phase !== 'buy' || !me.alive) return false;
  if (WEAPONS[id]) {
    const w = WEAPONS[id];
    if (me.money < w.price || me.primary === id) return false;
    me.money -= w.price;
    me.primary = id;
    me.mag[id] = w.mag;
    me.reserve[id] = w.reserve;
    me.weapon = id;
  } else if (id === 'armor') {
    if (me.money < ECON.armor || me.armor >= 100) return false;
    me.money -= ECON.armor;
    me.armor = 100;
  } else if (id === 'kit') {
    if (me.money < ECON.kit || me.hasKit) return false;
    me.money -= ECON.kit;
    me.hasKit = true;
  } else if (GRENADE_TYPES[id]) {
    const g = GRENADE_TYPES[id];
    if (me.money < g.price || (me.grenades[id] || 0) >= 2) return false;
    me.money -= g.price;
    me.grenades[id] = (me.grenades[id] || 0) + 1;
  } else return false;
  state.events.push({ type: 'buy', fighter: me, item: id });
  return true;
}

export function stepSim(state, input, dt) {
  state.time += dt;
  updateRound(state, dt);
  const me = state.player;
  const phase = state.round.phase;
  for (let i = state.sounds.length - 1; i >= 0; i--) {
    if (state.time - state.sounds[i].time > 2) state.sounds.splice(i, 1);
  }
  for (const f of state.fighters) {
    if (f.reloading && f.reloadUntil <= state.time) finishReload(f, weaponOf(f));
  }
  if (phase === 'live') {
    updatePlayer(state, me, input, dt);
    for (const f of state.fighters) if (f.isBot) updateBot(state, f, dt);
    // A completed defuse channel reports via event; latch the bomb state here
    // so the channel stops and updateRound can close the round next step.
    for (const evt of state.events) {
      if (evt.type === 'defused' && state.round.bomb.state === 'planted') state.round.bomb.state = 'defused';
    }
    updateGrenades(state, dt);
    updatePlayerChannel(state, me, input, dt);
    const bomb = state.round.bomb;
    if (bomb.state === 'dropped' && me.team === 'att' && me.alive && bomb.pos) {
      if (Math.hypot(me.pos.x - bomb.pos.x, me.pos.z - bomb.pos.z) < ROUND.pickupRadius) {
        me.hasBomb = true;
        bomb.state = 'carried';
        bomb.carrier = me;
        state.events.push({ type: 'pickup', fighter: me });
      }
    }
  } else {
    input.consumeLook();
    if (phase === 'buy') {
      // Spawn facing while frozen: attackers look north up the yard, defenders south.
      for (const f of state.fighters) f.yaw = f.team === 'att' ? 0 : Math.PI;
      for (const code of Object.keys(BUY_KEYS)) {
        if (input.pressed(code)) buyItem(state, me, BUY_KEYS[code]);
      }
    }
  }
  state.shake = Math.max(0, state.shake - dt * 2.2);
}
