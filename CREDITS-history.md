# History feature credits

## Stockfish (move judging)

`public/stockfish/stockfish-19-lite-single.js` and `.wasm` are the Stockfish 19
chess engine compiled to WebAssembly by the stockfish.js project
(npm package `stockfish` 19.0.1, https://github.com/nmrugg/stockfish.js, by
Nathan Rugg and Chess.com), built from Stockfish (https://stockfishchess.org)
by the Stockfish developers (see the AUTHORS file in the Stockfish repository).

Stockfish and stockfish.js are free software under the **GNU General Public
License v3**. The full license text ships next to the engine at
`public/stockfish/COPYING.txt` (served at `/chess/stockfish/COPYING.txt`).
The engine files are used unmodified; their source is available at the
links above. The engine runs only in the player's browser, in a web worker,
to grade replayed moves.

## Replay sounds

`public/replay-sfx/*.mp3` are original clips made for Morse Chess. They were
synthesized from scratch (sine/FM tones, filtered noise and envelopes; no
samples) by `scripts/history-sfx.py`, and can be regenerated with it
(numpy + ffmpeg). They are part of this project and carry no third-party terms.
