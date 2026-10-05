# Morse Chess on PHP (Plesk)

The React client (3D boards, avatar studio, club, bell, WebRTC calls) is built to plain
static files. A PHP backend in `php/` replaces the Node server: accounts, Morse coins,
Elo, queue, challenges, timed games, MorseBot v1/v2, boards and gear, clubs, tournaments
and bracket, chat/camera flags, and WebRTC signaling. No Node runs on the server.

## 1. Build (once, on any computer with Node 20+)

    npm install
    npm run build
    bash scripts/assemble-php.sh      # writes site/ (and site.zip)

## 2. Upload

Upload the CONTENTS of `site/` into the folder served at https://alltherex.com/chess/
(back up the old `chess/` folder first). Layout:

    chess/index.php  install.php  .htaccess  index.html  assets/ avatars/ boards/ ...
    chess/app/       <- PHP code, schema, settings (blocked from the web)

## 3. Database

Plesk → Databases → Add Database (+ a user). Open https://alltherex.com/chess/install.php,
enter the details. It creates the tables and writes `app/.env`. If PHP may not write that
file, the page shows the exact text — create `app/.env` in File Manager and paste it.
Then DELETE `install.php`. Manual alternative: copy `app/.env.example` to `app/.env`, fill in
`DB_NAME`, `DB_USER`, `DB_PASS`; tables are created on the first request
(`/chess/api/health` should answer `{"ok":true,"driver":"mysql"}`).

## Notes
* Needs PHP 8.1+ with pdo_mysql. Sign-in uses a cookie session, so serve over HTTPS.
* Accounts from the old simple PHP club (`mc_users`) and the Vercel/Postgres site are
  separate databases and are not imported; players create their seat again. Old club
  passwords from the Node app's database verify if you import that data (scrypt is ported).
* Developing locally: `php -S 127.0.0.1:8099 -t php/public php/public/index.php` with
  `DB_DRIVER=sqlite`, then `npm run dev` (Vite proxies /api to it).
* Tests: `for t in php/tests/*Test.php; do php $t; done`
