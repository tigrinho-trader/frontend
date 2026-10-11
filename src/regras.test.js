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
} from "./regras.js";

const [vilarejo, bosque, pico, real] = RANGES;
const pedido = (parcial) => ({ ...emptyQuiver(), ...parcial });

describe("valores dos pássaros", () => {
  it("multiplica o valor base pelo campo", () => {
    expect(birdValue(BIRD_TYPES.red, vilarejo)).toBe(4);
    expect(birdValue(BIRD_TYPES.gold, real)).toBe(375);
  });

  it("acerto = pássaro × flecha × combo", () => {
    expect(coinsForHit(BIRD_TYPES.red, vilarejo, ARROW_BY_ID.wood)).toBe(4);
    expect(coinsForHit(BIRD_TYPES.red, vilarejo, ARROW_BY_ID.gold)).toBe(22);
    expect(coinsForHit(BIRD_TYPES.red, vilarejo, ARROW_BY_ID.diamond)).toBe(48);
    expect(coinsForHit(BIRD_TYPES.red, vilarejo, ARROW_BY_ID.iron, 2)).toBe(20);
  });

  it("campos mais caros pagam mais pelo mesmo pássaro", () => {
    const valores = RANGES.map((r) => birdValue(BIRD_TYPES.red, r));
    expect(valores).toEqual([...valores].sort((a, b) => a - b));
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
});

describe("flechas", () => {
  it("custam o preço base do campo vezes o fator do tipo", () => {
    expect(arrowCost(ARROW_BY_ID.wood, vilarejo)).toBe(1);
    expect(arrowCost(ARROW_BY_ID.diamond, vilarejo)).toBe(8);
    expect(arrowCost(ARROW_BY_ID.gold, real)).toBe(80);
  });

  it("flechas melhores rendem mais moedas por moeda gasta", () => {
    const rendimento = ARROW_TYPES.map((t) => t.coins / t.price);
    for (let i = 1; i < rendimento.length; i++) expect(rendimento[i]).toBeGreaterThan(rendimento[i - 1]);
  });

  it("formata o multiplicador com vírgula", () => {
    expect(formatMult(2.5)).toBe("2,5");
    expect(formatMult(12)).toBe("12");
  });
});

describe("loja", () => {
  it("soma o custo do pedido e conta as flechas", () => {
    const p = pedido({ wood: 10, iron: 5, gold: 2, diamond: 1 });
    expect(countArrows(p)).toBe(18);
    expect(orderCost(p, vilarejo)).toBe(36);
  });

  it("só entra no campo quem paga entrada + 1 flecha", () => {
    expect(minCost(vilarejo)).toBe(6);
    expect(canEnter(6, vilarejo)).toBe(true);
    expect(canEnter(5, vilarejo)).toBe(false);
    expect(isBroke(5)).toBe(true);
    expect(isBroke(6)).toBe(false);
  });

  it("adiciona flechas só até onde o saldo deixa", () => {
    // saldo 20 no Bosque: entrada 15, sobra 5 → só 1 flecha de ferro (6) não cabe, 1 de madeira (3) cabe
    expect(changeOrder(pedido({}), bosque, 20, "iron", 1).iron).toBe(0);
    expect(changeOrder(pedido({}), bosque, 20, "wood", 5).wood).toBe(1);
  });

  it("respeita o limite da aljava", () => {
    const cheio = pedido({ wood: MAX_ARROWS });
    expect(changeOrder(cheio, vilarejo, 10_000, "wood", 5).wood).toBe(MAX_ARROWS);
  });

  it("remove flechas sem ficar negativo", () => {
    expect(changeOrder(pedido({ gold: 3 }), vilarejo, 100, "gold", -5).gold).toBe(0);
  });

  it("ajusta o pedido ao saldo cortando as mais caras primeiro", () => {
    const ajustado = fitOrder(pedido({ wood: 10, diamond: 5 }), pico, 150);
    // entrada 40 + 10 madeira (80) = 120; não sobra para nenhum diamante (64)
    expect(ajustado).toEqual(pedido({ wood: 10 }));
  });

  it("garante ao menos 1 flecha ao ajustar", () => {
    expect(fitOrder(pedido({ diamond: 3 }), vilarejo, 6)).toEqual(pedido({ wood: 1 }));
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
