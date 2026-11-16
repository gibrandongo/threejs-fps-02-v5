// SUNFALL YARD — round and match flow: buy/live/end phases, bomb timer,
// economy, halftime side swap, and match victory.
import { ROUND, ECON } from './config.js';
import { MAP } from './mapdata.js';
import { resetFighterForRound } from './player.js';
import { assignRoles, botBuy } from './bots.js';
import { applyDamage } from './combat.js';

export function newRoundState() {
  return {
    phase: 'buy', t: ROUND.buyTime, num: 0,
    score: { att: 0, def: 0 },
    bomb: { state: 'carried', site: null, pos: null, timer: 0, carrier: null, planter: null, rewarded: false },
    targetSite: 'A',
    lossStreak: { att: 0, def: 0 },
    winReason: null, winner: null, endTimer: 0, beepTimer: 0,
  };
}

export function startMatch(state) {
  state.round = newRoundState();
  state.matchOver = false;
  state.winner = null;
  for (const f of state.fighters) {
    f.money = ECON.start;
    f.kills = 0; f.deaths = 0;
    f.primary = null; f.armor = 0;
    f.mag = { pistol: 12 };
    f.reserve = { pistol: 48 };
    f.grenades = { he: 0, smoke: 0, flash: 0 };
    f.hasKit = false;
  }
  startRound(state);
}

export function startRound(state) {
  const r = state.round;
  r.num++;
  r.phase = 'buy';
  r.t = ROUND.buyTime;
  r.winReason = null; r.winner = null;
  r.bomb = { state: 'carried', site: null, pos: null, timer: 0, carrier: null, planter: null, rewarded: false };
  const attSpawns = MAP.spawns.att, defSpawns = MAP.spawns.def;
  let ai = 0, di = 0;
  for (const f of state.fighters) {
    if (f.team === 'att') {
      resetFighterForRound(f, attSpawns[ai % attSpawns.length], Math.PI);
      ai++;
    } else {
      resetFighterForRound(f, defSpawns[di % defSpawns.length], 0);
      di++;
    }
  }
  assignRoles(state);
  for (const f of state.fighters) {
    if (f.isBot) botBuy(state, f);
  }
  state.grenades.length = 0;
  state.smokes.length = 0;
  state.sounds.length = 0;
  state.events.push({ type: 'roundstart', num: r.num, score: { ...r.score } });
}

function aliveCount(state, team) {
  let n = 0;
  for (const f of state.fighters) if (f.team === team && f.alive) n++;
  return n;
}

function endRound(state, winner, reason) {
  const r = state.round;
  if (r.phase === 'end') return;
  r.phase = 'end';
  r.winner = winner;
  r.winReason = reason;
  r.endTimer = ROUND.endTime;
  r.score[winner]++;
  const loser = winner === 'att' ? 'def' : 'att';
  r.lossStreak[winner] = 0;
  r.lossStreak[loser]++;
  for (const f of state.fighters) {
    if (f.team === winner) f.money = Math.min(ECON.max, f.money + ECON.win);
    else {
      const bonus = Math.min(ECON.streakMax, (r.lossStreak[loser] - 1) * ECON.streakStep);
      f.money = Math.min(ECON.max, f.money + ECON.loss + bonus);
    }
  }
  state.events.push({ type: 'roundend', winner, reason, score: { ...r.score }, num: r.num });
  // Match end or halftime swap.
  if (r.score[winner] >= ROUND.winTarget || r.num >= ROUND.maxRounds) {
    state.matchOver = true;
    state.winner = r.score.att === r.score.def ? 'draw' : (r.score.att > r.score.def ? 'att' : 'def');
  } else if (r.num === ROUND.swapAt) {
    for (const f of state.fighters) f.team = f.team === 'att' ? 'def' : 'att';
    state.events.push({ type: 'swap' });
  }
}

export function updateRound(state, dt) {
  const r = state.round;
  if (r.phase === 'buy') {
    r.t -= dt;
    if (r.t <= 0) {
      r.phase = 'live';
      r.t = ROUND.roundTime;
      state.events.push({ type: 'golive' });
    }
    return;
  }
  if (r.phase === 'end') {
    r.endTimer -= dt;
    if (r.endTimer <= 0) {
      if (state.matchOver) r.phase = 'done';
      else startRound(state);
    }
    return;
  }
  if (r.phase !== 'live') return;
  const bomb = r.bomb;
  // Plant reward, once.
  if (bomb.state === 'planted' && !bomb.rewarded) {
    bomb.rewarded = true;
    if (bomb.planter) bomb.planter.money = Math.min(ECON.max, bomb.planter.money + ECON.plantBonus);
  }
  if (bomb.state === 'defused') {
    endRound(state, 'def', 'defuse');
    return;
  }
  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    r.beepTimer -= dt;
    if (r.beepTimer <= 0) {
      r.beepTimer = bomb.timer < 10 ? 0.25 : 0.55;
      state.events.push({ type: 'beep', pos: bomb.pos });
    }
    if (bomb.timer <= 0) {
      bomb.state = 'exploded';
      state.events.push({ type: 'explode', pos: { x: bomb.pos.x, y: 0.4, z: bomb.pos.z }, owner: null, big: true });
      for (const f of state.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.pos.x - bomb.pos.x, f.pos.z - bomb.pos.z);
        if (d < 10) applyDamage(state, f, 220, 'blast', null, null);
      }
      endRound(state, 'att', 'bomb');
      return;
    }
  } else {
    r.t -= dt;
    if (r.t <= 0) {
      endRound(state, 'def', 'time');
      return;
    }
  }
  const attAlive = aliveCount(state, 'att');
  const defAlive = aliveCount(state, 'def');
  if (attAlive === 0) { endRound(state, 'def', 'elimination'); return; }
  if (defAlive === 0 && bomb.state !== 'planted') { endRound(state, 'att', 'elimination'); return; }
}
