# Como subir o app — passo a passo (~10 min)

Você vai mexer em 2 lugares: **Supabase** (banco de dados, grátis) e um **host estático** (Netlify ou Vercel, grátis). Não tem build, não tem servidor rodando, não tem custo.

---

## 1. Criar o banco no Supabase

1. Entre em `supabase.com` → **New project**. Escolha um nome (ex: `financas-tia`), defina uma senha de banco e guarde. Região: `sa-east-1 (São Paulo)`.
2. Espere o projeto ficar pronto (1 a 2 min).
3. Menu lateral → **SQL Editor** → **New query**. Cole TODO o conteúdo de `schema.sql` e clique em **Run**. Deve aparecer "Success".

## 2. Criar o login da sua tia

1. Menu lateral → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Coloque o e-mail dela e uma senha. **Marque "Auto Confirm User"** (assim ela não precisa confirmar e-mail).
3. Para ninguém mais conseguir criar conta: **Authentication → Sign In / Providers → Email** e **desligue "Allow new users to sign up"** (ou em Authentication → Settings, "Allow signups"). Isso tranca o app só pra ela.

## 3. Pegar as 2 chaves e colar no app

1. Menu lateral → **Project Settings** → **Data API**.
2. Copie o **Project URL** e a chave **anon public**.
3. Abra o arquivo `index.html` num editor de texto. Lá em cima tem:
   ```
   window.SUPABASE_URL = "COLE_AQUI_A_URL_DO_PROJETO";
   window.SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_ANON_PUBLIC";
   ```
   Troque pelos seus valores e salve. (A chave anon é pública de propósito; a segurança real está no RLS que o `schema.sql` já ativou.)

## 4. Subir o site

Caminho mais fácil (**Netlify Drop**): vá em `app.netlify.com/drop` e **arraste a pasta** que contém o `index.html`. Pronto, gera um link na hora.

Se preferir **Vercel**: `vercel.com/new` → importe ou faça upload da pasta → Deploy. Funciona igual (é só um arquivo estático).

Quer um domínio bonitinho? Tanto Netlify quanto Vercel deixam trocar o subdomínio grátis (ex: `financas-da-tia.netlify.app`).

## 5. Deixar pronto pra ela

1. Abra o link no **celular** e no **computador** dela e faça login (e-mail + senha do passo 2). A sessão fica salva, ela não vê login de novo.
2. No celular, mande ela "Adicionar à tela de início" no navegador. Vira quase um app.
3. Primeiro uso: no **Painel**, toque no nome de cada banco pra colocar o saldo atual dela. Ajuste o **limite do cartão** na aba Cartão. Depois é só ir lançando.

---

## Coisas que você precisa saber (não esquece)

- **Supabase free pausa o projeto após ~7 dias sem ninguém abrir.** Se ela usar pelo menos uma vez por semana, fica de pé. Se pausar, você entra no painel do Supabase e clica em "Restore" (1 clique). Se quiser, dá pra automatizar isso depois.
- **Backup:** de vez em quando, no Supabase → Table Editor → exporta as tabelas em CSV. É o histórico financeiro dela, vale guardar.
- **Trocar senha dela:** Authentication → Users → nos três pontinhos do usuário.

## Se quiser que EU faça o backend pra você na próxima

Dá pra eu criar o projeto Supabase, rodar o schema e já te devolver o `index.html` configurado, em vez de você fazer os passos 1 a 3. Pra isso você precisa **aprovar a conexão do Supabase** quando o app pedir (apareceu "No approval received" da última vez). Aí é só me falar.
