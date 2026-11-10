/* Carrom controller: menus, match setup, striker placement and aiming (mouse and touch), the physics loop,
   shot resolution, computer turns, the score panel and the game-over screen. Rules live in rules.js,
   physics in physics.js, the computer in ai.js, drawing in render.js, sound in sound.js. Runs on load. */
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

  function $(id) { return document.getElementById(id); }

  var canvas = $("board");
  var ctx = canvas.getContext("2d");

  // ---------- Match state ----------
  var world = null;
  var game = null;
  var striker = null;
  var phase = "menu";          // menu | placing | moving | over
  var strikerX = (cfg.baselineMin + cfg.baselineMax) / 2;
  var drag = null;             // { mode: 'slide' | 'aim' } while the pointer is down
  var aim = { show: false, sx: 0, sy: 0, angle: 0, power: 0, pulling: false, pullX: 0, pullY: 0 };
  var shotPocketed = [];
  var shotStart = 0;
  var acc = 0;
  var last = 0;
  var aiTimer = 0;
  var lastMessage = "";

  // ---------- Board layout: queen in the centre, 6 coins in the inner ring, 12 in the outer ring ----------
  function layoutBoard() {
    var c = S / 2;
    var pieces = [];
    var id = 0;
    function coin(kind, colour, x, y) {
      var b = world.add({ id: ++id, kind: kind, colour: colour, x: x, y: y, r: kind === "queen" ? cfg.coinR : cfg.coinR });
      b.home = { x: x, y: y };
      pieces.push(b);
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
    return pieces;
  }

  function newWorld() {
    return P.createWorld({
      size: S, pocketR: cfg.pocketR, friction: cfg.friction, restitution: cfg.restitution,
      wallRestitution: cfg.wallRestitution, minSpeed: cfg.minSpeed
    });
  }

  // ---------- Matches ----------
  function startMatch(players) {
    stopTimers();
    world = newWorld();
    layoutBoard();
    striker = world.add({ id: 0, kind: "striker", colour: "striker", x: strikerX, y: cfg.baselineY, r: cfg.strikerR, m: 1.2 });
    striker.home = { x: strikerX, y: cfg.baselineY };
    game = R.createGame(players);
    $("menu").hidden = true;
    $("over").hidden = true;
    $("game").hidden = false;
    sizeCanvas();
    setMessage("Match started. " + game.players[0].name + " goes first.");
    buildScoreboard();
    beginTurn();
  }

  function stopTimers() {
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = 0;
  }

  function currentPlayer() {
    return game.players[game.turn];
  }

  function placeStriker() {
    striker.alive = true;
    striker.pocketed = false;
    striker.x = strikerX;
    striker.y = cfg.baselineY;
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
      aiTimer = setTimeout(aiTurn, 900);
    } else {
      setMessage(p.name + ": drag the striker along the baseline, then pull back to shoot.");
    }
    updateScoreboard();
  }

  function isHumanTurn() {
    return phase === "placing" && !currentPlayer().computer;
  }

  // ---------- Input: mouse and touch on the canvas ----------
  function toBoard(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * TOTAL - M,
      y: (e.clientY - r.top) / r.height * TOTAL - M
    };
  }

  function setStrikerX(x) {
    strikerX = Math.max(cfg.baselineMin, Math.min(cfg.baselineMax, x));
    if (striker) striker.x = strikerX;
  }

  function updateAim(p) {
    var dx = striker.x - p.x;
    var dy = striker.y - p.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    aim.show = true;
    aim.pulling = true;
    aim.sx = striker.x;
    aim.sy = striker.y;
    aim.pullX = p.x;
    aim.pullY = p.y;
    aim.power = Math.min(1, len / 170);
    aim.angle = Math.atan2(dx, -dy);
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
    } else if (p.y > cfg.baselineY - 70) {
      drag = { mode: "slide" };
      setStrikerX(p.x);
    } else {
      drag = null;
    }
    schedule();
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = toBoard(e);
    if (drag.mode === "slide") setStrikerX(p.x);
    else updateAim(p);
    schedule();
  });

  function endDrag(e) {
    if (!drag) return;
    if (drag.mode === "aim" && aim.pulling && aim.power > 0.06) {
      launch(aim.angle, aim.power);
    }
    drag = null;
    aim.show = false;
    aim.pulling = false;
    schedule();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () { drag = null; aim.show = false; aim.pulling = false; schedule(); });

  // ---------- Shooting ----------
  function launch(angle, power) {
    var v = AI.velocityFor(angle, power, cfg.maxShot);
    striker.vx = v.vx;
    striker.vy = v.vy;
    SND.flick(power);
    phase = "moving";
    shotPocketed = [];
    shotStart = performance.now();
    acc = 0;
    aim.show = false;
    aim.pulling = false;
    setMessage("Shot!");
  }

  function handleEvents() {
    world.drainEvents().forEach(function (ev) {
      if (ev.type === "hit") SND.hit(ev.speed);
      else if (ev.type === "wall") SND.wall(ev.speed);
      else if (ev.type === "pocket") {
        SND.pocket();
        shotPocketed.push(ev.body);
      }
    });
  }

  function finishShot() {
    phase = "resolving";
    var foul = shotPocketed.some(function (b) { return b.kind === "striker"; });
    var coinsIn = shotPocketed.filter(function (b) { return b.kind !== "striker"; });
    var onBoard = world.live().filter(function (b) { return b.kind !== "striker"; }).length;
    if (foul) onBoard += coinsIn.length;   // coins from a foul go back on the board
    var res = R.resolveShot(game, shotPocketed, onBoard);
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
    var shot = AI.planShot(world.bodies(), world.pockets, {
      size: S, baselineY: cfg.baselineY, baselineMin: cfg.baselineMin, baselineMax: cfg.baselineMax,
      strikerR: cfg.strikerR, coinR: cfg.coinR, maxShot: cfg.maxShot, friction: cfg.friction, difficulty: diff
    }, Math.random);
    var angle = shot ? shot.angle : 0;
    var power = shot ? shot.power : 0.3;
    if (shot) setStrikerX(shot.startX);
    placeStriker();
    phase = "placing";
    setMessage(p.name + " aims…");
    aiTimer = setTimeout(function () {
      aiTimer = 0;
      if (phase === "placing") launch(angle, power);
    }, 700);
  }

  // ---------- Frame loop ----------
  function schedule() {
    // The loop below redraws every frame, so nothing else is needed here.
  }

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
    RD.draw(ctx, { pieces: world ? world.bodies() : [], cfg: cfg, colours: cfg.colours, aim: aim });
    updatePower();
  }

  function updatePower() {
    var pct = aim.pulling ? Math.round(aim.power * 100) : 0;
    $("power-fill").style.width = pct + "%";
    $("power-text").textContent = pct + "%";
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
    lastMessage = text;
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
      name.textContent = p.name;
      var tag = document.createElement("small");
      tag.textContent = p.computer ? "Computer · " + (cfg.difficulty[p.difficulty] || cfg.difficulty.medium).label : "Player";
      var score = document.createElement("span");
      score.className = "score";
      score.setAttribute("data-score", String(i));
      card.appendChild(name);
      card.appendChild(tag);
      card.appendChild(score);
      box.appendChild(card);
    });
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
    $("turn-text").textContent = game.over ? "Game over" : (currentPlayer().name === "You" ? "Your turn" : currentPlayer().name + "'s turn");
  }

  function showOver() {
    var list = $("results");
    list.innerHTML = "";
    game.players.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return b.p.score - a.p.score; })
      .forEach(function (x, rank) {
        var li = document.createElement("li");
        li.textContent = "#" + (rank + 1) + "  " + x.p.name + ": " + x.p.score + " points";
        list.appendChild(li);
      });
    var w = game.players[game.winner];
    $("winner-text").textContent = w ? w.name + " wins!" : "Game over";
    $("over").hidden = false;
  }

  // Menu: choose a mode, then start
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
        sp.textContent = "Player " + (i + 1) + " name";
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
      var diff = $("difficulty").value;
      players = [
        { name: "You", computer: false },
        { name: "Computer", computer: true, difficulty: diff }
      ];
    } else {
      var inputs = document.querySelectorAll("[data-name]");
      players = Array.prototype.map.call(inputs, function (inp, i) {
        return { name: (inp.value || "").trim() || ("Player " + (i + 1)), computer: false };
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

  $("difficulty").addEventListener("change", function () {});

  // ---------- Start ----------
  window.addEventListener("resize", sizeCanvas);
  sizeCanvas();
  setMode("solo");
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });
})();
