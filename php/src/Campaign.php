<?php

declare(strict_types=1);

namespace Morse;

/**
 * Morse Chess Legendary Campaign (owner t381u).
 *
 *  - Persistent Army: one row per starting piece (16 slots: "ra","nb","bc","q","k","bf","ng","rh",
 *    "pa".."ph"). Pieces earn XP in campaign boss games (reported by the client, capped) and in the
 *    player's real finished games (replayed here from game_moves, so those cannot be faked).
 *  - Levels 1..10 from XP; tiers wood/bronze/silver/obsidian/gold; the perk slot opens at level 3.
 *  - Campaign: chapters 1..5, each unlocked by clearing the one before. First clear grants the
 *    chapter rewards (a real board in owned_boards, a frame in owned_gear, the rest in
 *    campaign_rewards). Rook "Batter" pays +15 coins per rook capture, at most 3 per run.
 */
final class Campaign
{
    public const SLOTS = ['ra', 'nb', 'bc', 'q', 'k', 'bf', 'ng', 'rh', 'pa', 'pb', 'pc', 'pd', 'pe', 'pf', 'pg', 'ph'];
    public const LEVELS = [0, 40, 100, 180, 290, 430, 600, 800, 1050, 1350];
    public const PERK_LEVEL = 3;
    /** Chapters that can be played right now (shipped in phases). */
    public const OPEN = 5;
    public const BATTER_COINS = 15;
    public const BATTER_MAX = 3;
    /** A boss win must take at least this long (client clock is not trusted). */
    public const MIN_WIN_SECONDS = 25;
    public const MIN_WIN_PLIES = 12;
    /** Real games replayed per state read (oldest first). */
    public const SYNC_BATCH = 25;

    /** chapter => rewards. 'board' goes to owned_boards, 'gear' to owned_gear, 'items' to campaign_rewards. */
    public const CHAPTERS = [
        1 => ['board' => 'steampunk-brass', 'gear' => 'gear', 'items' => ['gear-frame'], 'coins' => 25],
        2 => ['board' => 'crystal-palace', 'gear' => null, 'items' => ['crowned-pawn'], 'coins' => 30],
        3 => ['board' => 'obsidian-fortress', 'gear' => null, 'items' => ['siege-aura'], 'coins' => 35],
        4 => ['board' => 'ghostfire', 'gear' => null, 'items' => ['spectral-trail'], 'coins' => 40],
        5 => ['board' => 'legendary-core', 'gear' => null, 'items' => ['golden-bot'], 'coins' => 60],
    ];

    /** Gear and boards that are campaign rewards only (never sold). */
    public const REWARD_BOARDS = ['steampunk-brass', 'crystal-palace', 'obsidian-fortress', 'ghostfire', 'legendary-core'];
    public const REWARD_GEAR = ['gear'];

    public static function register(): void
    {
        foreach (['campaignState', 'startCampaignRun', 'finishCampaignRun', 'setArmyPerk', 'createRaid', 'joinRaid', 'getRaid', 'raidMove', 'leaveRaid', 'claimRaid', 'saveArena', 'getArena', 'myArenas', 'arenaResult'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    public static function levelFor(int $xp): int
    {
        $lv = 1;
        foreach (self::LEVELS as $i => $need) {
            if ($xp >= $need) {
                $lv = $i + 1;
            }
        }
        return $lv;
    }

    /**
     * XP for one piece in one game.
     * @param array{alive?:bool,checks?:int,cap?:int,capUp?:int,mate?:bool,promo?:bool} $st
     */
    public static function xpFor(array $st, string $result, bool $boss = false): int
    {
        $x = 0;
        if (!empty($st['alive'])) {
            $x += $result === 'win' ? 20 : ($result === 'draw' ? 10 : 5);
            if ($boss && $result === 'win') {
                $x += 10;
            }
        }
        $x += min(5, max(0, (int) ($st['checks'] ?? 0))) * 4;
        $x += min(8, max(0, (int) ($st['cap'] ?? 0))) * 3;
        $x += min(4, max(0, (int) ($st['capUp'] ?? 0))) * 10;
        if (!empty($st['mate'])) {
            $x += 40;
        }
        if (!empty($st['promo'])) {
            $x += 15;
        }
        return min(120, $x);
    }

    private static function ensureArmy(string $userId): void
    {
        $now = Db::now();
        Db::insertIgnore('campaign_meta', ['user_id' => $userId, 'synced_until' => $now, 'created_at' => $now]);
        foreach (self::SLOTS as $slot) {
            Db::insertIgnore('campaign_army', ['user_id' => $userId, 'slot' => $slot, 'xp' => 0, 'updated_at' => $now]);
        }
    }

    /**
     * Add one game's stats to the army.
     * @param array<string,array<string,mixed>> $stats slot => stats
     * @return array<string,array{xp:int,before:int,after:int}>
     */
    private static function award(string $userId, array $stats, string $result, bool $boss): array
    {
        $gains = [];
        $now = Db::now();
        foreach (self::SLOTS as $slot) {
            $st = $stats[$slot] ?? ['alive' => false];
            $xp = self::xpFor($st, $result, $boss);
            $row = Db::one('SELECT xp FROM campaign_army WHERE user_id = ? AND slot = ?', [$userId, $slot]);
            $before = (int) ($row['xp'] ?? 0);
            Db::run(
                'UPDATE campaign_army SET xp = xp + ?, games = games + 1, survived = survived + ?, captures = captures + ?,
                 big_captures = big_captures + ?, checks = checks + ?, mates = mates + ?, promos = promos + ?, updated_at = ?
                 WHERE user_id = ? AND slot = ?',
                [
                    $xp,
                    !empty($st['alive']) ? 1 : 0,
                    min(8, max(0, (int) ($st['cap'] ?? 0))),
                    min(4, max(0, (int) ($st['capUp'] ?? 0))),
                    min(5, max(0, (int) ($st['checks'] ?? 0))),
                    !empty($st['mate']) ? 1 : 0,
                    // promotions only count for pawns, once per game
                    ($slot[0] === 'p' && !empty($st['promo'])) ? 1 : 0,
                    $now,
                    $userId,
                    $slot,
                ]
            );
            if ($xp > 0) {
                $gains[$slot] = ['xp' => $xp, 'before' => self::levelFor($before), 'after' => self::levelFor($before + $xp)];
            }
        }
        return $gains;
    }

    /**
     * Replay a finished normal game and return per-slot stats for $userId's side.
     * @return array<string,array<string,mixed>>|null null when the moves cannot be replayed
     */
    public static function statsFromMoves(array $moves, string $side): ?array
    {
        $c = new Chess();
        $who = [];
        $homeBack = $side === 'w' ? '1' : '8';
        $homePawn = $side === 'w' ? '2' : '7';
        $files = 'abcdefgh';
        $back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
        for ($f = 0; $f < 8; $f++) {
            $k = $back[$f];
            $who[$files[$f] . $homeBack] = ($k === 'q' || $k === 'k') ? $k : $k . $files[$f];
            $who[$files[$f] . $homePawn] = 'p' . $files[$f];
        }
        $st = [];
        foreach (self::SLOTS as $s) {
            $st[$s] = ['alive' => true, 'checks' => 0, 'cap' => 0, 'capUp' => 0, 'mate' => false, 'promo' => false];
        }
        $val = ['p' => 1, 'n' => 3, 'b' => 3, 'r' => 5, 'q' => 9, 'k' => 4];
        $kindOf = static fn (string $slot): string => $slot === 'q' || $slot === 'k' ? $slot : $slot[0];
        foreach ($moves as $mv) {
            $from = (string) $mv['from_sq'];
            $to = (string) $mv['to_sq'];
            $san = (string) $mv['san'];
            $arr = ['from' => $from, 'to' => $to];
            if (preg_match('/=([QRBN])/i', $san, $mm)) {
                $arr['promotion'] = strtolower($mm[1]);
            }
            $turn = $c->turn();
            $r = $c->move($arr, false);
            if ($r === null) {
                return null;
            }
            $flags = (string) ($r['flags'] ?? '');
            if ($turn === $side) {
                $slot = $who[$from] ?? null;
                unset($who[$from]);
                if ($slot !== null) {
                    $who[$to] = $slot;
                    if ($r['captured'] !== null) {
                        $st[$slot]['cap']++;
                        $mine = $r['promotion'] !== null ? 1 : $val[$kindOf($slot)];
                        if (($val[$r['captured']] ?? 0) > $mine) {
                            $st[$slot]['capUp']++;
                        }
                    }
                    if ($r['promotion'] !== null) {
                        $st[$slot]['promo'] = true;
                    }
                    if ($c->isCheck()) {
                        $st[$slot]['checks']++;
                        if ($c->isCheckmate()) {
                            $st[$slot]['mate'] = true;
                        }
                    }
                }
                if (str_contains($flags, 'k') || str_contains($flags, 'q')) {
                    $rank = $side === 'w' ? '1' : '8';
                    [$rf, $rt] = str_contains($flags, 'k') ? ['h' . $rank, 'f' . $rank] : ['a' . $rank, 'd' . $rank];
                    if (isset($who[$rf])) {
                        $who[$rt] = $who[$rf];
                        unset($who[$rf]);
                    }
                }
            } else {
                $victim = $to;
                if (str_contains($flags, 'e')) {
                    $victim = $to[0] . $from[1];
                }
                if (isset($who[$victim])) {
                    $st[$who[$victim]]['alive'] = false;
                    unset($who[$victim]);
                }
            }
        }
        return $st;
    }

    /** Replay the player's newly finished normal games into the army. @return array<string,int> slot => xp gained */
    private static function sync(string $userId): array
    {
        $meta = Db::one('SELECT synced_until FROM campaign_meta WHERE user_id = ?', [$userId]);
        $since = (string) ($meta['synced_until'] ?? Db::now());
        $games = Db::all(
            "SELECT id, white_user_id, black_user_id, status, winner_user_id, created_at FROM games
             WHERE (white_user_id = ? OR black_user_id = ?) AND status <> 'active' AND variant = '' AND created_at > ?
             ORDER BY created_at ASC LIMIT " . self::SYNC_BATCH,
            [$userId, $userId, $since]
        );
        $total = [];
        $last = $since;
        foreach ($games as $g) {
            $last = (string) $g['created_at'];
            $status = (string) $g['status'];
            if (!in_array($status, ['white_win', 'black_win', 'draw', 'checkmate', 'resigned', 'timeout', 'stalemate', 'finished'], true)
                && $g['winner_user_id'] === null) {
                continue;
            }
            $moves = Db::all('SELECT san, from_sq, to_sq FROM game_moves WHERE game_id = ? ORDER BY ply ASC', [(string) $g['id']]);
            if (count($moves) < 10) {
                continue;
            }
            $side = (string) $g['white_user_id'] === $userId ? 'w' : 'b';
            $stats = self::statsFromMoves($moves, $side);
            if ($stats === null) {
                continue;
            }
            $winner = $g['winner_user_id'] !== null ? (string) $g['winner_user_id'] : null;
            $result = $winner === null ? 'draw' : ($winner === $userId ? 'win' : 'loss');
            foreach (self::award($userId, $stats, $result, false) as $slot => $gain) {
                $total[$slot] = ($total[$slot] ?? 0) + $gain['xp'];
            }
        }
        if ($last !== $since) {
            Db::run('UPDATE campaign_meta SET synced_until = ? WHERE user_id = ?', [$last, $userId]);
        }
        return $total;
    }

    /** @return list<array<string,mixed>> */
    private static function army(string $userId): array
    {
        $rows = Db::all('SELECT * FROM campaign_army WHERE user_id = ?', [$userId]);
        $by = [];
        foreach ($rows as $r) {
            $by[(string) $r['slot']] = $r;
        }
        $out = [];
        foreach (self::SLOTS as $slot) {
            $r = $by[$slot] ?? [];
            $xp = (int) ($r['xp'] ?? 0);
            $out[] = [
                'slot' => $slot,
                'xp' => $xp,
                'level' => self::levelFor($xp),
                'games' => (int) ($r['games'] ?? 0),
                'survived' => (int) ($r['survived'] ?? 0),
                'captures' => (int) ($r['captures'] ?? 0),
                'bigCaptures' => (int) ($r['big_captures'] ?? 0),
                'checks' => (int) ($r['checks'] ?? 0),
                'mates' => (int) ($r['mates'] ?? 0),
                'promos' => (int) ($r['promos'] ?? 0),
                'perkOn' => (int) ($r['perk_on'] ?? 1) === 1,
            ];
        }
        return $out;
    }

    /** @return list<int> */
    private static function cleared(string $userId): array
    {
        return array_map('intval', array_column(
            Db::all('SELECT chapter FROM campaign_progress WHERE user_id = ? AND cleared_at IS NOT NULL ORDER BY chapter', [$userId]),
            'chapter'
        ));
    }

    private static function unlocked(string $userId, int $chapter): bool
    {
        if ($chapter < 1 || $chapter > self::OPEN) {
            return false;
        }
        return $chapter === 1 || self::isOwner($userId) || in_array($chapter - 1, self::cleared($userId), true);
    }

    /** The owner (MasterGus) can open every chapter to check it (owner t394u); everyone else unlocks them in order. */
    private static function isOwner(string $userId): bool
    {
        $name = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]) ?? '');
        return $name !== '' && Catalog::isMasterUsername($name);
    }

    /** @param array<string,mixed> $data */
    public static function campaignState(string $userId, array $data): mixed
    {
        self::ensureArmy($userId);
        $gained = Db::transaction(static fn (): array => self::sync($userId));
        $progress = Db::all('SELECT chapter, wins, tries, best_plies, cleared_at FROM campaign_progress WHERE user_id = ?', [$userId]);
        $rewards = array_column(Db::all('SELECT reward_id FROM campaign_rewards WHERE user_id = ?', [$userId]), 'reward_id');
        $coins = (int) (Db::value('SELECT coins FROM profiles WHERE user_id = ?', [$userId]) ?? 0);
        return [
            'army' => self::army($userId),
            'levels' => self::LEVELS,
            'perkLevel' => self::PERK_LEVEL,
            'open' => self::OPEN,
            'cleared' => self::cleared($userId),
            'progress' => array_map(static fn (array $p): array => [
                'chapter' => (int) $p['chapter'],
                'wins' => (int) $p['wins'],
                'tries' => (int) $p['tries'],
                'bestPlies' => (int) $p['best_plies'],
            ], $progress),
            'rewards' => array_values(array_map('strval', $rewards)),
            'synced' => $gained,
            'coins' => $coins,
            'allOpen' => self::isOwner($userId),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function setArmyPerk(string $userId, array $data): mixed
    {
        $slot = (string) ($data['slot'] ?? '');
        if (!in_array($slot, self::SLOTS, true) || $slot === 'k') {
            throw new RpcError('That piece has no perk slot.');
        }
        self::ensureArmy($userId);
        $xp = (int) Db::value('SELECT xp FROM campaign_army WHERE user_id = ? AND slot = ?', [$userId, $slot]);
        if (self::levelFor($xp) < self::PERK_LEVEL) {
            throw new RpcError('The perk slot opens at level ' . self::PERK_LEVEL . '.');
        }
        Db::run('UPDATE campaign_army SET perk_on = ? WHERE user_id = ? AND slot = ?', [!empty($data['on']) ? 1 : 0, $userId, $slot]);
        return ['army' => self::army($userId)];
    }

    /** Slots whose perk is open and switched on. @return list<string> */
    private static function perkSlots(string $userId): array
    {
        $out = [];
        foreach (self::army($userId) as $a) {
            if ($a['slot'] !== 'k' && $a['level'] >= self::PERK_LEVEL && $a['perkOn']) {
                $out[] = (string) $a['slot'];
            }
        }
        return $out;
    }

    /** @param array<string,mixed> $data */
    public static function startCampaignRun(string $userId, array $data): mixed
    {
        $chapter = (int) ($data['chapter'] ?? 0);
        // The Legendary entry fee (LegendaryGate) also covers the campaign.
        if (class_exists(LegendaryGate::class) && !(LegendaryGate::legendaryAccess($userId, [])['unlocked'] ?? false)) {
            throw new RpcError('Unlock Morse Chess Legendary first.');
        }
        self::ensureArmy($userId);
        if (!self::unlocked($userId, $chapter)) {
            throw new RpcError($chapter > self::OPEN ? 'That chapter opens soon.' : 'Clear the chapter before it first.');
        }
        $now = Db::nowMs();
        // One open run at a time: older unfinished runs count as abandoned.
        Db::run("UPDATE campaign_runs SET finished_at = ?, result = 'left' WHERE user_id = ? AND finished_at IS NULL", [Db::ts($now), $userId]);
        $id = Util::uuid();
        Db::run('INSERT INTO campaign_runs (id, user_id, chapter, kind, started_at) VALUES (?, ?, ?, ?, ?)', [$id, $userId, $chapter, 'boss', Db::ts($now)]);
        Db::insertIgnore('campaign_progress', ['user_id' => $userId, 'chapter' => $chapter, 'wins' => 0, 'tries' => 0, 'best_plies' => 0]);
        Db::run('UPDATE campaign_progress SET tries = tries + 1 WHERE user_id = ? AND chapter = ?', [$userId, $chapter]);
        return ['runId' => $id, 'chapter' => $chapter, 'perks' => self::perkSlots($userId)];
    }

    /** @param array<string,mixed> $data */
    public static function finishCampaignRun(string $userId, array $data): mixed
    {
        $runId = (string) ($data['runId'] ?? '');
        $result = (string) ($data['result'] ?? '');
        if (!in_array($result, ['win', 'loss', 'draw'], true)) {
            throw new RpcError('Unknown result.');
        }
        $plies = max(0, min(1000, (int) ($data['plies'] ?? 0)));
        $raw = is_array($data['pieces'] ?? null) ? $data['pieces'] : [];
        $batter = max(0, min(self::BATTER_MAX, (int) ($data['batter'] ?? 0)));
        return Db::transaction(static function () use ($userId, $runId, $result, $plies, $raw, $batter): array {
            $run = Db::one('SELECT * FROM campaign_runs WHERE id = ? AND user_id = ?' . Db::forUpdate(), [$runId, $userId]);
            if ($run === null || $run['finished_at'] !== null) {
                throw new RpcError('That battle is already over.');
            }
            $chapter = (int) $run['chapter'];
            $startedMs = Db::toMs($run['started_at']);
            $elapsed = (Db::nowMs() - $startedMs) / 1000;
            if ($result === 'win' && ($elapsed < self::MIN_WIN_SECONDS || $plies < self::MIN_WIN_PLIES)) {
                $result = 'draw'; // too fast to be a real boss win
            }
            $stats = [];
            foreach (self::SLOTS as $slot) {
                $s = is_array($raw[$slot] ?? null) ? $raw[$slot] : [];
                $stats[$slot] = [
                    'alive' => !empty($s['alive']),
                    'checks' => (int) ($s['checks'] ?? 0),
                    'cap' => (int) ($s['cap'] ?? 0),
                    'capUp' => (int) ($s['capUp'] ?? 0),
                    'mate' => $result === 'win' && !empty($s['mate']),
                    'promo' => !empty($s['promo']),
                ];
            }
            // a short game (left early) only pays survival-free XP for what actually happened
            $gains = $plies >= 6 ? self::award($userId, $stats, $result, true) : [];
            $xp = array_sum(array_column($gains, 'xp'));
            $coins = 0;
            $perks = self::perkSlots($userId);
            if ($batter > 0 && $plies >= 6 && (in_array('ra', $perks, true) || in_array('rh', $perks, true))) {
                $coins += $batter * self::BATTER_COINS;
            }
            $firstClear = false;
            $rewards = [];
            if ($result === 'win') {
                Db::run('UPDATE campaign_progress SET wins = wins + 1, best_plies = CASE WHEN best_plies = 0 OR best_plies > ? THEN ? ELSE best_plies END WHERE user_id = ? AND chapter = ?', [$plies, $plies, $userId, $chapter]);
                $firstClear = Db::run('UPDATE campaign_progress SET cleared_at = ? WHERE user_id = ? AND chapter = ? AND cleared_at IS NULL', [Db::now(), $userId, $chapter]) > 0;
                if ($firstClear) {
                    $rewards = self::grant($userId, $chapter);
                    $coins += (int) self::CHAPTERS[$chapter]['coins'];
                }
            }
            if ($coins > 0) {
                Db::run('UPDATE profiles SET coins = coins + ? WHERE user_id = ?', [$coins, $userId]);
            }
            Db::run('UPDATE campaign_runs SET finished_at = ?, result = ?, plies = ?, xp = ?, coins = ? WHERE id = ?', [Db::now(), $result, $plies, $xp, $coins, $runId]);
            return [
                'result' => $result,
                'gains' => $gains,
                'xp' => $xp,
                'coins' => $coins,
                'firstClear' => $firstClear,
                'rewards' => $rewards,
                'army' => self::army($userId),
                'cleared' => self::cleared($userId),
            ];
        });
    }

    /** First-clear rewards. @return list<string> */
    private static function grant(string $userId, int $chapter): array
    {
        $c = self::CHAPTERS[$chapter] ?? null;
        if ($c === null) {
            return [];
        }
        $out = [];
        $row = Db::one('SELECT owned_boards, owned_gear FROM profiles WHERE user_id = ?', [$userId]);
        if ($row === null) {
            return [];
        }
        $boards = array_values(array_filter(array_map('trim', explode(',', (string) ($row['owned_boards'] ?? '')))));
        if ($c['board'] !== null && !in_array($c['board'], $boards, true)) {
            $boards[] = $c['board'];
            Db::run('UPDATE profiles SET owned_boards = ? WHERE user_id = ?', [implode(',', $boards), $userId]);
        }
        if ($c['board'] !== null) {
            $out[] = 'board:' . $c['board'];
        }
        $gear = array_values(array_filter(array_map('trim', explode(',', (string) ($row['owned_gear'] ?? '')))));
        if ($c['gear'] !== null && !in_array($c['gear'], $gear, true)) {
            $gear[] = $c['gear'];
            Db::run('UPDATE profiles SET owned_gear = ? WHERE user_id = ?', [implode(',', $gear), $userId]);
        }
        foreach ($c['items'] as $item) {
            Db::insertIgnore('campaign_rewards', ['user_id' => $userId, 'reward_id' => $item, 'created_at' => Db::now()]);
            $out[] = 'item:' . $item;
        }
        return $out;
    }
    // ── co-op raids (phase C) ───────────────────────────────────────────────

    public const RAID_IDLE_SECONDS = 60;      // the partner may take over a turn left this long
    public const RAID_MIN_WIN_SECONDS = 40;
    public const RAID_MIN_WIN_PLIES = 12;
    public const RAID_DAILY = 3;              // rewarded raids per player per day
    public const RAID_COINS = ['win' => 40, 'draw' => 15, 'loss' => 10];
    private const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    private static function needUnlock(string $userId): void
    {
        if (class_exists(LegendaryGate::class) && !(LegendaryGate::legendaryAccess($userId, [])['unlocked'] ?? false)) {
            throw new RpcError('Unlock Morse Chess Legendary first.');
        }
    }

    private static function nameOf(?string $userId): string
    {
        if ($userId === null || $userId === '') {
            return '';
        }
        return (string) (Db::value('SELECT username FROM profiles WHERE user_id = ? LIMIT 1', [$userId]) ?? '');
    }

    /** @param array<string,mixed> $data */
    public static function createRaid(string $userId, array $data): mixed
    {
        self::needUnlock($userId);
        self::ensureArmy($userId);
        // one lobby per host: close older unfinished raids of this host
        Db::run("UPDATE campaign_raids SET status = 'left', reason = 'The host started a new raid', finished_at = ? WHERE host_id = ? AND status IN ('lobby', 'active')", [Db::now(), $userId]);
        $id = Util::uuid();
        $code = '';
        for ($try = 0; $try < 20; $try++) {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_ABC[random_int(0, strlen(self::CODE_ABC) - 1)];
            }
            if ((int) Db::value('SELECT COUNT(*) FROM campaign_raids WHERE code = ?', [$code]) === 0) {
                break;
            }
        }
        $now = Db::now();
        Db::run('INSERT INTO campaign_raids (id, code, host_id, status, seed, moves, version, turn_since, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)', [$id, $code, $userId, 'lobby', random_int(1, 2000000000), '[]', $now, $now]);
        return self::raidView($id, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function joinRaid(string $userId, array $data): mixed
    {
        self::needUnlock($userId);
        self::ensureArmy($userId);
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($data['code'] ?? '')) ?? '');
        return Db::transaction(static function () use ($userId, $code): array {
            $r = Db::one('SELECT * FROM campaign_raids WHERE code = ?' . Db::forUpdate(), [$code]);
            if ($r === null) {
                throw new RpcError('No raid with that code.');
            }
            if ($r['host_id'] === $userId || $r['guest_id'] === $userId) {
                return self::raidView((string) $r['id'], $userId);
            }
            if ($r['status'] !== 'lobby' || $r['guest_id'] !== null) {
                throw new RpcError('That raid party is already full or finished.');
            }
            $now = Db::now();
            Db::run("UPDATE campaign_raids SET guest_id = ?, status = 'active', started_at = ?, turn_since = ?, version = version + 1 WHERE id = ?", [$userId, $now, $now, $r['id']]);
            return self::raidView((string) $r['id'], $userId);
        });
    }

    /** @return array<string,mixed> */
    private static function raidView(string $raidId, string $userId): array
    {
        $r = Db::one('SELECT * FROM campaign_raids WHERE id = ?', [$raidId]);
        if ($r === null || ($r['host_id'] !== $userId && $r['guest_id'] !== $userId)) {
            throw new RpcError('Raid not found.');
        }
        $claimed = Db::one('SELECT result, xp, coins FROM campaign_raid_rewards WHERE user_id = ? AND raid_id = ?', [$userId, $raidId]);
        return [
            'raidId' => (string) $r['id'],
            'code' => (string) $r['code'],
            'status' => (string) $r['status'],
            'reason' => (string) $r['reason'],
            'seed' => (int) $r['seed'],
            'moves' => json_decode((string) $r['moves'], true) ?: [],
            'version' => (int) $r['version'],
            'seat' => $r['host_id'] === $userId ? 'A' : 'B',
            'turn' => self::raidTurnSeat(json_decode((string) $r['moves'], true) ?: []),
            'host' => ['id' => (string) $r['host_id'], 'name' => self::nameOf((string) $r['host_id'])],
            'guest' => $r['guest_id'] ? ['id' => (string) $r['guest_id'], 'name' => self::nameOf((string) $r['guest_id'])] : null,
            'turnSince' => Db::toMs($r['turn_since']),
            'now' => Db::nowMs(),
            'idle' => self::RAID_IDLE_SECONDS,
            'claimed' => $claimed ? ['result' => (string) $claimed['result'], 'xp' => (int) $claimed['xp'], 'coins' => (int) $claimed['coins']] : null,
        ];
    }

    /** @param array<string,mixed> $data */
    public static function getRaid(string $userId, array $data): mixed
    {
        return self::raidView((string) ($data['raidId'] ?? ''), $userId);
    }

    /** @return array{from:int,to:int,promo:string,by:string} */
    private static function cleanMove(mixed $m, string $by): array
    {
        if (!is_array($m)) {
            throw new RpcError('Bad move.');
        }
        $from = (int) ($m['from'] ?? -1);
        $to = (int) ($m['to'] ?? -1);
        $promo = (string) ($m['promo'] ?? '');
        if ($from < 0 || $from > 63 || $to < 0 || $to > 63 || $from === $to || !in_array($promo, ['', 'q', 'r', 'b', 'n'], true)) {
            throw new RpcError('Bad move.');
        }
        return ['from' => $from, 'to' => $to, 'promo' => $promo, 'by' => $by];
    }

    /**
     * Play one human move (and the boss reply the mover computed). Seats alternate: A, boss, B, boss…
     * The partner can take over a turn that has been idle for RAID_IDLE_SECONDS.
     * @param array<string,mixed> $data
     */
    public static function raidMove(string $userId, array $data): mixed
    {
        $raidId = (string) ($data['raidId'] ?? '');
        $version = (int) ($data['version'] ?? -1);
        return Db::transaction(static function () use ($userId, $raidId, $version, $data): array {
            $r = Db::one('SELECT * FROM campaign_raids WHERE id = ?' . Db::forUpdate(), [$raidId]);
            if ($r === null || ($r['host_id'] !== $userId && $r['guest_id'] !== $userId)) {
                throw new RpcError('Raid not found.');
            }
            if ($r['status'] !== 'active') {
                throw new RpcError('This raid is not in progress.');
            }
            if ((int) $r['version'] !== $version) {
                throw new RpcError('Your partner already moved. Syncing…', 409);
            }
            $moves = json_decode((string) $r['moves'], true) ?: [];
            $turnSeat = self::raidTurnSeat($moves);
            $mySeat = $r['host_id'] === $userId ? 'A' : 'B';
            $idle = (Db::nowMs() - Db::toMs($r['turn_since'])) / 1000;
            if ($turnSeat !== $mySeat && $idle < self::RAID_IDLE_SECONDS) {
                throw new RpcError("It is your partner's turn.");
            }
            $moves[] = self::cleanMove($data['move'] ?? null, $mySeat);
            if (isset($data['boss']) && $data['boss'] !== null) {
                $moves[] = self::cleanMove($data['boss'], 'boss');
            }
            if (count($moves) > 600) {
                throw new RpcError('This raid has gone on too long.');
            }
            $status = 'active';
            $reason = '';
            $end = $data['end'] ?? null;
            if (is_array($end)) {
                $res = (string) ($end['result'] ?? '');
                $status = ['win' => 'won', 'loss' => 'lost', 'draw' => 'draw'][$res] ?? 'active';
                $reason = mb_substr((string) ($end['reason'] ?? ''), 0, 120);
                $elapsed = (Db::nowMs() - Db::toMs($r['started_at'] ?? $r['created_at'])) / 1000;
                if ($status === 'won' && ($elapsed < self::RAID_MIN_WIN_SECONDS || count($moves) < self::RAID_MIN_WIN_PLIES)) {
                    $status = 'draw';
                    $reason = 'Too quick to count as a raid win';
                }
            }
            $now = Db::now();
            Db::run(
                'UPDATE campaign_raids SET moves = ?, version = version + 1, turn_since = ?, status = ?, reason = ?, finished_at = ? WHERE id = ?',
                [json_encode($moves), $now, $status, $reason, $status === 'active' ? null : $now, $raidId]
            );
            return self::raidView($raidId, $userId);
        });
    }

    /** Seats alternate by who actually moved last (a take-over passes the turn on normally). */
    public static function raidTurnSeat(array $moves): string
    {
        for ($i = count($moves) - 1; $i >= 0; $i--) {
            $by = (string) ($moves[$i]['by'] ?? '');
            if ($by === 'A' || $by === 'B') {
                return $by === 'A' ? 'B' : 'A';
            }
        }
        return 'A';
    }

    /** @param array<string,mixed> $data */
    public static function leaveRaid(string $userId, array $data): mixed
    {
        $raidId = (string) ($data['raidId'] ?? '');
        $r = Db::one('SELECT host_id, guest_id, status FROM campaign_raids WHERE id = ?', [$raidId]);
        if ($r === null || ($r['host_id'] !== $userId && $r['guest_id'] !== $userId)) {
            throw new RpcError('Raid not found.');
        }
        if (in_array($r['status'], ['lobby', 'active'], true)) {
            $who = self::nameOf($userId);
            Db::run("UPDATE campaign_raids SET status = 'left', reason = ?, finished_at = ?, version = version + 1 WHERE id = ?", [$who . ' left the raid', Db::now(), $raidId]);
        }
        return self::raidView($raidId, $userId);
    }

    /**
     * Collect this player's reward for a finished raid: army XP and coins, once per raid,
     * at most RAID_DAILY rewarded raids a day.
     * @param array<string,mixed> $data
     */
    public static function claimRaid(string $userId, array $data): mixed
    {
        $raidId = (string) ($data['raidId'] ?? '');
        $raw = is_array($data['pieces'] ?? null) ? $data['pieces'] : [];
        return Db::transaction(static function () use ($userId, $raidId, $raw): array {
            $r = Db::one('SELECT * FROM campaign_raids WHERE id = ?', [$raidId]);
            if ($r === null || ($r['host_id'] !== $userId && $r['guest_id'] !== $userId)) {
                throw new RpcError('Raid not found.');
            }
            $result = ['won' => 'win', 'lost' => 'loss', 'draw' => 'draw'][(string) $r['status']] ?? null;
            if ($result === null) {
                throw new RpcError('This raid has no result to claim.');
            }
            $done = Db::one('SELECT result, xp, coins FROM campaign_raid_rewards WHERE user_id = ? AND raid_id = ?', [$userId, $raidId]);
            if ($done !== null) {
                return ['result' => (string) $done['result'], 'xp' => (int) $done['xp'], 'coins' => (int) $done['coins'], 'gains' => [], 'already' => true, 'capped' => false];
            }
            $moves = json_decode((string) $r['moves'], true) ?: [];
            $since = Db::ts(Db::nowMs() - 86400000);
            $today = (int) Db::value("SELECT COUNT(*) FROM campaign_raid_rewards WHERE user_id = ? AND created_at > ? AND (xp > 0 OR coins > 0)", [$userId, $since]);
            $gains = [];
            $coins = 0;
            $capped = $today >= self::RAID_DAILY;
            if (!$capped && count($moves) >= 6) {
                $stats = [];
                foreach (self::SLOTS as $slot) {
                    $st = is_array($raw[$slot] ?? null) ? $raw[$slot] : [];
                    $stats[$slot] = [
                        'alive' => !empty($st['alive']),
                        'checks' => (int) ($st['checks'] ?? 0),
                        'cap' => (int) ($st['cap'] ?? 0),
                        'capUp' => (int) ($st['capUp'] ?? 0),
                        'mate' => $result === 'win' && !empty($st['mate']),
                        'promo' => !empty($st['promo']),
                    ];
                }
                $gains = self::award($userId, $stats, $result, true);
                $coins = self::RAID_COINS[$result];
                Db::run('UPDATE profiles SET coins = coins + ? WHERE user_id = ?', [$coins, $userId]);
            }
            $xp = array_sum(array_column($gains, 'xp'));
            Db::insertIgnore('campaign_raid_rewards', ['user_id' => $userId, 'raid_id' => $raidId, 'result' => $result, 'xp' => $xp, 'coins' => $coins, 'created_at' => Db::now()]);
            return ['result' => $result, 'xp' => $xp, 'coins' => $coins, 'gains' => $gains, 'already' => false, 'capped' => $capped];
        });
    }

    // ── Arena builder (phase D) ─────────────────────────────────────────
    public const ARENA_MAX = 30;               // saved arenas per player
    private const ARENA_KINDS = ['q', 'r', 'b', 'n', 'p'];

    /**
     * Check and normalise a builder layout. Hazards live on ranks 3-6, boss reinforcements on ranks 5-6,
     * nothing may overlap, and the numbers stay small enough that every arena is winnable.
     * @return array<string,mixed>
     */
    public static function cleanLayout(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new RpcError('Bad arena layout.');
        }
        $ints = static function (mixed $list, int $lo, int $hi, int $max): array {
            $out = [];
            foreach (is_array($list) ? $list : [] as $v) {
                if (!is_int($v) && !(is_string($v) && ctype_digit($v))) {
                    throw new RpcError('Bad arena square.');
                }
                $v = (int) $v;
                if ($v < $lo || $v > $hi) {
                    throw new RpcError('Hazards must stay on ranks 3-6.');
                }
                if (!in_array($v, $out, true)) {
                    $out[] = $v;
                }
            }
            if (count($out) > $max) {
                throw new RpcError('Too many hazards of one kind.');
            }
            return $out;
        };
        $walls = $ints($raw['walls'] ?? [], 16, 47, 8);
        $gears = $ints($raw['gears'] ?? [], 16, 47, 4);
        if (count($gears) === 1) {
            throw new RpcError('Gears need at least two squares.');
        }
        $extra = [];
        foreach (is_array($raw['extra'] ?? null) ? $raw['extra'] : [] as $e) {
            $sq = (int) ($e['sq'] ?? -1);
            $k = (string) ($e['k'] ?? '');
            if ($sq < 32 || $sq > 47 || !in_array($k, self::ARENA_KINDS, true)) {
                throw new RpcError('Boss reinforcements go on ranks 5-6.');
            }
            foreach ($extra as $x) {
                if ($x['sq'] === $sq) {
                    throw new RpcError('Two pieces on one square.');
                }
            }
            $extra[] = ['sq' => $sq, 'k' => $k];
        }
        if (count($extra) > 4) {
            throw new RpcError('At most 4 boss reinforcements.');
        }
        if (count(array_filter($extra, static fn ($e) => $e['k'] === 'q')) > 1) {
            throw new RpcError('At most one extra queen.');
        }
        $taken = array_merge($walls, $gears, array_column($extra, 'sq'));
        if (count($taken) !== count(array_unique($taken))) {
            throw new RpcError('Hazards and pieces cannot share a square.');
        }
        $pick = static fn (mixed $v, array $ok, int $def): int => in_array((int) $v, $ok, true) ? (int) $v : $def;
        return [
            'theme' => $pick($raw['theme'] ?? 1, [1, 2, 3, 4, 5], 1),
            'walls' => $walls,
            'gears' => $gears,
            'gearEvery' => $pick($raw['gearEvery'] ?? 8, [4, 6, 8], 8),
            'fog' => $pick($raw['fog'] ?? 0, [0, 2, 3], 0),
            'glass' => $pick($raw['glass'] ?? 0, [0, 3, 5], 0),
            'extra' => $extra,
            'level' => $pick($raw['level'] ?? 2, [1, 2, 3], 2),
        ];
    }

    /** @param array<string,mixed> $r @return array<string,mixed> */
    private static function arenaView(array $r, string $userId): array
    {
        return [
            'code' => (string) $r['code'],
            'name' => (string) $r['name'],
            'layout' => json_decode((string) $r['layout'], true) ?: [],
            'owner' => self::nameOf((string) $r['owner_id']),
            'mine' => $r['owner_id'] === $userId,
            'plays' => (int) $r['plays'],
            'wins' => (int) $r['wins'],
            'createdAt' => Db::toMs((string) $r['created_at']),
        ];
    }

    /** @param array<string,mixed> $data */
    public static function saveArena(string $userId, array $data): mixed
    {
        self::needUnlock($userId);
        $layout = self::cleanLayout($data['layout'] ?? null);
        $name = trim(preg_replace('/\s+/', ' ', (string) ($data['name'] ?? '')) ?? '');
        $name = mb_substr($name, 0, 40);
        if ($name === '') {
            $name = 'Untitled Arena';
        }
        $json = json_encode($layout);
        $now = Db::now();
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($data['code'] ?? '')) ?? '');
        if ($code !== '') {
            $r = Db::one('SELECT * FROM campaign_arenas WHERE code = ?', [$code]);
            if ($r !== null && $r['owner_id'] === $userId) {
                Db::run('UPDATE campaign_arenas SET name = ?, layout = ?, updated_at = ? WHERE id = ?', [$name, $json, $now, $r['id']]);
                return self::arenaView(Db::one('SELECT * FROM campaign_arenas WHERE id = ?', [$r['id']]) ?? [], $userId);
            }
        }
        if ((int) Db::value('SELECT COUNT(*) FROM campaign_arenas WHERE owner_id = ?', [$userId]) >= self::ARENA_MAX) {
            throw new RpcError('You have ' . self::ARENA_MAX . ' arenas already. Edit one of them instead.');
        }
        $id = Util::uuid();
        for ($try = 0; $try < 20; $try++) {
            $code = 'A';
            for ($i = 0; $i < 5; $i++) {
                $code .= self::CODE_ABC[random_int(0, strlen(self::CODE_ABC) - 1)];
            }
            if ((int) Db::value('SELECT COUNT(*) FROM campaign_arenas WHERE code = ?', [$code]) === 0) {
                break;
            }
        }
        Db::run('INSERT INTO campaign_arenas (id, code, owner_id, name, layout, plays, wins, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)', [$id, $code, $userId, $name, $json, $now, $now]);
        return self::arenaView(Db::one('SELECT * FROM campaign_arenas WHERE id = ?', [$id]) ?? [], $userId);
    }

    /** @param array<string,mixed> $data */
    public static function getArena(string $userId, array $data): mixed
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($data['code'] ?? '')) ?? '');
        $r = Db::one('SELECT * FROM campaign_arenas WHERE code = ?', [$code]);
        if ($r === null) {
            throw new RpcError('No arena with that code.');
        }
        return self::arenaView($r, $userId);
    }

    /** @param array<string,mixed> $data */
    public static function myArenas(string $userId, array $data): mixed
    {
        $rows = Db::all('SELECT * FROM campaign_arenas WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ' . self::ARENA_MAX, [$userId]);
        return ['arenas' => array_map(static fn ($r) => self::arenaView($r, $userId), $rows)];
    }

    /** Play counter only: custom arenas give no XP or coins, so there is nothing to farm. @param array<string,mixed> $data */
    public static function arenaResult(string $userId, array $data): mixed
    {
        self::needUnlock($userId);
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($data['code'] ?? '')) ?? '');
        $win = ($data['result'] ?? '') === 'win' ? 1 : 0;
        Db::run('UPDATE campaign_arenas SET plays = plays + 1, wins = wins + ? WHERE code = ?', [$win, $code]);
        $r = Db::one('SELECT * FROM campaign_arenas WHERE code = ?', [$code]);
        if ($r === null) {
            throw new RpcError('No arena with that code.');
        }
        return self::arenaView($r, $userId);
    }

}
