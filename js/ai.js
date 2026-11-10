/* Computer opponent: pure logic, no DOM. Works in the browser (window.CarromAI) and in Node.

   The computer plans in a local frame where its own side is the bottom baseline, so the same maths works
   for every side. For each target coin of its colour (and the queen) and each pocket above it, it finds
   where the striker must touch the target so the target goes straight into the pocket. It places the striker
   on the baseline so its path runs head-on along that line, sizes the power from the distance, and checks
   that the first contact is the right colour. Expert never plays a shot whose path meets another coin.
   Easy and medium accept some of those shots, with a penalty. Difficulty adds random error to aim and power. */
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

  // ---------- Frames: map a side of the board to the local "bottom" frame, and back ----------
  // size S. Side 0 = bottom (identity), 2 = top (turned 180 degrees), 1 = right, 3 = left.
  function toLocal(S, side, x, y) {
    if (side === 2) return { x: S - x, y: S - y };
    if (side === 1) return { x: S - y, y: x };
    if (side === 3) return { x: y, y: S - x };
    return { x: x, y: y };
  }

  function fromLocal(S, side, x, y) {
    if (side === 2) return { x: S - x, y: S - y };
    if (side === 1) return { x: y, y: S - x };
    if (side === 3) return { x: S - y, y: x };
    return { x: x, y: y };
  }

  function vecFromLocal(side, x, y) {
    if (side === 2) return { x: -x, y: -y };
    if (side === 1) return { x: y, y: -x };
    if (side === 3) return { x: -y, y: x };
    return { x: x, y: y };
  }

  // Finds the candidate shot for the bottom frame. cfg: { size, baselineY, baselineMin, baselineMax, strikerR,
  // maxShot, friction, targetColour ('white' | 'black' | 'any'), difficulty: {angle, power, blockPenalty} }.
  // pieces: bodies in the local frame. pockets: [{x, y}] in the local frame.
  function planLocal(pieces, pockets, cfg, rand) {
    var sR = cfg.strikerR;
    var sy = cfg.baselineY;
    var want = cfg.targetColour || "any";
    var candidates = [];

    pieces.forEach(function (t) {
      if (!t.alive || (t.kind !== "coin" && t.kind !== "queen")) return;
      if (t.kind === "coin" && want !== "any" && t.colour !== want) return;
      var colour = t.kind === "queen" ? "queen" : t.colour;
      var value = VALUE[colour] || 1;
      pockets.forEach(function (p) {
        var dx = p.x - t.x, dy = p.y - t.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / d, uy = dy / d;
        if (uy >= -0.05) return; // only pockets above the target can be reached from the bottom baseline
        var gap = t.r + sR;
        var gx = t.x - ux * gap, gy = t.y - uy * gap; // the striker's touching point, just behind the target
        if (gx < sR || gx > cfg.size - sR || gy < sR || gy > cfg.size - sR) return;
        if (gy >= sy - 4) return;

        // Preferred: start on the baseline and travel straight along the target-to-pocket line.
        var k = (gy - sy) / uy;
        var sxDirect = gx - k * ux;
        var direct = k > 0 && sxDirect >= cfg.baselineMin && sxDirect <= cfg.baselineMax;

        var startX, angle, travel;
        if (direct) {
          startX = sxDirect;
          angle = Math.atan2(ux, -uy);
          travel = k;
        } else {
          startX = Math.max(cfg.baselineMin, Math.min(cfg.baselineMax, gx));
          angle = Math.atan2(gx - startX, sy - gy);
          travel = Math.sqrt((gx - startX) * (gx - startX) + (gy - sy) * (gy - sy));
        }

        // Any other coin close to the path is a potential first touch. A wrong colour there is a foul.
        var wrongFirst = false, anyBlock = false;
        pieces.forEach(function (o) {
          if (o === t || !o.alive || o.kind === "striker") return;
          if (segDist(o.x, o.y, startX, sy, gx, gy) < o.r + sR) {
            anyBlock = true;
            if (o.kind === "coin" && want !== "any" && o.colour !== want) wrongFirst = true;
          }
        });
        var blocked = anyBlock || wrongFirst;
        var score = value * (blocked ? cfg.difficulty.blockPenalty : 1) * (direct ? 1 : 0.6) - travel / 5000;
        candidates.push({
          target: t, pocket: p, pocketDist: d, startX: startX, angle: angle, travel: travel,
          value: value, score: score, blocked: blocked, wrongFirst: wrongFirst
        });
      });
    });

    if (!candidates.length) return planSafety(pieces, cfg, rand);
    candidates.sort(function (a, b) { return b.score - a.score; });
    var best = candidates[0];
    // Expert players only play clean shots when one exists: no other coin on the path.
    if (cfg.difficulty.blockPenalty >= 1) {
      var clean = candidates.filter(function (c) { return !c.blocked; });
      if (clean.length) best = clean[0];
    }

    // The best pocket shot would touch the wrong colour first: play a safety shot instead.
    if (best.wrongFirst && cfg.targetColour && cfg.targetColour !== "any") {
      var safe = planSafety(pieces, cfg, rand);
      if (safe) return safe;
    }

    // Speed needed: the target must roll pocketDist, and the striker loses some speed on its own travel.
    var speedNeeded = cfg.friction * (best.pocketDist + 0.6 * best.travel);
    var power = Math.max(0.12, Math.min(1, speedNeeded / cfg.maxShot * (cfg.powerFactor || 1.7)));

    var d = cfg.difficulty;
    var a = best.angle + gauss(rand) * d.angle;
    power = Math.max(0.1, Math.min(1, power * (1 + gauss(rand) * d.power)));

    return {
      startX: best.startX,
      angle: a,
      power: power,
      target: best.target,
      pocket: best.pocket,
      value: best.value,
      blocked: best.blocked
    };
  }

  // Safety shot: when no clean pocket shot exists, aim straight at the nearest coin of the player's own colour,
  // along a line with no coin of the wrong colour in the way. It keeps the first contact legal and the game moving.
  function planSafety(pieces, cfg, rand) {
    var want = cfg.targetColour || "any";
    var sR = cfg.strikerR;
    var sy = cfg.baselineY;
    var best = null;
    pieces.forEach(function (t) {
      if (!t.alive || t.kind === "striker") return;
      if (t.kind === "coin" && want !== "any" && t.colour !== want) return;
      if (t.kind !== "coin" && t.kind !== "queen") return;
      var sx = Math.max(cfg.baselineMin, Math.min(cfg.baselineMax, t.x));
      var dx = t.x - sx, dy = t.y - sy;
      if (dy >= -20) return;
      var len = Math.sqrt(dx * dx + dy * dy);
      var ok = true;
      pieces.forEach(function (o) {
        if (o === t || !o.alive || o.kind === "striker") return;
        if (segDist(o.x, o.y, sx, sy, t.x, t.y) < o.r + sR) {
          if (o.kind === "coin" && want !== "any" && o.colour !== want) ok = false;
        }
      });
      if (ok && (!best || len < best.len)) best = { t: t, sx: sx, dx: dx, dy: dy, len: len };
    });
    if (!best) return null;
    var power = Math.max(0.2, Math.min(0.7, 0.25 + best.len / 2600));
    var angle = Math.atan2(best.dx, -best.dy) + gauss(rand) * cfg.difficulty.angle;
    return { startX: best.sx, angle: angle, power: power, target: best.t, pocket: null, value: 0, blocked: false, safety: true };
  }

  // The shot for one side of the real board. Returns world coordinates:
  // { startX, startY, dirX, dirY (unit direction of travel), power, value, blocked } or null.
  // cfg.size and cfg.baselineY are the real board values (the side's baseline is at baselineY from its edge).
  function planForSide(pieces, pockets, cfg, rand, side, colour) {
    var S = cfg.size;
    var local = pieces.map(function (p) {
      var q = toLocal(S, side, p.x, p.y);
      return { alive: p.alive, kind: p.kind, colour: p.colour, r: p.r, x: q.x, y: q.y };
    });
    var lp = pockets.map(function (p) { var q = toLocal(S, side, p.x, p.y); return { x: q.x, y: q.y }; });
    var lcfg = Object.assign({}, cfg, { targetColour: colour });
    var shot = planLocal(local, lp, lcfg, rand);
    if (!shot) return null;
    var start = fromLocal(S, side, shot.startX, cfg.baselineY);
    var dl = { x: Math.sin(shot.angle), y: -Math.cos(shot.angle) };
    var dw = vecFromLocal(side, dl.x, dl.y);
    return {
      startX: start.x,
      startY: start.y,
      dirX: dw.x,
      dirY: dw.y,
      power: shot.power,
      value: shot.value,
      blocked: shot.blocked,
      target: shot.target,
      pocket: shot.pocket
    };
  }

  // Compatibility: the shot for the bottom side, as before (startX and angle, angle from straight up).
  function planShot(pieces, pockets, cfg, rand) {
    return planLocal(pieces, pockets, cfg, rand);
  }

  // Converts an aim (angle from straight up, clockwise) and power into a striker velocity.
  function velocityFor(angle, power, maxShot) {
    return { vx: Math.sin(angle) * power * maxShot, vy: -Math.cos(angle) * power * maxShot };
  }

  return {
    VALUE: VALUE,
    planShot: planShot,
    planForSide: planForSide,
    velocityFor: velocityFor,
    toLocal: toLocal,
    fromLocal: fromLocal,
    segDist: segDist,
    gauss: gauss
  };
});
