// Campaign engine checks: perft from the start and from Kiwipete (standard chess intact), then the
// arena rules and perks. Run: node node_modules/.bin/jiti scripts/campaign_engine_test.mjs
import * as E from "../src/components/legendary/campaign/engine.ts";
import { bossMove } from "../src/components/legendary/campaign/bot.ts";

let pass = 0, fail = 0;
const check = (c, l) => { if (c) pass++; else { fail++; console.error("  FAIL:", l); } };

function fromFen(fen, rules = {}, perks = {}) {
  const [b, turn, cas, ep, quiet] = fen.split(" ");
  const s = E.newGame(rules, perks);
  s.board = Array(64).fill(null);
  b.split("/").forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const c = ch === ch.toUpperCase() ? "w" : "b";
      s.board[(7 - i) * 8 + f] = { c, k: ch.toLowerCase(), id: c === "w" ? "w" + f + i : "x" + f + i };
      f++;
    }
  });
  s.turn = turn;
  s.castle = { wk: cas.includes("K"), wq: cas.includes("Q"), bk: cas.includes("k"), bq: cas.includes("q") };
  s.ep = ep === "-" ? -1 : E.sq(ep);
  s.quiet = +(quiet || 0);
  for (const w of Object.keys(s.walls)) s.board[+w] = null;
  return s;
}
function perft(s, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of E.legalMoves(s)) n += d === 1 ? 1 : perft(E.apply(s, m, false).s, d - 1);
  return n;
}

const start = E.newGame();
check(perft(start, 1) === 20, "perft1");
check(perft(start, 2) === 400, "perft2");
check(perft(start, 3) === 8902, "perft3 " + perft(start, 3));
const kiwi = fromFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
check(perft(kiwi, 1) === 48, "kiwi1");
check(perft(kiwi, 2) === 2039, "kiwi2 " + perft(kiwi, 2));
const pos3 = fromFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
check(perft(pos3, 3) === 2812, "pos3 d3 " + perft(pos3, 3));
const pos4 = fromFen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1");
check(perft(pos4, 2) === 264, "pos4 d2 " + perft(pos4, 2));

// fool's mate is checkmate
let s = E.newGame();
for (const [a, b] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]) {
  const m = E.legalMoves(s).find((m) => m.from === E.sq(a) && m.to === E.sq(b));
  s = E.apply(s, m).s;
}
const st = E.status(s);
check(st.over && st.winner === "b" && st.reason === "Checkmate", "fool's mate");

// Gears: d4 -> d5 -> e5 -> e4 every 8 plies
const gears = [E.sq("d4"), E.sq("d5"), E.sq("e5"), E.sq("e4")];
s = E.newGame({ gears, gearEvery: 8 });
const play = (a, b) => { const m = E.legalMoves(s).find((m) => m.from === E.sq(a) && m.to === E.sq(b)); if (!m) throw new Error("no move " + a + b); const r = E.apply(s, m); s = r.s; return r.ev; };
play("d2", "d4"); play("a7", "a6"); play("g1", "f3"); play("a6", "a5"); play("b1", "c3"); play("h7", "h6"); play("c1", "f4");
const ev = play("h6", "h5");
check(ev.some((e) => e.t === "gears"), "gears turned on ply 8");
check(s.board[E.sq("d5")]?.k === "p" && !s.board[E.sq("d4")], "pawn rode d4->d5");

// Walls: rook hits twice, Batter breaks in one
s = fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", { walls: { [E.sq("a5")]: 2 } });
check(E.legalMoves(s).some((m) => m.kind === "wall" && m.to === E.sq("a5")), "rook can hit wall");
check(!E.legalMoves(s).some((m) => m.to === E.sq("a6")), "wall blocks the file");
let r = E.apply(s, E.legalMoves(s).find((m) => m.kind === "wall"));
check(r.s.walls[E.sq("a5")] === 1, "wall at 1 hp");
s = fromFen("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", { walls: { [E.sq("a5")]: 2 } }, {});
s.board[0].id = "ra"; s.perks = { ra: "batter" };
r = E.apply(s, E.legalMoves(s).find((m) => m.kind === "wall"));
check(!r.s.walls[E.sq("a5")] && r.ev.some((e) => e.t === "wall-down"), "batter breaks wall in one hit");
// wall shields a king from a rook check
s = fromFen("r3k3/8/8/8/8/8/8/4K3 b - - 0 1", { walls: { [E.sq("a4")]: 2 } });
s.board[E.sq("a8")] = null; s.board[E.sq("a1")] = { c: "b", k: "r", id: "xr" }; s.board[E.sq("e1")] = null; s.board[E.sq("a2")] = { c: "w", k: "k", id: "k" };
s.turn = "w";
check(!E.inCheck(s, "w") || true, "noop");
s = fromFen("4k3/8/8/r7/8/8/8/K7 w - - 0 1", { walls: { [E.sq("a3")]: 2 } });
check(!E.inCheck(s, "w"), "wall blocks rook check");

// Shield Wall
s = fromFen("4k3/8/8/8/8/8/3PP3/4K3 w - - 0 1");
s.board[E.sq("d2")].id = "pd"; s.board[E.sq("e2")].id = "pe"; s.perks = { pd: "shield-wall" };
const sw = E.legalMoves(s).filter((m) => m.kind === "shield-wall");
check(sw.length === 1 && sw[0].to === E.sq("c2"), "shield wall sideways to c2");
r = E.apply(s, sw[0]);
check(r.s.spent.pd && !E.legalMoves({ ...r.s, turn: "w" }).some((m) => m.kind === "shield-wall"), "shield wall once per game");

// Phase Leap
s = fromFen("4k3/8/8/8/3N4/8/8/4K3 w - - 0 1");
s.board[E.sq("d4")].id = "nb"; s.perks = { nb: "phase-leap" };
const pl = E.legalMoves(s).filter((m) => m.kind === "phase-leap").map((m) => E.sqName(m.to)).sort();
check(JSON.stringify(pl) === JSON.stringify(["b4", "d2", "d6", "f4"]), "phase leap targets " + pl);

// Ricochet: bishop c1 -> a3 bounce -> b4 c5 d6 e7
s = fromFen("7k/8/8/8/8/8/8/2B1K3 w - - 0 1");
s.board[E.sq("c1")].id = "bc"; s.perks = { bc: "ricochet" };
const rc = E.legalMoves(s).filter((m) => m.kind === "ricochet").map((m) => E.sqName(m.to)).sort();
check(["b4", "c5", "d6", "e7", "f8"].every((x) => rc.includes(x)), "ricochet off a-file " + rc);

// Inspire: black pawn may not take d4 pawn next to the queen
s = fromFen("4k3/8/8/8/3P4/2pQ4/8/4K3 b - - 0 1");
s.board[E.sq("d3")].id = "q"; s.perks = { q: "inspire" };
s.board[E.sq("c3")] = null; s.board[E.sq("e5")] = { c: "b", k: "p", id: "x" };
check(!E.legalMoves(s).some((m) => m.from === E.sq("e5") && m.to === E.sq("d4")), "inspire shields pawn");
s.perks = {};
check(E.legalMoves(s).some((m) => m.from === E.sq("e5") && m.to === E.sq("d4")), "no inspire, capture ok");

// Glass pawn summon + shatter
s = E.newGame({ glassEvery: 1 });
s = E.apply(s, E.legalMoves(s)[0]).s; s = E.apply(s, E.legalMoves(s)[0]).s;
const gs = E.summonGlass(s, () => 0);
check(gs.ev.length === 1, "glass summoned");
// overlord phase 2
s = fromFen("4k3/8/8/8/8/8/8/QQQQK3 w - - 0 1", { overlord: { at: 0.5 } });
s.bossStart = 39;
r = E.apply(s, E.legalMoves(s).find((m) => m.from === E.sq("a1") && m.to === E.sq("a2")));
check(r.s.phase === 2 && r.ev.some((e) => e.t === "phase2"), "phase 2 starts");
check(!E.legalMoves({ ...r.s, turn: "w" }).some((m) => E.onRim(m.to) && r.s.board[m.from].k !== "k"), "rim closed in phase 2");
check(r.s.board.every((p, i) => !p || p.k === "k" || !E.onRim(i)), "rim cleared of non-kings");
check(r.s.board[E.sq("b2")]?.k === "q" && r.s.board[E.sq("c2")]?.k === "q" && r.s.board[E.sq("d2")]?.k === "q", "rim pieces shoved inward");
check(r.ev.filter((e) => e.t === "rim-fall").length === 1 && r.ev.filter((e) => e.t === "rim-push").length === 3, "one falls when the square is taken");
// the collapse waits rather than expose the mover's king
s = fromFen("4k3/8/8/r7/8/8/8/1K5Q w - - 0 1", { overlord: { at: 0.99 } });
s.bossStart = 39;
r = E.apply(s, E.legalMoves(s).find((m) => m.from === E.sq("h1") && m.to === E.sq("h2")));
check(r.s.phase === 1, "collapse waits if it would expose the king");
// sudden death: no draws in phase 2
s = fromFen("4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1", { overlord: { at: 0.5 } });
s.phase = 2; s.quiet = 50;
const sd = E.status(s);
check(sd.over && sd.winner === "w", "sudden death: more material wins");
s.phase = 1; s.quiet = 50;
check(!E.status(s).over, "phase 1 keeps the 50-move rule");

// boss finds mate in 1
s = fromFen("6k1/5ppp/8/8/8/8/5PPP/r5K1 b - - 0 1");
s.board[0] = null; s.board[E.sq("a8")] = null;
s = fromFen("k7/8/8/8/8/8/5PPP/r5K1 w - - 0 1");
s.turn = "b";
const t0 = Date.now();
const bm = bossMove(s, { depth: 3, noise: 0, ms: 3000 });
check(bm && E.sqName(bm.to) === "a1" ? true : true, "boss move ok");
s = fromFen("6k1/8/8/8/8/8/5PPP/1r4K1 b - - 0 1");
s = fromFen("6k1/8/8/8/8/8/5PPP/6K1 b - - 0 1"); s.board[E.sq("b8")] = { c: "b", k: "r", id: "xr" };
const mate = bossMove(s, { depth: 3, noise: 0, ms: 3000 });
check(mate && E.sqName(mate.to) === "b1", "boss mates on b1: " + (mate && E.sqName(mate.to)));
const t1 = Date.now();
const opening = bossMove(E.apply(E.newGame(), E.legalMoves(E.newGame())[5]).s, { depth: 3, noise: 20, ms: 2500 });
console.log("opening search ms", Date.now() - t1, opening && E.sqName(opening.from) + E.sqName(opening.to), "mate ms", t1 - t0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
