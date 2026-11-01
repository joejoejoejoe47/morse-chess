<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

use Morse\Db;
use Morse\Mail;
use Morse\RpcError;

test_db();

$now = Db::now();
foreach ([['a', 'Ada'], ['b', 'Bea']] as [$id, $name]) {
    Db::run(
        'INSERT INTO profiles (user_id, username, username_lc, last_seen, created_at) VALUES (?, ?, ?, ?, ?)',
        [$id, $name, strtolower($name), $now, $now]
    );
}

$img = 'data:image/jpeg;base64,' . base64_encode('hi');
$sent = Mail::sendMail('a', ['userId' => 'b', 'body' => '', 'media' => $img, 'kind' => 'image']);
check(is_array($sent) && ($sent['id'] ?? '') !== '', 'a picture letter sends with no words');
$pops = Mail::gcPops('b', []);
check(($pops['letters'][0]['kind'] ?? '') === 'image', 'the popup says it is a picture');
check(($pops['letters'][0]['thumb'] ?? '') === $img, 'the popup carries the small picture');
$list = Mail::listGc('b', []);
$ada = null;
foreach ($list['people'] as $person) {
    if ($person['userId'] === 'a') {
        $ada = $person;
    }
}
check(($ada['preview'] ?? '') === 'Picture', 'the list says Picture when there are no words');
$thread = Mail::gcThread('b', ['userId' => 'a']);
check(($thread['letters'][0]['media'] ?? '') === $img && ($thread['letters'][0]['kind'] ?? '') === 'image', 'the chat keeps the picture');

Mail::gcRead('b', ['ids' => [$sent['id']]]);
$vid = 'data:video/mp4;base64,' . base64_encode('vid');
$clip = Mail::sendMail('a', ['userId' => 'b', 'body' => 'look', 'media' => $vid, 'kind' => 'video']);
check(is_array($clip), 'a video letter sends');
$pops = Mail::gcPops('b', []);
check(($pops['letters'][0]['kind'] ?? '') === 'video', 'the popup says it is a video');
check(($pops['letters'][0]['thumb'] ?? '') === '', 'the popup does not carry the video');
check(($pops['letters'][0]['text'] ?? '') === 'look', 'the popup still has the words');
$thread = Mail::gcThread('a', ['userId' => 'b']);
$last = $thread['letters'][count($thread['letters']) - 1];
check(($last['kind'] ?? '') === 'video' && ($last['media'] ?? '') === $vid, 'the chat keeps the video');

$bad = false;
try {
    Mail::sendMail('a', ['userId' => 'b', 'body' => '', 'media' => 'data:video/mp4;base64,@@@', 'kind' => 'video']);
} catch (RpcError $e) {
    $bad = str_contains($e->getMessage(), 'video');
}
check($bad, 'a broken video is refused');

$empty = false;
try {
    Mail::sendMail('a', ['userId' => 'b', 'body' => '']);
} catch (RpcError $e) {
    $empty = true;
}
check($empty, 'an empty letter is refused');

finish();
