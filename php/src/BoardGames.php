<?php

declare(strict_types=1);

namespace Morse;

/**
 * Checkers and Xiangqi (owner t363u/t364u). They ride on the variant game rows (games.variant =
 * 'checkers' / 'xiangqi'); the position lives in games.fen as a state string (not chess FEN).
 * Line-by-line copy of src/lib/boardgames/checkers.ts and xiangqi.ts, plus MorseBot for both.
 */
final class BoardGames
{
    public const IDS = ['checkers', 'xiangqi', 'battlechess'];
    public const START = [
        'checkers' => 'ck|1m1m1m1m/m1m1m1m1/1m1m1m1m/8/8/M1M1M1M1/1M1M1M1M/M1M1M1M1|w|-|0',
        'xiangqi' => 'xq|rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR|w|0',
        'battlechess' => 'bc|20/20/13FF5/6REBKQBNRABR3/6PPPPPPPPCNN3/3CI15/13H6/6H13/15ic3/3nncpppppppp6/3rbarnbkqber6/5ff13/20/20|w|-|0|1|-',
    ];

    public static function is(string $v): bool
    {
        return in_array($v, self::IDS, true);
    }

    public static function validSquare(string $v, string $sq): bool
    {
        if ($v === 'battlechess') {
            return self::bcPos($sq) !== null;
        }
        return $v === 'xiangqi' ? (bool) preg_match('/^[a-i][0-9]$/', $sq) : (bool) preg_match('/^[a-h][1-8]$/', $sq);
    }

    /** 'w' / 'b' / null: whose piece stands on $sq. */
    public static function colorAt(string $v, string $fen, string $sq): ?string
    {
        if ($v === 'battlechess') {
            $s = self::bcParse($fen);
            $p = self::bcPos($sq);
            return $s === null || $p === null ? null : self::bcColor(self::bcAt($s, $p[0], $p[1]));
        }
        if ($v === 'checkers') {
            $s = self::ckParse($fen);
            if ($s === null || !self::validSquare($v, $sq)) {
                return null;
            }
            [$r, $f] = self::ckPos($sq);
            return self::ckColor($s['board'][$r][$f]);
        }
        $s = self::xqParse($fen);
        if ($s === null || !self::validSquare($v, $sq)) {
            return null;
        }
        [$r, $f] = self::xqPos($sq);
        return self::xqColor($s['board'][$r][$f]);
    }

    /** @return array{fen:string,turn:string,san:string,status:array}|null */
    public static function tryMove(string $v, string $fen, string $from, string $to, ?string $promo = null): ?array
    {
        if ($v === 'battlechess') {
            $s = self::bcParse($fen);
            $m = $s === null ? null : self::bcFind($s, $from, $to, $promo);
            if ($m === null) {
                return null;
            }
            $san = self::bcSan($s, $m);
            $n = self::bcApply($s, $m);
            return ['fen' => self::bcString($n), 'turn' => $n['turn'], 'san' => $san, 'status' => self::bcStatus($n)];
        }
        if ($v === 'checkers') {
            $s = self::ckParse($fen);
            if ($s === null) {
                return null;
            }
            foreach (self::ckLegal($s) as $m) {
                if ($m['from'] === $from && $m['to'] === $to) {
                    $res = self::ckPlay($s, $m);
                    return ['fen' => self::ckString($res['state']), 'turn' => $res['state']['turn'], 'san' => $res['san'], 'status' => self::ckStatus($res['state'])];
                }
            }
            return null;
        }
        $s = self::xqParse($fen);
        if ($s === null) {
            return null;
        }
        foreach (self::xqLegal($s) as $m) {
            if ($m['from'] === $from && $m['to'] === $to) {
                $res = self::xqPlay($s, $m);
                return ['fen' => self::xqString($res['state']), 'turn' => $res['state']['turn'], 'san' => $res['san'], 'status' => self::xqStatus($res['state'])];
            }
        }
        return null;
    }

    /** @return array{over:bool,winner?:?string,reason?:string} */
    public static function statusOfFen(string $v, string $fen): array
    {
        if ($v === 'battlechess') {
            $s = self::bcParse($fen);
            return $s === null ? ['over' => true, 'winner' => null, 'reason' => 'bad'] : self::bcStatus($s);
        }
        if ($v === 'checkers') {
            $s = self::ckParse($fen);
            return $s === null ? ['over' => true, 'winner' => null, 'reason' => 'bad'] : self::ckStatus($s);
        }
        $s = self::xqParse($fen);
        return $s === null ? ['over' => true, 'winner' => null, 'reason' => 'bad'] : self::xqStatus($s);
    }

    /** All legal [from, to] pairs (for tests). @return list<array{0:string,1:string}> */
    public static function legalList(string $v, string $fen): array
    {
        $out = [];
        if ($v === 'battlechess') {
            $s = self::bcParse($fen);
            foreach ($s === null ? [] : self::bcLegal($s) as $m) {
                $out[] = [$m['from'], $m['to']];
            }
            return array_values(array_unique($out, SORT_REGULAR));
        }
        if ($v === 'checkers') {
            $s = self::ckParse($fen);
            foreach ($s === null ? [] : self::ckLegal($s) as $m) {
                $out[] = [$m['from'], $m['to']];
            }
            return $out;
        }
        $s = self::xqParse($fen);
        foreach ($s === null ? [] : self::xqLegal($s) as $m) {
            $out[] = [$m['from'], $m['to']];
        }
        return $out;
    }

    // ───────────────────────── Checkers ─────────────────────────

    private const CK_FILES = 'abcdefgh';

    public static function ckSq(int $r, int $f): string
    {
        return self::CK_FILES[$f] . ($r + 1);
    }

    /** @return array{0:int,1:int} */
    public static function ckPos(string $s): array
    {
        return [(int) substr($s, 1) - 1, strpos(self::CK_FILES, $s[0])];
    }

    private static function ckColor(?string $c): ?string
    {
        return $c === null ? null : (($c === 'M' || $c === 'K') ? 'w' : 'b');
    }

    public static function ckParse(string $str): ?array
    {
        $p = explode('|', $str);
        if (count($p) !== 5 || $p[0] !== 'ck') {
            return null;
        }
        $rows = explode('/', $p[1]);
        if (count($rows) !== 8) {
            return null;
        }
        $board = array_fill(0, 8, array_fill(0, 8, null));
        for ($i = 0; $i < 8; $i++) {
            $r = 7 - $i;
            $f = 0;
            foreach (str_split($rows[$i]) as $ch) {
                if ($ch >= '1' && $ch <= '8') {
                    $f += (int) $ch;
                } elseif (str_contains('MKmk', $ch)) {
                    if ($f > 7) {
                        return null;
                    }
                    $board[$r][$f++] = $ch;
                } else {
                    return null;
                }
            }
            if ($f !== 8) {
                return null;
            }
        }
        if ($p[2] !== 'w' && $p[2] !== 'b') {
            return null;
        }
        $cont = $p[3] === '-' ? null : (preg_match('/^[a-h][1-8]$/', $p[3]) ? $p[3] : null);
        return ['board' => $board, 'turn' => $p[2], 'cont' => $cont, 'quiet' => max(0, (int) $p[4])];
    }

    public static function ckString(array $s): string
    {
        $rows = [];
        for ($r = 7; $r >= 0; $r--) {
            $row = '';
            $run = 0;
            for ($f = 0; $f < 8; $f++) {
                $c = $s['board'][$r][$f];
                if ($c === null) {
                    $run++;
                } else {
                    if ($run) {
                        $row .= $run;
                    }
                    $run = 0;
                    $row .= $c;
                }
            }
            if ($run) {
                $row .= $run;
            }
            $rows[] = $row;
        }
        return 'ck|' . implode('/', $rows) . '|' . $s['turn'] . '|' . ($s['cont'] ?? '-') . '|' . $s['quiet'];
    }

    private static function ckDirs(string $c): array
    {
        if ($c === 'K' || $c === 'k') {
            return [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        }
        return self::ckColor($c) === 'w' ? [[1, 1], [1, -1]] : [[-1, 1], [-1, -1]];
    }

    private static function ckJumpsFrom(array $s, int $r, int $f): array
    {
        $c = $s['board'][$r][$f];
        $me = self::ckColor($c);
        $out = [];
        if ($me === null) {
            return $out;
        }
        foreach (self::ckDirs($c) as [$dr, $df]) {
            $tr = $r + 2 * $dr;
            $tf = $f + 2 * $df;
            if ($tr < 0 || $tr > 7 || $tf < 0 || $tf > 7) {
                continue;
            }
            $mid = $s['board'][$r + $dr][$f + $df];
            if ($mid !== null && self::ckColor($mid) !== $me && $s['board'][$tr][$tf] === null) {
                $out[] = ['from' => self::ckSq($r, $f), 'to' => self::ckSq($tr, $tf), 'jump' => self::ckSq($r + $dr, $f + $df)];
            }
        }
        return $out;
    }

    public static function ckLegal(array $s): array
    {
        if ($s['cont'] !== null) {
            [$r, $f] = self::ckPos($s['cont']);
            return self::ckJumpsFrom($s, $r, $f);
        }
        $jumps = [];
        $steps = [];
        for ($r = 0; $r < 8; $r++) {
            for ($f = 0; $f < 8; $f++) {
                $c = $s['board'][$r][$f];
                if ($c === null || self::ckColor($c) !== $s['turn']) {
                    continue;
                }
                foreach (self::ckJumpsFrom($s, $r, $f) as $j) {
                    $jumps[] = $j;
                }
                foreach (self::ckDirs($c) as [$dr, $df]) {
                    $tr = $r + $dr;
                    $tf = $f + $df;
                    if ($tr >= 0 && $tr < 8 && $tf >= 0 && $tf < 8 && $s['board'][$tr][$tf] === null) {
                        $steps[] = ['from' => self::ckSq($r, $f), 'to' => self::ckSq($tr, $tf), 'jump' => null];
                    }
                }
            }
        }
        return $jumps ? $jumps : $steps;
    }

    public static function ckPlay(array $s, array $m): array
    {
        $board = $s['board'];
        [$fr, $ff] = self::ckPos($m['from']);
        [$tr, $tf] = self::ckPos($m['to']);
        $c = $board[$fr][$ff];
        $board[$fr][$ff] = null;
        if ($m['jump'] !== null) {
            [$jr, $jf] = self::ckPos($m['jump']);
            $board[$jr][$jf] = null;
        }
        $crowned = false;
        if ($c === 'M' && $tr === 7) {
            $c = 'K';
            $crowned = true;
        }
        if ($c === 'm' && $tr === 0) {
            $c = 'k';
            $crowned = true;
        }
        $board[$tr][$tf] = $c;
        $manMove = $c === 'M' || $c === 'm' || $crowned;
        $quiet = ($m['jump'] !== null || $manMove) ? 0 : $s['quiet'] + 1;
        $next = ['board' => $board, 'turn' => $s['turn'], 'cont' => null, 'quiet' => $quiet];
        if ($m['jump'] !== null && !$crowned && count(self::ckJumpsFrom($next, $tr, $tf)) > 0) {
            $next['cont'] = $m['to'];
        } else {
            $next['turn'] = $s['turn'] === 'w' ? 'b' : 'w';
        }
        return ['state' => $next, 'san' => $m['from'] . ($m['jump'] !== null ? 'x' : '-') . $m['to'], 'crowned' => $crowned];
    }

    public static function ckStatus(array $s): array
    {
        if (count(self::ckLegal($s)) === 0) {
            return ['over' => true, 'winner' => $s['turn'] === 'w' ? 'b' : 'w', 'reason' => 'no-moves'];
        }
        if ($s['quiet'] >= 80) {
            return ['over' => true, 'winner' => null, 'reason' => 'forty-moves'];
        }
        return ['over' => false];
    }

    // ───────────────────────── Xiangqi ─────────────────────────

    private const XQ_FILES = 'abcdefghi';

    public static function xqSq(int $r, int $f): string
    {
        return self::XQ_FILES[$f] . $r;
    }

    /** @return array{0:int,1:int} */
    public static function xqPos(string $s): array
    {
        return [(int) substr($s, 1), strpos(self::XQ_FILES, $s[0])];
    }

    private static function xqColor(?string $c): ?string
    {
        return $c === null ? null : (ctype_upper($c) ? 'w' : 'b');
    }

    private static function xqOn(int $r, int $f): bool
    {
        return $r >= 0 && $r <= 9 && $f >= 0 && $f <= 8;
    }

    private static function xqPalace(int $r, int $f, string $c): bool
    {
        return $f >= 3 && $f <= 5 && ($c === 'w' ? $r <= 2 : $r >= 7);
    }

    private static function xqOwnSide(int $r, string $c): bool
    {
        return $c === 'w' ? $r <= 4 : $r >= 5;
    }

    public static function xqParse(string $str): ?array
    {
        $p = explode('|', $str);
        if (count($p) !== 4 || $p[0] !== 'xq') {
            return null;
        }
        $rows = explode('/', $p[1]);
        if (count($rows) !== 10) {
            return null;
        }
        $board = array_fill(0, 10, array_fill(0, 9, null));
        for ($i = 0; $i < 10; $i++) {
            $r = 9 - $i;
            $f = 0;
            foreach (str_split($rows[$i]) as $ch) {
                if ($ch >= '1' && $ch <= '9') {
                    $f += (int) $ch;
                } elseif (str_contains('KAEHRCPkaehrcp', $ch)) {
                    if ($f > 8) {
                        return null;
                    }
                    $board[$r][$f++] = $ch;
                } else {
                    return null;
                }
            }
            if ($f !== 9) {
                return null;
            }
        }
        if ($p[2] !== 'w' && $p[2] !== 'b') {
            return null;
        }
        return ['board' => $board, 'turn' => $p[2], 'quiet' => max(0, (int) $p[3])];
    }

    public static function xqString(array $s): string
    {
        $rows = [];
        for ($r = 9; $r >= 0; $r--) {
            $row = '';
            $run = 0;
            for ($f = 0; $f < 9; $f++) {
                $c = $s['board'][$r][$f];
                if ($c === null) {
                    $run++;
                } else {
                    if ($run) {
                        $row .= $run;
                    }
                    $run = 0;
                    $row .= $c;
                }
            }
            if ($run) {
                $row .= $run;
            }
            $rows[] = $row;
        }
        return 'xq|' . implode('/', $rows) . '|' . $s['turn'] . '|' . $s['quiet'];
    }

    private static function xqGeneral(array $b, string $c): ?array
    {
        $g = $c === 'w' ? 'K' : 'k';
        for ($r = 0; $r <= 9; $r++) {
            for ($f = 3; $f <= 5; $f++) {
                if ($b[$r][$f] === $g) {
                    return [$r, $f];
                }
            }
        }
        return null;
    }

    private static function xqAttacked(array $b, int $r, int $f, string $by): bool
    {
        $up = static fn (string $k): string => $by === 'w' ? $k : strtolower($k);
        foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $df]) {
            $rr = $r + $dr;
            $ff = $f + $df;
            $screens = 0;
            while (self::xqOn($rr, $ff)) {
                $c = $b[$rr][$ff];
                if ($c !== null) {
                    if ($screens === 0) {
                        if ($c === $up('R')) {
                            return true;
                        }
                        if ($c === $up('K') && $df === 0) {
                            return true;
                        }
                    } elseif ($screens === 1 && $c === $up('C')) {
                        return true;
                    }
                    $screens++;
                    if ($screens > 1) {
                        break;
                    }
                }
                $rr += $dr;
                $ff += $df;
            }
        }
        foreach ([[2, 1, 1, 1], [2, -1, 1, -1], [-2, 1, -1, 1], [-2, -1, -1, -1], [1, 2, 1, 1], [-1, 2, -1, 1], [1, -2, 1, -1], [-1, -2, -1, -1]] as [$dr, $df, $lr, $lf]) {
            $hr = $r + $dr;
            $hf = $f + $df;
            if (self::xqOn($hr, $hf) && $b[$hr][$hf] === $up('H') && $b[$r + $lr][$f + $lf] === null) {
                return true;
            }
        }
        $fwd = $by === 'w' ? -1 : 1;
        if (self::xqOn($r + $fwd, $f) && $b[$r + $fwd][$f] === $up('P')) {
            return true;
        }
        foreach ([1, -1] as $df) {
            if (self::xqOn($r, $f + $df) && $b[$r][$f + $df] === $up('P') && !self::xqOwnSide($r, $by)) {
                return true;
            }
        }
        foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $df]) {
            if (self::xqOn($r + $dr, $f + $df) && $b[$r + $dr][$f + $df] === $up('K')) {
                return true;
            }
        }
        foreach ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as [$dr, $df]) {
            if (self::xqOn($r + $dr, $f + $df) && $b[$r + $dr][$f + $df] === $up('A')) {
                return true;
            }
        }
        foreach ([[2, 2], [2, -2], [-2, 2], [-2, -2]] as [$dr, $df]) {
            if (self::xqOn($r + $dr, $f + $df) && $b[$r + $dr][$f + $df] === $up('E') && $b[$r + intdiv($dr, 2)][$f + intdiv($df, 2)] === null) {
                return true;
            }
        }
        return false;
    }

    private static function xqPseudo(array $s): array
    {
        $b = $s['board'];
        $me = $s['turn'];
        $out = [];
        $add = static function (int $r, int $f, int $tr, int $tf) use (&$out, $b, $me): void {
            if (!self::xqOn($tr, $tf)) {
                return;
            }
            $t = $b[$tr][$tf];
            if ($t !== null && self::xqColor($t) === $me) {
                return;
            }
            $out[] = ['from' => self::xqSq($r, $f), 'to' => self::xqSq($tr, $tf), 'capture' => $t !== null];
        };
        for ($r = 0; $r <= 9; $r++) {
            for ($f = 0; $f <= 8; $f++) {
                $c = $b[$r][$f];
                if ($c === null || self::xqColor($c) !== $me) {
                    continue;
                }
                $k = strtoupper($c);
                if ($k === 'K') {
                    foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $df]) {
                        if (self::xqPalace($r + $dr, $f + $df, $me)) {
                            $add($r, $f, $r + $dr, $f + $df);
                        }
                    }
                } elseif ($k === 'A') {
                    foreach ([[1, 1], [1, -1], [-1, 1], [-1, -1]] as [$dr, $df]) {
                        if (self::xqPalace($r + $dr, $f + $df, $me)) {
                            $add($r, $f, $r + $dr, $f + $df);
                        }
                    }
                } elseif ($k === 'E') {
                    foreach ([[2, 2], [2, -2], [-2, 2], [-2, -2]] as [$dr, $df]) {
                        $tr = $r + $dr;
                        $tf = $f + $df;
                        if (self::xqOn($tr, $tf) && self::xqOwnSide($tr, $me) && $b[$r + intdiv($dr, 2)][$f + intdiv($df, 2)] === null) {
                            $add($r, $f, $tr, $tf);
                        }
                    }
                } elseif ($k === 'H') {
                    foreach ([[1, 0, 2, 1], [1, 0, 2, -1], [-1, 0, -2, 1], [-1, 0, -2, -1], [0, 1, 1, 2], [0, 1, -1, 2], [0, -1, 1, -2], [0, -1, -1, -2]] as [$lr, $lf, $a, $c2]) {
                        if (self::xqOn($r + $lr, $f + $lf) && $b[$r + $lr][$f + $lf] === null) {
                            $add($r, $f, $r + $a, $f + $c2);
                        }
                    }
                } elseif ($k === 'R' || $k === 'C') {
                    foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dr, $df]) {
                        $tr = $r + $dr;
                        $tf = $f + $df;
                        $jumped = false;
                        while (self::xqOn($tr, $tf)) {
                            $t = $b[$tr][$tf];
                            if ($k === 'R') {
                                $add($r, $f, $tr, $tf);
                                if ($t !== null) {
                                    break;
                                }
                            } elseif (!$jumped) {
                                if ($t === null) {
                                    $add($r, $f, $tr, $tf);
                                } else {
                                    $jumped = true;
                                }
                            } elseif ($t !== null) {
                                if (self::xqColor($t) !== $me) {
                                    $add($r, $f, $tr, $tf);
                                }
                                break;
                            }
                            $tr += $dr;
                            $tf += $df;
                        }
                    }
                } elseif ($k === 'P') {
                    $fwd = $me === 'w' ? 1 : -1;
                    $add($r, $f, $r + $fwd, $f);
                    if (!self::xqOwnSide($r, $me)) {
                        $add($r, $f, $r, $f + 1);
                        $add($r, $f, $r, $f - 1);
                    }
                }
            }
        }
        return $out;
    }

    private static function xqApply(array $b, array $m): array
    {
        [$fr, $ff] = self::xqPos($m['from']);
        [$tr, $tf] = self::xqPos($m['to']);
        $b[$tr][$tf] = $b[$fr][$ff];
        $b[$fr][$ff] = null;
        return $b;
    }

    private static function xqInCheck(array $b, string $c): bool
    {
        $g = self::xqGeneral($b, $c);
        if ($g === null) {
            return true;
        }
        return self::xqAttacked($b, $g[0], $g[1], $c === 'w' ? 'b' : 'w');
    }

    public static function xqLegal(array $s): array
    {
        $out = [];
        foreach (self::xqPseudo($s) as $m) {
            if (!self::xqInCheck(self::xqApply($s['board'], $m), $s['turn'])) {
                $out[] = $m;
            }
        }
        return $out;
    }

    public static function xqPlay(array $s, array $m): array
    {
        [$fr, $ff] = self::xqPos($m['from']);
        $piece = strtoupper((string) $s['board'][$fr][$ff]);
        $board = self::xqApply($s['board'], $m);
        $turn = $s['turn'] === 'w' ? 'b' : 'w';
        $next = ['board' => $board, 'turn' => $turn, 'quiet' => $m['capture'] ? 0 : $s['quiet'] + 1];
        $check = self::xqInCheck($board, $turn) ? '+' : '';
        return ['state' => $next, 'san' => $piece . $m['from'] . ($m['capture'] ? 'x' : '-') . $m['to'] . $check];
    }

    public static function xqStatus(array $s): array
    {
        if (count(self::xqLegal($s)) === 0) {
            return ['over' => true, 'winner' => $s['turn'] === 'w' ? 'b' : 'w', 'reason' => self::xqInCheck($s['board'], $s['turn']) ? 'checkmate' : 'stalemate'];
        }
        if ($s['quiet'] >= 120) {
            return ['over' => true, 'winner' => null, 'reason' => 'sixty-moves'];
        }
        return ['over' => false];
    }

    // ───────────────────────── Battle Chess ─────────────────────────
    // Line-by-line copy of src/lib/boardgames/battlechess.ts (see the notes there).

    private const BC_X0 = -3;
    private const BC_X1 = 16;
    private const BC_Y0 = -2;
    private const BC_Y1 = 11;
    private const BC_FILES = 'xyzabcdefghijklmnopq';
    private const BC_ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    private const BC_DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    private const BC_KN = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
    private const BC_EAG = [[3, 0], [-3, 0], [0, 3], [0, -3]];
    private const BC_ARCH = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]];
    private const BC_VAL = ['K' => 0, 'Q' => 900, 'R' => 500, 'B' => 320, 'N' => 300, 'P' => 100, 'C' => 260, 'E' => 380, 'A' => 520, 'F' => 250, 'I' => 360, 'W' => 640, 'U' => 180, 'H' => 0];

    public static function bcSq(int $x, int $y): string
    {
        return self::BC_FILES[$x + 3] . $y;
    }

    /** @return array{0:int,1:int}|null */
    public static function bcPos(string $s): ?array
    {
        if ($s === '') {
            return null;
        }
        $xi = strpos(self::BC_FILES, $s[0]);
        $rest = substr($s, 1);
        if ($xi === false || !preg_match('/^-?\d+$/', $rest)) {
            return null;
        }
        $y = (int) $rest;
        if ($y < self::BC_Y0 || $y > self::BC_Y1) {
            return null;
        }
        return [$xi - 3, $y];
    }

    private static function bcIn(int $x, int $y): bool
    {
        return $x >= self::BC_X0 && $x <= self::BC_X1 && $y >= self::BC_Y0 && $y <= self::BC_Y1;
    }

    public static function bcTerrain(int $x, int $y): string
    {
        if ($x < 0 || $x > 13 || $y < 1 || $y > 8) {
            return 'W';
        }
        if ($y === 3 && $x <= 2) {
            return 'W';
        }
        if ($y === 6 && $x >= 11) {
            return 'W';
        }
        if (($x <= 1 && $y >= 7) || ($x >= 12 && $y <= 2)) {
            return 'M';
        }
        if (($x === 6 && $y === 5) || ($x === 7 && $y === 4)) {
            return 'T';
        }
        return 'L';
    }

    private static function bcLand(int $x, int $y): bool
    {
        $t = self::bcTerrain($x, $y);
        return $t === 'L' || $t === 'T';
    }

    private static function bcWater(int $x, int $y): bool
    {
        return self::bcIn($x, $y) && self::bcTerrain($x, $y) === 'W';
    }

    private static function bcAt(array $s, int $x, int $y): string
    {
        return self::bcIn($x, $y) ? $s['cells'][self::BC_Y1 - $y][$x - self::BC_X0] : '#';
    }

    private static function bcPut(array &$c, int $x, int $y, string $p): void
    {
        $c[self::BC_Y1 - $y][$x - self::BC_X0] = $p;
    }

    public static function bcColor(string $p): ?string
    {
        if ($p === '.' || $p === '#' || $p === 'H') {
            return null;
        }
        return strtoupper($p) === $p ? 'w' : 'b';
    }

    private static function bcKind(string $p): string
    {
        return strtoupper($p);
    }

    public static function bcParse(string $str): ?array
    {
        $p = explode('|', $str);
        if ((count($p) !== 6 && count($p) !== 7) || $p[0] !== 'bc') {
            return null;
        }
        $rows = explode('/', $p[1]);
        if (count($rows) !== 14) {
            return null;
        }
        $cells = [];
        foreach ($rows as $r) {
            $row = [];
            preg_match_all('/(\d+)|(\D)/', $r, $mm, PREG_SET_ORDER);
            foreach ($mm as $m) {
                if ($m[1] !== '') {
                    for ($i = (int) $m[1]; $i > 0; $i--) {
                        $row[] = '.';
                    }
                } else {
                    $row[] = $m[2];
                }
            }
            if (count($row) !== 20) {
                return null;
            }
            $cells[] = $row;
        }
        $extra = self::bcReadExtra($p[6] ?? null);
        return ['cells' => $cells, 'turn' => $p[2] === 'b' ? 'b' : 'w', 'ep' => $p[3] === '-' ? null : $p[3], 'half' => (int) $p[4], 'full' => max(1, (int) $p[5]), 'lava' => $extra['lava'], 'storm' => $extra['storm']];
    }

    public static function bcString(array $s): string
    {
        return implode('|', ['bc', implode('/', array_map(static fn (array $r): string => (string) preg_replace_callback('/\.+/', static fn (array $m): string => (string) strlen($m[0]), implode('', $r)), $s['cells'])), $s['turn'], $s['ep'] ?? '-', (string) $s['half'], (string) $s['full'], self::bcWriteExtra($s)]);
    }

    /** Same Park-Miller step as battlechess.ts bcNext. */
    private static function bcNext(int $n): int
    {
        $x = (($n % 2147483647) * 48271) % 2147483647;
        return $x === 0 ? 1 : $x;
    }

    /** @return array{lava:array<string,int>,storm:string} */
    private static function bcReadExtra(?string $raw): array
    {
        $lava = [];
        if ($raw === null || $raw === '' || $raw === '-') {
            return ['lava' => $lava, 'storm' => ''];
        }
        $storm = '';
        $body = $raw;
        $colon = strpos($raw, ':');
        if ($colon !== false) {
            $storm = (string) preg_replace('/[^TV]/', '', substr($raw, 0, $colon));
            $body = substr($raw, $colon + 1);
        }
        if ($body !== '' && $body !== '-') {
            foreach (explode(',', $body) as $part) {
                $bits = explode('.', $part);
                $ttl = (int) ($bits[1] ?? 0);
                if (($bits[0] ?? '') !== '' && $ttl > 0) {
                    $lava[$bits[0]] = $ttl;
                }
            }
        }
        return ['lava' => $lava, 'storm' => $storm];
    }

    private static function bcWriteExtra(array $s): string
    {
        $lava = $s['lava'] ?? [];
        $bits = [];
        ksort($lava);
        foreach ($lava as $sq => $n) {
            if ((int) $n > 0) {
                $bits[] = $sq . '.' . (int) $n;
            }
        }
        $body = implode(',', $bits);
        $storm = (string) ($s['storm'] ?? '');
        if ($storm === '' && $body === '') {
            return '-';
        }
        return $storm . ':' . $body;
    }

    private static function bcHot(array $s, int $x, int $y): bool
    {
        return (int) (($s['lava'][self::bcSq($x, $y)] ?? 0)) > 0;
    }

    /** @return array{0:int,1:int}|null */
    private static function bcMate(array $s, int $x, int $y): ?array
    {
        $p = self::bcAt($s, $x, $y);
        foreach (self::BC_ORTH as [$dx, $dy]) {
            if (self::bcAt($s, $x + $dx, $y + $dy) === $p) {
                return [$x + $dx, $y + $dy];
            }
        }
        return null;
    }

    /** @param list<array{0:int,1:int}> $out */
    private static function bcCannon(array $s, int $x, int $y, string $by, array &$out): void
    {
        foreach (self::BC_ORTH as [$dx, $dy]) {
            if (!self::bcLand($x + $dx, $y + $dy) && self::bcTerrain($x + $dx, $y + $dy) !== 'M') {
                continue;
            }
            for ($k = 1; $k <= 3; $k++) {
                $tx = $x + $dx * $k;
                $ty = $y + $dy * $k;
                if (!self::bcLand($tx, $ty)) {
                    break;
                }
                $p = self::bcAt($s, $tx, $ty);
                if ($p === '.') {
                    continue;
                }
                if (self::bcKind($p) === 'R') {
                    break;
                }
                if (self::bcColor($p) !== $by) {
                    $out[] = [$tx, $ty];
                }
                break;
            }
        }
    }

    public static function bcAttacked(array $s, int $x, int $y, string $by): bool
    {
        for ($yy = self::BC_Y0; $yy <= self::BC_Y1; $yy++) {
            for ($xx = self::BC_X0; $xx <= self::BC_X1; $xx++) {
                $p = self::bcAt($s, $xx, $yy);
                if ($p === '.' || self::bcColor($p) !== $by) {
                    continue;
                }
                $k = self::bcKind($p);
                $dx = $x - $xx;
                $dy = $y - $yy;
                $ax = abs($dx);
                $ay = abs($dy);
                if ($k === 'P') {
                    $fwd = $by === 'w' ? -1 : 1;
                    if ($dy === $fwd && $ax === 1) {
                        return true;
                    }
                } elseif ($k === 'N') {
                    if (($ax === 1 && $ay === 2) || ($ax === 2 && $ay === 1)) {
                        return true;
                    }
                } elseif ($k === 'E') {
                    if (($ax === 1 && $ay === 2) || ($ax === 2 && $ay === 1) || ($ax === 3 && $dy === 0) || ($dx === 0 && $ay === 3)) {
                        return true;
                    }
                } elseif ($k === 'K' || $k === 'W') {
                    if (max($ax, $ay) === 1 && self::bcLand($x, $y)) {
                        return true;
                    }
                } elseif ($k === 'I') {
                    $reach = max($ax, $ay);
                    $orth = $dx === 0 || $dy === 0;
                    $diag = $ax === $ay;
                    if ($reach >= 1 && $reach <= 4 && ($orth || $diag) && (self::bcLand($x, $y) || self::bcKind(self::bcAt($s, $x, $y)) === 'F')) {
                        $sx = $dx <=> 0;
                        $sy = $dy <=> 0;
                        $ok = true;
                        for ($i = 1; $i < $reach; $i++) {
                            if (self::bcTerrain($xx + $sx * $i, $yy + $sy * $i) !== 'L' || self::bcAt($s, $xx + $sx * $i, $yy + $sy * $i) !== '.') {
                                $ok = false;
                                break;
                            }
                        }
                        if ($ok) {
                            return true;
                        }
                    }
                } elseif ($k === 'C') {
                    if (($ax === 2 || $dx === 0) && ($ay === 2 || $dy === 0) && ($dx !== 0 || $dy !== 0)) {
                        $t = self::bcTerrain($xx + intdiv($dx, 2), $yy + intdiv($dy, 2));
                        if ($t !== 'M' && $t !== 'T') {
                            return true;
                        }
                    }
                } elseif ($k === 'A') {
                    if ($ax === $ay && $dx !== 0) {
                        $sx = $dx <=> 0;
                        $sy = $dy <=> 0;
                        $ok = true;
                        for ($i = 1; $i < $ax; $i++) {
                            if (self::bcTerrain($xx + $sx * $i, $yy + $sy * $i) !== 'L') {
                                $ok = false;
                                break;
                            }
                        }
                        if ($ok) {
                            return true;
                        }
                    }
                } elseif ($k === 'F') {
                    $out = [];
                    self::bcCannon($s, $xx, $yy, $by, $out);
                    foreach ($out as [$a, $b]) {
                        if ($a === $x && $b === $y) {
                            return true;
                        }
                    }
                } elseif ($k === 'Q' || $k === 'R' || $k === 'B') {
                    $orth = $dx === 0 || $dy === 0;
                    $diag = $ax === $ay;
                    if (($dx === 0 && $dy === 0) || (!$orth && !$diag)) {
                        continue;
                    }
                    if ($k === 'R' && !$orth) {
                        continue;
                    }
                    if ($k === 'B' && !$diag) {
                        continue;
                    }
                    if (!self::bcLand($x, $y)) {
                        continue;
                    }
                    $sx = $dx <=> 0;
                    $sy = $dy <=> 0;
                    $cx = $xx + $sx;
                    $cy = $yy + $sy;
                    $ok = true;
                    while ($cx !== $x || $cy !== $y) {
                        if (self::bcTerrain($cx, $cy) !== 'L' || self::bcAt($s, $cx, $cy) !== '.') {
                            $ok = false;
                            break;
                        }
                        $cx += $sx;
                        $cy += $sy;
                    }
                    if ($ok) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /** @return array{0:int,1:int}|null */
    private static function bcKing(array $s, string $c): ?array
    {
        $want = $c === 'w' ? 'K' : 'k';
        for ($y = 1; $y <= 8; $y++) {
            for ($x = 0; $x <= 13; $x++) {
                if (self::bcAt($s, $x, $y) === $want) {
                    return [$x, $y];
                }
            }
        }
        return null;
    }

    public static function bcInCheck(array $s, string $c): bool
    {
        $k = self::bcKing($s, $c);
        return $k === null || self::bcAttacked($s, $k[0], $k[1], $c === 'w' ? 'b' : 'w');
    }

    private static function bcPseudo(array $s): array
    {
        $out = [];
        $me = $s['turn'];
        $add = static function (int $fx, int $fy, int $tx, int $ty, array $extra = []) use (&$out, $s): void {
            $p = self::bcAt($s, $tx, $ty);
            $chest = $p === 'H';
            $out[] = array_merge(['from' => self::bcSq($fx, $fy), 'to' => self::bcSq($tx, $ty), 'capture' => $p !== '.' && $p !== '#' && !$chest, 'chest' => $chest], $extra);
        };
        $landOk = static fn (int $x, int $y): bool => self::bcLand($x, $y) && !self::bcHot($s, $x, $y) && self::bcColor(self::bcAt($s, $x, $y)) !== $me;
        $kings = array_merge(self::BC_ORTH, self::BC_DIAG);
        for ($y = self::BC_Y0; $y <= self::BC_Y1; $y++) {
            for ($x = self::BC_X0; $x <= self::BC_X1; $x++) {
                $p = self::bcAt($s, $x, $y);
                if ($p === '.' || self::bcColor($p) !== $me) {
                    continue;
                }
                $k = self::bcKind($p);
                if ($k === 'P') {
                    $fwd = $me === 'w' ? -1 : 1;
                    $start = $me === 'w' ? 7 : 2;
                    $last = $me === 'w' ? 1 : 8;
                    $promo = static function (int $ty, array $base, int $tx) use ($add, $x, $y, $last): void {
                        if ($ty === $last) {
                            foreach (['q', 'r', 'b', 'n'] as $q) {
                                $add($x, $y, $tx, $ty, array_merge($base, ['promo' => $q]));
                            }
                        } else {
                            $add($x, $y, $tx, $ty, $base);
                        }
                    };
                    $ahead = self::bcAt($s, $x, $y + $fwd);
                    if (self::bcLand($x, $y + $fwd) && !self::bcHot($s, $x, $y + $fwd) && ($ahead === '.' || $ahead === 'H')) {
                        $promo($y + $fwd, [], $x);
                        if ($y === $start && self::bcLand($x, $y + 2 * $fwd) && !self::bcHot($s, $x, $y + 2 * $fwd) && self::bcAt($s, $x, $y + 2 * $fwd) === '.') {
                            $add($x, $y, $x, $y + 2 * $fwd, ['double' => true]);
                        }
                    }
                    foreach ([-1, 1] as $dx) {
                        $tx = $x + $dx;
                        $ty = $y + $fwd;
                        $q = self::bcAt($s, $tx, $ty);
                        if (self::bcLand($tx, $ty) && !self::bcHot($s, $tx, $ty) && $q !== '.' && $q !== 'H' && self::bcColor($q) !== $me && self::bcKind($q) !== 'F') {
                            $promo($ty, [], $tx);
                        } elseif ($s['ep'] !== null && $s['ep'] === self::bcSq($tx, $ty)) {
                            $add($x, $y, $tx, $ty, ['capture' => true, 'ep' => true]);
                        }
                    }
                } elseif ($k === 'N' || $k === 'E') {
                    $jumps = $k === 'N' ? self::BC_KN : array_merge(self::BC_KN, self::BC_EAG);
                    foreach ($jumps as [$dx, $dy]) {
                        if ($landOk($x + $dx, $y + $dy)) {
                            $add($x, $y, $x + $dx, $y + $dy);
                        }
                    }
                } elseif ($k === 'K') {
                    foreach ($kings as [$dx, $dy]) {
                        if ($landOk($x + $dx, $y + $dy)) {
                            $add($x, $y, $x + $dx, $y + $dy);
                        }
                    }
                } elseif ($k === 'C') {
                    foreach ($kings as [$dx, $dy]) {
                        if (self::bcLand($x + $dx, $y + $dy) && !self::bcHot($s, $x + $dx, $y + $dy) && (self::bcAt($s, $x + $dx, $y + $dy) === '.' || self::bcAt($s, $x + $dx, $y + $dy) === 'H')) {
                            $add($x, $y, $x + $dx, $y + $dy);
                        }
                    }
                    foreach (self::BC_ARCH as [$dx, $dy]) {
                        $tx = $x + $dx;
                        $ty = $y + $dy;
                        if (!self::bcIn($tx, $ty)) {
                            continue;
                        }
                        $mid = self::bcTerrain($x + intdiv($dx, 2), $y + intdiv($dy, 2));
                        if ($mid === 'M' || $mid === 'T') {
                            continue;
                        }
                        $q = self::bcAt($s, $tx, $ty);
                        if ($q !== '.' && self::bcColor($q) !== $me) {
                            $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($tx, $ty), 'capture' => true, 'shot' => true];
                        }
                    }
                } elseif ($k === 'A') {
                    foreach (self::BC_DIAG as [$dx, $dy]) {
                        $tx = $x + $dx;
                        $ty = $y + $dy;
                        while (true) {
                            $t = self::bcTerrain($tx, $ty);
                            if ($t === 'W' || $t === 'M' || self::bcHot($s, $tx, $ty)) {
                                break;
                            }
                            $q = self::bcAt($s, $tx, $ty);
                            if ($q === 'H') {
                                $add($x, $y, $tx, $ty);
                                break;
                            }
                            if (self::bcColor($q) !== $me) {
                                $add($x, $y, $tx, $ty);
                            }
                            if ($t === 'T') {
                                break;
                            }
                            $tx += $dx;
                            $ty += $dy;
                        }
                    }
                } elseif ($k === 'Q' || $k === 'R' || $k === 'B') {
                    $dirs = $k === 'R' ? self::BC_ORTH : ($k === 'B' ? self::BC_DIAG : $kings);
                    foreach ($dirs as [$dx, $dy]) {
                        $tx = $x + $dx;
                        $ty = $y + $dy;
                        while (true) {
                            $t = self::bcTerrain($tx, $ty);
                            if ($t === 'M' || self::bcHot($s, $tx, $ty)) {
                                break;
                            }
                            if ($t === 'W') {
                                if ($k !== 'R') {
                                    break;
                                }
                                $wx = $tx;
                                $wy = $ty;
                                while (self::bcWater($wx, $wy)) {
                                    $q = self::bcAt($s, $wx, $wy);
                                    if ($q !== '.') {
                                        if (self::bcKind($q) === 'F' && self::bcColor($q) !== $me) {
                                            $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($wx, $wy), 'capture' => true, 'shot' => true];
                                        }
                                        break;
                                    }
                                    $wx += $dx;
                                    $wy += $dy;
                                }
                                break;
                            }
                            $q = self::bcAt($s, $tx, $ty);
                            if ($q === '.') {
                                $add($x, $y, $tx, $ty);
                            } else {
                                if (self::bcColor($q) !== $me) {
                                    $add($x, $y, $tx, $ty);
                                }
                                break;
                            }
                            if ($t === 'T') {
                                break;
                            }
                            $tx += $dx;
                            $ty += $dy;
                        }
                    }
                } elseif ($k === 'I' || $k === 'U' || $k === 'W') {
                    if ($k === 'I' && !self::bcLand($x, $y)) {
                        foreach ($kings as [$dx, $dy]) {
                            if ($landOk($x + $dx, $y + $dy)) {
                                $add($x, $y, $x + $dx, $y + $dy);
                            }
                        }
                    } else {
                        $reach = $k === 'U' ? 5 : ($k === 'W' ? 1 : 4);
                        foreach ($kings as [$dx, $dy]) {
                            for ($step = 1; $step <= $reach; $step++) {
                                $tx = $x + $dx * $step;
                                $ty = $y + $dy * $step;
                                if (!self::bcIn($tx, $ty)) {
                                    break;
                                }
                                $t = self::bcTerrain($tx, $ty);
                                if ($t === 'M' || self::bcHot($s, $tx, $ty)) {
                                    break;
                                }
                                $q = self::bcAt($s, $tx, $ty);
                                if ($t === 'W') {
                                    if ($k === 'I' && self::bcKind($q) === 'F' && self::bcColor($q) !== $me) {
                                        $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($tx, $ty), 'capture' => true, 'board' => true];
                                    }
                                    break;
                                }
                                if ($k === 'U') {
                                    if ($q !== '.') {
                                        break;
                                    }
                                    $add($x, $y, $tx, $ty);
                                    if ($t === 'T') {
                                        break;
                                    }
                                    continue;
                                }
                                if ($q === '.' || $q === 'H') {
                                    $add($x, $y, $tx, $ty);
                                } else {
                                    if (self::bcColor($q) !== $me && self::bcKind($q) !== 'F') {
                                        $add($x, $y, $tx, $ty);
                                    }
                                    break;
                                }
                                if ($t === 'T') {
                                    break;
                                }
                            }
                        }
                        if ($k === 'W') {
                            for ($dy = -3; $dy <= 3; $dy++) {
                                for ($dx = -3; $dx <= 3; $dx++) {
                                    $rad = max(abs($dx), abs($dy));
                                    if ($rad < 2 || $rad > 3) {
                                        continue;
                                    }
                                    $q = self::bcAt($s, $x + $dx, $y + $dy);
                                    if (self::bcColor($q) === null || self::bcColor($q) === $me || self::bcKind($q) === 'K' || self::bcKind($q) === 'F') {
                                        continue;
                                    }
                                    $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($x + $dx, $y + $dy), 'capture' => false, 'charm' => true];
                                }
                            }
                        }
                    }
                } elseif ($k === 'F') {
                    $mate = self::bcMate($s, $x, $y);
                    if ($mate === null) {
                        continue;
                    }
                    $cellsOf = [[$x, $y], $mate];
                    foreach (self::BC_ORTH as [$dx, $dy]) {
                        for ($k2 = 1; $k2 < 30; $k2++) {
                            $blocked = false;
                            $hit = false;
                            foreach ($cellsOf as [$cx, $cy]) {
                                $nx = $cx + $dx * $k2;
                                $ny = $cy + $dy * $k2;
                                if (!self::bcWater($nx, $ny)) {
                                    $blocked = true;
                                    break;
                                }
                                $q = self::bcAt($s, $nx, $ny);
                                if ($q !== '.' && $q !== $p) {
                                    if (self::bcKind($q) === 'F' && self::bcColor($q) !== $me) {
                                        $hit = true;
                                    } else {
                                        $blocked = true;
                                    }
                                }
                            }
                            if ($blocked) {
                                break;
                            }
                            $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($x + $dx * $k2, $y + $dy * $k2), 'capture' => $hit, 'ship' => [self::bcSq($x, $y), self::bcSq($mate[0], $mate[1])]];
                            if ($hit) {
                                break;
                            }
                        }
                    }
                    $tg = [];
                    self::bcCannon($s, $x, $y, $me, $tg);
                    foreach ($tg as [$tx, $ty]) {
                        $out[] = ['from' => self::bcSq($x, $y), 'to' => self::bcSq($tx, $ty), 'capture' => true, 'shot' => true];
                    }
                }
            }
        }
        return $out;
    }

    public static function bcApply(array $s, array $m): array
    {
        $c = [];
        foreach ($s['cells'] as $row) {
            $c[] = $row;
        }
        [$fx, $fy] = self::bcPos($m['from']);
        [$tx, $ty] = self::bcPos($m['to']);
        $p = self::bcAt($s, $fx, $fy);
        $target = self::bcAt($s, $tx, $ty);
        $sink = static function (int $x, int $y) use (&$c, $s): void {
            $q = self::bcAt($s, $x, $y);
            $mate = self::bcMate($s, $x, $y);
            self::bcPut($c, $x, $y, '.');
            if ($mate !== null && self::bcAt($s, $mate[0], $mate[1]) === $q) {
                self::bcPut($c, $mate[0], $mate[1], '.');
            }
        };
        if (!empty($m['charm'])) {
            self::bcPut($c, $tx, $ty, $target === strtoupper($target) ? strtolower($target) : strtoupper($target));
        } elseif (!empty($m['board'])) {
            $sink($tx, $ty);
            self::bcPut($c, $fx, $fy, '.');
            self::bcPut($c, $tx, $ty, $p);
        } elseif (!empty($m['shot'])) {
            if (self::bcKind($target) === 'F') {
                $sink($tx, $ty);
            } else {
                self::bcPut($c, $tx, $ty, '.');
            }
        } elseif (!empty($m['ship'])) {
            $cells = array_map(static fn (string $q): array => self::bcPos($q), $m['ship']);
            $dx = $tx - $fx;
            $dy = $ty - $fy;
            foreach ($cells as [$x, $y]) {
                $q = self::bcAt($s, $x + $dx, $y + $dy);
                if ($q !== '.' && self::bcKind($q) === 'F' && self::bcColor($q) !== self::bcColor($p)) {
                    $sink($x + $dx, $y + $dy);
                }
            }
            foreach ($cells as [$x, $y]) {
                self::bcPut($c, $x, $y, '.');
            }
            foreach ($cells as [$x, $y]) {
                self::bcPut($c, $x + $dx, $y + $dy, $p);
            }
        } else {
            self::bcPut($c, $fx, $fy, '.');
            $np = $p;
            if (!empty($m['promo'])) {
                $np = self::bcColor($p) === 'w' ? strtoupper($m['promo']) : $m['promo'];
            }
            self::bcPut($c, $tx, $ty, $np);
            if (!empty($m['ep'])) {
                self::bcPut($c, $tx, $fy, '.');
            }
            if ($target === 'H' && self::bcColor($p) !== null) {
                self::bcSpawn($c, self::bcColor($p), self::bcNext($s['full'] * 100 + $fx * 17 + $fy));
            }
        }
        $lava = [];
        foreach (($s['lava'] ?? []) as $sq => $n) {
            if ((int) $n > 1) {
                $lava[$sq] = (int) $n - 1;
            }
        }
        $storm = self::bcRage($c, $lava, (int) $s['full']);
        $pawnOrCap = self::bcKind($p) === 'P' || !empty($m['capture']) || !empty($m['chest']) || $storm !== '';
        return [
            'cells' => $c,
            'turn' => $s['turn'] === 'w' ? 'b' : 'w',
            'ep' => !empty($m['double']) ? self::bcSq($fx, intdiv($fy + $ty, 2)) : null,
            'half' => $pawnOrCap ? 0 : $s['half'] + 1,
            'full' => $s['full'] + ($s['turn'] === 'b' ? 1 : 0),
            'lava' => $lava,
            'storm' => $storm,
        ];
    }

    private static function bcCell(array $c, int $x, int $y): string
    {
        return self::bcIn($x, $y) ? $c[self::BC_Y1 - $y][$x - self::BC_X0] : '#';
    }

    /** Tornado and volcano. Keep the rolls identical to rage() in battlechess.ts. */
    private static function bcRage(array &$c, array &$lava, int $full): string
    {
        $seed = ($full * 997 + 13) % 2147483647 ?: 1;
        foreach ($c as $row) {
            foreach ($row as $ch) {
                $seed = self::bcNext($seed + ord($ch));
            }
        }
        $storm = '';
        $seed = self::bcNext($seed);
        if ($seed % 100 < 45) {
            $storm .= 'T';
            $pcs = [];
            for ($y = 1; $y <= 8; $y++) {
                for ($x = 0; $x <= 13; $x++) {
                    $q = self::bcCell($c, $x, $y);
                    if ($q === '.' || $q === 'H' || self::bcKind($q) === 'K' || self::bcKind($q) === 'F' || !self::bcLand($x, $y)) {
                        continue;
                    }
                    $pcs[] = [$x, $y];
                }
            }
            if ($pcs) {
                $seed = self::bcNext($seed);
                [$cx, $cy] = $pcs[$seed % count($pcs)];
                $seed = self::bcNext($seed);
                $dirs = array_merge(self::BC_ORTH, self::BC_DIAG);
                [$dx, $dy] = $dirs[$seed % 8];
                $seed = self::bcNext($seed);
                $who = self::bcCell($c, $cx, $cy);
                for ($i = 0, $dist = 1 + ($seed % 3); $i < $dist; $i++) {
                    $nx = $cx + $dx;
                    $ny = $cy + $dy;
                    if (!self::bcIn($nx, $ny)) {
                        break;
                    }
                    $t = self::bcTerrain($nx, $ny);
                    if ($t === 'W') {
                        self::bcPut($c, $cx, $cy, '.');
                        break;
                    }
                    if ($t === 'M' || self::bcCell($c, $nx, $ny) !== '.') {
                        break;
                    }
                    self::bcPut($c, $cx, $cy, '.');
                    self::bcPut($c, $nx, $ny, $who);
                    $cx = $nx;
                    $cy = $ny;
                    if ($t === 'T') {
                        break;
                    }
                }
            }
        }
        $seed = self::bcNext($seed);
        if ($seed % 100 < 28) {
            $storm .= 'V';
            $seed = self::bcNext($seed);
            $mountains = [[[0, 7], [1, 7], [0, 8], [1, 8]], [[12, 1], [13, 1], [12, 2], [13, 2]]];
            $mount = $mountains[$seed % 2];
            foreach ($mount as [$mx, $my]) {
                if (self::bcKind(self::bcCell($c, $mx, $my)) === 'E') {
                    self::bcPut($c, $mx, $my, '.');
                }
            }
            $neighbors = [];
            foreach ($mount as [$mx, $my]) {
                foreach (array_merge(self::BC_ORTH, self::BC_DIAG) as [$dx, $dy]) {
                    $nx = $mx + $dx;
                    $ny = $my + $dy;
                    if (!self::bcLand($nx, $ny)) {
                        continue;
                    }
                    foreach ($neighbors as [$a, $b]) {
                        if ($a === $nx && $b === $ny) {
                            continue 2;
                        }
                    }
                    $neighbors[] = [$nx, $ny];
                }
            }
            $seed = self::bcNext($seed);
            $hits = $neighbors ? 1 + ($seed % min(3, count($neighbors))) : 0;
            for ($i = 0; $i < $hits; $i++) {
                $seed = self::bcNext($seed);
                $idx = $seed % count($neighbors);
                [$nx, $ny] = $neighbors[$idx];
                array_splice($neighbors, $idx, 1);
                self::bcPut($c, $nx, $ny, '.');
                $lava[self::bcSq($nx, $ny)] = 3;
            }
        }
        return $storm;
    }

    private static function bcSpawn(array &$c, string $me, int $seed): void
    {
        $pool = ['Q', 'R', 'N', 'C', 'E', 'A', 'I', 'W', 'U'];
        $spots = [];
        for ($y = 1; $y <= 8; $y++) {
            for ($x = 0; $x <= 13; $x++) {
                if (!self::bcLand($x, $y) || self::bcCell($c, $x, $y) !== '.') {
                    continue;
                }
                if ($me === 'w' ? $y < 5 : $y > 4) {
                    continue;
                }
                $spots[] = [$x, $y];
            }
        }
        if (!$spots) {
            return;
        }
        $seed = self::bcNext($seed);
        [$x, $y] = $spots[$seed % count($spots)];
        $seed = self::bcNext($seed);
        $troop = $pool[$seed % count($pool)];
        self::bcPut($c, $x, $y, $me === 'w' ? $troop : strtolower($troop));
    }

    public static function bcLegal(array $s): array
    {
        $out = [];
        foreach (self::bcPseudo($s) as $m) {
            if (!self::bcInCheck(self::bcApply($s, $m), $s['turn'])) {
                $out[] = $m;
            }
        }
        return $out;
    }

    public static function bcSan(array $s, array $m): string
    {
        [$fx, $fy] = self::bcPos($m['from']);
        $p = self::bcKind(self::bcAt($s, $fx, $fy));
        $n = self::bcApply($s, $m);
        $chk = self::bcInCheck($n, $n['turn']) ? (count(self::bcLegal($n)) > 0 ? '+' : '#') : '';
        $letter = $p === 'P' ? '' : $p;
        return $letter . $m['from'] . (!empty($m['shot']) ? '*' : (!empty($m['capture']) ? 'x' : '-')) . $m['to'] . (!empty($m['promo']) ? '=' . strtoupper($m['promo']) : '') . $chk;
    }

    public static function bcStatus(array $s): array
    {
        if (self::bcKing($s, $s['turn']) === null) {
            return ['over' => true, 'winner' => $s['turn'] === 'w' ? 'b' : 'w', 'reason' => 'king-lost'];
        }
        if (count(self::bcLegal($s)) === 0) {
            return self::bcInCheck($s, $s['turn'])
                ? ['over' => true, 'winner' => $s['turn'] === 'w' ? 'b' : 'w', 'reason' => 'checkmate']
                : ['over' => true, 'winner' => null, 'reason' => 'stalemate'];
        }
        if ($s['half'] >= 100) {
            return ['over' => true, 'winner' => null, 'reason' => 'fifty-moves'];
        }
        if ($s['full'] > 200) {
            return ['over' => true, 'winner' => null, 'reason' => 'move-limit'];
        }
        return ['over' => false];
    }

    /** The legal move from -> to (a promotion picks $promo, default queen). */
    public static function bcFind(array $s, string $from, string $to, ?string $promo = null): ?array
    {
        $c = array_values(array_filter(self::bcLegal($s), static fn (array $m): bool => $m['from'] === $from && $m['to'] === $to));
        if (!$c) {
            return null;
        }
        $want = $promo ?? (!empty($c[0]['promo']) ? 'q' : null);
        foreach ($c as $m) {
            if (($m['promo'] ?? null) === $want) {
                return $m;
            }
        }
        return $c[0];
    }

    private static function bcEvaluate(array $s, string $side): int
    {
        $sc = 0.0;
        for ($y = self::BC_Y0; $y <= self::BC_Y1; $y++) {
            for ($x = self::BC_X0; $x <= self::BC_X1; $x++) {
                $p = self::bcAt($s, $x, $y);
                if ($p === '.') {
                    continue;
                }
                $col = self::bcColor($p);
                if ($col === null) {
                    continue;
                }
                $k = self::bcKind($p);
                $v = $k === 'F' ? self::BC_VAL['F'] / 2 : self::BC_VAL[$k];
                if ($k === 'P') {
                    $v += ($col === 'w' ? 7 - $y : $y - 2) * 8;
                }
                if ($k === 'N' || $k === 'B' || $k === 'E' || $k === 'A') {
                    $v += 12 - abs(6.5 - $x) * 2 - abs(4.5 - $y) * 2;
                }
                $sc += $col === $side ? $v : -$v;
            }
        }
        return (int) round($sc);
    }

    // ───────────────────────── MorseBot ─────────────────────────

    private const XQ_VALUE = ['K' => 0, 'A' => 20, 'E' => 20, 'H' => 40, 'R' => 90, 'C' => 45, 'P' => 10];

    /** Score from $side's point of view. */
    private static function evaluate(string $v, array $s, string $side): int
    {
        $score = 0;
        if ($v === 'battlechess') {
            return self::bcEvaluate($s, $side);
        }
        if ($v === 'checkers') {
            for ($r = 0; $r < 8; $r++) {
                for ($f = 0; $f < 8; $f++) {
                    $c = $s['board'][$r][$f];
                    if ($c === null) {
                        continue;
                    }
                    $king = $c === 'K' || $c === 'k';
                    $col = self::ckColor($c);
                    $adv = $col === 'w' ? $r : 7 - $r;
                    $val = $king ? 175 : 100 + $adv * 4;
                    if ($f === 0 || $f === 7) {
                        $val += 3; // edge men are hard to take
                    }
                    if (!$king && $adv === 0) {
                        $val += 6; // keep the back row guarded
                    }
                    $score += $col === $side ? $val : -$val;
                }
            }
            return $score;
        }
        for ($r = 0; $r <= 9; $r++) {
            for ($f = 0; $f <= 8; $f++) {
                $c = $s['board'][$r][$f];
                if ($c === null) {
                    continue;
                }
                $k = strtoupper($c);
                $col = self::xqColor($c);
                $val = self::XQ_VALUE[$k] * 10;
                if ($k === 'P' && !self::xqOwnSide($r, $col)) {
                    $val += 100 + (4 - abs(4 - $f)) * 10; // crossed the river, better near the middle
                }
                if ($k === 'H' || $k === 'C' || $k === 'R') {
                    $val += (4 - abs(4 - $f)) * 4;
                }
                $score += $col === $side ? $val : -$val;
            }
        }
        return $score;
    }

    private static function legalOf(string $v, array $s): array
    {
        if ($v === 'battlechess') {
            return self::bcLegal($s);
        }
        return $v === 'checkers' ? self::ckLegal($s) : self::xqLegal($s);
    }

    private static function playOf(string $v, array $s, array $m): array
    {
        if ($v === 'battlechess') {
            return self::bcApply($s, $m);
        }
        return $v === 'checkers' ? self::ckPlay($s, $m)['state'] : self::xqPlay($s, $m)['state'];
    }

    private static float $deadline = 0.0;
    private static bool $timeUp = false;

    private static function search(string $v, array $s, int $depth, int $alpha, int $beta, string $side): int
    {
        if (microtime(true) > self::$deadline) {
            self::$timeUp = true;
            return 0;
        }
        $moves = self::legalOf($v, $s);
        $mine = $s['turn'] === $side;
        if (!$moves) {
            // Battle Chess: stalemate is a draw; otherwise no moves = that side loses
            if ($v === 'battlechess' && !self::bcInCheck($s, $s['turn'])) {
                return 0;
            }
            return $mine ? -100000 - $depth : 100000 + $depth;
        }
        if ($v === 'battlechess' && $s['half'] >= 100) {
            return 0;
        }
        if ($depth <= 0) {
            return self::evaluate($v, $s, $side);
        }
        usort($moves, static fn (array $a, array $b): int => (int) (($b['capture'] ?? $b['jump'] ?? false) ? 1 : 0) - (int) (($a['capture'] ?? $a['jump'] ?? false) ? 1 : 0));
        if ($mine) {
            $best = -PHP_INT_MAX;
            foreach ($moves as $m) {
                $n = self::playOf($v, $s, $m);
                // a checkers multi-jump keeps the same side on move: same depth so the chain is seen whole
                $d = $n['turn'] === $s['turn'] ? $depth : $depth - 1;
                $best = max($best, self::search($v, $n, $d, $alpha, $beta, $side));
                $alpha = max($alpha, $best);
                if ($alpha >= $beta || self::$timeUp) {
                    break;
                }
            }
            return $best;
        }
        $best = PHP_INT_MAX;
        foreach ($moves as $m) {
            $n = self::playOf($v, $s, $m);
            $d = $n['turn'] === $s['turn'] ? $depth : $depth - 1;
            $best = min($best, self::search($v, $n, $d, $alpha, $beta, $side));
            $beta = min($beta, $best);
            if ($alpha >= $beta || self::$timeUp) {
                break;
            }
        }
        return $best;
    }

    /** MorseBot's move (null when there is none). @return array{from:string,to:string}|null */
    public static function botMove(string $v, string $fen, int $budgetMs = 900): ?array
    {
        $s = $v === 'battlechess' ? self::bcParse($fen) : ($v === 'checkers' ? self::ckParse($fen) : self::xqParse($fen));
        if ($s === null) {
            return null;
        }
        $moves = self::legalOf($v, $s);
        if ($v === 'battlechess') {
            // under-promotions only clutter the search; the server promotes to a queen
            $moves = array_values(array_filter($moves, static fn (array $m): bool => ($m['promo'] ?? 'q') === 'q'));
        }
        if (!$moves) {
            return null;
        }
        if (count($moves) === 1) {
            return ['from' => $moves[0]['from'], 'to' => $moves[0]['to']];
        }
        $side = $s['turn'];
        self::$deadline = microtime(true) + $budgetMs / 1000;
        shuffle($moves); // equal moves vary from game to game
        $best = $moves[0];
        for ($depth = 1; $depth <= 8; $depth++) {
            self::$timeUp = false;
            $bestHere = null;
            $bestScore = -PHP_INT_MAX;
            foreach ($moves as $m) {
                $n = self::playOf($v, $s, $m);
                $d = $n['turn'] === $s['turn'] ? $depth : $depth - 1;
                $sc = self::search($v, $n, $d, $bestScore, PHP_INT_MAX, $side);
                if (self::$timeUp) {
                    break;
                }
                if ($sc > $bestScore) {
                    $bestScore = $sc;
                    $bestHere = $m;
                }
            }
            if (self::$timeUp) {
                break;
            }
            if ($bestHere !== null) {
                $best = $bestHere;
                // try the best move first next round
                usort($moves, static fn (array $a, array $b): int => ($b === $bestHere ? 1 : 0) - ($a === $bestHere ? 1 : 0));
            }
            if ($bestScore > 90000) {
                break;
            }
        }
        return ['from' => $best['from'], 'to' => $best['to']];
    }
}
