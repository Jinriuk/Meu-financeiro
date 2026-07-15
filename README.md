# Pool de Poker — Gabriel & Guedes

App de controle de uma **pool de poker (staking)** entre dois jogadores: banca central, make-up individual, split de lucro, controle de ABI/grade, saque semanal e dashboards semanal e mensal. Pensado para ser fácil de usar no celular e no computador, pelos dois ao mesmo tempo.

É um único arquivo estático (`index.html`) que salva os dados num projeto **Supabase** (login por e-mail e senha). Sem build, sem servidor.

> Este repositório passou a ser o app da **pool**. O antigo "Meu Financeiro" (finanças pessoais) foi mantido só como referência na pasta [`legado/`](./legado) — não é mais usado e não compartilha banco nem deploy com a pool. A pool usa um **projeto Supabase próprio**.

## Diferença importante de segurança

Diferente do app financeiro (onde cada usuário só vê os próprios dados), aqui a pool é **compartilhada**: os dois jogadores veem e editam os **mesmos** dados (mesma banca, mesmo make-up, mesmos lançamentos). Por isso o RLS é "qualquer autenticado vê tudo". Como só existem **2 usuários** (criados à mão no painel, com cadastro público desligado), isso é seguro e suficiente. Cada linha guarda `created_by` só para auditoria — nunca para restringir a visibilidade.

## Como funciona a regra da pool (resumo)

- **Torneio é a fonte da verdade**: você lança cada torneio (com o jogador, buy-in, re-entries e premiação) e o app monta sozinho o resultado de cada jogador por dia — `resultado = Σ (prêmio − buy-in×(1+re-entries))`. O **Diário** é um resumo automático por jogador/dia (dá pra abrir e corrigir editando os torneios).
- Na aba **Torneios**, em cima fica **"Hoje"** (lançamento do dia + placar por jogador) e embaixo os **dias anteriores** como relatórios recolhidos — nada é apagado, só sai da lista de trabalho quando o dia vira.
- A semana **fecha no domingo**. Para cada jogador, o resultado da semana abate o **make-up** acumulado; só o que sobra vira **lucro divisível**, dividido pelo `player_pct` (padrão 50/50) entre jogador e pool.
- Só há **saque autorizado** quando o make-up zera **e** a banca continua acima do **piso mínimo**.
- **ABI/grade por jogador**: cada jogador tem seu próprio limite de ABI (em Ajustes). Um torneio fica "FORA DA GRADE" se o buy-in passou do máximo **daquele jogador**; "ATENÇÃO" se o ABI médio do dia chegou perto do limite. O alerta de fora-da-grade no Painel é clicável e mostra quais torneios e de quem. Ao lançar um torneio fora da grade aparece um aviso pro próprio jogador, e o **outro jogador** recebe um aviso em tempo real ("fulano jogou fora da grade").
- **Banca por jogador e plataforma** (aba Banca): cada um registra o saldo inicial por plataforma (PokerStars, GG Poker, Reserva, Outros) e o outro vê. O saldo se atualiza sozinho com torneios (pelo site), movimentos atribuídos ao jogador e saques daquela carteira. A banca central da pool segue sendo a fonte de verdade pro make-up/saque.
- **Semanal**: um card **"geral da pool"** soma os dois jogadores semana a semana, além da visão por jogador. Quando o mês vira, as semanas dos meses anteriores viram **histórico recolhível**. O status de saque (autorizado/bloqueado) não aparece mais aqui — só na aba **Saques**, na hora de sacar.
- **Diário com filtros**: dá pra filtrar por **jogador, plataforma ou modalidade** e escolher um **período** (últimos 7/15/30 dias ou um intervalo de datas), com um **cálculo agregado** do período (resultado, ROI, ABI médio, ITM, torneios).
- Todos os agregados (make-up, totais semanais/mensais, banca corrente) são **calculados no navegador** a partir dos lançamentos brutos — nada de tabela pré-computada.
- **Gráficos**: no Painel, curva de **lucro acumulado por jogador** (interativa) e evolução da banca com eixos e valor ao passar o dedo; barras com valor ao tocar. No Mensal, **desempenho por site e por modalidade** (resultado e ROI), com filtro **Geral / por jogador**.
- **Tempo real**: o lançamento de um jogador aparece na hora na tela do outro (Supabase Realtime, sem precisar recarregar).
- **Backup**: em Ajustes → Backup (CSV) dá pra baixar todos os dados brutos, prontos pro Excel/Planilhas.
- **Login flexível**: entra com **e-mail, nickname ou CPF**. No primeiro acesso o app força a troca da senha padrão e completa o cadastro (nickname/CPF) — tabela `player_profiles` + função `email_for_login`.

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
