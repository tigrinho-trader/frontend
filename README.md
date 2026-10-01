# frontend

Parte do projeto **Tigrinho Trader** (disciplina Projeto de Software).

## Finalidade

Jogos casuais em que a aposta está dentro da mecânica do jogo, com moedas fictícias e o preço real das criptos
(Binance). Fala exclusivamente com o `api-gateway` via REST (`/api/...`); não conhece os serviços internos.

Os dois jogos usam a aposta **BARREIRA** ("sem toque") do `trading-service`: o jogador escolhe um preço-alvo e
ganha se o mercado **não encostar** nele até o fim. Quanto mais perto do preço, mais paga (até 20x); o
multiplicador vem da volatilidade real do ativo e é mostrado ao vivo (`src/barreira.js` repete a conta do backend).

## Jogos

| Jogo | Como funciona |
|---|---|
| ✈️ Voo Congelado | O avião voa sobre o gráfico ao vivo e o jogador escolhe a altura (mouse, dedo ou ↑↓). Num momento aleatório chega o gelo e o avião congela ali: essa altura vira o alvo. Se a linha do preço encostar no avião antes do gelo derreter (15/30/60s), ele cai. |
| 🐯 Arena do Tigre | Expedição de ~3 minutos em 5 ondas. Cada onda oferece 3 animais: os do céu atacam de cima (alvo acima do preço), os do chão de baixo. O jogador escolhe quantos e quais enfrentar; durante 30s o tigre atravessa a arena na altura do preço, e cada linha de ataque que ele cruzar é um golpe (aposta perdida). Bicho mais forte fica mais perto e paga mais; a última onda tem um chefe. |

O tigre do jogador evolui: XP, nível, título e troféus saem do histórico de rodadas no servidor
(`src/tigre.js`), então o progresso continua em qualquer navegador.

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
- `src/barreira.js`: preço da aposta "sem toque" (mesma conta do `CalculadoraBarreira` do backend)
- `src/tigre.js`: XP, nível e troféus do tigre a partir das rodadas
- `src/jogos/VooCongelado.jsx` + `src/jogos/voo/cena.js`: o jogo do avião (cena em canvas)
- `src/jogos/ArenaTigre.jsx` + `src/jogos/arena/bestiario.js`: a arena e os animais
- `src/som.js`: efeitos sonoros sintetizados (WebAudio), com botão de mudo
- `src/ganchos.js`: cotações ao vivo, parâmetros da barreira, rodadas e carteira

## Repositorios do projeto

- [trading-service](https://github.com/tigrinho-trader/trading-service)
- [wallet-service](https://github.com/tigrinho-trader/wallet-service)
- [market-data-service](https://github.com/tigrinho-trader/market-data-service)
- [notification-service](https://github.com/tigrinho-trader/notification-service)
- [api-gateway](https://github.com/tigrinho-trader/api-gateway)
- [docs-arquitetura](https://github.com/tigrinho-trader/docs-arquitetura)
