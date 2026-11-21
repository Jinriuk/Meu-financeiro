-- ============================================================
-- Time suspenso travado no BANCO, não só na tela (pedido do dono, 21/11: "temos de proteger").
-- Antes, a suspensão travava só o app: pela API (o mesmo endereço que o app usa, com o login da própria pessoa) quem é do
-- time suspenso ainda conseguia gravar. Agora:
--   · ws_ativo (a regra de gravação das tabelas de jogo, que já barrava teste grátis vencido) também exige o time não
--     suspenso;
--   · um gatilho em cada tabela do time recusa gravar (incluir, mudar ou apagar) quando o time está suspenso, inclusive
--     pelas funções do servidor (que passam por cima da RLS). Só o gestor geral e o SQL Editor passam.
--   · ler continua: os dados são do time (como no teste grátis vencido).
-- E sai o "erros do app" do console (pedido do dono): a função erros_do_time e a contagem de erros nas listas.
-- Idempotente.
-- ============================================================

-- ---------- regra de gravação das tabelas de jogo ----------
create or replace function public.ws_ativo(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.trial_ends_at is null or w.trial_ends_at > now()) and w.suspenso_em is null);
$$;

-- ---------- gatilho: time suspenso não grava ----------
create or replace function public.trava_time_suspenso() returns trigger
language plpgsql security definer set search_path = '' as $$
declare novo uuid; velho uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;          -- SQL Editor e serviço
  if tg_op <> 'DELETE' then novo := new.workspace_id; end if;
  if tg_op <> 'INSERT' then velho := old.workspace_id; end if;
  if exists (select 1 from public.workspaces w where w.id in (novo, velho) and w.suspenso_em is not null)
     and not exists (select 1 from public.gestor_plataforma g where g.user_id = auth.uid()) then
    raise exception 'o acesso deste time está suspenso: fale com o admin do time' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
-- vínculo e acesso não têm workspace_id: o time vem da pessoa
create or replace function public.trava_time_suspenso_pessoa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then p := old.pessoa_id; else p := new.pessoa_id; end if;
  if exists (select 1 from public.pessoa pe join public.workspaces w on w.id = pe.workspace_id where pe.id = p and w.suspenso_em is not null)
     and not exists (select 1 from public.gestor_plataforma g where g.user_id = auth.uid()) then
    raise exception 'o acesso deste time está suspenso: fale com o admin do time' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.trava_time_suspenso() from public, anon, authenticated;
revoke all on function public.trava_time_suspenso_pessoa() from public, anon, authenticated;

-- nome com "zz_": roda depois do set_ws e do zz_fato_pessoa (que preenchem o time e a pessoa da linha)
do $$
declare t text;
begin
  foreach t in array array['abertura', 'acerto_saida', 'aporte', 'bankroll_ledger', 'conferencia_saldo', 'config_changes', 'contrato', 'convite',
                           'daily_entries', 'grade', 'hh_import_log', 'hh_tournament_stats', 'pedido_entrada', 'pessoa', 'player_wallets', 'pool_config',
                           'regra_unidade', 'reload', 'saque', 'time_codigo', 'tournaments', 'unidade', 'withdrawals'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists zz_time_suspenso on public.%I', t);
    execute format('create trigger zz_time_suspenso before insert or update or delete on public.%I for each row execute function public.trava_time_suspenso()', t);
  end loop;
  foreach t in array array['vinculo', 'acesso'] loop
    execute format('drop trigger if exists zz_time_suspenso on public.%I', t);
    execute format('create trigger zz_time_suspenso before insert or update or delete on public.%I for each row execute function public.trava_time_suspenso_pessoa()', t);
  end loop;
end $$;

-- ---------- console sem "erros do app" ----------
drop function if exists public.erros_do_time(uuid, integer);

drop function if exists public.times_da_plataforma();
create function public.times_da_plataforma()
returns table(id uuid, nome text, tipo text, criado_em timestamptz, assentos int, pessoas int, jogadores int, convidados int,
              admins text, tem_dono boolean, admin_pendente boolean, ultimo_lancamento date, marca_nome text, tem_logo boolean,
              com_conta int, jogadores_cadastrados int, jogando_7d int, n_admins int, n_professores int, n_financeiros int, n_outros int,
              contrato_fim date, suspenso_em timestamptz, suspenso_motivo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query
  select w.id, w.name, w.kind, w.created_at, w.assentos,
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status <> 'saiu'),
         (select count(*)::int from public.vinculo v join public.pessoa p on p.id = v.pessoa_id where p.workspace_id = w.id and v.fim is null and p.status = 'ativo'),
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status = 'convidado'),
         (select string_agg(distinct p.nome, ', ') from public.pessoa p join public.acesso a on a.pessoa_id = p.id join public.unidade u on u.id = a.unidade_id
           where p.workspace_id = w.id and u.mae_id is null and 'administrar' = any(a.capacidades) and p.status <> 'saiu'),
         exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.role = 'owner'),
         exists (select 1 from public.pessoa p join public.acesso a on a.pessoa_id = p.id join public.unidade u on u.id = a.unidade_id
                  where p.workspace_id = w.id and p.status = 'convidado' and u.mae_id is null and 'administrar' = any(a.capacidades)),
         (select max(t.entry_date)::date from public.tournaments t where t.workspace_id = w.id),
         w.marca_nome, w.marca_logo is not null,
         (select count(*)::int from public.pessoa p where p.workspace_id = w.id and p.status = 'ativo' and p.user_id is not null),
         (select count(distinct v.pessoa_id)::int from public.vinculo v join public.pessoa p on p.id = v.pessoa_id
           where p.workspace_id = w.id and v.fim is null and p.status <> 'saiu'),
         (select count(distinct t.pessoa_id)::int from public.tournaments t
           where t.workspace_id = w.id and t.pessoa_id is not null and t.entry_date >= current_date - 6),
         coalesce(r.adm, 0), coalesce(r.prof, 0), coalesce(r.fin, 0), coalesce(r.outros, 0),
         w.contrato_fim, w.suspenso_em, w.suspenso_motivo
    from public.workspaces w
    left join lateral (
      -- papel de cada pessoa pelas capacidades (as mesmas dos pacotes do app): admin > financeiro > professor > outros
      select count(*) filter (where 'administrar' = any(x.cs))::int adm,
             count(*) filter (where not 'administrar' = any(x.cs) and 'aprovar_saques' = any(x.cs))::int fin,
             count(*) filter (where not 'administrar' = any(x.cs) and not 'aprovar_saques' = any(x.cs)
                                and x.cs && array['ver_desempenho', 'promover'])::int prof,
             count(*) filter (where not 'administrar' = any(x.cs) and not 'aprovar_saques' = any(x.cs)
                                and not x.cs && array['ver_desempenho', 'promover'])::int outros
        from (select p.id, array_agg(distinct c) cs
                from public.pessoa p join public.acesso a on a.pessoa_id = p.id cross join lateral unnest(a.capacidades) c
               where p.workspace_id = w.id and p.status <> 'saiu' group by p.id) x) r on true
   where w.kind in ('time', 'pool', 'team')      -- 'team' = os times antigos (antes da fase 1)
   order by w.created_at;
end $$;

drop function if exists public.contas_da_plataforma();
create function public.contas_da_plataforma()
returns table(id uuid, nome text, apelido text, email text, plano text, teste_ate timestamptz, criado_em timestamptz,
              torneios int, ultimo_lancamento date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.checar_gestor_geral();
  return query
  select w.id, w.name, pp.nickname, u.email::text, w.plan, w.trial_ends_at, w.created_at,
         (select count(*)::int from public.tournaments t where t.workspace_id = w.id),
         (select max(t.entry_date)::date from public.tournaments t where t.workspace_id = w.id)
    from public.workspaces w
    left join lateral (select m.user_id from public.workspace_members m where m.workspace_id = w.id
                        order by (m.role = 'owner') desc, m.created_at limit 1) dono on true
    left join auth.users u on u.id = dono.user_id
    left join public.player_profiles pp on pp.user_id = dono.user_id
   where w.kind = 'solo'
     and not exists (select 1 from public.gestor_plataforma g where g.user_id = dono.user_id)   -- a conta central não é cliente
   order by w.created_at desc;
end $$;

revoke all on function public.times_da_plataforma() from public, anon;
grant execute on function public.times_da_plataforma() to authenticated;
revoke all on function public.contas_da_plataforma() from public, anon;
grant execute on function public.contas_da_plataforma() to authenticated;
