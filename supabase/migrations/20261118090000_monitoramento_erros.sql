-- ============================================================
-- Monitoramento de erro (plano mestre F0.17). Idempotente.
--  · app_erros: erro do app (navegador), do import e dos webhooks, num lugar só, no próprio banco
--    (sem mandar dado pra terceiro). Cliente só grava pela RPC registrar_erro (com limite por hora).
--  · avisar_erros(): a cada 5 min (pg_cron) junta os erros novos e manda UM aviso curto pro endereço
--    em app_secrets.alerta_webhook_url (Discord, Slack ou ntfy.sh). Sem endereço, só registra.
--    O aviso leva contagem por origem e até 3 mensagens cortadas — nunca e-mail, nome ou valores.
-- ============================================================
create table if not exists public.app_erros (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  origem text not null check (origem in ('app','import','webhook','servidor')),
  mensagem text not null,
  detalhe jsonb,
  build text,
  user_id uuid default auth.uid(),
  workspace_id uuid,
  avisado_em timestamptz
);
create index if not exists app_erros_pendentes on public.app_erros (created_at) where avisado_em is null;
create index if not exists app_erros_user on public.app_erros (user_id, created_at);
alter table public.app_erros enable row level security;   -- sem policy: só RPC e service role
revoke all on public.app_erros from anon, authenticated;

create or replace function public.registrar_erro(p_origem text, p_mensagem text, p_detalhe jsonb default null, p_build text default null)
returns void language plpgsql security definer set search_path = '' as $$
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
revoke all on function public.registrar_erro(text,text,jsonb,text) from public, anon;
grant execute on function public.registrar_erro(text,text,jsonb,text) to authenticated;

insert into public.app_secrets (name, value) values ('alerta_webhook_url', '') on conflict (name) do nothing;

-- monta e envia o aviso; devolve o texto (útil pra testar sem rede)
create or replace function public.avisar_erros()
returns text language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.avisar_erros() from public, anon, authenticated;

-- extensões e agendamento: se o ambiente não tiver (Postgres local de teste), segue sem quebrar
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then raise notice 'pg_net indisponível: %', sqlerrm; end $$;
do $$ begin
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'avisar-erros';
  perform cron.schedule('avisar-erros', '*/5 * * * *', 'select public.avisar_erros()');
exception when others then raise notice 'pg_cron indisponível: %', sqlerrm; end $$;
