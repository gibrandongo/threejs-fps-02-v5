// SUNFALL YARD — scene construction and visual effects. Builds the three.js
// world from mapdata, owns soldier meshes, tracers, smoke and site beacons.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { PALETTE, TEAM_INFO, mulberry32 } from './config.js';

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function groundTexture() {
  const rng = mulberry32(1337);
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#c9a06a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      const v = rng();
      g.fillStyle = v < 0.5 ? 'rgba(120,90,50,0.25)' : 'rgba(240,215,160,0.22)';
      g.fillRect(rng() * s, rng() * s, 1 + rng() * 3, 1 + rng() * 3);
    }
    g.strokeStyle = 'rgba(90,65,35,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      const y = rng() * s;
      g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 22 - rng() * 44, s * 0.7, y + 22 - rng() * 44, s, y);
      g.stroke();
    }
  });
}

function skyTexture() {
  return canvasTexture(64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#241d4e'); grad.addColorStop(0.55, '#7a4a6e');
    grad.addColorStop(0.78, '#e08a3c'); grad.addColorStop(1, '#f5c07a');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  });
}

function letterTexture(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,16,12,0.55)';
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffd9a0'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffd9a0'; g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 64, 68);
  return new THREE.CanvasTexture(c);
}

const KIND_MAT = {};
function kindMaterial(kind) {
  if (KIND_MAT[kind]) return KIND_MAT[kind];
  let m;
  if (kind === 'panel') m = new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 0.35, metalness: 0.6 });
  else if (kind === 'crate') m = new THREE.MeshLambertMaterial({ color: PALETTE.crate });
  else if (kind === 'tank') m = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.5, metalness: 0.4 });
  else if (kind === 'building') m = new THREE.MeshLambertMaterial({ color: 0x8d8578 });
  else if (kind === 'rock') m = new THREE.MeshLambertMaterial({ color: 0x8f7a5c });
  else if (kind === 'barrier') m = new THREE.MeshLambertMaterial({ color: 0x6e6252 });
  else if (kind === 'concrete') m = new THREE.MeshLambertMaterial({ color: PALETTE.concrete });
  else m = new THREE.MeshLambertMaterial({ color: 0x7d7466 });
  KIND_MAT[kind] = m;
  return m;
}

export function buildWorld(scene) {
  scene.fog = new THREE.Fog(PALETTE.fog, 55, 150);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe0b0, fog: false, transparent: true, opacity: 0.9 })
  );
  sun.position.set(-60, 26, -140);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a7ab8, 0x8a6a45, 0.85));
  const dir = new THREE.DirectionalLight(0xffb070, 1.6);
  dir.position.set(-40, 35, -25);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -45; dir.shadow.camera.right = 45;
  dir.shadow.camera.top = 35; dir.shadow.camera.bottom = -35;
  dir.shadow.camera.far = 140;
  scene.add(dir);

  const groundTex = groundTexture();
  groundTex.repeat.set(10, 8);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(170, 130),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const s of MAP.solids) {
    const mesh = new THREE.Mesh(boxGeo, kindMaterial(s.kind));
    mesh.scale.set(s.w, s.h, s.d);
    mesh.position.set(s.x, s.h / 2, s.z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    if (s.kind === 'panel') {
      const face = new THREE.Mesh(boxGeo, kindMaterial('panel'));
      face.scale.set(s.w * 0.96, 0.08, s.d * 2.6);
      face.position.set(s.x, s.h + 0.35, s.z);
      face.rotation.x = -0.5;
      face.castShadow = true;
      scene.add(face);
      const post = new THREE.Mesh(boxGeo, kindMaterial('concrete'));
      post.scale.set(0.18, s.h + 0.3, 0.18);
      post.position.set(s.x, (s.h + 0.3) / 2, s.z);
      scene.add(post);
    }
    if (s.kind === 'building') {
      const winMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
      for (let i = -1; i <= 1; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), winMat);
        win.position.set(s.x + i * 2.6, s.h * 0.62, s.z + s.d / 2 + 0.02);
        scene.add(win);
      }
    }
    if (s.kind === 'tank') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), kindMaterial('tank'));
      cap.position.set(s.x, s.h, s.z);
      scene.add(cap);
    }
  }

  // Lamp poles with warm glow sprites.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a332c });
  const glowTex = letterTexture('•');
  for (const [lx, lz] of MAP.lamps) {
    const pole = new THREE.Mesh(boxGeo, poleMat);
    pole.scale.set(0.22, 5.4, 0.22);
    pole.position.set(lx, 2.7, lz);
    scene.add(pole);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0.95, depthWrite: false }));
    lamp.scale.set(1.4, 1.4, 1);
    lamp.position.set(lx, 5.5, lz);
    scene.add(lamp);
  }

  // Scattered decorative rocks (seeded, non-colliding).
  const rng = mulberry32(4242);
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rockMat = kindMaterial('rock');
  for (let i = 0; i < 26; i++) {
    const x = (rng() * 2 - 1) * 32, z = (rng() * 2 - 1) * 22;
    if (Math.abs(x) < 5 && Math.abs(z) < 12) continue;
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const sc = 0.4 + rng() * 0.9;
    rock.scale.set(sc, sc * 0.6, sc);
    rock.position.set(x, 0.15, z);
    rock.rotation.y = rng() * Math.PI;
    scene.add(rock);
  }

  // Bombsite beacons: ground ring + light beam + floating letter.
  const beacons = {};
  for (const key of ['A', 'B']) {
    const [cx, cz] = MAP.sites[key].center;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(MAP.sites[key].radius, 0.12, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 0.12, cz);
    scene.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.set(cx, 8, cz);
    scene.add(beam);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(key), transparent: true, depthWrite: false }));
    sprite.scale.set(3.2, 3.2, 1);
    sprite.position.set(cx, 4.6, cz);
    scene.add(sprite);
    beacons[key] = { ring, beam, sprite };
  }
  return { beacons, tracers: [], flashes: [], smokes: [] };
}

const SOLDIER_GEO = {};
function soldierGeo(name, w, h, d) {
  if (!SOLDIER_GEO[name]) SOLDIER_GEO[name] = new THREE.BoxGeometry(w, h, d);
  return SOLDIER_GEO[name];
}

// One humanoid per fighter, built from boxes. Parts are named for animation.
export function makeSoldier(team) {
  const info = TEAM_INFO[team];
  const cloth = new THREE.MeshLambertMaterial({ color: info.cloth });
  const accent = new THREE.MeshLambertMaterial({ color: info.color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23201c });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(soldierGeo('torso', 0.52, 0.62, 0.3), cloth);
  torso.position.y = 1.12;
  const vest = new THREE.Mesh(soldierGeo('vest', 0.56, 0.4, 0.34), accent);
  vest.position.y = 1.14;
  const head = new THREE.Mesh(soldierGeo('head', 0.32, 0.34, 0.32), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(soldierGeo('helmet', 0.38, 0.16, 0.38), dark);
  helmet.position.y = 1.78;
  const visor = new THREE.Mesh(soldierGeo('visor', 0.3, 0.08, 0.05), accent);
  visor.position.set(0, 1.64, 0.17);
  const legL = new THREE.Mesh(soldierGeo('leg', 0.2, 0.62, 0.2), dark);
  legL.geometry.translate(0, 0, 0);
  legL.position.set(-0.15, 0.62, 0);
  const legR = new THREE.Mesh(soldierGeo('leg', 0.2, 0.62, 0.2), dark);
  legR.position.set(0.15, 0.62, 0);
  const armR = new THREE.Mesh(soldierGeo('arm', 0.14, 0.5, 0.14), cloth);
  armR.position.set(0.34, 1.18, 0.12);
  const armL = new THREE.Mesh(soldierGeo('arm', 0.14, 0.5, 0.14), cloth);
  armL.position.set(-0.34, 1.18, 0.1);
  const gun = new THREE.Mesh(soldierGeo('gun', 0.08, 0.12, 0.62), dark);
  gun.position.set(0.3, 1.28, 0.42);
  g.add(torso, vest, head, helmet, visor, legL, legR, armR, armL, gun);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, parts: { legL, legR, armR, armL, head, gun } };
}

const _v = new THREE.Vector3();
export function syncSoldier(soldier, f, dt) {
  const g = soldier.group;
  g.position.copy(f.pos);
  g.rotation.y = f.yaw;
  if (!f.alive) {
    g.rotation.z = 1.45;
    g.position.y = 0.18;
    return;
  }
  g.rotation.z = 0;
  const speed = f.speed || 0;
  f.movePhase = (f.movePhase || 0) + dt * speed * 2.4;
  const swing = Math.min(0.6, speed * 0.14) * Math.sin(f.movePhase);
  soldier.parts.legL.rotation.x = swing;
  soldier.parts.legR.rotation.x = -swing;
  soldier.parts.armR.rotation.x = -f.pitch * 0.7 - 0.5;
  soldier.parts.head.rotation.x = -f.pitch * 0.4;
  const crouchScale = f.crouch ? 0.78 : 1;
  g.scale.y += (crouchScale - g.scale.y) * Math.min(1, dt * 10);
  _v.copy(f.pos);
}

export function spawnTracer(world, scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9 }));
  scene.add(line);
  world.tracers.push({ line, until: performance.now() + 70 });
}

export function spawnMuzzle(world, scene, pos) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, opacity: 1, depthWrite: false }));
  sprite.scale.set(0.55, 0.55, 1);
  sprite.position.copy(pos);
  scene.add(sprite);
  world.flashes.push({ sprite, until: performance.now() + 45 });
}

export function updateEffects(world, scene, now) {
  for (let i = world.tracers.length - 1; i >= 0; i--) {
    if (now > world.tracers[i].until) {
      scene.remove(world.tracers[i].line);
      world.tracers[i].line.geometry.dispose();
      world.tracers.splice(i, 1);
    }
  }
  for (let i = world.flashes.length - 1; i >= 0; i--) {
    if (now > world.flashes[i].until) {
      scene.remove(world.flashes[i].sprite);
      world.flashes.splice(i, 1);
    }
  }
}

export function updateBeacons(world, time) {
  for (const key of ['A', 'B']) {
    const b = world.beacons[key];
    const pulse = 0.55 + 0.25 * Math.sin(time * 2.2 + (key === 'A' ? 0 : 1.7));
    b.ring.material.opacity = pulse;
    b.sprite.position.y = 4.6 + Math.sin(time * 1.4) * 0.15;
  }
}
