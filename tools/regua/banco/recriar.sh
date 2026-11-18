#!/usr/bin/env bash
# F0.7: recria o banco do ZERO só com o que está no repositório e tira o retrato do schema public.
# Uso: bash tools/regua/banco/recriar.sh [ate_versao]   -> imprime o catálogo em JSON
#   ate_versao: aplica só as migrations com versão <= essa (ex.: 20260805135400 = o que está em produção hoje)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$DIR/../../.."; ATE="${1:-99999999999999}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"; export PATH="$BIN:$PATH"
TMP="$(mktemp -d)"; trap 'pg_ctl -D "$TMP/db" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$TMP"; else RUN=""; fi
$RUN initdb -D "$TMP/db" -A trust -U postgres >/dev/null
$RUN pg_ctl -D "$TMP/db" -o "-k $TMP -p 55433 -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null
P="psql -h $TMP -p 55433 -U postgres -d postgres -q -v ON_ERROR_STOP=1"
$P -f "$DIR/supabase_minimo.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/2*.sql; do
  v="$(basename "$f" | cut -d_ -f1)"; [ "$v" -le "$ATE" ] || continue
  $P -f "$f" >/dev/null 2>"$TMP/err" || { echo "FALHOU em $(basename "$f")" >&2; cat "$TMP/err" >&2; exit 1; }
done
if [ -n "${DUMP:-}" ]; then pg_dump -h "$TMP" -p 55433 -U postgres -d postgres --schema-only --no-owner --schema=public > "$DUMP"; fi
$P -At -f "$DIR/${CATALOGO:-catalogo.sql}"
