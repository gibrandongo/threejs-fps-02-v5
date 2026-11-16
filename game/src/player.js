// SUNFALL YARD — fighter entities and movement. One factory for players and
// bots; axis-separated circle-vs-box collision shared by both.
import { MOTION, WEAPONS } from './config.js';

let NEXT_ID = 1;

export function makeFighter(team, name, isBot) {
  const f = {
    id: NEXT_ID++,
    team, name, isBot: !!isBot, isPlayer: false,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    hp: 100, armor: 0, money: 800,
    alive: true, crouch: false, onGround: true,
    weapon: 'pistol', primary: null,
    mag: { pistol: WEAPONS.pistol.mag },
    reserve: { pistol: WEAPONS.pistol.reserve },
    grenades: { he: 0, smoke: 0, flash: 0 },
    selectedGrenade: 'he',
    hasKit: false, hasBomb: false,
    heat: 0, lastShot: -9, reloadUntil: 0, reloading: false,
    blindUntil: 0, scope: false, speed: 0, movePhase: 0,
    kills: 0, deaths: 0, deathTime: -99,
    plantProgress: 0, defuseProgress: 0,
    stepTimer: 0, lastDamageAt: -99, lastAttacker: null,
    // Bot-only fields, filled by bots.js.
    skill: 0.5, reaction: 0.35, mode: 'idle', path: [], pathIdx: 0,
    target: null, aimYaw: 0, aimPitch: 0, burstLeft: 0, burstPauseUntil: 0,
    holdPos: null, site: 'A', lastSeen: -99, investigate: null, stuckAt: 0, lastPos: null,
  };
  return f;
}

export function resetFighterForRound(f, spawn, yaw) {
  f.pos.x = spawn[0]; f.pos.y = 0; f.pos.z = spawn[1];
  f.vel.x = 0; f.vel.y = 0; f.vel.z = 0;
  f.yaw = yaw; f.pitch = 0;
  f.hp = 100; f.alive = true;
  f.heat = 0; f.reloadUntil = 0; f.reloading = false;
  f.blindUntil = 0; f.scope = false; f.speed = 0;
  f.plantProgress = 0; f.defuseProgress = 0;
  f.hasBomb = false;
  f.mode = 'idle'; f.path = []; f.pathIdx = 0; f.target = null;
  f.burstLeft = 0; f.investigate = null; f.holdPos = null;
  if (!f.primary) f.weapon = 'pistol';
  else f.weapon = f.primary;
  for (const id of Object.keys(f.mag)) f.mag[id] = WEAPONS[id].mag;
}

// Push a circle (x/z) out of every overlapping solid. Returns true if pushed.
function collideCircle(pos, radius, solids) {
  let pushed = false;
  for (const s of solids) {
    if (pos.y >= s.h) continue;
    const hw = s.w / 2 + radius, hd = s.d / 2 + radius;
    const dx = pos.x - s.x, dz = pos.z - s.z;
    if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
    const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
    if (px < pz) pos.x = s.x + Math.sign(dx || 1) * hw;
    else pos.z = s.z + Math.sign(dz || 1) * hd;
    pushed = true;
  }
  return pushed;
}

export function moveFighter(state, f, wishX, wishZ, wantJump, dt) {
  const solids = state.solids;
  const speed = f.crouch ? MOTION.crouch : MOTION.walk;
  const wl = Math.sqrt(wishX * wishX + wishZ * wishZ);
  let tx = 0, tz = 0;
  if (wl > 0.01) { tx = (wishX / wl) * speed; tz = (wishZ / wl) * speed; }
  const accel = f.onGround ? MOTION.accel : MOTION.accel * 0.35;
  f.vel.x += (tx - f.vel.x) * Math.min(1, accel * dt / Math.max(1, speed));
  f.vel.z += (tz - f.vel.z) * Math.min(1, accel * dt / Math.max(1, speed));
  if (wl <= 0.01 && f.onGround) {
    f.vel.x -= f.vel.x * Math.min(1, MOTION.friction * dt);
    f.vel.z -= f.vel.z * Math.min(1, MOTION.friction * dt);
  }
  if (wantJump && f.onGround) {
    f.vel.y = MOTION.jumpVel;
    f.onGround = false;
  }
  f.vel.y -= MOTION.gravity * dt;
  f.pos.x += f.vel.x * dt;
  f.pos.z += f.vel.z * dt;
  f.pos.y += f.vel.y * dt;
  if (f.pos.y <= 0) { f.pos.y = 0; f.vel.y = 0; f.onGround = true; }
  collideCircle(f.pos, MOTION.radius, solids);
  // Map bounds.
  f.pos.x = Math.max(-33.5, Math.min(33.5, f.pos.x));
  f.pos.z = Math.max(-23.5, Math.min(23.5, f.pos.z));
  f.speed = Math.sqrt(f.vel.x * f.vel.x + f.vel.z * f.vel.z);
  // Footstep noise + timer for audio.
  if (f.speed > 0.8 && f.onGround) {
    f.stepTimer -= dt;
    if (f.stepTimer <= 0) {
      f.stepTimer = MOTION.stepTime * (4.3 / Math.max(1, f.speed));
      state.events.push({ type: 'step', fighter: f, sneak: f.crouch });
    }
  }
  // Recoil heat decays; pitch recovers toward the pre-shot baseline slowly.
  f.heat = Math.max(0, (f.heat || 0) - dt * 1.4);
}
