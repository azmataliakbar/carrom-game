/* Carrom physics: pure logic, no DOM. Works in the browser (window.CarromPhysics) and in Node.

   Pieces are circles with mass. They collide with an impulse (bounce set by restitution), slide with
   exponential friction, bounce off the cushions, and drop into a pocket when their centre enters a corner.
   Fixed steps keep the motion the same on every device. Events (hit, wall, pocket) are queued so the sound
   and the rules can react after each step. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CarromPhysics = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SUBSTEPS = 4;
  var ITERATIONS = 3;
  var HIT_MIN_SPEED = 30;   // a collision faster than this makes a sound
  var WALL_MIN_SPEED = 80;  // a cushion hit faster than this makes a sound

  // A piece. kind: 'coin' | 'queen' | 'striker'. colour: 'white' | 'black' | 'red' | 'striker'.
  function makeBody(o) {
    return {
      id: o.id,
      kind: o.kind,
      colour: o.colour,
      x: o.x,
      y: o.y,
      vx: 0,
      vy: 0,
      r: o.r,
      m: o.m || 1,
      alive: true,
      pocketed: false
    };
  }

  function speedOf(b) {
    return Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  }

  // opts: { size, pocketR, friction, restitution, wallRestitution, minSpeed }
  function createWorld(opts) {
    var bodies = [];
    var events = [];
    var size = opts.size;
    var pocketR = opts.pocketR;
    var pockets = [[0, 0], [size, 0], [0, size], [size, size]];

    function add(b) {
      bodies.push(makeBody(b));
      return bodies[bodies.length - 1];
    }

    function live() {
      return bodies.filter(function (b) { return b.alive; });
    }

    function collide() {
      var list = live();
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i];
          var b = list[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var minD = a.r + b.r;
          var d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 === 0) continue;
          var d = Math.sqrt(d2);
          var nx = dx / d;
          var ny = dy / d;
          var overlap = minD - d;
          var total = a.m + b.m;
          // Separate the pieces so they do not stay overlapped.
          a.x -= nx * overlap * (b.m / total);
          a.y -= ny * overlap * (b.m / total);
          b.x += nx * overlap * (a.m / total);
          b.y += ny * overlap * (a.m / total);
          // Impulse along the contact normal.
          var vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) {
            var e = opts.restitution;
            var jImp = -(1 + e) * vn / (1 / a.m + 1 / b.m);
            a.vx -= (jImp / a.m) * nx;
            a.vy -= (jImp / a.m) * ny;
            b.vx += (jImp / b.m) * nx;
            b.vy += (jImp / b.m) * ny;
            if (-vn >= HIT_MIN_SPEED) {
              events.push({ type: "hit", speed: -vn, a: a, b: b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            }
          }
        }
      }
    }

    function checkPockets() {
      live().forEach(function (b) {
        for (var k = 0; k < pockets.length; k++) {
          var px = pockets[k][0];
          var py = pockets[k][1];
          var dx = b.x - px;
          var dy = b.y - py;
          if (dx * dx + dy * dy < pocketR * pocketR) {
            b.alive = false;
            b.pocketed = true;
            b.vx = 0;
            b.vy = 0;
            events.push({ type: "pocket", body: b, x: px, y: py });
            return;
          }
        }
      });
    }

    function walls() {
      live().forEach(function (b) {
        var e = opts.wallRestitution;
        if (b.x - b.r < 0) {
          if (b.vx < 0 && -b.vx >= WALL_MIN_SPEED) events.push({ type: "wall", speed: -b.vx, body: b });
          b.x = b.r; if (b.vx < 0) b.vx = -b.vx * e;
        }
        if (b.x + b.r > size) {
          if (b.vx > 0 && b.vx >= WALL_MIN_SPEED) events.push({ type: "wall", speed: b.vx, body: b });
          b.x = size - b.r; if (b.vx > 0) b.vx = -b.vx * e;
        }
        if (b.y - b.r < 0) {
          if (b.vy < 0 && -b.vy >= WALL_MIN_SPEED) events.push({ type: "wall", speed: -b.vy, body: b });
          b.y = b.r; if (b.vy < 0) b.vy = -b.vy * e;
        }
        if (b.y + b.r > size) {
          if (b.vy > 0 && b.vy >= WALL_MIN_SPEED) events.push({ type: "wall", speed: b.vy, body: b });
          b.y = size - b.r; if (b.vy > 0) b.vy = -b.vy * e;
        }
      });
    }

    function substep(h) {
      var f = Math.exp(-opts.friction * h);
      live().forEach(function (b) {
        b.x += b.vx * h;
        b.y += b.vy * h;
      });
      for (var it = 0; it < ITERATIONS; it++) collide();
      walls();
      checkPockets();
      live().forEach(function (b) {
        b.vx *= f;
        b.vy *= f;
        if (speedOf(b) < opts.minSpeed) { b.vx = 0; b.vy = 0; }
      });
    }

    // Advances the world by dt seconds, in SUBSTEPS smaller steps.
    function step(dt) {
      var h = dt / SUBSTEPS;
      for (var i = 0; i < SUBSTEPS; i++) substep(h);
    }

    function settled() {
      return live().every(function (b) { return speedOf(b) === 0; });
    }

    function drainEvents() {
      var out = events;
      events = [];
      return out;
    }

    return {
      add: add,
      bodies: function () { return bodies.slice(); },
      live: live,
      step: step,
      settled: settled,
      drainEvents: drainEvents,
      pockets: pockets.map(function (p) { return { x: p[0], y: p[1] }; })
    };
  }

  // Finds a free spot for a piece near (x, y), so a returned coin never overlaps another piece.
  function freeSpot(world, r, x, y, size) {
    var others = world.live();
    function clear(px, py) {
      if (px - r < 0 || py - r < 0 || px + r > size || py + r > size) return false;
      return others.every(function (o) {
        var dx = o.x - px;
        var dy = o.y - py;
        return dx * dx + dy * dy >= Math.pow(o.r + r + 1, 2);
      });
    }
    if (clear(x, y)) return { x: x, y: y };
    for (var ring = 1; ring < 40; ring++) {
      var rad = ring * (r * 0.9);
      var n = Math.max(8, ring * 6);
      for (var k = 0; k < n; k++) {
        var a = (k / n) * Math.PI * 2;
        var px = x + Math.cos(a) * rad;
        var py = y + Math.sin(a) * rad;
        if (clear(px, py)) return { x: px, y: py };
      }
    }
    return { x: x, y: y };
  }

  return {
    makeBody: makeBody,
    createWorld: createWorld,
    freeSpot: freeSpot,
    speedOf: speedOf,
    SUBSTEPS: SUBSTEPS
  };
});
