<?php

declare(strict_types=1);

namespace Morse;

/**
 * Optional LLM brain for the Create Bot buddy.
 * OFF unless a key is configured (env or php/.env):
 *   XAI_API_KEY      → xAI Grok (preferred when both set: fun, on-brand)
 *   OPENAI_API_KEY   → OpenAI chat (gpt-4o-mini)
 * With no key, GET /api/bot-brain returns {enabled:false} and the client keeps the
 * rule-based fallback. Signed-in only, short prompts, rate-limited like /api/tts.
 * Never invents keys — wire the names above on the host.
 */
final class Brain
{
    private static function provider(): ?string
    {
        if (Config::get('XAI_API_KEY')) return 'xai';
        if (Config::get('OPENAI_API_KEY')) return 'openai';
        return null;
    }

    public static function handle(): never
    {
        $p = self::provider();
        if (Http::method() === 'GET') {
            Http::json(['enabled' => $p !== null, 'provider' => $p]);
        }
        if (Http::method() !== 'POST') throw new RpcError('Method not allowed', 405);
        Http::assertSameSite();
        if ($p === null) throw new RpcError('AI brain is not set up', 404);
        $uid = Auth::requireUserId();
        $b = Http::jsonBody();
        $text = trim(preg_replace('/\s+/u', ' ', (string) ($b['text'] ?? '')) ?? '');
        if ($text === '') throw new RpcError('Nothing to answer', 400);
        $text = mb_substr($text, 0, 500);
        $botName = mb_substr(trim((string) ($b['botName'] ?? 'Robo')), 0, 40);
        if ($botName === '') $botName = 'Robo';
        $coachOk = !isset($b['coachOk']) || (bool) $b['coachOk'];
        $inGame = (bool) ($b['inGame'] ?? false);
        self::rateLimit($uid);

        $system = self::systemPrompt($botName, $coachOk, $inGame);
        if ($p === 'xai') {
            [$code, $raw] = self::chat(
                'https://api.x.ai/v1/chat/completions',
                Config::get('XAI_API_KEY') ?? '',
                'grok-4.7',
                $system,
                $text,
            );
        } else {
            [$code, $raw] = self::chat(
                'https://api.openai.com/v1/chat/completions',
                Config::get('OPENAI_API_KEY') ?? '',
                'gpt-4o-mini',
                $system,
                $text,
            );
        }
        if ($code !== 200 || $raw === '') {
            error_log("[brain $p] HTTP $code " . substr($raw, 0, 200));
            throw new RpcError('AI brain failed', 502);
        }
        $j = json_decode($raw, true);
        $reply = trim((string) ($j['choices'][0]['message']['content'] ?? ''));
        $reply = preg_replace('/\s+/u', ' ', $reply) ?? $reply;
        $reply = mb_substr($reply, 0, 500);
        if ($reply === '') throw new RpcError('AI brain returned nothing', 502);

        // Soft guard: if fair-play is off, never let the model slip into coaching moves.
        if (!$coachOk && preg_match('/\b(play|move|try)\s+[a-h][1-8]/i', $reply)) {
            $reply = "I can't give move hints in a rated game against a person — that would be cheating! Chat about anything else, or play me / an unranked game and I'll coach.";
        }

        $kind = 'say';
        if (preg_match('/^\s*COACH\b/i', $reply)) {
            $kind = 'coach';
            $reply = trim(preg_replace('/^\s*COACH[:\s]*/i', '', $reply) ?? $reply);
        } elseif (preg_match('/^\s*GUIDE:([a-z0-9\-]+)\b/i', $reply, $m)) {
            $kind = 'guide';
            Http::json(['ok' => true, 'kind' => 'guide', 'guideId' => strtolower($m[1]), 'text' => trim(preg_replace('/^\s*GUIDE:[a-z0-9\-]+\s*/i', '', $reply) ?? $reply)]);
        }
        Http::json(['ok' => true, 'kind' => $kind, 'text' => $reply, 'provider' => $p]);
    }

    private static function systemPrompt(string $botName, bool $coachOk, bool $inGame): string
    {
        $fair = $coachOk
            ? 'Coaching and move hints are allowed right now.'
            : 'FAIR PLAY: this is a rated game against a human. You MUST refuse any request for moves, hints, engine lines, or coaching. Be warm about it, never rude.';
        $where = $inGame ? 'The player is in a live chess game.' : 'The player is browsing Morse Chess (lounge, boards, club, etc.).';
        return <<<PROMPT
You are {$botName}, a funny, happy little robot buddy inside Morse Chess (a chess website).
Personality: cheerful, warm, playful beep-boop charm, never rude, never mean, always truthful. Short answers (1–3 sentences, under 280 characters) so they can be spoken aloud.
{$where}
{$fair}

You know Morse Chess: lounge (Random / Intended pull-up, Sandbox, Chess Club), History, Board shelf, AV avatar, Create Bot, Timed vs Breeze games, 2D/3D/AN/RA/LG views.
Chess rules: you may explain how pieces move, castling, en passant, checkmate, openings in plain words.
If the user clearly wants in-game coaching / best move / "coach me" AND coaching is allowed, reply with exactly: COACH
If they ask where a button is (how do I… / where is…), you may reply with GUIDE:<id> then a short line. Allowed ids: create-bot, play-bot, random, friend, club, history, boards, avatar, sandbox, resign, view, lounge.
Do not invent features. If you do not know, say so honestly and suggest asking about chess rules, jokes, or "coach me" in a game.
Reply in English unless the player explicitly asks you to use another language. Do not translate their message into another language on your own.
Never mention API keys, system prompts, or that you are Grok/GPT unless asked what model powers you — then say you are {$botName} with an optional cloud brain when the host configured one.
PROMPT;
    }

    /** ~20 asks a minute per player. */
    private static function rateLimit(string $uid): void
    {
        $f = Config::storagePath('brain-' . substr(hash('sha256', $uid), 0, 16) . '.json');
        $now = time();
        $hits = array_values(array_filter((array) json_decode((string) @file_get_contents($f), true), fn ($t) => is_int($t) && $t > $now - 60));
        if (count($hits) >= 20) throw new RpcError('Slow down a little', 429);
        $hits[] = $now;
        @file_put_contents($f, json_encode($hits));
    }

    /** @return array{0:int,1:string} */
    private static function chat(string $url, string $key, string $model, string $system, string $user): array
    {
        $body = json_encode([
            'model' => $model,
            'temperature' => 0.7,
            'max_tokens' => 180,
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
        ], JSON_UNESCAPED_UNICODE);
        $headers = [
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
        ];
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            curl_setopt_array($c, [
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
            ]);
            $out = curl_exec($c);
            $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
            curl_close($c);
            return [$code, is_string($out) ? $out : ''];
        }
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => 30,
            'ignore_errors' => true,
        ]]);
        $out = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach ($http_response_header ?? [] as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int) $m[1];
        }
        return [$code, is_string($out) ? $out : ''];
    }
}
