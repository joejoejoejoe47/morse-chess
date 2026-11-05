<?php

declare(strict_types=1);

namespace Morse;

/**
 * Optional natural-voice proxy for the Create Bot buddy.
 * OFF unless a key is configured (env or .env):
 *   OPENAI_API_KEY      → OpenAI gpt-4o-mini-tts (voices onyx / nova)
 *   ELEVENLABS_API_KEY  → ElevenLabs turbo (voices Adam / Rachel)
 * With no key, GET /api/tts says {enabled:false} and the browser keeps using speechSynthesis.
 * Signed-in players only, short lines only, so the key can't be used as a free TTS service.
 */
final class Tts
{
    private static function provider(): ?string
    {
        if (Config::get('OPENAI_API_KEY')) return 'openai';
        if (Config::get('ELEVENLABS_API_KEY')) return 'elevenlabs';
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
        if ($p === null) throw new RpcError('Natural voice is not set up', 404);
        $uid = Auth::requireUserId();
        $b = Http::jsonBody();
        $text = trim(preg_replace('/\s+/', ' ', (string) ($b['text'] ?? '')) ?? '');
        if ($text === '') throw new RpcError('Nothing to say', 400);
        $text = mb_substr($text, 0, 400);
        $female = ($b['voice'] ?? '') === 'female';
        self::rateLimit($uid);

        if ($p === 'openai') {
            [$code, $audio] = self::post('https://api.openai.com/v1/audio/speech', [
                'Authorization: Bearer ' . Config::get('OPENAI_API_KEY'),
                'Content-Type: application/json',
            ], json_encode([
                'model' => 'gpt-4o-mini-tts',
                'voice' => $female ? 'nova' : 'onyx',
                'input' => $text,
                'instructions' => 'Cheerful, warm, friendly little robot chess buddy. Natural and upbeat.',
                'response_format' => 'mp3',
            ]));
        } else {
            $voice = $female ? '21m00Tcm4TlvDHnh6Hcm' : 'pNInz6obpgDQGcFmaJgB';
            [$code, $audio] = self::post("https://api.elevenlabs.io/v1/text-to-speech/$voice", [
                'xi-api-key: ' . Config::get('ELEVENLABS_API_KEY'),
                'Content-Type: application/json',
                'Accept: audio/mpeg',
            ], json_encode(['text' => $text, 'model_id' => 'eleven_turbo_v2_5']));
        }
        if ($code !== 200 || $audio === '') {
            error_log("[tts $p] HTTP $code");
            throw new RpcError('Voice service failed', 502);
        }
        header('Content-Type: audio/mpeg');
        header('Cache-Control: no-store');
        echo $audio;
        exit;
    }

    /** ~30 lines a minute per player. */
    private static function rateLimit(string $uid): void
    {
        $f = Config::storagePath('tts-' . substr(hash('sha256', $uid), 0, 16) . '.json');
        $now = time();
        $hits = array_values(array_filter((array) json_decode((string) @file_get_contents($f), true), fn ($t) => is_int($t) && $t > $now - 60));
        if (count($hits) >= 30) throw new RpcError('Slow down a little', 429);
        $hits[] = $now;
        @file_put_contents($f, json_encode($hits));
    }

    /** @return array{0:int,1:string} */
    private static function post(string $url, array $headers, string $body): array
    {
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25]);
            $out = curl_exec($c);
            $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
            curl_close($c);
            return [$code, is_string($out) ? $out : ''];
        }
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => implode("\r\n", $headers), 'content' => $body, 'timeout' => 25, 'ignore_errors' => true]]);
        $out = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $code = (int) $m[1];
        return [$code, is_string($out) ? $out : ''];
    }
}
