<?php

declare(strict_types=1);

namespace Morse;

/**
 * Football variant preferences, stored per player in `profiles.football_json`:
 *   { "team": { "name": "Knights", "color": "#2ee6ff" }, "names": { "<boardId>": { "a1": "Rocky", ... } } }
 * The team is asked for on the first football game; piece names are set in the board collection
 * and shown in the touchdown replay ("Rocky scored").
 */
final class Football
{
    public const SLOTS = ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1', 'a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'];

    public static function register(): void
    {
        foreach (['getFootballPrefs', 'saveFootballTeam', 'savePieceName'] as $name) {
            Rpc::register($name, [self::class, $name]);
        }
    }

    /** @return array{team: ?array{name:string,color:string}, names: array<string,array<string,string>>, board: string} */
    public static function getFootballPrefs(string $userId, array $data): array
    {
        $row = self::row($userId);
        $prefs = self::decode($row['football_json'] ?? null);
        return [
            'team' => $prefs['team'] ?? null,
            'names' => $prefs['names'] ?? new \stdClass(),
            'board' => (string) ($row['equipped_board'] ?? 'lodge'),
        ];
    }

    public static function saveFootballTeam(string $userId, array $data): array
    {
        $name = self::cleanName($data['name'] ?? '', 18);
        if ($name === '') {
            throw new RpcError('Give your team a name.');
        }
        $color = strtolower(trim((string) ($data['color'] ?? '')));
        if (!preg_match('/^#[0-9a-f]{6}$/', $color)) {
            throw new RpcError('Pick a team colour.');
        }
        $row = self::row($userId);
        $prefs = self::decode($row['football_json'] ?? null);
        $prefs['team'] = ['name' => $name, 'color' => $color];
        self::store($userId, $prefs);
        return self::getFootballPrefs($userId, []);
    }

    public static function savePieceName(string $userId, array $data): array
    {
        $board = (string) ($data['boardId'] ?? '');
        if (!preg_match('/^[a-z0-9-]{1,64}$/', $board)) {
            throw new RpcError('Unknown board.');
        }
        $slot = (string) ($data['slot'] ?? '');
        if (!in_array($slot, self::SLOTS, true)) {
            throw new RpcError('Unknown piece.');
        }
        $name = self::cleanName($data['name'] ?? '', 16);
        $row = self::row($userId);
        $prefs = self::decode($row['football_json'] ?? null);
        $names = is_array($prefs['names'] ?? null) ? $prefs['names'] : [];
        $forBoard = is_array($names[$board] ?? null) ? $names[$board] : [];
        if ($name === '') {
            unset($forBoard[$slot]);
        } else {
            $forBoard[$slot] = $name;
        }
        if ($forBoard === []) {
            unset($names[$board]);
        } else {
            $names[$board] = $forBoard;
        }
        if (count($names) > 60) {
            throw new RpcError('Too many boards with names.');
        }
        $prefs['names'] = $names;
        self::store($userId, $prefs);
        return self::getFootballPrefs($userId, []);
    }

    private static function row(string $userId): array
    {
        $row = Db::one('SELECT football_json, equipped_board FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
        if ($row === null) {
            throw new RpcError('Claim a username first.');
        }
        return $row;
    }

    private static function decode(mixed $json): array
    {
        $d = is_string($json) && $json !== '' ? json_decode($json, true) : null;
        if (!is_array($d)) {
            return [];
        }
        $out = [];
        if (is_array($d['team'] ?? null) && isset($d['team']['name'], $d['team']['color'])) {
            $out['team'] = ['name' => (string) $d['team']['name'], 'color' => (string) $d['team']['color']];
        }
        if (is_array($d['names'] ?? null)) {
            $out['names'] = $d['names'];
        }
        return $out;
    }

    private static function store(string $userId, array $prefs): void
    {
        $json = json_encode($prefs, JSON_UNESCAPED_UNICODE);
        if ($json === false || strlen($json) > 60000) {
            throw new RpcError('That is too much to save.');
        }
        Db::run('UPDATE profiles SET football_json = ? WHERE user_id = ?', [$json, $userId]);
    }

    private static function cleanName(mixed $raw, int $max): string
    {
        $s = preg_replace('/[\x00-\x1f\x7f<>]/u', '', strip_tags((string) $raw)) ?? '';
        $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
        return mb_substr($s, 0, $max);
    }
}
