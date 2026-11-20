-- ============================================================
-- Caça-bugs (BUG-7): quem cuida do aluno HOJE enxerga o histórico dele de dentro do time. Idempotente.
--
-- Antes, cada fato (torneio, movimento, sala, saque, reload, planilha) só aparecia pra quem tem a permissão na reta
-- ONDE ele aconteceu. Depois de uma promoção, o professor novo só via o que veio depois: o painel do aluno aberto por
-- ele montava banca e make-up diferentes da lista de jogadores (que soma tudo no servidor), e o Diário e o Mês
-- ficavam sem o passado do aluno no time.
-- Agora quem tem a permissão na reta ATUAL do aluno também lê os fatos dele das retas por onde ele passou.
-- Continua igual (regras da fase 1):
--   · o fato fica gravado com a reta da data (a grade julga o torneio pela reta em que ele foi jogado), e quem cuidava
--     da reta antiga continua vendo o que foi jogado lá;
--   · o que é de ANTES de o aluno entrar no time fica na raiz: só quem tem a permissão na raiz vê;
--   · professor só de desempenho não vê dinheiro; financeiro não vê torneio nem stats.
-- Gravar segue as mesmas capacidades, com a mesma regra da reta atual.
-- ============================================================

-- pessoas com vínculo ATIVO numa unidade em que tenho a capacidade (as de baixo valem; 'administrar' vale por todas)
create or replace function public.pessoas_com(p_cap text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select v.pessoa_id from public.vinculo v
   where v.fim is null and v.unidade_id in (select public.unidades_com(p_cap));
$$;
-- unidades dos meus times que não são a raiz (fato na raiz = de antes do time, ou de quem joga na raiz)
create or replace function public.unidades_internas() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.unidade u where u.mae_id is not null and u.workspace_id in (select public.my_workspaces());
$$;
revoke all on function public.pessoas_com(text) from public, anon;
revoke all on function public.unidades_internas() from public, anon;
grant execute on function public.pessoas_com(text) to authenticated;
grant execute on function public.unidades_internas() to authenticated;

-- ---------- fatos: torneios, stats, diário antigo, log de import, movimentos, saques do pool, salas ----------
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
    ler := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%1$L))
           or (pessoa_id in (select public.pessoas_com(%1$L)) and unidade_id in (select public.unidades_internas())))$c$, r.cap_ler);
    gravar := format($c$workspace_id in (select public.my_workspaces())
      and (workspace_id not in (select public.ws_estruturados())
           or pessoa_id in (select public.minhas_pessoas())
           or unidade_id in (select public.unidades_com(%1$L))
           or (pessoa_id in (select public.pessoas_com(%1$L)) and unidade_id in (select public.unidades_internas())))$c$, r.cap_gravar);
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

-- ---------- dinheiro do time: saque, aporte (MU), reload e planilha (sempre de dentro do time) ----------
drop policy if exists aporte_ler on public.aporte;
create policy aporte_ler on public.aporte for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro'))
         or pessoa_id in (select public.pessoas_com('ver_financeiro')));
drop policy if exists saque_ler on public.saque;
create policy saque_ler on public.saque for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro'))
         or pessoa_id in (select public.pessoas_com('ver_financeiro')));
drop policy if exists reload_ler on public.reload;
create policy reload_ler on public.reload for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro'))
         or pessoa_id in (select public.pessoas_com('ver_financeiro')));
drop policy if exists abertura_ler on public.abertura;
create policy abertura_ler on public.abertura for select to authenticated
  using (pessoa_id in (select public.minhas_pessoas()) or unidade_id in (select public.unidades_com('ver_financeiro'))
         or pessoa_id in (select public.pessoas_com('ver_financeiro')));
