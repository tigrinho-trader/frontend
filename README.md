# frontend

Parte do projeto **Tigrinho Trader** (disciplina Projeto de Software).

## Finalidade

**Flecha Certeira**: jogo de arco e flecha no navegador, com moedas fictícias. O arqueiro paga a entrada de um
campo de tiro, compra flechas e tenta acertar pássaros em movimento. A graça é **prever** o caminho: a flecha
segue uma parábola e os pássaros não param, então é preciso mirar onde o pássaro *vai* estar.

É um site estático (canvas + módulos ES, sem framework). O saldo fica salvo no navegador (`localStorage`);
o jogo não chama o `api-gateway`.

## Como funciona

- O jogador começa com **100 moedas**. Para atirar, escolhe um **campo**, paga a **entrada** e monta a
  **aljava**. Quando as flechas acabam, dá para comprar mais ou encerrar. O resultado mostra lucro ou prejuízo.
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

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest (regras e economia)
npm run build        # gera dist/
```

Na imagem Docker o nginx só serve o build estático.

## Estrutura

- `src/regras.js`: dados e regras puras (pássaros, campos, flechas, loja, física), testados em `src/regras.test.js`
- `src/jogo.js`: o jogo (canvas, HUD, telas, controles e som sintetizado com WebAudio)
- `src/cenarios.js`: os 4 cenários (camadas pré-desenhadas, clima e animações)
- `src/estilos.css`: telas de menu, loja, recarga e resultado
- `index.html`: estrutura das telas

Para equilibrar o jogo, ajuste `RANGES` (campos) e `ARROW_TYPES` (flechas) em `src/regras.js`.

## Repositorios do projeto

- [trading-service](https://github.com/tigrinho-trader/trading-service)
- [wallet-service](https://github.com/tigrinho-trader/wallet-service)
- [market-data-service](https://github.com/tigrinho-trader/market-data-service)
- [notification-service](https://github.com/tigrinho-trader/notification-service)
- [api-gateway](https://github.com/tigrinho-trader/api-gateway)
- [docs-arquitetura](https://github.com/tigrinho-trader/docs-arquitetura)
