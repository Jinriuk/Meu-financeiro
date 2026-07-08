# Pool de Poker — Gabriel & Guedes

App de controle de uma **pool de poker (staking)** entre dois jogadores: banca central, make-up individual, split de lucro, controle de ABI/grade, saque semanal e dashboards semanal e mensal. Pensado para ser fácil de usar no celular e no computador, pelos dois ao mesmo tempo.

É um único arquivo estático (`index.html`) que salva os dados num projeto **Supabase** (login por e-mail e senha). Sem build, sem servidor.

> Este repositório passou a ser o app da **pool**. O antigo "Meu Financeiro" (finanças pessoais) foi mantido só como referência na pasta [`legado/`](./legado) — não é mais usado e não compartilha banco nem deploy com a pool. A pool usa um **projeto Supabase próprio**.

## Diferença importante de segurança

Diferente do app financeiro (onde cada usuário só vê os próprios dados), aqui a pool é **compartilhada**: os dois jogadores veem e editam os **mesmos** dados (mesma banca, mesmo make-up, mesmos lançamentos). Por isso o RLS é "qualquer autenticado vê tudo". Como só existem **2 usuários** (criados à mão no painel, com cadastro público desligado), isso é seguro e suficiente. Cada linha guarda `created_by` só para auditoria — nunca para restringir a visibilidade.

## Como funciona a regra da pool (resumo)

- **Diário** é a fonte da verdade: você digita o saldo inicial e o saldo final que vê no site; o resultado do dia é calculado (`saldo_final + saque − saldo_inicial − depósito`).
- A semana **fecha no domingo**. Para cada jogador, o resultado da semana abate o **make-up** acumulado; só o que sobra vira **lucro divisível**, dividido pelo `player_pct` (padrão 50/50) entre jogador e pool.
- Só há **saque autorizado** quando o make-up zera **e** a banca continua acima do **piso mínimo**.
- **ABI/grade**: um dia fica "FORA DA GRADE" se o maior buy-in passou do `abi_max`; "ATENÇÃO" se o ABI médio chegou perto do máximo.
- Todos os agregados (make-up, totais semanais/mensais, banca corrente) são **calculados no navegador** a partir dos lançamentos brutos — nada de tabela pré-computada.
- **Tempo real**: o lançamento de um jogador aparece na hora na tela do outro (Supabase Realtime, sem precisar recarregar).
- **Backup**: em Ajustes → Backup (CSV) dá pra baixar todos os dados brutos, prontos pro Excel/Planilhas.

## Telas

Painel · Diário · Torneios · Semanal · Mensal · Saques · Banca · Ajustes.

## Arquivos

- `index.html` — o app inteiro. Antes de subir, cole a URL e a chave anon do seu Supabase no bloco de configuração no topo do arquivo.
- `schema.sql` — estrutura do banco (tabelas + RLS compartilhado). Rode no SQL Editor do Supabase.
- `COMO-SUBIR.md` — passo a passo completo (~10 min): criar o banco, criar os **dois** logins, configurar e hospedar.

## Começar rápido

1. Crie um projeto no Supabase e rode o `schema.sql`.
2. Crie **os dois usuários** (Gabriel e Guedes) em Authentication → Users e desligue novos cadastros.
3. Cole a URL e a chave anon no topo do `index.html`.
4. Hospede o arquivo (Netlify Drop, Vercel ou Cloudflare Pages) e faça login.

Detalhes em [`COMO-SUBIR.md`](./COMO-SUBIR.md).

## Stack

HTML + React 18 (via CDN) + Babel Standalone (fixado na v7) + Supabase. Sem dependências instaladas, sem etapa de build.
