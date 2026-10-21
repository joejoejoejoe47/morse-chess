/**
 * Move judging for History replays.
 *
 * Every position of the game is evaluated by Stockfish 19 (lite, single-threaded
 * WASM build, GPLv3, served from /stockfish/) in a web worker. Each move is then
 * graded by how many centipawns it lost against the engine's best line:
 *
 *   brilliant   best move that gives up material (a real sacrifice) and still holds
 *   great       the engine's own best move
 *   good        lost 50 cp or less
 *   inaccuracy  lost 51..100 cp   (the "questionable" move, ❓)
 *   mistake     lost 101..250 cp
 *   blunder     lost more than 250 cp
 *
 * Results are cached per game in localStorage, so a game is analysed once per device.
 */
import { Chess, type Move } from "chess.js";
import { asset } from "@/lib/base";
import type { HistoryMove } from "@/lib/server/mores";

export type Judgment = "brilliant" | "great" | "good" | "inaccuracy" | "mistake" | "blunder";

export type MoveVerdict = {
  kind: Judgment;
  /** Centipawns the move lost against the engine's best (mover's point of view). */
  loss: number;
  /** Eval after the move, White's point of view, cp (mate = ±10000). */
  evalAfter: number;
  best: string | null;
};

export type GameJudgment = { version: number; verdicts: MoveVerdict[]; evals: number[] };

const VERSION = 1;
const KEY = (id: string) => `morse-judge-v${VERSION}:${id}`;
const MATE = 10000;
const CLAMP = 1000;
const VALUE: Record<string, number> = { p: 100, n: 300, b: 310, r: 500, q: 900, k: 0 };

export function cachedJudgment(gameId: string): GameJudgment | null {
  try {
    const raw = window.localStorage.getItem(KEY(gameId));
    if (!raw) return null;
    const j = JSON.parse(raw) as GameJudgment;
    return j.version === VERSION ? j : null;
  } catch {
    return null;
  }
}

function saveJudgment(gameId: string, j: GameJudgment) {
  try {
    window.localStorage.setItem(KEY(gameId), JSON.stringify(j));
  } catch {
    /* storage full: judge again next time */
  }
}

/** Positions before each move and after the last one, plus the verbose moves. */
export function replayLine(moves: HistoryMove[]) {
  const chess = new Chess();
  const fens = [chess.fen()];
  const played: Move[] = [];
  for (const m of moves) {
    let mv: Move | null = null;
    try {
      mv = chess.move(m.san);
    } catch {
      try {
        mv = chess.move({ from: m.from, to: m.to, promotion: "q" });
      } catch {
        mv = null;
      }
    }
    if (!mv) break;
    played.push(mv);
    fens.push(chess.fen());
  }
  return { fens, played };
}

type Score = { cp: number; best: string | null; pv: string[] };

/** One engine for the page; positions are queued and answered in order. */
class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private failed: ((e: Error) => void)[] = [];
  private broken: Error | null = null;

  constructor() {
    this.worker = new Worker(asset("/stockfish/stockfish-19-lite-single.js"));
    this.worker.addEventListener("error", () => this.fail(new Error("engine failed to load")));
    this.ready = new Promise((resolve, reject) => {
      this.failed.push(reject);
      const onMsg = (e: MessageEvent) => {
        if (String(e.data).startsWith("readyok")) {
          this.worker.removeEventListener("message", onMsg);
          resolve();
        }
      };
      this.worker.addEventListener("message", onMsg);
      this.worker.postMessage("uci");
      this.worker.postMessage("setoption name Hash value 32");
      this.worker.postMessage("isready");
    });
  }

  evaluate(fen: string, depth = 12, movetime = 700): Promise<Score> {
    const job = this.queue.then(() =>
      this.ready.then(
        () =>
          new Promise<Score>((resolve, reject) => {
            if (this.broken) return reject(this.broken);
            this.failed.push(reject);
            // A stuck search gives up after 6 s so the replay never waits forever.
            const timer = window.setTimeout(() => this.fail(new Error("engine timed out")), 6000);
            let last: Score = { cp: 0, best: null, pv: [] };
            const onMsg = (e: MessageEvent) => {
              const line = String(e.data);
              if (line.startsWith("info") && line.includes(" score ")) {
                const cp = /score cp (-?\d+)/.exec(line);
                const mate = /score mate (-?\d+)/.exec(line);
                const pv = / pv (.+)$/.exec(line);
                const score = mate
                  ? Math.sign(Number(mate[1]) || -1) * (MATE - Math.abs(Number(mate[1])) * 10)
                  : Number(cp?.[1] ?? 0);
                last = {
                  cp: score,
                  best: pv ? pv[1].split(" ")[0] : last.best,
                  pv: pv ? pv[1].split(" ") : last.pv,
                };
              } else if (line.startsWith("bestmove")) {
                this.worker.removeEventListener("message", onMsg);
                window.clearTimeout(timer);
                this.failed = this.failed.filter((f) => f !== reject);
                const bm = line.split(" ")[1];
                resolve({ ...last, best: bm && bm !== "(none)" ? bm : last.best });
              }
            };
            this.worker.addEventListener("message", onMsg);
            this.worker.postMessage(`position fen ${fen}`);
            this.worker.postMessage(`go depth ${depth} movetime ${movetime}`);
          }),
      ),
    );
    this.queue = job.catch(() => undefined);
    return job;
  }

  private fail(e: Error) {
    this.broken = e;
    const waiting = this.failed;
    this.failed = [];
    waiting.forEach((f) => f(e));
    this.worker.terminate();
  }

  stop() {
    this.worker.terminate();
  }
}

function material(chess: Chess, side: "w" | "b") {
  let sum = 0;
  for (const row of chess.board())
    for (const p of row) if (p) sum += (p.color === side ? 1 : -1) * VALUE[p.type];
  return sum;
}

const clamp = (x: number) => Math.max(-CLAMP, Math.min(CLAMP, x));

function grade(opts: {
  before: number;
  after: number;
  isBest: boolean;
  sacrifice: boolean;
}): Judgment {
  const loss = Math.max(0, clamp(opts.before) - clamp(opts.after));
  if (opts.isBest || loss <= 8) {
    if (opts.sacrifice && opts.after > -60 && opts.before < 900) return "brilliant";
    return opts.isBest ? "great" : "good";
  }
  if (loss <= 50) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

/**
 * Judge the whole game. `onProgress(verdicts)` fires as each move is graded, so a
 * replay can start right away and pick verdicts up as they arrive.
 */
export function judgeGame(
  gameId: string,
  moves: HistoryMove[],
  onProgress: (j: GameJudgment, done: boolean) => void,
): () => void {
  const cached = cachedJudgment(gameId);
  if (cached && cached.verdicts.length === moves.length) {
    onProgress(cached, true);
    return () => undefined;
  }
  let cancelled = false;
  let engine: Engine | null = null;
  try {
    engine = new Engine();
  } catch {
    return () => undefined;
  }
  const { fens, played } = replayLine(moves);
  const verdicts: MoveVerdict[] = [];
  const evals: number[] = [];
  void (async () => {
    try {
      // Score of each position, side-to-move point of view.
      const scores: Score[] = [];
      const scoreAt = async (i: number) => {
        if (scores[i]) return scores[i];
        const c = new Chess(fens[i]);
        let s: Score;
        if (c.isCheckmate()) s = { cp: -MATE, best: null, pv: [] };
        else if (c.isDraw() || c.isStalemate()) s = { cp: 0, best: null, pv: [] };
        else s = await engine!.evaluate(fens[i]);
        scores[i] = s;
        return s;
      };
      for (let i = 0; i < played.length && !cancelled; i++) {
        const before = await scoreAt(i);
        const afterOpp = await scoreAt(i + 1);
        if (cancelled) break;
        const mv = played[i];
        const mover = mv.color;
        const afterMine = -afterOpp.cp;
        const uci = `${mv.from}${mv.to}${mv.promotion ?? ""}`;
        const isBest = before.best !== null && before.best.slice(0, 4) === uci.slice(0, 4);
        // A sacrifice: after the opponent's best reply the mover is down material vs. before the move.
        let sacrifice = false;
        if (afterOpp.pv.length > 0) {
          const probe = new Chess(fens[i + 1]);
          const reply = afterOpp.pv[0];
          try {
            probe.move({
              from: reply.slice(0, 2),
              to: reply.slice(2, 4),
              promotion: reply[4] ?? "q",
            });
            sacrifice = material(new Chess(fens[i]), mover) - material(probe, mover) >= 200;
          } catch {
            sacrifice = false;
          }
        }
        const kind = grade({ before: before.cp, after: afterMine, isBest, sacrifice });
        const evalWhite = mover === "w" ? afterMine : -afterMine;
        verdicts.push({
          kind,
          loss: Math.max(0, clamp(before.cp) - clamp(afterMine)),
          evalAfter: evalWhite,
          best: before.best,
        });
        evals.push(evalWhite);
        onProgress({ version: VERSION, verdicts: [...verdicts], evals: [...evals] }, false);
      }
      if (!cancelled && verdicts.length === played.length) {
        const j = { version: VERSION, verdicts, evals };
        saveJudgment(gameId, j);
        onProgress(j, true);
      }
      engine?.stop();
    } catch {
      // Engine unavailable: replay keeps working without verdicts for the rest.
      if (!cancelled)
        onProgress({ version: VERSION, verdicts: [...verdicts], evals: [...evals] }, true);
    }
  })();
  return () => {
    cancelled = true;
    engine?.stop();
  };
}

/** The ply (moves applied) worth a picture: biggest swing if judged, else the loudest move. */
export function pickMoment(moves: HistoryMove[], judged?: GameJudgment | null): number {
  if (moves.length === 0) return 0;
  const { played } = replayLine(moves);
  if (judged && judged.verdicts.length === played.length) {
    let best = played.length;
    let bestScore = -1;
    judged.verdicts.forEach((v, i) => {
      const bonus = v.kind === "brilliant" ? 2000 : v.kind === "blunder" ? 1000 : 0;
      const sc = v.loss + bonus;
      if (sc > bestScore) {
        bestScore = sc;
        best = i + 1;
      }
    });
    return best;
  }
  let best = played.length;
  let bestScore = 0;
  played.forEach((m, i) => {
    let sc = 0;
    if (m.san.includes("#")) sc += 100;
    if (m.captured) sc += VALUE[m.captured] / 20;
    if (m.san.includes("+")) sc += 4;
    if (m.promotion) sc += 20;
    if (sc >= bestScore && sc > 0) {
      bestScore = sc;
      best = i + 1;
    }
  });
  return best;
}
