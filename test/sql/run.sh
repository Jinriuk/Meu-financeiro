#!/usr/bin/env bash
# Sobe um Postgres descartável, carrega o recorte de produção, aplica a migration e roda os cenários.
# Uso: bash test/sql/run.sh   (precisa de postgresql 15+ instalado: initdb/pg_ctl)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"; ROOT="$DIR/../.."
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"; export PATH="$BIN:$PATH"
TMP="$(mktemp -d)"; trap 'pg_ctl -D "$TMP/db" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$TMP"; else RUN=""; fi
$RUN initdb -D "$TMP/db" -A trust -U postgres >/dev/null
$RUN pg_ctl -D "$TMP/db" -o "-k $TMP -p 55432 -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null
P="psql -h $TMP -p 55432 -U postgres -d postgres -q -v ON_ERROR_STOP=1"
$P -f "$DIR/base_producao.sql" >/dev/null
$P -f "$ROOT/supabase/migrations/20261117140000_seguranca_webhook_e_status_servidor.sql" >/dev/null
$P -f "$ROOT/supabase/migrations/20261117140000_seguranca_webhook_e_status_servidor.sql" >/dev/null   # idempotente
$P -f "$ROOT/supabase/migrations/20261118090000_monitoramento_erros.sql" >/dev/null 2>&1
$P -f "$ROOT/supabase/migrations/20261118090000_monitoramento_erros.sql" >/dev/null 2>&1   # idempotente
OUT="$( { $P -f "$DIR/f05_f06.sql"; $P -f "$DIR/f17.sql"; } 2>&1 | sed -n 's/.*NOTICE:  //p' | grep -E '^(OK|FALHA)')"
echo "$OUT"
FAL=$(echo "$OUT" | grep -c '^FALHA' || true); OKQ=$(echo "$OUT" | grep -c '^OK?' || true)
echo "---"; echo "$(echo "$OUT" | grep -c '^OK ') ok · $OKQ barrado com outro erro · $FAL falha(s)"
[ "$FAL" = "0" ]
