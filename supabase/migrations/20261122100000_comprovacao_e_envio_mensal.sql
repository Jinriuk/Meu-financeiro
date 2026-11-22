-- ============================================================
-- Comprovação dos torneios e envio mensal pro time (pedido do dono, 22/11). Idempotente.
--
-- Comprovação (plano mestre, seção 5: o maior risco num time com staking é o jogador omitir sessão perdedora ou digitar
-- prêmio maior):
--   · tournaments.comprovante guarda o que o ARQUIVO do site disse na hora do import: na GG, o resumo do torneio
--     (Tournament Summary, que é outro arquivo, não o das mãos); na PokerStars, o próprio hand history, que já traz o
--     resultado. Campos: fonte, buyin, prize, reentries (e bounty quando o arquivo traz).
--   · sem comprovante = digitado sem arquivo. Se o lançado mudar depois do import, a tela compara e mostra
--     "diverge do arquivo".
--   · o comprovante só entra com o id do torneio no site e ganha a hora em que foi gravado (gatilho).
--   · os torneios já importados antes (têm o id do site) ganham o comprovante com os valores de hoje: o arquivo antigo
--     não ficou guardado.
--
-- Envio mensal: o time pede todo mês, por e-mail, o arquivo dos torneios da GG (e o do refund) pra conferir.
--   · regras por unidade, herdadas (definir_regra): envio_ligado, envio_email, envio_prazo_dia (até que dia do mês
--     seguinte), envio_divisao (vai no título do e-mail: "NOME - DIVISÃO"), envio_instrucoes (o passo a passo);
--   · o jogador confirma que mandou (marcar_envio_mensal); a gestão vê quem confirmou (envio_mensal, por escopo).
-- ============================================================

-- ---------- comprovante do torneio ----------
alter table public.tournaments add column if not exists comprovante jsonb;
comment on column public.tournaments.comprovante is
  'o que o arquivo do site disse no import (fonte, buyin, prize, reentries, bounty, em); null = digitado sem arquivo';

create or replace function public.comprovante_torneio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.comprovante is not null and (tg_op = 'INSERT' or new.comprovante is distinct from old.comprovante) then
    if jsonb_typeof(new.comprovante) <> 'object' or coalesce(btrim(new.site_tournament_id), '') = '' then
      raise exception 'comprovante só com o id do torneio no site (ele vem do arquivo)' using errcode = 'check_violation'; end if;
    new.comprovante := new.comprovante || jsonb_build_object('em', now());
  end if;
  return new;
end $$;
revoke all on function public.comprovante_torneio() from public, anon, authenticated;
drop trigger if exists comprovante_torneio on public.tournaments;
create trigger comprovante_torneio before insert or update on public.tournaments for each row execute function public.comprovante_torneio();

-- os já importados (com o id do site) valem como comprovados com os valores de hoje
update public.tournaments t
   set comprovante = jsonb_build_object('fonte', 'importado_antes', 'buyin', t.buyin, 'prize', t.prize, 'reentries', t.reentries)
 where t.comprovante is null and coalesce(btrim(t.site_tournament_id), '') <> '';

-- ---------- regras do envio mensal ----------
alter table public.regra_unidade drop constraint if exists regra_unidade_chave_check;
alter table public.regra_unidade add constraint regra_unidade_chave_check check (chave in (
  'bloquear_promocao_com_mk', 'jogador_ve_ranking', 'abi_max', 'stop_dia_buyins', 'stop_semana_pct', 'sites', 'modalidades', 'reserva_por_sala',
  'envio_ligado', 'envio_email', 'envio_prazo_dia', 'envio_divisao', 'envio_instrucoes'));

create or replace function public.definir_regra(p_unidade uuid, p_chave text, p_valor jsonb, p_desde date default null) returns void
language plpgsql security definer set search_path = '' as $$
declare u record; n numeric; x jsonb; s text;
begin
  select * into u from public.unidade where id = p_unidade;
  if u.id is null then raise exception 'unidade não existe'; end if;
  if not public.pode('configurar_regras', p_unidade) then
    raise exception 'precisa de "configurar_regras" nesta unidade' using errcode = 'insufficient_privilege'; end if;
  if p_valor is null or p_valor = 'null'::jsonb then raise exception 'pra voltar a herdar, use limpar_regra'; end if;
  case
    when p_chave in ('bloquear_promocao_com_mk', 'jogador_ve_ranking', 'envio_ligado') then
      if jsonb_typeof(p_valor) <> 'boolean' then raise exception 'essa regra é ligada ou desligada (true/false)'; end if;
    when p_chave in ('abi_max', 'stop_dia_buyins', 'stop_semana_pct', 'reserva_por_sala', 'envio_prazo_dia') then
      if jsonb_typeof(p_valor) <> 'number' then raise exception 'essa regra é um número'; end if;
      n := (p_valor #>> '{}')::numeric;
      if p_chave = 'abi_max' and n <= 0 then raise exception 'o ABI máximo precisa ser maior que zero'; end if;
      if p_chave in ('stop_dia_buyins', 'reserva_por_sala') and n < 0 then raise exception 'o valor não pode ser negativo'; end if;
      if p_chave = 'stop_semana_pct' and (n < 0 or n > 1) then raise exception 'o stop semanal é uma fração da banca, de 0 a 1 (15%% = 0.15)'; end if;
      if p_chave = 'envio_prazo_dia' and (n <> trunc(n) or n < 1 or n > 28) then raise exception 'o prazo é um dia do mês, de 1 a 28'; end if;
    when p_chave in ('sites', 'modalidades') then
      if jsonb_typeof(p_valor) <> 'array' or jsonb_array_length(p_valor) = 0 or jsonb_array_length(p_valor) > 30 then
        raise exception 'informe de 1 a 30 nomes'; end if;
      for x in select e from jsonb_array_elements(p_valor) e loop
        if jsonb_typeof(x) <> 'string' or length(btrim(x #>> '{}')) = 0 or length(x #>> '{}') > 40 then
          raise exception 'cada nome precisa ter de 1 a 40 letras'; end if;
      end loop;
    when p_chave in ('envio_email', 'envio_divisao', 'envio_instrucoes') then
      if jsonb_typeof(p_valor) <> 'string' then raise exception 'essa regra é um texto'; end if;
      s := btrim(p_valor #>> '{}');
      if s = '' then raise exception 'texto vazio: pra voltar a herdar, use limpar_regra'; end if;
      if p_chave = 'envio_email' and (length(s) > 120 or s !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        raise exception 'e-mail inválido'; end if;
      if p_chave = 'envio_divisao' and length(s) > 40 then raise exception 'a divisão tem até 40 letras'; end if;
      if p_chave = 'envio_instrucoes' and length(s) > 4000 then raise exception 'as instruções têm até 4.000 letras'; end if;
      p_valor := to_jsonb(s);
    else raise exception 'regra desconhecida: %', p_chave;
  end case;
  insert into public.regra_unidade(workspace_id, unidade_id, chave, valor, vigente_desde, criado_por)
  values (u.workspace_id, p_unidade, p_chave, p_valor, coalesce(p_desde, current_date), auth.uid())
  on conflict (unidade_id, chave, vigente_desde) do update set valor = excluded.valor, criado_por = excluded.criado_por, criado_em = now();
end $$;

-- ---------- quem confirmou o envio de cada mês ----------
create table if not exists public.envio_mensal (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pessoa_id uuid not null references public.pessoa(id) on delete cascade,
  unidade_id uuid references public.unidade(id),
  mes date not null check (mes = date_trunc('month', mes)::date),   -- o mês dos torneios (dia 1)
  enviado_em timestamptz not null default now(),
  unique (pessoa_id, mes)
);
create index if not exists envio_mensal_ws_mes on public.envio_mensal(workspace_id, mes);
alter table public.envio_mensal enable row level security;
revoke all on public.envio_mensal from anon, authenticated;
grant select on public.envio_mensal to authenticated;
-- lê: o próprio jogador e quem acompanha a reta dele (desempenho ou financeiro). Grava só pela função.
drop policy if exists envio_ler on public.envio_mensal;
create policy envio_ler on public.envio_mensal for select to authenticated using (
  workspace_id in (select public.my_workspaces())
  and (pessoa_id in (select public.minhas_pessoas())
       or unidade_id in (select public.unidades_com('ver_desempenho'))
       or unidade_id in (select public.unidades_com('ver_financeiro'))));
-- time suspenso não grava (como as outras tabelas do time)
drop trigger if exists zz_time_suspenso on public.envio_mensal;
create trigger zz_time_suspenso before insert or update or delete on public.envio_mensal for each row execute function public.trava_time_suspenso();

create or replace function public.marcar_envio_mensal(p_mes date, p_enviado boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare p uuid; ws uuid; u uuid; m date := date_trunc('month', p_mes)::date;
begin
  select pe.id, pe.workspace_id into p, ws from public.pessoa pe
   where pe.user_id = auth.uid() and pe.status = 'ativo'
     and exists (select 1 from public.vinculo v where v.pessoa_id = pe.id and v.fim is null) limit 1;
  if p is null then raise exception 'só quem joga no time confirma o envio' using errcode = 'insufficient_privilege'; end if;
  if p_mes is null or m > date_trunc('month', current_date)::date then raise exception 'mês inválido'; end if;
  select v.unidade_id into u from public.vinculo v where v.pessoa_id = p and v.fim is null;
  if coalesce(p_enviado, true) then
    insert into public.envio_mensal(workspace_id, pessoa_id, unidade_id, mes) values (ws, p, u, m)
    on conflict (pessoa_id, mes) do update set enviado_em = now(), unidade_id = excluded.unidade_id;
  else
    delete from public.envio_mensal where pessoa_id = p and mes = m;
  end if;
end $$;
revoke all on function public.marcar_envio_mensal(date, boolean) from public, anon;
grant execute on function public.marcar_envio_mensal(date, boolean) to authenticated;
