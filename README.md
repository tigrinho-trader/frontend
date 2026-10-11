# frontend

Parte do projeto **Tigrinho Trader** (disciplina Projeto de Software).

## Finalidade

**Flecha Certeira**: jogo de arco e flecha no navegador, com moedas fictícias. O arqueiro paga a entrada de um
campo de tiro, compra flechas e tenta acertar pássaros em movimento. A graça é **prever** o caminho: a flecha
segue uma parábola e os pássaros não param, então é preciso mirar onde o pássaro *vai* estar.

É um site estático (canvas + módulos ES, sem framework) que fala com o `api-gateway` em `/api`. O jogador
entra com **login do Auth0**, e as moedas ficam na **carteira do servidor** (wallet-service): cada rodada é uma
sessão no trading-service, que é a fonte da verdade do dinheiro. Nada de moedas no `localStorage`.

## Como funciona

- O saldo é o da carteira (`GET /api/carteira`; quem entra pela primeira vez ganha o bônus de boas-vindas da
  carteira). Para atirar, escolhe um **campo**, paga a **entrada** e monta a **aljava**. Quando as flechas
  acabam, dá para comprar mais ou encerrar. O resultado mostra lucro ou prejuízo.
- **Mira:** arrastar para trás e soltar, como um estilingue. A linha pontilhada é a trajetória exata; cada
  ponto amarelo vale 0,5 s de voo.
- **Combo:** uma flecha que atravessa vários pássaros multiplica as moedas.

| Campo | Entrada | Flecha (base) | Pássaros valem | Cenário |
|---|---|---|---|---|
| Campo do Vilarejo | 5 | 1 | ×2 | dia de sol, vila e moinho |
| Bosque dos Arqueiros | 15 | 3 | ×4 | fim de tarde, floresta, folhas caindo |
| Pico das Águias | 40 | 8 | ×10 | montanhas nevadas, nevasca |
| Reserva Real | 100 | 20 | ×25 | pôr do sol, castelo, tochas |

| Flecha | Preço | Moedas | Tecla |
|---|---|---|---|
| Madeira | ×1 | ×1 | 1 |
| Ferro | ×2 | ×2,5 | 2 |
| Ouro | ×4 | ×5,5 | 3 |
| Diamante | ×8 | ×12 | 4 |

Flechas melhores rendem um pouco mais por moeda gasta, mas cada erro custa mais caro.

Atalhos: **1–4** trocam de flecha, **P/Esc** pausa e **M** liga ou desliga o som.

## Moedas no servidor

Cada rodada é uma **sessão** do Flecha Certeira no trading-service (`/api/jogos/flecha/sessoes`):

| Momento | Chamada | O que acontece |
|---|---|---|
| "Pagar e entrar" | `POST /sessoes` `{ campo, flechas }` | o servidor confere o saldo disponível e guarda o custo (entrada + flechas). Erros como **422** (saldo insuficiente) ou **409** (já existe rodada aberta) aparecem na loja, com o botão "Encerrar a rodada aberta" no caso do 409. |
| Cada flecha termina (crava no chão ou sai da tela) | `POST /sessoes/{id}/tiros` `{ flecha, acertos }` | `acertos` = tipos dos pássaros atingidos por essa flecha, na ordem. Os tiros vão um por vez, na ordem, com pelo menos **160 ms** entre eles (`src/sessao.js`). |
| Comprar mais flechas | `POST /sessoes/{id}/flechas` | só com o saldo da carteira menos o custo da rodada: as moedas ganhas entram na carteira quando a rodada termina. |
| Fim da rodada / "Sair do campo" | `POST /sessoes/{id}/encerrar` | a tela de resultado usa a resposta do servidor. A carteira é atualizada pelo RabbitMQ (assíncrono), então o saldo é lido de novo ~1,5 s depois. |

Durante a rodada o HUD mostra `saldo antes − custo + ganhos`. Os ganhos de cada tiro são calculados no navegador
na hora (para o jogo não esperar a rede), mas **o servidor manda**: cada resposta substitui ganhos e flechas
pelos valores dele. Se uma chamada falha no meio da rodada, aparece um aviso no topo da tela e o jogo segue com
os números confirmados. Se a página fechar no meio de uma rodada, no próximo login a sessão aberta é encerrada e
o menu avisa o resultado (o servidor também encerra sozinho sessões paradas há 10 min).

Limitação conhecida: o navegador informa quais pássaros acertou; o servidor só valida se é plausível (flechas
disponíveis, pássaros do campo, combo até 5, ritmo dos tiros).

## Login (Auth0)

O login usa o Universal Login do Auth0 com o SDK `@auth0/auth0-spa-js` (`src/auth.js`), com o token guardado no
`localStorage` e **refresh token** (`cacheLocation: 'localstorage'`, `useRefreshTokens: true`). Cada chamada à API
leva `Authorization: Bearer <access token>`; o api-gateway valida o JWT e repassa a identidade aos serviços.

### Variáveis (build do Vite)

Copie `.env.example` para `.env` (fica fora do git) e preencha:

| Variável | Valor |
|---|---|
| `VITE_AUTH0_DOMAIN` | domínio do tenant, ex.: `tigrinho-trader.us.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | Client ID da aplicação SPA |
| `VITE_AUTH0_AUDIENCE` | Identifier da API, ex.: `https://api.tigrinho-trader` (o mesmo `AUTH0_AUDIENCE` do api-gateway) |

Sem as três, o menu mostra "Login não configurado — defina VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID e
VITE_AUTH0_AUDIENCE" e o jogo não chama a API. No Docker elas entram como `--build-arg` (são gravadas no build).

### Configuração no painel do Auth0

1. **Applications > Applications > Create Application**, tipo **Single Page Application**. Em *Settings*:
   - **Allowed Callback URLs**: `http://localhost:5173, http://localhost:3000`
   - **Allowed Logout URLs**: `http://localhost:5173, http://localhost:3000`
   - **Allowed Web Origins**: `http://localhost:5173, http://localhost:3000`
   - (acrescente a URL de produção em todas, quando houver)
2. Na mesma aplicação, em **Refresh Token Rotation**, ligue **Rotation** (o SDK usa refresh token no lugar de
   cookies de terceiros, que os navegadores bloqueiam).
3. **Applications > APIs > Create API** com o Identifier `https://api.tigrinho-trader` (RS256). Em *Settings*,
   ligue **Allow Offline Access** (necessário para o refresh token).
4. Email, nome e foto entram no access token por uma Action pós-login com o namespace
   `https://tigrinho-trader/` (veja `docs-arquitetura/AUTH0.md`).

"Criar conta" abre o Universal Login direto na tela de cadastro (`screen_hint: 'signup'`).

## Telas da conta

- **Menu**: sem login, "Entrar" e "Criar conta". Logado: foto e apelido, saldo, "Jogar", "Comprar moedas",
  "Meu perfil", "Administração" (só para `ADMIN`) e "Sair".
- **Comprar moedas**: pacotes de 100, 500, 1.000 e 5.000 moedas. Hoje usa o pagamento de teste (sandbox) da
  carteira (`POST /api/carteira/depositos`), que credita na hora sem cobrar nada; o Pix (AbacatePay) entra no
  lugar do sandbox depois (ver `docs-arquitetura/adrs/0004-pagamentos-pix.md`). Também aparece na escolha de
  campo, quando a loja de flechas responde "saldo insuficiente" e no resultado quando o jogador fica sem moedas.
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
cp .env.example .env        # e preencha as variáveis do Auth0
npm run dev                 # http://localhost:5173 (repassa /api para o gateway em localhost:8080)
GATEWAY_URL=http://localhost:8090 npm run dev   # se o gateway estiver em outra porta
npm test                    # vitest
npm test -- --coverage      # com cobertura
npm run build               # gera dist/
```

O jogo precisa do api-gateway (e dos serviços) rodando para entrar e jogar.

Docker: o nginx serve o build e repassa `/api/` para `GATEWAY_URL` (padrão `http://api-gateway:8080`):

```bash
docker build -t frontend \
  --build-arg VITE_AUTH0_DOMAIN=tigrinho-trader.us.auth0.com \
  --build-arg VITE_AUTH0_CLIENT_ID=<client id> \
  --build-arg VITE_AUTH0_AUDIENCE=https://api.tigrinho-trader .
docker run -p 3000:80 -e GATEWAY_URL=http://api-gateway:8080 frontend
```

## Estrutura

- `src/regras.js`: dados e regras puras (pássaros, campos com o `slug` da API, flechas, loja, física), testados em `src/regras.test.js`
- `src/jogo.js`: o jogo (canvas, HUD, telas, controles e som sintetizado com WebAudio) ligado às sessões do servidor
- `src/auth.js`: login com o Auth0 (`configurado`, `iniciar`, `entrar`, `sair`, `token`, `usuarioAuth0`)
- `src/api.js`: cliente do `/api` (token Bearer, erros `ProblemDetail` → `ErroApi`, 401 → login, 403 → conta bloqueada)
- `src/sessao.js`: fila dos tiros (ordem e intervalo mínimo) e reconciliação do HUD com o servidor
- `src/conta.js`: menu de login, "Meu perfil", "Comprar moedas", "Administração" e conta bloqueada
- `src/creditos.js`: pacotes de moedas e mensagens da compra
- `src/telas.js`: formatação, validação do apelido e HTML das tabelas (puro, testado)
- `src/*.test.js`: testes (vitest); `src/conta.test.js` carrega o `index.html` no jsdom com Auth0 e API falsos
- `src/cenarios.js`: os 4 cenários (camadas pré-desenhadas, clima e animações)
- `src/estilos.css`: telas de menu, loja, recarga, resultado, perfil e administração
- `index.html`: estrutura das telas

Para equilibrar o jogo, ajuste `RANGES` (campos) e `ARROW_TYPES` (flechas) em `src/regras.js` **e** as mesmas regras
no trading-service (o servidor é quem paga).

## Repositorios do projeto

- [trading-service](https://github.com/tigrinho-trader/trading-service)
- [wallet-service](https://github.com/tigrinho-trader/wallet-service)
- [market-data-service](https://github.com/tigrinho-trader/market-data-service)
- [notification-service](https://github.com/tigrinho-trader/notification-service)
- [api-gateway](https://github.com/tigrinho-trader/api-gateway)
- user-service (usuários, perfil e administração)
- [docs-arquitetura](https://github.com/tigrinho-trader/docs-arquitetura)
