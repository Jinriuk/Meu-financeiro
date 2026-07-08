# Meu Financeiro (legado)

> ⚠️ **Arquivado / não usado.** Este é o app antigo de finanças pessoais, mantido aqui só como referência de estilo e arquitetura. O app ativo deste repositório agora é a **Pool de Poker** (veja o `README.md` da raiz). Este `index.html` ainda contém a URL/chave do Supabase de produção do deploy antigo — não use como base sem trocar as credenciais.

App de controle financeiro pessoal, simples e visual: saldo das contas, entradas e saídas, cartão de crédito com limite, investimentos e gráficos do mês. Pensado para ser fácil de usar no celular e no computador.

É um único arquivo estático (`index.html`) que salva os dados num projeto **Supabase** (login por e-mail e senha, com RLS por usuário). Sem build, sem servidor.

## Arquivos

- `index.html` — o app inteiro. Antes de subir, cole a URL e a chave anon do seu Supabase no bloco de configuração no topo do arquivo.
- `schema.sql` — estrutura do banco (tabelas + segurança). Rode no SQL Editor do Supabase.
- `COMO-SUBIR.md` — passo a passo completo (~10 min): criar o banco, criar o login, configurar e hospedar.

## Começar rápido

1. Crie um projeto no Supabase e rode o `schema.sql`.
2. Crie o usuário (Authentication → Users) e desligue novos cadastros.
3. Cole a URL e a chave anon no topo do `index.html`.
4. Hospede o arquivo (Netlify Drop, Vercel ou Cloudflare Pages) e faça login.

Detalhes em [`COMO-SUBIR.md`](./COMO-SUBIR.md).

## Stack

HTML + React (via CDN) + Supabase. Sem dependências instaladas, sem etapa de build.
