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
$M -f "$ROOT/supabase/migrations/20261120100000_cacabugs_historico_visivel.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120100000_cacabugs_historico_visivel.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120200000_cacabugs_dinheiro_time.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120200000_cacabugs_dinheiro_time.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120300000_entrada_no_time.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120300000_entrada_no_time.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120400000_historico_so_do_jogador.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120400000_historico_so_do_jogador.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120500000_saida_do_jogador.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120500000_saida_do_jogador.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120600000_regras_por_reta.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120600000_regras_por_reta.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120700000_gestor_geral.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120700000_gestor_geral.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120800000_bateria_permissoes.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120800000_bateria_permissoes.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120900000_dinheiro_por_sala.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120900000_dinheiro_por_sala.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261120910000_marca_do_time.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261120910000_marca_do_time.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261121100000_console_plataforma.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261121100000_console_plataforma.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261121110000_time_suspenso_no_banco.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261121110000_time_suspenso_no_banco.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261121120000_so_o_aluno_mexe_na_conta.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261121120000_so_o_aluno_mexe_na_conta.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261121130000_revisao_por_conta.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261121130000_revisao_por_conta.sql" >/dev/null   # idempotente
$M -f "$ROOT/supabase/migrations/20261118072145_webhook_revoga_so_o_plano_do_pedido.sql" >/dev/null
$M -f "$ROOT/supabase/migrations/20261118072145_webhook_revoga_so_o_plano_do_pedido.sql" >/dev/null   # idempotente
for f in f05_f06 f17 fase1 fase1_fatos fase1_convites fase1_dinheiro fase1_abertura fase1_modo_time fase1_visao fase1_grade fase1_papeis matriz_papeis entrada_time historico_jogador saida_jogador regras_reta gestor_geral salas marca console_plataforma time_suspenso so_o_aluno bateria_permissoes exemplo_samba revisao_por_conta webhook; do
  $P -f "$DIR/$f.sql" >"$TMP/$f.out" 2>&1 || echo "FALHA  $f.sql abortou: $(grep -m1 -E 'ERROR|FATAL' "$TMP/$f.out")" >>"$TMP/$f.out"
done
# oráculo do dinheiro: históricos aleatórios (semente fixa) conferidos contra um modelo escrito a partir das regras
node "$DIR/oraculo.mjs" > "$TMP/oraculo.sql" && { $P -f "$TMP/oraculo.sql" >"$TMP/oraculo.out" 2>&1 || echo "FALHA  oraculo.sql abortou: $(grep -m1 -E 'ERROR|FATAL' "$TMP/oraculo.out")" >>"$TMP/oraculo.out"; }
OUT="$(cat "$TMP"/*.out | sed -E 's/.*NOTICE:  //' | grep -E '^(OK|FALHA|CONHECIDO)' || true)"
echo "$OUT"
FAL=$(echo "$OUT" | grep -c '^FALHA' || true); OKQ=$(echo "$OUT" | grep -c '^OK?' || true); CON=$(echo "$OUT" | grep -c '^CONHECIDO' || true)
# CONHECIDO = bug já achado e ainda não corrigido (test/sql/matriz_papeis.sql): aparece no relatório, não derruba o CI
echo "---"; echo "$(echo "$OUT" | grep -c '^OK ') ok · $OKQ barrado com outro erro · $CON bug(s) conhecido(s) · $FAL falha(s)"
[ "$FAL" = "0" ]
