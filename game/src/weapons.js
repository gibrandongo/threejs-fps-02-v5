// SUNFALL YARD — weapon helpers: spread, recoil, reload and damage falloff.
// Pure functions over the WEAPONS table; combat.js resolves the hits.
import { WEAPONS } from './config.js';

export function weaponOf(f) {
  return WEAPONS[f.weapon] || WEAPONS.pistol;
}

// Spread in radians: base + movement + air + accumulated heat; scoped sniper is a laser.
export function spreadFor(f, w) {
  let s = w.spread;
  if (f.scope && w.scopedSpread !== undefined) s = w.scopedSpread;
  const moving = (f.speed || 0) > 0.6;
  if (moving) s += w.moveSpread * Math.min(1, (f.speed || 0) / 4.3);
  if (!f.onGround) s += 0.05;
  if (f.crouch) s *= 0.7;
  s += (f.heat || 0) * 0.012;
  return s;
}

export function applyRecoil(f, w, rng) {
  const kick = w.recoil * (0.85 + rng() * 0.3);
  f.pitch = Math.min(1.45, f.pitch + kick);
  f.yaw += (rng() - 0.5) * w.recoil * 0.5;
  f.heat = Math.min(1.6, (f.heat || 0) + (w.auto ? 0.16 : 0.1));
}

// Damage falls to 60% at the weapon's range, then stays flat.
export function damageAtRange(w, dist) {
  const t = Math.min(1, dist / w.range);
  return w.damage * (1 - 0.4 * t);
}

export function fireInterval(w) {
  return 60 / w.rpm;
}

export function canFire(f, w, now) {
  if (!f.alive || f.reloadUntil > now) return false;
  if ((f.mag[f.weapon] || 0) <= 0) return false;
  return now - (f.lastShot || -9) >= fireInterval(w) - 0.001;
}

export function startReload(f, w, now) {
  if ((f.mag[f.weapon] || 0) >= w.mag) return false;
  if ((f.reserve[f.weapon] || 0) <= 0) return false;
  if (f.reloadUntil > now) return false;
  f.reloadUntil = now + w.reload;
  f.reloading = true;
  return true;
}

export function finishReload(f, w) {
  const need = w.mag - (f.mag[f.weapon] || 0);
  const take = Math.min(need, f.reserve[f.weapon] || 0);
  f.mag[f.weapon] = (f.mag[f.weapon] || 0) + take;
  f.reserve[f.weapon] = (f.reserve[f.weapon] || 0) - take;
  f.reloading = false;
}
