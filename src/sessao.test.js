import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErroApi } from "./api.js";
import { INTERVALO_MINIMO_MS, criarControladorSessao } from "./sessao.js";

const ID = "6f1c2a3b-0000-4000-8000-000000000001";

function sessaoBase(extra = {}) {
  return {
    id: ID,
    campo: "vilarejo",
    status: "ABERTA",
    custo: 15,
    ganhos: 0,
    resultado: -15,
    flechas: { wood: 10 },
    compradas: { wood: 10 },
    disparadas: { wood: 0 },
    acertos: 0,
    ...extra,
  };
}

/** API falsa que simula o servidor: desconta a flecha e soma 4 moedas por pássaro. */
function apiFalsa() {
  let atual = sessaoBase();
  const chamadas = [];
  const api = {
    chamadas,
    abrirSessao: vi.fn(async (campo, flechas, mercado = []) => {
      atual = sessaoBase({ campo, flechas: { ...flechas }, compradas: { ...flechas }, mercado: [...mercado] });
      return atual;
    }),
    registrarTiro: vi.fn(async (id, flecha, acertos) => {
      chamadas.push({ t: Date.now(), flecha, acertos });
      const ganhosTiro = acertos.length * 4;
      atual = {
        ...atual,
        ganhos: atual.ganhos + ganhosTiro,
        flechas: { ...atual.flechas, [flecha]: atual.flechas[flecha] - 1 },
        acertos: atual.acertos + acertos.length,
      };
      return { ganhosTiro, sessao: atual };
    }),
    comprarFlechas: vi.fn(async (id, flecha, quantidade, valor) => {
      atual = {
        ...atual,
        custo: atual.custo + quantidade * (valor ?? 1),
        flechas: { ...atual.flechas, [flecha]: (atual.flechas[flecha] || 0) + quantidade },
        compradas: { ...atual.compradas, [flecha]: (atual.compradas[flecha] || 0) + quantidade },
        mercado: valor === undefined ? atual.mercado : [...(atual.mercado || []), { flecha, valor, quantidade }],
      };
      return atual;
    }),
    encerrarSessao: vi.fn(async () => {
      atual = { ...atual, status: "ENCERRADA", resultado: atual.ganhos - atual.custo };
      return atual;
    }),
  };
  return api;
}

describe("controlador de sessão", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function aberto(opcoes = {}) {
    const api = apiFalsa();
    const aoAtualizar = vi.fn();
    const aoErro = vi.fn();
    const ctl = criarControladorSessao({ api, aoAtualizar, aoErro, ...opcoes });
    await ctl.abrir("vilarejo", { wood: 10 });
    return { api, ctl, aoAtualizar, aoErro };
  }

  it("abre a sessão e expõe o estado do servidor", async () => {
    const { api, ctl, aoAtualizar } = await aberto();
    expect(api.abrirSessao).toHaveBeenCalledWith("vilarejo", { wood: 10 }, []);
    expect(ctl.aberta()).toBe(true);
    expect(ctl.sessao().id).toBe(ID);
    expect(aoAtualizar).toHaveBeenCalledTimes(1);
    expect(ctl.estado()).toMatchObject({ id: ID, custo: 15, ganhos: 0, ganhosServidor: 0, pendentes: 0, flechas: { wood: 10 } });
  });

  it("sem sessão: estado é null e não está aberta", () => {
    const ctl = criarControladorSessao({ api: apiFalsa() });
    expect(ctl.estado()).toBeNull();
    expect(ctl.aberta()).toBe(false);
  });

  it("envia os tiros na ordem, com pelo menos 160 ms entre eles", async () => {
    const { api, ctl } = await aberto();
    const p1 = ctl.registrarTiro("wood", ["red"], 4);
    const p2 = ctl.registrarTiro("wood", [], 0);
    const p3 = ctl.registrarTiro("wood", ["big", "red"], 12);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([p1, p2, p3]);

    expect(api.chamadas.map((c) => c.acertos)).toEqual([["red"], [], ["big", "red"]]);
    for (let i = 1; i < api.chamadas.length; i++) {
      expect(api.chamadas[i].t - api.chamadas[i - 1].t).toBeGreaterThanOrEqual(INTERVALO_MINIMO_MS);
    }
    expect(INTERVALO_MINIMO_MS).toBeGreaterThanOrEqual(160);
  });

  it("não espera se o tiro anterior foi há mais de 160 ms", async () => {
    const { api, ctl } = await aberto();
    await ctl.registrarTiro("wood", ["red"]);
    vi.advanceTimersByTime(500);
    const antes = Date.now();
    await ctl.registrarTiro("wood", []);
    expect(api.chamadas[1].t).toBe(antes);
  });

  it("o segundo tiro só sai depois do intervalo", async () => {
    const { api, ctl } = await aberto();
    await ctl.registrarTiro("wood", ["red"]);
    ctl.registrarTiro("wood", ["red"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.registrarTiro).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(api.registrarTiro).toHaveBeenCalledTimes(2);
  });

  it("reconcilia: estimativas valem só até a resposta; depois manda o servidor", async () => {
    const { ctl, aoAtualizar } = await aberto();
    const p = ctl.registrarTiro("wood", ["red"], 999);   // estimativa local errada
    // antes da resposta: ganhos e flechas incluem o tiro na fila
    expect(ctl.estado()).toMatchObject({ ganhos: 999, ganhosServidor: 0, pendentes: 1, flechas: { wood: 9 } });
    await p;
    // servidor diz 4 moedas: o valor dele substitui a estimativa
    expect(ctl.estado()).toMatchObject({ ganhos: 4, ganhosServidor: 4, pendentes: 0, flechas: { wood: 9 }, acertos: 1 });
    expect(aoAtualizar).toHaveBeenLastCalledWith(expect.objectContaining({ ganhos: 4 }), 4);
  });

  it("tiro recusado chama aoErro, sai da fila e devolve o HUD ao servidor", async () => {
    const { api, ctl, aoErro, aoAtualizar } = await aberto();
    api.registrarTiro.mockRejectedValueOnce(new ErroApi(422, "Pássaro inválido"));
    const r = await ctl.registrarTiro("wood", ["blue"], 10);
    expect(r).toBeNull();
    expect(aoErro).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }), { tipo: "tiro", flecha: "wood", acertos: ["blue"] });
    expect(ctl.estado()).toMatchObject({ ganhos: 0, pendentes: 0, flechas: { wood: 10 } });
    expect(aoAtualizar).toHaveBeenCalledTimes(2);
    // a fila continua andando
    await vi.advanceTimersByTimeAsync(200);
    expect(await ctl.registrarTiro("wood", ["red"], 4)).toMatchObject({ ganhosTiro: 4 });
  });

  it("429 espera e tenta de novo", async () => {
    const { api, ctl, aoErro } = await aberto();
    api.registrarTiro.mockRejectedValueOnce(new ErroApi(429, "Muito rápido"));
    const p = ctl.registrarTiro("wood", ["red"], 4);
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toMatchObject({ ganhosTiro: 4 });
    expect(api.registrarTiro).toHaveBeenCalledTimes(2);
    expect(aoErro).not.toHaveBeenCalled();
  });

  it("429 repetido desiste depois de algumas tentativas", async () => {
    const { api, ctl, aoErro } = await aberto();
    api.registrarTiro.mockRejectedValue(new ErroApi(429, "Muito rápido"));
    const p = ctl.registrarTiro("wood", ["red"], 4);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBeNull();
    expect(api.registrarTiro).toHaveBeenCalledTimes(3);
    expect(aoErro).toHaveBeenCalledTimes(1);
  });

  it("compra de flechas vai depois dos tiros na fila", async () => {
    const { api, ctl } = await aberto();
    const ordem = [];
    api.registrarTiro.mockImplementation(async () => {
      ordem.push("tiro");
      return { ganhosTiro: 0, sessao: sessaoBase({ flechas: { wood: 0 } }) };
    });
    api.comprarFlechas.mockImplementation(async () => {
      ordem.push("compra");
      return sessaoBase({ custo: 20, flechas: { wood: 0, btc: 5 } });
    });
    const tiro = ctl.registrarTiro("wood", []);
    const compra = ctl.comprar("btc", 5);
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([tiro, compra]);
    expect(ordem).toEqual(["tiro", "compra"]);
    expect(api.comprarFlechas).toHaveBeenCalledWith(ID, "btc", 5);
    expect(ctl.estado()).toMatchObject({ custo: 20, flechas: { btc: 5 } });
  });

  it("compra recusada rejeita com o ErroApi e não trava a fila", async () => {
    const { api, ctl } = await aberto();
    api.comprarFlechas.mockRejectedValueOnce(new ErroApi(422, "Saldo insuficiente"));
    await expect(ctl.comprar("gold", 5)).rejects.toMatchObject({ status: 422 });
    await expect(ctl.encerrar()).resolves.toMatchObject({ status: "ENCERRADA" });
  });

  it("encerrar espera os tiros pendentes e devolve o resultado final", async () => {
    const { api, ctl } = await aberto();
    ctl.registrarTiro("wood", ["red"], 4);
    ctl.registrarTiro("wood", ["red", "red"], 12);
    const fim = ctl.encerrar();
    await vi.advanceTimersByTimeAsync(1000);
    const final = await fim;
    expect(api.registrarTiro).toHaveBeenCalledTimes(2);
    expect(api.encerrarSessao).toHaveBeenCalledWith(ID);
    expect(final).toMatchObject({ status: "ENCERRADA", ganhos: 12, resultado: -3 });
    expect(ctl.aberta()).toBe(false);
    await expect(ctl.ocioso()).resolves.toBeUndefined();
  });

  it("encerrar sem sessão falha", async () => {
    const ctl = criarControladorSessao({ api: apiFalsa() });
    await expect(ctl.encerrar()).rejects.toThrow("Nenhuma sessão aberta");
  });

  it("retomar usa uma sessão existente", () => {
    const aoAtualizar = vi.fn();
    const ctl = criarControladorSessao({ api: apiFalsa(), aoAtualizar });
    ctl.retomar(sessaoBase({ ganhos: "30", custo: "15" }));
    expect(ctl.estado()).toMatchObject({ ganhos: 30, custo: 15 });
    expect(aoAtualizar).toHaveBeenCalledTimes(1);
  });

  it("aceita relógio e espera injetados", async () => {
    let agora = 1000;
    const esperas = [];
    const api = apiFalsa();
    const ctl = criarControladorSessao({
      api,
      agora: () => agora,
      esperar: async (ms) => { esperas.push(ms); agora += ms; },
    });
    await ctl.abrir("bosque", { wood: 3 });
    await ctl.registrarTiro("wood", []);
    agora += 60;
    await ctl.registrarTiro("wood", []);
    expect(esperas).toEqual([INTERVALO_MINIMO_MS - 60]);
    expect(ctl.pendentes()).toBe(0);
  });
});

describe("lotes de flechas de mercado", () => {
  it("abre com os lotes (tipo + valor) e o estado expõe os lotes restantes", async () => {
    const api = apiFalsa();
    const ctl = criarControladorSessao({ api });
    const mercado = [{ flecha: "btc", valor: 20, quantidade: 3 }, { flecha: "btc", valor: 10, quantidade: 1 }];
    await ctl.abrir("bosque", { wood: 5 }, mercado);
    expect(api.abrirSessao).toHaveBeenCalledWith("bosque", { wood: 5 }, mercado);
    expect(ctl.estado().mercado).toEqual(mercado);
  });

  it("compra durante a rodada manda o valor só nas flechas de mercado", async () => {
    const api = apiFalsa();
    const ctl = criarControladorSessao({ api });
    await ctl.abrir("vilarejo", { wood: 1 });
    await ctl.comprar("btc", 4, 30);
    expect(api.comprarFlechas).toHaveBeenLastCalledWith(ID, "btc", 4, 30);
    expect(ctl.estado().mercado).toEqual([{ flecha: "btc", valor: 30, quantidade: 4 }]);
    await ctl.comprar("wood", 5);
    expect(api.comprarFlechas).toHaveBeenLastCalledWith(ID, "wood", 5);
  });

  it("o tiro de mercado leva o valor do lote para o servidor", async () => {
    const api = {
      abrirSessao: vi.fn(async () => sessaoBase({ mercado: [{ flecha: "btc", valor: 20, quantidade: 2 }] })),
      registrarOperacaoEstudo: vi.fn(async () => ({
        id: "op-1", moedasPagas: null, sessao: sessaoBase({ mercado: [{ flecha: "btc", valor: 20, quantidade: 1 }] }),
      })),
    };
    const ctl = criarControladorSessao({ api });
    await ctl.abrir("vilarejo", {}, [{ flecha: "btc", valor: 20, quantidade: 2 }]);
    await ctl.registrarMercado({ direcao: "ALTA", simbolo: "BTCUSDT", tipo: "BINARIA", valor: 20 });
    expect(api.registrarOperacaoEstudo).toHaveBeenCalledWith(expect.objectContaining({ valor: 20, sessaoId: ID }));
    expect(ctl.estado().mercado).toEqual([{ flecha: "btc", valor: 20, quantidade: 1 }]);
  });
});

describe("flechas de mercado", () => {
  it("a aposta desconta a flecha no servidor e o HUD recebe a sessão nova", async () => {
    let atual = sessaoBase({ flechas: { wood: 0, btc: 2 } });
    const api = {
      abrirSessao: vi.fn(async () => atual),
      registrarOperacaoEstudo: vi.fn(async (dados) => {
        atual = { ...atual, flechas: { ...atual.flechas, btc: atual.flechas.btc - 1 } };
        return { id: "op-1", moedasPagas: null, sessao: atual, recebido: dados };
      }),
      sessaoAtual: vi.fn(async () => ({ ...atual, ganhos: 200 })),
    };
    const atualizacoes = [];
    const ctl = criarControladorSessao({ api, aoAtualizar: (s) => atualizacoes.push(s) });
    await ctl.abrir("vilarejo", {});

    const consumidas = [];
    const op = await ctl.registrarMercado({ direcao: "ALTA", simbolo: "BTCUSDT", tipo: "BINARIA" },
      (o) => consumidas.push(o.id));
    expect(op.recebido).toEqual({ direcao: "ALTA", simbolo: "BTCUSDT", tipo: "BINARIA", sessaoId: ID });
    expect(consumidas).toEqual(["op-1"]);                 // avisa antes de aplicar a sessão nova
    expect(ctl.estado().flechas.btc).toBe(1);

    // depois que o servidor paga a aposta, relê a sessão
    await ctl.atualizar();
    expect(ctl.estado().ganhosServidor).toBe(200);
    expect(atualizacoes.length).toBe(3);
  });

  it("releitura ignora outra sessão ou nenhuma; erro da aposta chega a quem chamou", async () => {
    const api = {
      abrirSessao: vi.fn(async () => sessaoBase()),
      registrarOperacaoEstudo: vi.fn(async () => { throw new ErroApi(422, "Sem flechas Bitcoin na aljava"); }),
      sessaoAtual: vi.fn(async () => null),
    };
    const ctl = criarControladorSessao({ api });
    await ctl.abrir("vilarejo", {});
    await expect(ctl.registrarMercado({ direcao: "QUEDA" })).rejects.toMatchObject({ status: 422 });
    expect(await ctl.atualizar()).toBeNull();
    api.sessaoAtual.mockResolvedValueOnce(sessaoBase({ id: "outra", ganhos: 999 }));
    await ctl.atualizar();
    expect(ctl.estado().ganhosServidor).toBe(0);
  });
});

describe("conflito com o pagamento de uma aposta", () => {
  it("409 de alteração simultânea repete o tiro; outro 409 chega como erro", async () => {
    const api = apiFalsa();
    const original = api.registrarTiro.getMockImplementation();
    api.registrarTiro
      .mockImplementationOnce(async () => { throw new ErroApi(409, "Alterado por outro pedido ao mesmo tempo, tente de novo"); })
      .mockImplementation(original);
    const erros = [];
    const ctl = criarControladorSessao({ api, esperar: async () => {}, aoErro: (e) => erros.push(e) });
    await ctl.abrir("vilarejo", { wood: 10 });
    const r = await ctl.registrarTiro("wood", ["red"], 4);
    expect(r.ganhosTiro).toBe(4);
    expect(erros).toEqual([]);

    api.registrarTiro.mockImplementationOnce(async () => { throw new ErroApi(409, "Sessao ja encerrada"); });
    expect(await ctl.registrarTiro("wood", [], 0)).toBeNull();
    expect(erros[0].status).toBe(409);
  });
});
