--
-- PostgreSQL database dump
--

\restrict A7xb2tAVbN1OT6t7hHN7Jb52mAkvl5N2pDiiFhz5PeZnZ6cTjM4cyPF1JUqtcPy

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: aceitar_convite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aceitar_convite(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c record; uid uuid := auth.uid(); p uuid; v_nome text;
begin
  if uid is null then raise exception 'entre na sua conta pra aceitar o convite' using errcode = 'insufficient_privilege'; end if;
  select cv.*, u.arquivada into c from public.convite cv join public.unidade u on u.id = cv.unidade_id
   where cv.token_hash = public.convite_hash(p_token) for update of cv;
  if c.id is null or c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max) then
    raise exception 'Convite inválido, vencido ou já usado. Pede um link novo pro gestor.'; end if;
  if exists (select 1 from public.workspace_members where user_id = uid and workspace_id <> c.workspace_id) then
    raise exception 'Tua conta já está em outro time ou numa conta individual. Por enquanto cada conta fica num lugar só: entra com outro e-mail pra aceitar este convite.'; end if;
  if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and user_id = uid and status <> 'saiu') then
    raise exception 'Você já faz parte deste time.'; end if;
  -- quem já passou pelo time e volta: o registro antigo fica com o histórico, sem a conta
  update public.pessoa set user_id = null where workspace_id = c.workspace_id and user_id = uid and status = 'saiu';
  if c.pessoa_id is not null then
    update public.pessoa set user_id = uid, status = 'ativo'
     where id = c.pessoa_id and user_id is null and status = 'convidado' returning id into p;
    if p is null then raise exception 'Esse convite não vale mais. Pede um link novo pro gestor.'; end if;
  else
    v_nome := left(coalesce(nullif(btrim((select nickname from public.player_profiles where user_id = uid)), ''), 'Jogador'), 50);
    if exists (select 1 from public.pessoa where workspace_id = c.workspace_id and status <> 'saiu' and lower(btrim(nome)) = lower(v_nome)) then
      v_nome := v_nome || ' #' || left(replace(uid::text, '-', ''), 4);
    end if;
    insert into public.pessoa(workspace_id, user_id, nome, status) values (c.workspace_id, uid, v_nome, 'ativo') returning id into p;
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, c.unidade_id, 'entrada');
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (c.workspace_id, uid, 'member') on conflict do nothing;
  update public.convite set usos = usos + 1 where id = c.id;
  return p;
end $$;


--
-- Name: apagar_aviso(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apagar_aviso(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.aviso where id = p_id and user_id = auth.uid();
$$;


--
-- Name: apagar_avisos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apagar_avisos() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.aviso where user_id = auth.uid();
$$;


--
-- Name: apagar_grade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apagar_grade(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare g record;
begin
  select * into g from public.grade where id = p_id;
  if g.id is null then raise exception 'grade não existe'; end if;
  if not public.pode('configurar_regras', g.unidade_id) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  delete from public.grade where id = p_id;
end $$;


--
-- Name: aplicar_ativacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aplicar_ativacao() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare act record; wid uuid; meu_email text;
begin
  meu_email := lower(coalesce(auth.jwt()->>'email',''));
  if meu_email='' then return null; end if;
  select * into act from public.plan_activations where lower(email)=meu_email and status='pending' order by created_at limit 1;
  if act.id is null then return null; end if;
  select workspace_id into wid from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  if wid is null then return null; end if;
  update public.workspaces set plan=act.plan, trial_ends_at=null where id=wid;
  update public.plan_activations set status='used', used_at=now(), used_by=auth.uid() where id=act.id;
  return act.plan;
end $$;


--
-- Name: arquivar_unidade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.arquivar_unidade(p_alvo uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare un record;
begin
  select * into un from public.unidade where id = p_alvo;
  if un.id is null then raise exception 'unidade não existe'; end if;
  if un.mae_id is null then raise exception 'a raiz do time não pode ser arquivada'; end if;
  if not public.pode('administrar', un.mae_id) then raise exception 'só quem administra a unidade de cima arquiva' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.unidade f where f.mae_id = p_alvo and not f.arquivada) then
    raise exception 'arquive antes as unidades que estão dentro desta'; end if;
  if exists (select 1 from public.vinculo v join public.unidade t on t.id = v.unidade_id
              where v.fim is null and t.caminho like un.caminho || '%') then
    raise exception 'ainda tem jogador nesta unidade: mova ou registre a saída antes'; end if;
  update public.unidade set arquivada = true where id = p_alvo;
  update public.convite set revogado = true where unidade_id = p_alvo and not revogado;
end $$;


--
-- Name: avisar_erros(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_erros() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare url text; txt text; n int; ids bigint[];
begin
  select array_agg(id order by id) into ids from (select id from public.app_erros where avisado_em is null order by id limit 500) s;
  n := coalesce(array_length(ids,1),0);
  if n = 0 then return null; end if;
  select 'GrinderBank: ' || n || ' erro(s) novo(s) — ' ||
         string_agg(origem || ' ' || c, ', ' order by origem) into txt
    from (select origem, count(*) c from public.app_erros where id = any(ids) group by origem) g;
  select txt || ' | ' || string_agg(left(regexp_replace(mensagem, '[^ -~À-ÿ]', ' ', 'g'), 120), ' | ') into txt
    from (select mensagem from public.app_erros where id = any(ids) order by id desc limit 3) m;
  select nullif(trim(value),'') into url from public.app_secrets where name = 'alerta_webhook_url';
  if url is not null then
    begin
      if url ~ 'discord' then
        execute 'select net.http_post(url := $1, body := $2, headers := ''{"Content-Type":"application/json"}''::jsonb)' using url, jsonb_build_object('content', txt);
      elsif url ~ 'hooks\.slack' then
        execute 'select net.http_post(url := $1, body := $2, headers := ''{"Content-Type":"application/json"}''::jsonb)' using url, jsonb_build_object('text', txt);
      else   -- ntfy.sh e afins: publica em JSON na raiz do servidor ({topic, message})
        execute 'select net.http_post(url := $1, body := $2, headers := ''{"Content-Type":"application/json"}''::jsonb)'
          using 'https://' || split_part(url,'/',3), jsonb_build_object('topic', split_part(url,'/',4), 'message', txt);
      end if;
    exception when others then
      raise notice 'aviso não saiu: %', sqlerrm;   -- registra e tenta de novo na próxima rodada
      return txt;
    end;
  end if;
  update public.app_erros set avisado_em = now() where id = any(ids);
  return txt;
end $_$;


--
-- Name: avisar_gestores(uuid, uuid, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_gestores(p_ws uuid, p_unidade uuid, p_cap text, p_tipo text, p_titulo text, p_texto text, p_ref uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.aviso(workspace_id, user_id, tipo, titulo, texto, ref_id)
  select distinct p_ws, p.user_id, p_tipo, p_titulo, p_texto, p_ref
    from public.acesso a
    join public.pessoa p on p.id = a.pessoa_id
    join public.unidade u on u.id = a.unidade_id
    join public.unidade t on t.id = p_unidade
   where p.user_id is not null and p.status = 'ativo' and p.workspace_id = p_ws
     and t.caminho like u.caminho || '%'
     and (p_cap = any(a.capacidades) or 'administrar' = any(a.capacidades))
     and p.user_id is distinct from auth.uid();
$$;


--
-- Name: avisar_pessoa(uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_pessoa(p_pessoa uuid, p_tipo text, p_titulo text, p_texto text, p_ref uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.aviso(workspace_id, user_id, tipo, titulo, texto, ref_id)
  select p.workspace_id, p.user_id, p_tipo, p_titulo, p_texto, p_ref from public.pessoa p
   where p.id = p_pessoa and p.user_id is not null and p.user_id is distinct from auth.uid();
$$;


--
-- Name: aviso_abertura(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_abertura() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if new.status = 'enviada' and (tg_op = 'INSERT' or new.enviado_em is distinct from old.enviado_em) then
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'planilha', nome || ' enviou a planilha pra conferir',
      'MakeUp ' || public.fmt_usd(new.mu) || ' · cashout ' || public.fmt_usd(new.cashout), new.id);
  elsif tg_op = 'UPDATE' and new.status = 'confirmada' and old.status <> 'confirmada' then
    perform public.avisar_pessoa(new.pessoa_id, 'planilha', 'Planilha conferida pelo time', null, new.id);
  end if;
  return null;
end $$;


--
-- Name: aviso_entrada(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_entrada() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  if new.user_id is not null and new.status = 'ativo' and old.user_id is null then
    select v.unidade_id into u from public.vinculo v where v.pessoa_id = new.id and v.fim is null;
    if u is null then select a.unidade_id into u from public.acesso a where a.pessoa_id = new.id limit 1; end if;
    if u is not null then
      perform public.avisar_gestores(new.workspace_id, u, 'gerir_pessoas', 'entrada', new.nome || ' entrou no time', null, new.id);
    end if;
  end if;
  return null;
end $$;


--
-- Name: aviso_entrada_vinculo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_entrada_vinculo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare pe record;
begin
  select * into pe from public.pessoa where id = new.pessoa_id;
  if new.motivo = 'entrada' and pe.user_id is not null and pe.status = 'ativo' then
    perform public.avisar_gestores(pe.workspace_id, new.unidade_id, 'gerir_pessoas', 'entrada', pe.nome || ' entrou no time', null, pe.id);
  end if;
  return null;
end $$;


--
-- Name: aviso_saque(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_saque() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare nome text;
begin
  select pe.nome into nome from public.pessoa pe where pe.id = new.pessoa_id;
  if tg_op = 'INSERT' then
    perform public.avisar_gestores(new.workspace_id, new.unidade_id, 'aprovar_saques', 'saque', nome || ' pediu saque',
      'Time recebe ' || public.fmt_usd(new.total_time) || ' (MU ' || public.fmt_usd(new.devolucao) || ' + cashout ' || public.fmt_usd(new.cashout) || ')', new.id);
  elsif new.status is distinct from old.status and new.status in ('aprovado','recusado','pago') then
    perform public.avisar_pessoa(new.pessoa_id, 'saque',
      case new.status when 'aprovado' then 'Saque aprovado' when 'recusado' then 'Saque recusado' else 'Saque confirmado pelo time' end,
      case new.status when 'aprovado' then 'Pode mandar ' || public.fmt_usd(new.total_time) || ' pro time.'
                      when 'recusado' then new.motivo
                      else case when coalesce(new.diferenca, 0) = 0 then 'Recebido certinho.' else 'Recebido com diferença de ' || public.fmt_usd(new.diferenca) || '.' end end,
      new.id);
  end if;
  return null;
end $$;


--
-- Name: cancelar_reload(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_reload(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.reload r set status = 'cancelado', decidido_em = now(), decidido_por = auth.uid()
   where r.id = p_id and r.status = 'solicitado' and r.pessoa_id in (select x.id from public.pessoa x where x.user_id = auth.uid());
  if not found then raise exception 'só o próprio jogador cancela, e só enquanto está solicitado'; end if;
end $$;


--
-- Name: cancelar_saque(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_saque(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.saque s set status = 'cancelado', decidido_em = now(), decidido_por = auth.uid()
   where s.id = p_id and s.status = 'solicitado'
     and s.pessoa_id in (select x.id from public.pessoa x where x.user_id = auth.uid());
  if not found then raise exception 'só o próprio jogador cancela, e só enquanto está solicitado'; end if;
end $$;


--
-- Name: caps_validas(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.caps_validas(p_caps text[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select p_caps is not null and cardinality(p_caps) > 0 and p_caps <@ array[
    'ver_desempenho','gerir_pessoas','promover','configurar_regras','ver_financeiro','aprovar_saques','administrar']::text[];
$$;


--
-- Name: checar_admin_do_time(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checar_admin_do_time(p_ws uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.acesso a join public.pessoa p on p.id = a.pessoa_id
                  where a.unidade_id = public.raiz_do_ws(p_ws) and 'administrar' = any(a.capacidades)
                    and p.user_id is not null and p.status = 'ativo') then
    raise exception 'o time precisa de pelo menos um admin com conta: dê o papel de admin a outra pessoa antes' using errcode = 'check_violation';
  end if;
end $$;


--
-- Name: conferir_abertura(uuid, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare a record; nome text; s jsonb;
begin
  select * into a from public.abertura where pessoa_id = p_pessoa for update;
  if a.id is null then raise exception 'esse jogador não enviou planilha'; end if;
  if not public.pode('aprovar_saques', a.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = p_pessoa and user_id = auth.uid()) then
    raise exception 'ninguém confere a própria planilha' using errcode = 'insufficient_privilege'; end if;
  if p_mu is null or p_cashout is null or p_mu < 0 or p_cashout < 0 then raise exception 'MU e cashout precisam ser de 0 pra cima'; end if;
  update public.abertura set status = 'confirmada', mu = round(p_mu, 2), cashout = round(p_cashout, 2),
         confirmado_por = auth.uid(), confirmado_em = now() where id = a.id;
  -- salas do aluno com o saldo da planilha (só as que ele ainda não tem)
  select pe.nome into nome from public.pessoa pe where pe.id = p_pessoa;
  if jsonb_typeof(a.planilha->'saldos') = 'array' then
    for s in select x from jsonb_array_elements(a.planilha->'saldos') x loop
      continue when coalesce((s->>'saldo')::numeric, 0) <= 0 or coalesce(btrim(s->>'sala'), '') = '';
      if not exists (select 1 from public.player_wallets w where w.workspace_id = a.workspace_id
                       and lower(btrim(w.player)) = lower(btrim(nome)) and lower(w.wallet) = lower(btrim(s->>'sala'))) then
        insert into public.player_wallets(workspace_id, player, wallet, saldo_inicial)
        values (a.workspace_id, nome, btrim(s->>'sala'), round((s->>'saldo')::numeric, 2));
      end if;
    end loop;
  end if;
end $$;


--
-- Name: confirmar_envio_reload(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmar_envio_reload(p_id uuid, p_valor numeric) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r record; ap uuid;
begin
  select * into r from public.reload where id = p_id for update;
  if r.id is null or not public.pode('aprovar_saques', r.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = r.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém confirma o próprio reload' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'aprovado' then raise exception 'só reload aprovado é enviado (está %)', r.status; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'informe quanto foi enviado'; end if;
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao)
  values (r.workspace_id, r.pessoa_id, r.unidade_id, round(p_valor, 2), current_date, 'reload' || coalesce(' · ' || r.sala, '')) returning id into ap;
  update public.reload set status = 'enviado', enviado_valor = round(p_valor, 2), enviado_em = now(), aporte_id = ap where id = p_id;
  perform public.avisar_pessoa(r.pessoa_id, 'reload', 'Reload enviado', public.fmt_usd(round(p_valor, 2)) || ' entrou no seu MU.', p_id);
  return ap;
end $$;


--
-- Name: confirmar_recebimento(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmar_recebimento(p_id uuid, p_recebido numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s record; dif numeric;
begin
  select * into s from public.saque where id = p_id for update;
  if s.id is null or not public.pode('aprovar_saques', s.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = s.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém confirma o próprio saque' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'aprovado' then raise exception 'só saque aprovado é confirmado (está %)', s.status; end if;
  if p_recebido is null or p_recebido < 0 then raise exception 'informe quanto o time recebeu'; end if;
  dif := round(p_recebido - s.total_time, 2);
  update public.saque set status = 'pago', recebido = round(p_recebido, 2), diferenca = dif, pago_em = now() where id = p_id;
  return jsonb_build_object('total_time', s.total_time, 'recebido', round(p_recebido, 2), 'diferenca', dif);
end $$;


--
-- Name: contrato_de(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contrato_de(p uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select c.faixas from public.contrato c where c.pessoa_id = p and c.inicio <= current_date order by c.inicio desc, c.criado_em desc limit 1),
    (select c.faixas from public.contrato c
       join public.unidade cu on cu.id = c.unidade_id
       join public.vinculo v on v.pessoa_id = p and v.fim is null
       join public.unidade pu on pu.id = v.unidade_id
      where c.pessoa_id is null and c.inicio <= current_date and pu.caminho like cu.caminho || '%'
      order by length(cu.caminho) desc, c.inicio desc, c.criado_em desc limit 1));
$$;


--
-- Name: convidar_equipe(text, uuid[], text[], uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; u uuid; p uuid; v_nome text := left(btrim(coalesce(p_nome, '')), 60);
begin
  if v_nome = '' then raise exception 'nome de quem vai entrar'; end if;
  if not public.caps_validas(p_caps) then raise exception 'papel inválido'; end if;
  if p_unidades is null or cardinality(p_unidades) = 0 then raise exception 'escolha onde a pessoa vai cuidar'; end if;
  if cardinality(p_unidades) > 50 then raise exception 'unidades demais'; end if;
  select workspace_id into ws from public.unidade where id = p_unidades[1];
  foreach u in array p_unidades loop
    if not exists (select 1 from public.unidade where id = u and workspace_id = ws and not arquivada) then
      raise exception 'unidade inválida ou arquivada'; end if;
    if not public.pode('administrar', u) then
      raise exception 'só quem administra convida professor, financeiro ou admin' using errcode = 'insufficient_privilege'; end if;
  end loop;
  if p_joga_em is not null and not exists (select 1 from public.unidade where id = p_joga_em and workspace_id = ws and not arquivada) then
    raise exception 'reta de jogo inválida'; end if;
  begin
    insert into public.pessoa(workspace_id, nome) values (ws, v_nome) returning id into p;
  exception when unique_violation then
    raise exception 'já tem alguém com o nome "%" no time', v_nome;
  end;
  insert into public.acesso(pessoa_id, unidade_id, capacidades)
  select p, x, (select array_agg(distinct c order by c) from unnest(p_caps) c) from (select distinct unnest(p_unidades) x) s;
  if p_joga_em is not null then
    insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, p_joga_em, 'entrada');
  end if;
  return p;
end $$;


--
-- Name: convidar_gestor(uuid, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; p uuid;
begin
  if not public.pode('administrar', p_unidade) then raise exception 'só quem administra a unidade convida gestores' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  insert into public.pessoa(workspace_id, nome) values (ws, p_nome) returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, p_unidade, p_caps);
  return p;
end $$;


--
-- Name: convidar_jogador(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text DEFAULT NULL::text, p_id_gg text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; p uuid;
begin
  if not public.pode('gerir_pessoas', p_unidade) then raise exception 'sem permissão pra convidar nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  insert into public.pessoa(workspace_id, nome, nick_ps, id_gg) values (ws, p_nome, p_nick_ps, p_id_gg) returning id into p;
  insert into public.vinculo(pessoa_id, unidade_id, motivo) values (p, p_unidade, 'entrada');
  return p;
end $$;


--
-- Name: convite_hash(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convite_hash(t text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex') $$;


--
-- Name: create_solo_workspace(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text DEFAULT 'gestao'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare wid uuid; pl text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from public.workspace_members where user_id=auth.uid()) then
    raise exception 'usuário já tem workspace';
  end if;
  pl := case when plan_escolhido in ('gestao','pro') then plan_escolhido else 'gestao' end;
  insert into public.workspaces (name,kind,plan,trial_ends_at)
    values (coalesce(nullif(trim(ws_name),''),'Meu grind'),'solo',pl, now() + interval '15 days')
    returning id into wid;
  insert into public.workspace_members (workspace_id,user_id,role) values (wid,auth.uid(),'owner');
  return wid;
end $$;


--
-- Name: criar_convite(uuid, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_convite(p_unidade uuid, p_pessoa uuid DEFAULT NULL::uuid, p_dias integer DEFAULT 7, p_usos integer DEFAULT NULL::integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; cam text; tok text; pes record;
begin
  if not public.pode('gerir_pessoas', p_unidade) then
    raise exception 'sem permissão pra convidar nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id, caminho into ws, cam from public.unidade where id = p_unidade and not arquivada;
  if ws is null then raise exception 'unidade não existe ou está arquivada'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 30 then raise exception 'validade do convite: de 1 a 30 dias'; end if;
  if p_pessoa is not null then
    select * into pes from public.pessoa where id = p_pessoa and workspace_id = ws;
    if pes.id is null or pes.user_id is not null or pes.status <> 'convidado' then
      raise exception 'essa pessoa já tem conta ou não está mais no time'; end if;
    if not exists (select 1 from public.vinculo v join public.unidade u on u.id = v.unidade_id
                    where v.pessoa_id = p_pessoa and v.fim is null and u.caminho like cam || '%')
       and not exists (select 1 from public.acesso a join public.unidade u on u.id = a.unidade_id
                    where a.pessoa_id = p_pessoa and u.caminho like cam || '%') then
      raise exception 'essa pessoa não está nesta unidade'; end if;
    if exists (select 1 from public.acesso where pessoa_id = p_pessoa) and not public.pode('administrar', p_unidade) then
      raise exception 'convite de gestor: só quem administra a unidade' using errcode = 'insufficient_privilege'; end if;
    update public.convite set revogado = true where pessoa_id = p_pessoa and not revogado;   -- um link vivo por pessoa
    p_usos := 1;
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.convite(workspace_id, unidade_id, pessoa_id, token_hash, expira_em, usos_max)
  values (ws, p_unidade, p_pessoa, public.convite_hash(tok), now() + make_interval(days => p_dias), p_usos);
  return tok;
end $$;


--
-- Name: criar_time(text, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_time(p_nome text, p_dono uuid, p_nome_dono text DEFAULT NULL::text, p_assentos integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; raiz uuid; p uuid; nick text;
begin
  if coalesce(btrim(p_nome), '') = '' then raise exception 'nome do time'; end if;
  if not exists (select 1 from auth.users where id = p_dono) then raise exception 'conta do dono não existe'; end if;
  if exists (select 1 from public.workspace_members where user_id = p_dono) then
    raise exception 'essa conta já está em outro workspace (uma conta, um lugar até a fase 2): use outra conta pro dono do time'; end if;
  insert into public.workspaces(name, kind, plan, trial_ends_at, assentos) values (btrim(p_nome), 'time', 'team', null, p_assentos) returning id into ws;
  insert into public.workspace_members(workspace_id, user_id, role) values (ws, p_dono, 'owner');
  insert into public.unidade(workspace_id, nome, rotulo) values (ws, btrim(p_nome), 'Time') returning id into raiz;
  select nickname into nick from public.player_profiles where user_id = p_dono;
  insert into public.pessoa(workspace_id, user_id, nome, status)
  values (ws, p_dono, left(coalesce(nullif(btrim(p_nome_dono), ''), nullif(btrim(nick), ''), 'Gestor'), 60), 'ativo') returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  insert into public.pool_config(workspace_id, player1_name, player2_name, player_pct, banca_inicial, piso_minimo, makeup_max_recomendado,
                                 abi_max, abi_max_player1, abi_max_player2, week_start_date)
  values (ws, '', '', 1, 0, 0, 0, 2, 2, 0, current_date);
  return ws;
end $$;


--
-- Name: criar_unidade(uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.criar_unidade(p_mae uuid, p_nome text, p_rotulo text DEFAULT NULL::text, p_ordem integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; nova uuid;
begin
  if not public.pode('administrar', p_mae) then raise exception 'sem permissão nesta unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = p_mae;
  insert into public.unidade(workspace_id, mae_id, nome, rotulo, ordem) values (ws, p_mae, p_nome, p_rotulo, p_ordem) returning id into nova;
  return nova;
end $$;


--
-- Name: decidir_reload(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r record;
begin
  select * into r from public.reload where id = p_id for update;
  if r.id is null or not public.pode('aprovar_saques', r.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = r.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém aprova o próprio reload' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'solicitado' then raise exception 'reload não está aguardando decisão (está %)', r.status; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo da recusa'; end if;
  update public.reload set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_por = auth.uid(), decidido_em = now(), motivo_recusa = case when p_aprovar then null else p_motivo end where id = p_id;
  perform public.avisar_pessoa(r.pessoa_id, 'reload', case when p_aprovar then 'Reload aprovado' else 'Reload recusado' end,
                               case when p_aprovar then 'O time vai mandar ' || public.fmt_usd(r.valor) || '.' else p_motivo end, p_id);
end $$;


--
-- Name: decidir_saque(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s record;
begin
  select * into s from public.saque where id = p_id for update;
  if s.id is null or not public.pode('aprovar_saques', s.unidade_id) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.pessoa where id = s.pessoa_id and user_id = auth.uid()) then
    raise exception 'ninguém aprova o próprio saque' using errcode = 'insufficient_privilege'; end if;
  if s.status <> 'solicitado' then raise exception 'saque não está aguardando decisão (está %)', s.status; end if;
  if not p_aprovar and coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo da recusa'; end if;
  update public.saque set status = case when p_aprovar then 'aprovado' else 'recusado' end,
         decidido_por = auth.uid(), decidido_em = now(), motivo = p_motivo where id = p_id;
end $$;


--
-- Name: definir_acesso(uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.pode('administrar', p_unidade) then raise exception 'só quem administra a unidade define acessos nela' using errcode = 'insufficient_privilege'; end if;
  if p_caps is null or cardinality(p_caps) = 0 then
    delete from public.acesso where pessoa_id = p_alvo and unidade_id = p_unidade;
  else
    insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p_alvo, p_unidade, p_caps)
      on conflict (pessoa_id, unidade_id) do update set capacidades = excluded.capacidades;
  end if;
end $$;


--
-- Name: definir_contrato(uuid, uuid, jsonb, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date DEFAULT CURRENT_DATE) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; alvo uuid; novo uuid;
begin
  perform public.validar_faixas(p_faixas);
  if p_pessoa is not null then
    select unidade_id into alvo from public.vinculo where pessoa_id = p_pessoa and fim is null;
    if alvo is null then raise exception 'pessoa sem vínculo ativo'; end if;
  else alvo := p_unidade; end if;
  if alvo is null or not public.pode('configurar_regras', alvo) then
    raise exception 'precisa de "configurar_regras" na unidade' using errcode = 'insufficient_privilege'; end if;
  select workspace_id into ws from public.unidade where id = alvo;
  insert into public.contrato(workspace_id, unidade_id, pessoa_id, faixas, inicio)
  values (ws, case when p_pessoa is null then p_unidade end, p_pessoa, p_faixas, coalesce(p_inicio, current_date)) returning id into novo;
  return novo;
end $$;


--
-- Name: definir_papel(uuid, uuid[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare pes record; u uuid; tira boolean := p_caps is null or cardinality(p_caps) = 0;
begin
  select * into pes from public.pessoa where id = p_alvo;
  if pes.id is null or pes.status = 'saiu' then raise exception 'pessoa não está no time'; end if;
  if not public.pode('administrar', public.raiz_do_ws(pes.workspace_id)) then
    raise exception 'só o admin do time muda papéis' using errcode = 'insufficient_privilege'; end if;
  if not tira then
    if not public.caps_validas(p_caps) then raise exception 'papel inválido'; end if;
    if p_unidades is null or cardinality(p_unidades) = 0 then raise exception 'escolha onde a pessoa vai cuidar'; end if;
    foreach u in array p_unidades loop
      if not exists (select 1 from public.unidade where id = u and workspace_id = pes.workspace_id and not arquivada) then
        raise exception 'unidade inválida ou arquivada'; end if;
    end loop;
  end if;
  delete from public.acesso where pessoa_id = p_alvo;
  if not tira then
    insert into public.acesso(pessoa_id, unidade_id, capacidades)
    select p_alvo, x, (select array_agg(distinct c order by c) from unnest(p_caps) c) from (select distinct unnest(p_unidades) x) s;
  end if;
  perform public.checar_admin_do_time(pes.workspace_id);
  -- sem papel e sem reta: a pessoa sai do time (o histórico de quem jogou fica)
  if tira and not exists (select 1 from public.vinculo where pessoa_id = p_alvo and fim is null) then
    update public.pessoa set status = 'saiu' where id = p_alvo;
    update public.convite set revogado = true where pessoa_id = p_alvo and not revogado;
    if pes.user_id is not null then
      delete from public.workspace_members where workspace_id = pes.workspace_id and user_id = pes.user_id and role <> 'owner';
    end if;
  end if;
end $$;


--
-- Name: definir_regra(uuid, text, jsonb, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date DEFAULT NULL::date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u record;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_chave not in ('bloquear_promocao_com_mk', 'jogador_ve_ranking') then raise exception 'regra desconhecida: %', p_chave; end if;
  if jsonb_typeof(p_valor) <> 'boolean' then raise exception 'essa regra é ligada ou desligada (true/false)'; end if;
  insert into public.regra_unidade(workspace_id, unidade_id, chave, valor, vigente_desde, criado_por)
  values (u.workspace_id, p_unidade, p_chave, p_valor, coalesce(p_desde, current_date), auth.uid())
  on conflict (unidade_id, chave, vigente_desde) do update set valor = excluded.valor, criado_por = excluded.criado_por, criado_em = now();
end $$;


--
-- Name: dividir_cashout(jsonb, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare f jsonb; ini numeric := 0; fim numeric; a numeric; b numeric; parte numeric; jog numeric := 0; det jsonb := '[]'::jsonb;
begin
  if p_cashout is null or p_cashout <= 0 then return jsonb_build_object('jogador', 0, 'time', 0, 'faixas', det); end if;
  for f in select x from jsonb_array_elements(p_faixas) x order by coalesce((x->>'ate')::numeric, 1e15) loop
    fim := coalesce((f->>'ate')::numeric, 1e15);
    a := greatest(ini, p_lifetime); b := least(fim, p_lifetime + p_cashout);
    if b > a then
      parte := b - a;
      jog := jog + parte * (f->>'jogador')::numeric;
      det := det || jsonb_build_object('de', a, 'ate', b, 'valor', parte, 'jogador_pct', (f->>'jogador')::numeric);
    end if;
    ini := fim;
  end loop;
  jog := round(jog, 2);
  return jsonb_build_object('jogador', jog, 'time', round(p_cashout - jog, 2), 'faixas', det);
end $$;


--
-- Name: editar_unidade(uuid, text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem integer, p_arquivar boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.pode('administrar', p_alvo) then raise exception 'sem permissão nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_arquivar and exists (select 1 from public.vinculo v join public.unidade u on u.id = v.unidade_id
                           where v.fim is null and u.caminho like (select caminho from public.unidade where id = p_alvo) || '%') then
    raise exception 'há jogadores ativos nesta unidade: mova-os antes de arquivar';
  end if;
  update public.unidade set nome = coalesce(p_nome, nome), rotulo = p_rotulo, ordem = coalesce(p_ordem, ordem), arquivada = p_arquivar where id = p_alvo;
end $$;


--
-- Name: em_mk(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.em_mk(p_pessoa uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ab record; desde timestamptz; mu numeric; banca numeric;
begin
  select a.mu, a.confirmado_em, a.status into ab from public.abertura a where a.pessoa_id = p_pessoa;
  desde := case when ab.status = 'confirmada' then ab.confirmado_em else '-infinity'::timestamptz end;
  select coalesce(sum(valor), 0) into mu from public.aporte where pessoa_id = p_pessoa and criado_em > desde;
  select mu - coalesce(sum(devolucao), 0) into mu from public.saque where pessoa_id = p_pessoa and status = 'pago' and pago_em > desde;
  if ab.status = 'confirmada' then mu := mu + ab.mu; end if;
  select coalesce((select sum(w.saldo_inicial) from public.player_wallets w where w.pessoa_id = p_pessoa), 0)
       + coalesce((select sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end)
                     from public.tournaments t where t.pessoa_id = p_pessoa), 0)
       + coalesce((select sum(l.entrada - l.saida) from public.bankroll_ledger l where l.pessoa_id = p_pessoa), 0)
       - coalesce((select sum(q.devolucao + q.cashout) from public.saque q where q.pessoa_id = p_pessoa and q.status = 'pago'), 0)
    into banca;
  return round(banca, 2) < round(mu, 2);
end $$;


--
-- Name: email_for_login(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.email_for_login(identifier text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.email from public.player_profiles p
  where (p.nickname is not null and lower(p.nickname) = lower(trim(identifier)))
     or lower(p.email) = lower(trim(identifier))
     or (p.cpf is not null and p.cpf = regexp_replace(identifier, '\D', '', 'g'))
  limit 1;
$$;


--
-- Name: enviar_planilha(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enviar_planilha(p_planilha jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p uuid; ws uuid; u uuid; mu numeric; co numeric; novo uuid;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time envia planilha' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.abertura where pessoa_id = p and status = 'confirmada') then
    raise exception 'sua planilha já foi conferida pelo time; pra mudar, fale com quem aprova os saques'; end if;
  if jsonb_typeof(p_planilha) <> 'object' or length(p_planilha::text) > 200000 then raise exception 'planilha inválida'; end if;
  mu := round(coalesce((p_planilha->>'makeup')::numeric, -1), 2);
  co := round(coalesce((p_planilha->>'cashout')::numeric, -1), 2);
  if mu < 0 or co < 0 or mu > 10000000 or co > 10000000 then raise exception 'MakeUp e Cashout precisam ser números de 0 pra cima'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  insert into public.abertura(workspace_id, pessoa_id, unidade_id, status, mu, cashout, planilha)
  values (ws, p, u, 'enviada', mu, co, p_planilha)
  on conflict (pessoa_id) do update set unidade_id = excluded.unidade_id, mu = excluded.mu, cashout = excluded.cashout,
    planilha = excluded.planilha, enviado_por = auth.uid(), enviado_em = now()
  returning id into novo;
  return novo;
end $$;


--
-- Name: estruturar_workspace(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estruturar_workspace(ws uuid, jogadores jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare raiz uuid; j jsonb; p uuid; t text; uid uuid;
begin
  if exists (select 1 from public.unidade where workspace_id = ws) then raise exception 'workspace já estruturado'; end if;
  insert into public.unidade(workspace_id, nome, rotulo) select ws, name, 'Time' from public.workspaces where id = ws returning id into raiz;
  if raiz is null then raise exception 'workspace não existe'; end if;
  for j in select * from jsonb_array_elements(jogadores) loop
    uid := nullif(j->>'user_id', '')::uuid;
    if uid is not null and not exists (select 1 from public.workspace_members where workspace_id = ws and user_id = uid) then
      raise exception 'conta % não é membro do workspace', uid; end if;
    insert into public.pessoa(workspace_id, user_id, nome, status)
    values (ws, uid, j->>'nome', case when uid is null then 'convidado' else 'ativo' end)
    returning id into p;
    if coalesce((j->>'joga')::boolean, true) then
      insert into public.vinculo(pessoa_id, unidade_id, inicio, motivo) values (p, raiz, date '2000-01-01', 'entrada');
    end if;
    if coalesce((j->>'admin')::boolean, false) then
      insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
    end if;
  end loop;
  foreach t in array array['tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set pessoa_id = null where workspace_id = $1', t) using ws;   -- o gatilho liga pelo nome
    end if;
  end loop;
  return raiz;
end $_$;


--
-- Name: excluir_minha_conta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.excluir_minha_conta() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare uid uuid := auth.uid(); wsid uuid; membros int;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  for wsid in select workspace_id from public.workspace_members where user_id=uid loop
    select count(*) into membros from public.workspace_members where workspace_id=wsid;
    if membros<=1 then
      delete from public.bankroll_ledger      where workspace_id=wsid;
      delete from public.config_changes        where workspace_id=wsid;
      delete from public.daily_entries         where workspace_id=wsid;
      delete from public.hh_import_log          where workspace_id=wsid;
      delete from public.hh_tournament_stats    where workspace_id=wsid;
      delete from public.player_wallets         where workspace_id=wsid;
      delete from public.tournaments            where workspace_id=wsid;
      delete from public.withdrawals            where workspace_id=wsid;
      delete from public.pool_config            where workspace_id=wsid;
      delete from public.workspace_members      where workspace_id=wsid;
      delete from public.workspaces             where id=wsid;
    else
      delete from public.workspace_members where workspace_id=wsid and user_id=uid;
    end if;
  end loop;
  -- solta referências e apaga identidade
  update public.plan_activations set used_by=null where used_by=uid;
  delete from public.player_profiles where user_id=uid;
  delete from auth.users where id=uid;
end $$;


--
-- Name: fato_pessoa_unidade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fato_pessoa_unidade() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare j jsonb := to_jsonb(new); v_nome text; d date; resolver boolean;
begin
  if new.workspace_id is null or not exists (select 1 from public.unidade where workspace_id = new.workspace_id) then
    new.pessoa_id := null; new.unidade_id := null;
    return new;
  end if;
  v_nome := nullif(btrim(j->>'player'), '');
  if tg_op = 'INSERT' then
    resolver := true;
  else
    resolver := new.pessoa_id is null or new.pessoa_id is distinct from old.pessoa_id
             or v_nome is distinct from nullif(btrim(to_jsonb(old)->>'player'), '');
  end if;
  if v_nome is not null and resolver then
    new.pessoa_id := (select x.id from public.pessoa x
                       where x.workspace_id = new.workspace_id and lower(btrim(x.nome)) = lower(v_nome)
                       order by (x.status = 'saiu'), x.criado_em limit 1);
  end if;
  if new.pessoa_id is not null and not exists (select 1 from public.pessoa x where x.id = new.pessoa_id and x.workspace_id = new.workspace_id) then
    raise exception 'pessoa de outro workspace' using errcode = 'check_violation';
  end if;
  d := coalesce(left(nullif(j->>tg_argv[0], ''), 10)::date, current_date);
  new.unidade_id := public.unidade_na_data(new.pessoa_id, d, new.workspace_id);
  return new;
end $$;


--
-- Name: fmt_usd(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fmt_usd(v numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select 'US$ ' || translate(to_char(round(coalesce(v, 0), 2), 'FM999,999,999,990.00'), ',.', '.,');
$_$;


--
-- Name: iniciar_time(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.iniciar_time(p_nome_raiz text, p_nome_admin text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid; raiz uuid; p uuid;
begin
  select m.workspace_id into ws from public.workspace_members m
   where m.user_id = auth.uid() and m.role = 'owner' order by m.created_at limit 1;
  if ws is null then raise exception 'só o dono do workspace inicia o time' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.unidade where workspace_id = ws) then raise exception 'o time já tem estrutura'; end if;
  insert into public.unidade(workspace_id, nome, rotulo) values (ws, p_nome_raiz, 'Time') returning id into raiz;
  insert into public.pessoa(workspace_id, user_id, nome, status) values (ws, auth.uid(), p_nome_admin, 'ativo')
    on conflict (workspace_id, user_id) do update set status = 'ativo' returning id into p;
  insert into public.acesso(pessoa_id, unidade_id, capacidades) values (p, raiz, array['administrar']);
  return raiz;
end $$;


--
-- Name: marcar_avisos_lidos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_avisos_lidos() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.aviso set lido_em = now() where user_id = auth.uid() and lido_em is null;
$$;


--
-- Name: mesma_organizacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mesma_organizacao() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if (select workspace_id from public.pessoa where id = new.pessoa_id)
     is distinct from (select workspace_id from public.unidade where id = new.unidade_id) then
    raise exception 'pessoa e unidade de organizações diferentes';
  end if;
  return new;
end $$;


--
-- Name: meu_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.meu_status() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'agora', now(),
    'workspace_id', w.id,
    'plano', w.plan,
    'trial_ends_at', w.trial_ends_at,
    'ativo', (w.trial_ends_at is null or w.trial_ends_at > now()),
    'pode_stats', (w.kind <> 'solo' or w.plan in ('pro','founder','team')))
  from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid() order by m.created_at limit 1;
$$;


--
-- Name: minhas_pessoas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.minhas_pessoas() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id from public.pessoa p where p.user_id = auth.uid() and p.status = 'ativo';
$$;


--
-- Name: mover_jogador(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare atual record; cap text;
begin
  if p_motivo not in ('promocao','rebaixamento','transferencia') then raise exception 'motivo inválido'; end if;
  cap := case when p_motivo = 'transferencia' then 'gerir_pessoas' else 'promover' end;
  select * into atual from public.vinculo where pessoa_id = p_alvo and fim is null;
  if atual is null then raise exception 'jogador sem vínculo ativo'; end if;
  if atual.unidade_id = p_destino then raise exception 'jogador já está nesta unidade'; end if;
  if not (public.pode(cap, atual.unidade_id) and public.pode(cap, p_destino)) then
    raise exception 'precisa de "%" na unidade de origem e na de destino', cap using errcode = 'insufficient_privilege'; end if;
  if (select arquivada from public.unidade where id = p_destino) then raise exception 'unidade de destino arquivada'; end if;
  if p_motivo = 'promocao' and coalesce((public.regra_efetiva(atual.unidade_id, 'bloquear_promocao_com_mk'))::boolean, false)
     and public.em_mk(p_alvo) then
    raise exception 'jogador em MK: este time não promove com MK' using errcode = 'check_violation'; end if;
  update public.vinculo set fim = greatest(current_date, inicio) where id = atual.id;
  insert into public.vinculo(pessoa_id, unidade_id, inicio, motivo) values (p_alvo, p_destino, current_date, p_motivo);
  perform public.recalcular_fatos(p_alvo);
end $$;


--
-- Name: mover_unidade(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mover_unidade(p_alvo uuid, p_nova_mae uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (public.pode('administrar', p_alvo) and public.pode('administrar', p_nova_mae)) then
    raise exception 'precisa administrar a unidade e o novo lugar' using errcode = 'insufficient_privilege'; end if;
  if (select mae_id from public.unidade where id = p_alvo) is null then raise exception 'a raiz do time não se move'; end if;
  update public.unidade set mae_id = p_nova_mae where id = p_alvo;
end $$;


--
-- Name: my_workspaces(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_workspaces() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select workspace_id from public.workspace_members where user_id = auth.uid() $$;


--
-- Name: nickname_disponivel(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nickname_disponivel(nick text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select not exists (select 1 from public.player_profiles p where lower(p.nickname)=lower(trim(nick))) $$;


--
-- Name: pedir_reload(numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pedir_reload(p_valor numeric, p_sala text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p uuid; ws uuid; u uuid; nome text; novo uuid;
begin
  select pe.id, pe.workspace_id, pe.nome into p, ws, nome from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time pede reload' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor <= 0 or p_valor > 1000000 then raise exception 'valor do reload'; end if;
  if exists (select 1 from public.reload where pessoa_id = p and status in ('solicitado','aprovado')) then
    raise exception 'já existe um reload em aberto'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  insert into public.reload(workspace_id, pessoa_id, unidade_id, valor, sala, motivo)
  values (ws, p, u, round(p_valor, 2), nullif(btrim(p_sala), ''), nullif(btrim(p_motivo), '')) returning id into novo;
  perform public.avisar_gestores(ws, u, 'aprovar_saques', 'reload', nome || ' pediu reload de ' || public.fmt_usd(round(p_valor, 2)),
                                 concat_ws(' · ', nullif(btrim(p_sala), ''), nullif(btrim(p_motivo), '')), novo);
  return novo;
end $$;


--
-- Name: perfil_protegido(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.perfil_protegido() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare em text;
begin
  select u.email into em from auth.users u where u.id = new.user_id;
  if em is null then raise exception 'perfil sem usuário no auth'; end if;
  new.email := em;
  -- só o servidor (service_role / migrations) define papel diferente de 'solo' ou troca o papel
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then new.role := 'solo';
    else new.role := old.role; new.user_id := old.user_id; new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;


--
-- Name: perfil_sync_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.perfil_sync_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.player_profiles set email = new.email where user_id = new.id and email is distinct from new.email;
  return new;
end $$;


--
-- Name: pessoa_assentos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pessoa_assentos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lim int; usados int;
begin
  if new.status = 'saiu' then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'saiu' then return new; end if;
  select assentos into lim from public.workspaces where id = new.workspace_id;
  if lim is null then return new; end if;
  select count(*) into usados from public.pessoa where workspace_id = new.workspace_id and status <> 'saiu' and id <> new.id;
  if usados >= lim then raise exception 'limite de assentos do contrato atingido (%)', lim using errcode = 'check_violation'; end if;
  return new;
end $$;


--
-- Name: pode(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pode(cap text, alvo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.acesso a
      join public.pessoa p on p.id = a.pessoa_id
      join public.unidade u on u.id = a.unidade_id
      join public.unidade t on t.id = alvo
     where p.user_id = auth.uid() and p.status = 'ativo' and p.workspace_id = t.workspace_id
       and t.caminho like u.caminho || '%'
       and (cap = any(a.capacidades) or 'administrar' = any(a.capacidades)));
$$;


--
-- Name: pode_ver_pessoa(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pode_ver_pessoa(alvo uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.pessoa p where p.id = alvo and p.user_id = auth.uid())
      or exists (select 1 from public.vinculo v where v.pessoa_id = alvo
                   and (public.pode('ver_desempenho', v.unidade_id) or public.pode('gerir_pessoas', v.unidade_id)
                        or public.pode('ver_financeiro', v.unidade_id)))
      or exists (select 1 from public.acesso a where a.pessoa_id = alvo and public.pode('administrar', a.unidade_id));
$$;


--
-- Name: raiz_do_ws(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.raiz_do_ws(p_ws uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select id from public.unidade where workspace_id = p_ws and mae_id is null order by criado_em limit 1;
$$;


--
-- Name: recalcular_fatos(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalcular_fatos(p uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare t text;
begin
  foreach t in array array['tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set unidade_id = unidade_id where pessoa_id = $1', t) using p;   -- o gatilho recalcula
    end if;
  end loop;
end $_$;


--
-- Name: registrar_aporte(uuid, numeric, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_obs text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; ws uuid; novo uuid;
begin
  select v.unidade_id, p.workspace_id into u, ws from public.vinculo v join public.pessoa p on p.id = v.pessoa_id
   where v.pessoa_id = p_pessoa and v.fim is null;
  if u is null or not public.pode('aprovar_saques', u) then
    raise exception 'precisa de "aprovar_saques" na unidade do jogador' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor = 0 then raise exception 'valor do aporte'; end if;
  insert into public.aporte(workspace_id, pessoa_id, unidade_id, valor, data, observacao)
  values (ws, p_pessoa, u, round(p_valor, 2), coalesce(p_data, current_date), p_obs) returning id into novo;
  return novo;
end $$;


--
-- Name: registrar_erro(text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb DEFAULT NULL::jsonb, p_build text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare uid uuid := auth.uid(); ws uuid;
begin
  if uid is null then return; end if;
  if p_origem not in ('app','import') then return; end if;          -- cliente não fala por webhook/servidor
  -- limite: 30 por usuário por hora (erro em loop não enche o banco)
  if (select count(*) from public.app_erros where user_id = uid and created_at > now() - interval '1 hour') >= 30 then return; end if;
  select workspace_id into ws from public.workspace_members where user_id = uid order by created_at limit 1;
  insert into public.app_erros(origem, mensagem, detalhe, build, user_id, workspace_id)
  values (p_origem, left(coalesce(p_mensagem,'(sem mensagem)'), 500),
          case when p_detalhe is null or length(p_detalhe::text) > 4000 then null else p_detalhe end,
          left(p_build, 40), uid, ws);
end $$;


--
-- Name: registrar_saida(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_saida(p_alvo uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid; quem record;
begin
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select workspace_id, user_id into quem from public.pessoa where id = p_alvo;
  update public.vinculo set fim = greatest(current_date, inicio) where pessoa_id = p_alvo and fim is null;
  update public.pessoa set status = 'saiu' where id = p_alvo;
  delete from public.acesso where pessoa_id = p_alvo;
  if quem.user_id is not null then
    delete from public.workspace_members where workspace_id = quem.workspace_id and user_id = quem.user_id and role <> 'owner';
  end if;
end $$;


--
-- Name: regra_efetiva(uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.regra_efetiva(p_unidade uuid, p_chave text, p_data date DEFAULT CURRENT_DATE) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select r.valor
    from public.regra_unidade r
    join public.unidade u on u.id = r.unidade_id
    join public.unidade alvo on alvo.id = p_unidade and alvo.workspace_id = u.workspace_id
                            and alvo.workspace_id in (select public.my_workspaces())
   where r.chave = p_chave and r.vigente_desde <= coalesce(p_data, current_date)
     and alvo.caminho like u.caminho || '%'
   order by length(u.caminho) desc, r.vigente_desde desc
   limit 1;
$$;


--
-- Name: renomear_pessoa(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.renomear_pessoa(p_alvo uuid, p_nome text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare pes record; v_nome text := left(btrim(coalesce(p_nome, '')), 60); u uuid; t text;
begin
  select * into pes from public.pessoa where id = p_alvo;
  if pes.id is null or pes.status = 'saiu' then raise exception 'pessoa não está no time'; end if;
  if v_nome = '' then raise exception 'nome vazio'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_alvo and fim is null;
  if not (public.pode('administrar', public.raiz_do_ws(pes.workspace_id)) or (u is not null and public.pode('gerir_pessoas', u))) then
    raise exception 'sem permissão pra renomear' using errcode = 'insufficient_privilege'; end if;
  if v_nome = pes.nome then return; end if;
  begin
    update public.pessoa set nome = v_nome where id = p_alvo;
  exception when unique_violation then
    raise exception 'já tem alguém com o nome "%" no time', v_nome;
  end;
  -- os lançamentos se ligam à pessoa pelo nome: acompanham a troca (o gatilho religa à mesma pessoa)
  for t in select c.table_name::text from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'player'
              and c.table_name in ('tournaments','hh_tournament_stats','daily_entries','hh_import_log','bankroll_ledger','withdrawals','player_wallets')
              and exists (select 1 from information_schema.columns c2 where c2.table_schema = 'public'
                           and c2.table_name = c.table_name and c2.column_name = 'pessoa_id') loop
    execute format('update public.%I set player = $1 where pessoa_id = $2 and player is distinct from $1', t) using v_nome, p_alvo;
  end loop;
end $_$;


--
-- Name: renomear_unidade(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_nome text := left(btrim(coalesce(p_nome, '')), 60);
begin
  if not exists (select 1 from public.unidade where id = p_alvo) then raise exception 'unidade não existe'; end if;
  if not public.pode('administrar', p_alvo) then raise exception 'só quem administra a unidade renomeia' using errcode = 'insufficient_privilege'; end if;
  if v_nome = '' then raise exception 'nome vazio'; end if;
  begin
    update public.unidade set nome = v_nome, rotulo = nullif(left(btrim(coalesce(p_rotulo, '')), 40), '') where id = p_alvo;
  exception when unique_violation then
    raise exception 'já tem uma unidade "%" no mesmo lugar', v_nome;
  end;
end $$;


--
-- Name: resumo_time(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumo_time(p_desde date DEFAULT NULL::date) RETURNS TABLE(pessoa_id uuid, nome text, unidade_id uuid, unidade text, caminho text, status text, torneios integer, investido numeric, lucro numeric, roi numeric, abi numeric, ultimo_lancamento date, banca numeric, mu numeric, lucro_sacado numeric, planilha text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r record; perf boolean; din boolean; s jsonb;
begin
  for r in
    select p.id, p.nome, p.status, p.user_id, v.unidade_id, u.nome as unome, u.caminho
      from public.pessoa p
      join public.vinculo v on v.pessoa_id = p.id and v.fim is null
      join public.unidade u on u.id = v.unidade_id
     where p.status <> 'saiu' and p.workspace_id in (select public.my_workspaces())
  loop
    perf := r.user_id = auth.uid() or public.pode('ver_desempenho', r.unidade_id);
    din  := r.user_id = auth.uid() or public.pode('ver_financeiro', r.unidade_id);
    continue when not (perf or din);
    pessoa_id := r.id; nome := r.nome; unidade_id := r.unidade_id; unidade := r.unome; caminho := r.caminho; status := r.status;
    torneios := null; investido := null; lucro := null; roi := null; abi := null; ultimo_lancamento := null;
    banca := null; mu := null; lucro_sacado := null; planilha := null;
    if perf then
      select count(*)::int,
             round(coalesce(sum(case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(coalesce(sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end), 0), 2),
             round(avg(t.buyin), 2), max(t.entry_date)
        into torneios, investido, lucro, abi, ultimo_lancamento
        from public.tournaments t where t.pessoa_id = r.id and (p_desde is null or t.entry_date >= p_desde);
      roi := case when investido > 0 then round(lucro / investido * 100, 1) end;
      if p_desde is not null then
        select max(t.entry_date) into ultimo_lancamento from public.tournaments t where t.pessoa_id = r.id;
      end if;
    end if;
    if din then
      s := public.situacao_jogador(r.id);
      mu := (s->>'mu')::numeric; lucro_sacado := (s->>'lifetime')::numeric; planilha := s->>'abertura';
      select round(
          coalesce((select sum(w.saldo_inicial) from public.player_wallets w where w.pessoa_id = r.id), 0)
        + coalesce((select sum(t.prize + coalesce(t.bounty, 0) - case when t.ticket then 0 else t.buyin * (1 + coalesce(t.reentries, 0)) end)
                      from public.tournaments t where t.pessoa_id = r.id), 0)
        + coalesce((select sum(l.entrada - l.saida) from public.bankroll_ledger l where l.pessoa_id = r.id), 0)
        - coalesce((select sum(q.devolucao + q.cashout) from public.saque q where q.pessoa_id = r.id and q.status = 'pago'), 0), 2)
        into banca;
    end if;
    return next;
  end loop;
end $$;


--
-- Name: revogar_convite(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revogar_convite(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u uuid;
begin
  select unidade_id into u from public.convite where id = p_id;
  if u is null or not public.pode('gerir_pessoas', u) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  update public.convite set revogado = true where id = p_id;
end $$;


--
-- Name: salvar_grade(uuid, date, boolean, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare u record; limpas jsonb := '[]'::jsonb; c jsonb; k text; linha jsonb; gid uuid; pes record; rot text;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_celulas is null or jsonb_typeof(p_celulas) <> 'array' then raise exception 'grade inválida'; end if;
  if jsonb_array_length(p_celulas) = 0 then raise exception 'grade vazia'; end if;
  if jsonb_array_length(p_celulas) > 300 then raise exception 'grade grande demais (máximo 300 linhas)'; end if;
  -- só as 5 colunas do quadro, como texto curto
  for c in select x from jsonb_array_elements(p_celulas) x loop
    if jsonb_typeof(c) <> 'object' then raise exception 'linha da grade inválida'; end if;
    linha := '{}'::jsonb;
    foreach k in array array['site','tipo','regular','prog_ko','hyper'] loop
      if c ? k and jsonb_typeof(c->k) not in ('string','number','null') then raise exception 'célula inválida em %', k; end if;
      if length(coalesce(c->>k, '')) > 300 then raise exception 'texto grande demais em %', k; end if;
      linha := linha || jsonb_build_object(k, btrim(coalesce(c->>k, '')));
    end loop;
    if linha->>'site' = '' or linha->>'tipo' = '' then raise exception 'toda linha precisa de sala e linha (Semanal, Sunday…)'; end if;
    limpas := limpas || jsonb_build_array(linha);
  end loop;
  insert into public.grade(workspace_id, unidade_id, vigente_desde, simulada, celulas, observacao, criado_por)
  values (u.workspace_id, p_unidade, coalesce(p_desde, current_date), coalesce(p_simulada, false), limpas,
          nullif(btrim(coalesce(p_obs, '')), ''), auth.uid())
  on conflict (unidade_id, vigente_desde) do update
     set simulada = excluded.simulada, celulas = excluded.celulas, observacao = excluded.observacao,
         criado_por = excluded.criado_por, criado_em = now()
  returning id into gid;
  -- avisa os jogadores que a grade cobre (vínculo ativo na unidade ou abaixo)
  rot := case when coalesce(p_simulada, false) then 'Grade simulada na ' else 'Grade nova na ' end || u.nome;
  for pes in select distinct v.pessoa_id from public.vinculo v join public.unidade t on t.id = v.unidade_id
              where v.fim is null and t.caminho like u.caminho || '%' loop
    perform public.avisar_pessoa(pes.pessoa_id, 'grade', rot,
      'Vale desde ' || to_char(coalesce(p_desde, current_date), 'DD/MM/YYYY') ||
      case when coalesce(p_simulada, false) then '. Montada sem a planilha oficial: confirme com o professor.' else '.' end, gid);
  end loop;
  return gid;
end $$;


--
-- Name: set_workspace_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_workspace_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from public.workspace_members where user_id=auth.uid() order by created_at limit 1;
  end if;
  return new;
end $$;


--
-- Name: simular_saque(uuid, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s jsonb; mu numeric; lt numeric; lucro numeric; d jsonb;
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
  d := public.dividir_cashout(s->'contrato', lt, p_cashout);
  return jsonb_build_object(
    'banca', p_banca, 'mu_antes', mu, 'lucro_antes', lucro, 'lifetime_antes', lt,
    'devolucao', p_devolucao, 'cashout', p_cashout,
    'parte_jogador', (d->>'jogador')::numeric, 'parte_time', (d->>'time')::numeric,
    'total_time', p_devolucao + (d->>'time')::numeric,
    'banca_depois', p_banca - p_devolucao - p_cashout, 'mu_depois', mu - p_devolucao,
    'divisao', d);
end $$;


--
-- Name: situacao_jogador(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.situacao_jogador(p_pessoa uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare pes record; u uuid; ab record; desde timestamptz; mu numeric; lt numeric;
begin
  select * into pes from public.pessoa where id = p_pessoa;
  if pes.id is null then raise exception 'pessoa não existe'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p_pessoa and fim is null;
  if not (pes.user_id = auth.uid() or (u is not null and public.pode('ver_financeiro', u))) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select a.mu, a.cashout, a.confirmado_em, a.status into ab from public.abertura a where a.pessoa_id = p_pessoa;
  desde := case when ab.status = 'confirmada' then ab.confirmado_em else '-infinity'::timestamptz end;
  select coalesce(sum(valor), 0) into mu from public.aporte where pessoa_id = p_pessoa and criado_em > desde;
  select mu - coalesce(sum(devolucao), 0), coalesce(sum(cashout), 0) into mu, lt
    from public.saque where pessoa_id = p_pessoa and status = 'pago' and pago_em > desde;
  if ab.status = 'confirmada' then mu := mu + ab.mu; lt := lt + ab.cashout; end if;
  return jsonb_build_object('mu', mu, 'lifetime', lt, 'contrato', public.contrato_de(p_pessoa), 'unidade_id', u,
                            'abertura', coalesce(ab.status, 'sem'));
end $$;


--
-- Name: solicitar_saque(numeric, numeric, numeric, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb DEFAULT NULL::jsonb, p_obs text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare p uuid; ws uuid; u uuid; sim jsonb; novo uuid;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time pede saque' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.saque where pessoa_id = p and status in ('solicitado','aprovado')) then
    raise exception 'já existe um saque em aberto'; end if;
  select unidade_id into u from public.vinculo where pessoa_id = p and fim is null;
  sim := public.simular_saque(p, p_banca, p_devolucao, p_cashout);
  insert into public.saque(workspace_id, pessoa_id, unidade_id, banca, carteiras, mu_antes, lifetime_antes, devolucao, cashout,
                           parte_jogador, parte_time, total_time, divisao, banca_depois, observacao)
  values (ws, p, u, p_banca, p_carteiras, (sim->>'mu_antes')::numeric, (sim->>'lifetime_antes')::numeric,
          (sim->>'devolucao')::numeric, (sim->>'cashout')::numeric, (sim->>'parte_jogador')::numeric, (sim->>'parte_time')::numeric,
          (sim->>'total_time')::numeric, sim->'divisao', (sim->>'banca_depois')::numeric, p_obs)
  returning id into novo;
  return novo;
end $$;


--
-- Name: unidade_caminho(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unidade_caminho() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare m record;
begin
  if tg_op = 'INSERT' or new.mae_id is distinct from old.mae_id then
    if new.mae_id is null then
      new.caminho := '/' || new.id || '/';
    else
      select workspace_id, caminho into m from public.unidade where id = new.mae_id;
      if m is null then raise exception 'unidade-mãe não existe'; end if;
      if m.workspace_id <> new.workspace_id then raise exception 'unidade-mãe é de outra organização'; end if;
      if m.caminho like '%/' || new.id || '/%' then raise exception 'mover criaria um ciclo na árvore'; end if;
      new.caminho := m.caminho || new.id || '/';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then raise exception 'unidade não muda de organização'; end if;
  return new;
end $$;


--
-- Name: unidade_caminho_filhas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unidade_caminho_filhas() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.caminho <> old.caminho then
    update public.unidade set caminho = new.caminho || substr(caminho, length(old.caminho) + 1)
     where caminho like old.caminho || '%' and id <> new.id;
  end if;
  return null;
end $$;


--
-- Name: unidade_na_data(uuid, date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unidade_na_data(p uuid, d date, ws uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select v.unidade_id from public.vinculo v
      where p is not null and v.pessoa_id = p and v.inicio <= d and (v.fim is null or v.fim >= d)
      order by v.inicio desc, v.criado_em desc limit 1),
    (select u.id from public.unidade u where u.workspace_id = ws and u.mae_id is null order by u.criado_em limit 1));
$$;


--
-- Name: unidades_com(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unidades_com(cap text) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select distinct t.id
    from public.acesso a
    join public.pessoa p on p.id = a.pessoa_id
    join public.unidade u on u.id = a.unidade_id
    join public.unidade t on t.workspace_id = u.workspace_id and t.caminho like u.caminho || '%'
   where p.user_id = auth.uid() and p.status = 'ativo'
     and (cap = any(a.capacidades) or 'administrar' = any(a.capacidades));
$$;


--
-- Name: validar_faixas(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_faixas(p_faixas jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare f jsonb; n int := 0; abertas int := 0; ant numeric := 0;
begin
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) = 0 then raise exception 'contrato sem faixas'; end if;
  for f in select x from jsonb_array_elements(p_faixas) x order by coalesce((x->>'ate')::numeric, 1e15) loop
    n := n + 1;
    if (f->>'jogador') is null or (f->>'jogador')::numeric < 0 or (f->>'jogador')::numeric > 1 then
      raise exception 'percentual do jogador tem que estar entre 0 e 1 (ex.: 0.35)'; end if;
    if f->>'ate' is null then abertas := abertas + 1;
    elsif (f->>'ate')::numeric <= ant then raise exception 'faixas com limite repetido ou fora de ordem';
    else ant := (f->>'ate')::numeric; end if;
  end loop;
  if abertas <> 1 then raise exception 'a última faixa precisa ser sem limite ("ate": null)'; end if;
end $$;


--
-- Name: ver_convite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ver_convite(p_token text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c record; caps text[]; joga text;
begin
  select cv.*, w.name as time_nome, u.nome as unidade_nome, u.arquivada, p.nome as pessoa_nome
    into c
    from public.convite cv join public.workspaces w on w.id = cv.workspace_id
    join public.unidade u on u.id = cv.unidade_id left join public.pessoa p on p.id = cv.pessoa_id
   where cv.token_hash = public.convite_hash(p_token);
  if c.id is null then return jsonb_build_object('valido', false, 'motivo', 'Convite não encontrado. Confere se o link veio inteiro.'); end if;
  if c.pessoa_id is not null then
    select array_agg(distinct x order by x) into caps from public.acesso a, unnest(a.capacidades) x where a.pessoa_id = c.pessoa_id;
    select u2.nome into joga from public.vinculo v join public.unidade u2 on u2.id = v.unidade_id where v.pessoa_id = c.pessoa_id and v.fim is null;
  end if;
  return jsonb_build_object(
    'valido', not (c.revogado or c.arquivada or c.expira_em <= now() or (c.usos_max is not null and c.usos >= c.usos_max)),
    'motivo', case when c.revogado then 'Esse convite foi cancelado. Pede um link novo pro gestor.'
                   when c.arquivada then 'A unidade desse convite foi encerrada. Pede um link novo pro gestor.'
                   when c.expira_em <= now() then 'Esse convite venceu. Pede um link novo pro gestor.'
                   when c.usos_max is not null and c.usos >= c.usos_max then 'Esse convite já foi usado. Pede um link novo pro gestor.'
              end,
    'time', c.time_nome, 'unidade', c.unidade_nome, 'pessoa', c.pessoa_nome, 'expira_em', c.expira_em,
    'capacidades', coalesce(to_jsonb(caps), '[]'::jsonb), 'joga_em', joga);
end $$;


--
-- Name: webhook_ativar_plano(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare wid uuid; uid uuid;
begin
  if p_plan not in ('gestao','pro','founder','team') then raise exception 'plano inválido: %', p_plan; end if;
  insert into public.plan_activations(email,plan,status,source,order_id)
    values(lower(p_email),p_plan,'pending',coalesce(p_source,'kiwify'),p_order_id);
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan = p_plan, trial_ends_at = null where id = wid;
      update public.plan_activations set status='used', used_at=now(), used_by=uid
        where lower(email) = lower(p_email) and status = 'pending' and plan = p_plan;
    end if;
  end if;
  return 'ok';
end $$;


--
-- Name: webhook_revogar_plano(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.webhook_revogar_plano(p_email, p_order_id, null::text);
$$;


--
-- Name: webhook_revogar_plano(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text, p_plan text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare wid uuid; uid uuid; atual text;
begin
  update public.plan_activations set status = 'revoked'
   where lower(email) = lower(p_email) and status = 'pending' and (p_plan is null or plan = p_plan);
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is null then return 'ok'; end if;
  select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
  if wid is null then return 'ok'; end if;
  select plan into atual from public.workspaces where id = wid;
  if p_plan is not null and atual is distinct from p_plan then
    return 'ignorado: o plano atual é ' || coalesce(atual, '?') || ', o pedido é de ' || p_plan;
  end if;
  update public.workspaces set plan = 'free', trial_ends_at = now() where id = wid and plan not in ('team','founder');
  return 'ok';
end $$;


--
-- Name: ws_ativo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ws_ativo(ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.trial_ends_at is null or w.trial_ends_at > now()));
$$;


--
-- Name: ws_com(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ws_com(cap text) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.workspace_id from public.unidade u where u.mae_id is null and u.id in (select public.unidades_com(cap));
$$;


--
-- Name: ws_estruturados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ws_estruturados() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select distinct u.workspace_id from public.unidade u where u.workspace_id in (select public.my_workspaces());
$$;


--
-- Name: ws_pode_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ws_pode_stats(ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.kind <> 'solo' or w.plan in ('pro','founder','team')));
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abertura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abertura (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid,
    status text DEFAULT 'enviada'::text NOT NULL,
    mu numeric(12,2) NOT NULL,
    cashout numeric(12,2) NOT NULL,
    planilha jsonb NOT NULL,
    enviado_por uuid DEFAULT auth.uid(),
    enviado_em timestamp with time zone DEFAULT now() NOT NULL,
    confirmado_por uuid,
    confirmado_em timestamp with time zone,
    CONSTRAINT abertura_cashout_check CHECK ((cashout >= (0)::numeric)),
    CONSTRAINT abertura_mu_check CHECK ((mu >= (0)::numeric)),
    CONSTRAINT abertura_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'confirmada'::text])))
);


--
-- Name: acesso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acesso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid NOT NULL,
    capacidades text[] NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acesso_capacidades_check CHECK (((cardinality(capacidades) > 0) AND (capacidades <@ ARRAY['ver_desempenho'::text, 'gerir_pessoas'::text, 'promover'::text, 'configurar_regras'::text, 'ver_financeiro'::text, 'aprovar_saques'::text, 'administrar'::text])))
);


--
-- Name: aporte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aporte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid,
    valor numeric(12,2) NOT NULL,
    data date DEFAULT CURRENT_DATE NOT NULL,
    observacao text,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT aporte_valor_check CHECK ((valor <> (0)::numeric))
);


--
-- Name: app_erros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_erros (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origem text NOT NULL,
    mensagem text NOT NULL,
    detalhe jsonb,
    build text,
    user_id uuid DEFAULT auth.uid(),
    workspace_id uuid,
    avisado_em timestamp with time zone,
    CONSTRAINT app_erros_origem_check CHECK ((origem = ANY (ARRAY['app'::text, 'import'::text, 'webhook'::text, 'servidor'::text])))
);


--
-- Name: app_erros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.app_erros ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.app_erros_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_secrets (
    name text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aviso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aviso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    texto text,
    ref_id uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    lido_em timestamp with time zone
);


--
-- Name: bankroll_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bankroll_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_date date NOT NULL,
    wallet text NOT NULL,
    entrada numeric DEFAULT 0 NOT NULL,
    saida numeric DEFAULT 0 NOT NULL,
    observacao text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    player text,
    workspace_id uuid NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: config_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    field text NOT NULL,
    old_value text,
    new_value text,
    resumo text NOT NULL,
    changed_by_name text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL
);


--
-- Name: contrato; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contrato (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    unidade_id uuid,
    pessoa_id uuid,
    faixas jsonb NOT NULL,
    inicio date DEFAULT CURRENT_DATE NOT NULL,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contrato_check CHECK (((unidade_id IS NOT NULL) OR (pessoa_id IS NOT NULL)))
);


--
-- Name: convite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.convite (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    unidade_id uuid NOT NULL,
    pessoa_id uuid,
    token_hash text NOT NULL,
    expira_em timestamp with time zone NOT NULL,
    usos_max integer,
    usos integer DEFAULT 0 NOT NULL,
    revogado boolean DEFAULT false NOT NULL,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT convite_usos_max_check CHECK (((usos_max IS NULL) OR (usos_max > 0)))
);


--
-- Name: daily_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_date date NOT NULL,
    player text NOT NULL,
    site text,
    saldo_inicial numeric DEFAULT 0 NOT NULL,
    deposito numeric DEFAULT 0 NOT NULL,
    saque numeric DEFAULT 0 NOT NULL,
    saldo_final numeric DEFAULT 0 NOT NULL,
    qtd_torneios integer DEFAULT 0 NOT NULL,
    total_buyins numeric DEFAULT 0 NOT NULL,
    maior_buyin numeric DEFAULT 0 NOT NULL,
    maior_premiacao numeric DEFAULT 0 NOT NULL,
    observacoes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: grade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    unidade_id uuid NOT NULL,
    vigente_desde date DEFAULT CURRENT_DATE NOT NULL,
    simulada boolean DEFAULT false NOT NULL,
    celulas jsonb DEFAULT '[]'::jsonb NOT NULL,
    observacao text,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grade_celulas_check CHECK ((jsonb_typeof(celulas) = 'array'::text)),
    CONSTRAINT grade_observacao_check CHECK (((observacao IS NULL) OR (length(observacao) <= 500)))
);


--
-- Name: hh_import_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hh_import_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player text,
    saved integer DEFAULT 0 NOT NULL,
    novas integer DEFAULT 0 NOT NULL,
    repetidas integer DEFAULT 0 NOT NULL,
    ignored integer DEFAULT 0 NOT NULL,
    reasons jsonb,
    issues jsonb,
    meta jsonb,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: hh_tournament_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hh_tournament_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player text NOT NULL,
    site text NOT NULL,
    site_tournament_id text NOT NULL,
    tournament_name text,
    entry_date date,
    buyin numeric DEFAULT 0 NOT NULL,
    hands integer DEFAULT 0 NOT NULL,
    net_bb numeric DEFAULT 0 NOT NULL,
    vpip_cnt integer DEFAULT 0 NOT NULL,
    pfr_cnt integer DEFAULT 0 NOT NULL,
    tb_cnt integer DEFAULT 0 NOT NULL,
    tb_opp integer DEFAULT 0 NOT NULL,
    f3b_cnt integer DEFAULT 0 NOT NULL,
    f3b_opp integer DEFAULT 0 NOT NULL,
    steal_cnt integer DEFAULT 0 NOT NULL,
    steal_opp integer DEFAULT 0 NOT NULL,
    bbdef_cnt integer DEFAULT 0 NOT NULL,
    bbdef_opp integer DEFAULT 0 NOT NULL,
    cbet_cnt integer DEFAULT 0 NOT NULL,
    cbet_opp integer DEFAULT 0 NOT NULL,
    fcbet_cnt integer DEFAULT 0 NOT NULL,
    fcbet_opp integer DEFAULT 0 NOT NULL,
    sawflop_cnt integer DEFAULT 0 NOT NULL,
    wwsf_cnt integer DEFAULT 0 NOT NULL,
    wtsd_cnt integer DEFAULT 0 NOT NULL,
    wsd_cnt integer DEFAULT 0 NOT NULL,
    af_bets integer DEFAULT 0 NOT NULL,
    af_calls integer DEFAULT 0 NOT NULL,
    allin_cnt integer DEFAULT 0 NOT NULL,
    allin_ev_bb numeric DEFAULT 0 NOT NULL,
    allin_net_bb numeric DEFAULT 0 NOT NULL,
    pos_json jsonb,
    stack_json jsonb,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    hand_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    workspace_id uuid NOT NULL,
    engine_version integer DEFAULT 1 NOT NULL,
    walk_cnt integer DEFAULT 0 NOT NULL,
    pfr_opp integer DEFAULT 0 NOT NULL,
    rfi_cnt integer DEFAULT 0 NOT NULL,
    rfi_opp integer DEFAULT 0 NOT NULL,
    sq_cnt integer DEFAULT 0 NOT NULL,
    sq_opp integer DEFAULT 0 NOT NULL,
    sawflop_np_cnt integer DEFAULT 0 NOT NULL,
    wtsd_np_cnt integer DEFAULT 0 NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: COLUMN hh_tournament_stats.engine_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hh_tournament_stats.engine_version IS 'Versão das definições do motor de stats que calculou a linha (HH_ENGINE no app). 1 = até jul/2026, 2 = PT4.';


--
-- Name: pessoa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pessoa (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    nome text NOT NULL,
    nick_ps text,
    id_gg text,
    whatsapp text,
    status text DEFAULT 'convidado'::text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pessoa_nome_check CHECK (((length(btrim(nome)) >= 1) AND (length(btrim(nome)) <= 60))),
    CONSTRAINT pessoa_status_check CHECK ((status = ANY (ARRAY['convidado'::text, 'ativo'::text, 'saiu'::text])))
);


--
-- Name: plan_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_activations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    plan text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    source text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    used_by uuid,
    order_id text,
    CONSTRAINT plan_activations_plan_check CHECK ((plan = ANY (ARRAY['gestao'::text, 'pro'::text, 'founder'::text]))),
    CONSTRAINT plan_activations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'used'::text, 'revoked'::text])))
);


--
-- Name: player_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_profiles (
    user_id uuid NOT NULL,
    email text NOT NULL,
    nickname text,
    cpf text,
    password_changed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role text DEFAULT 'pool'::text NOT NULL,
    whatsapp text
);


--
-- Name: player_wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player text NOT NULL,
    wallet text NOT NULL,
    saldo_inicial numeric DEFAULT 0 NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: pool_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pool_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    player1_name text DEFAULT 'Gabriel'::text NOT NULL,
    player2_name text DEFAULT 'Guedes'::text NOT NULL,
    player_pct numeric DEFAULT 0.5 NOT NULL,
    abi_max numeric DEFAULT 2 NOT NULL,
    piso_minimo numeric DEFAULT 300 NOT NULL,
    makeup_max_recomendado numeric DEFAULT 100 NOT NULL,
    makeup_inicial_player1 numeric DEFAULT 0 NOT NULL,
    makeup_inicial_player2 numeric DEFAULT 0 NOT NULL,
    stoploss_daily_buyins numeric DEFAULT 10 NOT NULL,
    stoploss_weekly_pct numeric DEFAULT 0.15 NOT NULL,
    banca_inicial numeric DEFAULT 400 NOT NULL,
    week_start_date date DEFAULT CURRENT_DATE NOT NULL,
    sites_permitidos text[] DEFAULT '{PokerStars,"GG Poker"}'::text[] NOT NULL,
    modalidades_permitidas text[] DEFAULT '{MTT,Spin,Cash,"Sit & Go"}'::text[] NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    abi_max_player1 numeric DEFAULT 2 NOT NULL,
    abi_max_player2 numeric DEFAULT 2 NOT NULL,
    workspace_id uuid NOT NULL
);


--
-- Name: regra_unidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regra_unidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    unidade_id uuid NOT NULL,
    chave text NOT NULL,
    valor jsonb NOT NULL,
    vigente_desde date DEFAULT CURRENT_DATE NOT NULL,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regra_unidade_chave_check CHECK ((chave = ANY (ARRAY['bloquear_promocao_com_mk'::text, 'jogador_ve_ranking'::text])))
);


--
-- Name: reload; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reload (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid,
    valor numeric(12,2) NOT NULL,
    sala text,
    motivo text,
    status text DEFAULT 'solicitado'::text NOT NULL,
    solicitado_em timestamp with time zone DEFAULT now() NOT NULL,
    decidido_por uuid,
    decidido_em timestamp with time zone,
    motivo_recusa text,
    enviado_valor numeric(12,2),
    enviado_em timestamp with time zone,
    aporte_id uuid,
    CONSTRAINT reload_status_check CHECK ((status = ANY (ARRAY['solicitado'::text, 'aprovado'::text, 'recusado'::text, 'cancelado'::text, 'enviado'::text]))),
    CONSTRAINT reload_valor_check CHECK ((valor > (0)::numeric))
);


--
-- Name: saque; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saque (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid,
    status text DEFAULT 'solicitado'::text NOT NULL,
    banca numeric(12,2) NOT NULL,
    carteiras jsonb,
    mu_antes numeric(12,2) NOT NULL,
    lifetime_antes numeric(12,2) NOT NULL,
    devolucao numeric(12,2) DEFAULT 0 NOT NULL,
    cashout numeric(12,2) DEFAULT 0 NOT NULL,
    parte_jogador numeric(12,2) NOT NULL,
    parte_time numeric(12,2) NOT NULL,
    total_time numeric(12,2) NOT NULL,
    divisao jsonb NOT NULL,
    banca_depois numeric(12,2) NOT NULL,
    observacao text,
    solicitado_por uuid DEFAULT auth.uid(),
    solicitado_em timestamp with time zone DEFAULT now() NOT NULL,
    decidido_por uuid,
    decidido_em timestamp with time zone,
    motivo text,
    recebido numeric(12,2),
    diferenca numeric(12,2),
    pago_em timestamp with time zone,
    CONSTRAINT saque_banca_check CHECK ((banca >= (0)::numeric)),
    CONSTRAINT saque_cashout_check CHECK ((cashout >= (0)::numeric)),
    CONSTRAINT saque_check CHECK (((devolucao + cashout) > (0)::numeric)),
    CONSTRAINT saque_devolucao_check CHECK ((devolucao >= (0)::numeric)),
    CONSTRAINT saque_status_check CHECK ((status = ANY (ARRAY['solicitado'::text, 'aprovado'::text, 'recusado'::text, 'cancelado'::text, 'pago'::text])))
);


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tournaments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_date date NOT NULL,
    player text NOT NULL,
    site text,
    tournament_name text,
    modality text,
    buyin numeric DEFAULT 0 NOT NULL,
    reentries integer DEFAULT 0 NOT NULL,
    field_size integer DEFAULT 0 NOT NULL,
    final_position integer,
    prize numeric DEFAULT 0 NOT NULL,
    observacoes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workspace_id uuid NOT NULL,
    site_tournament_id text,
    ticket boolean DEFAULT false NOT NULL,
    bounty numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    pessoa_id uuid,
    unidade_id uuid,
    CONSTRAINT tournaments_bounty_check CHECK ((bounty >= (0)::numeric))
);


--
-- Name: COLUMN tournaments.ticket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournaments.ticket IS 'true = entrou com bilhete/T$: não sai dinheiro da banca (buy-in vale só como nível/ABI).';


--
-- Name: COLUMN tournaments.bounty; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournaments.bounty IS 'Bounties de PKO ganhos no torneio (fora do prêmio por colocação).';


--
-- Name: COLUMN tournaments.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tournaments.currency IS 'Moeda dos valores do torneio como veio do arquivo do site (USD, EUR, GBP, CNY).';


--
-- Name: unidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    mae_id uuid,
    nome text NOT NULL,
    rotulo text,
    ordem integer DEFAULT 0 NOT NULL,
    caminho text DEFAULT ''::text NOT NULL,
    arquivada boolean DEFAULT false NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT unidade_nome_check CHECK (((length(btrim(nome)) >= 1) AND (length(btrim(nome)) <= 60))),
    CONSTRAINT unidade_rotulo_check CHECK (((rotulo IS NULL) OR (length(rotulo) <= 30)))
);


--
-- Name: vinculo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vinculo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pessoa_id uuid NOT NULL,
    unidade_id uuid NOT NULL,
    inicio date DEFAULT CURRENT_DATE NOT NULL,
    fim date,
    motivo text DEFAULT 'entrada'::text NOT NULL,
    criado_por uuid DEFAULT auth.uid(),
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vinculo_check CHECK (((fim IS NULL) OR (fim >= inicio))),
    CONSTRAINT vinculo_motivo_check CHECK ((motivo = ANY (ARRAY['entrada'::text, 'promocao'::text, 'rebaixamento'::text, 'transferencia'::text])))
);


--
-- Name: webhook_cobrancas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_cobrancas (
    provider text NOT NULL,
    order_id text NOT NULL,
    status text DEFAULT ''::text NOT NULL,
    email text,
    plano_id text,
    produto_id text,
    valor_centavos text,
    plano_liberado text,
    chave_usada text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE webhook_cobrancas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.webhook_cobrancas IS 'Toda cobrança aprovada vista pelo webhook. plano_liberado null = pagou e não liberou.';


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    provider text NOT NULL,
    event_id text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_ending_date date NOT NULL,
    player text NOT NULL,
    valor_sacado numeric DEFAULT 0 NOT NULL,
    observacoes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wallet text,
    workspace_id uuid NOT NULL,
    pessoa_id uuid,
    unidade_id uuid
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'owner'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'solo'::text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_ends_at timestamp with time zone,
    assentos integer,
    contrato_fim date,
    CONSTRAINT workspaces_assentos_check CHECK (((assentos IS NULL) OR (assentos > 0))),
    CONSTRAINT workspaces_kind_check CHECK ((kind = ANY (ARRAY['team'::text, 'solo'::text, 'time'::text]))),
    CONSTRAINT workspaces_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'gestao'::text, 'pro'::text, 'founder'::text, 'team'::text])))
);


--
-- Name: abertura abertura_pessoa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abertura
    ADD CONSTRAINT abertura_pessoa_id_key UNIQUE (pessoa_id);


--
-- Name: abertura abertura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abertura
    ADD CONSTRAINT abertura_pkey PRIMARY KEY (id);


--
-- Name: acesso acesso_pessoa_id_unidade_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acesso
    ADD CONSTRAINT acesso_pessoa_id_unidade_id_key UNIQUE (pessoa_id, unidade_id);


--
-- Name: acesso acesso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acesso
    ADD CONSTRAINT acesso_pkey PRIMARY KEY (id);


--
-- Name: aporte aporte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aporte
    ADD CONSTRAINT aporte_pkey PRIMARY KEY (id);


--
-- Name: app_erros app_erros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_erros
    ADD CONSTRAINT app_erros_pkey PRIMARY KEY (id);


--
-- Name: app_secrets app_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_secrets
    ADD CONSTRAINT app_secrets_pkey PRIMARY KEY (name);


--
-- Name: aviso aviso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aviso
    ADD CONSTRAINT aviso_pkey PRIMARY KEY (id);


--
-- Name: bankroll_ledger bankroll_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_pkey PRIMARY KEY (id);


--
-- Name: config_changes config_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_changes
    ADD CONSTRAINT config_changes_pkey PRIMARY KEY (id);


--
-- Name: contrato contrato_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT contrato_pkey PRIMARY KEY (id);


--
-- Name: convite convite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convite
    ADD CONSTRAINT convite_pkey PRIMARY KEY (id);


--
-- Name: convite convite_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convite
    ADD CONSTRAINT convite_token_hash_key UNIQUE (token_hash);


--
-- Name: daily_entries daily_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_pkey PRIMARY KEY (id);


--
-- Name: grade grade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_pkey PRIMARY KEY (id);


--
-- Name: grade grade_unidade_id_vigente_desde_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_unidade_id_vigente_desde_key UNIQUE (unidade_id, vigente_desde);


--
-- Name: hh_import_log hh_import_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_pkey PRIMARY KEY (id);


--
-- Name: hh_tournament_stats hh_tournament_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_pkey PRIMARY KEY (id);


--
-- Name: pessoa pessoa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoa
    ADD CONSTRAINT pessoa_pkey PRIMARY KEY (id);


--
-- Name: pessoa pessoa_workspace_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoa
    ADD CONSTRAINT pessoa_workspace_id_user_id_key UNIQUE (workspace_id, user_id);


--
-- Name: plan_activations plan_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_activations
    ADD CONSTRAINT plan_activations_pkey PRIMARY KEY (id);


--
-- Name: player_profiles player_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: player_wallets player_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_pkey PRIMARY KEY (id);


--
-- Name: pool_config pool_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pool_config
    ADD CONSTRAINT pool_config_pkey PRIMARY KEY (id);


--
-- Name: regra_unidade regra_unidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regra_unidade
    ADD CONSTRAINT regra_unidade_pkey PRIMARY KEY (id);


--
-- Name: regra_unidade regra_unidade_unidade_id_chave_vigente_desde_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regra_unidade
    ADD CONSTRAINT regra_unidade_unidade_id_chave_vigente_desde_key UNIQUE (unidade_id, chave, vigente_desde);


--
-- Name: reload reload_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reload
    ADD CONSTRAINT reload_pkey PRIMARY KEY (id);


--
-- Name: saque saque_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saque
    ADD CONSTRAINT saque_pkey PRIMARY KEY (id);


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);


--
-- Name: unidade unidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidade
    ADD CONSTRAINT unidade_pkey PRIMARY KEY (id);


--
-- Name: vinculo vinculo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vinculo
    ADD CONSTRAINT vinculo_pkey PRIMARY KEY (id);


--
-- Name: webhook_cobrancas webhook_cobrancas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_cobrancas
    ADD CONSTRAINT webhook_cobrancas_pkey PRIMARY KEY (provider, order_id, status);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (provider, event_id);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: abertura_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abertura_unidade ON public.abertura USING btree (unidade_id);


--
-- Name: abertura_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abertura_workspace ON public.abertura USING btree (workspace_id);


--
-- Name: acesso_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX acesso_unidade ON public.acesso USING btree (unidade_id);


--
-- Name: aporte_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aporte_pessoa ON public.aporte USING btree (pessoa_id);


--
-- Name: aporte_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aporte_unidade ON public.aporte USING btree (unidade_id);


--
-- Name: aporte_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aporte_workspace ON public.aporte USING btree (workspace_id);


--
-- Name: app_erros_pendentes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_erros_pendentes ON public.app_erros USING btree (created_at) WHERE (avisado_em IS NULL);


--
-- Name: app_erros_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_erros_user ON public.app_erros USING btree (user_id, created_at);


--
-- Name: aviso_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aviso_user ON public.aviso USING btree (user_id, criado_em DESC);


--
-- Name: aviso_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aviso_workspace ON public.aviso USING btree (workspace_id);


--
-- Name: bankroll_ledger_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bankroll_ledger_pessoa ON public.bankroll_ledger USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: bankroll_ledger_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bankroll_ledger_unidade ON public.bankroll_ledger USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: contrato_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contrato_pessoa ON public.contrato USING btree (pessoa_id);


--
-- Name: contrato_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contrato_unidade ON public.contrato USING btree (unidade_id);


--
-- Name: contrato_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contrato_workspace ON public.contrato USING btree (workspace_id);


--
-- Name: convite_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convite_pessoa ON public.convite USING btree (pessoa_id);


--
-- Name: convite_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convite_unidade ON public.convite USING btree (unidade_id);


--
-- Name: convite_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX convite_workspace ON public.convite USING btree (workspace_id);


--
-- Name: daily_entries_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_entries_pessoa ON public.daily_entries USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: daily_entries_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_entries_unidade ON public.daily_entries USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: grade_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX grade_ws ON public.grade USING btree (workspace_id);


--
-- Name: hh_import_log_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hh_import_log_pessoa ON public.hh_import_log USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: hh_import_log_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hh_import_log_unidade ON public.hh_import_log USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: hh_stats_ws_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hh_stats_ws_key ON public.hh_tournament_stats USING btree (workspace_id, player, site, site_tournament_id);


--
-- Name: hh_tournament_stats_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hh_tournament_stats_pessoa ON public.hh_tournament_stats USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: hh_tournament_stats_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hh_tournament_stats_unidade ON public.hh_tournament_stats USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: idx_bankroll_ledger_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bankroll_ledger_cb ON public.bankroll_ledger USING btree (created_by);


--
-- Name: idx_bankroll_ledger_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bankroll_ledger_ws ON public.bankroll_ledger USING btree (workspace_id);


--
-- Name: idx_config_changes_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_changes_cb ON public.config_changes USING btree (created_by);


--
-- Name: idx_config_changes_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_changes_ws ON public.config_changes USING btree (workspace_id);


--
-- Name: idx_daily_entries_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_entries_cb ON public.daily_entries USING btree (created_by);


--
-- Name: idx_daily_entries_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_entries_ws ON public.daily_entries USING btree (workspace_id);


--
-- Name: idx_hh_import_log_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hh_import_log_cb ON public.hh_import_log USING btree (created_by);


--
-- Name: idx_hh_import_log_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hh_import_log_ws ON public.hh_import_log USING btree (workspace_id);


--
-- Name: idx_hh_stats_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hh_stats_cb ON public.hh_tournament_stats USING btree (created_by);


--
-- Name: idx_hh_stats_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hh_stats_ws ON public.hh_tournament_stats USING btree (workspace_id);


--
-- Name: idx_plan_activations_usedby; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_activations_usedby ON public.plan_activations USING btree (used_by);


--
-- Name: idx_player_wallets_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_wallets_cb ON public.player_wallets USING btree (created_by);


--
-- Name: idx_player_wallets_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_wallets_ws ON public.player_wallets USING btree (workspace_id);


--
-- Name: idx_pool_config_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pool_config_cb ON public.pool_config USING btree (created_by);


--
-- Name: idx_pool_config_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pool_config_ws ON public.pool_config USING btree (workspace_id);


--
-- Name: idx_tournaments_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_cb ON public.tournaments USING btree (created_by);


--
-- Name: idx_tournaments_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tournaments_ws ON public.tournaments USING btree (workspace_id);


--
-- Name: idx_withdrawals_cb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawals_cb ON public.withdrawals USING btree (created_by);


--
-- Name: idx_withdrawals_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawals_ws ON public.withdrawals USING btree (workspace_id);


--
-- Name: idx_wsm_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsm_user ON public.workspace_members USING btree (user_id);


--
-- Name: idx_wsm_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wsm_ws ON public.workspace_members USING btree (workspace_id);


--
-- Name: pessoa_nome_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pessoa_nome_unico ON public.pessoa USING btree (workspace_id, lower(btrim(nome))) WHERE (status <> 'saiu'::text);


--
-- Name: pessoa_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pessoa_user ON public.pessoa USING btree (user_id);


--
-- Name: plan_activations_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_activations_email_idx ON public.plan_activations USING btree (lower(email)) WHERE (status = 'pending'::text);


--
-- Name: player_profiles_cpf_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_cpf_key ON public.player_profiles USING btree (cpf) WHERE (cpf IS NOT NULL);


--
-- Name: player_profiles_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_email_key ON public.player_profiles USING btree (lower(email));


--
-- Name: player_profiles_nickname_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_profiles_nickname_key ON public.player_profiles USING btree (lower(nickname)) WHERE (nickname IS NOT NULL);


--
-- Name: player_wallets_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_wallets_pessoa ON public.player_wallets USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: player_wallets_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_wallets_unidade ON public.player_wallets USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: player_wallets_ws_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_wallets_ws_key ON public.player_wallets USING btree (workspace_id, player, wallet);


--
-- Name: pool_config_one_per_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pool_config_one_per_ws ON public.pool_config USING btree (workspace_id);


--
-- Name: regra_unidade_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX regra_unidade_ws ON public.regra_unidade USING btree (workspace_id);


--
-- Name: reload_aporte; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reload_aporte ON public.reload USING btree (aporte_id);


--
-- Name: reload_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reload_pessoa ON public.reload USING btree (pessoa_id);


--
-- Name: reload_um_aberto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reload_um_aberto ON public.reload USING btree (pessoa_id) WHERE (status = ANY (ARRAY['solicitado'::text, 'aprovado'::text]));


--
-- Name: reload_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reload_unidade ON public.reload USING btree (unidade_id);


--
-- Name: reload_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reload_workspace ON public.reload USING btree (workspace_id);


--
-- Name: saque_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saque_pessoa ON public.saque USING btree (pessoa_id);


--
-- Name: saque_um_aberto; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX saque_um_aberto ON public.saque USING btree (pessoa_id) WHERE (status = ANY (ARRAY['solicitado'::text, 'aprovado'::text]));


--
-- Name: saque_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saque_unidade ON public.saque USING btree (unidade_id);


--
-- Name: saque_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saque_workspace ON public.saque USING btree (workspace_id);


--
-- Name: tournaments_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournaments_pessoa ON public.tournaments USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: tournaments_site_tid_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tournaments_site_tid_uniq ON public.tournaments USING btree (workspace_id, player, site, site_tournament_id) WHERE (site_tournament_id IS NOT NULL);


--
-- Name: tournaments_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tournaments_unidade ON public.tournaments USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: unidade_caminho; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unidade_caminho ON public.unidade USING btree (caminho text_pattern_ops);


--
-- Name: unidade_mae; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unidade_mae ON public.unidade USING btree (mae_id);


--
-- Name: unidade_nome_irmas; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unidade_nome_irmas ON public.unidade USING btree (workspace_id, COALESCE(mae_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nome))) WHERE (NOT arquivada);


--
-- Name: unidade_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unidade_ws ON public.unidade USING btree (workspace_id);


--
-- Name: vinculo_um_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vinculo_um_ativo ON public.vinculo USING btree (pessoa_id) WHERE (fim IS NULL);


--
-- Name: vinculo_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vinculo_unidade ON public.vinculo USING btree (unidade_id);


--
-- Name: withdrawals_pessoa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawals_pessoa ON public.withdrawals USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);


--
-- Name: withdrawals_unidade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX withdrawals_unidade ON public.withdrawals USING btree (unidade_id) WHERE (unidade_id IS NOT NULL);


--
-- Name: acesso acesso_mesma_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER acesso_mesma_org BEFORE INSERT OR UPDATE ON public.acesso FOR EACH ROW EXECUTE FUNCTION public.mesma_organizacao();


--
-- Name: abertura aviso_abertura; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aviso_abertura AFTER INSERT OR UPDATE ON public.abertura FOR EACH ROW EXECUTE FUNCTION public.aviso_abertura();


--
-- Name: pessoa aviso_entrada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aviso_entrada AFTER UPDATE OF user_id ON public.pessoa FOR EACH ROW EXECUTE FUNCTION public.aviso_entrada();


--
-- Name: vinculo aviso_entrada_vinculo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aviso_entrada_vinculo AFTER INSERT ON public.vinculo FOR EACH ROW EXECUTE FUNCTION public.aviso_entrada_vinculo();


--
-- Name: saque aviso_saque; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER aviso_saque AFTER INSERT OR UPDATE OF status ON public.saque FOR EACH ROW EXECUTE FUNCTION public.aviso_saque();


--
-- Name: player_profiles perfil_protegido; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfil_protegido BEFORE INSERT OR UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION public.perfil_protegido();


--
-- Name: pessoa pessoa_assentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pessoa_assentos BEFORE INSERT OR UPDATE OF status ON public.pessoa FOR EACH ROW EXECUTE FUNCTION public.pessoa_assentos();


--
-- Name: bankroll_ledger set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.bankroll_ledger FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: config_changes set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.config_changes FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: daily_entries set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.daily_entries FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: hh_import_log set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.hh_import_log FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: hh_tournament_stats set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.hh_tournament_stats FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: player_wallets set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.player_wallets FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: pool_config set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.pool_config FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: tournaments set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: withdrawals set_ws; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_ws BEFORE INSERT ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id();


--
-- Name: unidade unidade_caminho; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER unidade_caminho BEFORE INSERT OR UPDATE ON public.unidade FOR EACH ROW EXECUTE FUNCTION public.unidade_caminho();


--
-- Name: unidade unidade_caminho_filhas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER unidade_caminho_filhas AFTER UPDATE ON public.unidade FOR EACH ROW EXECUTE FUNCTION public.unidade_caminho_filhas();


--
-- Name: vinculo vinculo_mesma_org; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vinculo_mesma_org BEFORE INSERT OR UPDATE ON public.vinculo FOR EACH ROW EXECUTE FUNCTION public.mesma_organizacao();


--
-- Name: bankroll_ledger zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.bankroll_ledger FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('entry_date');


--
-- Name: daily_entries zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.daily_entries FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('entry_date');


--
-- Name: hh_import_log zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.hh_import_log FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('created_at');


--
-- Name: hh_tournament_stats zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.hh_tournament_stats FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('entry_date');


--
-- Name: player_wallets zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.player_wallets FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('');


--
-- Name: tournaments zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('entry_date');


--
-- Name: withdrawals zz_fato_pessoa; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zz_fato_pessoa BEFORE INSERT OR UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION public.fato_pessoa_unidade('week_ending_date');


--
-- Name: abertura abertura_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abertura
    ADD CONSTRAINT abertura_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: abertura abertura_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abertura
    ADD CONSTRAINT abertura_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: abertura abertura_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abertura
    ADD CONSTRAINT abertura_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: acesso acesso_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acesso
    ADD CONSTRAINT acesso_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: acesso acesso_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acesso
    ADD CONSTRAINT acesso_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id) ON DELETE CASCADE;


--
-- Name: aporte aporte_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aporte
    ADD CONSTRAINT aporte_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: aporte aporte_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aporte
    ADD CONSTRAINT aporte_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: aporte aporte_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aporte
    ADD CONSTRAINT aporte_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: aviso aviso_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aviso
    ADD CONSTRAINT aviso_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: aviso aviso_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aviso
    ADD CONSTRAINT aviso_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: bankroll_ledger bankroll_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: bankroll_ledger bankroll_ledger_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: bankroll_ledger bankroll_ledger_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: bankroll_ledger bankroll_ledger_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: config_changes config_changes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_changes
    ADD CONSTRAINT config_changes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: config_changes config_changes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_changes
    ADD CONSTRAINT config_changes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: contrato contrato_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT contrato_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: contrato contrato_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT contrato_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id) ON DELETE CASCADE;


--
-- Name: contrato contrato_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contrato
    ADD CONSTRAINT contrato_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: convite convite_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convite
    ADD CONSTRAINT convite_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: convite convite_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convite
    ADD CONSTRAINT convite_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id) ON DELETE CASCADE;


--
-- Name: convite convite_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.convite
    ADD CONSTRAINT convite_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: daily_entries daily_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: daily_entries daily_entries_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: daily_entries daily_entries_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: daily_entries daily_entries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: grade grade_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: grade grade_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id) ON DELETE CASCADE;


--
-- Name: grade grade_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grade
    ADD CONSTRAINT grade_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: hh_import_log hh_import_log_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hh_import_log hh_import_log_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: hh_import_log hh_import_log_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: hh_import_log hh_import_log_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: hh_tournament_stats hh_tournament_stats_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: hh_tournament_stats hh_tournament_stats_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: hh_tournament_stats hh_tournament_stats_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: hh_tournament_stats hh_tournament_stats_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: pessoa pessoa_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoa
    ADD CONSTRAINT pessoa_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pessoa pessoa_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pessoa
    ADD CONSTRAINT pessoa_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: plan_activations plan_activations_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_activations
    ADD CONSTRAINT plan_activations_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--
-- Name: player_profiles player_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_profiles
    ADD CONSTRAINT player_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: player_wallets player_wallets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: player_wallets player_wallets_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: player_wallets player_wallets_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: player_wallets player_wallets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_wallets
    ADD CONSTRAINT player_wallets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: pool_config pool_config_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pool_config
    ADD CONSTRAINT pool_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: pool_config pool_config_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pool_config
    ADD CONSTRAINT pool_config_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: regra_unidade regra_unidade_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regra_unidade
    ADD CONSTRAINT regra_unidade_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: regra_unidade regra_unidade_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regra_unidade
    ADD CONSTRAINT regra_unidade_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id) ON DELETE CASCADE;


--
-- Name: regra_unidade regra_unidade_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regra_unidade
    ADD CONSTRAINT regra_unidade_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: reload reload_aporte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reload
    ADD CONSTRAINT reload_aporte_id_fkey FOREIGN KEY (aporte_id) REFERENCES public.aporte(id);


--
-- Name: reload reload_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reload
    ADD CONSTRAINT reload_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: reload reload_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reload
    ADD CONSTRAINT reload_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: reload reload_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reload
    ADD CONSTRAINT reload_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: saque saque_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saque
    ADD CONSTRAINT saque_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: saque saque_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saque
    ADD CONSTRAINT saque_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: saque saque_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saque
    ADD CONSTRAINT saque_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: tournaments tournaments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: tournaments tournaments_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: tournaments tournaments_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: tournaments tournaments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: unidade unidade_mae_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidade
    ADD CONSTRAINT unidade_mae_id_fkey FOREIGN KEY (mae_id) REFERENCES public.unidade(id);


--
-- Name: unidade unidade_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unidade
    ADD CONSTRAINT unidade_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: vinculo vinculo_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vinculo
    ADD CONSTRAINT vinculo_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id) ON DELETE CASCADE;


--
-- Name: vinculo vinculo_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vinculo
    ADD CONSTRAINT vinculo_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: withdrawals withdrawals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: withdrawals withdrawals_pessoa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pessoa_id_fkey FOREIGN KEY (pessoa_id) REFERENCES public.pessoa(id);


--
-- Name: withdrawals withdrawals_unidade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidade(id);


--
-- Name: withdrawals withdrawals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: abertura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abertura ENABLE ROW LEVEL SECURITY;

--
-- Name: abertura abertura_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY abertura_ler ON public.abertura FOR SELECT TO authenticated USING (((pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))));


--
-- Name: acesso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acesso ENABLE ROW LEVEL SECURITY;

--
-- Name: acesso acesso_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY acesso_ler ON public.acesso FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pessoa p
  WHERE ((p.id = acesso.pessoa_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))) OR public.pode('administrar'::text, unidade_id)));


--
-- Name: aporte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aporte ENABLE ROW LEVEL SECURITY;

--
-- Name: aporte aporte_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aporte_ler ON public.aporte FOR SELECT TO authenticated USING (((pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))));


--
-- Name: app_erros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_erros ENABLE ROW LEVEL SECURITY;

--
-- Name: app_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: aviso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aviso ENABLE ROW LEVEL SECURITY;

--
-- Name: aviso aviso_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY aviso_ler ON public.aviso FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: bankroll_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bankroll_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: config_changes config_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_apagar ON public.config_changes FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: pool_config config_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_apagar ON public.pool_config FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: config_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: config_changes config_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_editar ON public.config_changes FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: pool_config config_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_editar ON public.pool_config FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: config_changes config_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_inserir ON public.config_changes FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: pool_config config_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_inserir ON public.pool_config FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (workspace_id IN ( SELECT public.ws_com('configurar_regras'::text) AS ws_com)))));


--
-- Name: config_changes config_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_ler ON public.config_changes FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: pool_config config_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_ler ON public.pool_config FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: contrato; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contrato ENABLE ROW LEVEL SECURITY;

--
-- Name: contrato contrato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrato_ler ON public.contrato FOR SELECT TO authenticated USING (((pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com)) OR (unidade_id IN ( SELECT public.unidades_com('configurar_regras'::text) AS unidades_com)) OR ((pessoa_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.vinculo v
  WHERE ((v.pessoa_id = contrato.pessoa_id) AND (v.fim IS NULL) AND (v.unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com)))))) OR (EXISTS ( SELECT 1
   FROM ((public.vinculo v
     JOIN public.unidade u ON ((u.id = v.unidade_id)))
     JOIN public.unidade c ON ((c.id = contrato.unidade_id)))
  WHERE ((v.fim IS NULL) AND (v.pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) AND (u.caminho ~~ (c.caminho || '%'::text)))))));


--
-- Name: convite; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.convite ENABLE ROW LEVEL SECURITY;

--
-- Name: convite convite_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY convite_ler ON public.convite FOR SELECT TO authenticated USING ((unidade_id IN ( SELECT public.unidades_com('gerir_pessoas'::text) AS unidades_com)));


--
-- Name: daily_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: bankroll_ledger fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.bankroll_ledger FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: daily_entries fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.daily_entries FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_import_log fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.hh_import_log FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_tournament_stats fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.hh_tournament_stats FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: player_wallets fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.player_wallets FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: tournaments fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.tournaments FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: withdrawals fato_apagar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_apagar ON public.withdrawals FOR DELETE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: bankroll_ledger fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.bankroll_ledger FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: daily_entries fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.daily_entries FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_import_log fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.hh_import_log FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_tournament_stats fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.hh_tournament_stats FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: player_wallets fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.player_wallets FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: tournaments fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.tournaments FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: withdrawals fato_editar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_editar ON public.withdrawals FOR UPDATE TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))))) WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: bankroll_ledger fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.bankroll_ledger FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: daily_entries fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.daily_entries FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_import_log fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.hh_import_log FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: hh_tournament_stats fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.hh_tournament_stats FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: player_wallets fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.player_wallets FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: tournaments fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.tournaments FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('administrar'::text) AS unidades_com)))));


--
-- Name: withdrawals fato_inserir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_inserir ON public.withdrawals FOR INSERT TO authenticated WITH CHECK (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('aprovar_saques'::text) AS unidades_com)))));


--
-- Name: bankroll_ledger fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.bankroll_ledger FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com)))));


--
-- Name: daily_entries fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.daily_entries FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com)))));


--
-- Name: hh_import_log fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.hh_import_log FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com)))));


--
-- Name: hh_tournament_stats fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.hh_tournament_stats FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com)))));


--
-- Name: player_wallets fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.player_wallets FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com)))));


--
-- Name: tournaments fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.tournaments FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_desempenho'::text) AS unidades_com)))));


--
-- Name: withdrawals fato_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fato_ler ON public.withdrawals FOR SELECT TO authenticated USING (((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)) AND ((NOT (workspace_id IN ( SELECT public.ws_estruturados() AS ws_estruturados))) OR (pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com)))));


--
-- Name: grade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grade ENABLE ROW LEVEL SECURITY;

--
-- Name: grade grade_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY grade_ler ON public.grade FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: hh_import_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hh_import_log ENABLE ROW LEVEL SECURITY;

--
-- Name: hh_tournament_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hh_tournament_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pessoa ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa pessoa_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pessoa_ler ON public.pessoa FOR SELECT TO authenticated USING (public.pode_ver_pessoa(id));


--
-- Name: plan_activations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_activations ENABLE ROW LEVEL SECURITY;

--
-- Name: player_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: player_wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_wallets ENABLE ROW LEVEL SECURITY;

--
-- Name: pool_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pool_config ENABLE ROW LEVEL SECURITY;

--
-- Name: player_profiles profile_self_or_teammates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_self_or_teammates ON public.player_profiles USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.workspace_members m
  WHERE ((m.user_id = player_profiles.user_id) AND (m.workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))))))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: regra_unidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regra_unidade ENABLE ROW LEVEL SECURITY;

--
-- Name: regra_unidade regra_unidade_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regra_unidade_ler ON public.regra_unidade FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: reload; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reload ENABLE ROW LEVEL SECURITY;

--
-- Name: reload reload_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reload_ler ON public.reload FOR SELECT TO authenticated USING (((pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))));


--
-- Name: saque; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saque ENABLE ROW LEVEL SECURITY;

--
-- Name: saque saque_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saque_ler ON public.saque FOR SELECT TO authenticated USING (((pessoa_id IN ( SELECT public.minhas_pessoas() AS minhas_pessoas)) OR (unidade_id IN ( SELECT public.unidades_com('ver_financeiro'::text) AS unidades_com))));


--
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

--
-- Name: unidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unidade ENABLE ROW LEVEL SECURITY;

--
-- Name: unidade unidade_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY unidade_ler ON public.unidade FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: vinculo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vinculo ENABLE ROW LEVEL SECURITY;

--
-- Name: vinculo vinculo_ler; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY vinculo_ler ON public.vinculo FOR SELECT TO authenticated USING (public.pode_ver_pessoa(pessoa_id));


--
-- Name: webhook_cobrancas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_cobrancas ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: withdrawals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: bankroll_ledger ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.bankroll_ledger AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: config_changes ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.config_changes AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: daily_entries ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.daily_entries AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: hh_import_log ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.hh_import_log AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: hh_tournament_stats ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.hh_tournament_stats AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: player_wallets ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.player_wallets AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: pool_config ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.pool_config AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: tournaments ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.tournaments AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: withdrawals ws_ativo_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_del ON public.withdrawals AS RESTRICTIVE FOR DELETE TO authenticated USING (public.ws_ativo(workspace_id));


--
-- Name: bankroll_ledger ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.bankroll_ledger AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: config_changes ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.config_changes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: daily_entries ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.daily_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: hh_import_log ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.hh_import_log AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: hh_tournament_stats ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.hh_tournament_stats AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: player_wallets ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.player_wallets AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: pool_config ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.pool_config AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: tournaments ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.tournaments AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: withdrawals ws_ativo_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_ins ON public.withdrawals AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: bankroll_ledger ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.bankroll_ledger AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: config_changes ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.config_changes AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: daily_entries ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.daily_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: hh_import_log ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.hh_import_log AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: hh_tournament_stats ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.hh_tournament_stats AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: player_wallets ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.player_wallets AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: pool_config ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.pool_config AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: tournaments ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.tournaments AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: withdrawals ws_ativo_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_ativo_upd ON public.withdrawals AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_ativo(workspace_id));


--
-- Name: workspaces ws_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_self ON public.workspaces TO authenticated USING ((id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((id IN ( SELECT public.my_workspaces() AS my_workspaces)));


--
-- Name: hh_tournament_stats ws_stats_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_stats_ins ON public.hh_tournament_stats AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.ws_pode_stats(workspace_id));


--
-- Name: hh_tournament_stats ws_stats_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_stats_upd ON public.hh_tournament_stats AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (public.ws_pode_stats(workspace_id));


--
-- Name: workspace_members wsm_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wsm_self ON public.workspace_members FOR SELECT USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION aceitar_convite(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aceitar_convite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aceitar_convite(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.aceitar_convite(p_token text) TO service_role;


--
-- Name: FUNCTION apagar_aviso(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apagar_aviso(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apagar_aviso(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.apagar_aviso(p_id uuid) TO service_role;


--
-- Name: FUNCTION apagar_avisos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apagar_avisos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apagar_avisos() TO authenticated;
GRANT ALL ON FUNCTION public.apagar_avisos() TO service_role;


--
-- Name: FUNCTION apagar_grade(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apagar_grade(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apagar_grade(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.apagar_grade(p_id uuid) TO service_role;


--
-- Name: FUNCTION aplicar_ativacao(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aplicar_ativacao() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aplicar_ativacao() TO authenticated;
GRANT ALL ON FUNCTION public.aplicar_ativacao() TO service_role;


--
-- Name: FUNCTION arquivar_unidade(p_alvo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.arquivar_unidade(p_alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.arquivar_unidade(p_alvo uuid) TO authenticated;
GRANT ALL ON FUNCTION public.arquivar_unidade(p_alvo uuid) TO service_role;


--
-- Name: FUNCTION avisar_erros(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_erros() FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_erros() TO service_role;


--
-- Name: FUNCTION avisar_gestores(p_ws uuid, p_unidade uuid, p_cap text, p_tipo text, p_titulo text, p_texto text, p_ref uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_gestores(p_ws uuid, p_unidade uuid, p_cap text, p_tipo text, p_titulo text, p_texto text, p_ref uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_gestores(p_ws uuid, p_unidade uuid, p_cap text, p_tipo text, p_titulo text, p_texto text, p_ref uuid) TO service_role;


--
-- Name: FUNCTION avisar_pessoa(p_pessoa uuid, p_tipo text, p_titulo text, p_texto text, p_ref uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_pessoa(p_pessoa uuid, p_tipo text, p_titulo text, p_texto text, p_ref uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_pessoa(p_pessoa uuid, p_tipo text, p_titulo text, p_texto text, p_ref uuid) TO service_role;


--
-- Name: FUNCTION aviso_abertura(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aviso_abertura() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aviso_abertura() TO service_role;


--
-- Name: FUNCTION aviso_entrada(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aviso_entrada() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aviso_entrada() TO service_role;


--
-- Name: FUNCTION aviso_entrada_vinculo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aviso_entrada_vinculo() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aviso_entrada_vinculo() TO service_role;


--
-- Name: FUNCTION aviso_saque(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aviso_saque() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aviso_saque() TO service_role;


--
-- Name: FUNCTION cancelar_reload(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_reload(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_reload(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancelar_reload(p_id uuid) TO service_role;


--
-- Name: FUNCTION cancelar_saque(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_saque(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_saque(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancelar_saque(p_id uuid) TO service_role;


--
-- Name: FUNCTION caps_validas(p_caps text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.caps_validas(p_caps text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.caps_validas(p_caps text[]) TO service_role;


--
-- Name: FUNCTION checar_admin_do_time(p_ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.checar_admin_do_time(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checar_admin_do_time(p_ws uuid) TO service_role;


--
-- Name: FUNCTION conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) TO authenticated;
GRANT ALL ON FUNCTION public.conferir_abertura(p_pessoa uuid, p_mu numeric, p_cashout numeric) TO service_role;


--
-- Name: FUNCTION confirmar_envio_reload(p_id uuid, p_valor numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirmar_envio_reload(p_id uuid, p_valor numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirmar_envio_reload(p_id uuid, p_valor numeric) TO authenticated;
GRANT ALL ON FUNCTION public.confirmar_envio_reload(p_id uuid, p_valor numeric) TO service_role;


--
-- Name: FUNCTION confirmar_recebimento(p_id uuid, p_recebido numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.confirmar_recebimento(p_id uuid, p_recebido numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirmar_recebimento(p_id uuid, p_recebido numeric) TO authenticated;
GRANT ALL ON FUNCTION public.confirmar_recebimento(p_id uuid, p_recebido numeric) TO service_role;


--
-- Name: FUNCTION contrato_de(p uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.contrato_de(p uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contrato_de(p uuid) TO service_role;


--
-- Name: FUNCTION convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid) TO authenticated;
GRANT ALL ON FUNCTION public.convidar_equipe(p_nome text, p_unidades uuid[], p_caps text[], p_joga_em uuid) TO service_role;


--
-- Name: FUNCTION convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]) TO authenticated;
GRANT ALL ON FUNCTION public.convidar_gestor(p_unidade uuid, p_nome text, p_caps text[]) TO service_role;


--
-- Name: FUNCTION convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text, p_id_gg text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text, p_id_gg text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text, p_id_gg text) TO authenticated;
GRANT ALL ON FUNCTION public.convidar_jogador(p_unidade uuid, p_nome text, p_nick_ps text, p_id_gg text) TO service_role;


--
-- Name: FUNCTION convite_hash(t text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convite_hash(t text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.convite_hash(t text) TO service_role;


--
-- Name: FUNCTION create_solo_workspace(ws_name text, plan_escolhido text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) TO authenticated;
GRANT ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) TO service_role;


--
-- Name: FUNCTION criar_convite(p_unidade uuid, p_pessoa uuid, p_dias integer, p_usos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.criar_convite(p_unidade uuid, p_pessoa uuid, p_dias integer, p_usos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.criar_convite(p_unidade uuid, p_pessoa uuid, p_dias integer, p_usos integer) TO authenticated;
GRANT ALL ON FUNCTION public.criar_convite(p_unidade uuid, p_pessoa uuid, p_dias integer, p_usos integer) TO service_role;


--
-- Name: FUNCTION criar_time(p_nome text, p_dono uuid, p_nome_dono text, p_assentos integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.criar_time(p_nome text, p_dono uuid, p_nome_dono text, p_assentos integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.criar_time(p_nome text, p_dono uuid, p_nome_dono text, p_assentos integer) TO service_role;


--
-- Name: FUNCTION criar_unidade(p_mae uuid, p_nome text, p_rotulo text, p_ordem integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.criar_unidade(p_mae uuid, p_nome text, p_rotulo text, p_ordem integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.criar_unidade(p_mae uuid, p_nome text, p_rotulo text, p_ordem integer) TO authenticated;
GRANT ALL ON FUNCTION public.criar_unidade(p_mae uuid, p_nome text, p_rotulo text, p_ordem integer) TO service_role;


--
-- Name: FUNCTION decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.decidir_reload(p_id uuid, p_aprovar boolean, p_motivo text) TO service_role;


--
-- Name: FUNCTION decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.decidir_saque(p_id uuid, p_aprovar boolean, p_motivo text) TO service_role;


--
-- Name: FUNCTION definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]) TO authenticated;
GRANT ALL ON FUNCTION public.definir_acesso(p_alvo uuid, p_unidade uuid, p_caps text[]) TO service_role;


--
-- Name: FUNCTION definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date) TO authenticated;
GRANT ALL ON FUNCTION public.definir_contrato(p_unidade uuid, p_pessoa uuid, p_faixas jsonb, p_inicio date) TO service_role;


--
-- Name: FUNCTION definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]) TO authenticated;
GRANT ALL ON FUNCTION public.definir_papel(p_alvo uuid, p_unidades uuid[], p_caps text[]) TO service_role;


--
-- Name: FUNCTION definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date) TO authenticated;
GRANT ALL ON FUNCTION public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date) TO service_role;


--
-- Name: FUNCTION dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric) TO authenticated;
GRANT ALL ON FUNCTION public.dividir_cashout(p_faixas jsonb, p_lifetime numeric, p_cashout numeric) TO service_role;


--
-- Name: FUNCTION editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem integer, p_arquivar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem integer, p_arquivar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem integer, p_arquivar boolean) TO authenticated;
GRANT ALL ON FUNCTION public.editar_unidade(p_alvo uuid, p_nome text, p_rotulo text, p_ordem integer, p_arquivar boolean) TO service_role;


--
-- Name: FUNCTION em_mk(p_pessoa uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.em_mk(p_pessoa uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.em_mk(p_pessoa uuid) TO service_role;


--
-- Name: FUNCTION email_for_login(identifier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.email_for_login(identifier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_for_login(identifier text) TO service_role;


--
-- Name: FUNCTION enviar_planilha(p_planilha jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enviar_planilha(p_planilha jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enviar_planilha(p_planilha jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.enviar_planilha(p_planilha jsonb) TO service_role;


--
-- Name: FUNCTION estruturar_workspace(ws uuid, jogadores jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.estruturar_workspace(ws uuid, jogadores jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.estruturar_workspace(ws uuid, jogadores jsonb) TO service_role;


--
-- Name: FUNCTION excluir_minha_conta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.excluir_minha_conta() FROM PUBLIC;
GRANT ALL ON FUNCTION public.excluir_minha_conta() TO authenticated;
GRANT ALL ON FUNCTION public.excluir_minha_conta() TO service_role;


--
-- Name: FUNCTION fato_pessoa_unidade(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fato_pessoa_unidade() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fato_pessoa_unidade() TO service_role;


--
-- Name: FUNCTION fmt_usd(v numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fmt_usd(v numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fmt_usd(v numeric) TO authenticated;
GRANT ALL ON FUNCTION public.fmt_usd(v numeric) TO service_role;


--
-- Name: FUNCTION iniciar_time(p_nome_raiz text, p_nome_admin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.iniciar_time(p_nome_raiz text, p_nome_admin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.iniciar_time(p_nome_raiz text, p_nome_admin text) TO authenticated;
GRANT ALL ON FUNCTION public.iniciar_time(p_nome_raiz text, p_nome_admin text) TO service_role;


--
-- Name: FUNCTION marcar_avisos_lidos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marcar_avisos_lidos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.marcar_avisos_lidos() TO authenticated;
GRANT ALL ON FUNCTION public.marcar_avisos_lidos() TO service_role;


--
-- Name: FUNCTION mesma_organizacao(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mesma_organizacao() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mesma_organizacao() TO service_role;


--
-- Name: FUNCTION meu_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meu_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meu_status() TO authenticated;
GRANT ALL ON FUNCTION public.meu_status() TO service_role;


--
-- Name: FUNCTION minhas_pessoas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.minhas_pessoas() FROM PUBLIC;
GRANT ALL ON FUNCTION public.minhas_pessoas() TO authenticated;
GRANT ALL ON FUNCTION public.minhas_pessoas() TO service_role;


--
-- Name: FUNCTION mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.mover_jogador(p_alvo uuid, p_destino uuid, p_motivo text) TO service_role;


--
-- Name: FUNCTION mover_unidade(p_alvo uuid, p_nova_mae uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mover_unidade(p_alvo uuid, p_nova_mae uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mover_unidade(p_alvo uuid, p_nova_mae uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mover_unidade(p_alvo uuid, p_nova_mae uuid) TO service_role;


--
-- Name: FUNCTION my_workspaces(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_workspaces() TO authenticated;
GRANT ALL ON FUNCTION public.my_workspaces() TO service_role;


--
-- Name: FUNCTION nickname_disponivel(nick text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nickname_disponivel(nick text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nickname_disponivel(nick text) TO anon;
GRANT ALL ON FUNCTION public.nickname_disponivel(nick text) TO authenticated;
GRANT ALL ON FUNCTION public.nickname_disponivel(nick text) TO service_role;


--
-- Name: FUNCTION pedir_reload(p_valor numeric, p_sala text, p_motivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pedir_reload(p_valor numeric, p_sala text, p_motivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pedir_reload(p_valor numeric, p_sala text, p_motivo text) TO authenticated;
GRANT ALL ON FUNCTION public.pedir_reload(p_valor numeric, p_sala text, p_motivo text) TO service_role;


--
-- Name: FUNCTION perfil_protegido(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.perfil_protegido() FROM PUBLIC;
GRANT ALL ON FUNCTION public.perfil_protegido() TO service_role;


--
-- Name: FUNCTION perfil_sync_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.perfil_sync_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.perfil_sync_email() TO service_role;


--
-- Name: FUNCTION pessoa_assentos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pessoa_assentos() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pessoa_assentos() TO service_role;


--
-- Name: FUNCTION pode(cap text, alvo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pode(cap text, alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pode(cap text, alvo uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pode(cap text, alvo uuid) TO service_role;


--
-- Name: FUNCTION pode_ver_pessoa(alvo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pode_ver_pessoa(alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pode_ver_pessoa(alvo uuid) TO authenticated;
GRANT ALL ON FUNCTION public.pode_ver_pessoa(alvo uuid) TO service_role;


--
-- Name: FUNCTION raiz_do_ws(p_ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.raiz_do_ws(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.raiz_do_ws(p_ws uuid) TO service_role;


--
-- Name: FUNCTION recalcular_fatos(p uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recalcular_fatos(p uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recalcular_fatos(p uuid) TO service_role;


--
-- Name: FUNCTION registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date, p_obs text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date, p_obs text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date, p_obs text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_aporte(p_pessoa uuid, p_valor numeric, p_data date, p_obs text) TO service_role;


--
-- Name: FUNCTION registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) TO service_role;


--
-- Name: FUNCTION registrar_saida(p_alvo uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_saida(p_alvo uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_saida(p_alvo uuid) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_saida(p_alvo uuid) TO service_role;


--
-- Name: FUNCTION regra_efetiva(p_unidade uuid, p_chave text, p_data date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.regra_efetiva(p_unidade uuid, p_chave text, p_data date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.regra_efetiva(p_unidade uuid, p_chave text, p_data date) TO authenticated;
GRANT ALL ON FUNCTION public.regra_efetiva(p_unidade uuid, p_chave text, p_data date) TO service_role;


--
-- Name: FUNCTION renomear_pessoa(p_alvo uuid, p_nome text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.renomear_pessoa(p_alvo uuid, p_nome text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.renomear_pessoa(p_alvo uuid, p_nome text) TO authenticated;
GRANT ALL ON FUNCTION public.renomear_pessoa(p_alvo uuid, p_nome text) TO service_role;


--
-- Name: FUNCTION renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text) TO authenticated;
GRANT ALL ON FUNCTION public.renomear_unidade(p_alvo uuid, p_nome text, p_rotulo text) TO service_role;


--
-- Name: FUNCTION resumo_time(p_desde date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resumo_time(p_desde date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resumo_time(p_desde date) TO authenticated;
GRANT ALL ON FUNCTION public.resumo_time(p_desde date) TO service_role;


--
-- Name: FUNCTION revogar_convite(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revogar_convite(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revogar_convite(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revogar_convite(p_id uuid) TO service_role;


--
-- Name: FUNCTION salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text) TO authenticated;
GRANT ALL ON FUNCTION public.salvar_grade(p_unidade uuid, p_desde date, p_simulada boolean, p_celulas jsonb, p_obs text) TO service_role;


--
-- Name: FUNCTION set_workspace_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_workspace_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_workspace_id() TO service_role;


--
-- Name: FUNCTION simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric) TO authenticated;
GRANT ALL ON FUNCTION public.simular_saque(p_pessoa uuid, p_banca numeric, p_devolucao numeric, p_cashout numeric) TO service_role;


--
-- Name: FUNCTION situacao_jogador(p_pessoa uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.situacao_jogador(p_pessoa uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.situacao_jogador(p_pessoa uuid) TO authenticated;
GRANT ALL ON FUNCTION public.situacao_jogador(p_pessoa uuid) TO service_role;


--
-- Name: FUNCTION solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb, p_obs text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb, p_obs text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb, p_obs text) TO authenticated;
GRANT ALL ON FUNCTION public.solicitar_saque(p_banca numeric, p_devolucao numeric, p_cashout numeric, p_carteiras jsonb, p_obs text) TO service_role;


--
-- Name: FUNCTION unidade_caminho(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unidade_caminho() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unidade_caminho() TO service_role;


--
-- Name: FUNCTION unidade_caminho_filhas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unidade_caminho_filhas() FROM PUBLIC;
GRANT ALL ON FUNCTION public.unidade_caminho_filhas() TO service_role;


--
-- Name: FUNCTION unidade_na_data(p uuid, d date, ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unidade_na_data(p uuid, d date, ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unidade_na_data(p uuid, d date, ws uuid) TO service_role;


--
-- Name: FUNCTION unidades_com(cap text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unidades_com(cap text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unidades_com(cap text) TO authenticated;
GRANT ALL ON FUNCTION public.unidades_com(cap text) TO service_role;


--
-- Name: FUNCTION validar_faixas(p_faixas jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validar_faixas(p_faixas jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validar_faixas(p_faixas jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.validar_faixas(p_faixas jsonb) TO service_role;


--
-- Name: FUNCTION ver_convite(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ver_convite(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ver_convite(p_token text) TO anon;
GRANT ALL ON FUNCTION public.ver_convite(p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.ver_convite(p_token text) TO service_role;


--
-- Name: FUNCTION webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_ativar_plano(p_email text, p_plan text, p_source text, p_order_id text) TO service_role;


--
-- Name: FUNCTION webhook_revogar_plano(p_email text, p_order_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text) TO service_role;


--
-- Name: FUNCTION webhook_revogar_plano(p_email text, p_order_id text, p_plan text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text, p_plan text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_revogar_plano(p_email text, p_order_id text, p_plan text) TO service_role;


--
-- Name: FUNCTION ws_ativo(ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_ativo(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_ativo(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ws_ativo(ws uuid) TO service_role;


--
-- Name: FUNCTION ws_com(cap text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_com(cap text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_com(cap text) TO authenticated;
GRANT ALL ON FUNCTION public.ws_com(cap text) TO service_role;


--
-- Name: FUNCTION ws_estruturados(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_estruturados() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_estruturados() TO authenticated;
GRANT ALL ON FUNCTION public.ws_estruturados() TO service_role;


--
-- Name: FUNCTION ws_pode_stats(ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_pode_stats(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_pode_stats(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ws_pode_stats(ws uuid) TO service_role;


--
-- Name: TABLE abertura; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.abertura TO service_role;
GRANT SELECT ON TABLE public.abertura TO authenticated;


--
-- Name: TABLE acesso; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.acesso TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.acesso TO authenticated;
GRANT ALL ON TABLE public.acesso TO service_role;


--
-- Name: TABLE aporte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aporte TO service_role;
GRANT SELECT ON TABLE public.aporte TO authenticated;


--
-- Name: TABLE app_erros; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_erros TO service_role;


--
-- Name: SEQUENCE app_erros_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.app_erros_id_seq TO anon;
GRANT ALL ON SEQUENCE public.app_erros_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.app_erros_id_seq TO service_role;


--
-- Name: TABLE app_secrets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_secrets TO service_role;


--
-- Name: TABLE aviso; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aviso TO service_role;
GRANT SELECT ON TABLE public.aviso TO authenticated;


--
-- Name: TABLE bankroll_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bankroll_ledger TO anon;
GRANT ALL ON TABLE public.bankroll_ledger TO authenticated;
GRANT ALL ON TABLE public.bankroll_ledger TO service_role;


--
-- Name: TABLE config_changes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.config_changes TO anon;
GRANT ALL ON TABLE public.config_changes TO authenticated;
GRANT ALL ON TABLE public.config_changes TO service_role;


--
-- Name: TABLE contrato; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contrato TO service_role;
GRANT SELECT ON TABLE public.contrato TO authenticated;


--
-- Name: TABLE convite; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.convite TO service_role;


--
-- Name: COLUMN convite.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.workspace_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(workspace_id) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.unidade_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(unidade_id) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.pessoa_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(pessoa_id) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.expira_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(expira_em) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.usos_max; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(usos_max) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.usos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(usos) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.revogado; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(revogado) ON TABLE public.convite TO authenticated;


--
-- Name: COLUMN convite.criado_em; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(criado_em) ON TABLE public.convite TO authenticated;


--
-- Name: TABLE daily_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_entries TO anon;
GRANT ALL ON TABLE public.daily_entries TO authenticated;
GRANT ALL ON TABLE public.daily_entries TO service_role;


--
-- Name: TABLE grade; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.grade TO service_role;
GRANT SELECT ON TABLE public.grade TO authenticated;


--
-- Name: TABLE hh_import_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hh_import_log TO anon;
GRANT ALL ON TABLE public.hh_import_log TO authenticated;
GRANT ALL ON TABLE public.hh_import_log TO service_role;


--
-- Name: TABLE hh_tournament_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hh_tournament_stats TO anon;
GRANT ALL ON TABLE public.hh_tournament_stats TO authenticated;
GRANT ALL ON TABLE public.hh_tournament_stats TO service_role;


--
-- Name: TABLE pessoa; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.pessoa TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.pessoa TO authenticated;
GRANT ALL ON TABLE public.pessoa TO service_role;


--
-- Name: TABLE plan_activations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_activations TO service_role;


--
-- Name: TABLE player_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.player_profiles TO anon;
GRANT ALL ON TABLE public.player_profiles TO authenticated;
GRANT ALL ON TABLE public.player_profiles TO service_role;


--
-- Name: TABLE player_wallets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.player_wallets TO anon;
GRANT ALL ON TABLE public.player_wallets TO authenticated;
GRANT ALL ON TABLE public.player_wallets TO service_role;


--
-- Name: TABLE pool_config; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pool_config TO anon;
GRANT ALL ON TABLE public.pool_config TO authenticated;
GRANT ALL ON TABLE public.pool_config TO service_role;


--
-- Name: TABLE regra_unidade; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.regra_unidade TO service_role;
GRANT SELECT ON TABLE public.regra_unidade TO authenticated;


--
-- Name: TABLE reload; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reload TO service_role;
GRANT SELECT ON TABLE public.reload TO authenticated;


--
-- Name: TABLE saque; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.saque TO service_role;
GRANT SELECT ON TABLE public.saque TO authenticated;


--
-- Name: TABLE tournaments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournaments TO anon;
GRANT ALL ON TABLE public.tournaments TO authenticated;
GRANT ALL ON TABLE public.tournaments TO service_role;


--
-- Name: TABLE unidade; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.unidade TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.unidade TO authenticated;
GRANT ALL ON TABLE public.unidade TO service_role;


--
-- Name: TABLE vinculo; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.vinculo TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.vinculo TO authenticated;
GRANT ALL ON TABLE public.vinculo TO service_role;


--
-- Name: TABLE webhook_cobrancas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_cobrancas TO anon;
GRANT ALL ON TABLE public.webhook_cobrancas TO authenticated;
GRANT ALL ON TABLE public.webhook_cobrancas TO service_role;


--
-- Name: TABLE webhook_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_events TO anon;
GRANT ALL ON TABLE public.webhook_events TO authenticated;
GRANT ALL ON TABLE public.webhook_events TO service_role;


--
-- Name: TABLE withdrawals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.withdrawals TO anon;
GRANT ALL ON TABLE public.withdrawals TO authenticated;
GRANT ALL ON TABLE public.withdrawals TO service_role;


--
-- Name: TABLE workspace_members; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.workspace_members TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;


--
-- Name: TABLE workspaces; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.workspaces TO anon;
GRANT SELECT,REFERENCES,TRIGGER ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict A7xb2tAVbN1OT6t7hHN7Jb52mAkvl5N2pDiiFhz5PeZnZ6cTjM4cyPF1JUqtcPy

