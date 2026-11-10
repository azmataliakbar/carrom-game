/* Carrom configuration. Exposes window.CARROM.config. All board units are logical pixels on an 800 x 800 board.
   The physics runs in fixed steps so the game plays the same on every device. */
(function () {
  "use strict";
  window.CARROM = window.CARROM || {};
  window.CARROM.config = {
    size: 800,               // board side, in logical units
    pocketR: 30,             // pocket radius (a little larger than a coin, as on most carrom boards)
    coinR: 16,               // carrom man radius
    strikerR: 20,            // striker radius (a little larger than a coin)
    baselineY: 690,          // striker baseline (near the bottom edge)
    baselineMin: 150,        // striker can slide between these x positions
    baselineMax: 650,

    // Physics
    stepS: 1 / 120,          // fixed physics step, seconds
    friction: 0.9,           // speed decay per second (exponential drag)
    restitution: 0.82,       // bounce between pieces
    wallRestitution: 0.7,    // bounce off the cushions
    minSpeed: 8,             // below this a piece is at rest
    maxShot: 1600,           // striker speed at full power, units per second
    settleTimeoutS: 14,      // safety: end a shot after this long even if something keeps moving

    // Scoring (standard carrom values)
    points: { black: 1, white: 2, queen: 5 },
    foulPenalty: 1,          // points lost for a foul (striker pocketed)

    // Computer opponents: how far its aim and power are off from perfect
    difficulty: {
      easy:   { angle: 0.14, power: 0.28, blockPenalty: 0.2, label: "Easy" },
      medium: { angle: 0.05, power: 0.12, blockPenalty: 0.6, label: "Medium" },
      hard:   { angle: 0.015, power: 0.04, blockPenalty: 1.0, label: "Expert" }
    },

    // Visual palette
    colours: {
      frame: "#7a4a22",      // wood frame
      field: "#f2d9a0",      // cream playing field
      field2: "#e7b87a",     // field gradient edge
      line: "#b5382e",       // red decorative lines
      line2: "#245c9a",      // blue baseline bars
      pocket: "#120d08",
      white: "#fbf8f0",
      black: "#1c1c24",
      queen: "#d6333f",
      striker: "#f29a3a"
    }
  };
})();
