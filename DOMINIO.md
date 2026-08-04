# Domínio e redirect — o que está ligado e por quê

> Este arquivo existe porque `vercel.json` **não aceita comentários nem chaves extras**. O schema
> do Vercel é estrito: qualquer propriedade desconhecida (mesmo `_comment`) derruba o deploy com
> `should NOT have additional property`. Então a explicação mora aqui.

## Estado atual (02/08/2026)

`"redirects": []` — **vazio de propósito.**

O redirect que existia mandava `meu-financeiro-*.vercel.app` → `https://grinderbank.com/:path*`.
Ele foi desligado quando o `grinderbank.com` foi suspenso pela verificação de e-mail do
registrante (regra da ICANN para `.com`, prazo de 15 dias). Com o redirect ligado e o domínio
fora, **a URL da Vercel também morria** — ela empurrava todo mundo para o domínio suspenso e não
sobrava nenhum endereço no ar.

## Para religar quando o domínio estiver estável

```json
"redirects": [
  {
    "source": "/:path*",
    "has": [{ "type": "host", "value": "meu-financeiro.*\\.vercel\\.app" }],
    "destination": "https://grinderbank.com/:path*",
    "permanent": false
  }
]
```

**`permanent: false` (302), não `true`.** Estava como `true` (301) e 301 o navegador cacheia: quem
já tinha acessado a URL da Vercel continuaria sendo mandado para o domínio morto mesmo depois de
a regra sair do arquivo. Só volte para 301 quando o domínio estiver comprovadamente estável.

## Checklist do domínio (o que precisa estar verdadeiro para o site abrir)

1. **Registro sem suspensão** — em `lookup.icann.org`, o campo "Domain Status" **não** pode ter
   `clientHold`. Se tiver, o site não abre por mais certo que esteja o resto.
2. **E-mail do titular verificado** — exigência da ICANN para `.com`; `.com.br` (Registro.br) não
   tem isso, por isso os outros domínios nunca pediram.
3. **DNS apontando para a Vercel** — o domínio precisa resolver para a Vercel, não para a
   hospedagem do registrador. Ou os nameservers da Vercel, ou os registros A/CNAME que o painel
   da Vercel informa em *Settings → Domains*.
4. **Domínio adicionado ao projeto na Vercel** — sem isso, a Vercel devolve 404 mesmo com o DNS
   certo, porque não sabe qual projeto serve aquele host.

Os quatro precisam estar OK ao mesmo tempo. Errar qualquer um dá "não é possível acessar", e o
sintoma é parecido nos quatro casos — por isso vale conferir na ordem.
