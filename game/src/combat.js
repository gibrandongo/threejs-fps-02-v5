// SUNFALL YARD — hitscan combat, damage, and grenades. Ray math is manual
// (slab test vs map boxes, sphere test vs fighters) so the sim never
// allocates in hot loops: shared temporaries only.
import { WEAPONS, GRENADE_TYPES, ECON } from './config.js';
import { damageAtRange } from './weapons.js';

// Ray vs axis-aligned box. Returns entry distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, box) {
  const minX = box.x - box.w / 2, maxX = box.x + box.w / 2;
  const minY = 0, maxY = box.h;
  const minZ = box.z - box.d / 2, maxZ = box.z + box.d / 2;
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return Infinity; }
  else {
    let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return Infinity; }
  else {
    let t1 = (minY - oy) / dy, t2 = (maxY - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return Infinity; }
  else {
    let t1 = (minZ - oz) / dz, t2 = (maxZ - oz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function mapHitDist(solids, o, d, maxDist) {
  let best = maxDist;
  for (let i = 0; i < solids.length; i++) {
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, solids[i]);
    if (t < best) best = t;
  }
  // Ground plane.
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t < best && t >= 0) best = t;
  }
  return best;
}

// Ray vs sphere. Returns distance or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tca - Math.sqrt(r2 - d2);
  return t >= 0 ? t : Infinity;
}

export function eyePos(f, out) {
  out.x = f.pos.x; out.y = f.pos.y + (f.crouch ? 1.1 : 1.6); out.z = f.pos.z;
  return out;
}

// Clear line of sight between two eye-level points (no smoke check).
export function losClear(solids, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-6) return true;
  const inv = 1 / len;
  const t = mapHitDist(solids, a, { x: dx * inv, y: dy * inv, z: dz * inv }, len - 0.05);
  return t >= len - 0.05;
}

// Does any live smoke cloud block the segment a->b?
export function smokeBlocked(smokes, now, a, b) {
  for (const s of smokes) {
    if (s.until < now) continue;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = s.pos.x - a.x, apy = s.pos.y - a.y, apz = s.pos.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz;
    let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t - s.pos.x, cy = a.y + aby * t - s.pos.y, cz = a.z + abz * t - s.pos.z;
    if (cx * cx + cy * cy + cz * cz < s.radius * s.radius) return true;
  }
  return false;
}

const _dir = { x: 0, y: 0, z: 0 };
const _eye = { x: 0, y: 0, z: 0 };
const _tmp = { x: 0, y: 0, z: 0 };

export function aimDir(f, out) {
  const cp = Math.cos(f.pitch);
  out.x = -Math.sin(f.yaw) * cp;
  out.y = Math.sin(f.pitch);
  out.z = -Math.cos(f.yaw) * cp;
  return out;
}

// One hitscan shot. Returns an event object for tracers/HUD/audio, or null.
export function fireHitscan(state, shooter, w, spread, rng) {
  const solids = state.solids;
  eyePos(shooter, _eye);
  aimDir(shooter, _dir);
  // Apply spread with a random perpendicular offset.
  const rx = (rng() - 0.5) * 2, ry = (rng() - 0.5) * 2;
  const right = { x: Math.cos(shooter.yaw), y: 0, z: -Math.sin(shooter.yaw) };
  const up = { x: 0, y: 1, z: 0 };
  _dir.x += right.x * rx * spread + up.x * ry * spread;
  _dir.y += right.y * rx * spread + up.y * ry * spread;
  _dir.z += right.z * rx * spread + up.z * ry * spread;
  const dl = Math.sqrt(_dir.x * _dir.x + _dir.y * _dir.y + _dir.z * _dir.z) || 1;
  _dir.x /= dl; _dir.y /= dl; _dir.z /= dl;
  const maxDist = w.range * 1.6;
  const mapT = mapHitDist(solids, _eye, _dir, maxDist);
  let bestT = mapT, bestF = null, bestPart = null;
  for (const f of state.fighters) {
    if (!f.alive || f === shooter || f.team === shooter.team) continue;
    const squash = f.crouch ? 0.72 : 1;
    const headT = raySphere(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, f.pos.x, f.pos.y + 1.55 * squash, f.pos.z, 0.24);
    const bodyT = raySphere(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, f.pos.x, f.pos.y + 1.0 * squash, f.pos.z, 0.5);
    let t = Infinity, part = null;
    if (headT < bodyT) { t = headT; part = 'head'; } else { t = bodyT; part = 'body'; }
    if (t < bestT) { bestT = t; bestF = f; bestPart = part; }
  }
  _tmp.x = _eye.x + _dir.x * bestT;
  _tmp.y = Math.max(0.02, _eye.y + _dir.y * bestT);
  _tmp.z = _eye.z + _dir.z * bestT;
  const evt = {
    type: 'shot', shooter, weapon: w, from: { x: _eye.x, y: _eye.y, z: _eye.z },
    to: { x: _tmp.x, y: _tmp.y, z: _tmp.z }, hit: null,
  };
  if (bestF) {
    let dmg = damageAtRange(w, bestT);
    if (bestPart === 'head') dmg *= w.headMult;
    applyDamage(state, bestF, dmg, bestPart, shooter, w);
    evt.hit = { target: bestF, part: bestPart, dist: bestT };
  }
  return evt;
}

export function applyDamage(state, target, dmg, part, attacker, weapon) {
  if (!target.alive) return;
  let dealt = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, dealt * 0.5);
    target.armor -= absorbed;
    dealt -= absorbed;
  }
  target.hp -= dealt;
  target.lastDamageAt = state.time;
  target.lastAttacker = attacker || null;
  state.events.push({ type: 'damage', target, attacker, part, amount: dealt, weapon });
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    target.deathTime = state.time;
    if (attacker && attacker !== target) {
      attacker.kills++;
      attacker.money = Math.min(ECON.max, attacker.money + ECON.kill);
    }
    state.events.push({ type: 'kill', victim: target, attacker, part, weapon });
    if (target.hasBomb) {
      target.hasBomb = false;
      state.round.bomb.state = 'dropped';
      state.round.bomb.pos = { x: target.pos.x, y: 0.1, z: target.pos.z };
      state.events.push({ type: 'bombdrop', pos: state.round.bomb.pos });
    }
  }
}

export function throwGrenade(state, f, type) {
  const def = GRENADE_TYPES[type];
  if (!def || (f.grenades[type] || 0) <= 0) return false;
  f.grenades[type]--;
  eyePos(f, _eye);
  aimDir(f, _dir);
  state.grenades.push({
    type, owner: f, pos: { x: _eye.x, y: _eye.y - 0.2, z: _eye.z },
    vel: { x: _dir.x * 12, y: _dir.y * 12 + 2.6, z: _dir.z * 12 },
    fuse: def.fuse !== undefined ? def.fuse : 1.6, bounced: 0,
  });
  state.events.push({ type: 'throw', fighter: f, gtype: type });
  return true;
}

export function updateGrenades(state, dt) {
  const solids = state.solids;
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.vel.y -= 12.5 * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.12) {
      g.pos.y = 0.12;
      if (Math.abs(g.vel.y) > 1.5 && g.bounced < 2) {
        g.vel.y *= -0.38; g.vel.x *= 0.6; g.vel.z *= 0.6; g.bounced++;
      } else { g.vel.y = 0; g.vel.x *= 0.86; g.vel.z *= 0.86; }
    }
    for (const s of solids) {
      const hw = s.w / 2, hd = s.d / 2;
      if (g.pos.y < s.h && Math.abs(g.pos.x - s.x) < hw + 0.12 && Math.abs(g.pos.z - s.z) < hd + 0.12) {
        const px = hw + 0.12 - Math.abs(g.pos.x - s.x);
        const pz = hd + 0.12 - Math.abs(g.pos.z - s.z);
        if (px < pz) { g.pos.x = s.x + Math.sign(g.pos.x - s.x) * (hw + 0.12); g.vel.x *= -0.4; }
        else { g.pos.z = s.z + Math.sign(g.pos.z - s.z) * (hd + 0.12); g.vel.z *= -0.4; }
      }
    }
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    state.grenades.splice(i, 1);
    if (g.type === 'he') explodeHE(state, g);
    else if (g.type === 'smoke') {
      state.smokes.push({ pos: { x: g.pos.x, y: 1.1, z: g.pos.z }, radius: GRENADE_TYPES.smoke.radius, until: state.time + GRENADE_TYPES.smoke.duration, born: state.time });
      state.events.push({ type: 'smoke', pos: g.pos });
    } else if (g.type === 'flash') flashBang(state, g);
  }
  for (let i = state.smokes.length - 1; i >= 0; i--) {
    if (state.smokes[i].until < state.time) state.smokes.splice(i, 1);
  }
}

function explodeHE(state, g) {
  const def = GRENADE_TYPES.he;
  state.events.push({ type: 'explode', pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z }, owner: g.owner });
  for (const f of state.fighters) {
    if (!f.alive) continue;
    const dx = f.pos.x - g.pos.x, dz = f.pos.z - g.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > def.radius) continue;
    eyePos(f, _tmp);
    if (!losClear(state.solids, { x: g.pos.x, y: g.pos.y + 0.3, z: g.pos.z }, _tmp) && dist > 1.5) continue;
    const dmg = def.damage * (1 - (dist / def.radius) * 0.7);
    applyDamage(state, f, dmg, 'blast', g.owner, WEAPONS.pistol);
  }
}

function flashBang(state, g) {
  const def = GRENADE_TYPES.flash;
  state.events.push({ type: 'flash', pos: { x: g.pos.x, y: g.pos.y, z: g.pos.z }, owner: g.owner });
  for (const f of state.fighters) {
    if (!f.alive) continue;
    const dx = f.pos.x - g.pos.x, dy = 1.4 - g.pos.y, dz = f.pos.z - g.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > def.radius) continue;
    eyePos(f, _tmp);
    if (!losClear(state.solids, { x: g.pos.x, y: g.pos.y + 0.3, z: g.pos.z }, _tmp)) continue;
    aimDir(f, _dir);
    const facing = -(_dir.x * dx + _dir.y * dy + _dir.z * dz) / (dist || 1);
    if (facing < -0.4) continue; // looking away
    const strength = 1 - dist / def.radius;
    f.blindUntil = Math.max(f.blindUntil || 0, state.time + 0.5 + def.blind * strength);
    if (f.isPlayer) state.events.push({ type: 'blinded', until: f.blindUntil });
  }
}
