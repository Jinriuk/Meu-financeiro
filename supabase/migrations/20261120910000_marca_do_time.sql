-- ============================================================
-- Marca do time (pedido do dono, 20/11): o time aparece com a logo e o nome dele; o GrinderBank fica em segundo plano.
-- Idempotente.
--   · workspaces.marca_nome (até 40 letras) e workspaces.marca_logo (imagem pequena em data URL PNG/JPG/WebP: o app reduz
--     pra caber em 256 px antes de mandar; o servidor recusa acima de ~290 KB);
--   · definir_marca: o admin do time troca; o gestor geral também, em qualquer time (fica registrado);
--   · o convite mostra a marca do time antes do login (ver_convite) e a lista de times do gestor geral mostra o nome
--     (e passa a listar também os times antigos, do tipo 'team').
-- ============================================================

alter table public.workspaces add column if not exists marca_nome text;
alter table public.workspaces add column if not exists marca_logo text;
alter table public.workspaces drop constraint if exists workspaces_marca_nome_check;
alter table public.workspaces add constraint workspaces_marca_nome_check
  check (marca_nome is null or length(btrim(marca_nome)) between 1 and 40);
alter table public.workspaces drop constraint if exists workspaces_marca_logo_check;
alter table public.workspaces add constraint workspaces_marca_logo_check
  check (marca_logo is null or (length(marca_logo) <= 400000 and marca_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$'));

-- ---------- trocar a marca ----------
-- p_nome / p_logo: null = não mexe; '' = tira (volta ao nome do time / sem logo). p_ws: em branco = o time de quem chama.
create or replace function public.definir_marca(p_nome text default null, p_logo text default null, p_ws uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid := p_ws; raiz uuid; gg boolean; admin boolean;
begin
  gg := exists (select 1 from public.gestor_plataforma where user_id = auth.uid());
  if ws is null then
    select u.workspace_id into ws from public.unidade u
     where u.mae_id is null and u.id in (select public.unidades_com('administrar')) order by u.criado_em limit 1;
  end if;
  if ws is null or not exists (select 1 from public.workspaces w where w.id = ws and w.kind in ('time', 'pool', 'team')) then
    raise exception 'só o admin do time troca a marca' using errcode = 'insufficient_privilege'; end if;
  select u.id into raiz from public.unidade u where u.workspace_id = ws and u.mae_id is null order by u.criado_em limit 1;
  admin := raiz is not null and public.pode('administrar', raiz);
  if not (admin or gg) then raise exception 'só o admin do time troca a marca' using errcode = 'insufficient_privilege'; end if;
  if p_nome is not null and length(btrim(p_nome)) > 40 then raise exception 'o nome do time vai até 40 letras'; end if;
  if p_logo is not null and p_logo <> '' and (length(p_logo) > 400000 or p_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$') then
    raise exception 'a logo precisa ser uma imagem PNG, JPG ou WebP pequena (o app reduz sozinho)'; end if;
  update public.workspaces set
    marca_nome = case when p_nome is null then marca_nome else nullif(btrim(p_nome), '') end,
    marca_logo = case when p_logo is null then marca_logo else nullif(p_logo, '') end
   where id = ws;
  if gg and not admin then
    perform public.registrar_acao_plataforma('marca', ws, jsonb_build_object('nome', nullif(btrim(p_nome), ''),
      'logo', case when p_logo is null then 'igual' when p_logo = '' then 'tirou' else 'nova' end));
  end if;
end $$;
revoke all on function public.definir_marca(text, text, uuid) from public, anon;
grant execute on function public.definir_marca(text, text, uuid) to authenticated;

-- ---------- convite: a marca do time aparece antes do login ----------
create or replace function public.ver_convite(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record; caps text[]; joga text;
begin
  select cv.*, w.name as time_nome, w.marca_nome, w.marca_logo, u.nome as unidade_nome, u.arquivada, p.nome as pessoa_nome
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
    'time', c.time_nome, 'marca_nome', c.marca_nome, 'marca_logo', c.marca_logo,
    'unidade', c.unidade_nome, 'pessoa', c.pessoa_nome, 'expira_em', c.expira_em,
    'capacidades', coalesce(to_jsonb(caps), '[]'::jsonb), 'joga_em', joga);
end $$;

-- ---------- lista de times do gestor geral: com o nome da marca e se tem logo ----------
drop function if exists public.times_da_plataforma();
create function public.times_da_plataforma()
returns table(id uuid, nome text, tipo text, criado_em timestamptz, assentos int, pessoas int, jogadores int, convidados int,
              admins text, tem_dono boolean, admin_pendente boolean, ultimo_lancamento date, marca_nome text, tem_logo boolean)
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
         w.marca_nome, w.marca_logo is not null
    from public.workspaces w
   where w.kind in ('time', 'pool', 'team')      -- 'team' = os times antigos (antes da fase 1)
   order by w.created_at;
end $$;
revoke all on function public.times_da_plataforma() from public, anon;
grant execute on function public.times_da_plataforma() to authenticated;
