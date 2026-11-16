// SUNFALL YARD — bot brains: waypoint navigation (BFS), vision and hearing,
// burst fire with reaction time, plant/defuse channels, hold angles, radio.
import { MAP } from './mapdata.js';
import { ROUND, WEAPONS, ECON, GRENADE_TYPES } from './config.js';
import { fireHitscan, losClear, smokeBlocked, eyePos, aimDir } from './combat.js';
import { spreadFor, canFire, startReload, finishReload, weaponOf, applyRecoil } from './weapons.js';
import { moveFighter } from './player.js';

// Waypoint adjacency, built once.
let ADJ = null;
function adjacency() {
  if (ADJ) return ADJ;
  ADJ = MAP.waypoints.map(() => []);
  for (const [a, b] of MAP.edges) {
    ADJ[a].push(b);
    ADJ[b].push(a);
  }
  return ADJ;
}

function nearestWaypoint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i++) {
    const dx = MAP.waypoints[i][0] - x, dz = MAP.waypoints[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// BFS path of waypoint indices from (x,z) to (tx,tz).
export function findPath(x, z, tx, tz) {
  const adj = adjacency();
  const start = nearestWaypoint(x, z);
  const goal = nearestWaypoint(tx, tz);
  const prev = new Array(MAP.waypoints.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length) {
    const n = queue.shift();
    if (n === goal) break;
    for (const m of adj[n]) {
      if (prev[m] === -1) { prev[m] = n; queue.push(m); }
    }
  }
  if (prev[goal] === -1) return [goal];
  const path = [];
  let n = goal;
  while (n !== start) { path.unshift(n); n = prev[n]; }
  return path;
}

export function areaName(x, z) {
  const dA = Math.hypot(x - MAP.sites.A.center[0], z - MAP.sites.A.center[1]);
  const dB = Math.hypot(x - MAP.sites.B.center[0], z - MAP.sites.B.center[1]);
  if (dA < 8) return 'Site A';
  if (dB < 8) return 'Site B';
  if (Math.abs(x) < 6) return z > 12 ? 'Attacker Spawn' : z < -12 ? 'Defender Spawn' : 'Mid Road';
  if (x < -6) return 'West Array';
  return 'East Yard';
}

const _eyeA = { x: 0, y: 0, z: 0 };
const _eyeB = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };

function canSee(state, bot, enemy) {
  if (!enemy.alive || state.time < (bot.blindUntil || 0)) return false;
  const dx = enemy.pos.x - bot.pos.x, dz = enemy.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 42) return false;
  aimDir(bot, _dir);
  const facing = (-_dir.x * dx + -_dir.z * dz) / (dist || 1);
  if (facing < 0.25 && dist > 3) return false;
  eyePos(bot, _eyeA);
  eyePos(enemy, _eyeB);
  if (!losClear(state.solids, _eyeA, _eyeB)) return false;
  if (smokeBlocked(state.smokes, state.time, _eyeA, _eyeB)) return false;
  return true;
}

function radio(state, bot, text) {
  state.events.push({ type: 'radio', team: bot.team, name: bot.name, text });
}

// Per-round role assignment. Called once when a round starts.
export function assignRoles(state) {
  const rng = state.rng;
  const attBots = state.fighters.filter((f) => f.isBot && f.team === 'att');
  const defBots = state.fighters.filter((f) => f.isBot && f.team === 'def');
  const targetSite = rng() < 0.55 ? 'A' : 'B';
  state.round.targetSite = targetSite;
  const otherSite = targetSite === 'A' ? 'B' : 'A';
  attBots.forEach((b, i) => {
    b.site = i < 2 ? targetSite : i < 4 ? otherSite : targetSite;
    b.role = i === 0 ? 'carrier' : i === 4 ? 'mid' : 'entry';
    b.mode = 'advance';
    b.path = [];
    b.holdPos = null;
  });
  // Bomb carrier: first attacker bot.
  if (attBots[0]) {
    attBots[0].hasBomb = true;
    state.round.bomb.carrier = attBots[0];
    state.round.bomb.state = 'carried';
  }
  defBots.forEach((b, i) => {
    b.site = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
    b.role = i === 4 ? 'roam' : 'hold';
    b.mode = 'advance';
    b.path = [];
    const site = MAP.sites[b.site === 'mid' ? 'A' : b.site];
    const ang = rng() * Math.PI * 2;
    b.holdPos = b.site === 'mid'
      ? { x: 0, z: -4 }
      : { x: site.center[0] + Math.cos(ang) * 4.5, z: site.center[1] + Math.sin(ang) * 4.5 };
  });
}

export function botBuy(state, bot) {
  const m = bot.money;
  const buyPrimary = (id) => {
    const w = WEAPONS[id];
    if (bot.money >= w.price) {
      bot.money -= w.price;
      bot.primary = id;
      bot.mag[id] = w.mag;
      bot.reserve[id] = w.reserve;
      bot.weapon = id;
    }
  };
  if (m >= 3150) { buyPrimary('rifle'); }
  else if (m >= 2150) { buyPrimary('smg'); }
  else if (m >= 1200) { buyPrimary('shotgun'); }
  if (bot.money >= ECON.armor && bot.armor < 50) { bot.money -= ECON.armor; bot.armor = 100; }
  if (bot.money >= GRENADE_TYPES.he.price) { bot.money -= GRENADE_TYPES.he.price; bot.grenades.he++; }
  if (bot.money >= GRENADE_TYPES.smoke.price && state.rng() < 0.6) { bot.money -= GRENADE_TYPES.smoke.price; bot.grenades.smoke++; }
  if (bot.team === 'def' && bot.money >= ECON.kit && state.rng() < 0.5) { bot.money -= ECON.kit; bot.hasKit = true; }
  bot.weapon = bot.primary || 'pistol';
}

function setGoal(bot, tx, tz, state) {
  bot.goal = { x: tx, z: tz };
  bot.path = findPath(bot.pos.x, bot.pos.z, tx, tz);
  bot.pathIdx = 0;
  bot.stuckAt = state.time;
  bot.lastPos = { x: bot.pos.x, z: bot.pos.z };
}

function followPath(state, bot, dt) {
  if (!bot.goal) return [0, 0];
  let tx = bot.goal.x, tz = bot.goal.z;
  if (bot.pathIdx < bot.path.length) {
    const wp = MAP.waypoints[bot.path[bot.pathIdx]];
    tx = wp[0]; tz = wp[1];
    if (Math.hypot(tx - bot.pos.x, tz - bot.pos.z) < 1.3) {
      bot.pathIdx++;
      if (bot.pathIdx < bot.path.length) {
        const nx = MAP.waypoints[bot.path[bot.pathIdx]];
        tx = nx[0]; tz = nx[1];
      }
    }
  }
  const dx = tx - bot.pos.x, dz = tz - bot.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.9) return [0, 0];
  // Face movement direction when not engaging.
  if (!bot.target) {
    const wantYaw = Math.atan2(-dx, -dz);
    bot.yaw += shortestAngle(wantYaw - bot.yaw) * Math.min(1, dt * 8);
  }
  // Stuck detection: repath with a fresh BFS.
  if (state.time - bot.stuckAt > 0.7) {
    const moved = Math.hypot(bot.pos.x - bot.lastPos.x, bot.pos.z - bot.lastPos.z);
    if (moved < 0.25 && len > 1.5) {
      bot.path = findPath(bot.pos.x, bot.pos.z, bot.goal.x, bot.goal.z);
      bot.pathIdx = 0;
    }
    bot.stuckAt = state.time;
    bot.lastPos = { x: bot.pos.x, z: bot.pos.z };
  }
  return [dx / len, dz / len];
}

function shortestAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function perceive(state, bot) {
  // Vision scan.
  let nearest = null, nd = Infinity;
  for (const f of state.fighters) {
    if (f.team === bot.team || !f.alive) continue;
    if (!canSee(state, bot, f)) continue;
    const d = Math.hypot(f.pos.x - bot.pos.x, f.pos.z - bot.pos.z);
    if (d < nd) { nd = d; nearest = f; }
  }
  if (nearest) {
    if (!bot.target) {
      bot.firstSeenAt = state.time;
      bot.aimError = 0.35 + (1 - bot.skill) * 0.3;
      if (state.time - (bot.lastCallout || -99) > 8) {
        bot.lastCallout = state.time;
        radio(state, bot, `Contact ${areaName(nearest.pos.x, nearest.pos.z)}!`);
      }
    }
    bot.target = nearest;
    bot.lastSeen = state.time;
    bot.lastKnown = { x: nearest.pos.x, z: nearest.pos.z };
  } else if (bot.target && state.time - bot.lastSeen > 1.2) {
    bot.target = null;
  }
  // Hearing: recent gunshots pull idle bots toward the sound.
  if (!bot.target && state.sounds.length) {
    for (let i = state.sounds.length - 1; i >= 0; i--) {
      const s = state.sounds[i];
      if (state.time - s.time > 1.5) continue;
      const d = Math.hypot(s.pos.x - bot.pos.x, s.pos.z - bot.pos.z);
      if (d < s.radius && s.team !== bot.team) {
        bot.investigate = { x: s.pos.x, z: s.pos.z, until: state.time + 4 };
        break;
      }
    }
  }
}

function engage(state, bot, dt) {
  const t = bot.target;
  const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wantYaw = Math.atan2(-dx, -dz);
  const wantPitch = Math.atan2(1.35 - 1.6, dist);
  // Aim error shrinks as the bot tracks the target.
  bot.aimError = Math.max(0.02, (bot.aimError || 0.3) - dt * 0.55 * (0.5 + bot.skill));
  const err = bot.aimError * (0.6 + Math.sin(state.time * 3.1 + bot.id) * 0.4);
  bot.yaw += shortestAngle(wantYaw + err - bot.yaw) * Math.min(1, dt * (6 + bot.skill * 6));
  bot.pitch += (wantPitch - bot.pitch) * Math.min(1, dt * 8);
  // Strafe while fighting.
  bot.strafeT = (bot.strafeT || 0) - dt;
  if (bot.strafeT <= 0) {
    bot.strafeT = 0.5 + state.rng() * 0.7;
    bot.strafeDir = state.rng() < 0.5 ? -1 : 1;
  }
  const px = -dz / dist * bot.strafeDir, pz = dx / dist * bot.strafeDir;
  const w = weaponOf(bot);
  const reacted = state.time - (bot.firstSeenAt || 0) > bot.reaction;
  const aimed = Math.abs(shortestAngle(wantYaw - bot.yaw)) < 0.09;
  if (reacted && aimed && state.time > (bot.burstPauseUntil || 0)) {
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 2 + Math.floor(state.rng() * 3) + (w.auto ? 1 : 0);
    }
    if (canFire(bot, w, state.time) && bot.burstLeft > 0) {
      fireBotShot(state, bot, w);
      bot.burstLeft--;
      if (bot.burstLeft <= 0) bot.burstPauseUntil = state.time + 0.35 + state.rng() * 0.4;
    }
  }
  if ((bot.mag[bot.weapon] || 0) === 0) startReload(bot, w, state.time);
  moveFighter(state, bot, px * 0.7, pz * 0.7, false, dt);
  return true;
}

function fireBotShot(state, bot, w) {
  bot.mag[bot.weapon]--;
  bot.lastShot = state.time;
  const spread = spreadFor(bot, w) + (bot.aimError || 0) * 0.4;
  for (let p = 0; p < w.pellets; p++) {
    const evt = fireHitscan(state, bot, w, spread, state.rng);
    if (evt) state.events.push(evt);
  }
  applyRecoil(bot, w, state.rng);
  state.sounds.push({ pos: { x: bot.pos.x, z: bot.pos.z }, radius: w.id === 'sniper' ? 30 : 22, time: state.time, team: bot.team, kind: 'shot' });
  state.events.push({ type: 'muzzle', fighter: bot });
}

function channelPlant(state, bot, dt) {
  const site = MAP.sites[bot.site] || MAP.sites.A;
  const d = Math.hypot(bot.pos.x - site.center[0], bot.pos.z - site.center[1]);
  if (d > site.radius) return false;
  bot.plantProgress += dt;
  state.events.push({ type: 'planting', fighter: bot, progress: bot.plantProgress / ROUND.plantTime, site: bot.site });
  if (bot.plantProgress >= ROUND.plantTime) {
    state.round.bomb.state = 'planted';
    state.round.bomb.site = bot.site;
    state.round.bomb.pos = { x: bot.pos.x, y: 0.1, z: bot.pos.z };
    state.round.bomb.timer = ROUND.bombTime;
    bot.hasBomb = false;
    state.events.push({ type: 'planted', site: bot.site, fighter: bot });
    radio(state, bot, `Bomb planted at Site ${bot.site}!`);
    return true;
  }
  return true; // still channeling
}

function channelDefuse(state, bot, dt) {
  const bomb = state.round.bomb;
  const d = Math.hypot(bot.pos.x - bomb.pos.x, bot.pos.z - bomb.pos.z);
  if (d > 1.8) return false;
  const need = bot.hasKit ? ROUND.defuseTime / 2 : ROUND.defuseTime;
  bot.defuseProgress += dt;
  state.events.push({ type: 'defusing', fighter: bot, progress: bot.defuseProgress / need });
  if (bot.defuseProgress >= need) {
    state.events.push({ type: 'defused', fighter: bot });
    return true;
  }
  return true;
}

export function updateBot(state, bot, dt) {
  if (!bot.alive) return;
  if (bot.reloadUntil > state.time) {
    // Finish reload when its timer ends.
  } else if (bot.reloading) {
    finishReload(bot, weaponOf(bot));
  }
  // Staggered perception.
  bot.scanT = (bot.scanT || 0) - dt;
  if (bot.scanT <= 0) {
    bot.scanT = 0.12 + (bot.id % 5) * 0.02;
    perceive(state, bot);
  }
  if (bot.target) {
    engage(state, bot, dt);
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    return;
  }
  const bomb = state.round.bomb;
  // Defenders retake a planted bomb.
  if (bomb.state === 'planted' && bot.team === 'def') {
    const d = Math.hypot(bot.pos.x - bomb.pos.x, bot.pos.z - bomb.pos.z);
    if (d < 1.8) {
      if (channelDefuse(state, bot, dt)) return;
    } else {
      if (!bot.goal || Math.hypot(bot.goal.x - bomb.pos.x, bot.goal.z - bomb.pos.z) > 2) {
        setGoal(bot, bomb.pos.x, bomb.pos.z, state);
      }
      const [mx, mz] = followPath(state, bot, dt);
      moveFighter(state, bot, mx, mz, false, dt);
      return;
    }
  }
  // Attackers with the bomb plant when on site.
  if (bot.hasBomb && bomb.state === 'carried') {
    const site = MAP.sites[bot.site] || MAP.sites.A;
    const d = Math.hypot(bot.pos.x - site.center[0], bot.pos.z - site.center[1]);
    if (d < site.radius) {
      if (channelPlant(state, bot, dt)) return;
      moveFighter(state, bot, 0, 0, false, dt);
      return;
    }
  }
  // Attackers pick up a dropped bomb.
  if (bomb.state === 'dropped' && bot.team === 'att') {
    const d = Math.hypot(bot.pos.x - bomb.pos.x, bot.pos.z - bomb.pos.z);
    if (d < ROUND.pickupRadius) {
      bot.hasBomb = true;
      bomb.state = 'carried';
      bomb.carrier = bot;
      state.events.push({ type: 'pickup', fighter: bot });
      radio(state, bot, 'I have the bomb.');
    } else if (!bot.hasBomb && bot.role === 'carrier') {
      if (!bot.goal || Math.hypot(bot.goal.x - bomb.pos.x, bot.goal.z - bomb.pos.z) > 2) {
        setGoal(bot, bomb.pos.x, bomb.pos.z, state);
      }
      const [mx, mz] = followPath(state, bot, dt);
      moveFighter(state, bot, mx, mz, false, dt);
      return;
    }
  }
  // After the plant, attackers hold near the site.
  if (bomb.state === 'planted' && bot.team === 'att') {
    const site = MAP.sites[bomb.site];
    if (!bot.holdPos) {
      const ang = state.rng() * Math.PI * 2;
      bot.holdPos = { x: site.center[0] + Math.cos(ang) * 5, z: site.center[1] + Math.sin(ang) * 5 };
      setGoal(bot, bot.holdPos.x, bot.holdPos.z, state);
    }
    const d = Math.hypot(bot.pos.x - bot.holdPos.x, bot.pos.z - bot.holdPos.z);
    if (d > 1.2) {
      const [mx, mz] = followPath(state, bot, dt);
      moveFighter(state, bot, mx, mz, false, dt);
    } else {
      bot.yaw += Math.sin(state.time * 0.7 + bot.id) * dt * 0.6;
      moveFighter(state, bot, 0, 0, false, dt);
    }
    return;
  }
  // Investigate a heard sound.
  if (bot.investigate && state.time < bot.investigate.until) {
    if (!bot.goal || Math.hypot(bot.goal.x - bot.investigate.x, bot.goal.z - bot.investigate.z) > 2) {
      setGoal(bot, bot.investigate.x, bot.investigate.z, state);
    }
    const [mx, mz] = followPath(state, bot, dt);
    moveFighter(state, bot, mx, mz, false, dt);
    if (Math.hypot(bot.pos.x - bot.investigate.x, bot.pos.z - bot.investigate.z) < 1.5) bot.investigate = null;
    return;
  }
  bot.investigate = null;
  // Defenders: go to hold positions, then watch.
  if (bot.team === 'def' && bot.holdPos) {
    const d = Math.hypot(bot.pos.x - bot.holdPos.x, bot.pos.z - bot.holdPos.z);
    if (d > 1.2) {
      if (!bot.goal || Math.hypot(bot.goal.x - bot.holdPos.x, bot.goal.z - bot.holdPos.z) > 2) {
        setGoal(bot, bot.holdPos.x, bot.holdPos.z, state);
      }
      const [mx, mz] = followPath(state, bot, dt);
      moveFighter(state, bot, mx, mz, false, dt);
    } else {
      bot.crouch = bot.id % 2 === 0;
      bot.yaw += Math.sin(state.time * 0.5 + bot.id * 1.3) * dt * 0.5;
      moveFighter(state, bot, 0, 0, false, dt);
    }
    return;
  }
  // Attackers: push to their assigned site.
  const site = MAP.sites[bot.site] || MAP.sites.A;
  const goal = bot.role === 'mid' ? { x: 0, z: -4 } : { x: site.center[0], z: site.center[1] };
  if (!bot.goal || Math.hypot(bot.goal.x - goal.x, bot.goal.z - goal.z) > 2) {
    setGoal(bot, goal.x, goal.z, state);
  }
  const [mx, mz] = followPath(state, bot, dt);
  moveFighter(state, bot, mx, mz, false, dt);
}
