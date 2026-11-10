/* Computer opponent: pure logic, no DOM. Works in the browser (window.CarromAI) and in Node.

   For each coin or queen and each pocket above it, the computer works out where the striker must touch the target
   so that the target is sent straight into the pocket. It then places the striker on the baseline so that its
   path runs head-on along that line, which passes the most energy to the target. The power is sized from the
   distance the target must travel into the pocket, plus a share of the striker's own travel.
   Easy and medium players accept shots that a coin in the way may block, with a penalty. Expert avoids them.
   Difficulty adds random error to the aim and power, so the level is clear to the player. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CarromAI = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VALUE = { black: 1, white: 2, queen: 5 };

  // Box-Muller normal draw from a random source in [0, 1).
  function gauss(rand) {
    var u1 = Math.max(rand(), 1e-9);
    var u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // Distance from point (px, py) to the segment (ax, ay) - (bx, by).
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy || 1;
    var t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var cx = ax + dx * t - px, cy = ay + dy * t - py;
    return Math.sqrt(cx * cx + cy * cy);
  }

  // Is any other live piece in the way of the path from the striker to the aim point?
  function blockedBy(pieces, skip, sx, sy, gx, gy, strikerR) {
    return pieces.some(function (o) {
      if (o === skip || !o.alive || o.kind === "striker") return false;
      return segDist(o.x, o.y, sx, sy, gx, gy) < o.r + strikerR;
    });
  }

  // cfg: { size, baselineY, baselineMin, baselineMax, strikerR, coinR, maxShot, friction, difficulty: {angle, power, blockPenalty} }
  // pieces: all bodies (coins, queen, striker). pockets: [{x, y}]. rand: () => [0,1).
  // Returns { startX, angle, power, target, pocket, value, blocked } or null if no shot is possible.
  function planShot(pieces, pockets, cfg, rand) {
    var sR = cfg.strikerR;
    var sy = cfg.baselineY;
    var candidates = [];

    pieces.forEach(function (t) {
      if (!t.alive || (t.kind !== "coin" && t.kind !== "queen")) return;
      var colour = t.kind === "queen" ? "queen" : t.colour;
      var value = VALUE[colour] || 1;
      pockets.forEach(function (p) {
        var dx = p.x - t.x, dy = p.y - t.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / d, uy = dy / d;
        // Only pockets above the target can be reached by a striker shot from the baseline.
        if (uy >= -0.05) return;
        // The striker touches the target at the "ghost" point, just behind it on the line to the pocket.
        var gap = t.r + sR;
        var gx = t.x - ux * gap, gy = t.y - uy * gap;
        if (gx < sR || gx > cfg.size - sR || gy < sR || gy > cfg.size - sR) return;
        if (gy >= sy - 4) return; // the target is too close to the baseline

        // Preferred: the striker starts on the baseline and travels straight along the target-to-pocket line.
        var k = (gy - sy) / uy;             // distance from the baseline point to the ghost along that line
        var sxDirect = gx - k * ux;
        var direct = k > 0 && sxDirect >= cfg.baselineMin && sxDirect <= cfg.baselineMax;

        var startX, angle, travel;
        if (direct) {
          startX = sxDirect;
          angle = Math.atan2(ux, -uy);
          travel = k;
        } else {
          // Fallback: aim from a clamped baseline point at the ghost point. This strikes at an angle, so it is weaker.
          startX = Math.max(cfg.baselineMin, Math.min(cfg.baselineMax, gx));
          angle = Math.atan2(gx - startX, sy - gy);
          travel = Math.sqrt((gx - startX) * (gx - startX) + (gy - sy) * (gy - sy));
        }
        var blocked = blockedBy(pieces, t, startX, sy, gx, gy, sR);
        var score = value * (blocked ? cfg.difficulty.blockPenalty : 1) * (direct ? 1 : 0.6) - travel / 5000;
        candidates.push({
          target: t, pocket: p, pocketDist: d, startX: startX, angle: angle, travel: travel,
          value: value, score: score, blocked: blocked
        });
      });
    });

    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return b.score - a.score; });
    var best = candidates[0];
    // Expert players skip any blocked shot when a clear one exists.
    if (cfg.difficulty.blockPenalty >= 1) {
      var clear = candidates.filter(function (c) { return !c.blocked; });
      if (clear.length) best = clear[0];
    }

    // Speed needed: the target must roll pocketDist, and the striker's own travel loses some speed on the way.
    var speedNeeded = cfg.friction * (best.pocketDist + 0.8 * best.travel);
    var power = Math.max(0.12, Math.min(1, speedNeeded / cfg.maxShot * 1.25));

    var d = cfg.difficulty;
    var angle = best.angle + gauss(rand) * d.angle;
    power = Math.max(0.1, Math.min(1, power * (1 + gauss(rand) * d.power)));

    return {
      startX: best.startX,
      angle: angle,
      power: power,
      target: best.target,
      pocket: best.pocket,
      value: best.value,
      blocked: best.blocked
    };
  }

  // Converts an aim (angle from straight up, clockwise) and power into a striker velocity.
  // Angle 0 means straight up the board. Positive angles turn right.
  function velocityFor(angle, power, maxShot) {
    return { vx: Math.sin(angle) * power * maxShot, vy: -Math.cos(angle) * power * maxShot };
  }

  return {
    VALUE: VALUE,
    planShot: planShot,
    velocityFor: velocityFor,
    segDist: segDist,
    gauss: gauss
  };
});
