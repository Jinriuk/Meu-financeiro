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
M="env PGOPTIONS=-cclient_min_messages=warning $P"   # migrations: sem os avisos de "já existe"
$M -f "$DIR/base_producao.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118030000_seguranca_webhook_e_status_servidor.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118030000_seguranca_webhook_e_status_servidor.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118030100_monitoramento_erros.sql" >/dev/null 2>&1
$M -f "$ROOT/supabase/migrations/20261118030100_monitoramento_erros.sql" >/dev/null 2>&1   # idempotente
$M -f "$ROOT/supabase/migrations/20261118100000_fase1_estrutura_times.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118100000_fase1_estrutura_times.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118110000_fase1_fatos_por_pessoa.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118110000_fase1_fatos_por_pessoa.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118120000_fase1_convites.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118120000_fase1_convites.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118120100_fase1_indices.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118120100_fase1_indices.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118130000_fase1_dinheiro_time.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118130000_fase1_dinheiro_time.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118140000_fase1_abertura_planilha.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118140000_fase1_abertura_planilha.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118150000_fase1_modo_time.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118150000_fase1_modo_time.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118160000_fase1_visao_reload_avisos.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118160000_fase1_visao_reload_avisos.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261119100000_fase1_grade_regras.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261119100000_fase1_grade_regras.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261119200000_fase1_papeis_convite.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261119200000_fase1_papeis_convite.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118072145_webhook_revoga_so_o_plano_do_pedido.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118072145_webhook_revoga_so_o_plano_do_pedido.sql" >/dev/null   # idempotente
for f in f05_f06 f17 fase1 fase1_fatos fase1_convites fase1_dinheiro fase1_abertura fase1_modo_time fase1_visao fase1_grade fase1_papeis webhook; do
  $P -f "$DIR/$f.sql" >"$TMP/$f.out" 2>&1 || echo "FALHA  $f.sql abortou: $(grep -m1 -E 'ERROR|FATAL' "$TMP/$f.out")" >>"$TMP/$f.out"
done
OUT="$(cat "$TMP"/*.out | sed -E 's/.*NOTICE:  //' | grep -E '^(OK|FALHA)' || true)"
echo "$OUT"
FAL=$(echo "$OUT" | grep -c '^FALHA' || true); OKQ=$(echo "$OUT" | grep -c '^OK?' || true)
echo "---"; echo "$(echo "$OUT" | grep -c '^OK ') ok · $OKQ barrado com outro erro · $FAL falha(s)"
[ "$FAL" = "0" ]
