// SUNFALL YARD — HUD, menus and overlays. All DOM writes live here; the sim
// never touches the document. Minimap is a 2D canvas fed from mapdata + state.
import { MAP } from './mapdata.js';
import { WEAPONS, GRENADE_TYPES, ECON, TEAM_INFO } from './config.js';

const BUY_ITEMS = [
  { id: 'rifle', name: 'AR-7 Vantage Rifle', price: WEAPONS.rifle.price, key: '1' },
  { id: 'smg', name: 'Kestrel-9 SMG', price: WEAPONS.smg.price, key: '2' },
  { id: 'shotgun', name: 'M870 Breacher', price: WEAPONS.shotgun.price, key: '3' },
  { id: 'sniper', name: 'LW-50 Longshot', price: WEAPONS.sniper.price, key: '4' },
  { id: 'armor', name: 'Kevlar Armor', price: ECON.armor, key: '5' },
  { id: 'kit', name: 'Defuse Kit', price: ECON.kit, key: '6' },
  { id: 'he', name: 'HE Charge', price: GRENADE_TYPES.he.price, key: '7' },
  { id: 'smoke', name: 'Smoke Canister', price: GRENADE_TYPES.smoke.price, key: '8' },
  { id: 'flash', name: 'Flash Cell', price: GRENADE_TYPES.flash.price, key: '9' },
];

function el(id) { return document.getElementById(id); }

export class Hud {
  constructor(cb) {
    this.cb = cb;
    this.cache = {};
    for (const id of ['hp-num', 'hp-fill', 'armor-num', 'ammo-mag', 'ammo-res', 'weapon-name', 'money',
      'timer', 'score-att', 'score-def', 'round-label', 'killfeed', 'radio-feed', 'banner', 'banner-sub',
      'hitmarker', 'vignette', 'flash-overlay', 'bomb-wrap', 'bomb-label', 'bomb-fill', 'channel-wrap',
      'channel-label', 'channel-fill', 'buy-menu', 'buy-grid', 'buy-money', 'minimap', 'crosshair',
      'scope-overlay', 'start-overlay', 'pause-overlay', 'end-overlay', 'end-title', 'end-sub',
      'death-overlay', 'spectate-label', 'hint-bar', 'grenades', 'bomb-indicator', 'team-label', 'reload-tip']) {
      this.cache[id] = el(id);
    }
    this.mapCtx = this.cache['minimap'].getContext('2d');
    this.mapTimer = 0;
    this.bannerUntil = 0;
    this.hitUntil = 0;
    this.buildBuyGrid();
    el('start-btn').addEventListener('click', () => cb.onStart());
    el('resume-btn').addEventListener('click', () => cb.onResume());
    el('restart-btn-pause').addEventListener('click', () => cb.onRestart());
    el('restart-btn-end').addEventListener('click', () => cb.onRestart());
    el('buy-close').addEventListener('click', () => cb.onBuyClose());
  }

  buildBuyGrid() {
    const grid = this.cache['buy-grid'];
    grid.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.dataset.item = item.id;
      b.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span>`;
      b.addEventListener('click', () => this.cb.onBuy(item.id));
      grid.appendChild(b);
    }
  }

  refreshBuy(me) {
    this.cache['buy-money'].textContent = `$${me.money}`;
    for (const btn of this.cache['buy-grid'].children) {
      const item = BUY_ITEMS.find((i) => i.id === btn.dataset.item);
      btn.classList.toggle('cant', me.money < item.price);
      const owned = (item.id === 'armor' && me.armor >= 100) || (item.id === 'kit' && me.hasKit) ||
        (item.id === me.primary);
      btn.classList.toggle('owned', !!owned);
    }
  }

  showBuy(open, me) {
    this.cache['buy-menu'].classList.toggle('hidden', !open);
    if (open && me) this.refreshBuy(me);
  }

  showStart() { this.cache['start-overlay'].classList.remove('hidden'); }
  hideStart() { this.cache['start-overlay'].classList.add('hidden'); }
  showPause(on) { this.cache['pause-overlay'].classList.toggle('hidden', !on); }
  showEnd(title, sub) {
    this.cache['end-title'].textContent = title;
    this.cache['end-sub'].textContent = sub;
    this.cache['end-overlay'].classList.remove('hidden');
  }
  hideEnd() { this.cache['end-overlay'].classList.add('hidden'); }
  showDeath(on, text) {
    this.cache['death-overlay'].classList.toggle('hidden', !on);
    if (text) this.cache['spectate-label'].textContent = text;
  }

  banner(text, sub, ms) {
    this.cache['banner'].textContent = text;
    this.cache['banner-sub'].textContent = sub || '';
    this.cache['banner'].classList.remove('hidden');
    this.cache['banner-sub'].classList.toggle('hidden', !sub);
    this.bannerUntil = performance.now() + (ms || 2600);
  }

  addKill(html) {
    const feed = this.cache['killfeed'];
    const div = document.createElement('div');
    div.className = 'kill-entry';
    div.innerHTML = html;
    feed.prepend(div);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
  }

  addRadio(name, text, team) {
    const feed = this.cache['radio-feed'];
    const div = document.createElement('div');
    div.className = 'radio-entry';
    div.innerHTML = `<b style="color:${TEAM_INFO[team].css}">${name}:</b> ${text}`;
    feed.appendChild(div);
    while (feed.children.length > 4) feed.removeChild(feed.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }

  hitmark() {
    this.cache['hitmarker'].classList.add('show');
    this.hitUntil = performance.now() + 110;
  }

  damageFlash() {
    const v = this.cache['vignette'];
    v.classList.remove('pulse');
    void v.offsetWidth;
    v.classList.add('pulse');
  }

  setFlash(strength) {
    this.cache['flash-overlay'].style.opacity = strength > 0 ? Math.min(1, strength).toFixed(2) : '0';
  }

  setChannel(label, frac) {
    const wrap = this.cache['channel-wrap'];
    if (frac === null || frac === undefined) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    this.cache['channel-label'].textContent = label;
    this.cache['channel-fill'].style.width = `${Math.round(frac * 100)}%`;
  }

  setBomb(frac, label) {
    const wrap = this.cache['bomb-wrap'];
    if (frac === null || frac === undefined) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    this.cache['bomb-label'].textContent = label;
    this.cache['bomb-fill'].style.width = `${Math.round(frac * 100)}%`;
  }

  setScope(on) { this.cache['scope-overlay'].classList.toggle('hidden', !on); }
  setCrosshairGap(px) { this.cache['crosshair'].style.setProperty('--gap', `${px.toFixed(1)}px`); }
  hint(text) { this.cache['hint-bar'].textContent = text || ''; }

  fmtTime(t) {
    const s = Math.max(0, Math.ceil(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  update(state, me, dt, now) {
    const c = this.cache;
    const r = state.round;
    c['hp-num'].textContent = Math.max(0, Math.ceil(me.hp));
    c['hp-fill'].style.width = `${Math.max(0, me.hp)}%`;
    c['hp-fill'].style.background = me.hp > 50 ? '#7fc97f' : me.hp > 25 ? '#e0b13c' : '#e05252';
    c['armor-num'].textContent = Math.ceil(me.armor);
    const w = WEAPONS[me.weapon];
    c['weapon-name'].textContent = w.name;
    c['ammo-mag'].textContent = me.mag[me.weapon] || 0;
    c['ammo-res'].textContent = me.reserve[me.weapon] || 0;
    c['ammo-mag'].classList.toggle('low', (me.mag[me.weapon] || 0) <= Math.ceil(w.mag * 0.25));
    c['money'].textContent = `$${me.money}`;
    c['reload-tip'].classList.toggle('hidden', !me.reloading);
    c['score-att'].textContent = r.score.att;
    c['score-def'].textContent = r.score.def;
    c['round-label'].textContent = `ROUND ${Math.max(1, r.num)}/15`;
    c['team-label'].textContent = `YOU: ${TEAM_INFO[me.team].name.toUpperCase()}`;
    c['team-label'].style.color = TEAM_INFO[me.team].css;
    if (r.phase === 'buy') c['timer'].textContent = `BUY ${this.fmtTime(r.t)}`;
    else if (r.bomb.state === 'planted') c['timer'].textContent = `BOMB ${this.fmtTime(r.bomb.timer)}`;
    else c['timer'].textContent = this.fmtTime(r.t);
    c['bomb-indicator'].classList.toggle('hidden', !me.hasBomb);
    const g = me.grenades;
    c['grenades'].innerHTML =
      `<span class="${me.selectedGrenade === 'he' ? 'sel' : ''}">HE ×${g.he}</span>` +
      `<span class="${me.selectedGrenade === 'smoke' ? 'sel' : ''}">SMK ×${g.smoke}</span>` +
      `<span class="${me.selectedGrenade === 'flash' ? 'sel' : ''}">FLSH ×${g.flash}</span>`;
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerUntil = 0;
      c['banner'].classList.add('hidden');
      c['banner-sub'].classList.add('hidden');
    }
    if (this.hitUntil && now > this.hitUntil) {
      this.hitUntil = 0;
      c['hitmarker'].classList.remove('show');
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.12;
      this.drawMinimap(state, me);
    }
  }

  drawMinimap(state, me) {
    const g = this.mapCtx;
    const W = 168, H = 128;
    const sx = (x) => ((x + 35) / 70) * W;
    const sz = (z) => ((z + 25) / 50) * H;
    g.fillStyle = 'rgba(24,20,16,0.82)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#5a4c38';
    for (const s of MAP.solids) {
      if (s.kind === 'wall') continue;
      g.fillRect(sx(s.x - s.w / 2), sz(s.z - s.d / 2), Math.max(2, (s.w / 70) * W), Math.max(2, (s.d / 50) * H));
    }
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    for (const key of ['A', 'B']) {
      const [cx, cz] = MAP.sites[key].center;
      g.fillStyle = '#ffd9a0';
      g.beginPath(); g.arc(sx(cx), sz(cz), 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a140e';
      g.fillText(key, sx(cx), sz(cz) + 4);
    }
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const isMate = f.team === me.team;
      const near = Math.hypot(f.pos.x - me.pos.x, f.pos.z - me.pos.z) < 18;
      if (!isMate && !near) continue;
      g.fillStyle = TEAM_INFO[f.team].css;
      g.beginPath(); g.arc(sx(f.pos.x), sz(f.pos.z), f === me ? 4 : 3, 0, Math.PI * 2); g.fill();
      if (f === me) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(sx(f.pos.x), sz(f.pos.z), 5.5, 0, Math.PI * 2); g.stroke(); }
    }
    const bomb = state.round.bomb;
    if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.pos) {
      g.fillStyle = '#ffe14d';
      const bx = sx(bomb.pos.x), bz = sz(bomb.pos.z);
      g.fillRect(bx - 3, bz - 3, 6, 6);
    }
  }
}
