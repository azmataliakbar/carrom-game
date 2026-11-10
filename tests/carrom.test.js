'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/physics.js');
const R = require('../js/rules.js');
const AI = require('../js/ai.js');
const CFG = { size: 800, pocketR: 30, friction: 0.75, restitution: 0.82, wallRestitution: 0.7, minSpeed: 8 };

function world() {
  return P.createWorld(CFG);
}

// ---------- Physics ----------

test('a piece at rest stays at rest', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'white', x: 400, y: 400, r: 16 });
  w.step(1);
  assert.equal(b.x, 400);
  assert.equal(b.y, 400);
  assert.ok(w.settled());
});

test('friction slows a sliding piece but does not stop it instantly', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'white', x: 400, y: 400, r: 16 });
  b.vx = 400;
  w.step(0.2);
  const v1 = Math.abs(b.vx);
  w.step(0.5);
  assert.ok(Math.abs(b.vx) < v1);
  assert.ok(Math.abs(b.vx) > 0);
});

test('two equal pieces exchange velocity on a head-on hit', () => {
  const w = P.createWorld(Object.assign({}, CFG, { friction: 0 }));
  const a = w.add({ id: 1, kind: 'striker', colour: 'striker', x: 200, y: 400, r: 20, m: 1 });
  const b = w.add({ id: 2, kind: 'coin', colour: 'white', x: 260, y: 400, r: 16, m: 1 });
  a.vx = 500;
  for (let i = 0; i < 60; i++) w.step(1 / 120);
  assert.ok(Math.abs(a.vx) < 50, 'the striker stops');
  assert.ok(b.vx > 400, 'the coin takes the speed');
});

test('the striker reports its first contact, even at a gentle touch', () => {
  const w = P.createWorld(Object.assign({}, CFG, { friction: 0 }));
  w.add({ id: 0, kind: 'striker', colour: 'striker', x: 200, y: 400, r: 20 });
  const c = w.add({ id: 1, kind: 'coin', colour: 'white', x: 240, y: 400, r: 16 });
  w.bodies()[0].vx = 20;
  let touched = null;
  for (let i = 0; i < 60; i++) {
    w.step(1 / 120);
    w.drainEvents().forEach((e) => { if (e.type === 'contact' && !touched) touched = e.a === c || e.b === c ? c : null; });
  }
  assert.equal(touched, c);
});

test('a piece that reaches a corner pocket is removed and reported', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'black', x: 40, y: 40, r: 16 });
  b.vx = -300;
  b.vy = -300;
  w.step(0.5);
  assert.equal(b.alive, false);
  assert.equal(b.pocketed, true);
  assert.ok(w.drainEvents().some((e) => e.type === 'pocket' && e.body === b));
});

test('a piece bounces off a cushion and stays on the board', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'white', x: 400, y: 400, r: 16 });
  b.vx = 800;
  for (let i = 0; i < 200; i++) w.step(1 / 120);
  assert.ok(b.x + b.r <= 800 + 1e-6 && b.x - b.r >= -1e-6);
  assert.ok(b.alive);
});

test('freeSpot finds a clear place when the wanted one is taken', () => {
  const w = world();
  w.add({ id: 1, kind: 'queen', colour: 'queen', x: 400, y: 400, r: 16 });
  const p = P.freeSpot(w, 16, 400, 400, 800);
  const dx = p.x - 400, dy = p.y - 400;
  assert.ok(Math.sqrt(dx * dx + dy * dy) >= 32);
});

// ---------- Rules ----------

const coin = (colour) => ({ kind: 'coin', colour, alive: false });
const queen = () => ({ kind: 'queen', colour: 'queen', alive: false });
const striker = () => ({ kind: 'striker', colour: 'striker', alive: false });
const touch = (colour) => ({ kind: 'coin', colour, alive: true });
const hitOk = (colour) => ({ firstTouch: touch(colour) });

test('seats hit white, black, white, black by default; a player can choose', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  assert.deepEqual(g.players.map((p) => p.colour), ['white', 'black', 'white', 'black']);
  const h = R.createGame([{ name: 'You', colour: 'black' }, { name: 'CPU', colour: 'white' }]);
  assert.deepEqual(h.players.map((p) => p.colour), ['black', 'white']);
});

test('scores follow the standard values: black 1, white 2, queen 5', () => {
  const g = R.createGame([{ name: 'A', colour: 'black' }, { name: 'B' }]);
  R.resolveShot(g, [coin('black')], 10, hitOk('black'));
  assert.equal(g.players[0].score, 1);
});

test('the first touch must be your colour, otherwise it is a foul', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  const r = R.resolveShot(g, [coin('white')], 10, { firstTouch: touch('black') });
  assert.equal(r.foul, true);
  assert.match(r.reason, /hit black first|must hit white/);
  assert.equal(g.players[0].score, -1, 'the white coin is returned and only the penalty counts');
  assert.equal(g.turn, 1);
});

test('no touch at all is a foul', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  const r = R.resolveShot(g, [], 10, { firstTouch: null });
  assert.equal(r.foul, true);
  assert.equal(g.turn, 1);
});

test('the queen counts as a first touch for either colour', () => {
  const g = R.createGame([{ name: 'A', colour: 'black' }, { name: 'B' }]);
  const r = R.resolveShot(g, [], 10, { firstTouch: { kind: 'queen', colour: 'queen' } });
  assert.equal(r.foul, false);
});

test('a legal pocket keeps the turn, a miss passes it', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  const r1 = R.resolveShot(g, [coin('white')], 10, hitOk('white'));
  assert.equal(r1.continues, true);
  assert.equal(g.turn, 0);
  R.resolveShot(g, [], 10, hitOk('white'));
  assert.equal(g.turn, 1);
});

test('the striker pocketed is a foul even with the right first touch', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  const r = R.resolveShot(g, [coin('white'), striker()], 10, hitOk('white'));
  assert.equal(r.foul, true);
  assert.equal(r.returned.length, 1);
  assert.equal(g.turn, 1);
});

test('the queen is covered by a coin of your own colour in the same shot', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  R.resolveShot(g, [queen(), coin('white')], 10, hitOk('white'));
  assert.equal(g.players[0].score, 5 + 2);
  assert.equal(g.queenHeld, false);
});

test('an uncovered queen is held, and covered by your colour next shot', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  const r1 = R.resolveShot(g, [queen()], 10, hitOk('white'));
  assert.equal(r1.queenResult, 'held');
  assert.equal(g.players[0].score, 0);
  R.resolveShot(g, [coin('white')], 10, hitOk('white'));
  assert.equal(g.players[0].score, 5 + 2);
});

test('an uncovered queen goes back if the next shot has no coin of your colour', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  R.resolveShot(g, [queen()], 10, hitOk('white'));
  const r = R.resolveShot(g, [coin('black')], 10, hitOk('white'));
  assert.equal(r.queenResult, 'returned');
  assert.equal(g.queenHeld, false);
});

test('the game ends when nothing is left on the board, and the highest score wins', () => {
  const g = R.createGame([{ name: 'A', colour: 'white' }, { name: 'B' }]);
  R.resolveShot(g, [coin('white')], 0, hitOk('white'));
  assert.equal(g.over, true);
  assert.equal(g.winner, 0);
  assert.throws(() => R.resolveShot(g, [], 0, hitOk('white')), /over/);
});

test('between one and four players are allowed', () => {
  assert.throws(() => R.createGame([]), /between 1 and 4/);
  assert.throws(() => R.createGame([{}, {}, {}, {}, {}]), /between 1 and 4/);
});

test('four players take turns in order', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push(g.turn);
    R.resolveShot(g, [], 10, hitOk(g.players[g.turn].colour));
  }
  assert.deepEqual(order, [0, 1, 2, 3]);
});

// ---------- Sides ----------

test('side frames map each baseline to the bottom and back again', () => {
  for (const side of [0, 1, 2, 3]) {
    for (const [x, y] of [[300, 690], [150, 110], [690, 400], [110, 500]]) {
      const l = AI.toLocal(800, side, x, y);
      const b = AI.fromLocal(800, side, l.x, l.y);
      assert.ok(Math.abs(b.x - x) < 1e-9 && Math.abs(b.y - y) < 1e-9, `side ${side}`);
    }
  }
});

test('a point on a side baseline maps onto the local bottom baseline', () => {
  const l = AI.toLocal(800, 2, 300, 110);
  assert.equal(l.y, 690, 'top baseline (y 110) is the far one: local y 690');
  const r = AI.toLocal(800, 1, 690, 400);
  assert.equal(r.y, 690, 'right baseline (x 690) is local y 690');
  const lf = AI.toLocal(800, 3, 110, 400);
  assert.equal(lf.y, 690, 'left baseline (x 110) is local y 690');
});

// ---------- Computer ----------

const AICFG = {
  size: 800, baselineY: 690, baselineMin: 150, baselineMax: 650, strikerR: 20, coinR: 16,
  maxShot: 2100, friction: 0.75, difficulty: { angle: 0.0005, power: 0.03, blockPenalty: 1.0 }
};
const POCKETS = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 800 }, { x: 800, y: 800 }];

test('the computer finds a shot at a clear coin and returns usable numbers', () => {
  const pieces = [
    { alive: true, kind: 'striker', colour: 'striker', x: 400, y: 690, r: 20 },
    { alive: true, kind: 'coin', colour: 'black', x: 400, y: 400, r: 16 },
  ];
  const rand = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const shot = AI.planForSide(pieces, POCKETS, AICFG, rand, 0, 'black');
  assert.ok(shot, 'a shot is found');
  assert.ok(shot.power >= 0.1 && shot.power <= 1);
  assert.ok(Math.abs(Math.hypot(shot.dirX, shot.dirY) - 1) < 1e-9, 'unit direction');
});

test('the computer only targets its own colour (or the queen)', () => {
  const pieces = [{ alive: true, kind: 'coin', colour: 'black', x: 400, y: 400, r: 16 }];
  assert.equal(AI.planForSide(pieces, POCKETS, AICFG, () => 0.5, 0, 'white'), null);
});

test('the computer plays from the far side too, with a direction pointing into the board', () => {
  const pieces = [{ alive: true, kind: 'coin', colour: 'white', x: 400, y: 400, r: 16 }];
  const top = AI.planForSide(pieces, POCKETS, AICFG, () => 0.5, 2, 'white');
  assert.ok(top, 'a shot from the top side');
  assert.ok(top.startY < 200, 'starts on the top baseline');
  assert.ok(top.dirY > 0, 'shoots down the board');
});

test('no coins means no shot', () => {
  assert.equal(AI.planForSide([{ alive: true, kind: 'striker', x: 400, y: 690, r: 20 }], POCKETS, AICFG, () => 0.5, 0, 'white'), null);
});

test('velocity from an angle: straight up with angle 0, and right with a positive angle', () => {
  const up = AI.velocityFor(0, 1, 1600);
  assert.ok(Math.abs(up.vx) < 1e-9 && up.vy < 0);
  const right = AI.velocityFor(Math.PI / 2, 1, 1600);
  assert.ok(right.vx > 0 && Math.abs(right.vy) < 1e-6);
});

test('the computer pockets a clean coin on every side in most tries', () => {
  let s = 11;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const side of [0, 1, 2, 3]) {
    let ok = 0, tot = 0;
    for (let trial = 0; trial < 12; trial++) {
      const w = P.createWorld(CFG);
      const cx = 220 + rand() * 360, cy = 260 + rand() * 260;
      const c = w.add({ id: 1, kind: 'coin', colour: 'white', x: cx, y: cy, r: 16 });
      const shot = AI.planForSide([c], w.pockets, Object.assign({}, AICFG, { powerFactor: 1.7 }), () => 0.5, side, 'white');
      if (!shot) continue;
      tot++;
      w.add({ id: 0, kind: 'striker', colour: 'striker', x: shot.startX, y: shot.startY, r: 20, m: 1.2 });
      const st = w.bodies()[1];
      st.vx = shot.dirX * shot.power * 2100;
      st.vy = shot.dirY * shot.power * 2100;
      let t = 0;
      while (t < 14) { w.step(1 / 120); t += 1 / 120; if (w.settled()) break; }
      if (!c.alive) ok++;
    }
    assert.ok(tot === 0 || ok / tot >= 0.6, `side ${side}: ${ok} of ${tot}`);
  }
});
