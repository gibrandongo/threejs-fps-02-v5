// SUNFALL YARD — boot, render loop, camera, viewmodel, and event wiring.
// Fixed-step simulation (60 Hz) is kept apart from rendering: the loop
// accumulates real time, steps the sim, then syncs meshes and the HUD.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { ROUND, WEAPONS, TEAM_INFO, TEAM_NAMES } from './config.js';
import { buildWorld, makeSoldier, syncSoldier, spawnTracer, spawnMuzzle, updateEffects, updateBeacons } from './world.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { createMatch, stepSim, buyItem } from './sim.js';
import { startMatch } from './rounds.js';
import { Hud } from './hud.js';
import { spreadFor, weaponOf } from './weapons.js';
import { eyePos, aimDir } from './combat.js';

const FIXED_DT = 1 / 60;
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
const audio = new AudioSys();
const input = new Input(canvas);

let state = createMatch();
let soldiers = new Map();
let started = false;
let paused = false;
let buyOpen = false;
let endShown = false;
let accumulator = 0;
let lastTime = performance.now();
let walkPhase = 0;
let viewKick = 0;
let playerFlashUntil = 0;
let shotMode = null;
let shotFrames = 0;

// --- viewmodel: gun + hands proxy attached to the camera ---
const viewmodel = new THREE.Group();
const vmDark = new THREE.MeshLambertMaterial({ color: 0x2a2521 });
const vmAccent = new THREE.MeshLambertMaterial({ color: 0x8a4a1c });
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), vmDark);
const vmBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), vmDark);
vmBarrel.position.set(0, 0.03, -0.32);
const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.09), vmAccent);
vmGrip.position.set(0, -0.11, 0.08);
const vmMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.1), vmDark);
vmMag.position.set(0, -0.12, -0.08);
viewmodel.add(vmBody, vmBarrel, vmGrip, vmMag);
viewmodel.position.set(0.26, -0.22, -0.45);
camera.add(viewmodel);
const vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
vmFlash.scale.set(0.22, 0.22, 1);
vmFlash.position.set(0.26, -0.19, -0.8);
vmFlash.renderOrder = 999;
camera.add(vmFlash);

// --- bomb mesh ---
const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.24), new THREE.MeshLambertMaterial({ color: 0x33302a }));
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
bombLight.position.set(0.1, 0.12, 0);
bombMesh.add(bombBox, bombLight);
bombMesh.visible = false;
scene.add(bombMesh);

// --- smoke sprite texture (radial gradient) ---
const smokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(200,200,200,0.85)');
  grad.addColorStop(0.6, 'rgba(180,180,180,0.5)');
  grad.addColorStop(1, 'rgba(170,170,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const smokeSprites = new Map();
const grenadeMeshes = new Map();

function rebuildSoldiers() {
  for (const s of soldiers.values()) scene.remove(s.group);
  soldiers = new Map();
  for (const f of state.fighters) {
    if (f.isPlayer) continue;
    const s = makeSoldier(f.team);
    scene.add(s.group);
    soldiers.set(f.id, s);
  }
}
rebuildSoldiers();

const hud = new Hud({
  onStart: () => {
    audio.ensure();
    started = true;
    hud.hideStart();
    startMatch(state);
    input.requestLock();
  },
  onResume: () => {
    paused = false;
    hud.showPause(false);
    input.requestLock();
  },
  onRestart: () => {
    state = createMatch();
    rebuildSoldiers();
    endShown = false;
    started = true;
    paused = false;
    hud.hideEnd();
    hud.showPause(false);
    hud.hideStart();
    startMatch(state);
    input.requestLock();
  },
  onBuy: (id) => {
    if (buyItem(state, state.player, id)) {
      audio.buy();
      hud.refreshBuy(state.player);
    }
  },
  onBuyClose: () => closeBuy(),
});

input.onLockChange = (locked) => {
  if (!locked && started && !state.matchOver && !buyOpen && !shotMode) {
    paused = true;
    hud.showPause(true);
  }
};

function openBuy() {
  if (state.round.phase !== 'buy') return;
  buyOpen = true;
  hud.showBuy(true, state.player);
  input.exitLock();
}
function closeBuy() {
  buyOpen = false;
  hud.showBuy(false);
  if (started && !state.matchOver) input.requestLock();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && started && !state.matchOver) {
    if (buyOpen) closeBuy();
    else openBuy();
  }
  if (e.code === 'KeyP' && started && !state.matchOver && !shotMode) {
    if (paused) { paused = false; hud.showPause(false); input.requestLock(); }
    else { paused = true; hud.showPause(true); input.exitLock(); }
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const _eye = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();

function teamColor(team) { return TEAM_INFO[team].css; }

function drainEvents() {
  const me = state.player;
  eyePos(me, _eye);
  for (const evt of state.events) {
    if (evt.type === 'shot') {
      _v3a.set(evt.from.x, evt.from.y, evt.from.z);
      _v3b.set(evt.to.x, evt.to.y, evt.to.z);
      spawnTracer(world, scene, _v3a, _v3b);
      const d = Math.hypot(evt.from.x - _eye.x, evt.from.z - _eye.z);
      if (d < 60) audio.shot(evt.weapon.id, evt.from, _eye, me.yaw);
    } else if (evt.type === 'muzzle') {
      const f = evt.fighter;
      if (f.isPlayer) { playerFlashUntil = performance.now() + 45; }
      else {
        eyePos(f, _eye);
        aimDir(f, _dir);
        _v3a.set(_eye.x + _dir.x * 0.7, _eye.y - 0.15 + _dir.y * 0.7, _eye.z + _dir.z * 0.7);
        spawnMuzzle(world, scene, _v3a);
      }
    } else if (evt.type === 'damage') {
      if (evt.target.isPlayer) { hud.damageFlash(); audio.hurt(); state.shake = Math.max(state.shake, 0.35); }
      if (evt.attacker && evt.attacker.isPlayer) { hud.hitmark(); audio.hit(); }
    } else if (evt.type === 'kill') {
      const a = evt.attacker, v = evt.victim;
      const aName = a ? `<b style="color:${teamColor(a.team)}">${a.name}</b>` : '💥';
      const vName = `<b style="color:${teamColor(v.team)}">${v.name}</b>`;
      const tag = evt.part === 'head' ? ' <span class="hs">HEADSHOT</span>' : '';
      hud.addKill(`${aName} ▸ ${vName}${tag}`);
      if (v.isPlayer) hud.showDeath(true, 'Spectating a teammate…');
    } else if (evt.type === 'roundstart') {
      hud.showDeath(false);
      hud.banner(`ROUND ${evt.num}`, `${TEAM_NAMES.att} ${evt.score.att} — ${evt.score.def} ${TEAM_NAMES.def}  •  Buy phase — press B`, 2400);
    } else if (evt.type === 'golive') {
      hud.banner('GO', me.team === 'att' ? 'Plant the bomb at Site A or B' : 'Defend the sites', 1600);
    } else if (evt.type === 'roundend') {
      const reasonText = { elimination: 'Enemy team eliminated', bomb: 'Bomb detonated', defuse: 'Bomb defused', time: 'Time expired' }[evt.reason] || '';
      hud.banner(`${TEAM_NAMES[evt.winner].toUpperCase()} WINS THE ROUND`, reasonText, 3200);
      audio.roundWin(evt.winner === 'att');
    } else if (evt.type === 'swap') {
      hud.banner('HALFTIME', 'Sides swapped', 3000);
    } else if (evt.type === 'planted') {
      hud.banner('BOMB PLANTED', `Site ${evt.site} — ${TEAM_NAMES.def} must defuse`, 3000);
      audio.plant();
    } else if (evt.type === 'defused') {
      hud.banner('BOMB DEFUSED', `${TEAM_NAMES.def} takes the round`, 3000);
    } else if (evt.type === 'beep') {
      audio.beep();
    } else if (evt.type === 'explode') {
      audio.explosion(evt.pos, _eye, me.yaw);
      const d = Math.hypot(evt.pos.x - _eye.x, evt.pos.z - _eye.z);
      if (d < 18) state.shake = Math.max(state.shake, 1.2 * (1 - d / 18));
    } else if (evt.type === 'flash') {
      if (state.time < (me.blindUntil || 0)) audio.flashRing();
    } else if (evt.type === 'radio') {
      if (evt.team === me.team) hud.addRadio(evt.name, evt.text, evt.team);
    } else if (evt.type === 'step') {
      const d = Math.hypot(evt.fighter.pos.x - _eye.x, evt.fighter.pos.z - _eye.z);
      if (d < 20 && !evt.fighter.isPlayer) audio.step(evt.fighter.pos, _eye, me.yaw, evt.sneak);
      else if (evt.fighter.isPlayer) audio.step(evt.fighter.pos, _eye, me.yaw, evt.sneak);
    } else if (evt.type === 'dryfire') audio.dryFire();
    else if (evt.type === 'reload') audio.reload();
    else if (evt.type === 'buy') { /* buy sound plays on click */ }
    else if (evt.type === 'pickup' && evt.fighter.isPlayer) { audio.pickup(); hud.banner('BOMB PICKED UP', 'Plant it at Site A or B — hold E', 2000); }
    else if (evt.type === 'bombdrop') hud.addRadio('HQ', 'The bomb is down!', me.team);
  }
  state.events.length = 0;
}

function syncGrenadeMeshes() {
  const seen = new Set();
  for (const g of state.grenades) {
    seen.add(g);
    let m = grenadeMeshes.get(g);
    if (!m) {
      const color = g.type === 'he' ? 0x3a3a2a : g.type === 'smoke' ? 0x888888 : 0xddddcc;
      m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshLambertMaterial({ color }));
      scene.add(m);
      grenadeMeshes.set(g, m);
    }
    m.position.set(g.pos.x, g.pos.y, g.pos.z);
  }
  for (const [g, m] of grenadeMeshes) {
    if (!seen.has(g)) { scene.remove(m); grenadeMeshes.delete(g); }
  }
}

function syncSmokeSprites() {
  const seen = new Set();
  for (const s of state.smokes) {
    seen.add(s);
    let sprites = smokeSprites.get(s);
    if (!sprites) {
      sprites = [];
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.7, depthWrite: false }));
        const ang = (i / 5) * Math.PI * 2;
        sp.position.set(s.pos.x + Math.cos(ang) * 1.2, s.pos.y + (i % 2) * 0.7, s.pos.z + Math.sin(ang) * 1.2);
        scene.add(sp);
        sprites.push(sp);
      }
      smokeSprites.set(s, sprites);
    }
    const age = state.time - s.born;
    const grow = Math.min(1, age / 1.2);
    const fade = Math.max(0, Math.min(1, (s.until - state.time) / 3));
    for (const sp of sprites) {
      const sc = s.radius * 1.7 * (0.5 + 0.5 * grow);
      sp.scale.set(sc, sc, 1);
      sp.material.opacity = 0.7 * fade;
    }
  }
  for (const [s, sprites] of smokeSprites) {
    if (!seen.has(s)) { for (const sp of sprites) scene.remove(sp); smokeSprites.delete(s); }
  }
}

function updateCamera(dt, now) {
  const me = state.player;
  let target = me;
  let spectating = null;
  if (!me.alive) {
    spectating = state.fighters.find((f) => f.team === me.team && f.alive && !f.isPlayer) || null;
    if (spectating) target = spectating;
  }
  for (const [id, s] of soldiers) {
    s.group.visible = !(spectating && spectating.id === id);
  }
  eyePos(target, _eye);
  camera.position.set(_eye.x, _eye.y, _eye.z);
  camera.rotation.y = target.yaw;
  camera.rotation.x = target.pitch;
  if (state.shake > 0.01) {
    camera.rotation.y += (Math.random() - 0.5) * state.shake * 0.05;
    camera.rotation.x += (Math.random() - 0.5) * state.shake * 0.05;
  }
  const w = weaponOf(me);
  const wantFov = me.scope && w.zoom ? w.zoom : 72;
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
  // Viewmodel bob, sway and recoil kick.
  const speed = me.speed || 0;
  walkPhase += dt * speed * 1.9;
  viewKick = Math.max(0, viewKick - dt * 6);
  viewmodel.visible = me.alive && !me.scope;
  viewmodel.position.x = 0.26 + Math.cos(walkPhase) * 0.006 * Math.min(1, speed / 4);
  viewmodel.position.y = -0.22 + Math.abs(Math.sin(walkPhase)) * 0.012 * Math.min(1, speed / 4) - viewKick * 0.02;
  viewmodel.position.z = -0.45 + viewKick * 0.05;
  viewmodel.rotation.x = viewKick * 0.35;
  vmFlash.material.opacity = now < playerFlashUntil ? 0.95 : 0;
  if (spectating) hud.showDeath(true, `Spectating ${spectating.name} — respawn next round`);
  return spectating;
}

function updateHints() {
  const me = state.player;
  const r = state.round;
  if (!me.alive) { hud.hint(''); return; }
  if (r.phase === 'buy') { hud.hint('B: buy menu  •  1–9: quick buy  •  Round starts soon'); return; }
  if (me.hasBomb) {
    const inA = Math.hypot(me.pos.x - MAP.sites.A.center[0], me.pos.z - MAP.sites.A.center[1]) < MAP.sites.A.radius;
    const inB = Math.hypot(me.pos.x - MAP.sites.B.center[0], me.pos.z - MAP.sites.B.center[1]) < MAP.sites.B.radius;
    hud.hint(inA || inB ? 'Hold E to plant the bomb' : 'Carry the bomb to Site A or B');
    return;
  }
  if (r.bomb.state === 'planted' && me.team === 'def') { hud.hint('Bomb planted — reach it and hold E to defuse'); return; }
  if (r.bomb.state === 'dropped' && me.team === 'att') { hud.hint('The bomb is down — walk over it to pick it up'); return; }
  hud.hint('WASD move • Mouse aim • R reload • G grenade • F cycle grenade • Ctrl crouch • Shift walk quietly');
}

// --- screenshot presets: real renders of the game's own code ---
const dummyInput = {
  consumeLook: () => [0, 0],
  down: () => false,
  pressed: () => false,
  mouseLeft: false, mouseRight: false, leftPressed: false,
};
function applyShotPreset(kind) {
  const me = state.player;
  const ff = (seconds) => {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) stepSim(state, dummyInput, FIXED_DT);
  };
  if (kind === 'buy') {
    hud.showBuy(true, me);
  } else if (kind === 'combat') {
    ff(10);
    me.pos.x = 0; me.pos.y = 0; me.pos.z = 7;
    me.yaw = 0.25; me.pitch = 0.02;
    me.primary = 'rifle'; me.weapon = 'rifle';
    me.mag.rifle = 30; me.reserve.rifle = 90;
  } else if (kind === 'plant') {
    ff(8);
    const bomb = state.round.bomb;
    bomb.state = 'planted'; bomb.site = 'A';
    bomb.pos = { x: -20, y: 0.1, z: -12 }; bomb.timer = 30;
    me.pos.x = -17; me.pos.y = 0; me.pos.z = -9;
    me.yaw = Math.atan2(3, 3); me.pitch = 0.04;
    me.primary = 'rifle'; me.weapon = 'rifle';
    me.mag.rifle = 30; me.reserve.rifle = 90;
  } else { // cover
    ff(8);
    me.pos.x = 0; me.pos.y = 0; me.pos.z = 19;
    me.yaw = 0; me.pitch = 0.03;
    me.primary = 'rifle'; me.weapon = 'rifle';
    me.mag.rifle = 30; me.reserve.rifle = 90;
  }
  state.events.length = 0;
}

function bootShotMode() {
  const params = new URLSearchParams(window.location.search);
  shotMode = params.get('shot');
  if (!shotMode) return;
  audio.ensure();
  started = true;
  hud.hideStart();
  startMatch(state);
  applyShotPreset(shotMode);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (started && !paused && !state.matchOver) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      stepSim(state, shotMode ? dummyInput : input, FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === 5) accumulator = 0;
  }
  drainEvents();
  const me = state.player;
  for (const f of state.fighters) {
    const s = soldiers.get(f.id);
    if (s) syncSoldier(s, f, dt);
  }
  // Bomb mesh.
  const bomb = state.round.bomb;
  if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.pos) {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.pos.x, 0.12, bomb.pos.z);
    const blink = bomb.state === 'planted' ? (Math.sin(state.time * 9) > 0 ? 1 : 0.15) : 0.6;
    bombLight.material.color.setRGB(1, 0.25 * blink, 0.25 * blink);
  } else bombMesh.visible = false;
  syncGrenadeMeshes();
  syncSmokeSprites();
  updateEffects(world, scene, now);
  updateBeacons(world, state.time);
  updateCamera(dt, now);
  // HUD.
  const w = weaponOf(me);
  const spread = spreadFor(me, w);
  hud.setCrosshairGap(7 + spread * 620);
  hud.setScope(!!(me.scope && w.zoom));
  hud.setFlash(Math.max(0, ((me.blindUntil || 0) - state.time) / 2.6));
  if (state.playerChannel) hud.setChannel(state.playerChannel.label, state.playerChannel.frac);
  else hud.setChannel(null);
  if (bomb.state === 'planted') hud.setBomb(bomb.timer / ROUND.bombTime, `BOMB — SITE ${bomb.site}`);
  else hud.setBomb(null);
  updateHints();
  hud.update(state, me, dt, now);
  input.endFrame();
  // Match end overlay.
  if (state.matchOver && state.round.phase === 'done' && !endShown) {
    endShown = true;
    input.exitLock();
    const s = state.round.score;
    const title = state.winner === 'draw' ? 'DRAW' : `${TEAM_NAMES[state.winner].toUpperCase()} WINS THE MATCH`;
    hud.showEnd(title, `Final score — ${TEAM_NAMES.att} ${s.att} : ${s.def} ${TEAM_NAMES.def}`);
  }
  renderer.render(scene, camera);
  if (shotMode) {
    shotFrames++;
    if (shotFrames === 4) window.__shotReady = true;
  }
}

bootShotMode();
if (!shotMode) hud.showStart();
frame();
