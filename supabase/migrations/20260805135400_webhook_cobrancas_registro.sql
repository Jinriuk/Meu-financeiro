-- Registro de toda cobrança aprovada que o webhook processa.
-- Dois usos, os dois necessários:
--   1. plano_liberado IS NULL = alguém PAGOU e NÃO recebeu acesso. Antes isso sumia num 202
--      e o cliente ficava travado em silêncio. Agora tem onde olhar.
--   2. plano_id guarda o Subscription.plan.id real de cada venda — é assim que a gente aprende
--      os ids verdadeiros do Gestão e do Pro sem precisar de compra de teste.
create table if not exists public.webhook_cobrancas(
  provider text not null,
  order_id text not null,
  status text not null default '',
  email text,
  plano_id text,
  produto_id text,
  valor_centavos text,
  plano_liberado text,          -- null = não liberou; precisa de ação manual
  chave_usada text,             -- qual chave do mapa resolveu (plano, produto ou valor:NNNN)
  created_at timestamptz not null default now(),
  primary key(provider, order_id, status)
);
alter table public.webhook_cobrancas enable row level security;  -- sem policy: só service role
comment on table public.webhook_cobrancas is
  'Toda cobrança aprovada vista pelo webhook. plano_liberado null = pagou e não liberou.';
