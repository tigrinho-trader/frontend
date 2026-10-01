# frontend

Parte do projeto **Tigrinho Trader** (disciplina Projeto de Software).

## Finalidade

Interface "tigrinho" do jogo: o jogador aposta se o preço real de uma cripto (Binance) sobe, desce ou fica parado
numa rodada de 15s a 5min, com fichas fictícias. Fala exclusivamente com o `api-gateway` via REST (`/api/...`);
não conhece os serviços internos.

## Jogos

| Jogo | Como funciona |
|---|---|
| 🎯 Palpite | Escolhe o ativo e aposta em Sobe, Desce ou Parado. |
| 🎡 Roleta do Tigre | A roleta sorteia ativo + palpite (9 fatias) e a aposta é feita onde o ponteiro parar. |
| 🪜 Escada | Cada acerto sobe um degrau e o prêmio inteiro vira a próxima aposta. 5 degraus até o topo; dá pra sacar entre um e outro, errou cai tudo. |

Os três usam os modos do `trading-service` (regras em `GET /api/ordens/regras`):

| Modo | Sobe/Desce | Parado | Se errar |
|---|---|---|---|
| 🐱 Fácil | 1,50x | 1,80x | perde metade |
| 🐯 Difícil | 1,90x | 2,50x | perde tudo |
| 🔥 Insano | 4,00x (preço precisa andar 0,02%) | 6,00x (dentro de 0,01%) | perde tudo |

Durante a rodada a tela mostra o gráfico ao vivo, a contagem regressiva e se você está ganhando ou perdendo naquele
instante; quem decide o resultado é o `trading-service`.

> Login com Auth0 entra na Etapa 3. Até lá o jogador digita um nome, que vai no cabeçalho `X-Usuario-Id`.

## Rodando

Com o backend no ar (`docker compose up --build` no repo `api-gateway`, que já sobe este frontend em
http://localhost:3000):

```bash
npm install
npm run dev                                      # http://localhost:5173, /api vai pro gateway em localhost:8080
GATEWAY_URL=http://localhost:8090 npm run dev    # se o gateway estiver em outra porta
npm test                                         # vitest (logica do jogo e cliente da API)
npm run build
```

Na imagem Docker o nginx serve o build e repassa `/api` para `GATEWAY_URL` (padrão `http://api-gateway:8080`).

## Estrutura

- `src/api.js`: cliente do gateway
- `src/jogo.js`: regras de tela (situação parcial da rodada, roleta, escada, formatação), testadas em `src/jogo.test.js`
- `src/ganchos.js`: hooks de cotações ao vivo, acompanhamento da rodada e carteira
- `src/jogos/`: Palpite, Roleta e Escada
- `src/componentes/`: topo, ticker, controles, gráfico, rodada ativa e histórico

## Repositorios do projeto

- [trading-service](https://github.com/tigrinho-trader/trading-service)
- [wallet-service](https://github.com/tigrinho-trader/wallet-service)
- [market-data-service](https://github.com/tigrinho-trader/market-data-service)
- [notification-service](https://github.com/tigrinho-trader/notification-service)
- [api-gateway](https://github.com/tigrinho-trader/api-gateway)
- [docs-arquitetura](https://github.com/tigrinho-trader/docs-arquitetura)
