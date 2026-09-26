#!/usr/bin/env bash
# Print the env block to paste into a CapRover app (App Configs → Environmental
# Variables → Bulk Edit), built from the local .env files.
#
#   bash scripts/caprover-env.sh ws|web|chain|bridge
#
# The database host defaults to srv-captain--golfcraft-mysql; CapRover's
# one-click MySQL names the service after ITS app name, which usually ends in
# -db, so pass the real one:
#   DB_HOST=srv-captain--golfcraft-mysql-db bash scripts/caprover-env.sh web
#
# It does the two things that are easy to get wrong by hand:
#   - strips the surrounding quotes some values carry (dotenv strips them,
#     CapRover does not, and a quoted DATABASE_URL stops Prisma from booting)
#   - rewrites the database host to the CapRover service name
#
# ⚠ This prints SECRETS to your terminal. Run it yourself, in your own shell,
# and don't paste its output anywhere except the CapRover form.
#
# ⚠ The PASSWORDS it prints are the local development ones (MYSQL_PASS and the
# password inside DATABASE_URL, ADMIN_PASS, GOLF_API_KEY). Replace them with the
# production values before saving, or the app boots and dies with
# "Authentication failed ... credentials for `root` are not valid".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-}"
DB_HOST="${DB_HOST:-srv-captain--golfcraft-mysql}"

# value of KEY in an env file, without quotes
val() { sed -n "s/^$2=//p" "$1" | head -1 | sed 's/^"//; s/"$//; s/^'"'"'//; s/'"'"'$//'; }

emit() { # file key...
  local file="$1"; shift
  [ -f "$file" ] || { echo "missing $file" >&2; exit 1; }
  for key in "$@"; do
    local v; v="$(val "$file" "$key")"
    [ -n "$v" ] || { echo "# $key is empty in $file — fill it in CapRover" >&2; continue; }
    case "$key" in
      MYSQL_HOST) v="$DB_HOST" ;;
      DATABASE_URL) v="${v//@localhost/@$DB_HOST}" ;;
    esac
    echo "$key=$v"
  done
}

case "$APP" in
  ws)
    emit "$ROOT/server/.env" PLAYFAB_TITLE_ID PLAYFAB_SECRET_KEY PLAYFAB_API_KEY GOLF_API_KEY SERVER
    ;;
  web)
    emit "$ROOT/web/.env" PLAYFAB_TITLE_ID PLAYFAB_SECRET_KEY GOLF_API_KEY DATABASE_URL \
      MYSQL_HOST MYSQL_USER MYSQL_PASS MYSQL_DB ADMIN_PASS ADMIN_COOKIE_PASSWORD
    ;;
  chain)
    emit "$ROOT/chain-playfab/.env" PLAYFAB_TITLE_ID PLAYFAB_SECRET_KEY PRIVATE_KEY PUBLIC_KEY \
      CONTRACT_ADDRESS WEB3_HTTP_PROVIDER_URL WEB3_WS_PROVIDER_URL
    ;;
  bridge)
    # onchain-queue lives outside this repo (it holds the minter key)
    emit "$HOME/dev/ohmyverse/onchain-queue/.env" PLAYFAB_TITLE_ID PLAYFAB_SECRET_KEY PRIVATE_KEY \
      PUBLIC_KEY PROVIDER_URL CONTRACT_MATERIALS ESTIMATE_GAS FIXED_GAS_LIMIT DATABASE_URL \
      GOLF_API_KEY ALCHEMY_KEY
    ;;
  *)
    echo "usage: bash scripts/caprover-env.sh ws|web|chain|bridge" >&2
    exit 1
    ;;
esac
