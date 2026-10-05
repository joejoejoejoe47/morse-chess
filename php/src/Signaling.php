<?php

declare(strict_types=1);

namespace Morse;

/**
 * Port of src/lib/multiplayer/signaling.server.ts: WebRTC rendezvous over the
 * app database. Only the roster and SDP/ICE relay go through here; game data
 * flows peer-to-peer. GET polls (and heartbeats), POST sends a signal or leaves.
 */
final class Signaling
{
    private const ID_RE = '/^[a-zA-Z0-9_-]{1,64}$/';
    private const PEER_TTL_MS = 30000;
    private const SIGNAL_TTL_MS = 60000;

    public static function handle(): never
    {
        try {
            $method = Http::method();
            if ($method === 'GET') {
                self::get();
            }
            if ($method === 'POST') {
                self::post();
            }
            Http::json(['error' => 'method not allowed'], 405);
        } catch (RpcError $e) {
            Http::json(['error' => $e->getMessage()], $e->status);
        } catch (\Throwable $e) {
            error_log('[rtc] ' . $e::class . ': ' . $e->getMessage());
            Http::json(['error' => 'signaling failed'], 500);
        }
    }

    private static function validId(mixed $v): bool
    {
        return is_string($v) && preg_match(self::ID_RE, $v) === 1;
    }

    private static function get(): never
    {
        $room = $_GET['room'] ?? null;
        $peer = $_GET['peer'] ?? null;
        $name = (string) ($_GET['name'] ?? '');
        $since = $_GET['since'] ?? 0;
        if (!self::validId($room) || !self::validId($peer) || mb_strlen($name) > 64
            || !is_numeric($since) || (int) $since < 0) {
            Http::json(['error' => 'invalid query'], 400);
        }
        $since = (int) $since;
        $room = (string) $room;
        $peer = (string) $peer;

        if ($since === 0 || random_int(0, 49) === 0) {
            self::prune();
        }
        Db::upsert(
            'webrtc_peers',
            ['room' => $room, 'peer_id' => $peer, 'name' => $name, 'last_seen' => Db::now()],
            ['room', 'peer_id'],
            ['name', 'last_seen']
        );
        $rows = Db::all(
            'SELECT id, from_peer, kind, payload FROM webrtc_signals WHERE room = ? AND to_peer = ? AND id > ? ORDER BY id LIMIT 200',
            [$room, $peer, $since]
        );
        $peers = Db::all(
            'SELECT peer_id, name FROM webrtc_peers WHERE room = ? AND last_seen > ? ORDER BY peer_id LIMIT 32',
            [$room, Db::ts(Db::nowMs() - self::PEER_TTL_MS)]
        );
        Http::json([
            'peers' => array_map(static fn (array $r): array => ['id' => (string) $r['peer_id'], 'name' => (string) $r['name']], $peers),
            'signals' => array_map(static fn (array $r): array => [
                'id' => (int) $r['id'],
                'from' => (string) $r['from_peer'],
                'kind' => (string) $r['kind'],
                'payload' => json_decode((string) $r['payload'], true),
            ], $rows),
        ]);
    }

    private static function post(): never
    {
        Http::assertSameSite();
        $b = Http::jsonBody();
        $op = $b['op'] ?? null;
        $room = $b['room'] ?? null;
        if ($op === 'signal') {
            $kind = $b['kind'] ?? null;
            $encoded = array_key_exists('payload', $b) ? json_encode($b['payload']) : false;
            if (!self::validId($room) || !self::validId($b['from'] ?? null) || !self::validId($b['to'] ?? null)
                || !in_array($kind, ['offer', 'answer', 'ice'], true)
                || $encoded === false || $b['payload'] === null || strlen($encoded) > 32768) {
                Http::json(['error' => 'invalid request'], 400);
            }
            Db::run(
                'INSERT INTO webrtc_signals (room, to_peer, from_peer, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$room, $b['to'], $b['from'], $kind, $encoded, Db::now()]
            );
            Http::json(['ok' => true]);
        }
        if ($op === 'leave' && self::validId($room) && self::validId($b['peer'] ?? null)) {
            Db::run('DELETE FROM webrtc_peers WHERE room = ? AND peer_id = ?', [$room, $b['peer']]);
            Http::json(['ok' => true]);
        }
        Http::json(['error' => 'invalid request'], 400);
    }

    private static function prune(): void
    {
        Db::run('DELETE FROM webrtc_signals WHERE created_at < ?', [Db::ts(Db::nowMs() - self::SIGNAL_TTL_MS)]);
        Db::run('DELETE FROM webrtc_peers WHERE last_seen < ?', [Db::ts(Db::nowMs() - self::PEER_TTL_MS)]);
    }
}
