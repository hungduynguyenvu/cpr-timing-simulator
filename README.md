# CPR Timing Simulator

A small static web rhythm/timing game for practicing the rhythm of CPR chest compressions.

## Files

- `index.html` — page structure
- `styles.css` — visual styling
- `config.js` — **edit gameplay balance and text**
- `game.js` — game logic
- `assets/click.wav` — optional custom compression sound
- `assets/guide.wav` — optional custom metronome/guide sound
- `.nojekyll` — keeps GitHub Pages deployment simple

There are no package dependencies and no build step.

## Important current mechanics

- 30 expected compressions per set.
- Normal run: 2 sets. `5 cycles`: 5 sets.
- Perfect: 100–120 CPM.
- Waiting more than 1 second during an active set fails the run.
- Above 160 CPM fails the run.
- After compression 30, each extra click costs 15 points.
- Up to 5 extras in a set are tolerated; the 6th instantly fails the run.
- Between sets: 3-second stop, 7-second rest, then a 3-second Perfect start set window. Starting in the following 5 seconds makes the first click Meh; waiting beyond that fails the run.
- Press Esc twice to abandon a run without results.

## Result screen

The result screen includes:

- final accuracy
- SS/S/A/B/C/D rank and subtitle
- PP
- enabled mods
- judgement counts
- net points
- average / slowest / fastest CPM
- consistency (standard deviation of click intervals in milliseconds)
- overclick and late-start counts
- detailed per-set stats
- CPM graph per set


## Audio

The game uses the Web Audio API with a persistent master/click/guide gain graph and an interactive latency hint.

Put optional files here:

```text
assets/click.wav
assets/guide.wav
```

If a file is absent, that sound automatically falls back to a generated tone. The title screen has a master-volume slider.

For custom `.wav` files, testing through HTTP/HTTPS is more reliable than double-clicking `index.html`, because some browsers restrict fetching local files. GitHub Pages works normally.

click.wav and guide.wav is created with sfxr.me, and is included by default.