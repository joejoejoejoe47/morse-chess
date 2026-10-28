<?php

declare(strict_types=1);

namespace Morse;

/** GC: letters between players, laid out like a mail box. */
final class Mail
{
    public static function register(): void
    {
        Rpc::register('listGc', [self::class, 'listGc']);
        Rpc::register('gcThread', [self::class, 'gcThread']);
        Rpc::register('sendMail', [self::class, 'sendMail']);
        Rpc::register('gcPops', [self::class, 'gcPops']);
        Rpc::register('gcRead', [self::class, 'gcRead']);
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
            'SELECT from_id, to_id, from_name, to_name, body, created_at FROM mail WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC LIMIT 400',
            [$userId, $userId]
        );
        foreach ($letters as $letter) {
            $other = (string) $letter['from_id'] === $userId ? (string) $letter['to_id'] : (string) $letter['from_id'];
            if (!isset($people[$other]) || $people[$other]['preview'] !== '') {
                continue;
            }
            $people[$other]['preview'] = mb_substr((string) $letter['body'], 0, 90);
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
        $rows = Db::all(
            'SELECT id, from_id, body, created_at FROM mail WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY created_at ASC LIMIT 200',
            [$userId, $other['user_id'], $other['user_id'], $userId]
        );
        $letters = [];
        foreach ($rows as $row) {
            $letters[] = [
                'id' => (string) $row['id'],
                'mine' => (string) $row['from_id'] === $userId,
                'body' => (string) $row['body'],
                'at' => Db::iso((string) $row['created_at']),
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
        if ($body === '') {
            throw new RpcError('Write something first.');
        }
        $body = mb_substr($body, 0, 2000);
        $me = (string) (Db::value('SELECT username FROM profiles WHERE user_id = ?', [$userId]) ?? 'Player');
        $id = Util::uuid();
        Db::run(
            'INSERT INTO mail (id, from_id, from_name, to_id, to_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$id, $userId, mb_substr($me, 0, 64), $other['user_id'], mb_substr((string) $other['username'], 0, 64), $body, Db::now()]
        );
        return ['id' => $id];
    }

    /** Unread letters waiting for this player. Shown once they are at the club. */
    public static function gcPops(string $userId, array $data): mixed
    {
        $rows = Db::all(
            'SELECT id, from_id, from_name, body FROM mail WHERE to_id = ? AND seen = 0 ORDER BY created_at ASC LIMIT 8',
            [$userId]
        );
        $letters = [];
        foreach ($rows as $row) {
            $letters[] = [
                'id' => (string) $row['id'],
                'fromId' => (string) $row['from_id'],
                'name' => (string) $row['from_name'],
                'text' => mb_substr((string) $row['body'], 0, 280),
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
