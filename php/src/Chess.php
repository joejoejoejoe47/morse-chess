<?php

declare(strict_types=1);

namespace Morse;

/**
 * Chess engine: a port of the subset of chess.js v1.4 used by the Node server.
 *
 * Representation: 0x88 board (a8 = 0 ... h1 = 119, same layout as chess.js) in a
 * flat int array. Piece value = type | (color << 3); type 1..6 = p n b r q k,
 * color 0 = white, 1 = black, 0 = empty.
 *
 * Moves are packed into an int internally:
 *   from(7) | to(7)<<7 | piece(3)<<14 | captured(3)<<17 | promotion(3)<<20 | flags<<23
 * with chess.js flag bits (n=1 c=2 b=4 e=8 p=16 k=32 q=64).
 * SAN, before/after FENs and history are produced lazily.
 *
 * Public API follows the task spec; extra fast-path helpers for search:
 *   genMoves(), push(int), pop(), decode(int, bool), perft(int), board().
 */
final class Chess
{
    public const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    private const F_NORMAL = 1;
    private const F_CAPTURE = 2;
    private const F_BIG = 4;
    private const F_EP = 8;
    private const F_PROMO = 16;
    private const F_KSIDE = 32;
    private const F_QSIDE = 64;

    private const KNIGHT_OFF = [-18, -33, -31, -14, 18, 33, 31, 14];
    private const BISHOP_OFF = [-17, -15, 17, 15];
    private const ROOK_OFF = [-16, 1, 16, -1];
    private const QUEEN_OFF = [-17, -16, -15, 1, 17, 16, 15, -1];

    private const LETTER = [1 => 'p', 2 => 'n', 3 => 'b', 4 => 'r', 5 => 'q', 6 => 'k'];

    // ---- static tables (built once) ----
    /** @var array<int,int>|null */
    private static ?array $Z = null;      // zobrist piece keys [piece*128+sq]
    /** @var array<int,int> */
    private static array $ZC = [];        // castling keys [0..15]
    /** @var array<int,int> */
    private static array $ZEP = [];       // ep file keys
    private static int $ZSIDE = 0;
    /** @var array<int,int> */
    private static array $CM = [];        // castling mask per square
    /** @var list<int> */
    private static array $SQ = [];        // valid squares in a8..h1 order
    /** @var array<int,string> */
    private static array $ALG = [];       // square -> 'e4'
    /** @var array<string,int> */
    private static array $IDX = [];       // 'e4' -> square

    // ---- position state ----
    /** @var array<int,int> */
    private array $b = [];
    private int $turn = 0;
    private int $castling = 0; // 1=WK 2=WQ 4=BK 8=BQ
    private int $ep = -1;      // raw en-passant target square (set after every double push)
    private int $half = 0;
    private int $full = 1;
    /** @var array{0:int,1:int} */
    private array $kings = [-1, -1];
    private int $h = 0;        // zobrist of board+turn+castling

    // ---- history ----
    /** @var list<int> */
    private array $sMove = [];
    /** @var list<int> */
    private array $sCast = [];
    /** @var list<int> */
    private array $sEp = [];
    /** @var list<int> */
    private array $sHalf = [];
    /** @var list<int> */
    private array $sH = [];
    /** @var list<?string> */
    private array $sSan = [];
    /** @var list<int> position keys (hash incl. legal ep), keys[0] = loaded position */
    private array $keys = [];

    public function __construct(?string $fen = null)
    {
        self::init();
        $this->load($fen ?? self::START_FEN);
    }

    /** PHP arrays are value types, so the default clone is already a deep copy. */
    public function __clone()
    {
    }

    // =====================================================================
    // static init
    // =====================================================================

    private static function init(): void
    {
        if (self::$Z !== null) {
            return;
        }
        $n = 16 * 128 + 16 + 8 + 1;
        $raw = random_bytes($n * 8);
        /** @var array<int,int> $vals */
        $vals = array_values(unpack('q*', $raw));
        $Z = [];
        for ($i = 0; $i < 16 * 128; $i++) {
            $Z[$i] = $vals[$i];
        }
        $o = 16 * 128;
        for ($i = 0; $i < 16; $i++) {
            self::$ZC[$i] = $vals[$o + $i];
        }
        self::$ZC[0] = 0;
        for ($i = 0; $i < 8; $i++) {
            self::$ZEP[$i] = $vals[$o + 16 + $i];
        }
        self::$ZSIDE = $vals[$o + 24];
        for ($sq = 0; $sq < 128; $sq++) {
            self::$CM[$sq] = 15;
            if (!($sq & 0x88)) {
                self::$SQ[] = $sq;
                $a = chr(97 + ($sq & 7)) . (string) (8 - ($sq >> 4));
                self::$ALG[$sq] = $a;
                self::$IDX[$a] = $sq;
            }
        }
        self::$CM[0] = 7;     // a8 -> BQ
        self::$CM[7] = 11;    // h8 -> BK
        self::$CM[4] = 3;     // e8 -> both black
        self::$CM[112] = 13;  // a1 -> WQ
        self::$CM[119] = 14;  // h1 -> WK
        self::$CM[116] = 12;  // e1 -> both white
        self::$Z = $Z;
    }

    // =====================================================================
    // FEN
    // =====================================================================

    private function load(string $fen): void
    {
        $tokens = preg_split('/\s+/', trim($fen));
        if ($tokens === false) {
            throw new \InvalidArgumentException('Invalid FEN');
        }
        $nt = count($tokens);
        if ($nt >= 2 && $nt < 6) {
            $adj = ['-', '-', '0', '1'];
            $tokens = array_merge($tokens, array_slice($adj, -(6 - $nt)));
        }
        if (count($tokens) !== 6) {
            throw new \InvalidArgumentException('Invalid FEN: must contain six space-delimited fields');
        }
        [$placement, $side, $cast, $epS, $hm, $fm] = $tokens;
        if (!preg_match('/^\d+$/', $fm) || (int) $fm <= 0) {
            throw new \InvalidArgumentException('Invalid FEN: move number must be a positive integer');
        }
        if (!preg_match('/^\d+$/', $hm)) {
            throw new \InvalidArgumentException('Invalid FEN: half move counter must be a non-negative integer');
        }
        if (!preg_match('/^(-|[a-h][36])$/', $epS)) {
            throw new \InvalidArgumentException('Invalid FEN: en-passant square is invalid');
        }
        if (($epS[1] ?? '') === '3' && $side === 'w' || ($epS[1] ?? '') === '6' && $side === 'b') {
            throw new \InvalidArgumentException('Invalid FEN: illegal en-passant square');
        }
        if (!preg_match('/^(KQ?k?q?|Qk?q?|kq?|q|-)$/', $cast)) {
            throw new \InvalidArgumentException('Invalid FEN: castling availability is invalid');
        }
        if ($side !== 'w' && $side !== 'b') {
            throw new \InvalidArgumentException('Invalid FEN: side-to-move is invalid');
        }
        $rows = explode('/', $placement);
        if (count($rows) !== 8) {
            throw new \InvalidArgumentException("Invalid FEN: piece data does not contain 8 '/'-delimited rows");
        }
        $b = array_fill(0, 128, 0);
        $kings = [-1, -1];
        $nk = [0, 0];
        $map = ['p' => 1, 'n' => 2, 'b' => 3, 'r' => 4, 'q' => 5, 'k' => 6];
        foreach ($rows as $r => $row) {
            $sum = 0;
            $prevNum = false;
            $len = strlen($row);
            for ($i = 0; $i < $len; $i++) {
                $ch = $row[$i];
                if ($ch >= '0' && $ch <= '9') {
                    if ($prevNum) {
                        throw new \InvalidArgumentException('Invalid FEN: piece data is invalid (consecutive number)');
                    }
                    $sum += (int) $ch;
                    $prevNum = true;
                } else {
                    $lc = strtolower($ch);
                    if (!isset($map[$lc]) || strlen($ch) !== 1) {
                        throw new \InvalidArgumentException('Invalid FEN: piece data is invalid (invalid piece)');
                    }
                    if ($sum >= 8) {
                        throw new \InvalidArgumentException('Invalid FEN: piece data is invalid (too many squares in rank)');
                    }
                    $color = $ch === $lc ? 1 : 0;
                    $sq = $r * 16 + $sum;
                    $b[$sq] = $map[$lc] | ($color << 3);
                    if ($map[$lc] === 6) {
                        $kings[$color] = $sq;
                        $nk[$color]++;
                    }
                    $sum++;
                    $prevNum = false;
                }
            }
            if ($sum !== 8) {
                throw new \InvalidArgumentException('Invalid FEN: piece data is invalid (too many squares in rank)');
            }
        }
        if ($nk[0] !== 1 || $nk[1] !== 1) {
            throw new \InvalidArgumentException('Invalid FEN: missing or extra kings');
        }

        $c = 0;
        if (str_contains($cast, 'K')) {
            $c |= 1;
        }
        if (str_contains($cast, 'Q')) {
            $c |= 2;
        }
        if (str_contains($cast, 'k')) {
            $c |= 4;
        }
        if (str_contains($cast, 'q')) {
            $c |= 8;
        }
        // sanitize castling rights against the actual board
        if ($b[116] !== 6 || $b[119] !== 4) {
            $c &= ~1;
        }
        if ($b[116] !== 6 || $b[112] !== 4) {
            $c &= ~2;
        }
        if ($b[4] !== 14 || $b[7] !== 12) {
            $c &= ~4;
        }
        if ($b[4] !== 14 || $b[0] !== 12) {
            $c &= ~8;
        }

        $this->b = $b;
        $this->kings = $kings;
        $this->turn = $side === 'w' ? 0 : 1;
        $this->castling = $c;
        $this->half = (int) $hm;
        $this->full = (int) $fm;
        $this->ep = $epS === '-' ? -1 : self::$IDX[$epS];

        // chess.js _updateEnPassantSquare: drop the ep square unless a pawn could capture
        if ($this->ep >= 0) {
            $us = $this->turn;
            $ep = $this->ep;
            $start = $ep + ($us === 0 ? -16 : 16);
            $cur = $ep + ($us === 0 ? 16 : -16);
            $ok = !($start & 0x88) && !($cur & 0x88)
                && $b[$start] === 0 && $b[$ep] === 0
                && $b[$cur] === (1 | (($us ^ 1) << 3));
            if ($ok) {
                $mine = 1 | ($us << 3);
                $ok = (!(($cur + 1) & 0x88) && $b[$cur + 1] === $mine)
                    || (!(($cur - 1) & 0x88) && $b[$cur - 1] === $mine);
            }
            if (!$ok) {
                $this->ep = -1;
            }
        }

        $this->sMove = $this->sCast = $this->sEp = $this->sHalf = $this->sH = $this->sSan = [];
        $this->h = $this->computeHash();
        $this->keys = [$this->posKey()];
    }

    private function computeHash(): int
    {
        $h = 0;
        $Z = self::$Z;
        foreach (self::$SQ as $sq) {
            $p = $this->b[$sq];
            if ($p !== 0) {
                $h ^= $Z[$p * 128 + $sq];
            }
        }
        $h ^= self::$ZC[$this->castling];
        if ($this->turn === 1) {
            $h ^= self::$ZSIDE;
        }
        return $h;
    }

    /** Position key = hash plus ep file only when an ep capture is actually legal (chess.js fen() semantics). */
    private function posKey(): int
    {
        $k = $this->h;
        if ($this->ep >= 0 && $this->legalEp() >= 0) {
            $k ^= self::$ZEP[$this->ep & 7];
        }
        return $k;
    }

    /** Returns the ep square if an en-passant capture is legal, else -1. */
    private function legalEp(): int
    {
        $ep = $this->ep;
        if ($ep < 0) {
            return -1;
        }
        $us = $this->turn;
        $big = $ep + ($us === 0 ? 16 : -16);
        $mine = 1 | ($us << 3);
        foreach ([$big + 1, $big - 1] as $s) {
            if (($s & 0x88) === 0 && $this->b[$s] === $mine) {
                $m = $s | ($ep << 7) | (1 << 14) | (1 << 17) | (self::F_EP << 23);
                if ($this->legal($m)) {
                    return $ep;
                }
            }
        }
        return -1;
    }

    public function fen(): string
    {
        $b = $this->b;
        $out = '';
        for ($r = 0; $r < 8; $r++) {
            $empty = 0;
            for ($f = 0; $f < 8; $f++) {
                $p = $b[$r * 16 + $f];
                if ($p === 0) {
                    $empty++;
                    continue;
                }
                if ($empty) {
                    $out .= $empty;
                    $empty = 0;
                }
                $l = self::LETTER[$p & 7];
                $out .= ($p >> 3) ? $l : strtoupper($l);
            }
            if ($empty) {
                $out .= $empty;
            }
            if ($r < 7) {
                $out .= '/';
            }
        }
        $c = $this->castling;
        $cs = ($c & 1 ? 'K' : '') . ($c & 2 ? 'Q' : '') . ($c & 4 ? 'k' : '') . ($c & 8 ? 'q' : '');
        $ep = $this->legalEp();
        return $out . ' ' . ($this->turn === 0 ? 'w' : 'b') . ' ' . ($cs === '' ? '-' : $cs) . ' '
            . ($ep >= 0 ? self::$ALG[$ep] : '-') . ' ' . $this->half . ' ' . $this->full;
    }

    public function turn(): string
    {
        return $this->turn === 0 ? 'w' : 'b';
    }

    /** @return array{type:string,color:string}|null */
    public function get(string $sq): ?array
    {
        $i = self::$IDX[$sq] ?? null;
        if ($i === null) {
            return null;
        }
        $p = $this->b[$i];
        if ($p === 0) {
            return null;
        }
        return ['type' => self::LETTER[$p & 7], 'color' => ($p >> 3) ? 'b' : 'w'];
    }

    /** chess.js board(): 8x8 (rank 8 first) of null | ['square','type','color'] */
    public function board(): array
    {
        $out = [];
        for ($r = 0; $r < 8; $r++) {
            $row = [];
            for ($f = 0; $f < 8; $f++) {
                $sq = $r * 16 + $f;
                $p = $this->b[$sq];
                $row[] = $p === 0 ? null : [
                    'square' => self::$ALG[$sq],
                    'type' => self::LETTER[$p & 7],
                    'color' => ($p >> 3) ? 'b' : 'w',
                ];
            }
            $out[] = $row;
        }
        return $out;
    }

    // =====================================================================
    // attack detection
    // =====================================================================

    private function attacked(int $sq, int $by): bool
    {
        $b = &$this->b;
        $base = $by << 3;
        // pawns
        if ($by === 0) {
            $s = $sq + 15;
            if (!($s & 0x88) && $b[$s] === 1) {
                return true;
            }
            $s = $sq + 17;
            if (!($s & 0x88) && $b[$s] === 1) {
                return true;
            }
        } else {
            $s = $sq - 15;
            if (!($s & 0x88) && $b[$s] === 9) {
                return true;
            }
            $s = $sq - 17;
            if (!($s & 0x88) && $b[$s] === 9) {
                return true;
            }
        }
        $kn = 2 | $base;
        foreach (self::KNIGHT_OFF as $o) {
            $s = $sq + $o;
            if (!($s & 0x88) && $b[$s] === $kn) {
                return true;
            }
        }
        $kg = 6 | $base;
        $bi = 3 | $base;
        $ro = 4 | $base;
        $qu = 5 | $base;
        foreach (self::QUEEN_OFF as $o) {
            $s = $sq + $o;
            if ($s & 0x88) {
                continue;
            }
            $p = $b[$s];
            if ($p === $kg) {
                return true;
            }
            $diag = ($o === -17 || $o === -15 || $o === 17 || $o === 15);
            $want = $diag ? $bi : $ro;
            while (true) {
                if ($p !== 0) {
                    if ($p === $qu || $p === $want) {
                        return true;
                    }
                    break;
                }
                $s += $o;
                if ($s & 0x88) {
                    break;
                }
                $p = $b[$s];
            }
        }
        return false;
    }

    /** Is the side to move in check? */
    private function inCheck(): bool
    {
        return $this->attacked($this->kings[$this->turn], $this->turn ^ 1);
    }

    /** Does a pseudo-legal move leave own king safe? (board-only apply/revert) */
    private function legal(int $m): bool
    {
        $b = &$this->b;
        $us = $this->turn;
        $from = $m & 127;
        $to = ($m >> 7) & 127;
        $piece = ($m >> 14) & 7;
        $fl = $m >> 23;
        $pv = $b[$from];
        $old = $b[$to];
        $b[$to] = $pv;
        $b[$from] = 0;
        $csq = -1;
        $cv = 0;
        if ($fl & self::F_EP) {
            $csq = $to + ($us === 0 ? 16 : -16);
            $cv = $b[$csq];
            $b[$csq] = 0;
        }
        $ksq = $piece === 6 ? $to : $this->kings[$us];
        $ok = !$this->attacked($ksq, $us ^ 1);
        $b[$from] = $pv;
        $b[$to] = $old;
        if ($csq >= 0) {
            $b[$csq] = $cv;
        }
        return $ok;
    }

    // =====================================================================
    // move generation
    // =====================================================================

    /**
     * @return list<int> packed moves in chess.js order
     */
    private function gen(bool $legal, int $only = -1, bool $first = false): array
    {
        $b = &$this->b;
        $us = $this->turn;
        $them = $us ^ 1;
        $ep = $this->ep;
        $out = [];
        $squares = $only >= 0 ? [$only] : self::$SQ;
        $d = $us === 0 ? -16 : 16;
        $startRank = $us === 0 ? 6 : 1;
        $promoRank = $us === 0 ? 0 : 7;
        $c1 = $us === 0 ? -17 : 17;
        $c2 = $us === 0 ? -15 : 15;

        foreach ($squares as $i) {
            $p = $b[$i];
            if ($p === 0 || ($p >> 3) !== $us) {
                continue;
            }
            $t = $p & 7;
            $cand = [];
            if ($t === 1) {
                $r = $i >> 4;
                if ($r === $promoRank || $r === 7 - $promoRank) {
                    continue; // pawn on a back rank (illegal setup): no moves
                }
                $to = $i + $d;
                if ($b[$to] === 0) {
                    if (($to >> 4) === $promoRank) {
                        $base = $i | ($to << 7) | (1 << 14) | ((self::F_NORMAL | self::F_PROMO) << 23);
                        $cand[] = $base | (5 << 20);
                        $cand[] = $base | (4 << 20);
                        $cand[] = $base | (3 << 20);
                        $cand[] = $base | (2 << 20);
                    } else {
                        $cand[] = $i | ($to << 7) | (1 << 14) | (self::F_NORMAL << 23);
                        $to2 = $i + 2 * $d;
                        if ($r === $startRank && $b[$to2] === 0) {
                            $cand[] = $i | ($to2 << 7) | (1 << 14) | (self::F_BIG << 23);
                        }
                    }
                }
                foreach ([$c1, $c2] as $o) {
                    $to = $i + $o;
                    if ($to & 0x88) {
                        continue;
                    }
                    $v = $b[$to];
                    if ($v !== 0 && ($v >> 3) === $them) {
                        $cap = $v & 7;
                        if (($to >> 4) === $promoRank) {
                            $base = $i | ($to << 7) | (1 << 14) | ($cap << 17) | ((self::F_CAPTURE | self::F_PROMO) << 23);
                            $cand[] = $base | (5 << 20);
                            $cand[] = $base | (4 << 20);
                            $cand[] = $base | (3 << 20);
                            $cand[] = $base | (2 << 20);
                        } else {
                            $cand[] = $i | ($to << 7) | (1 << 14) | ($cap << 17) | (self::F_CAPTURE << 23);
                        }
                    } elseif ($to === $ep) {
                        $cand[] = $i | ($to << 7) | (1 << 14) | (1 << 17) | (self::F_EP << 23);
                    }
                }
            } else {
                if ($t === 2) {
                    $offs = self::KNIGHT_OFF;
                } elseif ($t === 3) {
                    $offs = self::BISHOP_OFF;
                } elseif ($t === 4) {
                    $offs = self::ROOK_OFF;
                } else {
                    $offs = self::QUEEN_OFF;
                }
                $slide = $t >= 3 && $t <= 5;
                $hdr = $i | ($t << 14);
                foreach ($offs as $o) {
                    $to = $i;
                    while (true) {
                        $to += $o;
                        if ($to & 0x88) {
                            break;
                        }
                        $v = $b[$to];
                        if ($v === 0) {
                            $cand[] = $hdr | ($to << 7) | (self::F_NORMAL << 23);
                        } else {
                            if (($v >> 3) === $them) {
                                $cand[] = $hdr | ($to << 7) | (($v & 7) << 17) | (self::F_CAPTURE << 23);
                            }
                            break;
                        }
                        if (!$slide) {
                            break;
                        }
                    }
                }
            }
            if ($legal) {
                foreach ($cand as $m) {
                    if ($this->legal($m)) {
                        $out[] = $m;
                        if ($first) {
                            return $out;
                        }
                    }
                }
            } else {
                foreach ($cand as $m) {
                    $out[] = $m;
                }
            }
        }

        // castling
        if ($this->castling !== 0 && ($only < 0 || $only === $this->kings[$us])) {
            $from = $this->kings[$us];
            $cs = $us === 0 ? ($this->castling & 3) : ($this->castling >> 2);
            if ($cs !== 0 && !$this->attacked($from, $them)) {
                $hdr = $from | (6 << 14);
                if (($cs & 1) && $b[$from + 1] === 0 && $b[$from + 2] === 0
                    && !$this->attacked($from + 1, $them) && !$this->attacked($from + 2, $them)) {
                    $out[] = $hdr | (($from + 2) << 7) | (self::F_KSIDE << 23);
                    if ($first) {
                        return $out;
                    }
                }
                if (($cs & 2) && $b[$from - 1] === 0 && $b[$from - 2] === 0 && $b[$from - 3] === 0
                    && !$this->attacked($from - 1, $them) && !$this->attacked($from - 2, $them)) {
                    $out[] = $hdr | (($from - 2) << 7) | (self::F_QSIDE << 23);
                }
            }
        }
        return $out;
    }

    /** Fast: all legal moves as packed ints (chess.js order). */
    public function genMoves(): array
    {
        return $this->gen(true);
    }

    private function hasMove(): bool
    {
        return $this->gen(true, -1, true) !== [];
    }

    // =====================================================================
    // make / unmake
    // =====================================================================

    /** Make a packed (legal) move; optional precomputed SAN is stored for history. */
    public function push(int $m, ?string $san = null): void
    {
        $b = &$this->b;
        $us = $this->turn;
        $them = $us ^ 1;
        $from = $m & 127;
        $to = ($m >> 7) & 127;
        $piece = ($m >> 14) & 7;
        $cap = ($m >> 17) & 7;
        $promo = ($m >> 20) & 7;
        $fl = $m >> 23;
        $Z = self::$Z;

        $this->sMove[] = $m;
        $this->sCast[] = $this->castling;
        $this->sEp[] = $this->ep;
        $this->sHalf[] = $this->half;
        $this->sH[] = $this->h;
        $this->sSan[] = $san;

        $pv = $b[$from];
        $h = $this->h ^ $Z[$pv * 128 + $from];
        if ($cap) {
            if ($fl & self::F_EP) {
                $csq = $to + ($us === 0 ? 16 : -16);
                $h ^= $Z[(1 | ($them << 3)) * 128 + $csq];
                $b[$csq] = 0;
            } else {
                $h ^= $Z[$b[$to] * 128 + $to];
            }
        }
        $np = $promo ? ($promo | ($us << 3)) : $pv;
        $b[$to] = $np;
        $b[$from] = 0;
        $h ^= $Z[$np * 128 + $to];

        if ($piece === 6) {
            $this->kings[$us] = $to;
            if ($fl & (self::F_KSIDE | self::F_QSIDE)) {
                $rv = 4 | ($us << 3);
                if ($fl & self::F_KSIDE) {
                    $rf = $to + 1;
                    $rt = $to - 1;
                } else {
                    $rf = $to - 2;
                    $rt = $to + 1;
                }
                $b[$rf] = 0;
                $b[$rt] = $rv;
                $h ^= $Z[$rv * 128 + $rf] ^ $Z[$rv * 128 + $rt];
            }
        }

        $oc = $this->castling;
        $nc = $oc & self::$CM[$from] & self::$CM[$to];
        if ($nc !== $oc) {
            $h ^= self::$ZC[$oc] ^ self::$ZC[$nc];
            $this->castling = $nc;
        }
        $h ^= self::$ZSIDE;
        $this->h = $h;

        $this->ep = ($fl & self::F_BIG) ? ($us === 0 ? $to + 16 : $to - 16) : -1;
        $this->half = ($piece === 1 || $cap) ? 0 : $this->half + 1;
        $this->full += $us;
        $this->turn = $them;

        $key = $h;
        if ($this->ep >= 0 && $this->legalEp() >= 0) {
            $key ^= self::$ZEP[$this->ep & 7];
        }
        $this->keys[] = $key;
    }

    /** Unmake the last move; returns its packed form or null when there is no history. */
    public function pop(): ?int
    {
        if (!$this->sMove) {
            return null;
        }
        $b = &$this->b;
        $m = array_pop($this->sMove);
        $this->castling = array_pop($this->sCast);
        $this->ep = array_pop($this->sEp);
        $this->half = array_pop($this->sHalf);
        $this->h = array_pop($this->sH);
        array_pop($this->sSan);
        array_pop($this->keys);

        $this->turn ^= 1;
        $us = $this->turn;
        $them = $us ^ 1;
        $this->full -= $us;
        $from = $m & 127;
        $to = ($m >> 7) & 127;
        $piece = ($m >> 14) & 7;
        $cap = ($m >> 17) & 7;
        $fl = $m >> 23;

        $b[$from] = $piece | ($us << 3);
        if ($fl & self::F_EP) {
            $b[$to] = 0;
            $b[$to + ($us === 0 ? 16 : -16)] = 1 | ($them << 3);
        } else {
            $b[$to] = $cap ? ($cap | ($them << 3)) : 0;
        }
        if ($piece === 6) {
            $this->kings[$us] = $from;
            if ($fl & (self::F_KSIDE | self::F_QSIDE)) {
                if ($fl & self::F_KSIDE) {
                    $rf = $to + 1;
                    $rt = $to - 1;
                } else {
                    $rf = $to - 2;
                    $rt = $to + 1;
                }
                $b[$rt] = 0;
                $b[$rf] = 4 | ($us << 3);
            }
        }
        return $m;
    }

    // =====================================================================
    // SAN / verbose moves
    // =====================================================================

    private static function flagStr(int $fl): string
    {
        $s = '';
        if ($fl & self::F_NORMAL) {
            $s .= 'n';
        }
        if ($fl & self::F_CAPTURE) {
            $s .= 'c';
        }
        if ($fl & self::F_BIG) {
            $s .= 'b';
        }
        if ($fl & self::F_EP) {
            $s .= 'e';
        }
        if ($fl & self::F_PROMO) {
            $s .= 'p';
        }
        if ($fl & self::F_KSIDE) {
            $s .= 'k';
        }
        if ($fl & self::F_QSIDE) {
            $s .= 'q';
        }
        return $s;
    }

    /** SAN without check suffix. Position must be the one before $m. $list = legal moves for disambiguation. */
    private function sanBase(int $m, ?array $list): string
    {
        $fl = $m >> 23;
        if ($fl & self::F_KSIDE) {
            return 'O-O';
        }
        if ($fl & self::F_QSIDE) {
            return 'O-O-O';
        }
        $from = $m & 127;
        $to = ($m >> 7) & 127;
        $piece = ($m >> 14) & 7;
        $promo = ($m >> 20) & 7;
        $out = '';
        if ($piece !== 1) {
            $out = strtoupper(self::LETTER[$piece]);
            if ($piece !== 6) {
                $list ??= $this->gen(true);
                $amb = 0;
                $sameRank = 0;
                $sameFile = 0;
                foreach ($list as $o) {
                    $of = $o & 127;
                    if ((($o >> 14) & 7) === $piece && $of !== $from && ((($o >> 7) & 127) === $to)) {
                        $amb++;
                        if (($of >> 4) === ($from >> 4)) {
                            $sameRank++;
                        }
                        if (($of & 7) === ($from & 7)) {
                            $sameFile++;
                        }
                    }
                }
                if ($amb > 0) {
                    if ($sameRank > 0 && $sameFile > 0) {
                        $out .= self::$ALG[$from];
                    } elseif ($sameFile > 0) {
                        $out .= self::$ALG[$from][1];
                    } else {
                        $out .= self::$ALG[$from][0];
                    }
                }
            }
            if ($fl & (self::F_CAPTURE | self::F_EP)) {
                $out .= 'x';
            }
        } elseif ($fl & (self::F_CAPTURE | self::F_EP)) {
            $out .= self::$ALG[$from][0] . 'x';
        }
        $out .= self::$ALG[$to];
        if ($promo) {
            $out .= '=' . strtoupper(self::LETTER[$promo]);
        }
        return $out;
    }

    /** '+', '#' or '' for the side to move in the current (post-move) position. */
    private function sanSuffix(): string
    {
        if (!$this->inCheck()) {
            return '';
        }
        return $this->hasMove() ? '+' : '#';
    }

    /** SAN of a legal packed move in the current position (does a temporary push/pop for the suffix). */
    private function sanOf(int $m, ?array $list = null): string
    {
        $s = $this->sanBase($m, $list);
        $this->push($m);
        $s .= $this->sanSuffix();
        $this->pop();
        return $s;
    }

    /** Turn a packed move into the verbose array. Position must be the one before $m. */
    public function decode(int $m, bool $withSan = false, ?array $list = null): array
    {
        $promo = ($m >> 20) & 7;
        $cap = ($m >> 17) & 7;
        $from = self::$ALG[$m & 127];
        $to = self::$ALG[($m >> 7) & 127];
        $r = [
            'color' => $this->turn === 0 ? 'w' : 'b',
            'from' => $from,
            'to' => $to,
            'piece' => self::LETTER[($m >> 14) & 7],
            'captured' => $cap ? self::LETTER[$cap] : null,
            'promotion' => $promo ? self::LETTER[$promo] : null,
            'flags' => self::flagStr($m >> 23),
        ];
        if ($withSan) {
            $r['san'] = $this->sanOf($m, $list);
            $r['lan'] = $from . $to . ($promo ? self::LETTER[$promo] : '');
            $r['before'] = $this->fen();
            $this->push($m);
            $r['after'] = $this->fen();
            $this->pop();
        }
        return $r;
    }

    /**
     * @return list<string>|list<array<string,mixed>>
     */
    public function moves(bool $verbose = false, ?string $square = null): array
    {
        $only = -1;
        if ($square !== null) {
            $only = self::$IDX[$square] ?? null;
            if ($only === null) {
                return [];
            }
        }
        $list = $this->gen(true, $only);
        $out = [];
        if ($verbose) {
            $full = $only < 0 ? $list : $this->gen(true);
            foreach ($list as $m) {
                $out[] = $this->decode($m, true, $full);
            }
        } else {
            foreach ($list as $m) {
                $out[] = $this->sanOf($m, $list);
            }
        }
        return $out;
    }

    /** Fast verbose legal moves (no san/before/after). */
    public function moveList(?string $square = null): array
    {
        $only = -1;
        if ($square !== null) {
            $only = self::$IDX[$square] ?? null;
            if ($only === null) {
                return [];
            }
        }
        $out = [];
        foreach ($this->gen(true, $only) as $m) {
            $out[] = $this->decode($m, false);
        }
        return $out;
    }

    // =====================================================================
    // playing moves
    // =====================================================================

    /**
     * Play a move given as ['from','to','promotion'?] or SAN. Returns the verbose move, or null if illegal.
     * Pass $san=false for the fast path (no san/before/after in the result).
     *
     * @param array<string,mixed>|string $m
     */
    public function move(array|string $m, bool $san = true): ?array
    {
        $packed = is_string($m) ? $this->fromSan($m) : $this->fromArray($m);
        if ($packed === null) {
            return null;
        }
        if (!$san) {
            $r = $this->decode($packed, false);
            $this->push($packed);
            return $r;
        }
        $r = $this->decode($packed, false);
        $r['lan'] = $r['from'] . $r['to'] . ($r['promotion'] ?? '');
        $r['before'] = $this->fen();
        $s = $this->sanBase($packed, null);
        $this->push($packed);
        $s .= $this->sanSuffix();
        $this->sSan[count($this->sSan) - 1] = $s;
        $r['san'] = $s;
        $r['after'] = $this->fen();
        return $r;
    }

    /** @param array<string,mixed> $m */
    private function fromArray(array $m): ?int
    {
        $f = $m['from'] ?? null;
        $t = $m['to'] ?? null;
        if (!is_string($f) || !is_string($t)) {
            return null;
        }
        $fs = self::$IDX[$f] ?? null;
        $ts = self::$IDX[$t] ?? null;
        if ($fs === null || $ts === null) {
            return null;
        }
        $promo = $m['promotion'] ?? null;
        foreach ($this->gen(true, $fs) as $g) {
            if ((($g >> 7) & 127) !== $ts) {
                continue;
            }
            $gp = ($g >> 20) & 7;
            if ($gp === 0 || $promo === self::LETTER[$gp]) {
                return $g;
            }
        }
        return null;
    }

    private static function stripSan(string $s): string
    {
        return (string) preg_replace('/[+#]?[?!]*$/', '', str_replace('=', '', $s));
    }

    private function fromSan(string $san): ?int
    {
        $san = trim($san);
        $san = str_replace(['0-0-0', '0-0'], ['O-O-O', 'O-O'], $san);
        $clean = self::stripSan($san);
        if ($clean === '') {
            return null;
        }
        $list = $this->gen(true);
        // pass 1: exact (ignoring check/annotation suffix)
        $pt = null;
        if (preg_match('/^[pnbrqkPNBRQK]/', $clean, $mm)) {
            $c = $mm[0];
            $pt = ctype_upper($c) ? strtolower($c) : null;
            if ($pt === 'p') {
                $pt = null;
            }
        }
        foreach ($list as $m) {
            if ($pt !== null && self::LETTER[($m >> 14) & 7] !== $pt) {
                continue;
            }
            if (self::stripSan($this->sanBase($m, $list)) === $clean) {
                return $m;
            }
        }
        // pass 2: sloppy parsing like chess.js
        $piece = null;
        $from = '';
        $to = null;
        $promo = null;
        $over = false;
        if (preg_match('/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/', $clean, $mm)) {
            $piece = $mm[1] !== '' ? $mm[1] : null;
            $from = $mm[2];
            $to = $mm[3];
            $promo = ($mm[4] ?? '') !== '' ? $mm[4] : null;
        } elseif (preg_match('/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/', $clean, $mm)) {
            $piece = $mm[1] !== '' ? $mm[1] : null;
            $from = $mm[2];
            $to = $mm[3];
            $promo = ($mm[4] ?? '') !== '' ? $mm[4] : null;
            if (strlen($from) === 1) {
                $over = true;
            }
        }
        if ($to === null) {
            return null;
        }
        $ts = self::$IDX[$to];
        $pl = $piece !== null ? strtolower($piece) : null;
        $prl = $promo !== null ? strtolower($promo) : null;
        foreach ($list as $m) {
            $mp = self::LETTER[($m >> 14) & 7];
            $mpr = (($m >> 20) & 7) ? self::LETTER[($m >> 20) & 7] : null;
            $mf = $m & 127;
            $mt = ($m >> 7) & 127;
            if ($pl !== null && $pl !== $mp) {
                continue;
            }
            if ($from === '') {
                if ($clean === str_replace('x', '', self::stripSan($this->sanBase($m, $list)))) {
                    return $m;
                }
            } elseif (strlen($from) === 2) {
                if ((self::$IDX[$from] ?? -1) === $mf && $mt === $ts && ($prl === null || $prl === $mpr)) {
                    return $m;
                }
            } elseif ($over) {
                $sq = self::$ALG[$mf];
                if ($mt === $ts && ($from === $sq[0] || $from === $sq[1]) && ($prl === null || $prl === $mpr)) {
                    return $m;
                }
            }
        }
        return null;
    }

    /** Undo the last move; returns its verbose array (with san/before/after unless $fast) or null. */
    public function undo(bool $fast = false): ?array
    {
        if (!$this->sMove) {
            return null;
        }
        $cachedSan = $this->sSan[count($this->sSan) - 1];
        $after = $fast ? null : $this->fen();
        $m = $this->pop();
        if ($m === null) {
            return null;
        }
        $r = $this->decode($m, false);
        if (!$fast) {
            $r['san'] = $cachedSan ?? $this->sanOf($m);
            $r['lan'] = $r['from'] . $r['to'] . ($r['promotion'] ?? '');
            $r['before'] = $this->fen();
            $r['after'] = $after;
        }
        return $r;
    }

    /**
     * SAN history (oldest first). With $verbose, verbose move arrays.
     *
     * @return list<string>|list<array<string,mixed>>
     */
    public function history(bool $verbose = false): array
    {
        $n = count($this->sMove);
        if ($n === 0) {
            return [];
        }
        $c = clone $this;
        $out = [];
        for ($k = $n - 1; $k >= 0; $k--) {
            $cached = $c->sSan[$k];
            $after = $verbose ? $c->fen() : '';
            $m = $c->pop();
            if ($verbose) {
                $r = $c->decode($m, false);
                $r['san'] = $cached ?? $c->sanOf($m);
                $r['lan'] = $r['from'] . $r['to'] . ($r['promotion'] ?? '');
                $r['before'] = $c->fen();
                $r['after'] = $after;
                $out[$k] = $r;
            } else {
                $out[$k] = $cached ?? $c->sanOf($m);
            }
        }
        ksort($out);
        return array_values($out);
    }

    // =====================================================================
    // game state
    // =====================================================================

    public function isCheck(): bool
    {
        return $this->inCheck();
    }

    public function isCheckmate(): bool
    {
        return $this->inCheck() && !$this->hasMove();
    }

    public function isStalemate(): bool
    {
        return !$this->inCheck() && !$this->hasMove();
    }

    public function isInsufficientMaterial(): bool
    {
        $counts = [0, 0, 0, 0, 0, 0, 0];
        $bishops = [];
        $num = 0;
        foreach (self::$SQ as $sq) {
            $p = $this->b[$sq];
            if ($p !== 0) {
                $t = $p & 7;
                $counts[$t]++;
                if ($t === 3) {
                    $bishops[] = (($sq >> 4) + ($sq & 7)) & 1;
                }
                $num++;
            }
        }
        if ($num === 2) {
            return true;
        }
        if ($num === 3 && ($counts[3] === 1 || $counts[2] === 1)) {
            return true;
        }
        if ($num === $counts[3] + 2) {
            $sum = array_sum($bishops);
            $len = count($bishops);
            if ($sum === 0 || $sum === $len) {
                return true;
            }
        }
        return false;
    }

    public function isThreefoldRepetition(): bool
    {
        $last = count($this->keys) - 1;
        $key = $this->keys[$last];
        $lo = max(0, $last - $this->half);
        $n = 1;
        for ($i = $last - 2; $i >= $lo; $i -= 2) {
            if ($this->keys[$i] === $key && ++$n >= 3) {
                return true;
            }
        }
        return false;
    }

    public function isDraw(): bool
    {
        return $this->half >= 100 || $this->isStalemate() || $this->isInsufficientMaterial() || $this->isThreefoldRepetition();
    }

    public function isGameOver(): bool
    {
        return $this->isCheckmate() || $this->isStalemate() || $this->isDraw();
    }

    // =====================================================================
    // extras
    // =====================================================================

    /** Leaf-counted perft using the fast make/unmake path. */
    public function perft(int $depth): int
    {
        $list = $this->gen(true);
        if ($depth <= 1) {
            return count($list);
        }
        $n = 0;
        foreach ($list as $m) {
            $this->push($m);
            $n += $this->perft($depth - 1);
            $this->pop();
        }
        return $n;
    }
}
