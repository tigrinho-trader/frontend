import { describe, expect, it } from "vitest";
import {
  ARROW_BY_ID,
  ARROW_TYPES,
  BIRD_TYPES,
  MAX_ARROWS,
  RANGES,
  RANGE_BY_SLUG,
  arrowCost,
  arrowPosition,
  birdValue,
  canEnter,
  changeOrder,
  clamp,
  coinsForHit,
  countArrows,
  emptyQuiver,
  fitOrder,
  formatMult,
  isBroke,
  minCost,
  orderCost,
  pickBirdType,
  segmentHitsCircle,
  shade,
  tiposNoCampo,
} from "./regras.js";

const [vilarejo, bosque, pico, real] = RANGES;
const pedido = (parcial) => ({ ...emptyQuiver(), ...parcial });

describe("valores dos pássaros", () => {
  it("nenhum pássaro paga moedas: acertar é treino", () => {
    for (const b of Object.values(BIRD_TYPES)) {
      for (const r of RANGES) expect(birdValue(b, r)).toBe(0);
    }
    for (const t of ARROW_TYPES) expect(coinsForHit(BIRD_TYPES.gold, real, t, 3)).toBe(0);
  });
});

describe("campos de tiro", () => {
  it("têm os slugs usados pela API do trading-service", () => {
    expect(RANGES.map((r) => r.slug)).toEqual(["vilarejo", "bosque", "pico", "reserva-real"]);
  });

  it("acha o campo pelo slug", () => {
    expect(RANGE_BY_SLUG.pico).toBe(pico);
    expect(RANGE_BY_SLUG["reserva-real"]).toBe(real);
  });

  it("espelham entrada, flecha e multiplicador do contrato do servidor", () => {
    expect(RANGES.map((r) => [r.fee, r.arrowPrice, r.mult])).toEqual([[5, 1, 2], [15, 3, 4], [40, 8, 10], [100, 20, 25]]);
  });

  it("campos mais caros têm mais criptomoedas", () => {
    expect(RANGES.map((r) => r.ativos)).toEqual([["btc"], ["btc", "eth"], ["btc", "eth", "ouro", "v100"], ["btc", "eth", "ouro", "v100"]]);
  });

  it("no campo aparecem a madeira e as flechas das criptos dele", () => {
    expect(tiposNoCampo(vilarejo).map((t) => t.id)).toEqual(["wood", "btc"]);
    expect(ARROW_TYPES.map((t) => t.id)).toEqual(["wood", "btc", "eth", "ouro", "v100"]);   // ferro, ouro e diamante saíram
    expect(tiposNoCampo(bosque).map((t) => t.id)).toEqual(["wood", "btc", "eth"]);
    expect(tiposNoCampo(pico).map((t) => t.id)).toEqual(["wood", "btc", "eth", "ouro", "v100"]);
    expect(tiposNoCampo(null).map((t) => t.id)).toEqual(["wood"]);
  });
});

describe("flechas", () => {
  it("a madeira é grátis; as de mercado custam a aposta", () => {
    for (const r of RANGES) {
      expect(arrowCost(ARROW_BY_ID.wood, r)).toBe(0);
      expect(arrowCost(ARROW_BY_ID.btc, r)).toBe(100);
    }
  });

  it("formata o multiplicador com vírgula", () => {
    expect(formatMult(2.5)).toBe("2,5");
    expect(formatMult(12)).toBe("12");
  });
});

describe("loja", () => {
  it("soma o custo do pedido e conta as flechas", () => {
    const p = pedido({ wood: 10, btc: 2 });
    expect(countArrows(p)).toBe(12);
    expect(orderCost(p, vilarejo)).toBe(200);
  });

  it("para entrar no campo basta pagar a entrada", () => {
    expect(minCost(vilarejo)).toBe(5);
    expect(canEnter(5, vilarejo)).toBe(true);
    expect(canEnter(4, vilarejo)).toBe(false);
    expect(isBroke(4)).toBe(true);
    expect(isBroke(5)).toBe(false);
  });

  it("adiciona flechas só até onde o saldo deixa", () => {
    // saldo 110 no Bosque: entrada 15, sobra 95 → a de bitcoin (100) não cabe; madeira é grátis
    expect(changeOrder(pedido({}), bosque, 110, "btc", 1).btc).toBe(0);
    expect(changeOrder(pedido({}), bosque, 115, "btc", 1).btc).toBe(1);
    expect(changeOrder(pedido({}), bosque, 20, "wood", 5).wood).toBe(5);
  });

  it("respeita o limite da aljava", () => {
    const cheio = pedido({ wood: MAX_ARROWS });
    expect(changeOrder(cheio, vilarejo, 10_000, "wood", 5).wood).toBe(MAX_ARROWS);
  });

  it("remove flechas sem ficar negativo", () => {
    expect(changeOrder(pedido({ btc: 3 }), vilarejo, 1000, "btc", -5).btc).toBe(0);
  });

  it("ajusta o pedido ao saldo cortando as mais caras primeiro", () => {
    const ajustado = fitOrder(pedido({ wood: 10, btc: 1, eth: 1 }), pico, 150);
    // entrada 40 + 10 madeira (grátis) = 40; sobra 110: cabe só uma aposta de 100
    expect(countArrows(ajustado)).toBe(11);
    expect(ajustado.wood).toBe(10);
  });

  it("corta pelo custo no campo: a flecha de mercado (100 moedas) sai primeiro no vilarejo", () => {
    // vilarejo: entrada 5; bitcoin 100, madeira 1. Com 60 não cabe a de bitcoin
    expect(fitOrder(pedido({ wood: 5, btc: 1 }), vilarejo, 60)).toEqual(pedido({ wood: 5 }));
    expect(fitOrder(pedido({ wood: 5, btc: 1 }), vilarejo, 110)).toEqual(pedido({ wood: 5, btc: 1 }));
  });

  it("com flechas guardadas não precisa comprar nenhuma, e elas contam no limite da aljava", () => {
    expect(fitOrder(pedido({}), vilarejo, 100, 3)).toEqual(pedido({}));
    expect(fitOrder(pedido({}), vilarejo, 100, 0)).toEqual(pedido({ wood: 1 }));
    expect(changeOrder(pedido({}), vilarejo, 1000, "wood", 5, MAX_ARROWS - 2).wood).toBe(2);
  });

  it("garante ao menos 1 flecha ao ajustar", () => {
    expect(fitOrder(pedido({ btc: 3 }), vilarejo, 6)).toEqual(pedido({ wood: 1 }));
  });
});

describe("sorteio dos pássaros", () => {
  it("segue os pesos do campo", () => {
    const pool = { red: 1, gold: 3 };
    expect(pickBirdType(pool, () => 0.1)).toBe("red");
    expect(pickBirdType(pool, () => 0.9)).toBe("gold");
  });

  it("nunca sorteia tipo com peso zero", () => {
    for (let i = 0; i < 200; i++) expect(pickBirdType(vilarejo.pool)).not.toBe("blue");
  });
});

describe("física", () => {
  it("detecta a flecha atravessando o pássaro entre dois quadros", () => {
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 5, 10)).toBe(true);
    expect(segmentHitsCircle(0, 0, 100, 0, 50, 30, 10)).toBe(false);
    expect(segmentHitsCircle(0, 0, 0, 0, 3, 4, 5)).toBe(true);
  });

  it("calcula a parábola da flecha", () => {
    expect(arrowPosition(0, 0, 100, -100, 900, 1)).toEqual({ x: 100, y: 350 });
  });

  it("clamp e shade", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(shade("#000000", 1)).toBe("rgb(255,255,255)");
    expect(shade("#ffffff", -1)).toBe("rgb(0,0,0)");
  });
});
