-- ============================================================
-- Só o aluno mexe na própria conta (pedido do dono, 21/11). Professor, financeiro e admin VEEM a conta do aluno (painel,
-- torneios, stats, gráficos, banca), mas não incluem, mudam nem apagam nada dela: torneio (nem o nome), dia, mãos e
-- estatísticas, importação, movimento da banca, saque da conta ou saldo de sala.
-- Antes, dentro do time, quem administra gravava torneios/mãos/dias do aluno e quem aprova saques gravava a banca, os
-- saques e as salas dele.
-- Continua igual (são processos do time, não a conta do aluno): aprovar ou recusar saque e reload, conferir a planilha
-- que o próprio aluno mandou, registrar o capital mandado, mudar de reta, o nome no time e a saída do time.
-- Movimento do time sem jogador (ex.: Reserva) segue com quem cuida da raiz: não é conta de aluno.
-- Ler não muda. Quem vê a linha e tenta mudar recebe 403 (não "0 linhas"). Idempotente.
-- ============================================================
do $$
declare r record; ler text; gravar text;
begin
  for r in select * from (values
      ('tournaments','ver_desempenho','administrar'),
      ('hh_tournament_stats','ver_desempenho','administrar'),
      ('daily_entries','ver_desempenho','administrar'),
      ('hh_import_log','ver_desempenho','administrar'),
      ('bankroll_ledger','ver_financeiro','aprovar_saques'),
      ('withdrawals','ver_financeiro','aprovar_saques'),
      ('player_wallets','ver_financeiro','aprovar_saques')
    ) as t(tabela, cap_ler, cap_gravar)
  loop
    continue when to_regclass('public.' || r.tabela) is null;
    -- ler: igual a antes (o aluno, e quem tem a capacidade na unidade da linha)
    ler := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%1$L))
           or (unidade_id is not null and pessoa_id in (select public.pessoas_com(%1$L))))$c$, r.cap_ler);
    -- gravar: no time, só o dono da linha; linha sem jogador (do time, fica na raiz) com quem tem a capacidade ali.
    -- Conta individual e pool antigo seguem como eram.
    gravar := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or (pessoa_id is null and unidade_id in (select public.unidades_com(%1$L))))$c$, r.cap_gravar);
    execute format('drop policy if exists fato_ler on public.%I', r.tabela);
    execute format('drop policy if exists fato_inserir on public.%I', r.tabela);
    execute format('drop policy if exists fato_editar on public.%I', r.tabela);
    execute format('drop policy if exists fato_apagar on public.%I', r.tabela);
    execute format('create policy fato_ler on public.%I for select to authenticated using (%s)', r.tabela, ler);
    execute format('create policy fato_inserir on public.%I for insert to authenticated with check (%s)', r.tabela, gravar);
    execute format('create policy fato_editar on public.%I for update to authenticated using (%s) with check (%s)', r.tabela, ler, gravar);
    execute format('create policy fato_apagar on public.%I for delete to authenticated using (%s)', r.tabela, gravar);
  end loop;
end $$;
