/* Carrom renderer: draws the top view on a canvas. Pure drawing, no game rules.
   Board units are logical; the frame adds a margin around the playing field.
   Exposes window.CarromRender. */
(function (root) {
  "use strict";

  var MARGIN = 36;

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoard(ctx, cfg, colours) {
    var S = cfg.size;
    // Wood frame
    var fg = ctx.createLinearGradient(0, 0, S + 2 * MARGIN, S + 2 * MARGIN);
    fg.addColorStop(0, "#9a6232");
    fg.addColorStop(1, colours.frame);
    ctx.fillStyle = fg;
    roundRect(ctx, 0, 0, S + 2 * MARGIN, S + 2 * MARGIN, 26);
    ctx.fill();

    ctx.save();
    ctx.translate(MARGIN, MARGIN);

    // Playing field
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

    // Blue baseline bars, one at each edge, with a red line between
    ctx.fillStyle = colours.line2;
    var by = cfg.baselineY + 26;
    roundRect(ctx, cfg.baselineMin - 30, by, cfg.baselineMax - cfg.baselineMin + 60, 10, 5);
    ctx.fill();
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cfg.baselineMin - 30, by + 5);
    ctx.lineTo(cfg.baselineMax + 30, by + 5);
    ctx.stroke();

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

  function drawPiece(ctx, b, colours) {
    var x = b.x + MARGIN;
    var y = b.y + MARGIN;
    // Soft shadow under the piece
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

  // Draws one frame. view: { pieces, cfg, colours, aim: {show, sx, sy, angle, power, pullX, pullY, pulling} }
  function draw(ctx, view) {
    var cfg = view.cfg;
    var colours = view.colours;
    var total = cfg.size + 2 * MARGIN;
    ctx.clearRect(0, 0, total, total);
    drawBoard(ctx, cfg, colours);

    view.pieces.forEach(function (b) {
      if (b.alive) drawPiece(ctx, b, colours);
    });

    var a = view.aim;
    if (a && a.show) {
      var x = a.sx + MARGIN;
      var y = a.sy + MARGIN;
      // The line the striker will travel
      var len = 60 + a.power * 320;
      var dx = Math.sin(a.angle);
      var dy = -Math.cos(a.angle);
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = "rgba(255, 225, 77, " + (0.35 + 0.5 * a.power).toFixed(2) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * len, y + dy * len);
      ctx.stroke();
      ctx.restore();
      if (a.pulling) {
        // The pull-back band from the striker to the pointer
        ctx.strokeStyle = "rgba(0, 245, 160, 0.85)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(a.pullX + MARGIN, a.pullY + MARGIN);
        ctx.stroke();
      }
    }
  }

  root.CarromRender = {
    MARGIN: MARGIN,
    draw: draw,
    shade: shade,
    roundRect: roundRect
  };
})(window);
