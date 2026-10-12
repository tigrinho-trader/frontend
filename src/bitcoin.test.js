import { describe, expect, it } from "vitest";
import {
  BINANCE_WS, BTC_ALTURA, BTC_AMPLITUDE, BTC_NASCE_A_CADA, BTC_PRECO_SIMULADO, FLECHA_BTC, acertaNoAlvo, alturaBtc,
  alvoFlechaBtc, criarFeedBtc, escalaBtc, lerMensagemBinance, velocidadeFlechaBtc,
} from "./bitcoin.js";
import { ARROW_BY_ID, BIRD_TYPES, RANGES, arrowPosition, coinsForHit, pickBirdType } from "./regras.js";

const esperar = () => new Promise((r) => setTimeout(r, 0));

/** WebSocket falso: guarda as instâncias para o teste mandar mensagens e derrubar a conexão. */
function socketsFalsos() {
  const abertos = [];
  const abrir = (url) => {
    const s = { url, fechado: false, close() { this.fechado = true; this.onclose?.(); } };
    abertos.push(s);
    return s;
  };
  return { abertos, abrir };
}

const trade = (p) => ({ data: JSON.stringify({ stream: "btcusdt@aggTrade", data: { e: "aggTrade", p: String(p) } }) });
const ticker = (c, o) => ({ data: JSON.stringify({ stream: "btcusdt@miniTicker", data: { e: "24hrMiniTicker", c: String(c), o: String(o) } }) });

describe("mensagens da Binance", () => {
  it("lê o preço de cada negociação e a variação de 24 h do miniTicker", () => {
    expect(lerMensagemBinance(trade("83661.47").data)).toEqual({ preco: 83661.47 });
    const t = lerMensagemBinance(ticker(101, 100).data);
    expect(t.preco).toBe(101);
    expect(t.variacao24h).toBeCloseTo(1);
  });

  it("ignora mensagens inválidas ou de outros tipos", () => {
    for (const m of ["não é json", "{}", '{"data":{"e":"kline"}}', '{"data":{"e":"aggTrade","p":"0"}}',
      '{"data":{"e":"24hrMiniTicker","c":"10","o":"0"}}']) {
      expect(lerMensagemBinance(m)).toBeNull();
    }
  });

  it("assina o stream público de dados de mercado do BTCUSDT", () => {
    expect(BINANCE_WS).toMatch(/^wss:\/\/data-stream\.binance\.vision\/stream\?streams=/);
    expect(BINANCE_WS).toContain("btcusdt@aggTrade");
    expect(BINANCE_WS).toContain("btcusdt@miniTicker");
  });
});

describe("voo do pássaro bitcoin", () => {
  it("a oscilação recente ocupa a amplitude da tela", () => {
    const hist = [{ preco: 100000 }, { preco: 100100 }, { preco: 99900 }];
    expect(escalaBtc(hist, 100000)).toBeCloseTo(BTC_AMPLITUDE / 200);
  });

  it("oscilação pequena demais usa a faixa mínima (0,02%) para não ampliar ruído", () => {
    expect(escalaBtc([{ preco: 100000 }, { preco: 100001 }], 100000)).toBeCloseTo(BTC_AMPLITUDE / 20);
    expect(escalaBtc([], 0)).toBe(0);
  });

  it("sobe quando o preço sobe, desce quando cai, sem sair da faixa da tela", () => {
    expect(alturaBtc(300, 100, 110, 2)).toBe(280);
    expect(alturaBtc(300, 100, 90, 2)).toBe(320);
    expect(alturaBtc(300, 100, 100000, 2)).toBe(BTC_ALTURA.min);
    expect(alturaBtc(300, 100, -100000, 2)).toBe(BTC_ALTURA.max);
  });

  it("não entra no sorteio dos campos: nasce à parte", () => {
    expect(BIRD_TYPES.btc).toMatchObject({ coins: 3, btc: true });
    for (const r of RANGES) {
      expect(r.pool.btc).toBeUndefined();
      for (const sorteio of [0, 0.3, 0.6, 0.999]) expect(pickBirdType(r.pool, () => sorteio)).not.toBe("btc");
    }
  });
});

describe("cotação do BTC em tempo real", () => {
  it("conecta na Binance ao ligar e usa cada negociação recebida", async () => {
    const { abertos, abrir } = socketsFalsos();
    let reserva = 0;
    const feed = criarFeedBtc({ buscarReserva: async () => { reserva++; return null; }, abrirSocket: abrir });
    feed.atualizar(0.016);
    expect(abertos).toHaveLength(0);           // desligado: nada de conexão

    feed.ligar();
    feed.atualizar(0.016);
    expect(abertos).toHaveLength(1);
    expect(abertos[0].url).toBe(BINANCE_WS);

    abertos[0].onmessage(trade(83000));
    abertos[0].onmessage(ticker(83000, 82000));
    feed.atualizar(0.016);
    expect(feed.preco()).toBe(83000);
    expect(feed.fonte()).toBe("binance");
    expect(feed.variacao24h()).toBeCloseTo(1.2195, 3);
    expect(feed.simulado()).toBe(false);

    // o preço mostrado desliza até o novo preço
    abertos[0].onmessage(trade(83100));
    feed.atualizar(0.1);
    expect(feed.preco()).toBeGreaterThan(83000);
    expect(feed.preco()).toBeLessThan(83100);
    for (let i = 0; i < 60; i++) feed.atualizar(0.05);
    expect(feed.preco()).toBeCloseTo(83100, 0);
    await esperar();
    // a Binance falou durante todo o tempo... exceto no primeiro quadro, antes da conexão
    expect(reserva).toBeLessThanOrEqual(1);
  });

  it("desligar fecha a conexão; ao cair, reconecta depois de alguns segundos", () => {
    const { abertos, abrir } = socketsFalsos();
    const feed = criarFeedBtc({ buscarReserva: async () => ({ preco: 1 }), abrirSocket: abrir });
    feed.ligar();
    feed.atualizar(0.016);
    abertos[0].close();                         // a Binance derrubou
    feed.atualizar(1);
    expect(abertos).toHaveLength(1);
    feed.atualizar(2.5);
    expect(abertos).toHaveLength(2);

    feed.desligar();
    expect(abertos[1].fechado).toBe(true);
    feed.atualizar(10);
    expect(abertos).toHaveLength(2);
    expect(feed.ligado()).toBe(false);
  });

  it("Binance calada: usa a cotação do servidor como reserva", async () => {
    const { abrir } = socketsFalsos();
    const feed = criarFeedBtc({
      buscarReserva: async () => ({ preco: 84000, variacaoPercentual24h: -0.5 }), abrirSocket: abrir,
    });
    feed.ligar();
    feed.atualizar(0.016);
    await esperar();
    feed.atualizar(0.016);
    expect(feed.preco()).toBe(84000);
    expect(feed.fonte()).toBe("servidor");
    expect(feed.variacao24h()).toBe(-0.5);
  });

  it("não consegue abrir o WebSocket: tenta de novo depois e segue pela reserva", async () => {
    let tentativas = 0;
    const feed = criarFeedBtc({
      buscarReserva: async () => ({ preco: 84000 }),
      abrirSocket: () => { tentativas++; throw new Error("bloqueado"); },
    });
    feed.ligar();
    feed.atualizar(0.016);
    await esperar();
    feed.atualizar(0.016);
    expect(tentativas).toBe(1);
    expect(feed.preco()).toBe(84000);
    feed.atualizar(3);
    expect(tentativas).toBe(2);
  });

  it("sem Binance e sem servidor: preço simulado, marcado como tal, e volta ao real sem salto", async () => {
    const { abertos, abrir } = socketsFalsos();
    const feed = criarFeedBtc({
      buscarReserva: async () => { throw new Error("fora do ar"); }, abrirSocket: abrir, aleatorio: () => 0.9,
    });
    feed.ligar();
    feed.atualizar(0.016);
    await esperar();
    feed.atualizar(0.016);
    expect(feed.simulado()).toBe(true);
    expect(feed.fonte()).toBeNull();
    expect(feed.preco()).toBeGreaterThanOrEqual(BTC_PRECO_SIMULADO);
    const geracao = feed.geracao();
    feed.atualizar(1);
    expect(feed.preco()).toBeGreaterThan(BTC_PRECO_SIMULADO);   // passeio aleatório andando

    abertos[0].onmessage(trade(83000));
    feed.atualizar(0.016);
    expect(feed.simulado()).toBe(false);
    expect(feed.preco()).toBe(83000);              // salto: o preço real entra direto
    expect(feed.geracao()).toBe(geracao + 1);      // e avisa quem guardou referência
  });

  it("com cotação real, só simula depois de várias falhas seguidas da reserva", async () => {
    let falhar = false;
    const feed = criarFeedBtc({
      buscarReserva: async () => { if (falhar) throw new Error("x"); return { preco: 84000 }; },
      abrirSocket: socketsFalsos().abrir,
    });
    feed.ligar();
    feed.atualizar(0.016);
    await esperar();
    falhar = true;
    for (let i = 0; i < 2; i++) {
      feed.atualizar(1.1);
      await esperar();
    }
    expect(feed.simulado()).toBe(false);
    feed.atualizar(1.1);
    await esperar();
    expect(feed.simulado()).toBe(true);
  });

  it("mensagens de uma conexão antiga são ignoradas", () => {
    const { abertos, abrir } = socketsFalsos();
    const feed = criarFeedBtc({ buscarReserva: async () => null, abrirSocket: abrir });
    feed.ligar();
    feed.atualizar(0.016);
    const antiga = abertos[0];
    feed.desligar();
    antiga.onmessage(trade(50000));
    feed.atualizar(0.016);
    expect(feed.preco()).toBeNull();
  });
});

describe("flecha bitcoin", () => {
  const ORIGEM = { x: 180, y: 518 };
  const LIMITES = { xMin: 40, xMax: 1240, yMin: 70, yMax: 580 };

  it("pássaro bitcoin nasce a cada 3 segundos", () => {
    expect(BTC_NASCE_A_CADA).toBe(3);
  });

  it("chega exatamente no ponto mirado em 5 segundos", () => {
    for (const alvo of [{ x: 900, y: 300 }, { x: 400, y: 100 }, { x: 1200, y: 560 }, { x: 60, y: 200 }]) {
      const v = velocidadeFlechaBtc(ORIGEM, alvo);
      const p = arrowPosition(ORIGEM.x, ORIGEM.y, v.vx, v.vy, FLECHA_BTC.g, FLECHA_BTC.tempo);
      expect(p.x).toBeCloseTo(alvo.x, 6);
      expect(p.y).toBeCloseTo(alvo.y, 6);
    }
    expect(FLECHA_BTC.tempo).toBe(5);
  });

  it("o arco não sai pelo topo da tela, nem mirando no ponto mais alto", () => {
    const alvo = { x: 1240, y: LIMITES.yMin };
    const v = velocidadeFlechaBtc(ORIGEM, alvo);
    for (let t = 0; t <= FLECHA_BTC.tempo; t += 0.05) {
      expect(arrowPosition(ORIGEM.x, ORIGEM.y, v.vx, v.vy, FLECHA_BTC.g, t).y).toBeGreaterThan(0);
    }
  });

  it("mira na direção do arraste, mais longe com mais força, sempre dentro da área de voo", () => {
    const perto = alvoFlechaBtc(ORIGEM, 0, 0, LIMITES);
    expect(perto).toEqual({ x: ORIGEM.x + FLECHA_BTC.alcanceMin, y: ORIGEM.y });
    const longe = alvoFlechaBtc(ORIGEM, -0.4, 1, LIMITES);
    expect(longe.x).toBeGreaterThan(perto.x);
    expect(longe.y).toBeLessThan(ORIGEM.y);
    const reto = alvoFlechaBtc(ORIGEM, -Math.PI / 2, 1, LIMITES);
    expect(reto.x).toBeCloseTo(ORIGEM.x, 6);
    expect(reto.y).toBe(LIMITES.yMin);
    expect(alvoFlechaBtc(ORIGEM, 0, 5, LIMITES).x).toBe(LIMITES.xMax);
  });

  it("só acerta pássaro bitcoin dentro do círculo do alvo", () => {
    const alvo = { x: 500, y: 300 };
    const btc = { btc: {}, type: BIRD_TYPES.btc, x: 500, y: 300 };
    const raio = BIRD_TYPES.btc.r + FLECHA_BTC.raio;
    expect(acertaNoAlvo(alvo, btc)).toBe(true);
    expect(acertaNoAlvo(alvo, { ...btc, x: 500 + raio })).toBe(true);
    expect(acertaNoAlvo(alvo, { ...btc, x: 500 + raio + 1 })).toBe(false);
    expect(acertaNoAlvo(alvo, { type: BIRD_TYPES.red, x: 500, y: 300 })).toBe(false);
  });

  it("dobra as moedas do pássaro bitcoin e custa o mesmo que a de madeira", () => {
    const flecha = ARROW_BY_ID.btc;
    expect(flecha).toMatchObject({ price: 1, coins: 2, especial: "btc" });
    const vilarejo = RANGES[0];
    expect(coinsForHit(BIRD_TYPES.btc, vilarejo, flecha)).toBe(2 * coinsForHit(BIRD_TYPES.btc, vilarejo, ARROW_BY_ID.wood));
    expect(coinsForHit(BIRD_TYPES.btc, vilarejo, flecha)).toBe(12);
  });
});
