# Como subir o app da pool — passo a passo (~10 min)

Você vai mexer em 2 lugares: **Supabase** (banco de dados, grátis) e um **host estático** (Netlify ou Vercel, grátis). Não tem build, não tem servidor rodando, não tem custo.

> Este é um projeto **separado** do "Meu Financeiro". Crie um projeto Supabase **novo** só pra pool — não reaproveite o do app financeiro pessoal.

---

## 1. Criar o banco no Supabase

1. Entre em `supabase.com` → **New project**. Escolha um nome (ex: `pool-poker`), defina uma senha de banco e guarde. Região: `sa-east-1 (São Paulo)`.
2. Espere o projeto ficar pronto (1 a 2 min).
3. Menu lateral → **SQL Editor** → **New query**. Cole TODO o conteúdo de `schema.sql` e clique em **Run**. Deve aparecer "Success".

## 2. Criar os dois logins (Gabriel e Guedes)

1. Menu lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Crie o usuário do **Gabriel** (e-mail + senha) e **marque "Auto Confirm User"** (assim ele não precisa confirmar e-mail).
3. Repita o passo e crie o usuário do **Guedes** do mesmo jeito.
4. Para ninguém mais conseguir criar conta: **Authentication → Sign In / Providers → Email** e **desligue "Allow new users to sign up"** (ou em Authentication → Settings, "Allow signups"). Isso tranca o app só pros dois.

> Importante: a pool é **compartilhada**. Os dois usuários veem e editam exatamente os mesmos dados. É por isso que só os dois podem existir nesse projeto — o `schema.sql` libera tudo para qualquer usuário autenticado.

## 3. Pegar as 2 chaves e colar no app

1. Menu lateral → **Project Settings** → **Data API**.
2. Copie o **Project URL** e a chave **anon public**.
3. Abra o arquivo `index.html` num editor de texto. Lá em cima tem:
   ```
   window.SUPABASE_URL = "COLE_AQUI_A_URL_DO_PROJETO";
   window.SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_ANON_PUBLIC";
   ```
   Troque pelos seus valores e salve. (A chave anon é pública de propósito; a segurança real está no RLS que o `schema.sql` já ativou e no fato de só existirem 2 usuários.)

## 4. Subir o site

Caminho mais fácil (**Netlify Drop**): vá em `app.netlify.com/drop` e **arraste a pasta** que contém o `index.html`. Pronto, gera um link na hora.

Se preferir **Vercel**: `vercel.com/new` → importe ou faça upload da pasta → Deploy. Funciona igual (é só um arquivo estático).

Quer um subdomínio bonitinho? Tanto Netlify quanto Vercel deixam trocar grátis (ex: `pool-gabriel-guedes.netlify.app`).

## 5. Primeiro uso

1. Abram o link no **celular** e no **computador** e façam login (cada um com o seu e-mail + senha do passo 2). A sessão fica salva.
2. No celular, "Adicionar à tela de início" no navegador — vira quase um app.
3. Antes de começar a lançar, vá em **Ajustes** e confira os parâmetros da pool: nomes dos jogadores, `player_pct` (split), `abi_max`, piso mínimo, make-up recomendado, **make-up inicial de cada jogador**, banca inicial, sites e modalidades permitidas.
4. Se já tiverem uma banca de partida, registrem os aportes na aba **Banca** (ou ajustem a "Banca inicial" em Ajustes). Depois é só ir lançando o **Diário** todo dia.

---

## Coisas que você precisa saber (não esquece)

- **Supabase free pausa o projeto após ~7 dias sem ninguém abrir.** Se um dos dois usar pelo menos uma vez por semana, fica de pé. Se pausar, entre no painel do Supabase e clique em "Restore" (1 clique).
- **O Diário é o oficial.** A aba Torneios é complementar (detalhe torneio a torneio); o controle que fecha make-up e saque é o lançamento diário.
- **Backup:** de vez em quando, no Supabase → Table Editor → exporte as tabelas em CSV. É o histórico da pool, vale guardar.
- **Trocar senha de alguém:** Authentication → Users → nos três pontinhos do usuário.
- **Semana fecha no domingo.** O make-up de uma semana entra como make-up inicial da seguinte, automaticamente — não precisa fechar nada à mão.
