/* Carrom rules: pure logic, no DOM. Works in the browser (window.CarromRules) and in Node.

   - Each player has a target colour: white or black. Standard values: black coin 1, white coin 2, queen 5.
   - THE STRIKER MUST HIT ITS COLOUR FIRST. The first coin the striker touches must be the player's colour
     (the queen counts for either colour). If the first touch is the other colour, or the striker touches
     nothing, it is a foul.
   - Foul (striker pocketed, or wrong first touch): the coins pocketed in that shot go back on the board,
     the player loses a point, and the turn passes.
   - A legal shot that pockets a coin keeps the turn. A shot that pockets nothing passes it.
   - Queen: pocketed in a shot. It is covered if the same player also pockets one of their own coins in that shot.
     If not, the player must cover it with their own colour in the next shot, or the queen goes back on the board
     and no points are awarded. A foul in that next shot also returns the queen.
   - The game ends when no coin or queen is left on the board and nothing is pending. Highest score wins. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CarromRules = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var POINTS = { black: 1, white: 2, queen: 5 };
  var FOUL_PENALTY = 1;
  var DEFAULT_COLOURS = ["white", "black", "white", "black"];

  // players: [{ name, computer, difficulty, colour }]. colour defaults to the seat's colour (white, black, ...).
  function createGame(players) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 4) {
      throw new Error("A game needs between 1 and 4 players");
    }
    return {
      players: players.map(function (p, i) {
        var colour = p.colour === "black" || p.colour === "white" ? p.colour : DEFAULT_COLOURS[i];
        return {
          name: String(p.name || "Player " + (i + 1)).slice(0, 20),
          computer: !!p.computer,
          difficulty: p.difficulty || "medium",
          colour: colour,
          score: 0,
          coinsPocketed: 0
        };
      }),
      turn: 0,
      queenOwner: -1,        // player who pocketed the queen and has not covered it yet, or -1
      queenHeld: false,      // true while the queen is off the board waiting for a cover
      shots: 0,
      fouls: 0,
      over: false,
      winner: -1,
      log: []
    };
  }

  function nextPlayer(state) {
    return (state.turn + 1) % state.players.length;
  }

  // Resolves one finished shot.
  // pocketed: bodies pocketed in this shot (coins, the queen and possibly the striker).
  // onBoard: number of coins and queen still on the board after the shot, not counting the ones pocketed now.
  // info: { firstTouch: the first coin or queen the striker touched, or null }. Omit it to skip the colour check.
  // Returns { foul, reason, scored, returned, continues, queenResult, message }.
  function resolveShot(state, pocketed, onBoard, info) {
    if (state.over) throw new Error("The game is over");
    var shooter = state.turn;
    var p = state.players[shooter];
    var target = p.colour;
    var striker = pocketed.some(function (b) { return b.kind === "striker"; });
    var coins = pocketed.filter(function (b) { return b.kind !== "striker"; });
    var own = coins.filter(function (b) { return b.kind === "coin" && b.colour === target; }).length;
    var others = coins.filter(function (b) { return b.kind === "coin" && b.colour !== target; });
    var blacks = coins.filter(function (b) { return b.kind === "coin" && b.colour === "black"; }).length;
    var whites = coins.filter(function (b) { return b.kind === "coin" && b.colour === "white"; }).length;
    var queenIn = coins.some(function (b) { return b.kind === "queen"; });
    var returned = [];
    var scored = 0;
    var messages = [];
    var queenResult = "";

    // The colour rule: the first contact must be the player's colour, or the queen.
    var firstTouch = info ? info.firstTouch : undefined;
    // When no coin of the player's colour is left on the board, the first-touch rule is waived (a free shot).
    var free = !!(info && info.free);
    var touchOk = info === undefined || free || !!(firstTouch && (firstTouch.kind === "queen" || firstTouch.colour === target));
    var reason = "";
    if (striker) {
      reason = "the striker was pocketed";
    } else if (!touchOk) {
      reason = firstTouch
        ? "the striker hit " + firstTouch.colour + " first; you must hit " + target + " first"
        : "the striker touched no coin; you must hit " + target + " first";
    }
    var foul = striker || !touchOk;

    state.shots += 1;

    // A queen waiting for a cover, and this is the player's next shot.
    var pendingCover = state.queenHeld && state.queenOwner === shooter;

    if (foul) {
      // Foul: everything pocketed this shot goes back, and the penalty applies.
      state.fouls += 1;
      p.score -= FOUL_PENALTY;
      scored -= FOUL_PENALTY;
      coins.forEach(function (b) { returned.push(b); });
      messages.push(p.name + " fouled (" + reason + "): -" + FOUL_PENALTY + ", coins returned.");
      if (pendingCover) {
        state.queenHeld = false;
        state.queenOwner = -1;
        queenResult = "returned";
        messages.push("The queen was not covered and goes back on the board.");
      }
      state.turn = nextPlayer(state);
      state.log.push({ shot: state.shots, player: shooter, foul: true, scored: scored });
    } else {
      // Points for every coin pocketed, whatever its colour.
      var pts = blacks * POINTS.black + whites * POINTS.white;
      p.score += pts;
      scored += pts;
      p.coinsPocketed += blacks + whites;
      if (blacks + whites > 0) messages.push(p.name + " pocketed " + (blacks + whites) + " coin(s): +" + pts + ".");

      if (pendingCover) {
        if (own > 0) {
          p.score += POINTS.queen;
          scored += POINTS.queen;
          queenResult = "covered";
          messages.push("The queen is covered: +" + POINTS.queen + ".");
        } else {
          queenResult = "returned";
          messages.push("The queen was not covered and goes back on the board.");
        }
        state.queenHeld = false;
        state.queenOwner = -1;
      }

      if (queenIn && !pendingCover) {
        if (own > 0) {
          p.score += POINTS.queen;
          scored += POINTS.queen;
          queenResult = "covered";
          messages.push(p.name + " pocketed the queen and covered it: +" + POINTS.queen + ".");
        } else {
          state.queenHeld = true;
          state.queenOwner = shooter;
          queenResult = "held";
          messages.push(p.name + " pocketed the queen. It must be covered next shot.");
        }
      }

      var scoredAnything = blacks + whites + (queenIn ? 1 : 0) > 0;
      state.log.push({ shot: state.shots, player: shooter, foul: false, scored: scored });
      if (!scoredAnything) state.turn = nextPlayer(state);
      void others;
    }

    var continues = !foul && coins.length > 0;

    if (onBoard <= 0 && !state.queenHeld) {
      state.over = true;
      state.winner = bestPlayer(state);
      messages.push("Game over. " + state.players[state.winner].name + " wins.");
    }

    return {
      foul: foul,
      reason: reason,
      scored: scored,
      returned: returned,
      continues: continues && !state.over,
      queenResult: queenResult,
      message: messages.join(" ")
    };
  }

  // Highest score wins. A tie goes to the player with more coins pocketed, then to the earlier player.
  function bestPlayer(state) {
    var best = 0;
    state.players.forEach(function (pl, i) {
      var cur = state.players[best];
      if (pl.score > cur.score || (pl.score === cur.score && pl.coinsPocketed > cur.coinsPocketed)) best = i;
    });
    return best;
  }

  function advanceTurn(state) {
    if (!state.over) state.turn = nextPlayer(state);
    return state;
  }

  return {
    POINTS: POINTS,
    FOUL_PENALTY: FOUL_PENALTY,
    createGame: createGame,
    resolveShot: resolveShot,
    advanceTurn: advanceTurn,
    bestPlayer: bestPlayer,
    nextPlayer: nextPlayer
  };
});
