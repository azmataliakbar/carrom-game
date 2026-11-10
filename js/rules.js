/* Carrom rules: pure logic, no DOM. Works in the browser (window.CarromRules) and in Node.

   - Black coin 1 point, white coin 2 points, queen 5 points (standard values).
   - Pocketing a coin (and not fouling) keeps the turn. Otherwise the turn passes to the next player.
   - Foul: the striker is pocketed. The coins pocketed in that shot go back on the board, and the player loses a point.
   - Queen: pocketed in a shot. It is covered if the same player also pockets a white coin in that shot.
     If not covered, the player must cover it with a white coin in their next shot, or the queen goes back
     on the board and no points are awarded. A foul in that next shot also returns the queen.
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

  // players: [{ name, computer, difficulty }]
  function createGame(players) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 4) {
      throw new Error("A game needs between 1 and 4 players");
    }
    return {
      players: players.map(function (p, i) {
        return {
          name: String(p.name || "Player " + (i + 1)).slice(0, 20),
          computer: !!p.computer,
          difficulty: p.difficulty || "medium",
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
  // pocketed: array of bodies pocketed in this shot (coins, the queen and possibly the striker).
  // onBoard: number of coins and queen still on the board after the shot (excluding pocketed ones).
  // Returns { foul, scored, returned: [bodies to put back on the board], continues, queenResult, message }.
  function resolveShot(state, pocketed, onBoard) {
    if (state.over) throw new Error("The game is over");
    var shooter = state.turn;
    var p = state.players[shooter];
    var striker = pocketed.some(function (b) { return b.kind === "striker"; });
    var coins = pocketed.filter(function (b) { return b.kind !== "striker"; });
    var whites = coins.filter(function (b) { return b.kind === "coin" && b.colour === "white"; }).length;
    var blacks = coins.filter(function (b) { return b.kind === "coin" && b.colour === "black"; }).length;
    var queenIn = coins.some(function (b) { return b.kind === "queen"; });
    var returned = [];
    var scored = 0;
    var messages = [];
    var queenResult = "";

    state.shots += 1;

    // Queen pending from an earlier shot by this player: this is the cover shot.
    var pendingCover = state.queenHeld && state.queenOwner === shooter;

    if (striker) {
      // Foul: everything pocketed this shot goes back, and the penalty applies.
      state.fouls += 1;
      p.score -= FOUL_PENALTY;
      scored -= FOUL_PENALTY;
      coins.forEach(function (b) { returned.push(b); });
      messages.push(p.name + " fouled (striker pocketed): -" + FOUL_PENALTY + ", coins returned.");
      if (pendingCover) {
        // The queen was not covered in time.
        state.queenHeld = false;
        state.queenOwner = -1;
        queenResult = "returned";
        messages.push("The queen was not covered and goes back on the board.");
      }
      state.turn = nextPlayer(state);
      state.log.push({ shot: state.shots, player: shooter, foul: true, scored: scored });
    } else {
      // Points for the coins pocketed.
      var pts = blacks * POINTS.black + whites * POINTS.white;
      p.score += pts;
      scored += pts;
      p.coinsPocketed += blacks + whites;
      if (blacks + whites > 0) messages.push(p.name + " pocketed " + (blacks + whites) + " coin(s): +" + pts + ".");

      if (pendingCover) {
        if (whites > 0) {
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
        if (whites > 0) {
          // Pocketed with a white in the same shot: covered immediately.
          p.score += POINTS.queen;
          scored += POINTS.queen;
          queenResult = "covered";
          messages.push(p.name + " pocketed the queen and covered it: +" + POINTS.queen + ".");
        } else {
          // Not covered yet: the queen is held until the next shot.
          state.queenHeld = true;
          state.queenOwner = shooter;
          queenResult = "held";
          messages.push(p.name + " pocketed the queen. It must be covered next shot.");
        }
      } else if (queenIn && pendingCover) {
        // The queen was pocketed again while held (should not happen, but keep the rule simple): treat as covered.
        queenResult = "covered";
      }

      var scoredAnything = blacks + whites + (queenIn ? 1 : 0) > 0;
      state.log.push({ shot: state.shots, player: shooter, foul: false, scored: scored });
      // A legal pocket keeps the turn. Otherwise the turn passes.
      if (!scoredAnything) state.turn = nextPlayer(state);
    }

    var continues = !striker && coins.length > 0;

    // Game end: nothing left on the board and no queen waiting for a cover.
    if (onBoard <= 0 && !state.queenHeld) {
      state.over = true;
      state.winner = bestPlayer(state);
      messages.push("Game over. " + state.players[state.winner].name + " wins.");
    }

    return {
      foul: striker,
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

  // Gives the turn to the next player after a placement or shot that did not continue.
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
