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
  NIVEIS_FLECHA,
  VALOR_FLECHA_PADRAO,
  chaveLote,
  comunsDoPedido,
  espacosDaAljava,
  lerValorFlecha,
  lotesDaSessao,
  mercadoDoPedido,
  nivelAnterior,
  nivelDoValor,
  nomeDoValor,
  proximoNivel,
  seloDoValor,
  textoDevolucao,
  visualDoValor,
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
    expect(RANGES.map((r) => [r.fee, r.arrowPrice, r.mult])).toEqual([[0.5, 1, 2], [1.5, 3, 4], [4, 8, 10], [10, 20, 25]]);
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
  it("a madeira é grátis; as de mercado custam o valor escolhido para a flecha (padrão 10)", () => {
    for (const r of RANGES) {
      expect(arrowCost(ARROW_BY_ID.wood, r)).toBe(0);
      expect(arrowCost(ARROW_BY_ID.btc, r)).toBe(VALOR_FLECHA_PADRAO);
      expect(arrowCost(ARROW_BY_ID.btc, r, { btc: 20 })).toBe(20);
      expect(arrowCost(ARROW_BY_ID.eth, r, { btc: 20 })).toBe(10);
    }
    expect(VALOR_FLECHA_PADRAO).toBe(10);
    for (const t of ARROW_TYPES.filter((x) => x.mercado)) expect(t.precoFixo).toBeNull();
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
    expect(orderCost(p, vilarejo)).toBe(20);
    expect(orderCost(p, vilarejo, { btc: 12.5 })).toBe(25);
    expect(orderCost(pedido({ btc: 3 }), vilarejo, { btc: 0.1 })).toBe(0.3);   // sem erro de arredondamento
  });

  it("para entrar no campo basta pagar a entrada", () => {
    expect(minCost(vilarejo)).toBe(0.5);
    expect(canEnter(0.5, vilarejo)).toBe(true);
    expect(canEnter(0.49, vilarejo)).toBe(false);
    expect(canEnter(0.7 - 0.2, vilarejo)).toBe(true);        // 0,49999999999999994: conta em centavos
    expect(isBroke(0.49)).toBe(true);
    expect(isBroke(0.5)).toBe(false);
    expect(minCost(real)).toBe(10);
  });

  it("entrada com centavos soma certo com as flechas: 0,5 + 3 × 10 = 30,5", () => {
    const tres = pedido({ btc: 3 });
    expect(vilarejo.fee + orderCost(tres, vilarejo)).toBe(30.5);
    expect(changeOrder(pedido({}), vilarejo, 30.5, "btc", 5).btc).toBe(3);
    expect(changeOrder(pedido({}), vilarejo, 30.49, "btc", 5).btc).toBe(2);
    expect(fitOrder(tres, vilarejo, 30.5)).toEqual(tres);
    expect(fitOrder(pedido({ btc: 3 }), bosque, 0.1 + 0.2 + 31.2)).toEqual(pedido({ btc: 3 }));   // 1,5 + 30 = 31,5
  });

  it("adiciona flechas só até onde o saldo deixa", () => {
    // saldo 11,49 no Bosque: entrada 1,5, sobra 9,99 → a de bitcoin (10) não cabe; madeira é grátis
    expect(changeOrder(pedido({}), bosque, 11.49, "btc", 1).btc).toBe(0);
    expect(changeOrder(pedido({}), bosque, 11.5, "btc", 1).btc).toBe(1);
    expect(changeOrder(pedido({}), bosque, 2, "wood", 5).wood).toBe(5);
    // com o Nível 3 (30 moedas) cada flecha pede mais saldo
    expect(changeOrder(pedido({}), bosque, 31.49, "btc", 1, 0, { btc: 30 }).btc).toBe(0);
    expect(changeOrder(pedido({}), bosque, 91.5, "btc", 5, 0, { btc: 30 }).btc).toBe(3);
  });

  it("respeita o limite da aljava", () => {
    const cheio = pedido({ wood: MAX_ARROWS });
    expect(changeOrder(cheio, vilarejo, 10_000, "wood", 5).wood).toBe(MAX_ARROWS);
  });

  it("remove flechas sem ficar negativo", () => {
    expect(changeOrder(pedido({ btc: 3 }), vilarejo, 1000, "btc", -5).btc).toBe(0);
  });

  it("ajusta o pedido ao saldo cortando as mais caras primeiro", () => {
    const ajustado = fitOrder(pedido({ wood: 10, btc: 1, eth: 1 }), pico, 18);
    // entrada 4 + 10 madeira (grátis) = 4; sobra 14: cabe só uma flecha de mercado de 10
    expect(countArrows(ajustado)).toBe(11);
    expect(ajustado.wood).toBe(10);
    // com valores diferentes, sai primeiro a mais cara
    expect(fitOrder(pedido({ btc: 1, eth: 1 }), pico, 30, 0, { btc: 30, eth: 20 })).toEqual(pedido({ eth: 1 }));
  });

  it("corta pelo custo no campo: a flecha de mercado sai primeiro no vilarejo", () => {
    // vilarejo: entrada 0,5; bitcoin 10, madeira grátis. Com 10,49 não cabe a de bitcoin
    expect(fitOrder(pedido({ wood: 5, btc: 1 }), vilarejo, 10.49)).toEqual(pedido({ wood: 5 }));
    expect(fitOrder(pedido({ wood: 5, btc: 1 }), vilarejo, 10.5)).toEqual(pedido({ wood: 5, btc: 1 }));
    expect(fitOrder(pedido({ wood: 5, btc: 1 }), vilarejo, 30.49, 0, { btc: 30 })).toEqual(pedido({ wood: 5 }));
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

describe("valor das flechas de mercado", () => {
  it("níveis 10, 20 e 30; outro valor é personalizado", () => {
    expect(NIVEIS_FLECHA).toEqual([10, 20, 30]);
    expect([10, 20, 30, 15, 0.5, 100].map((v) => nivelDoValor(v))).toEqual([1, 2, 3, 0, 0, 0]);
    expect(seloDoValor(20)).toBe("N2");
    expect(seloDoValor(12.5)).toBe("12,5");
    expect(nomeDoValor(30)).toBe("Nível 3 · 30 moedas");
    expect(nomeDoValor(15)).toBe("Personalizado · 15 moedas");
    expect(nomeDoValor(1)).toBe("Personalizado · 1 moeda");
  });

  it("aparência mais forte conforme o valor; personalizado acima de 30 usa a do nível 3", () => {
    expect([1, 10, 19.99, 20, 29, 30, 31, 500].map((v) => visualDoValor(v))).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
  });

  it("upgrade e rebaixar andam pelos níveis, inclusive a partir de um valor personalizado", () => {
    expect(proximoNivel(10)).toBe(20);
    expect(proximoNivel(20)).toBe(30);
    expect(proximoNivel(30)).toBeNull();
    expect(proximoNivel(45)).toBeNull();
    expect(proximoNivel(5)).toBe(10);
    expect(proximoNivel(15)).toBe(20);
    expect(nivelAnterior(30)).toBe(20);
    expect(nivelAnterior(10)).toBeNull();
    expect(nivelAnterior(5)).toBeNull();
    expect(nivelAnterior(45)).toBe(30);
  });

  it("valor personalizado: mínimo 1, até 2 casas decimais, sem passar do saldo", () => {
    expect(lerValorFlecha("15")).toEqual({ valor: 15 });
    expect(lerValorFlecha(" 12,50 ")).toEqual({ valor: 12.5 });
    expect(lerValorFlecha("1")).toEqual({ valor: 1 });
    expect(lerValorFlecha("1000000")).toEqual({ valor: 1000000 });            // sem teto
    expect(lerValorFlecha("0,99").erro).toBe("O valor mínimo é 1 moeda.");
    expect(lerValorFlecha("1,234").erro).toBe("Use no máximo 2 casas decimais.");
    expect(lerValorFlecha("abc").erro).toContain("Digite um número");
    expect(lerValorFlecha("-5").erro).toContain("Digite um número");
    expect(lerValorFlecha("").erro).toBe("Digite o valor da flecha.");
    expect(lerValorFlecha("50", { maximo: 40 }).erro).toBe("Acima do seu saldo (40 moedas).");
    expect(lerValorFlecha("40", { maximo: 40 })).toEqual({ valor: 40 });
  });
});

describe("lotes de flechas de mercado", () => {
  it("o pedido da loja vira flechas comuns e lotes de mercado (tipo + valor)", () => {
    const p = pedido({ wood: 10, btc: 3, eth: 0, ouro: 2 });
    expect(comunsDoPedido(p)).toEqual({ wood: 10 });
    expect(mercadoDoPedido(p, { btc: 20, ouro: 12.5 })).toEqual([
      { flecha: "btc", valor: 20, quantidade: 3 },
      { flecha: "ouro", valor: 12.5, quantidade: 2 },
    ]);
    expect(mercadoDoPedido(pedido({ btc: 1 }))).toEqual([{ flecha: "btc", valor: 10, quantidade: 1 }]);
    expect(mercadoDoPedido(pedido({ wood: 5 }))).toEqual([]);
  });

  it("lotes da sessão: soma repetidos e tira os vazios; servidor antigo vira um lote de 10 por tipo", () => {
    expect(lotesDaSessao({ mercado: [
      { flecha: "btc", valor: 10, quantidade: 2 },
      { flecha: "btc", valor: 30, quantidade: 1 },
      { flecha: "btc", valor: "10", quantidade: 1 },
      { flecha: "eth", valor: 20, quantidade: 0 },
      { flecha: "wood", valor: 1, quantidade: 4 },
    ] })).toEqual([
      { flecha: "btc", valor: 10, quantidade: 3 },
      { flecha: "btc", valor: 30, quantidade: 1 },
    ]);
    expect(lotesDaSessao({ flechas: { wood: 3, btc: 2 } })).toEqual([{ flecha: "btc", valor: 10, quantidade: 2 }]);
    expect(lotesDaSessao(null)).toEqual([]);
    expect(chaveLote("btc", 20)).toBe("btc@20");
    expect(chaveLote("wood")).toBe("wood");
  });

  it("espaços da aljava: madeira e um por lote, em fila do maior valor para o menor; tipo sem lote fica vazio", () => {
    const quiver = pedido({ wood: 4, btc: 3, eth: 0 });
    const lotes = [
      { flecha: "btc", valor: 10, quantidade: 2 },
      { flecha: "btc", valor: 30, quantidade: 1 },
      { flecha: "btc", valor: 12.5, quantidade: 1 },
    ];
    expect(espacosDaAljava(bosque, quiver, lotes)).toEqual([
      { chave: "wood", id: "wood", valor: null, n: 4 },
      { chave: "btc@30", id: "btc", valor: 30, n: 1 },
      { chave: "btc@12.5", id: "btc", valor: 12.5, n: 1 },
      { chave: "btc@10", id: "btc", valor: 10, n: 2 },
      { chave: "eth", id: "eth", valor: null, n: 0 },
    ]);
    // o vilarejo só tem bitcoin
    expect(espacosDaAljava(vilarejo, quiver, [{ flecha: "eth", valor: 10, quantidade: 1 }]).map((e) => e.chave))
      .toEqual(["wood", "btc"]);
  });

  it("linha da devolução das flechas não usadas ao sair do campo", () => {
    expect(textoDevolucao({ quantidade: 3, valorBruto: 60, taxa: 0.12, valorDevolvido: 59.88 }))
      .toBe("Flechas devolvidas: 3 · +59,88 moedas (taxa 0,12)");
    expect(textoDevolucao({ quantidade: 0, valorBruto: 0, taxa: 0, valorDevolvido: 0 })).toBe("");
    expect(textoDevolucao(null)).toBe("");
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
