<?php

declare(strict_types=1);

namespace Morse;

/**
 * Stockfish (or any UCI engine) as a child process. Configure FAIRPLAY_ENGINE with the command, e.g.
 *   FAIRPLAY_ENGINE=/usr/local/bin/stockfish
 *   FAIRPLAY_ENGINE="node /path/to/stockfish.cjs"   (the repo's own WASM build, run with Node)
 * FAIRPLAY_DEPTH sets the search depth (default 12).
 */
final class UciEngine implements Engine
{
    /** @var resource */
    private $proc;
    /** @var array<int,resource> */
    private array $pipes = [];
    private int $multi = 0;

    public function __construct(string $command, private int $depth = 12)
    {
        $p = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'a']], $this->pipes);
        if (!is_resource($p)) {
            throw new \RuntimeException('Could not start the engine.');
        }
        $this->proc = $p;
        $this->send('uci');
        $this->waitFor('uciok');
        $this->send('setoption name Hash value 32');
        $this->send('isready');
        $this->waitFor('readyok');
    }

    public static function fromConfig(): ?self
    {
        $cmd = Config::get('FAIRPLAY_ENGINE');
        if ($cmd === null || trim($cmd) === '') {
            return null;
        }
        return new self($cmd, max(6, min(22, (int) (Config::get('FAIRPLAY_DEPTH') ?? '12'))));
    }

    public function analyse(string $fen, int $multiPv): array
    {
        if ($multiPv !== $this->multi) {
            $this->send('setoption name MultiPV value ' . $multiPv);
            $this->multi = $multiPv;
        }
        $this->send('position fen ' . $fen);
        $this->send('go depth ' . $this->depth);
        $lines = [];
        $deadline = microtime(true) + 60;
        while (microtime(true) < $deadline) {
            $l = fgets($this->pipes[1]);
            if ($l === false) {
                throw new \RuntimeException('Engine stopped.');
            }
            $l = trim($l);
            if (str_starts_with($l, 'bestmove')) {
                ksort($lines);
                return array_values($lines);
            }
            if (str_contains($l, 'bound ')) {
                continue; // fail-high/low partial result
            }
            if (!str_starts_with($l, 'info ') || !str_contains($l, ' pv ') || !str_contains($l, ' score ')) {
                continue;
            }
            $t = explode(' ', $l);
            $k = 1;
            $kind = '';
            $val = 0;
            $move = '';
            for ($i = 1, $n = count($t); $i < $n; $i++) {
                if ($t[$i] === 'multipv') {
                    $k = (int) ($t[++$i] ?? 1);
                } elseif ($t[$i] === 'score') {
                    $kind = (string) ($t[++$i] ?? '');
                    $val = (int) ($t[++$i] ?? 0);
                } elseif ($t[$i] === 'pv') {
                    $move = (string) ($t[$i + 1] ?? '');
                    break;
                }
            }
            if ($move === '' || ($kind !== 'cp' && $kind !== 'mate')) {
                continue;
            }
            $isMate = $kind === 'mate';
            $lines[$k] = ['move' => $move, 'cp' => $isMate ? ($val > 0 ? 10000 : -10000) : $val, 'mate' => $isMate ? $val : null];
        }
        throw new \RuntimeException('Engine timed out.');
    }

    private function send(string $cmd): void
    {
        fwrite($this->pipes[0], $cmd . "\n");
        fflush($this->pipes[0]);
    }

    private function waitFor(string $token): void
    {
        $deadline = microtime(true) + 30;
        while (microtime(true) < $deadline) {
            $l = fgets($this->pipes[1]);
            if ($l === false) {
                throw new \RuntimeException('Engine stopped.');
            }
            if (trim($l) === $token) {
                return;
            }
        }
        throw new \RuntimeException('Engine did not answer.');
    }

    public function __destruct()
    {
        @fwrite($this->pipes[0], "quit\n");
        foreach ($this->pipes as $p) {
            @fclose($p);
        }
        @proc_close($this->proc);
    }
}
