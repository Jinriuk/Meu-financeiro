-- ============================================================
-- GrinderBank · schema public GERADO (não edite à mão)
-- Fonte: supabase/migrations/*.sql aplicadas do zero num Postgres limpo.
-- Regerar: DUMP=schema.sql bash tools/regua/banco/recriar.sh
-- Conferido contra produção em 18/11/2026: catálogo idêntico até 20260805135400.
-- ============================================================
--
-- PostgreSQL database dump
--

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

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
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare wid uuid; uid uuid;
begin
  update public.plan_activations set status='revoked' where lower(email) = lower(p_email) and status = 'pending';
  select u.id into uid from auth.users u
   where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null limit 1;
  if uid is not null then
    select workspace_id into wid from public.workspace_members where user_id = uid order by created_at limit 1;
    if wid is not null then
      update public.workspaces set plan='free', trial_ends_at=now() where id = wid and plan not in ('team','founder');
    end if;
  end if;
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
-- Name: ws_pode_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ws_pode_stats(ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (select 1 from public.workspaces w
                 where w.id = ws and (w.kind <> 'solo' or w.plan in ('pro','founder','team')));
$$;

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
    workspace_id uuid NOT NULL
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
    workspace_id uuid NOT NULL
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
    workspace_id uuid NOT NULL
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
    wtsd_np_cnt integer DEFAULT 0 NOT NULL
);

--
-- Name: COLUMN hh_tournament_stats.engine_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hh_tournament_stats.engine_version IS 'Versão das definições do motor de stats que calculou a linha (HH_ENGINE no app). 1 = até jul/2026, 2 = PT4.';

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
    workspace_id uuid NOT NULL
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
    workspace_id uuid NOT NULL
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
    CONSTRAINT workspaces_kind_check CHECK ((kind = ANY (ARRAY['team'::text, 'solo'::text]))),
    CONSTRAINT workspaces_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'gestao'::text, 'pro'::text, 'founder'::text, 'team'::text])))
);

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
-- Name: daily_entries daily_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_pkey PRIMARY KEY (id);

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
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_pkey PRIMARY KEY (id);

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
-- Name: app_erros_pendentes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_erros_pendentes ON public.app_erros USING btree (created_at) WHERE (avisado_em IS NULL);

--
-- Name: app_erros_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_erros_user ON public.app_erros USING btree (user_id, created_at);

--
-- Name: hh_stats_ws_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hh_stats_ws_key ON public.hh_tournament_stats USING btree (workspace_id, player, site, site_tournament_id);

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
-- Name: player_wallets_ws_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_wallets_ws_key ON public.player_wallets USING btree (workspace_id, player, wallet);

--
-- Name: pool_config_one_per_ws; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pool_config_one_per_ws ON public.pool_config USING btree (workspace_id);

--
-- Name: tournaments_site_tid_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tournaments_site_tid_uniq ON public.tournaments USING btree (workspace_id, player, site, site_tournament_id) WHERE (site_tournament_id IS NOT NULL);

--
-- Name: player_profiles perfil_protegido; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfil_protegido BEFORE INSERT OR UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION public.perfil_protegido();

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
-- Name: bankroll_ledger bankroll_ledger_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bankroll_ledger
    ADD CONSTRAINT bankroll_ledger_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

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
-- Name: daily_entries daily_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: daily_entries daily_entries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_entries
    ADD CONSTRAINT daily_entries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

--
-- Name: hh_import_log hh_import_log_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_import_log
    ADD CONSTRAINT hh_import_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

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
-- Name: hh_tournament_stats hh_tournament_stats_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hh_tournament_stats
    ADD CONSTRAINT hh_tournament_stats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

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
-- Name: tournaments tournaments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: tournaments tournaments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tournaments
    ADD CONSTRAINT tournaments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

--
-- Name: withdrawals withdrawals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

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
-- Name: app_erros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_erros ENABLE ROW LEVEL SECURITY;

--
-- Name: app_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: bankroll_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bankroll_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: config_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: hh_import_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hh_import_log ENABLE ROW LEVEL SECURITY;

--
-- Name: hh_tournament_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hh_tournament_stats ENABLE ROW LEVEL SECURITY;

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
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

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
-- Name: bankroll_ledger ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.bankroll_ledger TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: config_changes ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.config_changes TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: daily_entries ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.daily_entries TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: hh_import_log ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.hh_import_log TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: hh_tournament_stats ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.hh_tournament_stats TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: player_wallets ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.player_wallets TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: pool_config ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.pool_config TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: tournaments ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.tournaments TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

--
-- Name: withdrawals ws_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_members ON public.withdrawals TO authenticated USING ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces))) WITH CHECK ((workspace_id IN ( SELECT public.my_workspaces() AS my_workspaces)));

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
-- Name: FUNCTION aplicar_ativacao(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aplicar_ativacao() FROM PUBLIC;
GRANT ALL ON FUNCTION public.aplicar_ativacao() TO authenticated;
GRANT ALL ON FUNCTION public.aplicar_ativacao() TO service_role;

--
-- Name: FUNCTION avisar_erros(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_erros() FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_erros() TO service_role;

--
-- Name: FUNCTION create_solo_workspace(ws_name text, plan_escolhido text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) TO authenticated;
GRANT ALL ON FUNCTION public.create_solo_workspace(ws_name text, plan_escolhido text) TO service_role;

--
-- Name: FUNCTION email_for_login(identifier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.email_for_login(identifier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_for_login(identifier text) TO service_role;

--
-- Name: FUNCTION excluir_minha_conta(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.excluir_minha_conta() FROM PUBLIC;
GRANT ALL ON FUNCTION public.excluir_minha_conta() TO authenticated;
GRANT ALL ON FUNCTION public.excluir_minha_conta() TO service_role;

--
-- Name: FUNCTION meu_status(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meu_status() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meu_status() TO authenticated;
GRANT ALL ON FUNCTION public.meu_status() TO service_role;

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
-- Name: FUNCTION registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) TO authenticated;
GRANT ALL ON FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb, p_build text) TO service_role;

--
-- Name: FUNCTION set_workspace_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_workspace_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_workspace_id() TO service_role;

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
-- Name: FUNCTION ws_ativo(ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_ativo(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_ativo(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ws_ativo(ws uuid) TO service_role;

--
-- Name: FUNCTION ws_pode_stats(ws uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ws_pode_stats(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_pode_stats(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ws_pode_stats(ws uuid) TO service_role;

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
-- Name: TABLE daily_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_entries TO anon;
GRANT ALL ON TABLE public.daily_entries TO authenticated;
GRANT ALL ON TABLE public.daily_entries TO service_role;

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
-- Name: TABLE tournaments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tournaments TO anon;
GRANT ALL ON TABLE public.tournaments TO authenticated;
GRANT ALL ON TABLE public.tournaments TO service_role;

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

