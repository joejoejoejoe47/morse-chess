<?php

declare(strict_types=1);

namespace Morse;

/**
 * Morse Chess variants (owner t205u): horde, atomic, koth (King of the Hill), breakthrough.
 * A copy of src/lib/variants/engine.ts (same rules, same FEN, same SAN); keep the two in step.
 * Board: $b[rank 0..7][file 0..7] = '' or a FEN letter (upper case = White).
 */
final class Variants
{
    // mini = Gardner minichess on 5x5 (owner t220u), played in the a1-e5 corner of a normal 8x8 FEN.
    public const IDS = ['horde', 'atomic', 'koth', 'breakthrough', 'heist', 'parade', 'cavalry', 'mini'];

    public const START_FEN = [
        'horde' => 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq - 0 1',
        'atomic' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'koth' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'breakthrough' => 'pppppppp/pppppppp/8/8/8/8/PPPPPPPP/PPPPPPPP w - - 0 1',
        'heist' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'parade' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'cavalry' => 'rnbqkbnr/nnnnnnnn/8/8/8/8/NNNNNNNN/RNBQKBNR w KQkq - 0 1',
        'mini' => '8/8/8/rnbqk3/ppppp3/8/PPPPP3/RNBQK3 w - - 0 1',
    ];

    /** Squares per side of the board moves are generated on (5 while generating Minichess moves). */
    private static int $n = 8;

    public static function size(string $v): int
    {
        return $v === 'mini' ? 5 : 8;
    }

    private const KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    private const KG = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    private const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    private const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    private const HILL = ['d4' => true, 'e4' => true, 'd5' => true, 'e5' => true];
    private const VAL = ['p' => 100, 'n' => 310, 'b' => 330, 'r' => 500, 'q' => 950, 'k' => 0];
    private const WIN = 1000000;

    /**
     * Owner approval list (owner t209u): a variant stays "Coming soon" for everyone but MasterGus until
     * its id is added here (and to RELEASED_GAMES in src/lib/games/release.ts). Default: none approved.
     */
    public const RELEASED = [];

    public static function released(string $v): bool
    {
        return in_array($v, self::RELEASED, true);
    }

    public static function valid(mixed $v): bool
    {
        return is_string($v) && in_array($v, self::IDS, true);
    }

    public static function name(string $v): string
    {
        return ['horde' => 'Horde', 'atomic' => 'Atomic', 'koth' => 'King of the Hill', 'breakthrough' => 'Breakthrough', 'heist' => 'Queen Heist', 'parade' => 'Pawn Parade', 'cavalry' => 'Cavalry Charge', 'mini' => 'Minichess 5×5'][$v] ?? 'Chess';
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private static function on(int $r, int $f): bool
    {
        return $r >= 0 && $r < self::$n && $f >= 0 && $f < self::$n;
    }

    private static function other(string $c): string
    {
        return $c === 'w' ? 'b' : 'w';
    }

    private static function col(string $p): string
    {
        return $p === '' ? '' : (ctype_upper($p) ? 'w' : 'b');
    }

    private static function typ(string $p): string
    {
        return strtolower($p);
    }

    public static function sq(int $r, int $f): string
    {
        return 'abcdefgh'[$f] . ($r + 1);
    }

    /** @return array{0:int,1:int} */
    public static function pos(string $s): array
    {
        return [((int) $s[1]) - 1, strpos('abcdefgh', $s[0]) ?: 0];
    }

    private static function validSq(string $s): bool
    {
        return (bool) preg_match('/^[a-h][1-8]$/', $s);
    }

    // ── FEN ──────────────────────────────────────────────────────────────

    /** @return array{board:array<int,array<int,string>>,turn:string,castle:string,ep:?string,half:int,full:int} */
    public static function parseFen(string $fen): array
    {
        $parts = preg_split('/\s+/', trim($fen)) ?: [];
        $place = $parts[0] ?? '8/8/8/8/8/8/8/8';
        $board = array_fill(0, 8, array_fill(0, 8, ''));
        $rows = explode('/', $place);
        for ($i = 0; $i < 8; $i++) {
            $r = 7 - $i;
            $f = 0;
            $row = $rows[$i] ?? '';
            for ($k = 0, $n = strlen($row); $k < $n; $k++) {
                $ch = $row[$k];
                if (ctype_digit($ch)) {
                    $f += (int) $ch;
                } else {
                    if ($f < 8 && str_contains('kqrbnp', strtolower($ch))) {
                        $board[$r][$f] = $ch;
                    }
                    $f++;
                }
            }
        }
        $castle = $parts[2] ?? '-';
        $ep = $parts[3] ?? '-';
        return [
            'board' => $board,
            'turn' => ($parts[1] ?? 'w') === 'b' ? 'b' : 'w',
            'castle' => $castle === '-' ? '' : (preg_replace('/[^KQkq]/', '', $castle) ?? ''),
            'ep' => preg_match('/^[a-h][36]$/', $ep) ? $ep : null,
            'half' => max(0, (int) ($parts[4] ?? 0)),
            'full' => max(1, (int) ($parts[5] ?? 1)),
        ];
    }

    public static function toFen(array $s): string
    {
        $rows = [];
        for ($r = 7; $r >= 0; $r--) {
            $row = '';
            $empty = 0;
            for ($f = 0; $f < 8; $f++) {
                $p = $s['board'][$r][$f];
                if ($p === '') {
                    $empty++;
                    continue;
                }
                if ($empty) {
                    $row .= $empty;
                    $empty = 0;
                }
                $row .= $p;
            }
            if ($empty) {
                $row .= $empty;
            }
            $rows[] = $row;
        }
        return implode('/', $rows) . ' ' . $s['turn'] . ' ' . ($s['castle'] !== '' ? $s['castle'] : '-') . ' '
            . ($s['ep'] ?? '-') . ' ' . $s['half'] . ' ' . $s['full'];
    }

    // ── attacks ──────────────────────────────────────────────────────────

    public static function attacked(array $b, int $r, int $f, string $by): bool
    {
        $pr = $by === 'w' ? $r - 1 : $r + 1;
        $pawn = $by === 'w' ? 'P' : 'p';
        $knight = $by === 'w' ? 'N' : 'n';
        $king = $by === 'w' ? 'K' : 'k';
        foreach ([-1, 1] as $df) {
            if (self::on($pr, $f + $df) && $b[$pr][$f + $df] === $pawn) {
                return true;
            }
        }
        foreach (self::KN as [$dr, $df]) {
            if (self::on($r + $dr, $f + $df) && $b[$r + $dr][$f + $df] === $knight) {
                return true;
            }
        }
        foreach (self::KG as [$dr, $df]) {
            if (self::on($r + $dr, $f + $df) && $b[$r + $dr][$f + $df] === $king) {
                return true;
            }
        }
        foreach ([[self::DIAG, 'b'], [self::ORTH, 'r']] as [$dirs, $slider]) {
            foreach ($dirs as [$dr, $df]) {
                $rr = $r + $dr;
                $ff = $f + $df;
                while (self::on($rr, $ff)) {
                    $p = $b[$rr][$ff];
                    if ($p !== '') {
                        if (self::col($p) === $by && (self::typ($p) === $slider || self::typ($p) === 'q')) {
                            return true;
                        }
                        break;
                    }
                    $rr += $dr;
                    $ff += $df;
                }
            }
        }
        return false;
    }

    /** @return array{0:int,1:int}|null */
    public static function kingOf(array $b, string $c): ?array
    {
        $k = $c === 'w' ? 'K' : 'k';
        for ($r = 0; $r < 8; $r++) {
            for ($f = 0; $f < 8; $f++) {
                if ($b[$r][$f] === $k) {
                    return [$r, $f];
                }
            }
        }
        return null;
    }

    private static function kingsTouch(array $b): bool
    {
        $a = self::kingOf($b, 'w');
        $k = self::kingOf($b, 'b');
        return $a !== null && $k !== null && abs($a[0] - $k[0]) <= 1 && abs($a[1] - $k[1]) <= 1;
    }

    public static function inCheck(string $v, array $s, ?string $c = null): bool
    {
        $c ??= $s['turn'];
        if ($v === 'breakthrough') {
            return false;
        }
        $k = self::kingOf($s['board'], $c);
        if ($k === null) {
            return false;
        }
        if ($v === 'atomic' && self::kingsTouch($s['board'])) {
            return false;
        }
        return self::attacked($s['board'], $k[0], $k[1], self::other($c));
    }

    // ── move generation ──────────────────────────────────────────────────

    /** @return list<array<string,mixed>> */
    private static function pseudo(string $v, array $s): array
    {
        // Moves stay on the variant's N×N board (Minichess: a1-e5).
        $keep = self::$n;
        self::$n = self::size($v);
        try {
            return self::pseudoOn($v, $s);
        } finally {
            self::$n = $keep;
        }
    }

    private static function pseudoOn(string $v, array $s): array
    {
        $b = $s['board'];
        $turn = $s['turn'];
        $out = [];
        if ($v === 'breakthrough') {
            $d = $turn === 'w' ? 1 : -1;
            for ($r = 0; $r < 8; $r++) {
                for ($f = 0; $f < 8; $f++) {
                    $p = $b[$r][$f];
                    if ($p === '' || self::col($p) !== $turn) {
                        continue;
                    }
                    $rr = $r + $d;
                    if ($rr < 0 || $rr > 7) {
                        continue;
                    }
                    if ($b[$rr][$f] === '') {
                        $out[] = ['from' => self::sq($r, $f), 'to' => self::sq($rr, $f)];
                    }
                    foreach ([$f - 1, $f + 1] as $ff) {
                        if ($ff < 0 || $ff > 7) {
                            continue;
                        }
                        $t = $b[$rr][$ff];
                        if ($t !== '' && self::col($t) === $turn) {
                            continue;
                        }
                        $out[] = ['from' => self::sq($r, $f), 'to' => self::sq($rr, $ff), 'capture' => $t !== ''];
                    }
                }
            }
            return $out;
        }
        $last = $turn === 'w' ? self::$n - 1 : 0;
        $ep = $s['ep'] !== null ? self::pos($s['ep']) : null;
        for ($r = 0; $r < 8; $r++) {
            for ($f = 0; $f < 8; $f++) {
                $p = $b[$r][$f];
                if ($p === '' || self::col($p) !== $turn) {
                    continue;
                }
                $t0 = self::typ($p);
                $from = self::sq($r, $f);
                $add = static function (int $rr, int $ff, array $extra = []) use (&$out, $from, $t0, $last, $v): void {
                    $to = self::sq($rr, $ff);
                    if ($t0 === 'p' && $rr === $last && $v !== 'parade') {
                        foreach (['q', 'r', 'b', 'n'] as $promo) {
                            $out[] = ['from' => $from, 'to' => $to, 'promo' => $promo] + $extra;
                        }
                    } else {
                        $out[] = ['from' => $from, 'to' => $to] + $extra;
                    }
                };
                if ($t0 === 'p') {
                    $d = $turn === 'w' ? 1 : -1;
                    if (self::on($r + $d, $f) && $b[$r + $d][$f] === '') {
                        $add($r + $d, $f);
                        // Minichess pawns never double-step.
                        $canDouble = $v === 'mini' ? false : ($turn === 'w' ? ($r === 1 || ($v === 'horde' && $r === 0)) : $r === 6);
                        if ($canDouble && self::on($r + 2 * $d, $f) && $b[$r + 2 * $d][$f] === '') {
                            $out[] = ['from' => $from, 'to' => self::sq($r + 2 * $d, $f), 'double' => true];
                        }
                    }
                    foreach ([-1, 1] as $df) {
                        $rr = $r + $d;
                        $ff = $f + $df;
                        if (!self::on($rr, $ff)) {
                            continue;
                        }
                        $t = $b[$rr][$ff];
                        if ($t !== '' && self::col($t) !== $turn) {
                            $add($rr, $ff, ['capture' => true]);
                        } elseif ($t === '' && $ep !== null && $ep[0] === $rr && $ep[1] === $ff) {
                            $victim = $b[$r][$ff];
                            if ($victim !== '' && self::col($victim) !== $turn && self::typ($victim) === 'p') {
                                $out[] = ['from' => $from, 'to' => self::sq($rr, $ff), 'ep' => true, 'capture' => true];
                            }
                        }
                    }
                    continue;
                }
                if ($t0 === 'n' || $t0 === 'k') {
                    foreach ($t0 === 'n' ? self::KN : self::KG as [$dr, $df]) {
                        $rr = $r + $dr;
                        $ff = $f + $df;
                        if (!self::on($rr, $ff)) {
                            continue;
                        }
                        $t = $b[$rr][$ff];
                        if ($t === '') {
                            $out[] = ['from' => $from, 'to' => self::sq($rr, $ff)];
                        } elseif (self::col($t) !== $turn && !($v === 'atomic' && $t0 === 'k')) {
                            $out[] = ['from' => $from, 'to' => self::sq($rr, $ff), 'capture' => true];
                        }
                    }
                    if ($t0 === 'k') {
                        $home = $turn === 'w' ? 0 : 7;
                        $ks = $turn === 'w' ? 'K' : 'k';
                        $qs = $turn === 'w' ? 'Q' : 'q';
                        $rook = $turn === 'w' ? 'R' : 'r';
                        if ($v !== 'mini' && $r === $home && $f === 4 && !self::inCheck($v, $s, $turn)) {
                            $safe = static function (int $ff) use ($v, $s, $b, $home, $turn): bool {
                                if ($v !== 'atomic') {
                                    return !self::attacked($b, $home, $ff, self::other($turn));
                                }
                                $b2 = $b;
                                $b2[$home][$ff] = $b2[$home][4];
                                $b2[$home][4] = '';
                                $s2 = $s;
                                $s2['board'] = $b2;
                                return !self::inCheck($v, $s2, $turn);
                            };
                            if (str_contains($s['castle'], $ks) && $b[$home][7] === $rook && $b[$home][5] === '' && $b[$home][6] === '' && $safe(5) && $safe(6)) {
                                $out[] = ['from' => $from, 'to' => self::sq($home, 6), 'castle' => 'K'];
                            }
                            if (str_contains($s['castle'], $qs) && $b[$home][0] === $rook && $b[$home][1] === '' && $b[$home][2] === '' && $b[$home][3] === '' && $safe(3) && $safe(2)) {
                                $out[] = ['from' => $from, 'to' => self::sq($home, 2), 'castle' => 'Q'];
                            }
                        }
                    }
                    continue;
                }
                $dirs = $t0 === 'b' ? self::DIAG : ($t0 === 'r' ? self::ORTH : [...self::DIAG, ...self::ORTH]);
                foreach ($dirs as [$dr, $df]) {
                    $rr = $r + $dr;
                    $ff = $f + $df;
                    while (self::on($rr, $ff)) {
                        $t = $b[$rr][$ff];
                        if ($t !== '') {
                            if (self::col($t) !== $turn) {
                                $out[] = ['from' => $from, 'to' => self::sq($rr, $ff), 'capture' => true];
                            }
                            break;
                        }
                        $out[] = ['from' => $from, 'to' => self::sq($rr, $ff)];
                        $rr += $dr;
                        $ff += $df;
                    }
                }
            }
        }
        return $out;
    }

    /** @return array{state:array,exploded:list<string>,captured:bool} */
    public static function play(string $v, array $s, array $m): array
    {
        $b = $s['board'];
        [$fr, $ff] = self::pos($m['from']);
        [$tr, $tf] = self::pos($m['to']);
        $p = $b[$fr][$ff];
        if ($p === '') {
            return ['state' => $s, 'exploded' => [], 'captured' => false];
        }
        $pc = self::col($p);
        $castle = $s['castle'];
        $isEp = !empty($m['ep']);
        $victim = $isEp ? $b[$fr][$tf] : $b[$tr][$tf];
        $captured = $victim !== '' && self::col($victim) !== $pc;
        $b[$fr][$ff] = '';
        if ($isEp) {
            $b[$fr][$tf] = '';
        }
        $promo = $m['promo'] ?? null;
        $b[$tr][$tf] = $promo ? ($pc === 'w' ? strtoupper($promo) : $promo) : $p;
        if (!empty($m['castle'])) {
            $home = $pc === 'w' ? 0 : 7;
            if ($m['castle'] === 'K') {
                $b[$home][5] = $b[$home][7];
                $b[$home][7] = '';
            } else {
                $b[$home][3] = $b[$home][0];
                $b[$home][0] = '';
            }
        }
        $exploded = [];
        if ($v === 'atomic' && $captured) {
            $b[$tr][$tf] = '';
            $exploded[] = $m['to'];
            foreach (self::KG as [$dr, $df]) {
                $rr = $tr + $dr;
                $f2 = $tf + $df;
                if (!self::on($rr, $f2)) {
                    continue;
                }
                $q = $b[$rr][$f2];
                if ($q !== '' && self::typ($q) !== 'p') {
                    $b[$rr][$f2] = '';
                    $exploded[] = self::sq($rr, $f2);
                }
            }
        }
        if (self::typ($p) === 'k') {
            $castle = str_replace($pc === 'w' ? ['K', 'Q'] : ['k', 'q'], '', $castle);
        }
        foreach (['h1' => 'K', 'a1' => 'Q', 'h8' => 'k', 'a8' => 'q'] as $sq => $ch) {
            if ($m['from'] === $sq || $m['to'] === $sq || in_array($sq, $exploded, true)) {
                $castle = str_replace($ch, '', $castle);
            }
        }
        if ($v === 'atomic') {
            if (self::kingOf($b, 'w') === null) {
                $castle = str_replace(['K', 'Q'], '', $castle);
            }
            if (self::kingOf($b, 'b') === null) {
                $castle = str_replace(['k', 'q'], '', $castle);
            }
        }
        $ep = !empty($m['double']) && ($fr === 1 || $fr === 6) ? self::sq(intdiv($fr + $tr, 2), $ff) : null;
        $half = self::typ($p) === 'p' || $captured ? 0 : $s['half'] + 1;
        $full = $s['turn'] === 'b' ? $s['full'] + 1 : $s['full'];
        return [
            'state' => ['board' => $b, 'turn' => self::other($s['turn']), 'castle' => $castle, 'ep' => $ep, 'half' => $half, 'full' => $full],
            'exploded' => $exploded,
            'captured' => $captured,
        ];
    }

    private static function keepsKing(string $v, array $after, string $mover): bool
    {
        if ($v === 'breakthrough') {
            return true;
        }
        if ($v === 'horde' && $mover === 'w') {
            return true;
        }
        if ($v === 'atomic') {
            if (self::kingOf($after['board'], $mover) === null) {
                return false;
            }
            if (self::kingOf($after['board'], self::other($mover)) === null) {
                return true;
            }
        }
        return !self::inCheck($v, $after, $mover);
    }

    /** @return list<array<string,mixed>> */
    public static function legalMoves(string $v, array $s): array
    {
        if (self::statusOf($v, $s, false)['over']) {
            return [];
        }
        $out = [];
        foreach (self::pseudo($v, $s) as $m) {
            if (self::keepsKing($v, self::play($v, $s, $m)['state'], $s['turn'])) {
                $out[] = $m;
            }
        }
        return $out;
    }

    private static function count(array $b, string $c): int
    {
        $n = 0;
        foreach ($b as $row) {
            foreach ($row as $p) {
                if ($p !== '' && self::col($p) === $c) {
                    $n++;
                }
            }
        }
        return $n;
    }

    /** @return array{over:bool,winner?:?string,reason?:string} */
    private static function statusOf(string $v, array $s, bool $deep): array
    {
        $b = $s['board'];
        $prev = self::other($s['turn']);
        if ($v === 'breakthrough') {
            for ($f = 0; $f < 8; $f++) {
                if ($b[7][$f] === 'P') {
                    return ['over' => true, 'winner' => 'w', 'reason' => 'A White pawn broke through!'];
                }
                if ($b[0][$f] === 'p') {
                    return ['over' => true, 'winner' => 'b', 'reason' => 'A Black pawn broke through!'];
                }
            }
            if (self::count($b, 'w') === 0) {
                return ['over' => true, 'winner' => 'b', 'reason' => 'Black captured every White pawn.'];
            }
            if (self::count($b, 'b') === 0) {
                return ['over' => true, 'winner' => 'w', 'reason' => 'White captured every Black pawn.'];
            }
        }
        if ($v === 'horde' && self::count($b, 'w') === 0) {
            return ['over' => true, 'winner' => 'b', 'reason' => 'Black wiped out the Horde!'];
        }
        if ($v === 'atomic') {
            $wk = self::kingOf($b, 'w');
            $bk = self::kingOf($b, 'b');
            if ($wk === null && $bk === null) {
                return ['over' => true, 'winner' => $prev, 'reason' => 'Both kings blew up — the mover wins.'];
            }
            if ($wk === null) {
                return ['over' => true, 'winner' => 'b', 'reason' => 'BOOM! The White king exploded.'];
            }
            if ($bk === null) {
                return ['over' => true, 'winner' => 'w', 'reason' => 'BOOM! The Black king exploded.'];
            }
        }
        if ($v === 'heist') {
            $wq = 0;
            $bq = 0;
            foreach ($b as $row) {
                foreach ($row as $p) {
                    $wq += $p === 'Q' ? 1 : 0;
                    $bq += $p === 'q' ? 1 : 0;
                }
            }
            if ($wq === 0 && $bq > 0) {
                return ['over' => true, 'winner' => 'b', 'reason' => 'Black stole the White queen!'];
            }
            if ($bq === 0 && $wq > 0) {
                return ['over' => true, 'winner' => 'w', 'reason' => 'White stole the Black queen!'];
            }
        }
        if ($v === 'parade') {
            for ($f = 0; $f < 8; $f++) {
                if ($b[7][$f] === 'P') {
                    return ['over' => true, 'winner' => 'w', 'reason' => 'A White pawn finished the parade!'];
                }
                if ($b[0][$f] === 'p') {
                    return ['over' => true, 'winner' => 'b', 'reason' => 'A Black pawn finished the parade!'];
                }
            }
        }
        if ($v === 'koth') {
            foreach (['w', 'b'] as $c) {
                $k = self::kingOf($b, $c);
                if ($k !== null && isset(self::HILL[self::sq($k[0], $k[1])])) {
                    return ['over' => true, 'winner' => $c, 'reason' => 'The ' . ($c === 'w' ? 'White' : 'Black') . ' king took the hill!'];
                }
            }
        }
        if ($deep) {
            $any = false;
            foreach (self::pseudo($v, $s) as $m) {
                if (self::keepsKing($v, self::play($v, $s, $m)['state'], $s['turn'])) {
                    $any = true;
                    break;
                }
            }
            if (!$any) {
                if ($v === 'breakthrough') {
                    return ['over' => true, 'winner' => $prev, 'reason' => ($s['turn'] === 'w' ? 'White' : 'Black') . ' has no moves left.'];
                }
                if (self::inCheck($v, $s, $s['turn'])) {
                    return ['over' => true, 'winner' => $prev, 'reason' => 'Checkmate!'];
                }
                return ['over' => true, 'winner' => null, 'reason' => 'Stalemate — nobody can move. Draw.'];
            }
        }
        if ($s['half'] >= 100) {
            return ['over' => true, 'winner' => null, 'reason' => '50 moves with no capture or pawn move. Draw.'];
        }
        if ($s['full'] > 200) {
            return ['over' => true, 'winner' => null, 'reason' => '200 moves played. Draw.'];
        }
        return ['over' => false];
    }

    /** @return array{over:bool,winner?:?string,reason?:string} */
    public static function status(string $v, array $s): array
    {
        return self::statusOf($v, $s, true);
    }

    public static function statusOfFen(string $v, string $fen): array
    {
        return self::status($v, self::parseFen($fen));
    }

    // ── SAN ──────────────────────────────────────────────────────────────

    public static function sanOf(string $v, array $s, array $m, ?array $legal = null): string
    {
        $legal ??= self::legalMoves($v, $s);
        [$fr, $ff] = self::pos($m['from']);
        $p = $s['board'][$fr][$ff];
        if ($p === '') {
            return $m['to'];
        }
        $t = self::typ($p);
        $cap = !empty($m['capture']);
        if (!empty($m['castle'])) {
            $san = $m['castle'] === 'K' ? 'O-O' : 'O-O-O';
        } elseif ($v === 'breakthrough') {
            $san = $m['from'] . ($cap ? 'x' : '-') . $m['to'];
        } elseif ($t === 'p') {
            $san = ($cap ? $m['from'][0] . 'x' : '') . $m['to'] . (!empty($m['promo']) ? '=' . strtoupper($m['promo']) : '');
        } else {
            $sameFile = false;
            $sameRank = false;
            $twins = false;
            foreach ($legal as $o) {
                if ($o['to'] !== $m['to'] || $o['from'] === $m['from']) {
                    continue;
                }
                [$or, $of] = self::pos($o['from']);
                if (self::typ($s['board'][$or][$of]) !== $t) {
                    continue;
                }
                $twins = true;
                if ($o['from'][0] === $m['from'][0]) {
                    $sameFile = true;
                }
                if ($o['from'][1] === $m['from'][1]) {
                    $sameRank = true;
                }
            }
            $dis = '';
            if ($twins) {
                $dis = !$sameFile ? $m['from'][0] : (!$sameRank ? $m['from'][1] : $m['from']);
            }
            $san = strtoupper($t) . $dis . ($cap ? 'x' : '') . $m['to'];
        }
        $after = self::play($v, $s, $m)['state'];
        $st = self::status($v, $after);
        if ($st['over'] && ($st['winner'] ?? null) === $s['turn'] && $v !== 'breakthrough') {
            $san .= '#';
        } elseif (self::inCheck($v, $after, $after['turn'])) {
            $san .= '+';
        }
        return $san;
    }

    /**
     * Play from→to if legal. Returns null for an illegal move.
     * @return array{fen:string,turn:string,san:string,exploded:list<string>,status:array}|null
     */
    public static function tryMove(string $v, string $fen, string $from, string $to, ?string $promo): ?array
    {
        if (!self::validSq($from) || !self::validSq($to)) {
            return null;
        }
        $s = self::parseFen($fen);
        $legal = self::legalMoves($v, $s);
        $cands = array_values(array_filter($legal, static fn (array $m): bool => $m['from'] === $from && $m['to'] === $to));
        if (!$cands) {
            return null;
        }
        $pick = null;
        foreach ($cands as $c) {
            if (($c['promo'] ?? null) === $promo) {
                $pick = $c;
            }
        }
        if ($pick === null && count($cands) === 1 && empty($cands[0]['promo'])) {
            $pick = $cands[0];
        }
        if ($pick === null) {
            return null;
        }
        $san = self::sanOf($v, $s, $pick, $legal);
        $res = self::play($v, $s, $pick);
        return [
            'fen' => self::toFen($res['state']),
            'turn' => $res['state']['turn'],
            'san' => $san,
            'exploded' => $res['exploded'],
            'status' => self::status($v, $res['state']),
        ];
    }

    public static function needsPromotion(string $v, string $fen, string $from, string $to): bool
    {
        foreach (self::legalMoves($v, self::parseFen($fen)) as $m) {
            if ($m['from'] === $from && $m['to'] === $to && !empty($m['promo'])) {
                return true;
            }
        }
        return false;
    }

    /** @return list<array{from:string,to:string,promo?:string}> legal moves as from/to/promo (for tests) */
    public static function legalList(string $v, string $fen): array
    {
        return array_map(static fn (array $m): array => array_filter(['from' => $m['from'], 'to' => $m['to'], 'promo' => $m['promo'] ?? null]), self::legalMoves($v, self::parseFen($fen)));
    }

    // ── bot ──────────────────────────────────────────────────────────────

    public static function evaluate(string $v, array $s): int
    {
        $b = $s['board'];
        $score = 0.0;
        $n = self::size($v);
        $mid = ($n - 1) / 2;
        for ($r = 0; $r < 8; $r++) {
            for ($f = 0; $f < 8; $f++) {
                $p = $b[$r][$f];
                if ($p === '') {
                    continue;
                }
                $c = self::col($p);
                $t = self::typ($p);
                $adv = $c === 'w' ? $r : $n - 1 - $r;
                $centre = $mid - max(abs($mid - $r), abs($mid - $f));
                $val = self::VAL[$t];
                if ($v === 'breakthrough') {
                    $val = 100 + $adv * $adv * 6 + ($f === 0 || $f === 7 ? 0 : 4);
                } elseif ($t === 'p') {
                    $val += $v === 'parade' ? $adv * $adv * 9 : $adv * ($v === 'horde' && $c === 'w' ? 5 : 8);
                } elseif ($t === 'q' && $v === 'heist') {
                    $val += 2500;
                } elseif ($t === 'n' || $t === 'b') {
                    $val += $centre * 8;
                }
                if ($t === 'k' && $v === 'koth') {
                    $val += $centre * 60;
                }
                if ($t === 'k' && $v !== 'koth') {
                    $val -= $centre * 6;
                }
                $score += $c === 'w' ? $val : -$val;
            }
        }
        if ($v === 'atomic') {
            foreach (['w', 'b'] as $c) {
                $k = self::kingOf($b, $c);
                if ($k === null) {
                    continue;
                }
                $near = 0;
                foreach (self::KG as [$dr, $df]) {
                    if (!self::on($k[0] + $dr, $k[1] + $df)) {
                        continue;
                    }
                    $q = $b[$k[0] + $dr][$k[1] + $df];
                    if ($q !== '' && self::col($q) === $c && self::typ($q) !== 'p') {
                        $near++;
                    }
                }
                $score += ($c === 'w' ? -1 : 1) * $near * 25;
            }
        }
        return (int) round($score);
    }

    /** @param list<array<string,mixed>> $moves */
    private static function ordered(string $v, array $s, array $moves): array
    {
        $key = static function (array $m) use ($v, $s): float {
            $k = 0.0;
            if (!empty($m['capture'])) {
                [$r, $f] = self::pos($m['to']);
                $t = $s['board'][$r][$f];
                $k += 10 + ($t !== '' ? self::VAL[self::typ($t)] / 100 : 1);
            }
            if (($m['promo'] ?? null) === 'q') {
                $k += 9;
            }
            if ($v === 'koth' && isset(self::HILL[$m['to']])) {
                $k += 20;
            }
            return -$k;
        };
        usort($moves, static fn (array $a, array $b): int => $key($a) <=> $key($b));
        return $moves;
    }

    private static function negamax(string $v, array $s, int $depth, float $alpha, float $beta, int $ply, float $deadline): float
    {
        $st = self::status($v, $s);
        if ($st['over']) {
            if (($st['winner'] ?? null) === null) {
                return 0;
            }
            return $st['winner'] === $s['turn'] ? self::WIN - $ply : -self::WIN + $ply;
        }
        if ($depth <= 0 || microtime(true) > $deadline) {
            $e = self::evaluate($v, $s);
            return $s['turn'] === 'w' ? $e : -$e;
        }
        $best = -INF;
        foreach (self::ordered($v, $s, self::legalMoves($v, $s)) as $m) {
            $sc = -self::negamax($v, self::play($v, $s, $m)['state'], $depth - 1, -$beta, -$alpha, $ply + 1, $deadline);
            if ($sc > $best) {
                $best = $sc;
            }
            if ($sc > $alpha) {
                $alpha = $sc;
            }
            if ($alpha >= $beta) {
                break;
            }
        }
        return $best;
    }

    /** MorseBot for the variants. @return array{from:string,to:string,promotion:?string}|null */
    public static function botMove(string $v, string $fen, int $budgetMs = 900): ?array
    {
        $s = self::parseFen($fen);
        $moves = self::ordered($v, $s, self::legalMoves($v, $s));
        if (!$moves) {
            return null;
        }
        $deadline = microtime(true) + $budgetMs / 1000;
        $pick = $moves[0];
        for ($depth = 1; $depth <= 4; $depth++) {
            $best = -INF;
            $bestMoves = [];
            foreach ($moves as $m) {
                $sc = -self::negamax($v, self::play($v, $s, $m)['state'], $depth - 1, -INF, -$best + 6, 1, $deadline);
                if ($sc > $best + 5) {
                    $best = $sc;
                    $bestMoves = [$m];
                } elseif ($sc >= $best - 5) {
                    $bestMoves[] = $m;
                }
                if (microtime(true) > $deadline) {
                    break;
                }
            }
            if (microtime(true) > $deadline && $depth > 1) {
                break;
            }
            if ($bestMoves) {
                $pick = $bestMoves[array_rand($bestMoves)];
            }
            if ($best >= self::WIN - 100) {
                break;
            }
        }
        return ['from' => $pick['from'], 'to' => $pick['to'], 'promotion' => $pick['promo'] ?? null];
    }
}
