-- Entrada paga com BILHETE (ticket/T$ ganho num satélite): o torneio aconteceu e conta como
-- volume/nível jogado, mas nenhum dinheiro saiu da banca naquele momento — o custo real já foi
-- pago quando o satélite foi jogado. Sem isso, o buy-in é contado duas vezes.
alter table public.tournaments
  add column if not exists ticket boolean not null default false;

comment on column public.tournaments.ticket is
  'true = entrou com bilhete/T$: não sai dinheiro da banca (buy-in vale só como nível/ABI).';
