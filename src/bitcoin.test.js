import { describe, expect, it } from "vitest";
import {
  ATIVOS, ATIVO_POR_SIMBOLO, BINANCE_WS, lucroDaAposta, moedasComSinal, contarNoPlacar, linhasDoPlacar, placarVazio, reaisComSinal,
  somarResultadoReais, taxaDeAcerto, textoTaxa, BTC_ALTURA, BTC_AMPLITUDE, LISTA_ATIVOS, criarFeedPreco, urlBinance, BTC_NASCE_A_CADA, BTC_PRECO_SIMULADO, FLECHA_BTC, acertaBinario, acertaNoAlvo,
  alturaBtc, alvoBinario,
  alvoFlechaBtc, criarFeedBtc, direcaoDaPrevisao, escalaBtc, lerMensagemBinance, precoPrevisto, textoResultadoEstudo,
  toleranciaEmDolares, velocidadeFlechaBtc,
  velocidadePassaroDaFlecha,
} from "./bitcoin.js";
import {
  APOSTA_MERCADO, ARROW_BY_ID, BIRD_TYPES, RANGES, arrowCost, arrowPosition, coinsForHit, pickBirdType,
} from "./regras.js";

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
    expect(BIRD_TYPES.btc).toMatchObject({ coins: 0, btc: true });
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

describe("flecha bitcoin: previsão do preço em 5 s", () => {
  const ORIGEM = { x: 180, y: 518 };

  it("pássaro bitcoin avulso nasce a cada 3 segundos", () => {
    expect(BTC_NASCE_A_CADA).toBe(3);
  });

  it("o alvo fica sempre no extremo direito; a mira escolhe só a altura", () => {
    const reto = alvoFlechaBtc(ORIGEM, -0.2);
    expect(reto.x).toBe(FLECHA_BTC.xAlvo);
    expect(FLECHA_BTC.xAlvo).toBeGreaterThan(1100);
    // a reta do arco cruza a coluna do alvo
    expect(reto.y).toBeCloseTo(ORIGEM.y + Math.tan(-0.2) * (FLECHA_BTC.xAlvo - ORIGEM.x), 6);
    // mais inclinado para cima = mais alto (preço maior)
    expect(alvoFlechaBtc(ORIGEM, -0.3).y).toBeLessThan(reto.y);
  });

  it("a altura mirada fica na faixa onde o pássaro bitcoin pode estar", () => {
    expect(alvoFlechaBtc(ORIGEM, -1.2).y).toBe(BTC_ALTURA.min);
    expect(alvoFlechaBtc(ORIGEM, 0.5).y).toBe(BTC_ALTURA.max);
    expect(alvoFlechaBtc(ORIGEM, -Math.PI / 2).y).toBe(BTC_ALTURA.min);   // para cima
    expect(alvoFlechaBtc(ORIGEM, Math.PI / 2).y).toBe(BTC_ALTURA.max);    // para baixo
    expect(alvoFlechaBtc(ORIGEM, Math.PI - 0.1).y).toBe(BTC_ALTURA.max);  // para trás
  });

  it("a flecha chega no alvo em exatamente 5 s, sem sair pelo topo da tela", () => {
    for (const y of [BTC_ALTURA.min, FLECHA_BTC.nivel, BTC_ALTURA.max]) {
      const alvo = { x: FLECHA_BTC.xAlvo, y };
      const v = velocidadeFlechaBtc(ORIGEM, alvo);
      const p = arrowPosition(ORIGEM.x, ORIGEM.y, v.vx, v.vy, FLECHA_BTC.g, FLECHA_BTC.tempo);
      expect(p.x).toBeCloseTo(alvo.x, 6);
      expect(p.y).toBeCloseTo(alvo.y, 6);
      for (let t = 0; t <= FLECHA_BTC.tempo; t += 0.05) {
        expect(arrowPosition(ORIGEM.x, ORIGEM.y, v.vx, v.vy, FLECHA_BTC.g, t).y).toBeGreaterThan(0);
      }
    }
    expect(FLECHA_BTC.tempo).toBe(5);
  });

  it("o pássaro da flecha sai da esquerda e chega no alvo junto com ela", () => {
    const vx = velocidadePassaroDaFlecha();
    expect(FLECHA_BTC.xNascimento + vx * FLECHA_BTC.tempo).toBeCloseTo(FLECHA_BTC.xAlvo, 6);
    expect(FLECHA_BTC.xNascimento).toBeLessThan(0);
    // nasce na altura do preço de agora: se o preço não mexer, chega nessa mesma altura
    expect(alturaBtc(FLECHA_BTC.nivel, 83000, 83000, 5)).toBe(FLECHA_BTC.nivel);
  });

  it("quem previu o preço certo acerta; quem errou além da folga, não", () => {
    const escala = 6;                         // px por dólar no disparo
    const agora = 83000;
    const folga = toleranciaEmDolares(escala, BIRD_TYPES.btc.r);
    expect(folga).toBeCloseTo((BIRD_TYPES.btc.r + FLECHA_BTC.raio) / escala);
    for (const precoEm5s of [83000, 83010, 82985]) {
      const passaro = {
        mercado: { ativo: "btc" }, type: BIRD_TYPES.btc, x: FLECHA_BTC.xAlvo,
        y: alturaBtc(FLECHA_BTC.nivel, agora, precoEm5s, escala),
      };
      // mirou na altura do preço que de fato veio
      const certo = { x: FLECHA_BTC.xAlvo, y: passaro.y };
      expect(precoPrevisto(agora, escala, certo.y)).toBeCloseTo(precoEm5s, 6);
      expect(acertaNoAlvo(certo, passaro)).toBe(true);
      // errou a previsão por mais que a folga
      const errado = { x: FLECHA_BTC.xAlvo, y: passaro.y + (folga + 1) * escala };
      expect(acertaNoAlvo(errado, passaro)).toBe(false);
    }
  });

  it("preço previsto: acima da linha de agora é alta, abaixo é queda", () => {
    expect(precoPrevisto(83000, 4, FLECHA_BTC.nivel)).toBe(83000);
    expect(precoPrevisto(83000, 4, FLECHA_BTC.nivel - 40)).toBe(83010);
    expect(precoPrevisto(83000, 4, FLECHA_BTC.nivel + 20)).toBe(82995);
    expect(precoPrevisto(83000, 0, 100)).toBe(83000);
    expect(toleranciaEmDolares(0, 23)).toBe(0);
  });

  it("só acerta pássaro bitcoin", () => {
    const alvo = { x: 500, y: 300 };
    expect(acertaNoAlvo(alvo, { type: BIRD_TYPES.red, x: 500, y: 300 })).toBe(false);
    expect(acertaNoAlvo(alvo, { mercado: { ativo: "btc" }, type: BIRD_TYPES.btc, x: 500, y: 300 })).toBe(true);
    // a flecha de um ativo só acerta o pássaro do mesmo ativo
    const eth = { mercado: { ativo: "eth" }, type: BIRD_TYPES.eth, x: 500, y: 300 };
    expect(acertaNoAlvo({ ...alvo, ativo: "btc" }, eth)).toBe(false);
    expect(acertaNoAlvo({ ...alvo, ativo: "eth" }, eth)).toBe(true);
  });

  it("custa a aposta e não tira moedas do pássaro: o prêmio vem da aposta", () => {
    const flecha = ARROW_BY_ID.btc;
    expect(flecha).toMatchObject({ precoFixo: APOSTA_MERCADO, especial: "btc" });
    expect(arrowCost(flecha, RANGES[0])).toBe(APOSTA_MERCADO);
    expect(coinsForHit(BIRD_TYPES.btc, RANGES[0], flecha)).toBe(0);
  });
});

describe("estudo da sabedoria das massas", () => {
  const sem = (t) => t.replace(/\s/g, " ");

  it("a direção da operação é a da previsão; em cima da linha de agora não opera", () => {
    expect(direcaoDaPrevisao({ agora: 83000, previsto: 83012 })).toBe("ALTA");
    expect(direcaoDaPrevisao({ agora: 83000, previsto: 82990 })).toBe("QUEDA");
    expect(direcaoDaPrevisao({ agora: 83000, previsto: 83000.3 })).toBeNull();
    expect(direcaoDaPrevisao(null)).toBeNull();
    expect(direcaoDaPrevisao({ agora: NaN, previsto: 1 })).toBeNull();
  });

  it("mostra as moedas da aposta liquidada pelo servidor e o resultado da operação", () => {
    const ganhou = textoResultadoEstudo({ status: "FECHADA", modo: "REAL", moedasPagas: 101.2,
      resultadoBinarioBrl: 10, resultadoLiquidoBrl: 0.12 });
    expect(ganhou.texto).toBe("+1,2 moedas");                              // R$ 0,12 × 10
    expect(sem(ganhou.detalhe)).toBe("acertou · operação real +R$ 0,12");
    expect(ganhou.cor).toBe("ganho");

    const perdeu = textoResultadoEstudo({ status: "FECHADA", modo: "SIMULADO", moedasPagas: 99.96,
      resultadoBinarioBrl: -10, resultadoLiquidoBrl: -0.0042 });
    expect(perdeu.texto).toBe("−0,04 moedas");
    expect(sem(perdeu.detalhe)).toBe("errou · simulação −R$ 0,0042");     // centavos de centavo aparecem
    expect(perdeu.cor).toBe("perda");

    const empate = textoResultadoEstudo({ status: "FECHADA", modo: "REAL", moedasPagas: 100,
      resultadoBinarioBrl: 0, resultadoLiquidoBrl: 0 });
    expect(empate.texto).toBe("0 moedas");
    expect(empate.detalhe.startsWith("empatou")).toBe(true);
    expect(empate.cor).toBe("neutro");
  });

  it("aposta que não aconteceu volta e explica o motivo; sem liquidação ainda não há texto", () => {
    expect(textoResultadoEstudo({ status: "RECUSADA", moedasPagas: 100, motivo: "Perda maxima do dia atingida" }))
      .toEqual({ texto: "Aposta devolvida", detalhe: "Perda maxima do dia atingida", cor: "neutro" });
    expect(textoResultadoEstudo({ status: "FALHOU", moedasPagas: 100 }).detalhe).toBe("operação não aconteceu");
    expect(textoResultadoEstudo({ status: "ABERTA", moedasPagas: null })).toBeNull();
    expect(textoResultadoEstudo({ status: "FECHADA" })).toBeNull();          // fechou, mas ainda não pagou
    expect(textoResultadoEstudo(null)).toBeNull();
    // apostas antigas (200 / 0) e a soma da partida
    expect(lucroDaAposta({ moedasPagas: 200 })).toBe(100);
    expect(lucroDaAposta({ moedasPagas: 99.4 })).toBe(-0.6);
    expect(lucroDaAposta({ moedasPagas: null })).toBe(0);
    expect(moedasComSinal(-0.6)).toBe("−0,6");
    expect(moedasComSinal(0)).toBe("0");
  });

});

describe("modo sobe ou desce (binário)", () => {
  const sem = (t) => t.replace(/\s/g, " ");

  it("acima da linha de agora é sobe, abaixo é desce; a flecha vai para o meio da faixa", () => {
    const sobe = alvoBinario(FLECHA_BTC.nivel - 1);
    expect(sobe).toEqual({ x: FLECHA_BTC.xAlvo, y: (BTC_ALTURA.min + FLECHA_BTC.nivel) / 2, binaria: "ALTA" });
    const desce = alvoBinario(FLECHA_BTC.nivel + 80);
    expect(desce.binaria).toBe("QUEDA");
    expect(desce.y).toBe((FLECHA_BTC.nivel + BTC_ALTURA.max) / 2);
    expect(alvoBinario(FLECHA_BTC.nivel).binaria).toBe("QUEDA");
  });

  it("acerta o pássaro da flecha se ele chegou do lado escolhido", () => {
    const passaro = (y) => ({ mercado: { ativo: "btc" }, y });
    expect(acertaBinario("ALTA", passaro(FLECHA_BTC.nivel - 1))).toBe(true);
    expect(acertaBinario("ALTA", passaro(FLECHA_BTC.nivel + 1))).toBe(false);
    expect(acertaBinario("QUEDA", passaro(FLECHA_BTC.nivel + 40))).toBe(true);
    expect(acertaBinario("QUEDA", passaro(FLECHA_BTC.nivel))).toBe(false);   // preço parado: ninguém acerta
    expect(acertaBinario("ALTA", passaro(FLECHA_BTC.nivel))).toBe(false);
    expect(acertaBinario("ALTA", { y: 0 })).toBe(false);                     // só pássaro bitcoin
  });

  it("a aposta custa 100 moedas e paga o dobro no acerto", () => {
    expect(APOSTA_MERCADO).toBe(100);
    for (const r of RANGES) expect(arrowCost(ARROW_BY_ID.btc, r)).toBe(100);   // o mesmo em todo campo
  });

});

describe("ativos de mercado: bitcoin, ethereum e ouro", () => {
  const sem = (t) => t.replace(/\s/g, " ");

  it("cada ativo tem par na Binance, pássaro e flecha próprios", () => {
    expect(LISTA_ATIVOS.map((a) => a.simbolo)).toEqual(["BTCUSDT", "ETHUSDT", "PAXGUSDT"]);
    for (const a of LISTA_ATIVOS) {
      expect(ATIVO_POR_SIMBOLO[a.simbolo]).toBe(a);
      expect(BIRD_TYPES[a.id]).toMatchObject({ coins: 0, mercado: a.id });
      expect(ARROW_BY_ID[a.id]).toMatchObject({ precoFixo: 100, mercado: a.id });
      for (const r of RANGES) expect(r.pool[a.id]).toBeUndefined();   // fora do sorteio dos campos
    }
    expect(ARROW_BY_ID.ouro.name).toBe("Ouro PAXG");                    // não confunde com a flecha de ouro
    expect(ATIVOS.btc.casas).toBe(0);
    expect(ATIVOS.eth.casas).toBe(2);
  });

  it("stream público da Binance de cada par", () => {
    expect(urlBinance("ETHUSDT"))
      .toBe("wss://data-stream.binance.vision/stream?streams=ethusdt@aggTrade/ethusdt@miniTicker");
    expect(BINANCE_WS).toBe(urlBinance("BTCUSDT"));
  });

  it("o feed do ethereum conecta no par dele e simula a partir do preço do ativo", async () => {
    const abertos = [];
    const feed = criarFeedPreco({
      simbolo: "ETHUSDT", precoSimulado: 3000, aleatorio: () => 0.5,
      buscarReserva: async () => { throw new Error("fora do ar"); },
      abrirSocket: (url) => { const s = { url, close() {} }; abertos.push(s); return s; },
    });
    feed.ligar();
    feed.atualizar(0.016);
    await new Promise((r) => setTimeout(r, 0));
    feed.atualizar(0.016);
    expect(abertos[0].url).toContain("ethusdt@aggTrade");
    expect(feed.simulado()).toBe(true);
    expect(feed.preco()).toBeCloseTo(3000, 0);
  });

  it("linha de agora é relativa ao preço: centavos contam no ethereum e no ouro", () => {
    expect(direcaoDaPrevisao({ agora: 3000, previsto: 3000.01 })).toBeNull();
    expect(direcaoDaPrevisao({ agora: 3000, previsto: 3000.05 })).toBe("ALTA");
    expect(direcaoDaPrevisao({ agora: 2600, previsto: 2599.9 })).toBe("QUEDA");
  });

  it("o resultado diz de qual ativo era a aposta", () => {
    const op = { status: "FECHADA", modo: "SIMULADO", simbolo: "PAXGUSDT", moedasPagas: 200,
      resultadoBinarioBrl: 10, resultadoLiquidoBrl: -0.06 };
    expect(sem(textoResultadoEstudo(op).detalhe)).toBe("Ouro · acertou · simulação −R$ 0,06");
    expect(textoResultadoEstudo({ status: "RECUSADA", simbolo: "ETHUSDT", moedasPagas: 100, motivo: "x" }).detalhe)
      .toBe("Ethereum · x");
  });

});

describe("placar da partida", () => {
  const sem = (t) => t.replace(/\s/g, " ");
  const fechada = (b, liquido = 0) => ({ status: "FECHADA", resultadoBinarioBrl: b, resultadoLiquidoBrl: liquido });

  it("conta acertos, erros e empates por ativo; falhas não contam", () => {
    const placar = placarVazio();
    contarNoPlacar(placar, "btc", fechada(10));
    contarNoPlacar(placar, "btc", fechada(10));
    contarNoPlacar(placar, "btc", fechada(-10));
    contarNoPlacar(placar, "btc", fechada(0));
    contarNoPlacar(placar, "eth", { status: "FALHOU", resultadoBinarioBrl: null });
    contarNoPlacar(placar, "xyz", fechada(10));
    contarNoPlacar(placar, "eth", null);
    expect(placar.btc).toEqual({ acertos: 2, erros: 1, empates: 1 });
    expect(placar.eth).toEqual({ acertos: 0, erros: 0, empates: 0 });
    expect(taxaDeAcerto(placar.btc)).toBeCloseTo(66.67, 1);      // empate fora da conta
    expect(taxaDeAcerto(placar.eth)).toBeNull();
    expect(linhasDoPlacar(placar).map((l) => l.texto)).toEqual(["₿ 66,7% (2/3)"]);
    expect(linhasDoPlacar(null)).toEqual([]);
  });

  it("taxa formatada e soma da partida em reais", () => {
    expect(textoTaxa(null)).toBe("—");
    expect(textoTaxa(60)).toBe("60%");
    expect(textoTaxa(66.666)).toBe("66,7%");
    let total = 0;
    total = somarResultadoReais(total, fechada(10, 0.12));
    total = somarResultadoReais(total, fechada(-10, -0.3));
    total = somarResultadoReais(total, { status: "RECUSADA", resultadoLiquidoBrl: 5 });
    total = somarResultadoReais(total, null);
    expect(total).toBeCloseTo(-0.18, 6);
    expect(sem(reaisComSinal(total))).toBe("−R$ 0,18");
    expect(sem(reaisComSinal(0.004))).toBe("+R$ 0,0040");
    expect(reaisComSinal("x")).toBe("R$ 0,00");
  });
});
