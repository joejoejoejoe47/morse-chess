#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Human fair-play review. Server shell only (there is no web page or API for this on purpose).
 *   php php/bin/fairplay-review.php list
 *   php php/bin/fairplay-review.php show <username>
 *   php php/bin/fairplay-review.php clear <username> --reviewer NAME [--note "..."]
 *   php php/bin/fairplay-review.php action <username> --reviewer NAME [--ban] [--forfeit-rating] [--forfeit-coins] [--refund-opponents] [--note "..."]
 * Nothing is ever done automatically: flagged accounts just wait in the list until a person decides.
 */

require __DIR__ . '/../src/bootstrap.php';

use Morse\Db;
use Morse\FairPlay;

if (PHP_SAPI !== 'cli') {
    exit(1);
}
$cmd = $argv[1] ?? 'list';
$name = $argv[2] ?? '';
$opt = static function (string $flag) use ($argv): ?string {
    $i = array_search($flag, $argv, true);
    return $i === false ? null : (string) ($argv[$i + 1] ?? '');
};
$has = static fn (string $flag): bool => in_array($flag, $argv, true);
Db::ensureSchema();
$uidOf = static function (string $name): string {
    $id = Db::value('SELECT user_id FROM profiles WHERE username_lc = ? LIMIT 1', [strtolower($name)]);
    if ($id === null) {
        fwrite(STDERR, "No player called $name\n");
        exit(1);
    }
    return (string) $id;
};
switch ($cmd) {
    case 'list':
        foreach (FairPlay::queue() as $r) {
            printf("%-20s score %3d  games %3d  flagged %s  %s\n", $r['username'] ?? $r['user_id'], $r['score'], $r['games'], $r['flagged_at'], $r['signals']);
        }
        break;
    case 'show':
        $uid = $uidOf($name);
        echo json_encode([
            'account' => Db::one('SELECT * FROM fairplay_accounts WHERE user_id = ?', [$uid]),
            'games' => Db::all('SELECT * FROM fairplay_games WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [$uid]),
            'actions' => Db::all('SELECT * FROM fairplay_actions WHERE user_id = ? ORDER BY id DESC', [$uid]),
        ], JSON_PRETTY_PRINT) . "\n";
        break;
    case 'clear':
    case 'action':
        $reviewer = (string) $opt('--reviewer');
        $done = FairPlay::review($uidOf($name), $cmd, $reviewer, (string) $opt('--note'), [
            'ban' => $has('--ban'),
            'forfeitRating' => $has('--forfeit-rating'),
            'forfeitCoins' => $has('--forfeit-coins'),
            'refundOpponents' => $has('--refund-opponents'),
        ]);
        echo json_encode($done, JSON_PRETTY_PRINT) . "\n";
        break;
    default:
        fwrite(STDERR, "Commands: list | show | clear | action\n");
        exit(1);
}
