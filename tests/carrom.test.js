'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/physics.js');
const R = require('../js/rules.js');
const AI = require('../js/ai.js');
const CFG = { size: 800, pocketR: 26, friction: 0.9, restitution: 0.82, wallRestitution: 0.7, minSpeed: 8 };

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

test('friction slows a sliding piece', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'white', x: 400, y: 400, r: 16 });
  b.vx = 400;
  w.step(0.2);
  const v1 = Math.abs(b.vx);
  w.step(0.5);
  assert.ok(Math.abs(b.vx) < v1, 'speed falls over time');
  assert.ok(Math.abs(b.vx) > 0, 'but not instantly');
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

test('a hit above the threshold is reported as an event', () => {
  const w = P.createWorld(Object.assign({}, CFG, { friction: 0 }));
  w.add({ id: 1, kind: 'striker', colour: 'striker', x: 200, y: 400, r: 20 });
  w.add({ id: 2, kind: 'coin', colour: 'white', x: 260, y: 400, r: 16 });
  w.bodies()[0].vx = 500;
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    w.step(1 / 120);
    hits += w.drainEvents().filter((e) => e.type === 'hit').length;
  }
  assert.ok(hits >= 1);
});

test('a piece that reaches a corner pocket is removed and reported', () => {
  const w = world();
  const b = w.add({ id: 1, kind: 'coin', colour: 'black', x: 40, y: 40, r: 16 });
  b.vx = -300;
  b.vy = -300;
  w.step(0.5);
  assert.equal(b.alive, false);
  assert.equal(b.pocketed, true);
  const ev = w.drainEvents().find((e) => e.type === 'pocket');
  assert.ok(ev && ev.body === b);
});

test('a piece bounces off a cushion and keeps inside the board', () => {
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
  assert.ok(Math.sqrt(dx * dx + dy * dy) >= 32, 'a spot clear of the queen');
});

// ---------- Rules ----------

const coin = (colour) => ({ kind: 'coin', colour, alive: false });
const queen = () => ({ kind: 'queen', colour: 'queen', alive: false });
const striker = () => ({ kind: 'striker', colour: 'striker', alive: false });

test('scores follow the standard values: black 1, white 2, queen 5', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  R.resolveShot(g, [coin('black')], 10);
  assert.equal(g.players[0].score, 1);
  R.resolveShot(g, [coin('white')], 10);
  assert.equal(g.players[0].score, 3);
});

test('a legal pocket keeps the turn, a miss passes it', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  const r1 = R.resolveShot(g, [coin('black')], 10);
  assert.equal(r1.continues, true);
  assert.equal(g.turn, 0);
  R.resolveShot(g, [], 10);
  assert.equal(g.turn, 1);
});

test('a foul returns the coins, costs a point and passes the turn', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  const r = R.resolveShot(g, [coin('white'), striker()], 10);
  assert.equal(r.foul, true);
  assert.equal(g.players[0].score, -1 + 0, 'white is returned, only the penalty counts');
  assert.equal(r.returned.length, 1);
  assert.equal(g.turn, 1);
});

test('the queen is covered when pocketed with a white coin in the same shot', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  R.resolveShot(g, [queen(), coin('white')], 10);
  assert.equal(g.players[0].score, 5 + 2);
  assert.equal(g.queenHeld, false);
});

test('an uncovered queen is held, then covered by a white in the next shot', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  const r1 = R.resolveShot(g, [queen()], 10);
  assert.equal(r1.queenResult, 'held');
  assert.equal(g.players[0].score, 0, 'no points until covered');
  R.resolveShot(g, [coin('white')], 10);
  assert.equal(g.players[0].score, 5 + 2);
  assert.equal(g.queenHeld, false);
});

test('an uncovered queen is returned if the next shot has no white coin', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  R.resolveShot(g, [queen()], 10);
  const r = R.resolveShot(g, [coin('black')], 10);
  assert.equal(r.queenResult, 'returned');
  assert.equal(g.players[0].score, 1, 'only the black coin scores');
  assert.equal(g.queenHeld, false);
});

test('a foul on the cover shot returns the held queen', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  R.resolveShot(g, [queen()], 10);
  const r = R.resolveShot(g, [striker()], 10);
  assert.equal(r.queenResult, 'returned');
  assert.equal(g.queenHeld, false);
});

test('the game ends when nothing is left on the board, and the highest score wins', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }]);
  R.resolveShot(g, [coin('white')], 0);
  assert.equal(g.over, true);
  assert.equal(g.winner, 0);
  assert.throws(() => R.resolveShot(g, [], 0), /over/);
});

test('between one and four players are allowed', () => {
  assert.throws(() => R.createGame([]), /between 1 and 4/);
  assert.throws(() => R.createGame([{}, {}, {}, {}, {}]), /between 1 and 4/);
  assert.equal(R.createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]).players.length, 4);
});

test('four players take turns in order', () => {
  const g = R.createGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  const order = [];
  for (let i = 0; i < 4; i++) {
    order.push(g.turn);
    R.resolveShot(g, [], 10);
  }
  assert.deepEqual(order, [0, 1, 2, 3]);
});

// ---------- Computer ----------

const AICFG = {
  size: 800, baselineY: 690, baselineMin: 150, baselineMax: 650, strikerR: 20, coinR: 16, maxShot: 1600, friction: 0.9,
  difficulty: { angle: 0.015, power: 0.04, blockPenalty: 1.0 }
};

test('the computer finds a shot at a clear coin and returns usable numbers', () => {
  const pieces = [
    { alive: true, kind: 'striker', colour: 'striker', x: 400, y: 690, r: 20 },
    { alive: true, kind: 'coin', colour: 'black', x: 400, y: 400, r: 16 },
  ];
  const pockets = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 800 }, { x: 800, y: 800 }];
  const rand = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const shot = AI.planShot(pieces, pockets, AICFG, rand);
  assert.ok(shot, 'a shot is found');
  assert.ok(shot.power >= 0.1 && shot.power <= 1);
  assert.ok(shot.startX >= 150 && shot.startX <= 650);
  assert.ok(Math.abs(shot.angle) < Math.PI);
});

test('no coins means no shot', () => {
  const pockets = [{ x: 0, y: 0 }];
  assert.equal(AI.planShot([{ alive: true, kind: 'striker', x: 400, y: 690, r: 20 }], pockets, AICFG, () => 0.5), null);
});

test('velocity from an angle: straight up with angle 0, and right with a positive angle', () => {
  const up = AI.velocityFor(0, 1, 1600);
  assert.ok(Math.abs(up.vx) < 1e-9 && up.vy < 0);
  const right = AI.velocityFor(Math.PI / 2, 1, 1600);
  assert.ok(right.vx > 0 && Math.abs(right.vy) < 1e-6);
});

test('the expert computer aims accurately at a clear coin', () => {
  // A coin straight above the striker, with a clear line to the top-centre pocket: the aim should be almost straight up.
  const pieces = [
    { alive: true, kind: 'striker', colour: 'striker', x: 400, y: 690, r: 20 },
    { alive: true, kind: 'coin', colour: 'black', x: 400, y: 300, r: 16 },
  ];
  const pockets = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 800 }, { x: 800, y: 800 }];
  const shot = AI.planShot(pieces, pockets, AICFG, () => 0.5);
  assert.ok(Math.abs(shot.angle) < 0.6, 'a steep aim, not a wild one: ' + shot.angle);
});
