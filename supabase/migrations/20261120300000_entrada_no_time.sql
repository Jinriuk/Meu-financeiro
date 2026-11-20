-- ============================================================
-- Entrada no time e faixa do contrato. Idempotente.
--
-- 1) Convite com conta que já existe. Todo cadastro normal cria uma conta individual, e o convite recusava qualquer
--    conta que já estivesse em outro lugar ("cada conta fica num lugar só"): jogador que já usava o app, ou que criou a
--    conta antes de clicar no link, não entrava no time. Agora a conta individual VIRA do time:
--      · o histórico dela (torneios, mãos, imports, movimentos) vai junto, no nome que o time deu à pessoa. É histórico
--        de antes do time: fica na raiz (fora da vista do professor) e fora da banca do time (regras da fase 1);
--      · as salas e a config da conta individual ficam guardadas em conta_individual_arquivada (não entram na banca);
--      · a conta individual deixa de existir.
--    Continua recusando: conta que está em outro TIME, e conta individual com plano pago ativo (pra ninguém perder o
--    que pagou sem falar com o suporte).
-- 2) Código do time. O time divulga um código (ex.: SAMBA-36510). Quem tem conta, ou cria uma, digita o código e pede
--    pra entrar. O pedido fica pendente até alguém com "gerir pessoas" aprovar, escolhendo a reta (ou a raiz, pra
--    decidir a reta depois). Aprovado, a conta entra no time do mesmo jeito do convite. Assentos do contrato valem.
-- 3) Faixa do contrato (plano mestre 3.3, confirmado pelo Samba): "o % de cada saque sai do Lifetime no dia do saque:
--    abaixo de 10k, 35% do valor sacado; a partir de 10k, 40%". Lifetime = já sacado + profit de agora. Antes o saque
--    era dividido em pedaços pelas faixas e o lifetime contava só o já sacado.
-- ============================================================

-- ---------- 1) a conta individual vira do time ----------
create table if not exists public.conta_individual_arquivada (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null,              -- a conta individual que deixou de existir
  time_id uuid not null,                   -- o time pra onde a conta foi
  dados jsonb not null,                    -- conta, config, salas e histórico de ajustes (o que não foi pro time)
  arquivado_em timestamptz not null default now()
);
alter table public.conta_individual_arquivada enable row level security;   -- sem policy: só o servidor lê
revoke all on public.conta_individual_arquivada from anon, authenticated;

-- interna: leva a conta (e o histórico dela) pro time, no nome da pessoa do time
create or replace function public.levar_conta_pro_time(p_uid uuid, p_ws uuid, p_pessoa uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare w record; v_nome text;
begin
  select nome into v_nome from public.pessoa where id = p_pessoa and workspace_id = p_ws;
  if v_nome is null then raise exception 'pessoa do time não encontrada'; end if;
  for w in select x.* from public.workspaces x join public.workspace_members m on m.workspace_id = x.id
            where m.user_id = p_uid and x.id <> p_ws loop
    if w.kind <> 'solo' or exists (select 1 from public.workspace_members m2 where m2.workspace_id = w.id and m2.user_id <> p_uid) then
      raise exception 'Tua conta já está em outro time. Por enquanto uma conta fica em um time só: saia do outro time ou entre com outro e-mail.'
        using errcode = 'check_violation'; end if;
    if w.trial_ends_at is null then
      raise exception 'Tua conta individual tem plano pago ativo. Fale com o suporte antes de entrar no time, pra não perder o que você pagou.'
        using errcode = 'check_violation'; end if;
    insert into public.conta_individual_arquivada(user_id, workspace_id, time_id, dados)
    values (p_uid, w.id, p_ws, jsonb_build_object('conta', to_jsonb(w),
      'config', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.pool_config c where c.workspace_id = w.id),
      'salas', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.player_wallets s where s.workspace_id = w.id),
      'ajustes', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.config_changes a where a.workspace_id = w.id)));
    -- mãos/torneio repetidos (mesma sala e id) não podem colidir na chave única quando ganham o mesmo nome
    delete from public.hh_tournament_stats a using public.hh_tournament_stats b
     where a.workspace_id = w.id and b.workspace_id = w.id and a.site = b.site and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
    delete from public.hh_tournament_stats a where a.workspace_id = w.id and exists (select 1 from public.hh_tournament_stats b
      where b.workspace_id = p_ws and b.player = v_nome and b.site = a.site and b.site_tournament_id = a.site_tournament_id);
    delete from public.tournaments a using public.tournaments b
     where a.workspace_id = w.id and b.workspace_id = w.id and a.site_tournament_id is not null and a.site = b.site
       and a.site_tournament_id = b.site_tournament_id and a.id < b.id;
    delete from public.tournaments a where a.workspace_id = w.id and a.site_tournament_id is not null and exists (select 1 from public.tournaments b
      where b.workspace_id = p_ws and b.player = v_nome and b.site = a.site and b.site_tournament_id = a.site_tournament_id);
    -- o histórico vai pro time; o gatilho liga cada linha à pessoa e à unidade da data (antes do time = raiz)
    update public.tournaments set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.hh_tournament_stats set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.hh_import_log set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.daily_entries set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.bankroll_ledger set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    update public.withdrawals set workspace_id = p_ws, player = v_nome where workspace_id = w.id;
    -- o resto era da conta individual: guardado acima, sai daqui
    delete from public.player_wallets where workspace_id = w.id;
    delete from public.config_changes where workspace_id = w.id;
    delete from public.pool_config where workspace_id = w.id;
    delete from public.workspace_members where workspace_id = w.id;
    delete from public.workspaces where id = w.id;
  end loop;
end $$;
revoke all on function public.levar_conta_pro_time(uuid,uuid,uuid) from public, anon, authenticated;

-- convite: igual ao de antes, mas a conta individual vira do time em vez de travar a entrada
create or replace function public.aceitar_convite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c record; uid uuid := auth.uid(); p uuid; v_nome text;
begin
  if uid is null then raise exception 'entre na sua conta pra aceitar o convite' using errcode = 'insufficient_privilege'; end if;
  select cv.*, u.arquivada into c from public.convite cv join public.unidade u on u.id = cv.unidade_id
   where cv.token_hash = public.convite_hash(p_token) for update of cv;
  if c.id is null or c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Convite inválido, vencido ou já usado. Peça um link novo pro gestor.'; end if;
  if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  -- quem já passou pelo time e volta: o registro antigo fica com o histórico, sem a conta
  update public.pessoa set user_id = null where workspace_id = c.workspace_id and user_id = uid and status = 'saiu';
  if c.pessoa_id is not null then
    update public.pessoa set user_id = uid, status = 'ativo'
     where id = c.pessoa_id and user_id is null and status = 'convidado' returning id into p;
    if p is null then raise exception 'Esse convite não vale mais. Peça um link novo pro gestor.'; end if;
  else
    v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''), 'Jogador'), 50);
    if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
      v_nome := v_nome || ' #' || left(replace(uid::text, '-', ''), 4);
    end if;
    insert into public.pessoa(workspace_id, user_id, nome, status) values (c.workspace_id, uid, v_nome, 'ativo') returning id into p;
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, c.unidade_id, 'entrada');
  end if;
  perform public.levar_conta_pro_time(uid, c.workspace_id, p);   -- conta individual vira do time (ou recusa, explicando)
  insert into public.workspace_members(workspace_id, user_id, role) values (c.workspace_id, uid, 'member') on conflict do nothing;
  update public.convite set usos = usos + 1 where id = c.id;
  update public.pedido_entrada set status = 'cancelado', decidido_em = now() where user_id = uid and status = 'pendente';
  return p;
end $$;
revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;

-- ---------- 2) código do time e pedido de entrada ----------
create table if not exists public.time_codigo (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Z0-9]{2,10}-[0-9]{5}$'),
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
alter table public.time_codigo enable row level security;
revoke all on public.time_codigo from anon, authenticated;
grant select on public.time_codigo to authenticated;
drop policy if exists time_codigo_ler on public.time_codigo;
create policy time_codigo_ler on public.time_codigo for select to authenticated
  using (workspace_id in (select u.workspace_id from public.unidade u where u.mae_id is null and u.id in (select public.unidades_com('gerir_pessoas'))));

create table if not exists public.pedido_entrada (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  time_nome text,                          -- quem pede ainda não é do time (não lê o workspace): guarda o nome aqui
  status text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  criado_em timestamptz not null default now(),
  decidido_por uuid, decidido_em timestamptz, motivo text,
  unidade_id uuid references public.unidade(id),
  pessoa_id uuid references public.pessoa(id)
);
create unique index if not exists pedido_entrada_um_pendente on public.pedido_entrada (workspace_id, user_id) where status = 'pendente';
create index if not exists pedido_entrada_user on public.pedido_entrada (user_id);
create index if not exists pedido_entrada_unidade on public.pedido_entrada (unidade_id);
create index if not exists pedido_entrada_pessoa on public.pedido_entrada (pessoa_id);
alter table public.pedido_entrada enable row level security;
revoke all on public.pedido_entrada from anon, authenticated;
grant select on public.pedido_entrada to authenticated;
drop policy if exists pedido_entrada_ler on public.pedido_entrada;
create policy pedido_entrada_ler on public.pedido_entrada for select to authenticated
  using (user_id = (select auth.uid())
         or workspace_id in (select u.workspace_id from public.unidade u where u.id in (select public.unidades_com('gerir_pessoas'))));

-- quem gere pessoas na raiz gera (ou troca) o código do time; o anterior para de valer
create or replace function public.gerar_codigo_time() returns text
language plpgsql security definer set search_path = '' as $$
declare ws uuid; base text; cod text; tentativa int := 0;
begin
  select u.workspace_id into ws from public.unidade u
   where u.mae_id is null and u.id in (select public.unidades_com('gerir_pessoas')) order by u.criado_em limit 1;
  if ws is null then raise exception 'precisa de "gerir pessoas" no time inteiro' using errcode = 'insufficient_privilege'; end if;
  base := left(regexp_replace(upper(translate((select name from public.workspaces where id = ws),
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z0-9]', '', 'g'), 10);
  if length(base) < 2 then base := 'TIME'; end if;
  loop
    tentativa := tentativa + 1;
    cod := base || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (select 1 from public.time_codigo where codigo = cod) or tentativa > 20;
  end loop;
  insert into public.time_codigo(workspace_id, codigo, ativo) values (ws, cod, true)
  on conflict (workspace_id) do update set codigo = excluded.codigo, ativo = true, criado_por = auth.uid(), criado_em = now();
  return cod;
end $$;

-- o jogador (com conta, em qualquer lugar menos outro time) pede pra entrar pelo código
create or replace function public.pedir_entrada_time(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tc record; v_nome text; novo uuid; ja uuid;
begin
  if uid is null then raise exception 'entre na sua conta pra usar o código do time' using errcode = 'insufficient_privilege'; end if;
  select t.*, w.name as time_nome into tc from public.time_codigo t join public.workspaces w on w.id = t.workspace_id
   where t.codigo = upper(btrim(coalesce(p_codigo, ''))) and t.ativo;
  if tc.workspace_id is null then raise exception 'Código não encontrado. Confira com o time (ex.: SAMBA-36510).'; end if;
  if exists (select 1 from public.pessoa where workspace_id = tc.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  if exists (select 1 from public.workspaces x join public.workspace_members m on m.workspace_id = x.id
              where m.user_id = uid and x.id <> tc.workspace_id and x.kind <> 'solo') then
    raise exception 'Tua conta já está em outro time. Por enquanto uma conta fica em um time só.' using errcode = 'check_violation'; end if;
  select id into ja from public.pedido_entrada where workspace_id = tc.workspace_id and user_id = uid and status = 'pendente';
  if ja is not null then return jsonb_build_object('pedido', ja, 'time', tc.time_nome, 'status', 'pendente'); end if;
  v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''),
                          split_part((select email from auth.users where id = uid), '@', 1), 'Jogador'), 50);
  insert into public.pedido_entrada(workspace_id, user_id, nome, time_nome) values (tc.workspace_id, uid, v_nome, tc.time_nome) returning id into novo;
  perform public.avisar_gestores(tc.workspace_id, public.raiz_do_ws(tc.workspace_id), 'gerir_pessoas', 'entrada',
    v_nome || ' pediu pra entrar no time', 'Pelo código do time. Aprove escolhendo a reta.', novo);
  return jsonb_build_object('pedido', novo, 'time', tc.time_nome, 'status', 'pendente');
end $$;

-- quem gere pessoas aprova (escolhendo a reta, ou a raiz pra decidir depois) ou recusa
create or replace function public.decidir_entrada(p_pedido uuid, p_aprovar boolean, p_unidade uuid default null,
                                                  p_nome text default null, p_motivo text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pe record; u record; p uuid; v_nome text;
begin
  select * into pe from public.pedido_entrada where id = p_pedido for update;
  if pe.id is null or pe.status <> 'pendente' then raise exception 'pedido não está mais pendente'; end if;
  if not p_aprovar then
    if not exists (select 1 from public.unidade x where x.workspace_id = pe.workspace_id and x.id in (select public.unidades_com('gerir_pessoas'))) then
      raise exception 'precisa de "gerir pessoas" no time' using errcode = 'insufficient_privilege'; end if;
    update public.pedido_entrada set status = 'recusado', decidido_por = auth.uid(), decidido_em = now(), motivo = nullif(btrim(p_motivo), '') where id = pe.id;
    return null;
  end if;
  select * into u from public.unidade where id = coalesce(p_unidade, public.raiz_do_ws(pe.workspace_id));
  if u.id is null or u.workspace_id <> pe.workspace_id or u.arquivada then raise exception 'escolha uma reta do time'; end if;
  if not public.pode('gerir_pessoas', u.id) then
    raise exception 'precisa de "gerir pessoas" nessa reta' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where workspace_id = pe.workspace_id and user_id = pe.user_id and status <> 'saiu') then
    raise exception 'essa conta já faz parte do time'; end if;
  v_nome := left(coalesce(nullif(btrim(p_nome), ''), pe.nome), 60);
  if exists (select 1 from public.pessoa where workspace_id = pe.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
    raise exception 'já existe alguém com o nome "%" no time: escolha outro nome', v_nome; end if;
  update public.pessoa set user_id = null where workspace_id = pe.workspace_id and user_id = pe.user_id and status = 'saiu';
  insert into public.pessoa(workspace_id, user_id, nome, status) values (pe.workspace_id, pe.user_id, v_nome, 'ativo') returning id into p;
  insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, u.id, 'entrada');
  perform public.levar_conta_pro_time(pe.user_id, pe.workspace_id, p);
  insert into public.workspace_members(workspace_id, user_id, role) values (pe.workspace_id, pe.user_id, 'member') on conflict do nothing;
  update public.pedido_entrada set status = 'aprovado', decidido_por = auth.uid(), decidido_em = now(), unidade_id = u.id, pessoa_id = p where id = pe.id;
  perform public.avisar_pessoa(p, 'entrada', 'Você entrou no time',
    case when u.mae_id is null then 'O time ainda vai escolher a sua reta.' else 'Reta: ' || u.nome || coalesce(' · ' || u.rotulo, '') end, pe.id);
  return p;
end $$;

-- o próprio jogador desiste do pedido
create or replace function public.cancelar_pedido_entrada(p_pedido uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.pedido_entrada set status = 'cancelado', decidido_em = now()
   where id = p_pedido and user_id = auth.uid() and status = 'pendente';
  if not found then raise exception 'pedido não encontrado ou já decidido'; end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['gerar_codigo_time()','pedir_entrada_time(text)','decidir_entrada(uuid,boolean,uuid,text,text)','cancelar_pedido_entrada(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- 3) faixa do contrato: a do Lifetime (já sacado + profit) no dia do saque, pro saque inteiro ----------
create or replace function public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare f jsonb; pct numeric; jog numeric;
begin
  if p_cashout is null or p_cashout <= 0 then return jsonb_build_object('jogador', 0, 'time', 0, 'faixas', '[]'::jsonb); end if;
  -- a primeira faixa cujo limite o lifetime ainda não alcançou ("abaixo de 10k"); a última é aberta
  select x into f from jsonb_array_elements(p_faixas) x
   where coalesce((x->>'ate')::numeric, 1e15) > coalesce(p_lifetime, 0)
   order by coalesce((x->>'ate')::numeric, 1e15) limit 1;
  if f is null then select x into f from jsonb_array_elements(p_faixas) x order by coalesce((x->>'ate')::numeric, 1e15) desc limit 1; end if;
  pct := (f->>'jogador')::numeric;
  jog := round(p_cashout * pct, 2);
  return jsonb_build_object('jogador', jog, 'time', round(p_cashout - jog, 2),
    'faixas', jsonb_build_array(jsonb_build_object('lifetime', coalesce(p_lifetime, 0), 'ate', f->'ate', 'valor', p_cashout, 'jogador_pct', pct)));
end $$;

-- prévia do saque: a faixa sai do lifetime do dia (já sacado + profit pela banca do SISTEMA, que o aluno não digita)
create or replace function public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; mu numeric; lt numeric; lucro numeric; lt_dia numeric; d jsonb;
begin
  s := public.situacao_jogador(p_pessoa);
  if s->'contrato' is null or s->'contrato' = 'null'::jsonb then raise exception 'jogador sem contrato definido'; end if;
  mu := (s->>'mu')::numeric; lt := (s->>'lifetime')::numeric;
  p_devolucao := coalesce(p_devolucao, 0); p_cashout := coalesce(p_cashout, 0);
  if p_banca is null or p_banca < 0 then raise exception 'informe a banca atual'; end if;
  if p_devolucao < 0 or p_cashout < 0 or p_devolucao + p_cashout <= 0 then raise exception 'informe a devolução e/ou o cashout'; end if;
  lucro := p_banca - mu;
  if p_devolucao > mu then raise exception 'devolução (%) maior que o MU (%)', p_devolucao, mu; end if;
  if p_cashout > greatest(lucro, 0) then raise exception 'cashout (%) maior que o lucro (%): banca % − MU %', p_cashout, greatest(lucro, 0), p_banca, mu; end if;
  if p_devolucao + p_cashout > p_banca then raise exception 'saque maior que a banca'; end if;
  lt_dia := lt + ((s->>'banca')::numeric - mu);
  d := public.dividir_cashout(s->'contrato', lt_dia, p_cashout);
  return jsonb_build_object(
    'banca', p_banca, 'mu_antes', mu, 'lucro_antes', lucro, 'lifetime_antes', lt, 'lifetime_dia', lt_dia,
    'devolucao', p_devolucao, 'cashout', p_cashout,
    'parte_jogador', (d->>'jogador')::numeric, 'parte_time', (d->>'time')::numeric,
    'total_time', p_devolucao + (d->>'time')::numeric,
    'banca_depois', p_banca - p_devolucao - p_cashout, 'mu_depois', mu - p_devolucao,
    'divisao', d);
end $$;
