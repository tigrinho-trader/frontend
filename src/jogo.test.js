import { describe, expect, it } from "vitest";
import { descreverRodada, formatarMoedas, formatarPreco, nomeAtivo, sequenciaVitorias } from "./jogo.js";
import {
  alvoNaDistancia,
  chanceSemToque,
  distancia,
  distanciaParaChance,
  erf,
  erfInversa,
  faixaPermitida,
  multiplicador,
  volatilidade,
} from "./barreira.js";
import { progressoDoTigre, trofeuDe, xpParaNivel } from "./tigre.js";
import { BESTIARIO, ONDAS, alvoDoAnimal, premioDoAnimal, sortearOnda } from "./jogos/arena/bestiario.js";

describe("formatacao", () => {
  it("formata moedas e precos no padrao brasileiro", () => {
    expect(formatarMoedas(1234.5)).toBe("1.234,50");
    expect(formatarMoedas("abc")).toBe("0,00");
    expect(formatarPreco(83586.08)).toBe("83.586,08");
    expect(formatarPreco(118.25)).toBe("118,2500");
    expect(formatarPreco(0.123456)).toBe("0,123456");
    expect(nomeAtivo("BTCUSDT")).toBe("BTC");
  });

  it("descreve as rodadas no diario", () => {
    expect(descreverRodada({ tipo: "BARREIRA", alvo: 101, precoEntrada: 100 }).texto).toBe("Sem toque acima");
    expect(descreverRodada({ tipo: "BARREIRA", alvo: 99, precoEntrada: 100 }).icone).toBe("⛰️");
    expect(descreverRodada({ tipo: "ALTA" }).texto).toBe("Sobe");
    expect(descreverRodada({ tipo: "OUTRO" }).texto).toBe("OUTRO");
  });

  it("conta acertos seguidos ignorando abertas e empates", () => {
    const ordens = ["ABERTA", "GANHOU", "EMPATOU", "GANHOU", "PERDEU", "GANHOU"].map((status) => ({ status }));
    expect(sequenciaVitorias(ordens)).toBe(2);
    expect(sequenciaVitorias([])).toBe(0);
  });
});

describe("barreira (mesma conta do trading-service)", () => {
  it("erf e a inversa batem com valores conhecidos", () => {
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-0.5)).toBeCloseTo(-0.5204999, 6);
    expect(erfInversa(erf(0.7))).toBeCloseTo(0.7, 6);
    expect(erfInversa(1)).toBe(Infinity);
    expect(erfInversa(-1)).toBe(-Infinity);
  });

  it("alvo a um desvio da rodada sobrevive 68% e paga 1,39x (igual ao BarreiraTest do backend)", () => {
    const sigma = 0.0001;
    const umDesvio = sigma * Math.sqrt(25);
    expect(chanceSemToque(umDesvio, sigma, 25)).toBeCloseTo(0.6827, 4);
    expect(multiplicador(umDesvio, sigma, 25)).toBe(1.39);
    expect(multiplicador(0, sigma, 25)).toBe(20);
  });

  it("converte chance em distancia e distancia em preco", () => {
    const d = distanciaParaChance(0.7, 0.0001, 30);
    expect(chanceSemToque(d, 0.0001, 30)).toBeCloseTo(0.7, 6);
    expect(alvoNaDistancia(100, 0.01, 1)).toBeCloseTo(101.005, 3);
    expect(alvoNaDistancia(100, 0.01, -1)).toBeCloseTo(99.005, 3);
    expect(distancia(100, 101)).toBeCloseTo(Math.log(1.01), 10);
  });

  it("faixa permitida evita alvo colado e alvo que pagaria menos que o minimo", () => {
    const faixa = faixaPermitida(0.0001, 30);
    expect(faixa.minima).toBeCloseTo(0.00002, 10);
    expect(multiplicador(faixa.maxima, 0.0001, 30)).toBeGreaterThanOrEqual(1.1);
    expect(multiplicador(faixa.maxima * 1.3, 0.0001, 30)).toBeLessThan(1.1);
  });

  it("usa a volatilidade do backend ou um padrao", () => {
    expect(volatilidade({ volatilidadePorSegundo: { BTCUSDT: 0.0002 } }, "BTCUSDT")).toBe(0.0002);
    expect(volatilidade({}, "ETHUSDT")).toBe(0.00008);
  });
});

describe("arena", () => {
  it("cada onda tem 3 animais, um do ceu e um do chao, e a ultima tem chefe", () => {
    for (let numero = 1; numero <= ONDAS; numero++) {
      for (const sorte of [0, 0.5, 0.999]) {
        const onda = sortearOnda(numero, () => sorte);
        expect(onda).toHaveLength(3);
        expect(onda.some((a) => a.lado === 1)).toBe(true);
        expect(onda.some((a) => a.lado === -1)).toBe(true);
        expect(onda.some((a) => a.chefe)).toBe(numero === ONDAS);
        expect(new Set(onda.map((a) => a.chave)).size).toBe(3);
      }
    }
  });

  it("primeira onda so tem bichos fracos e nenhum repetido", () => {
    for (const sorte of [0, 0.3, 0.6, 0.99]) {
      const onda = sortearOnda(1, () => sorte);
      expect(onda.every((a) => a.nivel <= 2)).toBe(true);
      expect(new Set(onda.map((a) => a.id)).size).toBe(3);
    }
  });

  it("bicho do ceu fica acima, do chao abaixo, e o mais forte paga mais", () => {
    const sigma = 0.0001;
    const [pardal, , , , aguia, jacare] = BESTIARIO;
    expect(alvoDoAnimal(pardal, 100, sigma)).toBeGreaterThan(100);
    expect(alvoDoAnimal(jacare, 100, sigma)).toBeLessThan(100);
    expect(premioDoAnimal(aguia, sigma)).toBeGreaterThan(premioDoAnimal(pardal, sigma));
    expect(premioDoAnimal(aguia, sigma)).toBeCloseTo(0.95 / 0.55, 1);
  });
});

describe("progresso do tigre", () => {
  const barreira = (status, multiplicador) => ({ tipo: "BARREIRA", status, multiplicador });

  it("ganha XP vencendo (mais com bicho forte) e um pouco perdendo", () => {
    const p = progressoDoTigre([
      barreira("GANHOU", 1.2),
      barreira("GANHOU", 3.5),
      barreira("PERDEU", 2),
      barreira("ABERTA", 2),
      { tipo: "ALTA", status: "GANHOU", multiplicador: 1.9 },
    ]);
    expect(p.xp).toBe(12 + 35 + 3);
    expect(p.vitorias).toBe(2);
    expect(p.derrotas).toBe(1);
    expect(p.maiorMultiplicador).toBe(3.5);
    expect(p.trofeus).toEqual({ bronze: 1, prata: 0, ouro: 1, lenda: 0 });
  });

  it("sobe de nivel pelas faixas de XP", () => {
    expect(xpParaNivel(1)).toBe(0);
    expect(xpParaNivel(2)).toBe(60);
    expect(progressoDoTigre([]).nivel).toBe(1);
    const p = progressoDoTigre([barreira("GANHOU", 7)]); // 70 XP
    expect(p.nivel).toBe(2);
    expect(p.titulo).toBe("Filhote");
    expect(p.faltam).toBe(180 - 70);
    expect(p.progresso).toBeCloseTo(10 / 120);
    expect(trofeuDe(6).id).toBe("lenda");
  });
});
