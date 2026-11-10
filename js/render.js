/* Carrom renderer: draws the top view on a canvas. Pure drawing, no game rules.
   Board units are logical; the frame adds a margin around the playing field.
   Each active side gets a striker line and a small label on the frame: "PLAYER n · HIT WHITE" or "HIT BLACK".
   Exposes window.CarromRender. */
(function (root) {
  "use strict";

  var MARGIN = 58;   // frame width around the field, room for the side labels
  var BAR_IN = 84;        // distance of the blue bar from its edge (inside the field)

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Mixes a #rrggbb colour toward white (amount > 0) or black (amount < 0).
  function shade(hex, amount) {
    var h = /^#([0-9a-f]{6})$/i.test(hex) ? hex.slice(1) : "888888";
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    var t = amount < 0 ? 0 : 255;
    var k = Math.abs(amount);
    r = Math.round(r + (t - r) * k);
    g = Math.round(g + (t - g) * k);
    b = Math.round(b + (t - b) * k);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // Where a side's striker line and bar are, in board units.
  function sideGeometry(side, cfg) {
    var S = cfg.size;
    var line = { 0: cfg.baselineY, 2: S - cfg.baselineY, 1: cfg.baselineY, 3: S - cfg.baselineY }[side];
    var horizontal = side === 0 || side === 2;
    var bar = horizontal ? (side === 0 ? S - BAR_IN : BAR_IN) : (side === 1 ? S - BAR_IN : BAR_IN);
    return { horizontal: horizontal, line: line, bar: bar };
  }

  function drawBoard(ctx, cfg, colours, sides) {
    var S = cfg.size;
    var fg = ctx.createLinearGradient(0, 0, S + 2 * MARGIN, S + 2 * MARGIN);
    fg.addColorStop(0, "#9a6232");
    fg.addColorStop(1, colours.frame);
    ctx.fillStyle = fg;
    roundRect(ctx, 0, 0, S + 2 * MARGIN, S + 2 * MARGIN, 26);
    ctx.fill();

    ctx.save();
    ctx.translate(MARGIN, MARGIN);

    var fieldG = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.72);
    fieldG.addColorStop(0, "#fbe7b6");
    fieldG.addColorStop(1, colours.field2);
    ctx.fillStyle = fieldG;
    roundRect(ctx, 0, 0, S, S, 12);
    ctx.fill();

    // Decorative red centre rings and four red arms
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    [[0, 0], [S, 0], [0, S], [S, S]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(S / 2 + (c[0] - S / 2) * 0.22, S / 2 + (c[1] - S / 2) * 0.22);
      ctx.lineTo(S / 2 + (c[0] - S / 2) * 0.46, S / 2 + (c[1] - S / 2) * 0.46);
      ctx.stroke();
    });

    // Each side: a blue bar near its edge, and a dashed striker line for the side that is playing.
    sides.forEach(function (sd) {
      var g = sideGeometry(sd.side, cfg);
      ctx.fillStyle = sd.active ? colours.line2 : "rgba(36, 92, 154, 0.35)";
      if (g.horizontal) {
        roundRect(ctx, 110, g.bar - 5, S - 220, 10, 5);
      } else {
        roundRect(ctx, g.bar - 5, 110, 10, S - 220, 5);
      }
      ctx.fill();
      if (sd.current) {
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (g.horizontal) {
          ctx.moveTo(cfg.baselineMin - 20, g.line);
          ctx.lineTo(cfg.baselineMax + 20, g.line);
        } else {
          ctx.moveTo(g.line, cfg.baselineMin - 20);
          ctx.lineTo(g.line, cfg.baselineMax + 20);
        }
        ctx.stroke();
        ctx.restore();
      }
    });

    // Pockets
    [[0, 0], [S, 0], [0, S], [S, S]].forEach(function (c) {
      var pg = ctx.createRadialGradient(c[0], c[1], 4, c[0], c[1], cfg.pocketR);
      pg.addColorStop(0, "#000000");
      pg.addColorStop(1, colours.pocket);
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(c[0], c[1], cfg.pocketR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a3a1c";
      ctx.lineWidth = 4;
      ctx.stroke();
    });

    ctx.restore();
  }

  // Small guide labels on the frame, one per active side: "PLAYER n" over "HIT WHITE" (or BLACK).
  function drawLabels(ctx, cfg, sides) {
    var S = cfg.size;
    sides.forEach(function (sd) {
      if (!sd.label) return;
      var parts = sd.label.split(" · ");
      var x = 0, y = 0, rot = 0;
      if (sd.side === 0) { x = S / 2; y = S + MARGIN / 2; }
      if (sd.side === 2) { x = S / 2; y = -MARGIN / 2; rot = Math.PI; }
      if (sd.side === 1) { x = S + MARGIN / 2; y = S / 2; rot = Math.PI / 2; }
      if (sd.side === 3) { x = -MARGIN / 2; y = S / 2; rot = -Math.PI / 2; }
      ctx.save();
      ctx.translate(x + MARGIN, y + MARGIN);
      ctx.rotate(rot);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = sd.current ? "#ffd166" : "#fbe9c8";
      ctx.font = "bold 20px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      ctx.fillText(parts[0] || "", 0, parts[1] ? -10 : 0);
      if (parts[1]) {
        ctx.font = "bold 15px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        ctx.fillStyle = sd.current ? "#fff4cc" : "#f0d6a8";
        ctx.fillText(parts[1], 0, 13);
      }
      ctx.restore();
    });
  }

  function drawPiece(ctx, b, colours) {
    var x = b.x + MARGIN;
    var y = b.y + MARGIN;
    ctx.fillStyle = "rgba(40, 20, 0, 0.28)";
    ctx.beginPath();
    ctx.arc(x + 2.5, y + 3.5, b.r, 0, Math.PI * 2);
    ctx.fill();

    var base = b.kind === "striker" ? colours.striker : b.kind === "queen" ? colours.queen : b.colour === "white" ? colours.white : colours.black;
    var g = ctx.createRadialGradient(x - b.r * 0.35, y - b.r * 0.4, b.r * 0.1, x, y, b.r);
    g.addColorStop(0, shade(base, 0.35));
    g.addColorStop(0.7, base);
    g.addColorStop(1, shade(base, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, b.r, 0, Math.PI * 2);
    ctx.fill();

    if (b.kind === "striker") {
      ctx.strokeStyle = "#fff3d6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, b.r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    } else if (b.kind === "queen") {
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, b.r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // view: { pieces, cfg, colours, sides: [{side, label, active, current}], aim: {show, sx, sy, dirX, dirY, power, pulling, pullX, pullY},
  //         guide: {hitX, hitY, hitColour, ok} | null }
  function draw(ctx, view) {
    var cfg = view.cfg;
    var colours = view.colours;
    var total = cfg.size + 2 * MARGIN;
    ctx.clearRect(0, 0, total, total);
    drawBoard(ctx, cfg, colours, view.sides || []);

    view.pieces.forEach(function (b) {
      if (b.alive) drawPiece(ctx, b, colours);
    });

    var a = view.aim;
    if (a && a.show) {
      var x = a.sx + MARGIN;
      var y = a.sy + MARGIN;
      var len = view.guide && view.guide.hitX !== undefined
        ? Math.sqrt(Math.pow(view.guide.hitX - a.sx, 2) + Math.pow(view.guide.hitY - a.sy, 2))
        : 120 + a.power * 420;
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = "rgba(0, 0, 0, " + (0.6 + 0.4 * a.power).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + a.dirX * len, y + a.dirY * len);
      ctx.stroke();
      ctx.restore();
      if (view.guide && view.guide.hitX !== undefined) {
        var hx = view.guide.hitX + MARGIN;
        var hy = view.guide.hitY + MARGIN;
        var ok = view.guide.ok;
        ctx.strokeStyle = ok ? "rgba(122, 240, 176, 0.95)" : "rgba(255, 77, 141, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hx, hy, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = ok ? "#7af0b0" : "#ff7aa8";
        ctx.fillText(ok ? "first hit: " + view.guide.hitColour + " ✓" : "first hit: " + view.guide.hitColour + " ✗", hx, hy - 30);
      }
      if (a.pulling) {
        ctx.strokeStyle = "rgba(0, 245, 160, 0.85)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(a.pullX + MARGIN, a.pullY + MARGIN);
        ctx.stroke();
      }
    }

    drawLabels(ctx, cfg, view.sides || []);
  }

  root.CarromRender = {
    MARGIN: MARGIN,
    draw: draw,
    shade: shade,
    roundRect: roundRect,
    sideGeometry: sideGeometry
  };
})(window);
