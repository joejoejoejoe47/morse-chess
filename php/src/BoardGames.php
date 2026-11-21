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
    public const IDS = ['checkers', 'xiangqi'];
    public const START = [
        'checkers' => 'ck|1m1m1m1m/m1m1m1m1/1m1m1m1m/8/8/M1M1M1M1/1M1M1M1M/M1M1M1M1|w|-|0',
        'xiangqi' => 'xq|rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR|w|0',
    ];

    public static function is(string $v): bool
    {
        return in_array($v, self::IDS, true);
    }

    public static function validSquare(string $v, string $sq): bool
    {
        return $v === 'xiangqi' ? (bool) preg_match('/^[a-i][0-9]$/', $sq) : (bool) preg_match('/^[a-h][1-8]$/', $sq);
    }

    /** 'w' / 'b' / null: whose piece stands on $sq. */
    public static function colorAt(string $v, string $fen, string $sq): ?string
    {
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
    public static function tryMove(string $v, string $fen, string $from, string $to): ?array
    {
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

    // ───────────────────────── MorseBot ─────────────────────────

    private const XQ_VALUE = ['K' => 0, 'A' => 20, 'E' => 20, 'H' => 40, 'R' => 90, 'C' => 45, 'P' => 10];

    /** Score from $side's point of view. */
    private static function evaluate(string $v, array $s, string $side): int
    {
        $score = 0;
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
        return $v === 'checkers' ? self::ckLegal($s) : self::xqLegal($s);
    }

    private static function playOf(string $v, array $s, array $m): array
    {
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
            return $mine ? -100000 - $depth : 100000 + $depth; // no moves = that side loses (both games)
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
        $s = $v === 'checkers' ? self::ckParse($fen) : self::xqParse($fen);
        if ($s === null) {
            return null;
        }
        $moves = self::legalOf($v, $s);
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
