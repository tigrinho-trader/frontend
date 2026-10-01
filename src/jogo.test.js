import { describe, expect, it } from "vitest";
import {
  anguloRoleta,
  avancarEscada,
  fatiasRoleta,
  formatarFichas,
  formatarPreco,
  multiplicador,
  nomeAtivo,
  novaEscada,
  premiosEscada,
  resultadoEscada,
  sacarEscada,
  segundosRestantes,
  sequenciaVitorias,
  situacaoParcial,
  sortearFatia,
  variacaoPercentual,
} from "./jogo.js";

// mesmo formato de GET /api/ordens/regras
const FACIL = {
  modo: "FACIL",
  multiplicadorDirecional: 1.5,
  multiplicadorLateral: 1.8,
  movimentoMinimoPercentual: 0,
  toleranciaLateralPercentual: 0.1,
};
const INSANO = {
  modo: "INSANO",
  multiplicadorDirecional: 4,
  multiplicadorLateral: 6,
  movimentoMinimoPercentual: 0.02,
  toleranciaLateralPercentual: 0.01,
};

describe("formatacao", () => {
  it("formata fichas e precos no padrao brasileiro", () => {
    expect(formatarFichas(1234.5)).toBe("1.234,50");
    expect(formatarFichas("abc")).toBe("0,00");
    expect(formatarPreco(83586.08)).toBe("83.586,08");
    expect(formatarPreco(118.25)).toBe("118,2500");
    expect(formatarPreco(0.123456)).toBe("0,123456");
    expect(nomeAtivo("BTCUSDT")).toBe("BTC");
  });

  it("calcula variacao percentual e segundos restantes", () => {
    expect(variacaoPercentual(100, 101)).toBeCloseTo(1);
    expect(variacaoPercentual(0, 5)).toBe(0);
    const agora = Date.parse("2026-09-30T12:00:00Z");
    expect(segundosRestantes("2026-09-30T12:00:10.2Z", agora)).toBe(11);
    expect(segundosRestantes("2026-09-30T11:59:00Z", agora)).toBe(0);
  });
});

describe("situacao parcial da rodada (mesma regra do trading-service)", () => {
  it("no FACIL qualquer movimento decide e preco igual empata", () => {
    expect(situacaoParcial("ALTA", FACIL, 100, 100.001)).toBe("GANHOU");
    expect(situacaoParcial("BAIXA", FACIL, 100, 100.001)).toBe("PERDEU");
    expect(situacaoParcial("ALTA", FACIL, 100, 100)).toBe("EMPATOU");
    expect(situacaoParcial("LATERAL", FACIL, 100, 100.1)).toBe("GANHOU");
    expect(situacaoParcial("LATERAL", FACIL, 100, 100.11)).toBe("PERDEU");
  });

  it("no INSANO precisa andar 0,02% e o LATERAL so tolera 0,01%", () => {
    expect(situacaoParcial("ALTA", INSANO, 100, 100.02)).toBe("GANHOU");
    expect(situacaoParcial("ALTA", INSANO, 100, 100.019)).toBe("PERDEU");
    expect(situacaoParcial("BAIXA", INSANO, 100, 99.98)).toBe("GANHOU");
    expect(situacaoParcial("ALTA", INSANO, 100, 100)).toBe("PERDEU");
    expect(situacaoParcial("LATERAL", INSANO, 100, 99.98)).toBe("PERDEU");
  });

  it("sem regra ou sem preco ainda fica neutro", () => {
    expect(situacaoParcial("ALTA", null, 100, 101)).toBe("EMPATOU");
    expect(situacaoParcial("ALTA", FACIL, 100, undefined)).toBe("EMPATOU");
  });

  it("escolhe o multiplicador pelo tipo", () => {
    expect(multiplicador(INSANO, "ALTA")).toBe(4);
    expect(multiplicador(INSANO, "LATERAL")).toBe(6);
    expect(multiplicador(undefined, "ALTA")).toBe(0);
  });
});

describe("sequencia de vitorias", () => {
  it("conta acertos seguidos a partir da rodada mais recente, ignorando abertas e empates", () => {
    const ordens = ["ABERTA", "GANHOU", "EMPATOU", "GANHOU", "PERDEU", "GANHOU"].map((status) => ({ status }));
    expect(sequenciaVitorias(ordens)).toBe(2);
    expect(sequenciaVitorias([{ status: "PERDEU" }])).toBe(0);
    expect(sequenciaVitorias([])).toBe(0);
  });
});

describe("roleta do tigre", () => {
  it("tem uma fatia por ativo e tipo de aposta", () => {
    const fatias = fatiasRoleta(["BTCUSDT", "ETHUSDT"]);
    expect(fatias).toHaveLength(6);
    expect(fatias[0]).toEqual({ simbolo: "BTCUSDT", tipo: "ALTA" });
  });

  it("sorteia dentro do intervalo, inclusive no limite", () => {
    expect(sortearFatia(9, () => 0)).toBe(0);
    expect(sortearFatia(9, () => 0.5)).toBe(4);
    expect(sortearFatia(9, () => 0.9999999)).toBe(8);
  });

  it("para a fatia sorteada debaixo do ponteiro, sempre girando pra frente", () => {
    const total = 9;
    for (const indice of [0, 4, 8]) {
      const angulo = anguloRoleta(indice, total, 1234);
      expect(angulo).toBeGreaterThan(1234 + 4 * 360);
      // centro da fatia + rotacao final = multiplo de 360 (topo)
      const centro = indice * (360 / total) + 360 / total / 2;
      expect((((angulo + centro) % 360) + 360) % 360).toBeCloseTo(0);
    }
  });
});

describe("escada", () => {
  const ganhou = (valorPago) => ({ status: "GANHOU", valorPago });

  it("vitoria sobe e o premio vira a proxima aposta, respeitando o maximo", () => {
    let escada = novaEscada(10);
    escada = avancarEscada(escada, ganhou(19));
    expect(escada.valorAtual).toBe(19);
    expect(escada.fim).toBeNull();
    escada = avancarEscada(escada, ganhou(12000), 10000);
    expect(escada.valorAtual).toBe(10000);
  });

  it("empate repete o degrau e derrota derruba", () => {
    let escada = avancarEscada(novaEscada(10), ganhou(19));
    escada = avancarEscada(escada, { status: "EMPATOU", valorPago: 19 });
    expect(escada.valorAtual).toBe(19);
    expect(escada.fim).toBeNull();
    escada = avancarEscada(escada, { status: "PERDEU", valorPago: 0 });
    expect(escada.fim).toBe("CAIU");
    expect(resultadoEscada(escada)).toBe(-10);
  });

  it("no FACIL a queda devolve metade da ultima aposta", () => {
    let escada = avancarEscada(novaEscada(10), ganhou(15));
    escada = avancarEscada(escada, { status: "PERDEU", valorPago: 7.5 });
    expect(resultadoEscada(escada)).toBe(-2.5);
  });

  it("chega no topo depois de 5 acertos e da pra sacar antes", () => {
    let escada = novaEscada(10);
    for (const premio of [19, 36.1, 68.59, 130.32, 247.61]) escada = avancarEscada(escada, ganhou(premio));
    expect(escada.fim).toBe("TOPO");
    expect(resultadoEscada(escada)).toBeCloseTo(237.61);

    const sacou = sacarEscada(avancarEscada(novaEscada(10), ganhou(19)));
    expect(sacou.fim).toBe("SACOU");
    expect(resultadoEscada(sacou)).toBe(9);
  });

  it("mostra o premio de cada degrau", () => {
    expect(premiosEscada(10, 2)).toEqual([20, 40, 80, 160, 320]);
    expect(premiosEscada(10, 2, 50)).toEqual([20, 40, 80, 100, 100]);
  });
});
