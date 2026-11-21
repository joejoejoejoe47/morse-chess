<?php

declare(strict_types=1);

namespace Morse;

/** GC: letters between players, laid out like a mail box. */
final class Mail
{
    /** Give Morse Coins: biggest single gift, and how many gifts one player can send per hour. */
    public const GIFT_MAX = 10000;
    public const GIFTS_PER_HOUR = 20;

    public static function register(): void
    {
        Rpc::register('listGc', [self::class, 'listGc']);
        Rpc::register('gcThread', [self::class, 'gcThread']);
        Rpc::register('sendMail', [self::class, 'sendMail']);
        Rpc::register('gcPops', [self::class, 'gcPops']);
        Rpc::register('gcRead', [self::class, 'gcRead']);
        Rpc::register('giveCoins', [self::class, 'giveCoins']);
    }

    /** First capital in the name, or the first letter when there is none. */
    public static function letter(string $name): string
    {
        if (preg_match('/\p{Lu}/u', $name, $m) === 1) {
            return $m[0];
        }
        $first = mb_substr(trim($name), 0, 1);
        return $first === '' ? '?' : mb_strtoupper($first);
    }

    /** @param array<string,mixed> $data */
    public static function listGc(string $userId, array $data): mixed
    {
        $me = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ?', [$userId]) ?? '');
        $q = mb_strtolower(trim((string) ($data['q'] ?? '')));
        $people = [];
        foreach (Db::all('SELECT user_id, username FROM profiles WHERE user_id <> ? ORDER BY username ASC LIMIT 200', [$userId]) as $row) {
            $name = (string) $row['username'];
            if ($q !== '' && !str_contains(mb_strtolower($name), $q)) {
                continue;
            }
            $people[(string) $row['user_id']] = [
                'userId' => (string) $row['user_id'],
                'username' => $name,
                'letter' => self::letter($name),
                'preview' => '',
                'at' => '',
                'unread' => false,
            ];
        }
        $letters = Db::all(
            'SELECT from_id, to_id, from_name, to_name, body, media_kind, created_at FROM mail WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC LIMIT 400',
            [$userId, $userId]
        );
        foreach ($letters as $letter) {
            $other = (string) $letter['from_id'] === $userId ? (string) $letter['to_id'] : (string) $letter['from_id'];
            if (!isset($people[$other]) || $people[$other]['preview'] !== '') {
                continue;
            }
            $preview = trim((string) $letter['body']);
            if ($preview === '') {
                $kind = (string) ($letter['media_kind'] ?? '');
                $preview = $kind === 'video' ? 'Video' : ($kind === 'image' ? 'Picture' : '');
            }
            $people[$other]['preview'] = mb_substr($preview, 0, 90);
            $people[$other]['at'] = Db::iso((string) $letter['created_at']);
            $people[$other]['unread'] = (string) $letter['to_id'] === $userId;
        }
        $list = array_values($people);
        usort($list, static function (array $a, array $b): int {
            if ($a['at'] !== $b['at']) {
                return $a['at'] < $b['at'] ? 1 : -1;
            }
            return strcasecmp($a['username'], $b['username']);
        });
        return ['me' => $me, 'people' => $list];
    }

    /** @param array<string,mixed> $data */
    public static function gcThread(string $userId, array $data): mixed
    {
        $other = self::person((string) ($data['userId'] ?? ''));
        if ($other === null || $other['user_id'] === $userId) {
            throw new RpcError('That player is not at the club.', 404);
        }
        $lite = !empty($data['lite']);
        $rows = Db::all(
            $lite
                ? 'SELECT id, from_id, body, media_kind, created_at FROM mail WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC LIMIT 200'
                : 'SELECT id, from_id, body, media, media_kind, created_at FROM mail WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC LIMIT 200',
            [$userId, $other['user_id'], $other['user_id'], $userId]
        );
        $letters = [];
        foreach ($rows as $row) {
            $kind = (string) ($row['media_kind'] ?? '');
            if ($kind === 'coins') {
                $letters[] = [
                    'id' => (string) $row['id'],
                    'mine' => (string) $row['from_id'] === $userId,
                    'body' => (string) $row['body'],
                    'at' => Db::iso((string) $row['created_at']),
                    'kind' => 'coins',
                    'media' => '',
                    'amount' => self::giftAmount((string) $row['body']),
                ];
                continue;
            }
            if ($kind !== 'image' && $kind !== 'video') {
                $kind = '';
            }
            $letters[] = [
                'id' => (string) $row['id'],
                'mine' => (string) $row['from_id'] === $userId,
                'body' => (string) $row['body'],
                'at' => Db::iso((string) $row['created_at']),
                'kind' => $kind,
                'media' => ($lite || $kind === '') ? '' : (string) ($row['media'] ?? ''),
            ];
        }
        return [
            'userId' => $other['user_id'],
            'username' => $other['username'],
            'letter' => self::letter((string) $other['username']),
            'letters' => $letters,
        ];
    }

    /** @param array<string,mixed> $data */
    public static function sendMail(string $userId, array $data): mixed
    {
        $other = self::person((string) ($data['userId'] ?? ''));
        if ($other === null || $other['user_id'] === $userId) {
            throw new RpcError('That player is not at the club.', 404);
        }
        $body = trim(preg_replace('/\s+/u', ' ', (string) ($data['body'] ?? '')) ?? '');
        [$media, $kind] = self::clip($data['media'] ?? null, (string) ($data['kind'] ?? ''));
        if ($body === '' && $media === '') {
            throw new RpcError('Write something first.');
        }
        $body = mb_substr($body, 0, 2000);
        $me = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ?', [$userId]) ?? 'Player');
        $id = Util::uuid();
        Db::run(
            'INSERT INTO mail (id, from_id, from_name, to_id, to_name, body, media, media_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $userId, mb_substr($me, 0, 64), $other['user_id'], mb_substr((string) $other['username'], 0, 64), $body, $media === '' ? null : $media, $kind, Db::now()]
        );
        return ['id' => $id];
    }

    /** Unread letters waiting for this player. Shown once they are at the club. */
    public static function gcPops(string $userId, array $data): mixed
    {
        $rows = Db::all(
            'SELECT id, from_id, from_name, body, media_kind, CASE WHEN media_kind = \'image\' THEN media ELSE \'\' END AS thumb FROM mail WHERE to_id = ? AND seen = 0 ORDER BY created_at ASC LIMIT 8',
            [$userId]
        );
        $letters = [];
        foreach ($rows as $row) {
            $kind = (string) ($row['media_kind'] ?? '');
            if ($kind !== 'image' && $kind !== 'video') {
                $kind = '';
            }
            $letters[] = [
                'id' => (string) $row['id'],
                'fromId' => (string) $row['from_id'],
                'name' => (string) $row['from_name'],
                'text' => mb_substr((string) $row['body'], 0, 280),
                'kind' => $kind,
                'thumb' => $kind === 'image' ? (string) ($row['thumb'] ?? '') : '',
            ];
        }
        return ['letters' => $letters];
    }

    /** @param array<string,mixed> $data */
    public static function gcRead(string $userId, array $data): mixed
    {
        $ids = $data['ids'] ?? [];
        if (!is_array($ids)) {
            return ['ok' => true];
        }
        foreach (array_slice($ids, 0, 8) as $id) {
            if (!is_string($id) || $id === '') {
                continue;
            }
            Db::run('UPDATE mail SET seen = 1 WHERE id = ? AND to_id = ?', [$id, $userId]);
        }
        return ['ok' => true];
    }

    /** @return array{0:string,1:string} */
    private static function clip(mixed $raw, string $kind): array
    {
        if ($raw === null || $raw === '' || $kind === '') {
            return ['', ''];
        }
        if (!is_string($raw)) {
            throw new RpcError('That file did not send.');
        }
        if ($kind === 'image') {
            $image = Util::chatImage($raw);
            if ($image === null) {
                throw new RpcError('That image is too big, or it is not a picture.');
            }
            return [$image, 'image'];
        }
        if ($kind === 'video') {
            if (strlen($raw) > 4800000 || preg_match('#\Adata:video/(?:mp4|webm|ogg|quicktime);base64,[A-Za-z0-9+/]+={0,2}\z#', $raw) !== 1) {
                throw new RpcError('That video is too big, or it is not a video.');
            }
            return [$raw, 'video'];
        }
        throw new RpcError('That file did not send.');
    }

    /** The amount written in a gift letter ("... gave X 25 Morse Coins!"). */
    private static function giftAmount(string $body): int
    {
        return preg_match('/(\d[\d,]*) Morse Coins?/u', $body, $m) === 1 ? (int) str_replace(',', '', $m[1]) : 0;
    }

    /**
     * Give Morse Coins to another player from GC. One transaction: the conditional debit
     * (coins >= amount) means two parallel gifts can never spend the same coins, the credit,
     * the gift log row and the gold coin letter in the chat all commit together or not at all.
     * @param array<string,mixed> $data
     */
    public static function giveCoins(string $userId, array $data): mixed
    {
        $raw = $data['amount'] ?? null;
        if (is_string($raw) && preg_match('/^\d+$/', trim($raw)) === 1) {
            $raw = (int) trim($raw);
        }
        if (!is_int($raw) || $raw < 1) {
            throw new RpcError('Give at least 1 Morse coin.');
        }
        if ($raw > self::GIFT_MAX) {
            throw new RpcError('You can give up to ' . number_format(self::GIFT_MAX) . ' Morse coins at a time.');
        }
        $amount = $raw;
        $other = self::person((string) ($data['userId'] ?? ''));
        if ($other === null) {
            throw new RpcError('That player is not at the club.', 404);
        }
        if ($other['user_id'] === $userId) {
            throw new RpcError('You cannot give coins to yourself.');
        }
        return Db::transaction(static function () use ($userId, $other, $amount): array {
            $me = Db::one('SELECT username, coins FROM profiles WHERE user_id = ? LIMIT 1' . Db::forUpdate(), [$userId]);
            if ($me === null) {
                throw new RpcError('Sign in first.', 401);
            }
            $since = Db::ts(Db::nowMs() - 3600 * 1000);
            $recent = (int) Db::value('SELECT COUNT(*) FROM coin_gifts WHERE from_id = ? AND created_at >= ?', [$userId, $since]);
            if ($recent >= self::GIFTS_PER_HOUR) {
                throw new RpcError('You have given a lot of gifts this hour. Try again a bit later.', 429);
            }
            $paid = Db::run('UPDATE profiles SET coins = coins - ? WHERE user_id = ? AND coins >= ?', [$amount, $userId, $amount]);
            if ($paid === 0) {
                throw new RpcError('Not enough Morse coins.');
            }
            $got = Db::run('UPDATE profiles SET coins = coins + ? WHERE user_id = ?', [$amount, $other['user_id']]);
            if ($got === 0) {
                throw new RpcError('That player is not at the club.', 404); // rolls the debit back
            }
            $myName = mb_substr((string) $me['username'], 0, 64);
            $theirName = mb_substr((string) $other['username'], 0, 64);
            $mailId = Util::uuid();
            $now = Db::now();
            $body = "\u{1FA99} {$myName} gave {$theirName} " . number_format($amount) . ' Morse ' . ($amount === 1 ? 'Coin' : 'Coins') . '!';
            Db::run(
                'INSERT INTO mail (id, from_id, from_name, to_id, to_name, body, media, media_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$mailId, $userId, $myName, $other['user_id'], $theirName, $body, null, 'coins', $now]
            );
            Db::run(
                'INSERT INTO coin_gifts (id, from_id, to_id, amount, mail_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [Util::uuid(), $userId, $other['user_id'], $amount, $mailId, $now]
            );
            $coins = (int) Db::value('SELECT coins FROM profiles WHERE user_id = ? LIMIT 1', [$userId]);
            return ['ok' => true, 'amount' => $amount, 'coins' => $coins, 'id' => $mailId, 'to' => $theirName];
        });
    }

    /** @return array{user_id:string,username:string}|null */
    private static function person(string $id): ?array
    {
        if ($id === '') {
            return null;
        }
        $row = Db::one('SELECT user_id, username FROM profiles WHERE user_id = ?', [$id]);
        if ($row === null) {
            return null;
        }
        return ['user_id' => (string) $row['user_id'], 'username' => (string) $row['username']];
    }
}
