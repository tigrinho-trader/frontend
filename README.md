# frontend

Parte do projeto **Tigrinho Trader** (disciplina Projeto de Software).

## Finalidade

**Flecha Certeira**: jogo de arco e flecha no navegador, usado num **estudo sobre previsão de preços**: dá para
um grupo de pessoas prever a direção de curto prazo do preço de um ativo ("sabedoria das massas")? O arqueiro
paga a entrada de um campo de tiro com moedas do jogo, monta a aljava e tenta acertar pássaros em movimento. A
graça é **prever**: a flecha segue uma parábola e os pássaros não param, então é preciso mirar onde o pássaro
*vai* estar. Os pássaros de mercado (bitcoin, ethereum e ouro PAXG) voam conforme a cotação ao vivo da Binance,
e a flecha de mercado registra a previsão do jogador sobre a direção do preço.

É um site estático (canvas + módulos ES, sem framework) que fala com o `api-gateway` em `/api`. O jogador
entra com **login OpenID Connect** (por padrão um Keycloak local), e as moedas ficam na **carteira do servidor** (wallet-service): cada rodada é uma
sessão no trading-service, que é a fonte da verdade das moedas. Nada de moedas no `localStorage`.

## Como funciona

- O saldo é o da carteira (`GET /api/carteira`; quem entra pela primeira vez recebe o bônus de boas-vindas da
  carteira). Para atirar, escolhe um **campo**, paga a **entrada** e monta a **aljava**. Quando as flechas
  acabam, dá para comprar mais ou encerrar. O resultado mostra quanto o saldo mudou na rodada (a entrada e o
  retorno das flechas de mercado).
- **Mira:** arrastar para trás e soltar, como um estilingue. A linha pontilhada é a trajetória exata; cada
  ponto amarelo vale 0,5 s de voo.
- **Pássaros comuns** são só treino de mira: acertá-los vale 0 moedas.
- **Flechas de mercado:** cada uma vale uma previsão da direção do preço do ativo (sobe ou desce) e só acerta o
  pássaro daquele ativo. Quando a operação do estudo é liquidada, o servidor devolve **100 + 10 × o resultado
  líquido da operação em R$**, ou exatamente **100** se a operação não aconteceu.
- Flechas que sobram ficam **guardadas** (tela Saldo) para as próximas rodadas: as de mercado servem em qualquer
  campo; as comuns, só no campo onde foram compradas.

| Campo | Entrada | Pássaros de mercado | Cenário |
|---|---|---|---|
| Campo do Vilarejo | 5 | bitcoin | dia de sol, vila e moinho |
| Bosque dos Arqueiros | 15 | bitcoin e ethereum | fim de tarde, floresta, folhas caindo |
| Pico das Águias | 40 | bitcoin, ethereum e ouro | montanhas nevadas, nevasca |
| Reserva Real | 100 | bitcoin, ethereum e ouro | pôr do sol, castelo, tochas |

| Flecha | Preço | Para que serve |
|---|---|---|
| Madeira | grátis | treinar a mira nos pássaros comuns |
| Bitcoin | 100 | previsão da direção do bitcoin |
| Ethereum | 100 | previsão da direção do ethereum |
| Ouro PAXG | 100 | previsão da direção do ouro (PAXG) |

As flechas de ferro, ouro e diamante foram removidas.

Atalhos: **1–9** trocam entre as flechas do campo, **B** mostra ou esconde os pássaros comuns, **P/Esc** pausa e
**M** liga ou desliga o som.

## Moedas no servidor

Cada rodada é uma **sessão** do Flecha Certeira no trading-service (`/api/jogos/flecha/sessoes`):

| Momento | Chamada | O que acontece |
|---|---|---|
| "Pagar e entrar" | `POST /sessoes` `{ campo, flechas }` | o servidor confere o saldo disponível e guarda o custo (entrada + flechas). Erros como **422** (saldo insuficiente) ou **409** (já existe rodada aberta) aparecem na loja, com o botão "Encerrar a rodada aberta" no caso do 409. |
| Cada flecha termina (crava no chão ou sai da tela) | `POST /sessoes/{id}/tiros` `{ flecha, acertos }` | `acertos` = tipos dos pássaros atingidos por essa flecha, na ordem. Os tiros vão um por vez, na ordem, com pelo menos **160 ms** entre eles (`src/sessao.js`). |
| Comprar mais flechas | `POST /sessoes/{id}/flechas` | só com o saldo da carteira menos o custo da rodada: as moedas que a rodada rende entram na carteira quando ela termina. |
| Fim da rodada / "Sair do campo" | `POST /sessoes/{id}/encerrar` | a tela de resultado usa a resposta do servidor. A carteira é atualizada pelo RabbitMQ (assíncrono), então o saldo é lido de novo ~1,5 s depois. |

Cada flecha de mercado usada registra uma operação do estudo (`POST /api/jogos/flecha/estudo/operacoes`; o
servidor já desconta a flecha da sessão), que o jogo acompanha em `GET /api/jogos/flecha/estudo/operacoes/{id}`
até ser liquidada (`src/sessao.js`).

Durante a rodada o HUD mostra `saldo antes − custo + ganhos`. Os ganhos de cada tiro são calculados no navegador
na hora (para o jogo não esperar a rede), mas **o servidor manda**: cada resposta substitui ganhos e flechas
pelos valores dele. Se uma chamada falha no meio da rodada, aparece um aviso no topo da tela e o jogo segue com
os números confirmados. Se a página fechar no meio de uma rodada, no próximo login a sessão aberta é encerrada e
o menu avisa o resultado (o servidor também encerra sozinho sessões paradas há 10 min).

Limitação conhecida: o navegador informa quais pássaros acertou; o servidor só valida se é plausível (flechas
disponíveis, pássaros do campo, combo até 5, ritmo dos tiros).

## Login (OpenID Connect)

O login é **OpenID Connect genérico** (Authorization Code + PKCE) com a biblioteca `oidc-client-ts`
(`src/auth.js`; ela fica num arquivo separado do build e só é baixada quando o login começa). O usuário fica
guardado no `localStorage` e o access token é renovado sozinho antes de vencer (`automaticSilentRenew`, com o
refresh token). Cada chamada à API leva `Authorization: Bearer <access token>`; o api-gateway valida o JWT e
repassa a identidade aos serviços.

### Padrão: Keycloak local

Sem nenhuma variável, o jogo usa o **Keycloak do docker-compose** (repo api-gateway, reino em
`infra/keycloak/tigrinho-realm.json`) — não é preciso criar conta em serviço externo:

| Item | Valor |
|---|---|
| Servidor | http://localhost:8180 (console de administração: `admin` / `admin`, só em desenvolvimento) |
| Reino | `tigrinho` (emissor `http://localhost:8180/realms/tigrinho`) |
| Cliente | `flecha-certeira` (público, PKCE, sem segredo) |
| Usuário de desenvolvimento | `admin` (ou `admin@tigrinho.local`) / senha `admin123` — **só para ambiente local** |

"Entrar" abre a tela de login do Keycloak (em português) e "Criar conta" abre direto a página de **cadastro**
do Keycloak (`prompt=create`); depois do cadastro o jogador volta logado. Se o Keycloak não estiver no ar, o
menu avisa: "Não foi possível falar com o servidor de login (http://localhost:8180). Ele está no ar? Suba com
docker compose."

### Variáveis (build do Vite, todas opcionais)

Para trocar o provedor, copie `.env.example` para `.env` (fica fora do git) e descomente o que precisar:

| Variável | Padrão | Para que serve |
|---|---|---|
| `VITE_OIDC_AUTHORITY` | `http://localhost:8180/realms/tigrinho` | emissor (issuer) do provedor |
| `VITE_OIDC_CLIENT_ID` | `flecha-certeira` | cliente público do jogo |
| `VITE_OIDC_AUDIENCE` | vazio | audiência pedida no login (o Keycloak não precisa; o Auth0 precisa) |
| `VITE_OIDC_PROVEDOR` | `keycloak` | `auth0` faz o "Criar conta" usar `screen_hint=signup` |

Se `VITE_OIDC_AUTHORITY` ou `VITE_OIDC_CLIENT_ID` forem definidos **vazios**, o menu mostra "Login não
configurado — defina VITE_OIDC_AUTHORITY e VITE_OIDC_CLIENT_ID" e o jogo não chama a API. No Docker elas entram
como `--build-arg` (são gravadas no build). O provedor precisa aceitar `http://localhost:5173/` e
`http://localhost:3000/` como URL de retorno, de logout e origem web (o reino do Keycloak já vem assim).

### Alternativa: Auth0

```bash
VITE_OIDC_AUTHORITY=https://<tenant>.us.auth0.com
VITE_OIDC_CLIENT_ID=<client id da aplicação Single Page Application>
VITE_OIDC_AUDIENCE=https://api.tigrinho-trader
VITE_OIDC_PROVEDOR=auth0
```

No Auth0, a aplicação SPA precisa das mesmas URLs de retorno, logout e origem, e a API
(`https://api.tigrinho-trader`) precisa de **Allow Offline Access** (com o provedor `auth0` o jogo pede
`offline_access` para receber refresh token). No api-gateway use `AUTH_ISSUER=https://<tenant>.us.auth0.com/` e
`AUTH_AUDIENCE=https://api.tigrinho-trader`.

## Telas da conta

- **Menu**: sem login, "Entrar" e "Criar conta". Logado: foto e apelido, **Saldo** (moedas, flechas guardadas e
  últimas movimentações), **Comprar** moedas, **Sacar** (desativado, "em breve"), **Jogar**, "Meu perfil",
  "Administração" (só para `ADMIN`) e "Sair".
- **Comprar moedas**: com o Pix ligado na carteira (`ABACATEPAY_API_KEY`), o jogador escolhe um pacote sugerido
  ou digita a quantidade (R$ 1 = 10 moedas), recebe o QR Code e o copia e cola, e o jogo confere o pagamento a
  cada 3 s (ou no botão "Já paguei"): quem confirma é o servidor, perguntando ao AbacatePay. Com chave de teste
  (`abc_dev_`) aparece "Simular pagamento". Sem Pix configurado, cai no pagamento de teste (sandbox), que credita
  na hora. Também aparece na escolha de campo, quando a loja de flechas responde "saldo insuficiente" e no
  resultado quando o jogador fica sem moedas.
- **Meu perfil**: foto, nome, email, papel, membro desde, apelido editável (3 a 20 letras, números ou `_`; se já
  estiver em uso, o servidor responde 409 e a tela avisa), as últimas 10 movimentações da carteira e
  "Excluir minha conta" (confirmação digitando `EXCLUIR`; a conta é anonimizada e o jogador sai).
- **Administração**: busca, filtros de status e papel, tabela paginada (apelido/nome, email, papel, status,
  último acesso) e as ações Bloquear (com motivo), Desbloquear, Tornar admin e Tornar jogador. Não dá para
  alterar a própria conta. Erros da API aparecem na própria tela.
- **Conta bloqueada**: qualquer resposta 403 de conta bloqueada/excluída leva a uma tela explicando o bloqueio,
  com "Sair". Um 401 (sessão expirada) volta para o login.

Nenhuma tela usa `alert`, `confirm` ou `prompt`.

## Rodando

```bash
npm install
cp .env.example .env        # opcional: só para trocar o provedor de login
npm run dev                 # http://localhost:5173 (repassa /api para o gateway em localhost:8080)
GATEWAY_URL=http://localhost:8090 npm run dev   # se o gateway estiver em outra porta
npm test                    # vitest
npm test -- --coverage      # com cobertura
npm run build               # gera dist/
```

O jogo precisa do api-gateway, dos serviços e do Keycloak (http://localhost:8180) rodando para entrar e
jogar; todos sobem com o docker compose do api-gateway.

Docker: o nginx serve o build e repassa `/api/` para `GATEWAY_URL` (padrão `http://api-gateway:8080`):

```bash
docker build -t frontend .   # login no Keycloak local (padrão)
# outro provedor: --build-arg VITE_OIDC_AUTHORITY=... --build-arg VITE_OIDC_CLIENT_ID=... (e AUDIENCE/PROVEDOR)
docker run -p 3000:80 -e GATEWAY_URL=http://api-gateway:8080 frontend
```

## Estrutura

- `src/regras.js`: dados e regras puras (pássaros, campos com o `slug` da API, flechas, loja, física), testados em `src/regras.test.js`
- `src/jogo.js`: o jogo (canvas, HUD, telas, controles e som sintetizado com WebAudio) ligado às sessões do servidor
- `src/auth.js`: login OIDC com `oidc-client-ts` (`configurado`, `iniciar`, `entrar`, `sair`, `token`, `usuarioOidc`)
- `src/api.js`: cliente do `/api` (token Bearer, erros `ProblemDetail` → `ErroApi`, 401 → login, 403 → conta bloqueada)
- `src/sessao.js`: fila dos tiros (ordem e intervalo mínimo) e reconciliação do HUD com o servidor
- `src/conta.js`: menu de login, "Meu perfil", "Comprar moedas", "Administração" e conta bloqueada
- `src/creditos.js`: pacotes de moedas e mensagens da compra
- `src/telas.js`: formatação, validação do apelido e HTML das tabelas (puro, testado)
- `src/*.test.js`: testes (vitest); `src/conta.test.js` carrega o `index.html` no jsdom com login e API falsos
- `src/cenarios.js`: os 4 cenários (camadas pré-desenhadas, clima e animações)
- `src/estilos.css`: telas de menu, loja, recarga, resultado, perfil e administração
- `index.html`: estrutura das telas

Para equilibrar o jogo, ajuste `RANGES` (campos) e `ARROW_TYPES` (flechas) em `src/regras.js` **e** as mesmas regras
no trading-service (o servidor é quem credita as moedas).

## Repositorios do projeto

- [trading-service](https://github.com/tigrinho-trader/trading-service)
- [wallet-service](https://github.com/tigrinho-trader/wallet-service)
- [market-data-service](https://github.com/tigrinho-trader/market-data-service)
- [notification-service](https://github.com/tigrinho-trader/notification-service)
- [api-gateway](https://github.com/tigrinho-trader/api-gateway)
- user-service (usuários, perfil e administração)
- [docs-arquitetura](https://github.com/tigrinho-trader/docs-arquitetura)
