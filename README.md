# Carrom

A top-view carrom board with a coloured wooden frame, a striker and carrom men. Play against the computer (three levels), or with 2 or 4 players on one device. Loud, generated sound. Plain HTML, CSS and JavaScript. No dependencies, no build step, no API keys.

## Run it

Double-click `index.html`.

## Game modes and sides

- **1 Player:** you against the computer. You play from the bottom line, the computer from the top line.
- **2 Players:** two people on one device, from opposite lines (bottom and top).
- **4 Players:** four people on one device, each from one side of the board (bottom, right, top, left). Each side has its own line and a label: PLAYER 1, PLAYER 2, PLAYER 3, PLAYER 4.

Each player moves the striker only along their own line. The active line is outlined in gold.

## Colours: hit white or black

- Each player hits one colour. In a 1-player game you choose white or black on the menu. In a 2-player game player 1 hits white and player 2 hits black. In a 4-player game the seats alternate white, black, white, black.
- The label on the frame and the hint under the board show the colour, for example **HIT WHITE**.
- **The striker's first contact must be a coin of your colour** (the queen counts for either colour). If the striker first touches the other colour, or touches nothing, it is a foul.
- The aim guide shows the first coin the striker will touch. It turns green with a tick when that coin is yours, and red with a cross when it isn't.
- When no coin of your colour is left on the board, your first touch is free.

## Scoring and fouls

- Black coin 1 point, white coin 2 points, queen 5 points.
- A legal pocket keeps your turn. A shot that pockets nothing passes the turn.
- A foul (striker pocketed, wrong first touch, or no touch) costs 1 point, the coins pocketed in that shot go back on the board, and the turn passes.
- **Queen:** pocket it with one of your own coins in the same shot to cover it. Otherwise cover it with your colour in your next shot, or it goes back on the board.
- The game ends when no coin or queen is left on the board. The highest score wins.

## How to shoot

1. **Place the striker:** drag it along your line.
2. **Aim and shoot:** press on the striker, pull back, and let go. The further you pull, the stronger the shot (full power at 120 units). The dashed line shows the direction, and the guide shows the first hit.

## The computer

- **Easy, Medium, Expert** differ in how accurately they aim and how often they risk a shot that could touch the wrong colour.
- It plans from its own line, aims the striker head-on at the target, and sizes the power from the distance the coin must travel.
- When no clean pocket shot exists, it plays a safety shot: a straight shot at the nearest coin of its colour, so the first touch is legal.
- It thinks and shoots faster than before.

## Sound

Every sound is generated in the browser with the Web Audio API, so no audio files are downloaded. Hits are louder the harder the pieces collide. A compressor keeps the loudest moments from distorting. Use the Sound button and the Volume slider to change it.

## Tests

```bash
node --test tests/carrom.test.js
```

The 28 tests cover: physics (friction, collisions, cushions, pockets, the striker's first contact, free spots), rules (colours, first-touch fouls, the free shot when your colour is gone, scoring, turns, the queen rules, game end, player counts, turn order), the side mapping (every side maps to the bottom and back), and the computer (shot finding for each colour, shots from the far side, safety, and pocket rates on all four sides).

Full games between computer players were also simulated during development. They finish in about 150 shots, with no invalid positions.

## Structure

```
index.html              menu (modes, colour, level), match screen, scoreboard, power, guide, footer
css/app.css             wooden theme, glass panels, responsive board, guide colours, footer
js/config.js            board size, physics, sides, seat colours, difficulty levels, colours
js/physics.js           pieces, collisions, cushions, pockets, friction, contact events (pure)
js/rules.js             colours, first-touch fouls, free shot, scoring, turns, queen rules (pure)
js/ai.js                computer shots from any side, safety shots, difficulty (pure)
js/sound.js             generated sound with volume and mute
js/render.js            top view: frame, sides, labels, pieces, aim and first-hit guide
js/app.js               menus, input (mouse and touch), match loop, HUD
tests/carrom.test.js    tests for physics, rules, sides and the computer
```

## Notes

- Physics runs in fixed steps, so a shot plays the same on every device.
- The board is drawn on a canvas and sized by CSS, so it stays square on phones and laptops.
- "Goats" in the brief was read as the carrom men.
