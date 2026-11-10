# Carrom

A top-view carrom board with a coloured wooden frame, a striker and carrom men. Play against the computer (three levels), or with 2 or 4 players on one device. Loud, generated sound. Plain HTML, CSS and JavaScript. No dependencies, no build step, no API keys.

## Run it

Double-click `index.html`.

## Game modes

- **1 Player:** you against the computer. Choose Easy, Medium or Expert.
- **2 Players:** two people on one device, taking turns.
- **4 Players:** four people on one device, free-for-all.

## How to play

1. **Place the striker:** drag it along the baseline.
2. **Shoot:** press on the striker, pull back, and let go. The further you pull, the more power. A dashed line shows the direction.
3. **Scoring:** black coin 1 point, white coin 2 points, queen 5 points.
4. **Keep the turn:** a legal pocket keeps your turn. A miss passes it.
5. **Foul:** pocketing the striker costs a point, and the coins pocketed in that shot go back on the board.
6. **Queen:** pocket it with a white coin in the same shot to cover it. Otherwise cover it with a white coin in your next shot, or it goes back on the board.
7. **Game over:** when no coins are left on the board. The highest score wins.

## Sound

Every sound is generated in the browser with the Web Audio API, so no audio files are downloaded. Hits are louder the harder the pieces collide. A compressor keeps the loudest moments from distorting. Use the Sound button and the Volume slider to change it. Your setting is remembered in this browser.

## The computer

- **Easy, Medium, Expert** differ in how accurately they aim and how much power they use, and in how willing they are to play a shot that a coin might block.
- It finds every pocket shot, places the striker on the baseline so that its path runs head-on into the target, and sizes the power from the distance the target must travel.
- In tests it pocketed a clean single coin in about 3 out of 4 shots.

## Tests

```bash
node --test tests/carrom.test.js
```

The 21 tests cover: physics (friction, collisions, cushions, pockets, free spots), rules (scoring, turns, fouls, queen cover and return, game end, player counts, turn order), and the computer (shot finding, velocity direction, expert accuracy).

A full-game simulation with computer players only was also run during development. Games finished, and no invalid positions appeared.

## Structure

```
index.html              menu, match screen, scoreboard, power meter, game-over overlay, footer
css/app.css             wooden theme, glass panels, responsive board, footer
js/config.js            board size, physics, scoring, difficulty levels, colours
js/physics.js           pieces, collisions, cushions, pockets, friction (pure)
js/rules.js             turns, scoring, fouls, queen rules, game end (pure)
js/ai.js                computer shot finding and difficulty (pure)
js/sound.js             generated sound with volume and mute
js/render.js            top-view drawing on a canvas
js/app.js               menus, input (mouse and touch), match loop, HUD
tests/carrom.test.js    tests for physics, rules and the computer
```

## Notes

- Physics runs in fixed steps, so a shot plays the same on every device.
- The board is drawn on a canvas and sized by CSS, so it stays square on phones and laptops.
- "Goats" in the brief was read as the carrom men.
