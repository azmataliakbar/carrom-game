/* Carrom controller: menus, match setup, sides and colours, striker placement and aiming (mouse and touch) with a
   first-contact guide, the physics loop, shot resolution, computer turns, the score panel and the game-over screen.
   Rules live in rules.js, physics in physics.js, the computer in ai.js, drawing in render.js, sound in sound.js.
   Runs on load. */
(function () {
  "use strict";
  var cfg = window.CARROM.config;
  var P = window.CarromPhysics;
  var R = window.CarromRules;
  var AI = window.CarromAI;
  var RD = window.CarromRender;
  var SND = window.CarromSound;

  var S = cfg.size;
  var M = RD.MARGIN;
  var TOTAL = S + 2 * M;
  var FAR = S - cfg.baselineY;   // the top / right / left baselines sit this far from the origin edge

  function $(id) { return document.getElementById(id); }

  var canvas = $("board");
  var ctx = canvas.getContext("2d");

  // ---------- Match state ----------
  var world = null;
  var game = null;
  var striker = null;
  var phase = "menu";           // menu | placing | moving | over
  var sides = [];               // one side per seat: [{ side, seat }]
  var strikerT = [];            // per seat: where the striker sits along its side (x or y)
  var drag = null;              // { mode: 'slide' | 'aim' } while the pointer is down
  var aim = { show: false, sx: 0, sy: 0, dirX: 0, dirY: 0, power: 0, pulling: false, pullX: 0, pullY: 0 };
  var guide = null;             // first-contact preview for the current aim
  var shotPocketed = [];
  var shotTouch = null;         // the first coin or queen the striker touched in this shot
  var shotStart = 0;
  var acc = 0;
  var last = 0;
  var aiTimer = 0;

  // ---------- Board layout ----------
  function sidePos(side, t) {
    if (side === 0) return { x: t, y: cfg.baselineY };
    if (side === 2) return { x: t, y: FAR };
    if (side === 1) return { x: cfg.baselineY, y: t };
    return { x: FAR, y: t };
  }

  function tangentOf(side, p) {
    return side === 0 || side === 2 ? p.x : p.y;
  }

  function clampT(t) {
    return Math.max(cfg.baselineMin, Math.min(cfg.baselineMax, t));
  }

  function layoutBoard() {
    var c = S / 2;
    var id = 0;
    function coin(kind, colour, x, y) {
      var b = world.add({ id: ++id, kind: kind, colour: colour, x: x, y: y, r: cfg.coinR });
      b.home = { x: x, y: y };
    }
    coin("queen", "queen", c, c);
    for (var k = 0; k < 6; k++) {
      var a = (k / 6) * Math.PI * 2;
      coin("coin", k % 2 === 0 ? "white" : "black", c + Math.cos(a) * 33, c + Math.sin(a) * 33);
    }
    for (var j = 0; j < 12; j++) {
      var a2 = (j / 12) * Math.PI * 2;
      coin("coin", j % 2 === 0 ? "black" : "white", c + Math.cos(a2) * 66, c + Math.sin(a2) * 66);
    }
  }

  function newWorld() {
    return P.createWorld({
      size: S, pocketR: cfg.pocketR, friction: cfg.friction, restitution: cfg.restitution,
      wallRestitution: cfg.wallRestitution, minSpeed: cfg.minSpeed
    });
  }

  // ---------- Matches ----------
  // players: [{ name, computer, difficulty, colour }]. Seat i plays from sides[i].side.
  function startMatch(players) {
    stopTimers();
    var sideIds = players.length === 4 ? [0, 1, 2, 3] : [0, 2];
    sides = players.map(function (p, i) { return { side: sideIds[i], seat: i }; });
    world = newWorld();
    layoutBoard();
    striker = world.add({ id: 0, kind: "striker", colour: "striker", x: S / 2, y: cfg.baselineY, r: cfg.strikerR, m: 1.2 });
    strikerT = players.map(function () { return S / 2; });
    game = R.createGame(players);
    $("menu").hidden = true;
    $("over").hidden = true;
    $("game").hidden = false;
    sizeCanvas();
    buildScoreboard();
    setMessage("Match started. " + game.players[0].name + " goes first.");
    beginTurn();
  }

  function stopTimers() {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = 0;
  }

  function currentPlayer() { return game.players[game.turn]; }
  function currentSide() { return sides[game.turn].side; }

  function placeStriker() {
    var side = currentSide();
    var pos = sidePos(side, strikerT[game.turn]);
    striker.alive = true;
    striker.pocketed = false;
    striker.x = pos.x;
    striker.y = pos.y;
    striker.vx = 0;
    striker.vy = 0;
  }

  function beginTurn() {
    if (game.over) return showOver();
    placeStriker();
    phase = "placing";
    var p = currentPlayer();
    if (p.computer) {
      setMessage(p.name + " is thinking…");
      aiTimer = setTimeout(aiTurn, cfg.thinkMs);
    } else {
      setMessage(p.name + ": drag the striker along your line, then pull back to shoot.");
    }
    updateScoreboard();
  }

  function isHumanTurn() {
    return phase === "placing" && !currentPlayer().computer;
  }

  // ---------- Input: mouse and touch ----------
  function toBoard(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * TOTAL - M,
      y: (e.clientY - r.top) / r.height * TOTAL - M
    };
  }

  // Is the pointer close to the current player's striker line?
  function nearOwnLine(p) {
    var side = currentSide();
    var lineDist = side === 0 ? Math.abs(p.y - cfg.baselineY)
      : side === 2 ? Math.abs(p.y - FAR)
      : side === 1 ? Math.abs(p.x - cfg.baselineY)
      : Math.abs(p.x - FAR);
    var t = tangentOf(side, p);
    return lineDist < 70 && t > cfg.baselineMin - 40 && t < cfg.baselineMax + 40;
  }

  function updateAim(p) {
    var dx = striker.x - p.x;
    var dy = striker.y - p.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    aim.show = true;
    aim.pulling = true;
    aim.sx = striker.x;
    aim.sy = striker.y;
    aim.dirX = dx / len;
    aim.dirY = dy / len;
    aim.pullX = p.x;
    aim.pullY = p.y;
    aim.power = Math.min(1, len / cfg.pullFull);
    guide = firstContact(striker.x, striker.y, aim.dirX, aim.dirY);
  }

  // The first coin the striker would touch along a ray. Returns { x, y, colour, ok } or null.
  function firstContact(sx, sy, dx, dy) {
    var target = currentPlayer().colour;
    var best = null;
    var bestT = Infinity;
    world.live().forEach(function (b) {
      if (b === striker || b.kind === "striker") return;
      var rr = striker.r + b.r;
      var fx = sx - b.x, fy = sy - b.y;
      var bq = 2 * (fx * dx + fy * dy);
      var cq = fx * fx + fy * fy - rr * rr;
      var disc = bq * bq - 4 * cq;
      if (disc < 0) return;
      var t = (-bq - Math.sqrt(disc)) / 2;
      if (t > 0 && t < bestT) { bestT = t; best = b; }
    });
    if (!best) return null;
    var colour = best.kind === "queen" ? "queen" : best.colour;
    var free = freeShot(target);
    return { x: best.x, y: best.y, colour: colour, ok: free || best.kind === "queen" || best.colour === target };
  }

  // Is any coin of this colour still on the board? If not, the first-touch rule is waived.
  function colourLeft(colour) {
    return world.live().some(function (b) { return b.kind === "coin" && b.colour === colour; });
  }
  // The first shot of the match is the break: any coin may be hit first.
  function freeShot(colour) {
    return game.shots === 0 || !colourLeft(colour);
  }

  function setStrikerFromPointer(p) {
    var side = currentSide();
    var t = clampT(tangentOf(side, p));
    strikerT[game.turn] = t;
    var pos = sidePos(side, t);
    striker.x = pos.x;
    striker.y = pos.y;
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!isHumanTurn()) return;
    SND.unlock();
    var p = toBoard(e);
    canvas.setPointerCapture(e.pointerId);
    var dist = Math.sqrt(Math.pow(p.x - striker.x, 2) + Math.pow(p.y - striker.y, 2));
    if (dist < striker.r + 26) {
      drag = { mode: "aim" };
      updateAim(p);
    } else if (nearOwnLine(p)) {
      drag = { mode: "slide" };
      setStrikerFromPointer(p);
    } else {
      drag = null;
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = toBoard(e);
    if (drag.mode === "slide") setStrikerFromPointer(p);
    else updateAim(p);
  });

  function endDrag() {
    if (!drag) return;
    if (drag.mode === "aim" && aim.pulling && aim.power > 0.05) {
      launch(aim.dirX * aim.power * cfg.maxShot, aim.dirY * aim.power * cfg.maxShot, aim.power);
    }
    drag = null;
    aim.show = false;
    aim.pulling = false;
    guide = null;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () { drag = null; aim.show = false; aim.pulling = false; guide = null; });

  // ---------- Shooting ----------
  function launch(vx, vy, power) {
    striker.vx = vx;
    striker.vy = vy;
    SND.flick(power);
    phase = "moving";
    shotPocketed = [];
    shotTouch = null;
    shotStart = performance.now();
    acc = 0;
    aim.show = false;
    aim.pulling = false;
    guide = null;
    setMessage("Shot!");
  }

  function handleEvents() {
    world.drainEvents().forEach(function (ev) {
      if (ev.type === "hit") SND.hit(ev.speed);
      else if (ev.type === "wall") SND.wall(ev.speed);
      else if (ev.type === "pocket") {
        SND.pocket();
        shotPocketed.push(ev.body);
      } else if (ev.type === "contact") {
        if (shotTouch) return;
        var other = ev.a.kind === "striker" ? ev.b : (ev.b.kind === "striker" ? ev.a : null);
        if (other && other.kind !== "striker" && other.alive) shotTouch = other;
      }
    });
  }

  function finishShot() {
    phase = "resolving";
    var target = currentPlayer().colour;
    var striked = shotPocketed.some(function (b) { return b.kind === "striker"; });
    var free = freeShot(target);
    var touchOk = free || !!(shotTouch && (shotTouch.kind === "queen" || shotTouch.colour === target));
    var foul = striked || !touchOk;
    var coinsIn = shotPocketed.filter(function (b) { return b.kind !== "striker"; });
    var onBoard = world.live().filter(function (b) { return b.kind !== "striker"; }).length;
    if (foul) onBoard += coinsIn.length;   // coins from a foul go back on the board
    var res = R.resolveShot(game, shotPocketed, onBoard, { firstTouch: shotTouch, free: free });
    if (res.foul) SND.foul();

    res.returned.forEach(function (b) {
      var spot = P.freeSpot(world, b.r, b.home.x, b.home.y, S);
      b.x = spot.x;
      b.y = spot.y;
      b.vx = 0;
      b.vy = 0;
      b.alive = true;
      b.pocketed = false;
    });
    if (res.queenResult === "covered") SND.win();

    setMessage(res.message || "No pieces pocketed.");
    if (game.over) {
      phase = "over";
      SND.win();
      updateScoreboard();
      showOver();
      return;
    }
    beginTurn();
  }

  // ---------- Computer player ----------
  function aiTurn() {
    aiTimer = 0;
    if (phase !== "placing") return;
    var p = currentPlayer();
    var diff = cfg.difficulty[p.difficulty] || cfg.difficulty.medium;
    var shot = AI.planForSide(world.bodies(), world.pockets, {
      size: S, baselineY: cfg.baselineY, baselineMin: cfg.baselineMin, baselineMax: cfg.baselineMax,
      strikerR: cfg.strikerR, coinR: cfg.coinR, maxShot: cfg.maxShot, friction: cfg.friction, difficulty: diff
    }, Math.random, currentSide(), freeShot(p.colour) ? "any" : p.colour);
    if (!shot && !freeShot(p.colour)) {
      shot = AI.planForSide(world.bodies(), world.pockets, {
        size: S, baselineY: cfg.baselineY, baselineMin: cfg.baselineMin, baselineMax: cfg.baselineMax,
        strikerR: cfg.strikerR, coinR: cfg.coinR, maxShot: cfg.maxShot, friction: cfg.friction, difficulty: diff
      }, Math.random, currentSide(), "any");
    }
    if (!shot) {
      // Nothing else is possible: hit the nearest goat rather than the empty board.
      shot = AI.planForSide(world.bodies(), world.pockets, {
        size: S, baselineY: cfg.baselineY, baselineMin: cfg.baselineMin, baselineMax: cfg.baselineMax,
        strikerR: cfg.strikerR, coinR: cfg.coinR, maxShot: cfg.maxShot, friction: cfg.friction, difficulty: diff
      }, Math.random, currentSide(), p.colour, { goat: true });
    }
    if (shot) {
      strikerT[game.turn] = tangentOf(currentSide(), { x: shot.startX, y: shot.startY });
      striker.x = shot.startX;
      striker.y = shot.startY;
      setMessage(p.name + " aims to hit " + p.colour + "…");
      aiTimer = setTimeout(function () {
        aiTimer = 0;
        if (phase === "placing") launch(shot.dirX * shot.power * cfg.maxShot, shot.dirY * shot.power * cfg.maxShot, shot.power);
      }, cfg.launchMs);
    } else {
      setMessage(p.name + " has no shot and passes.");
      aiTimer = setTimeout(function () {
        aiTimer = 0;
        if (phase === "placing") {
          launch(0, -0.3 * cfg.maxShot, 0.3);
        }
      }, cfg.launchMs);
    }
  }

  // ---------- Frame loop ----------
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (phase === "moving") {
      acc += dt;
      while (acc >= cfg.stepS) {
        world.step(cfg.stepS);
        acc -= cfg.stepS;
        handleEvents();
      }
      var timedOut = (now - shotStart) / 1000 > cfg.settleTimeoutS;
      if (world.settled() || timedOut) finishShot();
    }
    RD.draw(ctx, {
      pieces: world ? world.bodies() : [],
      cfg: cfg,
      colours: cfg.colours,
      sides: sideViews(),
      aim: aim,
      guide: guide
    });
    updatePower();
  }

  function sideViews() {
    if (!game) return [];
    return sides.map(function (s, i) {
      var p = game.players[i];
      return {
        side: s.side,
        label: "PLAYER " + (i + 1) + " · HIT " + p.colour.toUpperCase(),
        active: !game.over,
        current: !game.over && i === game.turn && phase !== "over"
      };
    });
  }

  function updatePower() {
    var pct = aim.pulling ? Math.round(aim.power * 100) : 0;
    $("power-fill").style.width = pct + "%";
    $("power-text").textContent = pct + "%";
    var g = $("guide");
    if (guide) {
      g.textContent = "First hit: " + guide.colour.toUpperCase() + (guide.ok ? " ✓" : " ✗ (you must hit " + currentPlayer().colour.toUpperCase() + ")");
      g.className = "guide " + (guide.ok ? "ok" : "bad");
    } else if (aim.pulling) {
      g.textContent = "No coin on this line: the striker will miss.";
      g.className = "guide bad";
    } else if (game && phase === "placing" && !currentPlayer().computer) {
      g.textContent = "Hit " + currentPlayer().colour.toUpperCase() + " first.";
      g.className = "guide";
    } else {
      g.textContent = "";
      g.className = "guide";
    }
  }

  // ---------- Canvas sizing ----------
  function sizeCanvas() {
    var parent = canvas.parentElement;
    var w = Math.max(240, Math.min(560, parent.clientWidth || 560));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(w * dpr);
    ctx.setTransform(canvas.width / TOTAL, 0, 0, canvas.height / TOTAL, 0, 0);
  }

  // ---------- Screens and HUD ----------
  function setMessage(text) {
    $("status").textContent = text;
  }

  function buildScoreboard() {
    var box = $("scoreboard");
    box.innerHTML = "";
    game.players.forEach(function (p, i) {
      var card = document.createElement("div");
      card.className = "pl";
      card.setAttribute("data-idx", String(i));
      var name = document.createElement("strong");
      name.textContent = "Player " + (i + 1) + (p.name && p.name !== "Player " + (i + 1) ? " · " + p.name : "");
      var tag = document.createElement("small");
      tag.textContent = (p.computer ? "Computer · " + (cfg.difficulty[p.difficulty] || cfg.difficulty.medium).label : "Human") +
        " · hits " + p.colour.toUpperCase();
      var score = document.createElement("span");
      score.className = "score";
      score.setAttribute("data-score", String(i));
      card.appendChild(name);
      card.appendChild(tag);
      card.appendChild(score);
      box.appendChild(card);
    });
    updateScoreboard();
  }

  function updateScoreboard() {
    if (!game) return;
    game.players.forEach(function (p, i) {
      var card = document.querySelector('.pl[data-idx="' + i + '"]');
      if (!card) return;
      card.classList.toggle("is-turn", !game.over && i === game.turn);
      var s = card.querySelector("[data-score]");
      if (s) s.textContent = String(p.score);
    });
    $("turn-text").textContent = game.over ? "Game over" : "Player " + (game.turn + 1) + "'s turn · hit " + currentPlayer().colour.toUpperCase();
  }

  function showOver() {
    var list = $("results");
    list.innerHTML = "";
    game.players.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return b.p.score - a.p.score; })
      .forEach(function (x, rank) {
        var li = document.createElement("li");
        li.textContent = "#" + (rank + 1) + "  Player " + (x.i + 1) + " · " + x.p.name + ": " + x.p.score + " points";
        list.appendChild(li);
      });
    var w = game.players[game.winner];
    $("winner-text").textContent = w ? "Player " + (game.winner + 1) + " wins!" : "Game over";
    $("over").hidden = false;
  }

  // ---------- Menu ----------
  var mode = "solo";
  function setMode(m) {
    mode = m;
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === m));
    });
    $("solo-options").hidden = m !== "solo";
    $("names-options").hidden = m === "solo";
    var count = m === "four" ? 4 : 2;
    var box = $("names");
    box.innerHTML = "";
    if (m !== "solo") {
      for (var i = 0; i < count; i++) {
        var lab = document.createElement("label");
        lab.className = "field";
        var sp = document.createElement("span");
        sp.textContent = "Player " + (i + 1) + " name (hits " + cfg.seatColours[i].toUpperCase() + ")";
        var inp = document.createElement("input");
        inp.type = "text";
        inp.maxLength = 20;
        inp.value = "Player " + (i + 1);
        inp.setAttribute("data-name", String(i));
        lab.appendChild(sp);
        lab.appendChild(inp);
        box.appendChild(lab);
      }
    }
  }

  document.querySelectorAll("[data-mode]").forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); });
  });

  $("start-btn").addEventListener("click", function () {
    SND.unlock();
    var players;
    if (mode === "solo") {
      var you = $("your-colour").value === "black" ? "black" : "white";
      var cpu = you === "white" ? "black" : "white";
      players = [
        { name: "You", computer: false, colour: you },
        { name: "Computer", computer: true, difficulty: $("difficulty").value, colour: cpu }
      ];
    } else {
      var inputs = document.querySelectorAll("[data-name]");
      players = Array.prototype.map.call(inputs, function (inp, i) {
        return { name: (inp.value || "").trim() || ("Player " + (i + 1)), computer: false, colour: cfg.seatColours[i] };
      });
    }
    startMatch(players);
  });

  $("quit-btn").addEventListener("click", function () {
    if (phase !== "over" && !window.confirm("Leave this match and go back to the menu?")) return;
    stopTimers();
    $("game").hidden = true;
    $("over").hidden = true;
    $("menu").hidden = false;
    phase = "menu";
  });

  $("again-btn").addEventListener("click", function () {
    $("over").hidden = true;
    $("game").hidden = true;
    $("menu").hidden = false;
    phase = "menu";
  });

  $("sound-btn").addEventListener("click", function () {
    SND.unlock();
    SND.setMuted(!SND.isMuted());
    $("sound-btn").textContent = SND.isMuted() ? "Sound off" : "Sound on";
    $("sound-btn").setAttribute("aria-pressed", String(!SND.isMuted()));
  });

  $("vol").value = String(Math.round(SND.getVolume() * 100));
  $("vol").addEventListener("input", function () {
    SND.setVolume(Number(this.value) / 100);
    SND.unlock();
  });
  $("sound-btn").textContent = SND.isMuted() ? "Sound off" : "Sound on";
  $("sound-btn").setAttribute("aria-pressed", String(!SND.isMuted()));

  // Read-only view for tests and debugging.
  window.CARROM.debug = function () {
    return {
      phase: phase,
      turn: game ? game.turn : -1,
      striker: striker ? { x: striker.x, y: striker.y, vx: striker.vx, vy: striker.vy, alive: striker.alive } : null,
      aim: { show: aim.show, dirX: aim.dirX, dirY: aim.dirY, power: aim.power },
      touch: shotTouch ? { kind: shotTouch.kind, colour: shotTouch.colour, x: shotTouch.x, y: shotTouch.y } : null,
      pocketed: shotPocketed.map(function (b) { return b.kind + ":" + b.colour; }),
      coins: world ? world.bodies().filter(function (b) { return b.kind !== "striker"; }).map(function (b) {
        return { k: b.kind, c: b.colour, x: Math.round(b.x), y: Math.round(b.y), alive: b.alive };
      }) : []
    };
  };

  // ---------- Start ----------
  window.addEventListener("resize", sizeCanvas);
  sizeCanvas();
  setMode("solo");
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
})();
