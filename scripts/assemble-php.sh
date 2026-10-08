#!/usr/bin/env bash
# Assemble the folder you upload to Plesk (e.g. httpdocs/chess/).
#   npm install && npm run build      # produces dist/
#   bash scripts/assemble-php.sh      # produces site/  (and site.zip if `zip` exists)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f dist/index.html ] || { echo "dist/index.html not found. Run: npm install && npm run build" >&2; exit 1; }
rm -rf site && mkdir -p site/app
cp -R dist/. site/
mv site/index.html site/app.html   # never served statically: index.php injects the mount point
cp php/public/index.php php/public/install.php php/public/.htaccess php/public/web.config site/
cp -R php/src php/sql php/data php/bin site/app/
mkdir -p site/app/storage && cp php/storage/.gitignore site/app/storage/ 2>/dev/null || true
cp php/.env.example site/app/.env.example
# The PHP code and database settings must never be downloadable.
for d in site/app; do
  printf 'Require all denied\n' > "$d/.htaccess"
  cat > "$d/web.config" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<configuration><system.webServer><security><authorization><remove users="*" roles="" verbs="" /><add accessType="Deny" users="*" /></authorization></security></system.webServer></configuration>
XML
done
echo "Built site/ — upload its CONTENTS to your chess folder."
command -v zip >/dev/null && (cd site && zip -qr ../site.zip . && echo "Also wrote site.zip") || true
