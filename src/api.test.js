import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroApi, api, esperarCredito } from "./api.js";

const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (corpo == null ? "" : typeof corpo === "string" ? corpo : JSON.stringify(corpo)),
});

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("manda o jogador no cabecalho e o corpo em JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(201, { id: "o1" }));
    vi.stubGlobal("fetch", fetch);

    const ordem = await api.apostar("ana", { simbolo: "BTCUSDT", tipo: "ALTA", valor: 10 });

    expect(ordem).toEqual({ id: "o1" });
    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe("/api/ordens");
    expect(opcoes.method).toBe("POST");
    expect(opcoes.headers).toEqual({ "X-Usuario-Id": "ana", "Content-Type": "application/json" });
    expect(JSON.parse(opcoes.body)).toEqual({ simbolo: "BTCUSDT", tipo: "ALTA", valor: 10 });
  });

  it("chamadas sem jogador nao mandam cabecalho", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, []));
    vi.stubGlobal("fetch", fetch);
    await api.cotacoes();
    await api.regras();
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/cotacoes", "/api/ordens/regras"]);
    expect(fetch.mock.calls[0][1].headers).toEqual({});
  });

  it("monta as rotas da carteira e das ordens", async () => {
    const fetch = vi.fn().mockResolvedValue(resposta(200, {}));
    vi.stubGlobal("fetch", fetch);
    await api.carteira("ana");
    await api.extrato("ana");
    await api.depositar("ana", 1000);
    await api.ordem("ana", "o1");
    await api.ordens("ana");
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([
      "/api/carteira",
      "/api/carteira/extrato",
      "/api/carteira/depositos",
      "/api/ordens/o1",
      "/api/ordens",
    ]);
  });

  it("transforma o ProblemDetail do backend em erro legivel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(422, { detail: "Saldo insuficiente" })));
    await expect(api.carteira("ana")).rejects.toMatchObject({ status: 422, message: "Saldo insuficiente" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(502, "<html>bad gateway</html>")));
    await expect(api.carteira("ana")).rejects.toMatchObject({ status: 502, message: "Erro 502" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    const erro = await api.carteira("ana").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.status).toBe(0);
  });

  it("espera o credito da rodada aparecer no extrato", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(200, [{ referencia: null }]))
      .mockResolvedValueOnce(resposta(200, [{ referencia: "o1" }]));
    vi.stubGlobal("fetch", fetch);
    expect(await esperarCredito("ana", "o1", { intervaloMs: 1 })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(200, [])));
    expect(await esperarCredito("ana", "o2", { tentativas: 2, intervaloMs: 1 })).toBe(false);
  });
});
